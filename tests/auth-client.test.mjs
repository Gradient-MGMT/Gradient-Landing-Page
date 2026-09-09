import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadAuth({ authenticated = false } = {}) {
  const values = new Map();
  if (authenticated) values.set("gradient_portal_demo_session", "active");
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

test("all syntactically valid sign-ins are rejected", async () => {
  const { auth, values } = await loadAuth();
  const result = await auth.signIn({
    email: "alex@example.test",
    password: "not-stored",
  });

  assert.equal(result.status, "error");
  assert.equal(result.message, "We couldn't sign you in. Check your credentials and try again.");
  assert.equal(auth.getSession().authenticated, false);
  assert.deepEqual([...values.values()], []);
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

test("valid MFA input cannot create a session", async () => {
  const { auth } = await loadAuth();
  const result = await auth.verifyChallenge({ challengeId: "demo", code: "123456" });

  assert.equal(result.status, "error");
  assert.equal(auth.getSession().authenticated, false);
});

test("loading the auth client clears any stale demo session", async () => {
  const { auth } = await loadAuth({ authenticated: true });

  assert.equal(auth.getSession().authenticated, false);
});

test("sign-out keeps the session unauthenticated", async () => {
  const { auth } = await loadAuth({ authenticated: true });

  auth.signOut();

  assert.equal(auth.getSession().authenticated, false);
});
