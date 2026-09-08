# Gradient Investor Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a branded, responsive investor-login and mock dashboard flow to the static Gradient site while preserving a clean boundary for future server-backed authentication and MFA.

**Architecture:** Keep the existing static HTML/CSS/JavaScript stack. Public-site changes remain in `index.html` and `styles.css`; the portal uses isolated HTML, CSS, controller scripts, and a provider-neutral `window.GradientAuth` client whose mock adapter can later be replaced without changing the screens.

**Tech Stack:** HTML5, CSS custom properties, browser JavaScript, Node.js 24 built-in test runner, local static HTTP server.

**Spec:** `docs/superpowers/specs/2026-09-08-investor-portal-design.md`

## Global Constraints

- Add **Investor Login** as the third item in the glass navigation beneath the Gradient logo.
- About and Contact H1 text must both render at `2.5rem`.
- Use Gradient Black `#0D0D0D`, Eggshell `#F9F9F9`, Navy `#01184D`, and the approved secondary palette from the spec.
- Self-host the supplied Geist variable font and use official Gradient logo/topographic assets.
- Do not add a framework or package dependency.
- Do not store, log, or transmit entered credentials or personal information.
- Persist only a non-sensitive demo-session flag in `sessionStorage`.
- Keep the auth contract provider-neutral: `signIn`, `verifyChallenge`, `getSession`, and `signOut`.
- Keep sample people, entities, figures, documents, and activity fictional.
- Support keyboard navigation, visible focus, accessible status text, reduced motion, and responsive desktop/mobile layouts.

---

### Task 1: Public Entry Point and Heading Normalization

**Files:**
- Create: `tests/site-contracts.test.mjs`
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:**
- Consumes: Existing `.pill`, `.pill__item`, `.copy h1`, and `.contact-sheet h1` selectors.
- Produces: `portal-login.html` public route and `--section-title-size: 2.5rem` shared CSS token.

- [ ] **Step 1: Write the failing public-site contract tests**

Create `tests/site-contracts.test.mjs` with reusable source helpers and these assertions:

```js
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("home navigation exposes the investor login route", async () => {
  const html = await source("index.html");
  assert.match(html, /href="portal-login\.html"/);
  assert.match(html, />Investor Login</);
});

test("about and contact headings share the approved size token", async () => {
  const css = await source("styles.css");
  assert.match(css, /--section-title-size:\s*2\.5rem/);
  assert.match(css, /\.copy h1\s*\{[^}]*font-size:\s*var\(--section-title-size\)/);
  assert.match(css, /\.contact-sheet h1\s*\{[^}]*font-size:\s*var\(--section-title-size\)/);
});
```

- [ ] **Step 2: Run the tests and verify the new contracts fail**

Run: `node --test tests/site-contracts.test.mjs`

Expected: two failing subtests because the Investor Login link and shared title token do not exist.

- [ ] **Step 3: Add the public navigation item and shared heading token**

In `index.html`, add this third `.pill__item` after Contact:

```html
<a class="pill__item" href="portal-login.html">
  <span class="pill__bubble" aria-hidden="true"></span>
  <span class="pill__label">Investor Login</span>
</a>
```

In `styles.css`, add the token and consume it in both existing heading rules:

```css
:root {
  --section-title-size: 2.5rem;
}

.contact-sheet h1 {
  font-size: var(--section-title-size);
}

.copy h1 {
  font-size: var(--section-title-size);
}
```

Widen the desktop and mobile pill rules so all three items remain equally legible without changing their height.

- [ ] **Step 4: Run the public-site tests and syntax check**

Run: `node --test tests/site-contracts.test.mjs`

Expected: both subtests pass.

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

- [ ] **Step 5: Commit the public entry point**

```bash
git add index.html styles.css tests/site-contracts.test.mjs
git commit -m "feat: add investor portal entry point"
```

### Task 2: Brand Assets and Portal Design Tokens

**Files:**
- Create: `assets/brand/geist-variable.ttf`
- Create: `assets/brand/logo-navy.svg`
- Create: `assets/brand/logo-white.svg`
- Create: `assets/brand/topo-navy.png`
- Create: `portal.css`
- Modify: `tests/site-contracts.test.mjs`

