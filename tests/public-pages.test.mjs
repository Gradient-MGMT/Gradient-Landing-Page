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

test("the public-page logo scales to the active navigation highlight", async () => {
  const styles = await projectFile("styles.css");

  assert.match(
    styles,
    /\.brand img\s*{[^}]*height:\s*clamp\(18px, calc\(6\.93vw - 35\.21px\), 41px\);/s,
  );
});

test("the mobile terrain follows the page copy instead of covering it", async () => {
  const styles = await projectFile("styles.css");
  const mobileStyles = styles.match(/@media \(max-width: 720px\)\s*{([\s\S]*?)\n}\n\n@media \(prefers-reduced-motion/);

  assert.ok(mobileStyles, "expected the public-page mobile breakpoint");
  assert.match(mobileStyles[1], /body\.about,\s*body\.contact\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*height:\s*auto;/s);
  assert.match(mobileStyles[1], /body\.about \.top,\s*body\.contact \.top\s*{[^}]*order:\s*1;/s);
  assert.match(mobileStyles[1], /\.page-copy\s*{[^}]*order:\s*2;[^}]*margin:\s*1\.75rem auto 3rem;/s);
  assert.match(mobileStyles[1], /\.terrain\s*{[^}]*position:\s*relative;[^}]*order:\s*3;[^}]*height:\s*30vh;[^}]*transform:\s*translateX\(-14%\) scale\(1\.82, 1\);/s);
});
