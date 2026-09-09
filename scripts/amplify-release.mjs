#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { createAmplifyAdapter } from "./release/amplify-adapter.mjs";
import { createReleaseArtifact, readManifest } from "./release/artifact.mjs";
import { RELEASE } from "./release/config.mjs";
import {
  deployStaging,
  promoteProduction,
  verifyDeployment,
} from "./release/workflow.mjs";

const execFile = promisify(execFileCallback);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const USAGE = [
  "Usage:",
  "  node scripts/amplify-release.mjs package",
  "  node scripts/amplify-release.mjs deploy-staging <manifest>",
  "  node scripts/amplify-release.mjs verify <manifest> <receipt>",
  "  node scripts/amplify-release.mjs promote <manifest> <receipt> --confirm-production=<sha256>",
].join("\n");

class UsageError extends Error {}

function requireShape(condition, message) {
  if (!condition) throw new Error(message);
}

function validateManifest(manifest) {
  requireShape(manifest && typeof manifest === "object", "manifest is invalid");
  requireShape(manifest.version === 1, "manifest version is invalid");
  requireShape(manifest.appId === RELEASE.appId, "manifest app ID is invalid");
  requireShape(manifest.region === RELEASE.region, "manifest region is invalid");
  requireShape(/^[0-9a-f]{40}$/iu.test(manifest.commit), "manifest commit is invalid");
  requireShape(/^[0-9a-f]{64}$/iu.test(manifest.sha256), "manifest digest is invalid");
  requireShape(typeof manifest.zipPath === "string" && manifest.zipPath !== "", "manifest ZIP path is invalid");
  requireShape(
    Array.isArray(manifest.files) &&
      manifest.files.length > 0 &&
      manifest.files.every((path) => typeof path === "string" && path !== ""),
    "manifest file list is invalid",
  );
  requireShape(
    typeof manifest.createdAt === "string" && !Number.isNaN(Date.parse(manifest.createdAt)),
    "manifest creation time is invalid",
  );
  requireShape(
    !Object.hasOwn(manifest, "baselineProductionJobId"),
    "manifest must not contain a production baseline",
  );
  return manifest;
}

function validateReceipt(receipt, { stagingOnly = false } = {}) {
  requireShape(receipt && typeof receipt === "object", "receipt is invalid");
  requireShape(receipt.version === 1, "receipt version is invalid");
  requireShape(
    receipt.environment === "staging" || (!stagingOnly && receipt.environment === "production"),
    "receipt environment is invalid",
  );
  const expectedBranch = receipt.environment === "staging"
    ? RELEASE.stagingBranch
    : RELEASE.productionBranch;
  requireShape(receipt.branch === expectedBranch, "receipt branch is invalid");
  requireShape(typeof receipt.jobId === "string" && receipt.jobId !== "", "receipt job ID is invalid");
  requireShape(/^[0-9a-f]{40}$/iu.test(receipt.commit), "receipt commit is invalid");
  requireShape(/^[0-9a-f]{64}$/iu.test(receipt.sha256), "receipt digest is invalid");
  requireShape(receipt.status === "SUCCEED", "receipt status is invalid");
  requireShape(
    typeof receipt.deployedAt === "string" && !Number.isNaN(Date.parse(receipt.deployedAt)),
    "receipt deployment time is invalid",
  );
  if (receipt.environment === "staging") {
    requireShape(
      typeof receipt.baselineProductionJobId === "string" &&
        receipt.baselineProductionJobId !== "",
      "staging receipt production baseline is invalid",
    );
  } else {
    requireShape(
      !Object.hasOwn(receipt, "baselineProductionJobId"),
      "production receipt must not contain a production baseline",
    );
  }
  return receipt;
}

function requireReceiptMatchesManifest(manifest, receipt) {
  requireShape(
    receipt.commit === manifest.commit && receipt.sha256 === manifest.sha256,
    "receipt does not match manifest",
  );
}

