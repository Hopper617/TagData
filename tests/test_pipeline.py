import functools
from http.server import ThreadingHTTPServer
import http.client
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from annotations import normalize, export_review, write_json
from build_review import build
from gr00t_adapter import make_masks
from prepare_training import prepare
from serve import ReviewRequestHandler


def fixture():
    return normalize(
        dict(
            fps=30,
            subtasks=[dict(id=0, text="A"), dict(id=5, text="F")],
            episodes=[
                dict(
                    episode_index=0,
                    length=180,
                    segments=[
                        dict(id=0, start=0, end=60, reviewed=True),
                        dict(id=-1, start=60, end=70, reviewed=True),
                        dict(id=5, start=70, end=180, reviewed=True),
                    ],
                )
            ],
        )
    )


class Masks(unittest.TestCase):
    def test_task_deleted_unknown_expert_and_horizon_boundaries(self):
        ep = fixture()["episodes"][0]
        expert = np.ones(180, dtype=bool)
        expert[100] = False
        arrays, groups, intervals = make_masks(ep, expert)
        self.assertEqual(
            groups,
            [
                dict(id=0, start=0, end=60, text="A"),
                dict(id=5, start=70, end=180, text="F"),
            ],
        )
        self.assertEqual(
            np.flatnonzero(arrays["action_sample_start_mask"]).tolist(),
            list(range(31)) + [70] + list(range(101, 151)),
        )
        self.assertFalse(arrays["planner_sample_mask"][70:73].any())
        self.assertTrue(arrays["planner_sample_mask"][73])
        for start in np.flatnonzero(arrays["action_sample_start_mask"]):
            self.assertEqual(len(set(arrays["subtask_id"][start : start + 30])), 1)
            self.assertTrue(
                arrays["expert_retained_frame_mask"][start : start + 30].all()
            )

    def test_adjacent_same_class_fragments_merge_but_gaps_do_not(self):
        ep = fixture()["episodes"][0]
        ep["segments"] = [
            dict(id=5, start=0, end=1, text="F"),
            dict(id=5, start=1, end=60, text="F"),
            dict(id=5, start=60, end=70, text="F", deleted=True),
            dict(id=5, start=70, end=180, text="F"),
        ]
        arrays, groups, _ = make_masks(ep, np.ones(180, dtype=bool))
        self.assertEqual([(s["start"], s["end"]) for s in groups], [(0, 60), (70, 180)])
        self.assertFalse(arrays["action_sample_start_mask"][31:70].any())

    def test_touching_different_tasks_do_not_share_windows(self):
        ep = fixture()["episodes"][0]
        ep["segments"][1].update(id=5, text="F", excluded=False)
        arrays, _, _ = make_masks(ep, np.ones(180, dtype=bool))
        self.assertFalse(arrays["action_sample_start_mask"][31:60].any())
        self.assertTrue(arrays["action_sample_start_mask"][60])

    def test_exact_and_short_horizons(self):
        for length, expected in [(29, 0), (30, 1), (31, 2)]:
            ep = dict(
                length=length, segments=[dict(id=5, start=0, end=length, text="F")]
            )
            arrays, _, _ = make_masks(ep, np.ones(length, dtype=bool))
            self.assertEqual(arrays["action_sample_start_mask"].sum(), expected)

    def test_all_deleted(self):
        ep = fixture()["episodes"][0]
        for s in ep["segments"]:
            s["deleted"] = True
        arrays, groups, _ = make_masks(ep, np.ones(180, dtype=bool))
        self.assertFalse(arrays["action_sample_start_mask"].any())
        self.assertFalse(arrays["planner_sample_mask"].any())
        self.assertEqual(groups, [])


