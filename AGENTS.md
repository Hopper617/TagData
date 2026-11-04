# TagData agent instructions

TagData uses an agent to draft frame-level subtasks for robot demonstrations. A human reviews and confirms the draft in the existing browser workbench.

1. Read [Agent workflow and classification rules](docs/agent-workflow.md) and [Review JSON v3](docs/format.md).
2. Confirm the dataset root, episode scope and project-wide subtask map. If no map exists, propose observable categories and boundary rules for the task owner to approve before labeling the batch. The [CleanTable map](docs/subtask_map.example.json) is an example.
3. Inspect the recording in three synchronized camera views. Review the full episode and recheck boundaries at finer resolution. DINO results may serve as separate evidence.
4. Write a separate candidate JSON under `reports/`. Use source episode IDs, FPS and integer half-open frame ranges. Cover every frame. Use `-1` for unclear, waiting or transition intervals. Keep `reviewed: false` and `deleted_intervals: []`.
5. Run `tools/build_review.py` against the source dataset and approved map. Hand off the local reviewer URL, candidate path and uncertain boundaries. The reviewer owns confirmation, deletion and exclusion decisions.
6. Validate the full JSON exported by the human before preparing any training package. Keep original recordings and metadata intact. Keep real recordings, evidence and reports outside version control.

For repository changes, run `npm test` and `python3 -m unittest discover -s tests -p 'test_*.py' -v`.