**Interfaces:**
- Consumes: Official assets supplied in the OneDrive Brand Assets folder.
- Produces: `.portal-shell` design scope, brand CSS variables, self-hosted `Gradient Geist` font family, shared form/control/card styles.

- [ ] **Step 1: Add failing brand-asset and token tests**

Append tests that require the copied assets and exact brand tokens:

```js
test("portal ships the approved local brand assets", async () => {
  await Promise.all([
    "assets/brand/geist-variable.ttf",
    "assets/brand/logo-navy.svg",
    "assets/brand/logo-white.svg",
    "assets/brand/topo-navy.png",
  ].map((path) => access(new URL(`../${path}`, import.meta.url))));
});

test("portal stylesheet defines the official primary palette", async () => {
  const css = await source("portal.css");
  assert.match(css, /--gradient-black:\s*#0d0d0d/i);
  assert.match(css, /--gradient-eggshell:\s*#f9f9f9/i);
  assert.match(css, /--gradient-navy:\s*#01184d/i);
  assert.match(css, /@font-face[\s\S]*geist-variable\.ttf/);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --test --test-name-pattern="portal ships|portal stylesheet" tests/site-contracts.test.mjs`

Expected: failure because `assets/brand/` and `portal.css` do not exist.

- [ ] **Step 3: Copy the approved assets into the repository**

Copy these exact sources:

```text
Brand Assets/Fonts/Geist/Geist-VariableFont_wght.ttf -> assets/brand/geist-variable.ttf
Brand Assets/Logo/svg/logo_navy.svg -> assets/brand/logo-navy.svg
Brand Assets/Logo/svg/logo_white.svg -> assets/brand/logo-white.svg
Brand Assets/Misc/Topographical Lines/navy_topo_map.png -> assets/brand/topo-navy.png
```

- [ ] **Step 4: Create the portal CSS foundation**

Start `portal.css` with the exact design tokens and namespaced reset:

```css
@font-face {
  font-family: "Gradient Geist";
  src: url("assets/brand/geist-variable.ttf") format("truetype");
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}

.portal-shell {
  --gradient-black: #0d0d0d;
  --gradient-eggshell: #f9f9f9;
  --gradient-navy: #01184d;
  --gradient-royal: #0e389b;
  --gradient-dusk: #5566c6;
  --gradient-tang: #6684db;
  --gradient-orchard: #9a9ad9;
  --gradient-sunrise: #c7c4ef;
  --gradient-citrus: #ffaa17;
  --gradient-butter: #ffdc17;
  --gradient-peach: #efb4c8;
  --gradient-lychee: #f5e5d6;
  background: var(--gradient-eggshell);
  color: var(--gradient-black);
  font-family: "Gradient Geist", sans-serif;
}
```

Add namespaced foundations for buttons, inputs, cards, status text, `:focus-visible`, and reduced motion. Do not style unscoped public-site elements.

- [ ] **Step 5: Run the brand tests**

Run: `node --test --test-name-pattern="portal ships|portal stylesheet" tests/site-contracts.test.mjs`

Expected: two passing subtests.

- [ ] **Step 6: Commit the portal foundation**

```bash
git add assets/brand portal.css tests/site-contracts.test.mjs
git commit -m "feat: add portal brand foundation"
```

### Task 3: Provider-Neutral Mock Authentication Client

**Files:**
- Create: `auth-client.js`
- Create: `tests/auth-client.test.mjs`

**Interfaces:**
- Consumes: Browser `sessionStorage`.
- Produces: `window.GradientAuth.signIn({ email, password })`, `verifyChallenge({ challengeId, code })`, `getSession()`, and `signOut()`.
- Returns: `{ status: "authenticated" }`, `{ status: "mfa_required", challengeId }`, or `{ status: "error", message, fields }`.

- [ ] **Step 1: Write failing auth-contract tests**

Create a VM harness that executes the browser script without a DOM:

