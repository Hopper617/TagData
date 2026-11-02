import test from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  compatible,
  editSegment,
  splitSegment,
  toggleDeletion,
  exportReview,
  reviewedEpisode,
} from "../web/model.js";

const fixture = () =>
  normalize({
    schema_version: 3,
    project_id: "test",
    fps: 30,
    subtasks: [
      { id: 0, text: "Task A" },
      { id: 3, text: "Task D" },
    ],
    episodes: [
      {
        episode_index: 7,
        length: 120,
        segments: [
          { id: 0, start: 0, end: 40, reviewed: true },
          { id: -1, start: 40, end: 60, reviewed: true },
          { id: 3, start: 60, end: 120, reviewed: true },
        ],
      },
    ],
  });
function setup() {
  const data = fixture();
  return [data, data.episodes[0]];
}
test("global IDs survive an episode containing only a subset", () => {
  const data = fixture();
  assert.deepEqual(
    data.training_subtask_definitions.map((t) => t.id),
    [0, 3],
  );
});
test("unknown is annotation-only and excluded", () => {
  const [, ep] = setup();
  assert.equal(ep.segments[1].excluded, true);
});
for (const index of [0, 1, 2])
  test(`delete and restore interval ${index} preserves all coordinates`, () => {
    const [data, ep] = setup(),
      bounds = ep.segments.map((s) => [s.start, s.end]);
    toggleDeletion(ep, index);
    assert.deepEqual(
      ep.segments.map((s) => [s.start, s.end]),
      bounds,
    );
    const output = exportReview(data);
    assert.equal(output.episodes[0].segments.length, 2);
    assert.equal(output.episodes[0].deleted_intervals.length, 1);
    const restored = normalize(output);
    assert.deepEqual(restored.episodes[0].segments, ep.segments);
    toggleDeletion(ep, index);
    assert.equal(ep.segments[index].reviewed, false);
    assert.equal(ep.segments[index].excluded, index === 1);
  });
test("all deleted episodes remain exportable and recoverable", () => {
  const [data, ep] = setup();
  ep.segments.forEach((_, i) => toggleDeletion(ep, i));
  assert.equal(reviewedEpisode(ep), true);
  const exported = exportReview(data, true);
  assert.equal(exported.episodes[0].segments.length, 0);
  assert.equal(exported.episodes[0].deleted_intervals.length, 3);
  const reloaded = normalize(exported);
  toggleDeletion(reloaded.episodes[0], 1);
  assert.equal(reloaded.episodes[0].segments[1].deleted, false);
});
test("single interval episode supports deletion and restoration", () => {
  const data = normalize({
    fps: 30,
    subtasks: [{ id: 5, text: "D" }],
    episodes: [
      { episode_index: 0, length: 1, segments: [{ id: 5, start: 0, end: 1 }] },
    ],
  });
  const ep = data.episodes[0];
  toggleDeletion(ep, 0);
  assert.equal(exportReview(data).episodes[0].retained_frames, 0);
  toggleDeletion(ep, 0);
  assert.equal(ep.segments[0].end, 1);
});
test("retained neighbors cannot move across deleted interval", () => {
  const [data, ep] = setup();
  toggleDeletion(ep, 1);
  assert.throws(
    () => editSegment(data, ep, 0, { id: 0, start: 0, end: 50 }),
    /deleted boundary/,
  );
  assert.throws(
    () => editSegment(data, ep, 2, { id: 3, start: 50, end: 120 }),
    /deleted boundary/,
  );
  assert.throws(() => splitSegment(ep, 1, 50), /retained interval/);
});
test("boundary edits update neighbors and clear their confirmation", () => {
  const [data, ep] = setup();
  editSegment(data, ep, 1, { id: -1, start: 35, end: 65, reviewed: true });
  assert.equal(ep.segments[0].end, 35);
  assert.equal(ep.segments[2].start, 65);
  assert.equal(ep.segments[0].reviewed, false);
  assert.equal(ep.segments[2].reviewed, false);
});
test("one-frame neighbor preserved; zero-frame neighbor rejected without mutation", () => {
  const [data, ep] = setup();
  const before = JSON.stringify(ep);
  assert.throws(() => editSegment(data, ep, 1, { id: -1, start: 0, end: 65 }));
  assert.equal(JSON.stringify(ep), before);
  editSegment(data, ep, 1, { id: -1, start: 1, end: 119 });
  assert.equal(ep.segments[0].end, 1);
  assert.equal(ep.segments[2].start, 119);
});
test("split invalidates both confirmations and preserves evidence/notes", () => {
  const [, ep] = setup();
  ep.segments[2].review_note = "check wrist";
  ep.segments[2].evidence = ["sheet.jpg"];
  splitSegment(ep, 2, 90);
  assert.equal(ep.segments.length, 4);
  assert.deepEqual(
    ep.segments.slice(2).map((s) => [s.start, s.end, s.reviewed]),
    [
      [60, 90, false],
      [90, 120, false],
    ],
  );
  assert.equal(ep.segments[3].review_note, "check wrist");
  assert.throws(() => splitSegment(ep, 2, 60));
});
test("only fully reviewed episodes are exported", () => {
  const [data, ep] = setup();
  ep.segments[0].reviewed = false;
  assert.equal(exportReview(data, true).episodes.length, 0);
  toggleDeletion(ep, 0);
  assert.equal(exportReview(data, true).episodes.length, 1);
});
test("round trip preserves confirmations, exclusions, deletion and provenance", () => {
  const [data, ep] = setup();
  ep.segments[0].review_note = "checked all views";
  ep.segments[0].evidence = ["a.jpg"];
  ep.segments[2].excluded = true;
  toggleDeletion(ep, 1);
  const restored = normalize(exportReview(data));
  assert.deepEqual(restored.episodes[0].segments, ep.segments);
  assert.equal(exportReview(restored).not_training_ready, true);
});
test("imports must retain dataset identity, source lengths, task IDs and prompts", () => {
  const data = fixture();
  for (const mutate of [
    (d) => (d.project_id = "other"),
    (d) => (d.fps = 10),
    (d) => (d.episodes[0].length = 121),
    (d) => (d.training_subtask_definitions[0].text = "Other"),
  ]) {
    const incoming = structuredClone(data);
    mutate(incoming);
    assert.throws(() => compatible(data, incoming));
  }
});
for (const [name, mutate] of Object.entries({
  gap: (d) => (d.episodes[0].segments[1].start = 41),
  overlap: (d) => (d.episodes[0].segments[1].start = 39),
  fraction: (d) => (d.episodes[0].segments[1].end = 60.5),
  task: (d) => (d.episodes[0].segments[0].id = 2),
  prompt: (d) => (d.episodes[0].segments[0].text = "Wrong"),
  duplicate: (d) => d.episodes.push(structuredClone(d.episodes[0])),
  zeroFPS: (d) => (d.fps = 0),
  booleanID: (d) => (d.episodes[0].segments[0].id = true),
}))
  test(`reject ${name}`, () => {
    const d = fixture();
    mutate(d);
    assert.throws(() => normalize(d));
  });
