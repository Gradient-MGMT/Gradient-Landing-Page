import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("About and Contact share the same content alignment and portal navigation", async () => {
  const [about, contact] = await Promise.all([
    projectFile("about.html"),
    projectFile("contact.html"),
  ]);

  for (const page of [about, contact]) {
    assert.match(page, /<main class="page-copy /);
    assert.match(page, /href="portal-login\.html"/);
    assert.match(page, />Investor Login</);
  }
});

test("About and Contact body copy use the same 14px size", async () => {
  const styles = await projectFile("styles.css");

  assert.match(
    styles,
    /\.copy__body p\s*{[^}]*font-size:\s*0\.875rem;/s,
  );
  assert.match(
    styles,
    /\.page-copy--contact p\s*{[^}]*font-size:\s*0\.875rem;/s,
  );
});

test("the portal redirects before rendering when no session exists", async () => {
  const portal = await projectFile("portal.html");
  const bodyStart = portal.indexOf("<body");
  const authClient = portal.indexOf('<script src="auth-client.js"></script>');
  const loginRedirect = portal.indexOf('window.location.replace("portal-login.html")');

  assert.ok(authClient > -1 && authClient < bodyStart);
  assert.ok(loginRedirect > authClient && loginRedirect < bodyStart);
});
