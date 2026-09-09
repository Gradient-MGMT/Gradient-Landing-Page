import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  deployStaging,
  promoteProduction,
  verifyDeployment,
} from "../scripts/release/workflow.mjs";

const execFile = promisify(execFileCallback);

async function releaseFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "release-workflow-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await writeFile(join(root, "index.html"), "<!doctype html><title>Gradient</title>");
  await execFile("zip", ["-q", "site.zip", "index.html"], { cwd: root });
  const zipPath = join(root, "site.zip");
  const sha256 = createHash("sha256").update(await readFile(zipPath)).digest("hex");

  return {
    manifest: {
      version: 1,
      appId: "dmm14gzm5vsts",
      region: "us-east-1",
      commit: "0123456789abcdef0123456789abcdef01234567",
      sha256,
      zipPath,
      files: ["index.html"],
      createdAt: "2026-09-09T12:00:00.000Z",
    },
    receiptPath: join(root, "staging-receipt.json"),
  };
}

function recordingAdapter(options = {}) {
  const calls = [];
  const statusQueues = new Map([
    ["staging", [...(options.stagingStatuses ?? ["SUCCEED"])]],
    ["main", [...(options.productionStatuses ?? ["SUCCEED"])]],
  ]);

  return {
    calls,
    createdBranches: [],
    uploaded: [],
    started: [],
    checkedUrls: [],
    checkedUrlRequests: [],
    async getActiveJobId(branch) {
      calls.push(["getActiveJobId", branch]);
      await options.onGetActiveJobId?.(branch);
      return branch === "staging"
        ? (options.stagingActiveJobId ?? "staging-new-job")
        : (options.productionActiveJobId ?? "production-42");
    },
    async createDeployment(branch) {
      calls.push(["createDeployment", branch]);
      this.createdBranches.push(branch);
      return {
        jobId: `${branch}-new-job`,
        zipUploadUrl: `https://upload.example.test/${branch}`,
      };
    },
    async uploadZip(url, path) {
      calls.push(["uploadZip", url, path]);
      const bytes = await readFile(path);
      this.uploaded.push({
        url,
        path,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    },
    async startDeployment(branch, jobId) {
      calls.push(["startDeployment", branch, jobId]);
      this.started.push({ branch, jobId });
    },
    async getJobStatus(branch, jobId) {
      calls.push(["getJobStatus", branch, jobId]);
      const statuses = statusQueues.get(branch);
      return statuses.length > 1 ? statuses.shift() : statuses[0];
    },
    async checkUrl(url, options) {
      calls.push(["checkUrl", url]);
      this.checkedUrls.push(url);
      this.checkedUrlRequests.push({ url, options });
    },
  };
}

function approvedGit() {
  return {
    calls: [],
    async requireCommitInOriginMain(commit) {
      this.calls.push(["requireCommitInOriginMain", commit]);
    },
    async requireLocalMainMatchesOrigin() {
      this.calls.push(["requireLocalMainMatchesOrigin"]);
    },
  };
}

function successfulStagingReceipt(manifest) {
  return {
    version: 1,
    environment: "staging",
    branch: "staging",
    jobId: "staging-new-job",
    commit: manifest.commit,
    sha256: manifest.sha256,
    baselineProductionJobId: "production-42",
    status: "SUCCEED",
    deployedAt: "2026-09-09T12:05:00.000Z",
  };
}

test("staging deployment can target only staging and writes a successful receipt", async (t) => {
  const { manifest, receiptPath } = await releaseFixture(t);
  const adapter = recordingAdapter({ stagingStatuses: ["PENDING", "RUNNING", "SUCCEED"] });

  const receipt = await deployStaging({
    manifest,
    adapter,
    receiptPath,
    pollIntervalMs: 0,
  });

  assert.equal(receipt.branch, "staging");
  assert.equal(receipt.environment, "staging");
  assert.deepEqual(adapter.createdBranches, ["staging"]);
  assert.equal(receipt.sha256, manifest.sha256);
  assert.equal(receipt.baselineProductionJobId, "production-42");
  assert.deepEqual(JSON.parse(await readFile(receiptPath, "utf8")), receipt);
  assert.deepEqual(adapter.checkedUrls, ["https://staging.dmm14gzm5vsts.amplifyapp.com/"]);
  assert.deepEqual(adapter.calls.slice(0, 2), [
    ["getActiveJobId", "main"],
    ["createDeployment", "staging"],
  ]);
});

test("modified artifacts are rejected before any deployment service call", async (t) => {
  const { manifest, receiptPath } = await releaseFixture(t);
  const adapter = recordingAdapter();
  await writeFile(manifest.zipPath, "modified bytes");

  await assert.rejects(
    deployStaging({ manifest, adapter, receiptPath }),
    /artifact checksum mismatch/,
  );
  assert.deepEqual(adapter.calls, []);
});

test("staging uploads verified bytes when the source ZIP is replaced after verification", async (t) => {
  const { manifest, receiptPath } = await releaseFixture(t);
  const adapter = recordingAdapter({
    async onGetActiveJobId() {
      await writeFile(manifest.zipPath, "replacement after verification");
    },
  });

  const receipt = await deployStaging({
    manifest,
    adapter,
    receiptPath,
    pollIntervalMs: 0,
  });

  assert.equal(receipt.sha256, manifest.sha256);
  assert.equal(adapter.uploaded[0].sha256, manifest.sha256);
});

test("failed and cancelled staging jobs are terminal failures", async (t) => {
  for (const status of ["FAILED", "CANCELLED"]) {
    await t.test(status, async (t) => {
      const { manifest, receiptPath } = await releaseFixture(t);
      const adapter = recordingAdapter({ stagingStatuses: [status] });

      await assert.rejects(
        deployStaging({ manifest, adapter, receiptPath, pollIntervalMs: 0 }),
        new RegExp(`staging deployment ${status.toLowerCase()}`),
      );
      await assert.rejects(access(receiptPath));
      assert.deepEqual(adapter.checkedUrls, []);
    });
  }
});

test("staging polling stops with a clear timeout", async (t) => {
  const { manifest, receiptPath } = await releaseFixture(t);
  const adapter = recordingAdapter({ stagingStatuses: ["RUNNING"] });

  await assert.rejects(
    deployStaging({
      manifest,
      adapter,
      receiptPath,
      maxPollAttempts: 2,
      pollIntervalMs: 0,
    }),
    /staging deployment timed out/,
  );
});

test("deployment verification checks the artifact, recorded job, and staging URL", async (t) => {
  const { manifest } = await releaseFixture(t);
  const receipt = successfulStagingReceipt(manifest);
  const adapter = recordingAdapter({ stagingStatuses: ["SUCCEED"] });

  await assert.doesNotReject(verifyDeployment({ manifest, receipt, adapter }));
  assert.deepEqual(adapter.checkedUrls, ["https://staging.dmm14gzm5vsts.amplifyapp.com/"]);
});

test("production promotion requires the exact digest", async (t) => {
  const { manifest } = await releaseFixture(t);
  const receipt = successfulStagingReceipt(manifest);
  const adapter = recordingAdapter({
    stagingActiveJobId: receipt.jobId,
    productionActiveJobId: receipt.baselineProductionJobId,
  });

  await assert.rejects(
    promoteProduction({
      manifest,
      receipt,
      confirmation: "wrong",
      adapter,
      git: approvedGit(),
    }),
    /confirmation digest does not match/,
  );
  assert.deepEqual(adapter.createdBranches, []);
  assert.deepEqual(adapter.calls, []);
});

test("production promotion rejects stale staging and changed production", async (t) => {
  const { manifest } = await releaseFixture(t);
  const receipt = successfulStagingReceipt(manifest);

  const staleStagingAdapter = recordingAdapter({ stagingActiveJobId: "staging-newer-job" });
  await assert.rejects(
    promoteProduction({
      manifest,
      receipt,
      confirmation: manifest.sha256,
      adapter: staleStagingAdapter,
      git: approvedGit(),
    }),
    /staging receipt is not the active successful deployment/,
  );
  assert.deepEqual(staleStagingAdapter.createdBranches, []);

  const changedProductionAdapter = recordingAdapter({
    stagingActiveJobId: receipt.jobId,
    productionActiveJobId: "production-43",
  });
  await assert.rejects(
    promoteProduction({
      manifest,
      receipt,
      confirmation: manifest.sha256,
      adapter: changedProductionAdapter,
      git: approvedGit(),
    }),
    /production changed during review/,
  );
  assert.deepEqual(changedProductionAdapter.createdBranches, []);
});

test("production promotion rejects a commit absent from origin/main", async (t) => {
  const { manifest } = await releaseFixture(t);
  const receipt = successfulStagingReceipt(manifest);
  const adapter = recordingAdapter();
  const git = approvedGit();
  git.requireCommitInOriginMain = async () => {
    throw new Error("commit is not present in origin/main");
  };

  await assert.rejects(
    promoteProduction({ manifest, receipt, confirmation: manifest.sha256, adapter, git }),
    /commit is not present in origin\/main/,
  );
  assert.deepEqual(adapter.createdBranches, []);
});

test("production promotion rejects local main differing from origin/main", async (t) => {
  const { manifest } = await releaseFixture(t);
  const receipt = successfulStagingReceipt(manifest);
  const adapter = recordingAdapter();
  const git = approvedGit();
  git.requireLocalMainMatchesOrigin = async () => {
    throw new Error("local main differs from origin/main");
  };

  await assert.rejects(
    promoteProduction({ manifest, receipt, confirmation: manifest.sha256, adapter, git }),
    /local main differs from origin\/main/,
  );
  assert.deepEqual(adapter.createdBranches, []);
});

test("production promotion uploads the staged bytes only after every gate", async (t) => {
  const { manifest } = await releaseFixture(t);
  const receipt = successfulStagingReceipt(manifest);
  const adapter = recordingAdapter();
  const git = approvedGit();

  const productionReceipt = await promoteProduction({
    manifest,
    receipt,
    confirmation: manifest.sha256,
    adapter,
    git,
    pollIntervalMs: 0,
  });

  assert.deepEqual(adapter.createdBranches, ["main"]);
  assert.equal(adapter.uploaded[0].url, "https://upload.example.test/main");
  assert.equal(adapter.uploaded[0].sha256, manifest.sha256);
  assert.deepEqual(adapter.checkedUrls, [
    "https://gradientmgmt.com/",
    "https://www.gradientmgmt.com/",
  ]);
  assert.deepEqual(adapter.checkedUrlRequests, [
    { url: "https://gradientmgmt.com/", options: undefined },
    {
      url: "https://www.gradientmgmt.com/",
      options: { expectedRedirectUrl: "https://gradientmgmt.com/" },
    },
  ]);
  assert.deepEqual(git.calls, [
    ["requireCommitInOriginMain", manifest.commit],
    ["requireLocalMainMatchesOrigin"],
  ]);
  assert.equal(productionReceipt.environment, "production");
  assert.equal(productionReceipt.branch, "main");
  assert.equal(productionReceipt.sha256, manifest.sha256);
  assert.equal(productionReceipt.status, "SUCCEED");
  assert.ok(!Object.hasOwn(productionReceipt, "baselineProductionJobId"));
});

test("production uploads verified bytes when the source ZIP is replaced during gates", async (t) => {
  const { manifest } = await releaseFixture(t);
  const receipt = successfulStagingReceipt(manifest);
  let replaced = false;
  const adapter = recordingAdapter({
    async onGetActiveJobId() {
      if (!replaced) {
        replaced = true;
        await writeFile(manifest.zipPath, "replacement during promotion gates");
      }
    },
  });

  const productionReceipt = await promoteProduction({
    manifest,
    receipt,
    confirmation: manifest.sha256,
    adapter,
    git: approvedGit(),
    pollIntervalMs: 0,
  });

  assert.equal(productionReceipt.sha256, manifest.sha256);
  assert.equal(adapter.uploaded[0].sha256, manifest.sha256);
});
