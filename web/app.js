import {
  normalize,
  compatible,
  takeoverRanges,
  editTakeover,
  editSegment,
  splitSegment,
  addSegmentAfter,
  toggleDeletion,
  exportReview,
  reviewedEpisode,
} from "./model.js";

const $ = (id) => document.getElementById(id);
const EPISODES_PER_PAGE = 10;
const copy = {
  en: {
    title: "Subtask Annotation",
    tagline: "Video → Segments → Human review",
    synthetic:
      "SYNTHETIC DEMO · Illustrative animation, not robot recordings. Changes stay in your browser; export JSON to keep a portable copy.",
    episodes: "Episodes",
    previousPage: "Previous",
    nextPage: "Next",
    episodePages: "Episode pages",
    localHint:
      "Your videos stay local. Browser autosave is a draft — download JSON to back up or move your review.",
    import: "Import review JSON",
    export: "Export full review",
    exportReviewed: "Export confirmed episodes",
    workspace: "Human review workspace",
    timeline: "Original source timeline",
    takeoverTrack: "DAgger takeover signals",
    takeoverFree: "FREE takeover",
    takeoverGrasp: "GRASP takeover",
    takeoverNone: "No takeover marked at the current frame",
    takeoverSeek: "Select and jump to start",
    takeoverHint: "Click a range to adjust its timing",
    takeoverEdit: "Adjust takeover timing",
    takeoverOriginal: "Recorded range",
    takeoverBounds: "Available frame range",
    takeoverUseStart: "Use current frame",
    takeoverUseEnd: "Include current frame",
    takeoverSave: "Save takeover timing",
    takeoverSeekEnd: "Go to last frame",
    takeoverReset: "Restore recorded timing",
    takeoverClose: "Close",
    takeoverInvalid: "Enter whole frames within the available range, with the start before the end.",
    showDeleted: "Show deleted",
    segments: "Segments",
    range: "Time · seconds",
    task: "Subtask",
    reviewed: "Checked",
    edit: "Edit interval",
    start: "Start frame (inclusive)",
    end: "End frame (exclusive)",
    note: "Review note",
    exclude: "Exclude from training",
    confirmed: "I have checked this interval",
    save: "Save changes",
    split: "Split at playhead",
    addSubtask: "+ Add subtask after selection",
    addSubtaskHint: "Choose the task and the reserved frame range. Only this range will be relabeled; the remaining parts of the following interval will be kept.",
    chooseTask: "Choose a subtask",
    availableRange: "Available range in the following interval",
    noFollowingInterval: "There is no retained interval after this selection. Split an interval first to reserve space, or restore the following deleted interval.",
    invalidNewRange: "Enter whole-number frames within the available range, with the start before the end.",
    add: "Add subtask",
    cancel: "Cancel",
    delete: "Delete interval",
    restore: "Restore interval",
    deleteHint:
      "Deletion preserves source frames and never extends a neighboring task. Restore from the timeline or “Show deleted”.",
    evidence: "Annotation evidence",
    playSegment: "▶ Play interval",
    seekStart: "↤ Go to start",
    frameHint: "Integer frames · [start, end)",
    conflictTitle: "Choose review source",
    conflictText:
      "A local draft already exists. Keep that draft, or replace it with the imported review? No changes are made until you choose.",
    keepLocal: "Keep local draft",
    useImport: "Use imported review",
    unknown: "Unclear / waiting / transition",
    base: "Head camera",
    left_wrist: "Left wrist",
    right_wrist: "Right wrist",
    done: "Confirmed",
    pending: "Needs review",
    deleted: "Deleted",
    excluded: "Excluded",
    saved: "Saved in this browser",
    restoredDraft: "Restored browser draft",
    imported: "Imported review; video paths kept from this project",
    noReady: "No fully confirmed episodes to export",
    videoError:
      "Video could not load. Use the Python HTTP server (not file://), check the video root and use browser-compatible H.264 MP4.",
    frame: "frame",
    retained: "retained",
    checked: "checked",
    noEvidence:
      "No evidence attached. Verify all camera views and inspect both boundaries.",
    reason: "Reason",
    uncertainty: "Boundary uncertainty (frames)",
    allDeleted: "All intervals are deleted. Click the timeline to restore.",
    source: "Source",
    storageError: "Autosave unavailable. Export JSON before leaving.",
    error: "Error",
    unreview: "This interval needs review",
    confirm: "Confirm this interval",
    exported: "Export downloaded",
  },
  zh: {
    title: "子任务标注工作台",
    tagline: "视频回看 → 片段划分 → 人工审核",
    synthetic:
      "合成演示 · 动画示意，非机器人真实录像。修改只保存在当前浏览器，请导出 JSON 备份。",
    episodes: "Episode 列表",
    previousPage: "上一页",
    nextPage: "下一页",
    episodePages: "Episode 分页",
    localHint:
      "录像留在本地。浏览器自动保存的是草稿；下载 JSON 可备份审核结果，或换电脑继续。",
    import: "导入审核 JSON",
    export: "导出完整审核",
    exportReviewed: "导出已确认 Episode",
    workspace: "人工审核工作台",
    timeline: "原始帧时间轴",
    takeoverTrack: "DAgger 接管信号",
    takeoverFree: "FREE 接管",
    takeoverGrasp: "GRASP 接管",
    takeoverNone: "当前帧无接管标记",
    takeoverSeek: "选中并跳到起始帧",
    takeoverHint: "点击色块调整时间",
    takeoverEdit: "调整接管时间",
    takeoverOriginal: "录制区间",
    takeoverBounds: "可调整帧范围",
    takeoverUseStart: "用当前帧作起点",
    takeoverUseEnd: "用当前帧作末帧",
    takeoverSave: "保存接管调整",
    takeoverSeekEnd: "跳到末帧",
    takeoverReset: "恢复录制时间",
    takeoverClose: "关闭",
    takeoverInvalid: "请输入可调整范围内的整数帧，起始帧要小于结束帧。",
    showDeleted: "显示已删除片段",
    segments: "子任务片段",
    range: "时间 · 秒",
    task: "子任务",
    reviewed: "已核对",
    edit: "编辑片段",
    start: "起始帧（包含）",
    end: "结束帧（不包含）",
    note: "审核备注",
    exclude: "排除训练",
    confirmed: "我已核对此片段",
    save: "保存修改",
    split: "在播放位置切分",
    addSubtask: "+ 在后方加入子任务",
    addSubtaskHint: "选择子任务并填写预留区间的起止帧。该范围将改为新子任务，下一片段的其余部分保留。",
    chooseTask: "请选择子任务",
    availableRange: "下一片段中可划分的范围",
    noFollowingInterval: "当前片段后没有可用区间。请先切分片段预留空间；如果下一片段已删除，请先恢复。",
    invalidNewRange: "请在可用范围内填写整数帧，起始帧必须小于结束帧。",
    add: "加入子任务",
    cancel: "取消",
    delete: "删除此片段",
    restore: "恢复此片段",
    deleteHint:
      "删除保留原始帧号，不会扩展相邻任务。点击时间轴或勾选“显示已删除片段”可恢复。",
    evidence: "标注依据",
    playSegment: "▶ 播放此片段",
    seekStart: "↤ 跳到片段起点",
    frameHint: "整数帧 · [起点, 终点)",
    conflictTitle: "选择审核来源",
    conflictText:
      "当前已有浏览器草稿。继续使用草稿，还是用导入文件替换？选择之前不会修改数据。",
    keepLocal: "保留本地草稿",
    useImport: "使用导入结果",
    unknown: "目的不明确／等待／过渡",
    base: "头部相机",
    left_wrist: "左腕相机",
    right_wrist: "右腕相机",
    done: "已确认",
    pending: "待审核",
    deleted: "已删除",
    excluded: "已排除",
    saved: "已保存在当前浏览器",
    restoredDraft: "已恢复浏览器草稿",
    imported: "已导入审核结果，视频地址沿用当前项目",
    noReady: "还没有完成全部确认的 Episode",
    videoError:
      "视频加载失败。请使用 Python HTTP 服务（不要用 file://），检查视频目录，并使用浏览器支持的 H.264 MP4。",
    frame: "帧",
    retained: "保留",
    checked: "已确认",
    noEvidence: "尚未附加标注依据，请查看各路相机并核对两端边界。",
    reason: "理由",
    uncertainty: "边界不确定范围（帧）",
    allDeleted: "所有片段已删除，点击时间轴可恢复。",
    source: "来源",
    storageError: "无法自动保存，离开前请导出 JSON。",
    error: "错误",
    unreview: "取消此片段的确认",
    confirm: "确认此片段",
    exported: "已下载导出文件",
  },
};
const colors = [
  "#c6ed9b",
  "#f0cb8b",
  "#a9c8f5",
  "#d4b4ef",
  "#f1aa95",
  "#86d6c3",
];
let language = navigator.language.startsWith("zh") ? "zh" : "en";
try {
  language = localStorage.getItem("subtask-language") || language;
} catch {}
if (!copy[language]) language = "en";
const t = (key) => copy[language][key] || key;
let data,
  original,
  takeoverTracks,
  activeTakeovers = [],
  takeoverIndex = -1,
  episodeIndex = 0,
  episodePage = 0,
  segmentIndex = 0,
  camera = "base",
  clipEnd = null,
  pendingSeek = null,
  pendingImport,
  storageKey;
