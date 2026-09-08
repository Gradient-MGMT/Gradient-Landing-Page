import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadAuth() {
  const values = new Map();
  const window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  const code = await readFile(new URL("../auth-client.js", import.meta.url), "utf8");
  vm.runInNewContext(code, { window, setTimeout });
  return { auth: window.GradientAuth, values };
}

test("valid mock sign-in creates only a demo session", async () => {
  const { auth, values } = await loadAuth();
  const result = await auth.signIn({
    email: "alex@example.test",
    password: "not-stored",
  });

  assert.equal(result.status, "authenticated");
  assert.equal(auth.getSession().authenticated, true);
  assert.deepEqual([...values.values()], ["active"]);
});

test("invalid credentials return both field errors", async () => {
  const { auth } = await loadAuth();
  const result = await auth.signIn({ email: "invalid", password: "" });

  assert.equal(result.status, "error");
  assert.deepEqual(Object.keys(result.fields).sort(), ["email", "password"]);
});

test("invalid MFA input leaves the session signed out", async () => {
  const { auth } = await loadAuth();
  const result = await auth.verifyChallenge({ challengeId: "demo", code: "123" });

  assert.equal(result.status, "error");
  assert.equal(auth.getSession().authenticated, false);
});

test("valid MFA input completes the demo session", async () => {
  const { auth } = await loadAuth();
  const result = await auth.verifyChallenge({ challengeId: "demo", code: "123456" });

  assert.equal(result.status, "authenticated");
  assert.equal(auth.getSession().authenticated, true);
});

test("sign-out clears the demo session", async () => {
  const { auth } = await loadAuth();
  await auth.signIn({ email: "alex@example.test", password: "temporary" });

  auth.signOut();

  assert.equal(auth.getSession().authenticated, false);
});