```js
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
  const result = await auth.signIn({ email: "alex@example.test", password: "not-stored" });
  assert.equal(result.status, "authenticated");
  assert.equal(auth.getSession().authenticated, true);
  assert.deepEqual([...values.values()], ["active"]);
});

test("invalid values return accessible field errors", async () => {
  const { auth } = await loadAuth();
  const result = await auth.signIn({ email: "invalid", password: "" });
  assert.equal(result.status, "error");
  assert.deepEqual(Object.keys(result.fields).sort(), ["email", "password"]);
});

test("sign-out clears the demo session", async () => {
  const { auth } = await loadAuth();
  await auth.signIn({ email: "alex@example.test", password: "temporary" });
  auth.signOut();
  assert.equal(auth.getSession().authenticated, false);
});
```

- [ ] **Step 2: Run the auth tests and verify failure**

Run: `node --test tests/auth-client.test.mjs`

Expected: failure because `auth-client.js` does not exist.

- [ ] **Step 3: Implement the mock adapter**

Create an IIFE that attaches a frozen API to `window.GradientAuth`:

```js
(() => {
  const SESSION_KEY = "gradient_portal_demo_session";
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function signIn({ email = "", password = "" } = {}) {
    const fields = {};
    if (!emailPattern.test(email.trim())) fields.email = "Enter a valid email address.";
    if (!password) fields.password = "Enter your password.";
    if (Object.keys(fields).length) {
      return { status: "error", message: "Review the highlighted fields.", fields };
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    window.sessionStorage.setItem(SESSION_KEY, "active");
    return { status: "authenticated" };
  }

  async function verifyChallenge({ challengeId = "", code = "" } = {}) {
    if (!challengeId || !/^\d{6}$/.test(code)) {
      return { status: "error", message: "Enter the six-digit verification code.", fields: { code: "Enter six digits." } };
    }
    window.sessionStorage.setItem(SESSION_KEY, "active");
    return { status: "authenticated" };
  }

  const getSession = () => ({ authenticated: window.sessionStorage.getItem(SESSION_KEY) === "active" });
  const signOut = () => window.sessionStorage.removeItem(SESSION_KEY);

  window.GradientAuth = Object.freeze({ signIn, verifyChallenge, getSession, signOut });
})();
```

Do not include vendor names, network requests, logging, or stored credential values.

- [ ] **Step 4: Run auth tests and a source safety assertion**

Run: `node --test tests/auth-client.test.mjs`

Expected: three passing subtests.

Run: `rg -n "localStorage|console\.|fetch\(|XMLHttpRequest|setItem\([^\n]*(email|password)" auth-client.js`

Expected: no matches.

- [ ] **Step 5: Commit the auth seam**

```bash
git add auth-client.js tests/auth-client.test.mjs
git commit -m "feat: add mock authentication adapter"
```

### Task 4: Investor Sign-In Experience

**Files:**
- Create: `portal-login.html`
- Create: `portal-login.js`
- Modify: `portal.css`
- Modify: `tests/site-contracts.test.mjs`

**Interfaces:**
- Consumes: `window.GradientAuth`, `.portal-shell` tokens, `assets/brand/logo-navy.svg`, and `assets/brand/topo-navy.png`.
- Produces: `#login-form`, `#mfa-form`, `#auth-status`, field error elements, and redirect to `portal.html` after `authenticated`.

- [ ] **Step 1: Add failing sign-in document tests**

Append these contracts:

```js
test("login page exposes labeled credential and MFA forms", async () => {
  const html = await source("portal-login.html");
  assert.match(html, /id="login-form"/);
  assert.match(html, /<label[^>]*for="email"/);
  assert.match(html, /<label[^>]*for="password"/);
  assert.match(html, /id="auth-status"[^>]*aria-live="polite"/);
  assert.match(html, /id="mfa-form"/);
  assert.match(html, /autocomplete="one-time-code"/);
  assert.match(html, /src="auth-client\.js"/);
  assert.match(html, /src="portal-login\.js"/);
});

test("login controller uses only the auth client boundary", async () => {
  const js = await source("portal-login.js");
  assert.match(js, /GradientAuth\.signIn/);
  assert.match(js, /GradientAuth\.verifyChallenge/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|fetch\(/);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --test --test-name-pattern="login page|login controller" tests/site-contracts.test.mjs`

Expected: failure because the login files do not exist.

