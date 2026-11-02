// Source frame coordinates are immutable; every edit keeps full source coverage.
export const clone = (value) => JSON.parse(JSON.stringify(value));
const integer = (n) => Number.isSafeInteger(n);
function require(condition, message) {
  if (!condition) throw new Error(message);
}

export function normalize(input) {
  const data = clone(input);
  require(Number.isFinite(data.fps) && data.fps > 0, "Invalid fps");
  require(data.schema_version == null ||
    [2, 3].includes(data.schema_version), "Unsupported schema version");
  const definitions =
    data.training_subtask_definitions ||
    data.subtasks?.filter((t) => t.id >= 0);
  require(Array.isArray(definitions) &&
    definitions.length > 0, "Missing global task definitions");
  const ids = new Set();
  definitions.forEach((t) => {
    require(integer(t.id) &&
      t.id >= 0 &&
      !ids.has(t.id) &&
      typeof t.text === "string" &&
      t.text.trim(), "Invalid global task definition");
    ids.add(t.id);
  });
  data.training_subtask_definitions = definitions;
  data.annotation_labels = [
    ...clone(definitions),
    { id: -1, text: "Unclear purpose / waiting / transition" },
  ];
  require(Array.isArray(data.episodes) &&
    data.episodes.length > 0, "No episodes");
  const episodes = new Set();
  data.episodes.forEach((ep) => {
    require(integer(ep.episode_index) &&
      ep.episode_index >= 0 &&
      !episodes.has(ep.episode_index), "Invalid/duplicate episode ID");
    episodes.add(ep.episode_index);
    require(integer(ep.length) && ep.length > 0, "Invalid episode length");
    require(Array.isArray(ep.segments), "Missing segments");
    require(ep.deleted_intervals == null ||
      Array.isArray(ep.deleted_intervals), "Invalid deletion records");
    const all = [
      ...ep.segments,
      ...(ep.deleted_intervals || []).map((s) => ({
        ...s,
        deleted: true,
        excluded: true,
      })),
    ];
    delete ep.deleted_intervals;
    ep.segments = all.sort((a, b) => a.start - b.start);
    let cursor = 0;
    ep.segments.forEach((s) => {
      require(integer(s.start) &&
        integer(s.end) &&
        s.start === cursor &&
        s.end > s.start &&
        s.end <=
          ep.length, "Intervals must cover the original episode without gaps/overlaps");
      require(integer(s.id) &&
        (s.id === -1 || ids.has(s.id)), "Unknown task ID");
      const canonical =
        definitions.find((t) => t.id === s.id)?.text ||
        "Unclear purpose / waiting / transition";
      require(s.id === -1 ||
        s.text == null ||
        s.text === canonical, "Task text differs from global mapping");
      s.text = canonical;
      s.deleted = s.deleted === true;
      s.excluded = s.deleted || s.id === -1 || s.excluded === true;
      s.reviewed = s.reviewed === true;
      cursor = s.end;
    });
    require(cursor === ep.length, "Intervals do not cover the episode");
  });
  data.schema_version = 3;
  return data;
}

export function compatible(a, b) {
  const signature = (d) =>
    JSON.stringify({
      fps: d.fps,
      tasks: d.training_subtask_definitions
        .map((t) => ({ id: t.id, text: t.text }))
        .sort((x, y) => x.id - y.id),
      episodes: d.episodes
        .map((e) => [e.episode_index, e.length])
        .sort((x, y) => x[0] - y[0]),
    });
  require(signature(a) === signature(b) &&
    (!a.project_id ||
      !b.project_id ||
      a.project_id ===
        b.project_id), "Import belongs to a different dataset or task mapping");
}

export function reviewedEpisode(ep) {
  return ep.segments.every((s) => s.deleted || s.reviewed);
}

export function editSegment(data, ep, index, changes) {
  const s = ep.segments[index],
    previous = ep.segments[index - 1],
    next = ep.segments[index + 1];
  require(s && !s.deleted, "Restore the deleted interval before editing");
  const { start, end, id } = changes;
  require(integer(start) &&
    integer(end) &&
    start < end &&
    start >= 0 &&
    end <= ep.length, "Invalid frame boundaries");
  require((previous ? start > previous.start : start === 0) &&
    (next
      ? end < next.end
      : end ===
        ep.length), "A neighboring interval must retain at least one frame");
  require(!previous?.deleted ||
    start === s.start, "Cannot move a deleted boundary");
  require(!next?.deleted || end === s.end, "Cannot move a deleted boundary");
  require(id === -1 ||
    data.training_subtask_definitions.some(
      (t) => t.id === id,
    ), "Unknown task ID");
  if (previous && start !== s.start) {
    previous.end = start;
    previous.reviewed = false;
  }
  if (next && end !== s.end) {
    next.start = end;
    next.reviewed = false;
  }
  Object.assign(s, changes, {
    text: data.annotation_labels.find((t) => t.id === id).text,
    excluded: id === -1 || changes.excluded === true,
  });
}

export function splitSegment(ep, index, frame) {
  const s = ep.segments[index];
  require(s &&
    !s.deleted &&
    integer(frame) &&
    s.start < frame &&
    frame < s.end, "Split must be inside a retained interval");
  const right = { ...clone(s), start: frame, reviewed: false };
  s.end = frame;
  s.reviewed = false;
  ep.segments.splice(index + 1, 0, right);
}

export function toggleDeletion(ep, index) {
  const s = ep.segments[index];
  if (s.deleted) {
    s.deleted = false;
    s.excluded = s.id === -1 || !!s.excluded_before_delete;
    s.reviewed = false;
    delete s.excluded_before_delete;
    delete s.deleted_at;
  } else {
    s.excluded_before_delete = s.excluded;
    s.deleted = true;
    s.excluded = true;
    s.deleted_at = new Date().toISOString();
    s.reviewed = true;
  }
}

export function exportReview(data, onlyReviewed = false) {
  const output = clone(data);
  output.schema_version = 3;
  output.exported_at = new Date().toISOString();
  output.status = data.episodes.every(reviewedEpisode)
    ? "user_reviewed"
    : "draft_pending_review";
  output.not_training_ready = true;
  output.training_requirements = [
    "Ignore deleted/excluded/unknown intervals.",
    "Use explicit sparse bounds and expert-only complete action windows; see docs/gr00t.md.",
  ];
  output.episodes = data.episodes
    .filter((ep) => !onlyReviewed || reviewedEpisode(ep))
    .map((ep) => ({
      ...clone(ep),
      annotation_status: reviewedEpisode(ep)
        ? "user_reviewed"
        : "pending_review",
      segments: clone(ep.segments.filter((s) => !s.deleted)),
      deleted_intervals: clone(ep.segments.filter((s) => s.deleted)),
      retained_frames: ep.segments
        .filter((s) => !s.deleted)
        .reduce((n, s) => n + s.end - s.start, 0),
    }));
  return output;
}
