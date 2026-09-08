import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadFlow() {
  const window = {};
  const code = await readFile(new URL("../auth-flow.js", import.meta.url), "utf8");
  vm.runInNewContext(code, { window });
  return window.GradientAuthFlow;
}

test("auth flow always clears sensitive inputs after success", async () => {
  const flow = await loadFlow();
  let cleaned = false;

  const result = await flow.settle(
    () => Promise.resolve({ status: "authenticated" }),
    () => { cleaned = true; },
  );

  assert.equal(result.status, "authenticated");
  assert.equal(cleaned, true);
});

test("auth flow converts provider rejection and still clears sensitive inputs", async () => {
  const flow = await loadFlow();
  let cleaned = false;

  const result = await flow.settle(
    () => Promise.reject(new Error("network unavailable")),
    () => { cleaned = true; },
  );

  assert.equal(result.status, "unexpected_error");
  assert.equal(cleaned, true);
});