- [ ] **Step 3: Build semantic sign-in markup**

Create `portal-login.html` with this document structure:

```html
<body class="portal-shell portal-login-page">
  <main class="login-layout">
    <section class="login-brand" aria-label="Gradient investor portal">
      <a class="portal-logo" href="index.html"><img src="assets/brand/logo-white.svg" alt="Gradient MGMT"></a>
      <div class="login-brand__message"><p>Investor Portal</p><h1>Clarity at every step.</h1></div>
    </section>
    <section class="login-panel">
      <div class="login-card">
        <p class="eyebrow">Investor access</p>
        <h2>Welcome back</h2>
        <p>Sign in to view your Gradient portfolio.</p>
        <div id="auth-status" role="status" aria-live="polite"></div>
        <form id="login-form" novalidate>
          <div class="field">
            <label for="email">Email address</label>
            <input id="email" name="email" type="email" autocomplete="email" aria-describedby="email-error">
            <span id="email-error" class="field-error"></span>
          </div>
          <div class="field">
            <label for="password">Password</label>
            <div class="password-field">
              <input id="password" name="password" type="password" autocomplete="current-password" aria-describedby="password-error">
              <button type="button" data-toggle-password aria-label="Show password">Show</button>
            </div>
            <span id="password-error" class="field-error"></span>
          </div>
          <div class="login-options">
            <label><input name="remember" type="checkbox"> Keep me signed in</label>
            <button type="button" class="text-button" data-forgot-password>Forgot password?</button>
          </div>
          <button class="primary-button" type="submit">Sign in</button>
        </form>
        <form id="mfa-form" hidden novalidate>
          <label for="verification-code">Verification code</label>
          <input id="verification-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-describedby="code-error">
          <span id="code-error" class="field-error"></span>
          <div class="button-row">
            <button type="button" class="secondary-button" data-mfa-back>Back</button>
            <button type="submit" class="primary-button">Verify</button>
          </div>
        </form>
        <p class="login-support">Need help? <a href="mailto:info@gradientmgmt.com">Contact Gradient</a></p>
      </div>
    </section>
  </main>
  <script src="auth-client.js"></script>
  <script src="portal-login.js"></script>
</body>
```

Fill the credential form with persistent labels, `autocomplete="email"`, `autocomplete="current-password"`, show-password button, remember-me checkbox, field error elements, forgot-password button, and submit button. Fill the hidden MFA form with a six-digit code input, back button, and verify button.

- [ ] **Step 4: Implement local form behavior through the adapter**

In `portal-login.js`, bind the form events, map `result.fields` to `aria-invalid` plus error text, clear the password input immediately after `signIn` resolves, reveal `#mfa-form` only for `mfa_required`, and navigate with `window.location.assign("portal.html")` for `authenticated`. Implement local show-password and forgot-password status states; never access web storage or make a network request.

- [ ] **Step 5: Add responsive sign-in styles**

Extend `portal.css` with a two-column desktop layout, Navy artwork panel, Eggshell form panel, clear focus/validation states, and a single-column layout under `760px`. Use the official topographic file as a low-opacity decorative layer and hide nonessential artwork under reduced motion/small screens.

- [ ] **Step 6: Run login and auth tests**

Run: `node --test tests/site-contracts.test.mjs tests/auth-client.test.mjs`

Expected: all current subtests pass.

- [ ] **Step 7: Commit the sign-in experience**

```bash
git add portal-login.html portal-login.js portal.css tests/site-contracts.test.mjs
git commit -m "feat: build investor sign-in experience"
```

### Task 5: Investor Dashboard and Local Interactions

**Files:**
- Create: `portal.html`
- Create: `portal.js`
- Modify: `portal.css`
- Modify: `tests/site-contracts.test.mjs`

**Interfaces:**
- Consumes: `window.GradientAuth.getSession()` and `signOut()`, portal design tokens, brand assets.
- Produces: `[data-portal-nav]`, `[data-panel]`, `[data-document-filter]`, `[data-document-row]`, `[data-profile-menu]`, `[data-sign-out]`, and local status announcements.

- [ ] **Step 1: Add failing dashboard contract tests**

Append:

