import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("login panel omits the investor access eyebrow while retaining portal branding", async () => {
  const loginPage = await projectFile("portal-login.html");
  const loginPanel = loginPage.match(/<section class="login-panel"[\s\S]*?<\/section>/)?.[0];

  assert.ok(loginPanel, "expected the investor login panel");
  assert.doesNotMatch(loginPanel, /<p class="eyebrow">\s*Investor access\s*<\/p>/i);
  assert.match(loginPage, /<p class="login-brand__kicker">Investor Portal<\/p>/);
});
