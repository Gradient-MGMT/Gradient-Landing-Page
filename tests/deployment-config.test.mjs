import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { runCli } from "../scripts/amplify-release.mjs";

const execFile = promisify(execFileCallback);
const root = new URL("../", import.meta.url);

test("Amplify publishes only the static site surface", async () => {
  const buildSpec = await readFile(new URL("../amplify.yml", import.meta.url), "utf8");

  assert.match(buildSpec, /baseDirectory:\s*\./);
  assert.match(buildSpec, /- '\*\.html'/);
  assert.match(buildSpec, /- '\*\.css'/);
  assert.match(buildSpec, /- '\*\.js'/);
  assert.match(buildSpec, /- 'assets\/\*\*\/\*'/);
  assert.doesNotMatch(buildSpec, /- '\*\*\/\*'/);
  assert.doesNotMatch(buildSpec, /docs\/|tests\//);
});

test("deployment runbook preserves DNS and gates the GoDaddy cutover", async () => {
  const runbook = await readFile(
    new URL("../docs/deployment/aws-amplify.md", import.meta.url),
    "utf8",
  );

  for (const requiredText of [
    "GRA-415",
    "GRA-416",
    "MX",
    "SPF",
    "DKIM",
    "DMARC",
    "Do not use the mock investor portal as a production authentication system",
  ]) {
    assert.ok(runbook.includes(requiredText), `missing runbook guidance: ${requiredText}`);
  }
});

test("release CLI rejects every command shape outside the four explicit operations", async () => {
  const cliPath = fileURLToPath(new URL("../scripts/amplify-release.mjs", import.meta.url));
  for (const args of [
    [],
    ["unknown"],
    ["deploy-staging"],
    ["verify", "manifest.json"],
    ["promote", "manifest.json", "receipt.json"],
    ["package", "--branch=staging"],
  ]) {
    await assert.rejects(
      execFile(process.execPath, [cliPath, ...args], { cwd: root }),
      (error) => {
        assert.notEqual(error.code, 0);
        assert.match(error.stderr, /Usage:/);
        assert.match(error.stderr, /package/);
        assert.match(error.stderr, /deploy-staging <manifest>/);
        assert.match(error.stderr, /verify <manifest> <receipt>/);
        assert.match(
          error.stderr,
          /promote <manifest> <receipt> --confirm-production=<sha256>/,
        );
        assert.doesNotMatch(error.stderr, /--branch/);
        return true;
      },
    );
  }
});

test("package tests the tree, creates a baseline-free manifest, and reports production visibility", async () => {
  const calls = [];
  const output = [];
  const release = {
    manifest: {
      commit: "0123456789abcdef0123456789abcdef01234567",
      sha256: "a".repeat(64),
    },
    manifestPath: "/tmp/release/manifest.json",
    zipPath: "/tmp/release/site.zip",
  };

  await runCli(["package"], {
    runTests: async () => calls.push("tests"),
    createReleaseArtifact: async (options) => {
      calls.push(["package", options]);
      return release;
    },
    createAmplifyAdapter: () => ({
      async getActiveJobId(branch) {
        calls.push(["active-job", branch]);
        return "production-42";
      },
    }),
    log: (line) => output.push(line),
  });

  assert.deepEqual(calls.map((call) => Array.isArray(call) ? call[0] : call), [
    "tests",
    "package",
    "active-job",
  ]);
  assert.deepEqual(Object.keys(calls[1][1]), ["runTests"]);
  assert.equal(typeof calls[1][1].runTests, "function");
  assert.ok(!Object.hasOwn(calls[1][1], "baselineProductionJobId"));
  assert.deepEqual(output, [
    "Manifest: /tmp/release/manifest.json",
    "ZIP: /tmp/release/site.zip",
    `Commit: ${release.manifest.commit}`,
    `SHA-256: ${release.manifest.sha256}`,
    "Active production job ID: production-42",
  ]);
});

test("receipt and manifest mismatch is rejected before verification calls external boundaries", async () => {
  const manifest = {
    version: 1,
    appId: "dmm14gzm5vsts",
    region: "us-east-1",
    commit: "0123456789abcdef0123456789abcdef01234567",
    sha256: "a".repeat(64),
    zipPath: "/tmp/release/site.zip",
    files: ["index.html"],
    createdAt: "2026-09-09T12:00:00.000Z",
  };
  const receipt = {
    version: 1,
    environment: "staging",
    branch: "staging",
    jobId: "staging-42",
    commit: "fedcba9876543210fedcba9876543210fedcba98",
    sha256: manifest.sha256,
    baselineProductionJobId: "production-41",
    status: "SUCCEED",
    deployedAt: "2026-09-09T12:05:00.000Z",
  };
  let workflowCalled = false;
  let adapterCreated = false;

  await assert.rejects(
    runCli(["verify", "manifest.json", "receipt.json"], {
      readManifest: async () => manifest,
      readReceipt: async () => receipt,
      createAmplifyAdapter: () => {
        adapterCreated = true;
        return {};
      },
      verifyDeployment: async () => {
        workflowCalled = true;
      },
      log: () => {},
    }),
    /receipt does not match manifest/,
  );
  assert.equal(adapterCreated, false);
  assert.equal(workflowCalled, false);
});

test("invalid JSON is reported without echoing sensitive input", async () => {
  let workflowCalled = false;

  await assert.rejects(
    runCli(["verify", "manifest.json", "receipt.json"], {
      readManifest: async () => ({
        version: 1,
        appId: "dmm14gzm5vsts",
        region: "us-east-1",
        commit: "0123456789abcdef0123456789abcdef01234567",
        sha256: "a".repeat(64),
        zipPath: "/tmp/release/site.zip",
        files: ["index.html"],
        createdAt: "2026-09-09T12:00:00.000Z",
      }),
      readReceipt: async () => {
        throw new SyntaxError("Unexpected token near authentication=secret-value");
      },
      verifyDeployment: async () => {
        workflowCalled = true;
      },
      log: () => {},
    }),
    (error) => {
      assert.match(error.message, /receipt JSON is invalid/);
      assert.doesNotMatch(error.message, /secret-value/);
      return true;
    },
  );
  assert.equal(workflowCalled, false);
});

test("runbook documents the manual staging-first release gate", async () => {
  const runbook = await readFile(
    new URL("../docs/deployment/aws-amplify.md", import.meta.url),
    "utf8",
  );

  for (const required of [
    "dmm14gzm5vsts",
    "`staging`",
    "`main`",
    "https://staging.dmm14gzm5vsts.amplifyapp.com",
    "same ZIP",
    "explicit approval",
    "reject every sign-in",
    "known-good production artifact",
    "main already serves the current feature revision",
  ]) {
    assert.ok(runbook.includes(required), `missing: ${required}`);
  }
  assert.doesNotMatch(runbook, /enable automatic deployments for `main`/);
  assert.doesNotMatch(runbook, /mock login redirects to the investor portal/);
});