```js
test("dashboard exposes required landmarks and fictional data surfaces", async () => {
  const html = await source("portal.html");
  assert.match(html, /<aside[^>]*aria-label="Portal navigation"/);
  assert.match(html, /<main[^>]*id="portal-main"/);
  assert.match(html, /data-panel="overview"/);
  assert.match(html, /data-panel="investments"/);
  assert.match(html, /data-panel="documents"/);
  assert.match(html, /data-panel="account"/);
  assert.match(html, /<table[\s\S]*<caption/);
  assert.match(html, /data-sign-out/);
});

test("dashboard controller guards access and uses the auth boundary", async () => {
  const js = await source("portal.js");
  assert.match(js, /GradientAuth\.getSession/);
  assert.match(js, /GradientAuth\.signOut/);
  assert.match(js, /portal-login\.html/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|fetch\(/);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test --test-name-pattern="dashboard exposes|dashboard controller" tests/site-contracts.test.mjs`

Expected: failure because the dashboard files do not exist.

- [ ] **Step 3: Build the dashboard document**

Create `portal.html` with:

```html
<body class="portal-shell portal-app">
  <div class="portal-frame">
    <aside class="portal-sidebar" aria-label="Portal navigation">
      <a href="index.html" class="portal-logo"><img src="assets/brand/logo-white.svg" alt="Gradient MGMT"></a>
      <nav>
        <button data-portal-nav="overview" aria-current="page">Overview</button>
        <button data-portal-nav="investments">Investments</button>
        <button data-portal-nav="documents">Documents</button>
        <button data-portal-nav="account">Account</button>
      </nav>
    </aside>
    <div class="portal-workspace">
      <header class="portal-header">
        <button class="mobile-menu-button" data-mobile-menu aria-label="Open navigation">Menu</button>
        <p>Gradient Growth Fund I</p>
        <button data-profile-toggle aria-expanded="false">Jordan Lee</button>
        <div data-profile-menu hidden>
          <button data-portal-nav="account">Account settings</button>
          <button data-sign-out>Sign out</button>
        </div>
      </header>
      <main id="portal-main" tabindex="-1">
        <section data-panel="overview">
          <p class="eyebrow">Portfolio overview</p>
          <h1>Good afternoon, Jordan.</h1>
          <div class="metric-grid"><article><span>Committed capital</span><strong>$5.00M</strong></article></div>
          <figure class="allocation-card">
            <svg role="img" aria-labelledby="allocation-title allocation-desc"></svg>
            <figcaption><strong id="allocation-title">Portfolio allocation</strong><span id="allocation-desc">Allocation across four fictional investments.</span></figcaption>
          </figure>
        </section>
        <section data-panel="investments" hidden>
          <h1>Investments</h1>
          <table><caption>Current portfolio holdings</caption><thead><tr><th scope="col">Company</th><th scope="col">Invested</th><th scope="col">Current value</th></tr></thead><tbody><tr><th scope="row">Northstar Industrial</th><td>$1.20M</td><td>$1.52M</td></tr></tbody></table>
        </section>
        <section data-panel="documents" hidden>
          <h1>Documents</h1>
          <div role="group" aria-label="Filter documents"><button data-document-filter="all" aria-pressed="true">All</button><button data-document-filter="tax">Tax</button><button data-document-filter="reports">Reports</button></div>
          <article data-document-row data-document-type="reports"><h2>Q2 2026 Investor Report</h2><button data-document-action>View document</button></article>
          <div data-document-empty hidden><p>No documents match this filter.</p><button data-document-reset>Show all documents</button></div>
        </section>
        <section data-panel="account" hidden>
          <h1>Account</h1>
          <article><h2>Multi-factor authentication</h2><p>Additional verification will be available when live access launches.</p><button data-mfa-info>Review security setup</button></article>
          <button data-sign-out>Sign out</button>
        </section>
      </main>
    </div>
  </div>
  <div class="portal-toast" role="status" aria-live="polite"></div>
  <script src="auth-client.js"></script>
  <script src="portal.js"></script>
</body>
```

Populate the panels with fictional, internally consistent content:

