import { randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { verifyArtifact } from "./artifact.mjs";
import { RELEASE } from "./config.mjs";

const TERMINAL_FAILURES = new Set(["FAILED", "CANCELLED"]);
const REQUIRED_PUBLIC_PATHS = ["", "about", "contact", "robots.txt", "sitemap.xml"];

function delay(milliseconds) {
  if (milliseconds === 0) return Promise.resolve();
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForSuccess({
  adapter,
  branch,
  jobId,
  environment,
  maxPollAttempts,
  pollIntervalMs,
}) {
  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const status = await adapter.getJobStatus(branch, jobId);
    if (status === "SUCCEED") return status;
    if (TERMINAL_FAILURES.has(status)) {
      throw new Error(`${environment} deployment ${status.toLowerCase()}`);
    }
    if (attempt + 1 < maxPollAttempts) await delay(pollIntervalMs);
  }

  throw new Error(`${environment} deployment timed out`);
}

async function writeJsonAtomic(path, value) {
  const target = resolve(path);
  const directory = dirname(target);
  const temporary = resolve(
    directory,
    `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  );

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function assertReceiptMatchesManifest(manifest, receipt) {
  if (
    receipt.version !== 1 ||
    receipt.environment !== "staging" ||
    receipt.branch !== RELEASE.stagingBranch
  ) {
    throw new Error("staging receipt is invalid");
  }
  if (receipt.commit !== manifest.commit || receipt.sha256 !== manifest.sha256) {
    throw new Error("staging receipt does not match artifact");
  }
}

function urlChecksForBranch(branch) {
  if (branch === RELEASE.stagingBranch) {
    return REQUIRED_PUBLIC_PATHS.map((path) => ({
      url: new URL(path, RELEASE.stagingUrl).href,
    }));
  }
  if (branch === RELEASE.productionBranch) {
    const [apexUrl, wwwUrl] = RELEASE.productionUrls;
    return [
      ...REQUIRED_PUBLIC_PATHS.map((path) => ({
        url: new URL(path, apexUrl).href,
      })),
      { url: wwwUrl, options: { expectedRedirectUrl: apexUrl } },
    ];
  }
  throw new Error(`unsupported deployment branch: ${branch}`);
}

async function checkDeploymentUrls(adapter, branch) {
  for (const check of urlChecksForBranch(branch)) {
    await adapter.checkUrl(check.url, check.options);
  }
}

async function withVerifiedArtifactSnapshot(manifest, operation) {
  const snapshotRoot = await mkdtemp(join(tmpdir(), "gradient-release-snapshot-"));
  const snapshotPath = join(snapshotRoot, "site.zip");
  try {
    await copyFile(resolve(manifest.zipPath), snapshotPath);
    await chmod(snapshotPath, 0o400);
    const snapshotManifest = { ...manifest, zipPath: snapshotPath };
    await verifyArtifact(snapshotManifest);
    return await operation(snapshotManifest);
  } finally {
    await rm(snapshotRoot, { recursive: true, force: true });
  }
}

export async function deployStaging({
  manifest,
  adapter,
  receiptPath,
  maxPollAttempts = 120,
  pollIntervalMs = 5_000,
}) {
  return withVerifiedArtifactSnapshot(manifest, async (snapshotManifest) => {
    const baselineProductionJobId = await adapter.getActiveJobId(RELEASE.productionBranch);
    const deployment = await adapter.createDeployment(RELEASE.stagingBranch);
    await adapter.uploadZip(deployment.zipUploadUrl, snapshotManifest.zipPath);
    await verifyArtifact(snapshotManifest);
    await adapter.startDeployment(RELEASE.stagingBranch, deployment.jobId);
    const status = await waitForSuccess({
      adapter,
      branch: RELEASE.stagingBranch,
      jobId: deployment.jobId,
      environment: "staging",
      maxPollAttempts,
      pollIntervalMs,
    });
    await checkDeploymentUrls(adapter, RELEASE.stagingBranch);

    const receipt = {
      version: 1,
      environment: "staging",
      branch: RELEASE.stagingBranch,
      jobId: deployment.jobId,
      commit: manifest.commit,
      sha256: manifest.sha256,
      baselineProductionJobId,
      status,
      deployedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(receiptPath, receipt);
    return receipt;
  });
}

export async function verifyDeployment({ manifest, receipt, adapter }) {
  await verifyArtifact(manifest);
  if (receipt.commit !== manifest.commit || receipt.sha256 !== manifest.sha256) {
    throw new Error("deployment receipt does not match artifact");
  }
  if (receipt.status !== "SUCCEED") {
    throw new Error("deployment receipt is not successful");
  }
  if (await adapter.getActiveJobId(receipt.branch) !== receipt.jobId) {
    throw new Error("deployment receipt is not the active branch deployment");
  }
  const status = await adapter.getJobStatus(receipt.branch, receipt.jobId);
  if (status !== "SUCCEED") {
    throw new Error("recorded deployment is not successful");
  }
  await checkDeploymentUrls(adapter, receipt.branch);
  return true;
}

export async function promoteProduction({
  manifest,
  receipt,
  confirmation,
  adapter,
  git,
  maxPollAttempts = 120,
  pollIntervalMs = 5_000,
}) {
  if (confirmation !== manifest.sha256) {
    throw new Error("confirmation digest does not match");
  }
  return withVerifiedArtifactSnapshot(manifest, async (snapshotManifest) => {
    assertReceiptMatchesManifest(manifest, receipt);
    if (receipt.status !== "SUCCEED") {
      throw new Error("staging deployment did not succeed");
    }
    if (await adapter.getActiveJobId(RELEASE.stagingBranch) !== receipt.jobId) {
      throw new Error("staging receipt is not the active successful deployment");
    }
    if (await adapter.getActiveJobId(RELEASE.productionBranch) !== receipt.baselineProductionJobId) {
      throw new Error("production changed during review");
    }
    await git.requireCommitInOriginMain(manifest.commit);
    await git.requireLocalMainMatchesOrigin();

    const deployment = await adapter.createDeployment(RELEASE.productionBranch);
    await adapter.uploadZip(deployment.zipUploadUrl, snapshotManifest.zipPath);
    await verifyArtifact(snapshotManifest);
    await adapter.startDeployment(RELEASE.productionBranch, deployment.jobId);
    const status = await waitForSuccess({
      adapter,
      branch: RELEASE.productionBranch,
      jobId: deployment.jobId,
      environment: "production",
      maxPollAttempts,
      pollIntervalMs,
    });
    await checkDeploymentUrls(adapter, RELEASE.productionBranch);

    return {
      version: 1,
      environment: "production",
      branch: RELEASE.productionBranch,
      jobId: deployment.jobId,
      commit: manifest.commit,
      sha256: manifest.sha256,
      status,
      deployedAt: new Date().toISOString(),
    };
  });
}