async function readReceipt(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function runFullTestSuite() {
  const testDirectory = join(projectRoot, "tests");
  const testPaths = (await readdir(testDirectory))
    .filter((path) => path.endsWith(".test.mjs"))
    .sort()
    .map((path) => join(testDirectory, path));
  await execFile(process.execPath, ["--test", ...testPaths], { cwd: projectRoot });
}

export function createGitAdapter(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const run = options.execFile ?? execFile;

  async function git(args) {
    const { stdout } = await run("git", args, { cwd });
    return stdout.trim();
  }

  return {
    async requireCommitInOriginMain(commit) {
      try {
        await git(["merge-base", "--is-ancestor", commit, "origin/main"]);
      } catch {
        throw new Error("commit is not present in origin/main");
      }
    },

    async requireLocalMainMatchesOrigin() {
      requireShape(await git(["status", "--porcelain"]) === "", "worktree is not clean");
      const [localMain, originMain] = await Promise.all([
        git(["rev-parse", "main"]),
        git(["rev-parse", "origin/main"]),
      ]);
      requireShape(localMain === originMain, "local main differs from origin/main");
    },
  };
}

function assertArguments(args, expectedLength) {
  if (args.length !== expectedLength) throw new UsageError();
}

function printDeployment(log, receipt, receiptPath, reviewUrl) {
  if (receiptPath !== undefined) log(`Receipt: ${receiptPath}`);
  log(`Commit: ${receipt.commit}`);
  log(`SHA-256: ${receipt.sha256}`);
  log(`Job ID: ${receipt.jobId}`);
  log(`Status: ${receipt.status}`);
  if (reviewUrl !== undefined) log(`Review URL: ${reviewUrl}`);
}

export async function runCli(args, overrides = {}) {
  const dependencies = {
    createAmplifyAdapter,
    createGitAdapter,
    createReleaseArtifact,
    deployStaging,
    log: console.log,
    promoteProduction,
    readManifest,
    readReceipt,
    runTests: runFullTestSuite,
    verifyDeployment,
    writeFile,
    ...overrides,
  };
  const [command] = args;

  async function loadManifest(path) {
    try {
      return validateManifest(await dependencies.readManifest(resolve(path)));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new Error("manifest JSON is invalid");
    }
  }

  async function loadReceipt(path, options) {
    try {
      return validateReceipt(await dependencies.readReceipt(resolve(path)), options);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new Error("receipt JSON is invalid");
    }
  }

  if (command === "package") {
    assertArguments(args, 1);
    await dependencies.runTests();
    const release = await dependencies.createReleaseArtifact({ runTests: async () => {} });
    const productionJobId = await dependencies
      .createAmplifyAdapter()
      .getActiveJobId(RELEASE.productionBranch);
    dependencies.log(`Manifest: ${release.manifestPath}`);
    dependencies.log(`ZIP: ${release.zipPath}`);
    dependencies.log(`Commit: ${release.manifest.commit}`);
    dependencies.log(`SHA-256: ${release.manifest.sha256}`);
    dependencies.log(`Active production job ID: ${productionJobId ?? "none"}`);
    return;
  }

  if (command === "deploy-staging") {
    assertArguments(args, 2);
    const manifestPath = resolve(args[1]);
    const manifest = await loadManifest(manifestPath);
    const receiptPath = join(dirname(manifestPath), "staging-receipt.json");
    const receipt = await dependencies.deployStaging({
      manifest,
      adapter: dependencies.createAmplifyAdapter(),
      receiptPath,
    });
    printDeployment(dependencies.log, receipt, receiptPath, RELEASE.stagingUrl);
    return;
  }

  if (command === "verify") {
    assertArguments(args, 3);
    const manifest = await loadManifest(args[1]);
    const receipt = await loadReceipt(args[2]);
    requireReceiptMatchesManifest(manifest, receipt);
    await dependencies.verifyDeployment({
      manifest,
      receipt,
      adapter: dependencies.createAmplifyAdapter(),
    });
    const reviewUrl = receipt.environment === "staging" ? RELEASE.stagingUrl : undefined;
    printDeployment(dependencies.log, receipt, undefined, reviewUrl);
    return;
  }

  if (command === "promote") {
    assertArguments(args, 4);
    const confirmation = args[3].match(/^--confirm-production=([0-9a-f]{64})$/iu)?.[1];
    if (confirmation === undefined) throw new UsageError();
    const manifestPath = resolve(args[1]);
    const manifest = await loadManifest(manifestPath);
    const receipt = await loadReceipt(args[2], { stagingOnly: true });
    requireReceiptMatchesManifest(manifest, receipt);
    const productionReceipt = await dependencies.promoteProduction({
      manifest,
      receipt,
      confirmation,
      adapter: dependencies.createAmplifyAdapter(),
      git: dependencies.createGitAdapter(),
    });
    const productionReceiptPath = join(dirname(manifestPath), "production-receipt.json");
    await dependencies.writeFile(
      productionReceiptPath,
      `${JSON.stringify(productionReceipt, null, 2)}\n`,
    );
    printDeployment(dependencies.log, productionReceipt, productionReceiptPath);
    return;
  }

  throw new UsageError();
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) console.error(`Error: ${error.message}`);
    console.error(USAGE);
    process.exitCode = 1;
  }
}
