import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/youtube-api.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function setup() {
  const scripts = [];
  const window = {};
  const document = {
    querySelector: () => scripts[0] ?? null,
    createElement: () => ({
      addEventListener(name, callback) { this[name] = callback; },
      remove() { scripts.splice(scripts.indexOf(this), 1); },
    }),
    body: { appendChild: (script) => scripts.push(script) },
  };
  const exports = {};
  new Function("exports", "window", "document", compiled)(exports, window, document);
  return { window, scripts, load: exports.loadYouTubeAPI };
}

test("concurrent mounts share one YouTube script and all receive the loaded API", async () => {
  const { window, scripts, load } = setup();
  const first = load();
  const second = load();
  assert.equal(first, second);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, "https://www.youtube.com/iframe_api");
  window.YT = { Player() {} };
  window.onYouTubeIframeAPIReady();
  assert.equal(await first, window.YT);
  assert.equal(await second, window.YT);
});

test("navigation can initialize another player after the API has already loaded", async () => {
  const { window, scripts, load } = setup();
  window.YT = { Player() {} };
  assert.equal(await load(), window.YT);
  assert.equal(scripts.length, 0);
});

test("failed scripts are removed so a later mount can retry loading", async () => {
  const { window, scripts, load } = setup();
  const failed = load();
  scripts[0].error();
  await assert.rejects(failed, /Failed to load/);
  assert.equal(scripts.length, 0);
  const retried = load();
  assert.equal(scripts.length, 1);
  window.YT = { Player() {} };
  window.onYouTubeIframeAPIReady();
  assert.equal(await retried, window.YT);
});
