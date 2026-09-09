import { execFile as execFileCallback } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import https from "node:https";
import { promisify } from "node:util";

import { RELEASE } from "./config.mjs";

const execFile = promisify(execFileCallback);

function request({ url, method, headers, bodyPath }) {
  return new Promise((resolve, reject) => {
    const outgoing = https.request(url, { method, headers }, (response) => {
      response.resume();
      response.once("end", () => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode >= 200 && statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`${method} request failed with HTTP ${statusCode}`));
        }
      });
    });
    outgoing.once("error", reject);

    if (bodyPath === undefined) {
      outgoing.end();
      return;
    }

    const input = createReadStream(bodyPath);
    input.once("error", (error) => outgoing.destroy(error));
    input.pipe(outgoing);
  });
}

export function createAmplifyAdapter(options = {}) {
  const appId = options.appId ?? RELEASE.appId;
  const profile = options.profile ?? RELEASE.profile;
  const region = options.region ?? RELEASE.region;

  async function runAws(args) {
    const { stdout } = await execFile("aws", [
      "amplify",
      ...args,
      "--profile",
      profile,
      "--region",
      region,
      "--output",
      "json",
    ]);
    return stdout.trim() === "" ? {} : JSON.parse(stdout);
  }

  return {
    async getActiveJobId(branch) {
      const result = await runAws([
        "get-branch",
        "--app-id",
        appId,
        "--branch-name",
        branch,
      ]);
      return result.branch?.activeJobId ?? null;
    },

    async createDeployment(branch) {
      const result = await runAws([
        "create-deployment",
        "--app-id",
        appId,
        "--branch-name",
        branch,
      ]);
      if (typeof result.jobId !== "string" || typeof result.zipUploadUrl !== "string") {
        throw new Error("Amplify create-deployment returned an invalid response");
      }
      return { jobId: result.jobId, zipUploadUrl: result.zipUploadUrl };
    },

    async uploadZip(url, path) {
      const { size } = await stat(path);
      await request({
        url,
        method: "PUT",
        headers: {
          "Content-Length": size,
          "Content-Type": "application/zip",
        },
        bodyPath: path,
      });
    },

    async startDeployment(branch, jobId) {
      await runAws([
        "start-deployment",
        "--app-id",
        appId,
        "--branch-name",
        branch,
        "--job-id",
        jobId,
      ]);
    },

    async getJobStatus(branch, jobId) {
      const result = await runAws([
        "get-job",
        "--app-id",
        appId,
        "--branch-name",
        branch,
        "--job-id",
        jobId,
      ]);
      const status = result.job?.summary?.status;
      if (typeof status !== "string") {
        throw new Error("Amplify get-job returned an invalid response");
      }
      return status;
    },

    async checkUrl(url) {
      await request({ url, method: "GET" });
    },
  };
}