const ep = () => data.episodes[episodeIndex];
const seg = () => ep().segments[segmentIndex];
const fmt = (frame) => (frame / data.fps).toFixed(2);
const recordedTakeovers = () => takeoverTracks[ep().episode_index] ?? [];
const playheadFrame = () =>
  Math.min(ep().length - 1, Math.floor($("video").currentTime * data.fps + 1e-6));
const takeoverLabel = ({ mode, start, end }) =>
  `${t(mode === "free" ? "takeoverFree" : "takeoverGrasp")} · ${t("frame")} [${start}, ${end}) · ${fmt(start)}–${fmt(end)}s`;
const taskName = (s) =>
  s.id === -1
    ? t("unknown")
    : data.training_subtask_definitions.find((v) => v.id === s.id)?.[
        language === "zh" ? "zh" : "text"
      ] || s.text;
const color = (s) =>
  s.id < 0
    ? "#89928b"
    : colors[
        data.training_subtask_definitions.findIndex((v) => v.id === s.id) %
          colors.length
      ];
function message(value, error = false) {
  $("status").textContent = value;
  $("status").className = error ? "error" : "";
  $("status").style.display = "block";
  clearTimeout(message.timer);
  message.timer = setTimeout(() => ($("status").style.display = "none"), 6500);
}
function guard(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      message(`${t("error")}: ${error.message}`, true);
    }
  };
}
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(exportReview(data)));
    message(t("saved"));
  } catch {
    message(t("storageError"), true);
  }
}
function localDraft() {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
function safeURL(path) {
  const url = new URL(path, location.href);
  if (
    url.origin !== location.origin ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw Error("Only same-origin media paths are allowed");
  return url.href;
}

function renderEpisodes() {
  const pageCount = Math.ceil(data.episodes.length / EPISODES_PER_PAGE);
  const start = episodePage * EPISODES_PER_PAGE;
  $("episode-pagination").hidden = pageCount <= 1;
  $("episode-pagination").setAttribute("aria-label", t("episodePages"));
  $("episode-page").textContent = `${episodePage + 1} / ${pageCount}`;
  $("episode-prev").disabled = episodePage === 0;
  $("episode-next").disabled = episodePage >= pageCount - 1;
  $("episodes").replaceChildren();
  data.episodes.slice(start, start + EPISODES_PER_PAGE).forEach((e, offset) => {
    const i = start + offset;
    const button = document.createElement("button");
    button.className = i === episodeIndex ? "active" : "";
    const title = document.createElement("strong");
    title.textContent = `Episode ${e.episode_index}`;
    const detail = document.createElement("small");
    const retained = e.segments.filter((s) => !s.deleted);
    detail.textContent = `${(e.length / data.fps).toFixed(1)}s · ${retained.filter((s) => s.reviewed).length}/${retained.length} ${t("checked")}`;
    button.append(title, detail);
    button.onclick = () => {
      episodeIndex = i;
      takeoverIndex = -1;
      segmentIndex = Math.max(
        0,
        e.segments.findIndex((s) => !s.deleted),
      );
      clipEnd = null;
      render();
      loadVideo(0);
    };
    button.setAttribute("aria-current", i === episodeIndex ? "true" : "false");
    $("episodes").append(button);
  });
}

function changeEpisodePage(offset) {
  const pageCount = Math.ceil(data.episodes.length / EPISODES_PER_PAGE);
  const nextPage = episodePage + offset;
  if (nextPage < 0 || nextPage >= pageCount) return;
  episodePage = nextPage;
  renderEpisodes();
}

$("episode-prev").onclick = () => changeEpisodePage(-1);
$("episode-next").onclick = () => changeEpisodePage(1);

function renderTakeovers() {
  activeTakeovers = takeoverRanges(ep(), recordedTakeovers());
  $("takeovers").hidden = activeTakeovers.length === 0;
  $("timeline").className = activeTakeovers.length ? "timeline takeover-aligned" : "timeline";
  const markers = $("takeover-markers");
  markers.replaceChildren();
  activeTakeovers.forEach((range, index) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `takeover-${range.mode}`;
    marker.style.left = `${(100 * range.start) / ep().length}%`;
    marker.style.width = `${(100 * (range.end - range.start)) / ep().length}%`;
    marker.title = `${takeoverLabel(range)} · ${t("takeoverSeek")}`;
    marker.setAttribute("aria-label", marker.title);
    marker.onclick = () => {
      if (takeoverIndex !== index) {
        takeoverIndex = index;
        fillTakeoverEditor(range);
        renderTakeoverEditor();
      }
      seekTakeoverFrame(range.start);
    };
    markers.append(marker);
  });
  renderTakeoverEditor();
}

function renderTakeoverEditor() {
  const range = activeTakeovers[takeoverIndex];
  $("takeover-form").hidden = !range;
  Array.from($("takeover-markers").children).forEach((marker, index) =>
    marker.setAttribute("aria-pressed", String(index === takeoverIndex)),
  );
  if (!range) return;
  const recorded = recordedTakeovers()[takeoverIndex];
  const min = activeTakeovers[takeoverIndex - 1]?.end ?? 0;
  const max = activeTakeovers[takeoverIndex + 1]?.start ?? ep().length;
  $("takeover-start").min = min;
  $("takeover-start").max = max - 1;
  $("takeover-end").min = min + 1;
  $("takeover-end").max = max;
  $("takeover-original").textContent = `${t("takeoverOriginal")} · ${takeoverLabel(recorded)}`;
  $("takeover-bounds").textContent = `${t("takeoverBounds")} · [${min}, ${max})`;
  $("takeover-reset").disabled = range.start === recorded.start && range.end === recorded.end;
}

function fillTakeoverEditor({ start, end }) {
  $("takeover-start").value = start;
  $("takeover-end").value = end;
  $("takeover-error").hidden = true;
}

function commitTakeover(start, end) {
  try {
    editTakeover(ep(), recordedTakeovers(), takeoverIndex, start, end);
  } catch {
    $("takeover-error").textContent = t("takeoverInvalid");
    $("takeover-error").hidden = false;
    return;
  }
  fillTakeoverEditor({ start, end });
  save();
  renderTakeovers();
  updateTime();
}

$("takeover-form").onsubmit = (event) => {
  event.preventDefault();
  commitTakeover($("takeover-start").valueAsNumber, $("takeover-end").valueAsNumber);
};
$("takeover-form").oninput = () => { $("takeover-error").hidden = true; };
$("takeover-use-start").onclick = () => {
  $("video").pause();
  $("takeover-start").value = playheadFrame();
  $("takeover-error").hidden = true;
};
$("takeover-use-end").onclick = () => {
  $("video").pause();
  $("takeover-end").value = playheadFrame() + 1;
  $("takeover-error").hidden = true;
};
$("takeover-seek-end").onclick = () => seekTakeoverFrame(activeTakeovers[takeoverIndex].end - 1);
$("takeover-reset").onclick = () => {
  const { start, end } = recordedTakeovers()[takeoverIndex];
  commitTakeover(start, end);
};
$("takeover-close").onclick = () => {
  const marker = $("takeover-markers").children[takeoverIndex];
  takeoverIndex = -1;
  renderTakeoverEditor();
  marker?.focus();
};

function render() {
  document.documentElement.lang = language;
  document
    .querySelectorAll("[data-i18n]")
    .forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $("language").textContent = language === "en" ? "中文" : "English";
  $("synthetic").hidden = !data.synthetic;
  const active = data.episodes.flatMap((e) =>
    e.segments.filter((s) => !s.deleted),
  );
  const deleted = data.episodes.reduce(
    (n, e) => n + e.segments.filter((s) => s.deleted).length,
    0,
  );
  $("episode-count").textContent = data.episodes.length;
  $("progress").textContent =
    `${active.filter((s) => s.reviewed).length}/${active.length} ${t("checked")} · ${deleted} ${t("deleted")}`;
  renderEpisodes();
  $("episode-title").textContent =
    `Episode ${ep().episode_index.toString().padStart(3, "0")}`;
  $("episode-status").textContent = reviewedEpisode(ep())
    ? t("done")
    : t("pending");
  $("cameras").replaceChildren();
  const views = Object.keys(ep().video_paths || {});
  if (!views.includes(camera)) camera = views[0];
  views.forEach((view) => {
    const button = document.createElement("button");
    button.textContent = t(view);
    button.className = view === camera ? "active" : "";
    button.setAttribute("aria-pressed", String(view === camera));
    button.onclick = () => {
      const time = $("video").currentTime,
        playing = !$("video").paused;
      camera = view;
      render();
      loadVideo(time, playing);
    };
    $("cameras").append(button);
  });
  $("timeline").replaceChildren();
  $("segments").replaceChildren();
  ep().segments.forEach((s, i) => {
    const marker = document.createElement("button");
    marker.style.flexGrow = s.end - s.start;
    marker.style.flexBasis = "0";
    marker.style.background = color(s);
    marker.className = `${i === segmentIndex ? "selected " : ""}${s.deleted ? "deleted" : ""}`;
    marker.title = `${s.deleted ? t("deleted") + " · " : ""}${taskName(s)} · ${fmt(s.start)}–${fmt(s.end)}s`;
    marker.setAttribute("aria-label", `#${i + 1} ${marker.title}`);
    marker.onclick = () => select(i);
    $("timeline").append(marker);
    if (s.deleted && !$("show-deleted").checked) return;
    const row = document.createElement("tr");
    row.className = `${i === segmentIndex ? "selected " : ""}${s.deleted ? "deleted" : ""}`;
    row.setAttribute("aria-selected", String(i === segmentIndex));
    const number = document.createElement("td");
    number.textContent = String(i + 1).padStart(2, "0");
    const range = document.createElement("td");
    range.textContent = `${fmt(s.start)}–${fmt(s.end)}`;
    range.className = "time-cell";
    const task = document.createElement("td"),
      name = document.createElement("span"),
      dot = document.createElement("span");
    task.className = "task-name";
    dot.className = "dot";
    dot.style.background = color(s);
    name.textContent = taskName(s);
    task.append(dot, name);
    if (s.excluded && !s.deleted) name.textContent += ` · ${t("excluded")}`;
    const checkCell = document.createElement("td"),
      check = document.createElement("input");
    check.type = "checkbox";
    check.checked = s.reviewed;
    check.disabled = s.deleted;
    check.setAttribute(
      "aria-label",
      `${t(s.reviewed ? "unreview" : "confirm")} #${i + 1}`,
    );
    check.onclick = (event) => event.stopPropagation();
    check.onchange = () => {
      s.reviewed = check.checked;
      save();
      render();
    };
    checkCell.append(check);
    row.append(number, range, task, checkCell);
    row.tabIndex = 0;
    row.onclick = () => select(i);
    row.onkeydown = (event) => {
      if (event.target === row && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        select(i);
      }
    };
    $("segments").append(row);
  });
  renderTakeovers();
  $("duration").textContent =
    `${fmt(ep().length)}s · ${ep().length} ${t("frame")}`;
  $("segment-count").textContent =
    `${ep().segments.filter((s) => !s.deleted).length} ${t("retained")}`;
  const s = seg();
  $("selection").textContent =
    `#${segmentIndex + 1}${s.deleted ? " · " + t("deleted") : ""}`;
  $("task-id").replaceChildren();
  data.annotation_labels.forEach((label) => {
    const option = document.createElement("option");
    option.value = label.id;
    option.textContent = `${label.id} · ${taskName(label)}`;
    $("task-id").append(option);
  });
  $("task-id").value = s.id;
  $("start").value = s.start;
  $("end").value = s.end;
  $("note").value = s.review_note || "";
  $("excluded").checked = s.excluded;
  $("reviewed").checked = s.reviewed;
  ["task-id", "note", "reviewed", "save", "split", "add-subtask"].forEach(
    (id) => ($(id).disabled = s.deleted),
  );
  $("start").disabled =
    s.deleted ||
    segmentIndex === 0 ||
    !!ep().segments[segmentIndex - 1]?.deleted;
  $("end").disabled =
    s.deleted ||
    segmentIndex === ep().segments.length - 1 ||
    !!ep().segments[segmentIndex + 1]?.deleted;
  $("excluded").disabled = s.deleted || s.id === -1;
  $("delete").textContent = t(s.deleted ? "restore" : "delete");
  renderEvidence(s);
  updateTime();
}
function renderEvidence(s) {
  const box = $("evidence");
  box.replaceChildren();
  const p = document.createElement("p");
  p.textContent = s.reason || t("noEvidence");
  box.append(p);
  if (s.boundary_uncertainty_frames != null) {
    const note = document.createElement("p");
    note.textContent = `${t("uncertainty")}: ±${s.boundary_uncertainty_frames}`;
    box.append(note);
  }
  for (const item of s.evidence || []) {
    const note = document.createElement("p");
    note.textContent = typeof item === "string" ? item : JSON.stringify(item);
    box.append(note);
  }
  const links = [
    ...(s.evidence_links || []),
    ...(s.thumbnail ? [{ path: s.thumbnail, label: "Contact sheet" }] : []),
  ];
  for (const link of links) {
    try {
      const a = document.createElement("a");
      a.href = safeURL(link.path);
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = link.label || link.path;
      box.append(a, document.createElement("br"));
    } catch {}
  }
}
function select(index) {
  segmentIndex = index;
  if (seg().deleted) $("show-deleted").checked = true;
  clipEnd = null;
  $("video").pause();
  render();
  seek(seg().start / data.fps);
}
function seek(time) {
  const video = $("video");
  if (video.readyState >= 1)
    video.currentTime = Math.max(
      0,
      Math.min(time, (ep().length - 1) / data.fps),
    );
  else pendingSeek = time;
}
function seekTakeoverFrame(frame) {
  clipEnd = null;
  $("video").pause();
  seek(frame / data.fps);
  updateTime();
}
function loadVideo(time = 0, playing = false) {
  const video = $("video");
  $("video-error").hidden = true;
  pendingSeek = null;
  if (!camera || !ep().video_paths?.[camera]) {
    $("video-error").textContent = t("videoError");
    $("video-error").hidden = false;
    video.removeAttribute("src");
    video.load();
    return;
  }
  video.onloadedmetadata = () => {
    const destination = pendingSeek ?? time;
    pendingSeek = null;
    seek(destination);
    if (playing) video.play().catch(() => {});
  };
  video.src = safeURL(ep().video_paths[camera]);
  video.load();
}
function updateTime() {
  if (!data) return;
  const v = $("video");
  if (clipEnd != null && v.currentTime >= clipEnd / data.fps) {
    v.pause();
    v.currentTime = (clipEnd - 1) / data.fps;
    clipEnd = null;
  }
  const frame = playheadFrame();
  $("time-display").textContent = `${v.currentTime.toFixed(2)}s · ${t("frame")} ${frame}`;
  if (!$("takeovers").hidden) {
    $("takeover-playhead").style.left = `${(100 * frame) / ep().length}%`;
    const range = activeTakeovers.find((s) => s.start <= frame && frame < s.end);
    const status = range ? takeoverLabel(range) : t("takeoverNone");
    if ($("takeover-status").textContent !== status)
      $("takeover-status").textContent = status;
  }
}
function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  message(t("exported"));
}
function saveEditor() {
  editSegment(data, ep(), segmentIndex, {
    id: Number($("task-id").value),
    start: Number($("start").value),
    end: Number($("end").value),
    review_note: $("note").value,
    reviewed: $("reviewed").checked,
    excluded: $("excluded").checked,
  });
  clipEnd = null;
  save();
  render();
}
function applyImport() {
  data = pendingImport;
  pendingImport = null;
  data.project_id = original.project_id;
  data.synthetic = original.synthetic;
  data.source_dataset = original.source_dataset;
  data.episodes.forEach(
    (e) =>
      (e.video_paths = original.episodes.find(
        (base) => base.episode_index === e.episode_index,
      ).video_paths),
  );
  episodeIndex = 0;
  episodePage = 0;
  segmentIndex = 0;
  takeoverIndex = -1;
  clipEnd = null;
  $("conflict").close();
  save();
  render();
  loadVideo();
  message(t("imported"));
}
$("editor-form").onsubmit = guard((event) => {
  event.preventDefault();
  saveEditor();
});
$("reviewed").onchange = guard(saveEditor);
$("task-id").onchange = () => {
  const unknown = Number($("task-id").value) === -1;
  $("excluded").disabled = unknown;
  $("excluded").checked = unknown;
};
$("split").onclick = guard(() => {
  splitSegment(
    ep(),
    segmentIndex,
    Math.floor($("video").currentTime * data.fps + 1e-6),
  );
  clipEnd = null;
  save();
  render();
});
$("add-subtask").onclick = guard(() => {
  const next = ep().segments[segmentIndex + 1];
  if (!next || next.deleted) return message(t("noFollowingInterval"), true);
  clipEnd = null;
  $("video").pause();
  const select = $("new-task-id");
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("chooseTask");
  placeholder.disabled = true;
  select.append(placeholder);
  data.training_subtask_definitions.forEach((task) => {
    const option = document.createElement("option");
    option.value = task.id;
    option.textContent = `${task.id} · ${taskName(task)}`;
    select.append(option);
  });
  select.value = "";
  $("new-start").min = next.start;
  $("new-start").max = next.end - 1;
  $("new-end").min = next.start + 1;
  $("new-end").max = next.end;
  $("new-start").value = next.start;
  // An unknown interval represents reserved space. For labeled intervals,
  // require the reviewer to choose an end rather than replace it by default.
  $("new-end").value = next.id === -1 ? next.end : "";
  $("add-subtask-context").textContent =
    `#${segmentIndex + 1} → ${t("availableRange")}: [${next.start}, ${next.end}) · ${taskName(next)}`;
  $("add-subtask-error").hidden = true;
  $("add-subtask-dialog").showModal();
});
$("cancel-add-subtask").onclick = () => $("add-subtask-dialog").close();
$("add-subtask-form").onsubmit = (event) => {
  event.preventDefault();
  try {
    const start = Number($("new-start").value), end = Number($("new-end").value);
    const next = ep().segments[segmentIndex + 1];
    if (!$("new-start").value.toString().trim() || !$("new-end").value.toString().trim() ||
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      !next || start < next.start || end > next.end || start >= end)
      throw Error(t("invalidNewRange"));
    if ($("new-task-id").value === "") throw Error(t("chooseTask"));
    segmentIndex = addSegmentAfter(data, ep(), segmentIndex, {
      id: Number($("new-task-id").value), start, end,
    });
    $("add-subtask-dialog").close();
    save();
    select(segmentIndex);
  } catch (error) {
    $("add-subtask-error").textContent = error.message;
    $("add-subtask-error").hidden = false;
  }
};
$("delete").onclick = () => {
  toggleDeletion(ep(), segmentIndex);
  clipEnd = null;
  $("video").pause();
  save();
  if (seg().deleted && !$("show-deleted").checked) {
    const next = ep().segments.findIndex(
      (s, i) => i > segmentIndex && !s.deleted,
    );
    const first = ep().segments.findIndex((s) => !s.deleted);
    if (next >= 0) segmentIndex = next;
    else if (first >= 0) segmentIndex = first;
    else {
      $("show-deleted").checked = true;
      message(t("allDeleted"));
    }
  }
  render();
};
$("show-deleted").onchange = () => {
  if (seg().deleted && !$("show-deleted").checked) {
    const index = ep().segments.findIndex((s) => !s.deleted);
    if (index >= 0) segmentIndex = index;
    else $("show-deleted").checked = true;
  }
  render();
};
$("language").onclick = () => {
  language = language === "en" ? "zh" : "en";
  try {
    localStorage.setItem("subtask-language", language);
  } catch {}
  render();
};
$("play-segment").onclick = () => {
  clipEnd = seg().end;
  seek(seg().start / data.fps);
  $("video")
    .play()
    .catch((error) => message(error.message, true));
};
$("seek-start").onclick = () => {
  clipEnd = null;
  seek(seg().start / data.fps);
};
$("video").addEventListener("timeupdate", updateTime);
$("video").addEventListener("error", () => {
  $("video-error").textContent = t("videoError");
  $("video-error").hidden = false;
});
if ("requestVideoFrameCallback" in $("video")) {
  const check = () => {
    updateTime();
    $("video").requestVideoFrameCallback(check);
  };
  $("video").requestVideoFrameCallback(check);
}
$("export").onclick = () =>
  download(
    "subtask-review.json",
    JSON.stringify(exportReview(data), null, 2) + "\n",
    "application/json",
  );
