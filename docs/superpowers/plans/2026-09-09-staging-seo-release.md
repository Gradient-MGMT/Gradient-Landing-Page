# Staging-First SEO Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public AWS Amplify staging environment, prevent unreviewed production deployment, and prepare the public marketing pages for Google discovery.

**Architecture:** Keep the existing manual Amplify app and add a `staging` branch with no custom domain. Build one checksum-addressed static ZIP, deploy it to staging, record the successful job, and require an explicit digest plus Git/AWS state checks before uploading those same bytes to `main`. SEO metadata, canonical URLs, sitemap discovery, and portal exclusion live in the static artifact; Search Console setup happens only after an approved production promotion.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-ins and `node:test`, Git, AWS CLI v2, AWS Amplify Hosting manual deployments, `curl`.

**Spec:** `docs/superpowers/specs/2026-09-09-staging-seo-release-design.md`

## Global Constraints

- The staging URL is public and contains no real credentials, investor information, statements, tax documents, or production authentication.
- `gradientmgmt.com` and `www.gradientmgmt.com` remain associated only with Amplify branch `main`.
- No command combines staging deployment and production promotion.
- A production promotion requires explicit user approval of the staged artifact.
- Production receives the exact ZIP bytes reviewed on staging.
- Git merges do not deploy automatically; the Amplify app remains manual.
- App ID is `dmm14gzm5vsts`, region is `us-east-1`, staging branch is `staging`, and production branch is `main`.
- Do not change GoDaddy registration, Route 53 delegation, MX, SPF, DKIM, DMARC, or other service records.
- Do not change the visible homepage composition or add unapproved visible marketing copy.

## File structure

- `robots.txt`: Production crawler policy and sitemap discovery.
- `sitemap.xml`: Canonical marketing-page URLs only.
- `scripts/release/config.mjs`: Immutable release constants and public artifact inclusion rules.
- `scripts/release/artifact.mjs`: Git validation, ZIP creation, hashing, manifest parsing, and archive validation.
- `scripts/release/workflow.mjs`: Environment-independent staging and production gate logic.
- `scripts/release/amplify-adapter.mjs`: AWS CLI and `curl` process boundary.
- `scripts/amplify-release.mjs`: Small command-line entry point for package, staging deploy, verification, and promotion.
- `tests/seo.test.mjs`: Static SEO contracts.
- `tests/release-artifact.test.mjs`: Archive and manifest contracts.
- `tests/release-workflow.test.mjs`: Staging-only default and production promotion gates.
- `tests/deployment-config.test.mjs`: Build surface and runbook assertions.
- `docs/deployment/aws-amplify.md`: Human staging-first operating procedure and rollback instructions.
- `.gitignore`: Excludes local release artifacts and receipts.

---

### Task 1: Add crawl discovery, canonical metadata, and portal exclusion

**Files:**
- Create: `robots.txt`
- Create: `sitemap.xml`
- Create: `tests/seo.test.mjs`
- Modify: `index.html`
- Modify: `about.html`
- Modify: `contact.html`
- Modify: `mission.html`
- Modify: `team.html`
- Modify: `portal-login.html`
- Modify: `portal.html`
- Modify: `styles.css`
- Modify: `amplify.yml`

**Interfaces:**
- Produces: canonical public URLs `/`, `/about`, and `/contact`; deployable `robots.txt` and `sitemap.xml`; machine-readable `WebSite` and `Organization` homepage entities.
- Consumes: existing static page structure and `assets/favicon.png` dimensions of 512×512.

- [ ] **Step 1: Write the failing SEO contract tests**

Create `tests/seo.test.mjs` using Node built-ins. The test must read real project files and assert behavior rather than snapshots:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("crawler files advertise only canonical marketing pages", async () => {
  const [robots, sitemap] = await Promise.all([read("robots.txt"), read("sitemap.xml")]);
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/gradientmgmt\.com\/sitemap\.xml$/m);

  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(urls, [
    "https://gradientmgmt.com/",
    "https://gradientmgmt.com/about",
    "https://gradientmgmt.com/contact",
  ]);
});

