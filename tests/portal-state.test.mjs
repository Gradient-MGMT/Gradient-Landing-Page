import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadState() {
  const window = {};
  const code = await readFile(new URL("../portal-state.js", import.meta.url), "utf8");
  vm.runInNewContext(code, { window });
  return window.GradientPortalState;
}

test("unknown dashboard destinations resolve to overview", async () => {
  const state = await loadState();

  assert.equal(state.normalizePanel("documents"), "documents");
  assert.equal(state.normalizePanel("unknown"), "overview");
});

test("document filters return only matching records", async () => {
  const state = await loadState();
  const documents = [
    { id: "report", type: "reports" },
    { id: "tax", type: "tax" },
  ];

  assert.deepEqual(
    Array.from(state.filterDocuments("tax", documents)),
    [{ id: "tax", type: "tax" }],
  );
  assert.deepEqual(Array.from(state.filterDocuments("all", documents)), documents);
  assert.deepEqual(Array.from(state.filterDocuments("notices", documents)), []);
});

test("a closed mobile sidebar is removed from keyboard navigation", async () => {
  const state = await loadState();

  assert.equal(state.shouldDisableSidebar({ isMobile: true, isOpen: false }), true);
  assert.equal(state.shouldDisableSidebar({ isMobile: true, isOpen: true }), false);
  assert.equal(state.shouldDisableSidebar({ isMobile: false, isOpen: false }), false);
});

test("an open mobile sidebar disables the background workspace", async () => {
  const state = await loadState();

  assert.equal(state.shouldDisableWorkspace({ isMobile: true, isOpen: true }), true);
  assert.equal(state.shouldDisableWorkspace({ isMobile: true, isOpen: false }), false);
  assert.equal(state.shouldDisableWorkspace({ isMobile: false, isOpen: true }), false);
});