$("export-reviewed").onclick = () => {
  const result = exportReview(data, true);
  if (!result.episodes.length) return message(t("noReady"));
  download(
    "reviewed-episodes.jsonl",
    result.episodes.map((e) => JSON.stringify(e)).join("\n") + "\n",
    "application/x-ndjson",
  );
};
$("import").onclick = () => $("import-file").click();
$("import-file").onchange = async () => {
  try {
    const file = $("import-file").files[0];
    if (!file) return;
    pendingImport = normalize(JSON.parse(await file.text()), takeoverTracks);
    compatible(original, pendingImport);
    if (localDraft()) $("conflict").showModal();
    else applyImport();
  } catch (error) {
    pendingImport = null;
    message(`${t("error")}: ${error.message}`, true);
  } finally {
    $("import-file").value = "";
  }
};
$("keep-local").onclick = () => {
  pendingImport = null;
  $("conflict").close();
};
$("conflict").addEventListener("cancel", () => {
  pendingImport = null;
});
$("use-import").onclick = guard(applyImport);
try {
  if (location.protocol === "file:")
    throw Error(
      "Start the Python HTTP server. ES modules and videos require HTTP.",
    );
  const response = await fetch("project.json");
  if (!response.ok) throw Error(`project.json: HTTP ${response.status}`);
  const project = await response.json();
  takeoverTracks = project.takeovers ?? {};
  original = normalize(project, takeoverTracks);
  data = normalize(original);
  storageKey = `subtask-review-v3:${data.project_id || JSON.stringify([data.fps, data.training_subtask_definitions, data.episodes.map((e) => [e.episode_index, e.length])])}`;
  const draft = localDraft();
  if (draft) {
    try {
      const restored = normalize(JSON.parse(draft), takeoverTracks);
      compatible(original, restored);
      data = restored;
      data.episodes.forEach(
        (e) =>
          (e.video_paths = original.episodes.find(
            (o) => o.episode_index === e.episode_index,
          ).video_paths),
      );
      message(t("restoredDraft"));
    } catch (error) {
      message(
        `Invalid saved draft: ${error.message}. Import a valid review to replace it.`,
        true,
      );
    }
  }
  segmentIndex = Math.max(
    0,
    ep().segments.findIndex((s) => !s.deleted),
  );
  render();
  loadVideo();
} catch (error) {
  message(error.message, true);
  $("episode-title").textContent = error.message;
}