- Investor: Jordan Lee / Gradient Growth Fund I
- Committed capital: `$5.00M`
- Invested capital: `$3.85M`
- Current value: `$4.62M`
- Distributions: `$640K`
- Investments: fictional Northstar Industrial, Atlas Field Services, Meridian Compliance, and Harbor Systems rows whose totals reconcile with the summary
- Documents: fictional Q2 2026 report, 2025 K-1, capital-account statement, and capital-call notice
- Activity: fictional dates and values consistent with the cards and document list

Include an SVG allocation chart with a text legend, semantic table caption/headers, filter buttons, profile menu, security/MFA-ready card, and mobile menu button.

- [ ] **Step 4: Implement dashboard behavior**

In `portal.js`:

```js
const auth = window.GradientAuth;
if (!auth.getSession().authenticated) {
  window.location.replace("portal-login.html");
} else {
  bootPortal();
}
```

`bootPortal()` will switch visible panels, synchronize `aria-current`, filter document rows, show/reset the empty state, toggle the profile and mobile menus, announce unavailable preview documents in the toast region, show an MFA informational state, and call `auth.signOut()` before returning to login. Escape closes open menus and focus returns to the triggering control.

- [ ] **Step 5: Complete dashboard styling**

Extend `portal.css` with a Navy sidebar, Eggshell workspace, responsive metric grid, allocation chart, investment/document tables, activity timeline, account cards, mobile bottom/overlay navigation, and visible hover/focus/selected states. At `max-width: 920px`, reduce the metric grid; at `max-width: 700px`, stack cards and turn dense table rows into labeled blocks without removing information.

- [ ] **Step 6: Run the complete automated suite**

Run: `node --test tests/*.test.mjs`

Expected: all subtests pass with zero failures.

- [ ] **Step 7: Commit the dashboard**

```bash
git add portal.html portal.js portal.css tests/site-contracts.test.mjs
git commit -m "feat: add mock investor dashboard"
```

### Task 6: End-to-End Browser and Visual Verification

**Files:**
- Modify: Any portal/public file only when verification reveals a concrete defect.
- Test: `tests/*.test.mjs`

**Interfaces:**
- Consumes: Complete static site served on localhost.
- Produces: Verified desktop/mobile demo flow with no console errors.

- [ ] **Step 1: Run the complete automated suite and whitespace check**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass with zero failures.

Run: `git diff --check`

Expected: exit 0.

- [ ] **Step 2: Start or reuse the local static server**

Run: `python3 -m http.server 8000 --bind 127.0.0.1`

Expected: the site is available at `http://127.0.0.1:8000/`.

- [ ] **Step 3: Verify the desktop flow in the browser**

At a representative desktop viewport:

1. Open `/` and confirm the three-item glass pill is balanced.
2. Open About and Contact and confirm both H1 computed sizes are `40px` (`2.5rem`).
3. Open `/portal-login.html`; submit empty and invalid values and confirm labeled inline errors.
4. Submit a valid test email and temporary password; confirm the password field clears and `/portal.html` loads.
5. Exercise every dashboard panel, document filters, profile menu, unavailable-document state, MFA information, and sign-out.
6. Confirm direct `/portal.html` access after sign-out returns to the login screen.
7. Inspect the console for errors or warnings.

- [ ] **Step 4: Verify responsive behavior**

Repeat the key flow at `390x844` and `768x1024`. Confirm no horizontal overflow, clipped controls, overlapping content, inaccessible navigation, or unreadable charts/tables. Verify focus remains visible using keyboard-only navigation.

- [ ] **Step 5: Fix concrete defects test-first**

For any defect, add a narrowly scoped failing assertion to the appropriate existing test, run it to confirm failure, make the minimal HTML/CSS/JavaScript correction, then rerun the focused test and the full suite.

- [ ] **Step 6: Run final verification**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass with zero failures.

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intentional implementation changes remain.

- [ ] **Step 7: Commit any verification fixes**

If Step 5 changed files:

```bash
git add index.html styles.css portal-login.html portal-login.js portal.html portal.js portal.css auth-client.js tests assets/brand
git commit -m "fix: polish investor portal preview"
```

If Step 5 produced no changes, do not create an empty commit.
