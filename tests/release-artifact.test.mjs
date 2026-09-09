import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  createReleaseArtifact,
  verifyArtifact,
} from "../scripts/release/artifact.mjs";

const execFile = promisify(execFileCallback);

async function run(command, args, cwd) {
  await execFile(command, args, { cwd });
}

async function makeGitFixture(t, files) {
  const fixture = await mkdtemp(join(tmpdir(), "release-artifact-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));

  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(fixture, path)), { recursive: true });
    await writeFile(join(fixture, path), contents);
  }

  await run("git", ["init"], fixture);
  await run("git", ["config", "user.name", "Release Artifact Test"], fixture);
  await run("git", ["config", "user.email", "release-artifact@example.test"], fixture);
  await run("git", ["add", "--all"], fixture);
  await run("git", ["commit", "-m", "fixture"], fixture);
  return fixture;
}

async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

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
  assert.equal(
    release.zipPath,
    join(fixture, ".release", release.manifest.commit, "site.zip"),
  );
  assert.equal(
    release.manifestPath,
    join(fixture, ".release", release.manifest.commit, "manifest.json"),
  );
  assert.deepEqual(
    (await execFile("unzip", ["-Z1", release.zipPath])).stdout.trim().split("\n")
      .filter((entry) => !entry.endsWith("/")),
    release.manifest.files,
  );
  assert.ok(!Object.hasOwn(release.manifest, "baselineProductionJobId"));
  await assert.doesNotReject(verifyArtifact(release.manifest));
});

test("packaging refuses a dirty worktree", async (t) => {
  const fixture = await makeGitFixture(t, { "index.html": "home" });
  await writeFile(join(fixture, "index.html"), "changed");

  await assert.rejects(
    createReleaseArtifact({ cwd: fixture, runTests: async () => {} }),
    /worktree must be clean/,
  );
});

test("artifact verification rejects a ZIP whose contents no longer match the manifest", async (t) => {
  const fixture = await makeGitFixture(t, { "index.html": "home", "styles.css": "body{}" });
  const release = await createReleaseArtifact({
    cwd: fixture,
    outputRoot: join(fixture, ".release"),
    runTests: async () => {},
  });
  await writeFile(release.zipPath, "not a zip");

  await assert.rejects(verifyArtifact(release.manifest), /checksum mismatch/);
});