class Packaging(unittest.TestCase):
    def test_build_and_package_do_not_change_source(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            source = root / "dataset"
            (source / "meta").mkdir(parents=True)
            info = dict(
                fps=30,
                chunks_size=1000,
                data_path="data/episode_{episode_index:06d}.parquet",
            )
            write_json(source / "meta/info.json", info)
            (source / "meta/episodes.jsonl").write_text(
                json.dumps(dict(episode_index=0, length=180)) + "\n"
            )
            for view in ("base", "left_wrist", "right_wrist"):
                path = (
                    source
                    / f"videos/chunk-000/observation.images.{view}/episode_000000.mp4"
                )
                path.parent.mkdir(parents=True)
                path.write_bytes(b"fake video")
            (source / "data").mkdir()
            pq.write_table(
                pa.table(
                    {
                        "frame_index": list(range(180)),
                        "intervention.valid": [False] * 5 + [True] * 175,
                        "intervention.mode": [2] * 5 + [0] * 5 + [2] * 50 + [3] * 120,
                    }
                ),
                source / "data/episode_000000.parquet",
            )
            review = export_review(fixture())
            write_json(root / "review.json", review)
            write_json(
                root / "map.json", dict(subtasks=review["training_subtask_definitions"])
            )
            before = {str(p): p.read_bytes() for p in source.rglob("*") if p.is_file()}
            build(source, root / "map.json", root / "report", root / "review.json")
            built = json.loads((root / "report/project.json").read_text())
            self.assertTrue(built["episodes"][0]["segments"][0]["reviewed"])
            self.assertEqual(built["takeovers"]["0"], [
                dict(start=10, end=60, mode="free"),
                dict(start=60, end=180, mode="grasp"),
            ])
            self.assertNotIn(str(source), json.dumps(built))
            manifest = prepare(root / "review.json", source, root / "package")
            self.assertEqual(manifest["totals"]["retained_frames"], 170)
            self.assertEqual(manifest["totals"]["action_sample_starts"], 21 + 81)
            with np.load(root / "package/frame_masks/episode_000000.npz") as masks:
                self.assertFalse(masks["action_sample_start_mask"][:10].any())
            self.assertEqual(
                before,
                {str(p): p.read_bytes() for p in source.rglob("*") if p.is_file()},
            )
            review["episodes"][0]["segments"][0]["reviewed"] = False
            write_json(root / "pending.json", review)
            with self.assertRaisesRegex(ValueError, "human review"):
                prepare(root / "pending.json", source, root / "rejected")
            self.assertFalse((root / "rejected").exists())

            effective = built["takeovers"]["0"]
            recorded = [dict(effective[0], start=5), effective[1]]
            edits = [dict(source_start=5, source_end=60, mode="free", start=10, end=60)]
            write_json(
                source / "meta/intervention_review.json",
                dict(schema_version=1, fps=30, episodes=[
                    dict(episode_index=0, length=180, recorded_takeovers=recorded,
                         effective_takeovers=effective, takeover_edits=edits)
                ]),
            )
            build(source, root / "map.json", root / "rebuilt")
            rebuilt = json.loads((root / "rebuilt/project.json").read_text())
            self.assertEqual(rebuilt["takeovers"]["0"], recorded)
            self.assertEqual(rebuilt["episodes"][0]["takeover_edits"], edits)

    def test_roundtrip_and_mapping_validation(self):
        data = fixture()
        data["episodes"][0]["segments"][1].update(deleted=True, excluded=True)
        self.assertEqual(
            normalize(export_review(data))["episodes"][0]["segments"],
            data["episodes"][0]["segments"],
        )
        data["episodes"][0]["segments"][0]["text"] = "Changed prompt"
        with self.assertRaises(ValueError):
            normalize(data)


class HTTP(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.report = self.root / "report"
        self.report.mkdir()
        self.videos = self.root / "videos"
        self.videos.mkdir()
        (self.report / "index.html").write_text("hello")
        (self.videos / "video.mp4").write_bytes(bytes(range(256)) * 4)
        (self.report / "clip.mp4").symlink_to(self.videos / "video.mp4")
        (self.root / "private.txt").write_text("secret")
        (self.report / "leak.txt").symlink_to(self.root / "private.txt")

        class Quiet(ReviewRequestHandler):
            def log_message(self, *args):
                pass

        handler = functools.partial(
            Quiet, directory=self.report, authorized_videos=self.videos
        )
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path, headers=None, method="GET"):
        conn = http.client.HTTPConnection(
            "127.0.0.1", self.server.server_port, timeout=3
        )
        conn.request(method, path, headers=headers or {})
        response = conn.getresponse()
        result = (response.status, dict(response.getheaders()), response.read())
        conn.close()
        return result

    def test_full_head_and_seekable_mp4(self):
        self.assertEqual(self.request("/")[2], b"hello")
        for value, expected in [
            ("bytes=10-19", bytes(range(10, 20))),
            ("bytes=-5", bytes(range(251, 256))),
            ("bytes=1020-", bytes(range(252, 256))),
        ]:
            status, headers, body = self.request("/clip.mp4", {"Range": value})
            self.assertEqual(status, 206)
            self.assertEqual(headers["Content-Type"], "video/mp4")
            self.assertEqual(body, expected)
        status, headers, body = self.request(
            "/clip.mp4", {"Range": "bytes=0-9"}, "HEAD"
        )
        self.assertEqual(status, 206)
        self.assertEqual(headers["Content-Length"], "10")
        self.assertEqual(body, b"")

    def test_unsatisfiable_range(self):
        for value in (
            "bytes=1024-",
            "bytes=7-2",
            "bytes=0-1,3-4",
            "bytes=-0",
            "nonsense",
        ):
            status, headers, body = self.request("/clip.mp4", {"Range": value})
            self.assertEqual(status, 416)
            self.assertEqual(headers["Content-Range"], "bytes */1024")
            self.assertEqual(body, b"")

    def test_traversal_and_unauthorized_symlinks(self):
        for path in (
            "/../private.txt",
            "/%2e%2e/private.txt",
            "/leak.txt",
            "/videos/",
            "/%252e%252e/private.txt",
        ):
            self.assertIn(self.request(path)[0], (400, 403, 404))
        self.assertEqual(self.request("/clip.mp4")[0], 200)


if __name__ == "__main__":
    unittest.main()
