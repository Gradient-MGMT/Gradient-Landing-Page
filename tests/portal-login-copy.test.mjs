import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("login panel omits the investor access eyebrow", async () => {
  const loginPage = await projectFile("portal-login.html");
  const loginPanel = loginPage.match(/<section class="login-panel"[\s\S]*?<\/section>/)?.[0];

  assert.ok(loginPanel, "expected the investor login panel");
  assert.doesNotMatch(loginPanel, /<p class="eyebrow">\s*Investor access\s*<\/p>/i);
});

test("login brand panel shows only the logo, no copy", async () => {
  const loginPage = await projectFile("portal-login.html");
  const brandPanel = loginPage.match(/<section class="login-brand"[\s\S]*?<\/section>/)?.[0];

  assert.ok(brandPanel, "expected the login brand panel");
  assert.doesNotMatch(brandPanel, /<(h1|p)\b/);
  assert.match(brandPanel, /logo-white\.svg/);
});