test("marketing pages declare unique production canonicals", async () => {
  const pages = new Map([
    ["index.html", "https://gradientmgmt.com/"],
    ["about.html", "https://gradientmgmt.com/about"],
    ["contact.html", "https://gradientmgmt.com/contact"],
  ]);

  const descriptions = new Set();
  for (const [path, canonical] of pages) {
    const html = await read(path);
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}"`));
    assert.match(html, new RegExp(`<meta property="og:url" content="${canonical}"`));
    const description = html.match(/<meta name="description" content="([^"]+)"/u)?.[1];
    assert.ok(description?.length > 40, `${path} needs a descriptive summary`);
    descriptions.add(description);
  }
  assert.equal(descriptions.size, pages.size);
});

test("homepage identifies Gradient MGMT without relying on image alt text", async () => {
  const html = await read("index.html");
  assert.match(html, /<span class="visually-hidden">Gradient MGMT<\/span>/);
  assert.match(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  const graph = JSON.parse(json)["@graph"];
  assert.deepEqual(graph.map((entry) => entry["@type"]), ["WebSite", "Organization"]);
});

test("mock investor pages opt out of search results", async () => {
  for (const path of ["portal-login.html", "portal.html"]) {
    assert.match(await read(path), /<meta name="robots" content="noindex, nofollow"/);
  }
});
```

- [ ] **Step 2: Run the SEO tests and verify the intended failure**

Run:

```bash
node --test tests/seo.test.mjs
```

Expected: FAIL because `robots.txt`, `sitemap.xml`, canonical tags, structured data, and investor-page robots metadata do not exist.

- [ ] **Step 3: Add crawler files and the public metadata**

Create `robots.txt` exactly as specified in the design. Create an XML sitemap with the three production URLs in the tested order.

Use these page titles and descriptions:

```html
<!-- index.html -->
<title>Gradient MGMT | AI-Native Private Investment Firm</title>
<meta name="description" content="Gradient MGMT is an AI-native private investment firm partnering with established service businesses to build durable, technology-enabled growth." />

<!-- about.html -->
<title>About Gradient MGMT | Private Investment Firm</title>
<meta name="description" content="Learn how Gradient MGMT combines investors, operators, and AI engineers to partner with established service businesses." />

<!-- contact.html -->
<title>Contact Gradient MGMT</title>
<meta name="description" content="Contact Gradient MGMT to discuss investment and operating partnerships in established service businesses." />
```

Add each page’s absolute canonical and matching `og:url`. Replace GitHub-hosted social images with `https://gradientmgmt.com/assets/share.png`. Change public navigation links to `/`, `/about`, and `/contact` while leaving `/portal-login.html` unchanged.

In the homepage H1, use an empty decorative image alternative and real hidden text:

```html
<h1 class="lockup">
  <img src="assets/logo.svg" alt="" aria-hidden="true" />
  <span class="visually-hidden">Gradient MGMT</span>
</h1>
```

Add a standard visually-hidden utility without changing layout:

```css
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

Add homepage JSON-LD with a `WebSite` node and an `Organization` node. Use only `Gradient MGMT`, `https://gradientmgmt.com/`, `info@gradientmgmt.com`, and the verified 512×512 `https://gradientmgmt.com/assets/favicon.png` logo. Add `noindex, nofollow` to the two investor pages and `noindex, follow` plus absolute canonicals to `mission.html` and `team.html`.

Add `robots.txt` and `sitemap.xml` to the explicit artifact list in `amplify.yml`. Increment the public stylesheet cache query once because `styles.css` changes.

- [ ] **Step 4: Run targeted and full validation**

Run:

```bash
node --test tests/seo.test.mjs
node --test tests/*.test.mjs
for file in $(rg --files -g '*.js'); do node --check "$file" || exit 1; done
git diff --check
```

Expected: every test passes, JavaScript syntax checks are silent, and `git diff --check` prints nothing.

- [ ] **Step 5: Commit the SEO artifact changes**

```bash
git add robots.txt sitemap.xml tests/seo.test.mjs index.html about.html contact.html mission.html team.html portal-login.html portal.html styles.css amplify.yml
git commit -m "feat: add production search metadata"
```

---

### Task 2: Build and validate checksum-addressed release artifacts

**Files:**
- Create: `scripts/release/config.mjs`
- Create: `scripts/release/artifact.mjs`
- Create: `tests/release-artifact.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `collectPublicFiles(cwd, commit)`, `createReleaseArtifact(options)`, `readManifest(path)`, and `verifyArtifact(manifest)`.
- Manifest shape: `{version: 1, appId, region, commit, sha256, zipPath, files, baselineProductionJobId, createdAt}`.
- Consumes: Git-tracked files, Node built-ins, and immutable constants from `config.mjs`.

- [ ] **Step 1: Write failing artifact tests**

Create a temporary Git repository in `tests/release-artifact.test.mjs`. Commit representative public and internal files, call the real artifact functions, and inspect the resulting ZIP using `unzip -Z1`:

```js
test("release artifact contains only the configured public surface", async (t) => {
  const fixture = await makeGitFixture(t, {
    "index.html": "home",
    "about.html": "about",
    "styles.css": "body{}",
    "site.js": "export {};",
    "robots.txt": "User-agent: *",
    "sitemap.xml": "<urlset/>",
    "assets/logo.svg": "<svg/>",
    "tests/private.test.mjs": "throw new Error('exclude')",
    "docs/internal.md": "exclude",
  });

  const release = await createReleaseArtifact({
    cwd: fixture,
    outputRoot: join(fixture, ".release"),
    appId: "dtest",
    region: "us-east-1",
    baselineProductionJobId: "42",
    runTests: async () => {},
  });

  assert.deepEqual(release.manifest.files, [
    "about.html",
    "assets/logo.svg",
    "index.html",
    "robots.txt",
    "site.js",
    "sitemap.xml",
    "styles.css",
  ]);
  assert.equal(await sha256File(release.zipPath), release.manifest.sha256);
});

test("packaging refuses a dirty worktree", async (t) => {
  const fixture = await makeGitFixture(t, { "index.html": "home" });
  await writeFile(join(fixture, "index.html"), "changed");
  await assert.rejects(
    createReleaseArtifact({ cwd: fixture, runTests: async () => {} }),
    /worktree must be clean/,
  );
});
```

The fixture helper must initialize Git with local test-only user name/email and register cleanup with `t.after`.

- [ ] **Step 2: Run the artifact tests and verify the intended failure**

```bash
node --test tests/release-artifact.test.mjs
```

Expected: FAIL because the release modules do not exist.

- [ ] **Step 3: Implement immutable configuration and artifact creation**

In `config.mjs`, export exact constants:

```js
export const RELEASE = Object.freeze({
  appId: "dmm14gzm5vsts",
  region: "us-east-1",
  profile: "gradient-admin",
  stagingBranch: "staging",
  productionBranch: "main",
  stagingUrl: "https://staging.dmm14gzm5vsts.amplifyapp.com/",
  productionUrls: ["https://gradientmgmt.com/", "https://www.gradientmgmt.com/"],
});

export function isPublicFile(path) {
  return path === "robots.txt" ||
    path === "sitemap.xml" ||
    path.startsWith("assets/") ||
    (!path.includes("/") && /\.(?:html|css|js)$/.test(path));
}
```

In `artifact.mjs`, use `execFile` rather than shell command strings. Check `git status --porcelain`, resolve the full commit SHA, list tracked files with `git ls-tree -r --name-only`, filter through `isPublicFile`, require `index.html`, call the supplied `runTests`, and pass the explicit sorted file list to `git archive --format=zip`.

Hash the finished ZIP using `createHash("sha256")`. Write a deterministic two-space-indented `manifest.json` beside it. Resolve stored paths to absolute paths so later commands do not depend on the caller’s working directory. `verifyArtifact` must recompute the digest and compare the actual ZIP entries with the manifest’s sorted file list.

Add `.release/` to `.gitignore`.

- [ ] **Step 4: Run artifact and regression tests**

```bash
node --test tests/release-artifact.test.mjs
node --test tests/*.test.mjs
git diff --check
```

Expected: all pass.

- [ ] **Step 5: Commit the artifact builder**

```bash
git add .gitignore scripts/release/config.mjs scripts/release/artifact.mjs tests/release-artifact.test.mjs
git commit -m "feat: build verified Amplify release artifacts"
```

---

### Task 3: Enforce staging-first deployment and production promotion gates

**Files:**
- Create: `scripts/release/workflow.mjs`
- Create: `scripts/release/amplify-adapter.mjs`
- Create: `tests/release-workflow.test.mjs`

**Interfaces:**
- Produces: `deployStaging({manifest, adapter, receiptPath})`, `verifyDeployment({manifest, receipt, adapter})`, and `promoteProduction({manifest, receipt, confirmation, adapter, git})`.
- Adapter contract: `getActiveJobId(branch)`, `createDeployment(branch)`, `uploadZip(url, path)`, `startDeployment(branch, jobId)`, `getJobStatus(branch, jobId)`, and `checkUrl(url)`.
- Receipt shape: `{version: 1, environment, branch, jobId, commit, sha256, baselineProductionJobId, status, deployedAt}`.

- [ ] **Step 1: Write failing workflow tests with an in-memory external-service adapter**

Use a recording adapter because AWS is an external boundary. Exercise the real orchestration and gate functions:

```js
test("staging deployment can target only staging and writes a successful receipt", async () => {
  const adapter = recordingAdapter({ stagingStatus: "SUCCEED" });
  const receipt = await deployStaging({ manifest, adapter, receiptPath });
  assert.equal(receipt.branch, "staging");
  assert.deepEqual(adapter.createdBranches, ["staging"]);
  assert.equal(receipt.sha256, manifest.sha256);
});

test("production promotion requires the exact digest", async () => {
  const adapter = recordingAdapter({
    stagingActiveJobId: receipt.jobId,
    productionActiveJobId: receipt.baselineProductionJobId,
  });
  await assert.rejects(
    promoteProduction({ manifest, receipt, confirmation: "wrong", adapter, git: approvedGit }),
    /confirmation digest does not match/,
  );
  assert.deepEqual(adapter.createdBranches, []);
});

test("production promotion rejects stale staging and changed production", async () => {
  await assert.rejects(
    promoteProduction({ manifest, receipt, confirmation: manifest.sha256, adapter: staleStagingAdapter, git: approvedGit }),
    /staging receipt is not the active successful deployment/,
  );
  await assert.rejects(
    promoteProduction({ manifest, receipt, confirmation: manifest.sha256, adapter: changedProductionAdapter, git: approvedGit }),
    /production changed during review/,
  );
});
```

Also test modified artifact rejection, failed/cancelled staging, commit absent from `origin/main`, and local `main` differing from `origin/main`.

- [ ] **Step 2: Run workflow tests and verify the intended failure**

```bash
node --test tests/release-workflow.test.mjs
```

Expected: FAIL because the workflow modules do not exist.

- [ ] **Step 3: Implement environment-independent orchestration**

`deployStaging` must verify the artifact before calling the adapter, capture the current `main` job ID, create a staging deployment, upload, start, poll until `SUCCEED`, verify the staging URL, and atomically write the receipt. Treat `FAILED` and `CANCELLED` as terminal failures and cap polling with a clear timeout error.

`promoteProduction` must perform all gates before `createDeployment("main")`:

```js
if (confirmation !== manifest.sha256) throw new Error("confirmation digest does not match");
await verifyArtifact(manifest);
if (receipt.status !== "SUCCEED") throw new Error("staging deployment did not succeed");
if (await adapter.getActiveJobId("staging") !== receipt.jobId) {
  throw new Error("staging receipt is not the active successful deployment");
}
if (await adapter.getActiveJobId("main") !== receipt.baselineProductionJobId) {
  throw new Error("production changed during review");
}
await git.requireCommitInOriginMain(manifest.commit);
await git.requireLocalMainMatchesOrigin();
```

Only after those checks may it upload the same `manifest.zipPath` bytes to `main` and poll for success.

In `amplify-adapter.mjs`, use `execFile` for AWS commands and a direct `https.request` PUT for the presigned URL so credentials and URLs never enter a shell command. Capture JSON from stdout and never print presigned URLs. Apply the configured AWS profile and region to every AWS call.

- [ ] **Step 4: Run workflow and full tests**

```bash
node --test tests/release-workflow.test.mjs
node --test tests/*.test.mjs
for file in $(rg --files scripts tests -g '*.js' -g '*.mjs'); do node --check "$file" || exit 1; done
git diff --check
```

Expected: all pass.

- [ ] **Step 5: Commit the deployment gates**

```bash
git add scripts/release/workflow.mjs scripts/release/amplify-adapter.mjs tests/release-workflow.test.mjs
git commit -m "feat: gate Amplify production promotion"
```

---

### Task 4: Add the release CLI and align the human runbook

**Files:**
- Create: `scripts/amplify-release.mjs`
- Modify: `docs/deployment/aws-amplify.md`
- Modify: `tests/deployment-config.test.mjs`

**Interfaces:**
- Produces CLI commands: `package`, `deploy-staging <manifest>`, `verify <manifest> <receipt>`, and `promote <manifest> <receipt> --confirm-production=<sha256>`.
- Consumes the modules and manifest/receipt shapes from Tasks 2 and 3.

- [ ] **Step 1: Extend deployment tests before editing the CLI or runbook**

Add assertions that the CLI exposes the four explicit commands, contains no generic `--branch` option, and the runbook includes the actual app, branches, public staging URL, same-artifact rule, approval gate, expected rejected login behavior, and rollback artifact retention. Remove the obsolete expectation that the login reaches the mock dashboard.

```js
test("runbook documents the manual staging-first release gate", async () => {
  const runbook = await readFile(new URL("../docs/deployment/aws-amplify.md", import.meta.url), "utf8");
  for (const required of [
    "dmm14gzm5vsts",
    "https://staging.dmm14gzm5vsts.amplifyapp.com",
    "same ZIP",
    "explicit approval",
    "reject every sign-in",
    "known-good production artifact",
  ]) assert.ok(runbook.includes(required), `missing: ${required}`);
  assert.doesNotMatch(runbook, /enable automatic deployments for `main`/);
});
```

- [ ] **Step 2: Run the deployment tests and verify the intended failure**

```bash
node --test tests/deployment-config.test.mjs
```

Expected: FAIL on the new staging-first assertions.

- [ ] **Step 3: Implement the CLI and rewrite the deployment runbook**

The CLI must print usage and exit nonzero for unknown commands or missing arguments. `package` runs `node --test tests/*.test.mjs`, retrieves the current production job ID, and calls `createReleaseArtifact`. `deploy-staging`, `verify`, and `promote` load and validate the supplied JSON paths before calling workflow functions.

Do not log AWS presigned upload URLs or authentication values. Print only manifest/receipt paths, commit, digest, job ID, status, and the review URL.

Rewrite the runbook’s opening deployment section to match the manual staging-first flow. Preserve the DNS inventory, Route 53, GoDaddy, mail-record, rollback, and future investor-portal safety guidance. State that `main` is already serving the current feature revision and the new gate governs the next change.

- [ ] **Step 4: Validate CLI errors and the full suite**

```bash
node scripts/amplify-release.mjs
node scripts/amplify-release.mjs unknown
node --test tests/*.test.mjs
for file in $(rg --files scripts tests -g '*.js' -g '*.mjs'); do node --check "$file" || exit 1; done
git diff --check
```

Expected: the first two commands exit nonzero with concise usage text; all tests and syntax checks pass.

- [ ] **Step 5: Commit the operational interface**

```bash
git add scripts/amplify-release.mjs docs/deployment/aws-amplify.md tests/deployment-config.test.mjs
git commit -m "docs: establish staging-first release operations"
```

---

### Task 5: Create the public staging branch and deploy the SEO candidate

**Files:**
- No tracked files change.
- Creates ignored local `.release/<commit>/` artifact, manifest, and staging receipt.
- Creates AWS Amplify branch `staging` in app `dmm14gzm5vsts`.

**Interfaces:**
- Produces public review URL `https://staging.dmm14gzm5vsts.amplifyapp.com/` and a successful staging receipt.
- Consumes the clean reviewed commit and the CLI from Task 4.

- [ ] **Step 1: Run all preflight checks**

```bash
git status --short
git fetch origin
node --test tests/*.test.mjs
```

Expected: clean status, successful fetch, and all tests pass.

- [ ] **Step 2: Create the staging branch once**

First run `aws amplify get-branch` and create only when AWS returns `NotFoundException`:

```bash
aws --profile gradient-admin amplify create-branch \
  --region us-east-1 \
  --app-id dmm14gzm5vsts \
  --branch-name staging \
  --description "Public pre-production review" \
  --stage DEVELOPMENT \
  --display-name staging \
  --no-enable-notification \
  --no-enable-auto-build \
  --no-enable-basic-auth \
  --no-enable-performance-mode \
  --no-enable-pull-request-preview \
  --ttl 5 \
  --tags Environment=staging
```

Expected: branch `staging`, `enableBasicAuth: false`, and no custom-domain association.

- [ ] **Step 3: Package and deploy only to staging**

```bash
node scripts/amplify-release.mjs package
node scripts/amplify-release.mjs deploy-staging .release/<full-commit-sha>/manifest.json
```

Use the exact manifest path printed by `package`; do not manually type or abbreviate the commit SHA.

- [ ] **Step 4: Verify the hosted staging candidate**

Run the CLI’s read-only verification and direct endpoint checks:

```bash
node scripts/amplify-release.mjs verify <manifest-path> <staging-receipt-path>
curl -fsS https://staging.dmm14gzm5vsts.amplifyapp.com/robots.txt
curl -fsS https://staging.dmm14gzm5vsts.amplifyapp.com/sitemap.xml
```

Visually verify desktop and 390×844 mobile layouts for Home, About, Contact, and Investor Login. Confirm every login attempt is rejected, `/portal.html` redirects to login, canonical tags point at `https://gradientmgmt.com`, navigation works, and the browser console has no errors.

- [ ] **Step 5: Hand off the staging URL and stop**

Return the public staging URL, commit SHA, artifact digest, and concise verification summary. Do not run `promote` until the user explicitly approves this exact staging receipt.

---

### Task 6: Promote an approved candidate and request Google indexing

**Files:**
- No source changes unless review feedback creates a new candidate, in which case return to Task 1 and restage.
- Modifies AWS Amplify app rewrite rules only at the approved production cutover.
- Adds one Google Search Console TXT record to the existing Route 53 zone after Google supplies the value.

**Interfaces:**
- Consumes the user-approved manifest and staging receipt from Task 5.
- Produces a successful production receipt and Search Console property for `gradientmgmt.com`.

- [ ] **Step 1: Confirm the staged artifact with the user**

Ask for explicit approval naming the staging URL and full SHA-256 digest. If feedback requires any source change, build a new artifact and repeat staging; never reuse the old approval.

- [ ] **Step 2: Merge the approved commit and validate Git state**

Merge through the reviewed pull request, fetch `origin`, and verify the staged commit is an ancestor of `origin/main`. Re-run the full tests. Do not rebuild the ZIP.

- [ ] **Step 3: Add approved canonical redirect rules without disturbing existing rules**

Read the existing app rules, preserve `/portal.html` and the `www` redirect, and add `301` rules for `index.html`, About, Contact, Mission, and Team exactly as specified in the design. Submit the complete resolved rule list in one `update-app` call. Immediately read it back and compare every source, target, and status.

- [ ] **Step 4: Promote the exact approved ZIP**

```bash
node scripts/amplify-release.mjs promote \
  <manifest-path> \
  <staging-receipt-path> \
  --confirm-production=<full-sha256>
```

Expected: all gates pass, the unchanged ZIP deploys to `main`, and both production URLs validate.

- [ ] **Step 5: Verify production SEO and rendering**

Confirm `200` for `/`, `/about`, `/contact`, `/robots.txt`, and `/sitemap.xml`; `301` for `www` and legacy page URLs; `noindex` on investor pages; matching canonical/OG URLs; valid JSON-LD; desktop/mobile rendering; and no console errors.

- [ ] **Step 6: Complete the Search Console owner handoff**

Create a Domain property for `gradientmgmt.com`. Copy Google’s exact verification TXT value into the existing Route 53 zone, leaving all other records untouched. After verification, submit `https://gradientmgmt.com/sitemap.xml`, inspect `/`, `/about`, and `/contact`, and request indexing for each.

- [ ] **Step 7: Record and communicate the release**

Retain the production receipt and known-good artifact. Report the production URL, commit, digest, production job result, redirect checks, and Search Console submission status. Set the expectation that Google crawling may take days to weeks and that indexing or ranking is not guaranteed.
