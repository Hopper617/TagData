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
    await import("../web/app.js?dom-reload");
    assert.equal($("note").value, ""); // fresh page selects Episode 0
    $("episodes").children[1].click();
    assert.equal($("note").value, "resume me");
  } finally {
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    globalThis.setTimeout = timer;
  }
});
