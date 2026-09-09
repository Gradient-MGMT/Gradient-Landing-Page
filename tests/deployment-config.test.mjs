import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { createGitAdapter, runCli } from "../scripts/amplify-release.mjs";

const execFile = promisify(execFileCallback);
const root = new URL("../", import.meta.url);

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

const stagingReceipt = {
  version: 1,
  environment: "staging",
  branch: "staging",
  jobId: "staging-42",
  commit: manifest.commit,
  sha256: manifest.sha256,
  baselineProductionJobId: "production-41",
  status: "SUCCEED",
  deployedAt: "2026-09-09T12:05:00.000Z",
};

const productionReceipt = {
  version: 1,
  environment: "production",
  branch: "main",
  jobId: "production-42",
  commit: manifest.commit,
  sha256: manifest.sha256,
  status: "SUCCEED",
  deployedAt: "2026-09-09T12:10:00.000Z",
};

async function makeGitGateFixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), "release-cli-git-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = async (...args) => execFile("git", args, { cwd });

  await git("init");
  await git("config", "user.name", "Release CLI Test");
  await git("config", "user.email", "release-cli@example.test");
  await writeFile(join(cwd, "index.html"), "first");
  await git("add", "index.html");
  await git("commit", "-m", "main fixture");
  await git("branch", "-M", "main");
  const mainCommit = (await git("rev-parse", "HEAD")).stdout.trim();
  await git("update-ref", "refs/remotes/origin/main", mainCommit);

  await git("checkout", "-b", "feature");
  await writeFile(join(cwd, "index.html"), "second");
  await git("commit", "-am", "feature fixture");
  const featureCommit = (await git("rev-parse", "HEAD")).stdout.trim();
  return { cwd, mainCommit, featureCommit, git };
}

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

test("deploy-staging targets the fixed workflow and writes its receipt beside the manifest", async () => {
  const adapter = { secret: "presigned-upload-url" };
  const output = [];
  let deployment;
  const manifestPath = resolve(".release", manifest.commit, "manifest.json");

  await runCli(["deploy-staging", manifestPath], {
    readManifest: async () => manifest,
    createAmplifyAdapter: () => adapter,
    deployStaging: async (options) => {
      deployment = options;
      return stagingReceipt;
    },
    log: (line) => output.push(line),
  });

  assert.equal(deployment.manifest, manifest);
  assert.equal(deployment.adapter, adapter);
  assert.equal(
    deployment.receiptPath,
    join(dirname(manifestPath), "staging-receipt.json"),
  );
  assert.deepEqual(Object.keys(deployment).sort(), ["adapter", "manifest", "receiptPath"]);
  assert.deepEqual(output, [
    `Receipt: ${deployment.receiptPath}`,
    `Commit: ${manifest.commit}`,
    `SHA-256: ${manifest.sha256}`,
    `Job ID: ${stagingReceipt.jobId}`,
    "Status: SUCCEED",
    "Review URL: https://staging.dmm14gzm5vsts.amplifyapp.com/",
  ]);
  assert.doesNotMatch(output.join("\n"), /presigned-upload-url|authentication/);
});

test("verify passes validated staging inputs to the read-only workflow", async () => {
  const adapter = { secret: "authentication-value" };
  const output = [];
  let verification;

  await runCli(["verify", "manifest.json", "staging-receipt.json"], {
    readManifest: async () => manifest,
    readReceipt: async () => stagingReceipt,
    createAmplifyAdapter: () => adapter,
    verifyDeployment: async (options) => {
      verification = options;
    },
    log: (line) => output.push(line),
  });

  assert.deepEqual(verification, { manifest, receipt: stagingReceipt, adapter });
  assert.deepEqual(output, [
    `Commit: ${manifest.commit}`,
    `SHA-256: ${manifest.sha256}`,
    `Job ID: ${stagingReceipt.jobId}`,
    "Status: SUCCEED",
    "Review URL: https://staging.dmm14gzm5vsts.amplifyapp.com/",
  ]);
  assert.doesNotMatch(output.join("\n"), /authentication-value|presigned/);
});

test("promote passes the confirmation and Git gates then stores a production receipt", async () => {
  const adapter = { secret: "presigned-upload-url" };
  const git = { secret: "authentication-value" };
  const output = [];
  const writes = [];
  let promotion;
  const manifestPath = resolve(".release", manifest.commit, "manifest.json");

  await runCli([
    "promote",
    manifestPath,
    "staging-receipt.json",
    `--confirm-production=${manifest.sha256}`,
  ], {
    readManifest: async () => manifest,
    readReceipt: async () => stagingReceipt,
    createAmplifyAdapter: () => adapter,
    createGitAdapter: () => git,
    promoteProduction: async (options) => {
      promotion = options;
      return productionReceipt;
    },
    writeFile: async (path, contents) => writes.push({ path, contents }),
    log: (line) => output.push(line),
  });

  assert.deepEqual(promotion, {
    manifest,
    receipt: stagingReceipt,
    confirmation: manifest.sha256,
    adapter,
    git,
  });
  const receiptPath = join(dirname(manifestPath), "production-receipt.json");
  assert.deepEqual(writes, [{
    path: receiptPath,
    contents: `${JSON.stringify(productionReceipt, null, 2)}\n`,
  }]);
  assert.deepEqual(output, [
    `Receipt: ${receiptPath}`,
    `Commit: ${manifest.commit}`,
    `SHA-256: ${manifest.sha256}`,
    `Job ID: ${productionReceipt.jobId}`,
    "Status: SUCCEED",
  ]);
  assert.doesNotMatch(output.join("\n"), /authentication-value|presigned-upload-url/);
});

test("Git gate accepts only commits contained in origin main", async (t) => {
  const fixture = await makeGitGateFixture(t);
  const git = createGitAdapter({ cwd: fixture.cwd });

  await assert.doesNotReject(git.requireCommitInOriginMain(fixture.mainCommit));
  await assert.rejects(
    git.requireCommitInOriginMain(fixture.featureCommit),
    /commit is not present in origin\/main/,
  );
});

test("Git gate requires a clean worktree", async (t) => {
  const fixture = await makeGitGateFixture(t);
  const git = createGitAdapter({ cwd: fixture.cwd });

  await assert.doesNotReject(git.requireLocalMainMatchesOrigin());
  await writeFile(join(fixture.cwd, "untracked.txt"), "dirty");
  await assert.rejects(git.requireLocalMainMatchesOrigin(), /worktree is not clean/);
});

test("Git gate requires local main to equal origin main", async (t) => {
  const fixture = await makeGitGateFixture(t);
  const git = createGitAdapter({ cwd: fixture.cwd });

  await fixture.git("branch", "-f", "main", fixture.featureCommit);
  await assert.rejects(
    git.requireLocalMainMatchesOrigin(),
    /local main differs from origin\/main/,
  );
});

test("receipt and manifest mismatch is rejected before verification calls external boundaries", async () => {
  const receipt = {
    ...stagingReceipt,
    commit: "fedcba9876543210fedcba9876543210fedcba98",
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
        ...manifest,
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
  assert.doesNotMatch(runbook, /mock portal still load/);
});
