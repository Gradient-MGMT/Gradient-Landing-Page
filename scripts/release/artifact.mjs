import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";

import { RELEASE, isPublicFile } from "./config.mjs";

const execFile = promisify(execFileCallback);

async function runGit(cwd, args) {
  const { stdout } = await execFile("git", args, { cwd });
  return stdout;
}

async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function isSafeRelativePath(path) {
  return typeof path === "string" &&
    path !== "" &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function validateArtifactFiles(files) {
  if (!Array.isArray(files)) {
    throw new Error("artifact files must be an array");
  }

  const seen = new Set();
  for (const path of files) {
    if (!isSafeRelativePath(path)) {
      throw new Error("artifact contains unsafe path");
    }
    if (seen.has(path)) {
      throw new Error("artifact contains duplicate path");
    }
    if (!isPublicFile(path)) {
      throw new Error("artifact contains non-public path");
    }
    seen.add(path);
  }

  if (!seen.has("index.html")) {
    throw new Error("artifact requires index.html");
  }

  const sortedFiles = [...files].sort();
  if (JSON.stringify(files) !== JSON.stringify(sortedFiles)) {
    throw new Error("artifact files must be sorted");
  }
}

export async function collectPublicFiles(cwd, commit) {
  const root = resolve(cwd);
  const trackedFiles = (await runGit(root, ["ls-tree", "-r", "--name-only", commit]))
    .split("\n")
    .filter(Boolean);

  return trackedFiles.filter(isPublicFile).sort();
}

export async function createReleaseArtifact(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const status = await runGit(cwd, ["status", "--porcelain"]);
  if (status !== "") {
    throw new Error("worktree must be clean before packaging");
  }

  const commit = (await runGit(cwd, ["rev-parse", "HEAD"])).trim();
  const files = await collectPublicFiles(cwd, commit);
  if (!files.includes("index.html")) {
    throw new Error("release artifact requires a tracked index.html");
  }

  const runTests = options.runTests ?? (async () => {});
  await runTests();

  const outputRoot = resolve(cwd, options.outputRoot ?? ".release");
  const artifactRoot = resolve(outputRoot, commit);
  await mkdir(artifactRoot, { recursive: true });
  const zipPath = resolve(artifactRoot, "site.zip");
  await runGit(cwd, ["archive", "--format=zip", `--output=${zipPath}`, commit, "--", ...files]);

  const manifest = {
    version: 1,
    appId: options.appId ?? RELEASE.appId,
    region: options.region ?? RELEASE.region,
    commit,
    sha256: await sha256File(zipPath),
    zipPath,
    files,
    createdAt: new Date().toISOString(),
  };
  const manifestPath = resolve(artifactRoot, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return { manifest, manifestPath, zipPath };
}

export async function readManifest(path) {
  const manifestPath = resolve(path);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (typeof manifest.zipPath === "string" && !isAbsolute(manifest.zipPath)) {
    manifest.zipPath = resolve(manifestPath, "..", manifest.zipPath);
  }
  return manifest;
}

export async function verifyArtifact(manifest) {
  const zipPath = resolve(manifest.zipPath);
  const digest = await sha256File(zipPath);
  if (digest !== manifest.sha256) {
    throw new Error("artifact checksum mismatch");
  }

  validateArtifactFiles(manifest.files);

  const { stdout } = await execFile("unzip", ["-Z1", zipPath]);
  const entries = stdout.trim() === "" ? [] : stdout.trim().split("\n").filter((entry) => !entry.endsWith("/"));
  validateArtifactFiles(entries);
  if (JSON.stringify(entries) !== JSON.stringify(manifest.files)) {
    throw new Error("artifact ZIP entries do not match manifest files");
  }

  return true;
}
