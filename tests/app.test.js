// DOM/event unit test only. Does not launch a browser or claim video playback QA.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("workbench handlers render, persist, resume, switch languages and import explicitly", async () => {
  class Element {
    constructor() {
      this.children = [];
      this.style = {};
      this.dataset = {};
      this.value = "";
      this.checked = false;
      this.currentTime = 0;
      this.paused = true;
      this.readyState = 1;
      this.hidden = false;
      this.disabled = false;
      this.listeners = {};
    }
    get valueAsNumber() {
      return this.value === "" ? NaN : Number(this.value);
    }
    focus() {}
    append(...items) {
      this.children.push(...items);
    }
    replaceChildren(...items) {
      this.children = [...items];
    }
    setAttribute(name, value) {
      this[name] = value;
    }
    removeAttribute(name) {
      delete this[name];
    }
    addEventListener(name, fn) {
      this.listeners[name] = fn;
    }
    click() {
      this.onclick?.({ preventDefault() {}, stopPropagation() {} });
    }
    load() {
      this.onloadedmetadata?.();
    }
    pause() {
      this.paused = true;
    }
    async play() {
      this.paused = false;
    }
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
  }
  const html = await fs.readFile(
    new URL("../web/index.html", import.meta.url),
    "utf8",
  );
  const elements = Object.fromEntries(
    [...html.matchAll(/id="([^"]+)"/g)].map((match) => [
      match[1],
      new Element(),
    ]),
  );
  const translations = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(
    (match) => {
      const e = new Element();
      e.dataset.i18n = match[1];
      return e;
    },
  );
  const storage = new Map(),
    downloads = [];
  globalThis.document = {
    getElementById: (id) => elements[id],
    createElement: () => new Element(),
    querySelectorAll: () => translations,
    documentElement: {},
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { language: "en" },
    configurable: true,
  });
  globalThis.location = {
    href: "http://test.invalid/index.html",
    origin: "http://test.invalid",
    protocol: "http:",
  };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  };
  const project = JSON.parse(
    await fs.readFile(new URL("../web/project.json", import.meta.url), "utf8"),
  );
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => structuredClone(project),
  });
  const create = URL.createObjectURL,
    revoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => {
    downloads.push(blob);
    return "blob:test";
  };
  URL.revokeObjectURL = () => {};
  const timer = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => {
    const handle = timer(fn, ms);
    handle.unref();
    return handle;
  };
  const $ = (id) => elements[id];
  try {
    await import("../web/app.js?dom-test");
    assert.equal($("episode-title").textContent, "Episode 000");
    assert.equal($("segments").children.length, 8);
    assert.equal($("takeovers").hidden, true);
    assert.equal($("takeover-form").hidden, true);
    assert.equal(
      $("video").src,
      "http://test.invalid/media/episode_000000_base.mp4",
    );
    $("video").currentTime = 2;
    $("cameras").children[1].click();
    assert.match($("video").src, /left_wrist/);
    assert.equal($("video").currentTime, 2);
    $("language").click();
    assert.equal(document.documentElement.lang, "zh");
    assert.equal($("delete").textContent, "删除此片段");
    $("language").click();
    assert.equal(document.documentElement.lang, "en");
    $("note").value = "checked all cameras";
    $("reviewed").checked = true;
    $("reviewed").onchange();
    assert.match($("progress").textContent, /7\/15/);
    assert.equal(storage.size, 2);
    $("export").click();
    let output = JSON.parse(await downloads.at(-1).text());
    assert.equal(
      output.episodes[0].segments[0].review_note,
      "checked all cameras",
    );
    $("delete").click();
    $("export").click();
    output = JSON.parse(await downloads.at(-1).text());
    assert.equal(output.episodes[0].deleted_intervals[0].start, 0);
    assert.equal(output.episodes[0].segments[0].start, 90);
    $("timeline").children[0].click();
    assert.equal($("delete").textContent, "Restore interval");
    $("delete").click();
    assert.equal($("start").value, 0);
    $("video").currentTime = 1;
    $("split").click();
    assert.equal($("segments").children.length, 9);
    $("export").click();
    const split = JSON.parse(await downloads.at(-1).text());
    assert.deepEqual(
      split.episodes[0].segments.slice(0, 2).map((s) => [s.start, s.end]),
      [
        [0, 30],
        [30, 90],
      ],
    );
    $("import-file").files = [{ text: async () => JSON.stringify(project) }];
    await $("import-file").onchange();
    assert.equal($("conflict").open, true);
    $("keep-local").click();
    assert.equal($("segments").children.length, 9);
    $("import-file").files = [{ text: async () => JSON.stringify(project) }];
    await $("import-file").onchange();
    $("use-import").click();
    assert.equal($("segments").children.length, 8);
    assert.equal($("conflict").open, false);
    const invalid = structuredClone(project);
    invalid.fps = 25;
    $("import-file").files = [{ text: async () => JSON.stringify(invalid) }];
    await $("import-file").onchange();
    assert.match($("status").textContent, /different dataset/);
    assert.equal($("segments").children.length, 8);
    $("episodes").children[1].click();
    const unknownRow = $("segments").children.find(
      (row) =>
        row.children[2].children[1].textContent.includes("Unclear") &&
        !row.className.includes("deleted"),
    );
    unknownRow.children[3].children[0].checked = true;
    unknownRow.children[3].children[0].onchange();
    $("export-reviewed").click();
    const lines = (await downloads.at(-1).text())
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].episode_index, 1);
    assert.equal(lines[0].deleted_intervals.length, 1);
    $("play-segment").click();
    assert.equal($("video").paused, false);
    $("video").currentTime = 3.2;
    $("video").listeners.timeupdate();
    assert.equal($("video").paused, true);
    assert.equal($("video").currentTime, 89 / 30);
    $("video").currentTime = 4;
    $("cameras").children[2].click();
    assert.equal($("video").currentTime, 4);
    // Simulate a fresh page module with the same browser store.
    $("note").value = "resume me";
    $("save").click(); // submit is dispatched below by the mock
    $("editor-form").onsubmit({ preventDefault() {} });
    project.takeovers = {
      0: [
        { start: 60, end: 75, mode: "free" },
        { start: 75, end: 90, mode: "grasp" },
      ],
    };
    await import("../web/app.js?dom-reload");
    assert.equal($("note").value, ""); // fresh page selects Episode 0
    assert.equal($("takeovers").hidden, false);
    const [free, grasp] = $("takeover-markers").children;
    assert.match(free.title, /FREE takeover · frame \[60, 75\)/);
    assert.match(grasp.title, /GRASP takeover · frame \[75, 90\)/);
    await $("video").play();
    free.click();
    assert.equal($("video").currentTime, 60 / 30);
    assert.equal($("video").paused, true);
    assert.equal($("start").value, 0); // seeking leaves the subtask selection intact
    assert.equal($("takeover-form").hidden, false);
    assert.equal($("takeover-start").value, 60);
    assert.equal($("takeover-end").value, 75);
    assert.match($("takeover-status").textContent, /FREE/);
    $("video").currentTime = 75 / 30;
    $("video").listeners.timeupdate();
    assert.match($("takeover-status").textContent, /GRASP/);
    $("takeover-seek-end").click();
    assert.equal($("video").currentTime, 74 / 30);
    $("video").currentTime = 57 / 30;
    $("takeover-use-start").click();
    $("video").currentTime = 72 / 30;
    $("takeover-use-end").click();
    $("cameras").children[1].click();
    assert.equal($("takeover-start").value, 57);
    assert.equal($("takeover-end").value, 73);
    const draftKey = `subtask-review-v3:${project.project_id}`;
    const draftBeforeTakeoverEdit = storage.get(draftKey);
    $("takeover-end").value = 76;
    $("takeover-form").onsubmit({ preventDefault() {} });
    assert.equal($("takeover-error").hidden, false);
    assert.equal(storage.get(draftKey), draftBeforeTakeoverEdit);
    $("takeover-end").value = 73;
    $("takeover-form").onsubmit({ preventDefault() {} });
    assert.equal($("takeover-error").hidden, true);
    assert.match($("takeover-markers").children[0].title, /\[57, 73\)/);
    assert.match($("takeover-markers").children[1].title, /\[75, 90\)/);
    assert.match($("takeover-original").textContent, /\[60, 75\)/);
    $("export").click();
    const adjusted = JSON.parse(await downloads.at(-1).text());
    assert.equal(adjusted.takeovers, undefined);
    assert.deepEqual(adjusted.episodes[0].takeover_edits, [
      { source_start: 60, source_end: 75, mode: "free", start: 57, end: 73 },
    ]);
    await import("../web/app.js?dom-reload-adjusted-takeover");
    assert.match($("takeover-markers").children[0].title, /\[57, 73\)/);
    $("takeover-markers").children[0].click();
    $("takeover-reset").click();
    assert.match($("takeover-markers").children[0].title, /\[60, 75\)/);
    assert.equal(JSON.parse(storage.get(draftKey)).episodes[0].takeover_edits, undefined);
    $("takeover-close").click();
    assert.equal($("takeover-form").hidden, true);
    const stale = structuredClone(adjusted);
    stale.episodes[0].takeover_edits[0].source_end = 74;
    $("import-file").files = [{ text: async () => JSON.stringify(stale) }];
    await $("import-file").onchange();
    assert.match($("status").textContent, /does not match the recorded signal/);
    assert.match($("takeover-markers").children[0].title, /\[60, 75\)/);
    $("import-file").files = [{ text: async () => JSON.stringify(adjusted) }];
    await $("import-file").onchange();
    $("use-import").click();
    assert.match($("takeover-markers").children[0].title, /\[57, 73\)/);
    $("episodes").children[1].click();
    assert.equal($("note").value, "resume me");
    assert.equal($("takeovers").hidden, true);
    assert.equal($("takeover-form").hidden, true);
    assert.equal($("episode-pagination").hidden, true);

    project.project_id = "pagination-test";
    project.episodes = Array.from({ length: 12 }, (_, episode_index) => ({
      ...structuredClone(project.episodes[0]),
      episode_index,
    }));
    await import("../web/app.js?dom-pagination");
    assert.equal($("episodes").children.length, 10);
    assert.equal($("episode-page").textContent, "1 / 2");
    assert.equal($("episode-prev").disabled, true);
    $("episode-next").click();
    assert.equal($("episodes").children.length, 2);
    assert.equal($("episode-page").textContent, "2 / 2");
    assert.equal($("episode-next").disabled, true);
    assert.equal($("episode-title").textContent, "Episode 000");
    $("episodes").children[0].click();
    assert.equal($("episode-title").textContent, "Episode 010");
    $("episode-prev").click();
    assert.equal($("episodes").children.length, 10);
    assert.equal($("episode-title").textContent, "Episode 010");
    // Reserve space after the current selection, cancel without changes,
    // then add a task and verify autosave/export/import/reload round trips.
    $("episodes").children[0].click();
    $("segments").children[1].click();
    $("task-id").value = "-1";
    $("task-id").onchange();
    $("reviewed").checked = false;
    $("editor-form").onsubmit({ preventDefault() {} });
    $("segments").children[0].click();
    const rowsBeforeAdd = $("segments").children.length;
    $("add-subtask").click();
    assert.equal($("add-subtask-dialog").open, true);
    assert.equal($("new-start").value, 90);
    const reservedEnd = Number($("new-end").value);
    $("cancel-add-subtask").click();
    assert.equal($("segments").children.length, rowsBeforeAdd);
    $("add-subtask").click();
    $("new-task-id").value = "0";
    $("new-end").value = reservedEnd + 1;
    $("add-subtask-form").onsubmit({ preventDefault() {} });
    assert.equal($("add-subtask-error").hidden, false);
    assert.equal($("segments").children.length, rowsBeforeAdd);
    $("new-end").value = 100;
    $("add-subtask-form").onsubmit({ preventDefault() {} });
    assert.equal($("add-subtask-dialog").open, false);
    assert.equal($("segments").children.length, rowsBeforeAdd + 1);
    assert.equal($("start").value, 90);
    assert.equal($("end").value, 100);
    assert.equal($("reviewed").checked, false);
    assert.equal($("excluded").checked, false);
    $("export").click();
    const added = JSON.parse(await downloads.at(-1).text());
    assert.deepEqual(added.episodes[0].segments.slice(1, 3).map((s) => [s.id, s.start, s.end]), [[0, 90, 100], [-1, 100, reservedEnd]]);
    await import("../web/app.js?dom-reload-added-subtask");
    assert.equal($("segments").children.length, rowsBeforeAdd + 1);
    $("import-file").files = [{ text: async () => JSON.stringify(added) }];
    await $("import-file").onchange();
    $("use-import").click();
    assert.equal($("segments").children.length, rowsBeforeAdd + 1);
    // A labeled successor requires an explicit end, and the last interval
    // offers guidance instead of opening an unusable dialog.
    $("add-subtask").click();
    assert.equal($("new-end").value, "");
    $("cancel-add-subtask").click();
    $("segments").children.at(-1).click();
    $("add-subtask").click();
    assert.equal($("add-subtask-dialog").open, false);
    assert.match($("status").textContent, /no retained interval/);
  } finally {
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    globalThis.setTimeout = timer;
  }
});
