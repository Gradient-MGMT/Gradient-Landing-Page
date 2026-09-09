import { execFile as execFileCallback } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import https from "node:https";
import { promisify } from "node:util";

import { RELEASE } from "./config.mjs";

const execFile = promisify(execFileCallback);
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function request({
  url,
  method,
  headers,
  bodyPath,
  acceptStatus,
  httpsRequest,
  createReadStreamImpl,
  timeoutMs,
}) {
  return new Promise((resolve, reject) => {
    let input;
    let outgoing;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      input?.destroy();
      if (outgoing && !outgoing.destroyed) outgoing.destroy();
      reject(error);
    };

    const succeed = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      outgoing = httpsRequest(url, { method, headers }, (response) => {
        response.once("aborted", () => fail(new Error(`${method} response aborted`)));
        response.once("error", fail);
        response.once("end", () => {
          const statusCode = response.statusCode ?? 0;
          if (acceptStatus(statusCode)) {
            succeed({ statusCode, headers: response.headers });
          } else {
            fail(new Error(`${method} request failed with HTTP ${statusCode}`));
          }
        });
        response.resume();
      });
    } catch (error) {
      fail(error);
      return;
    }

    outgoing.once("error", fail);
    outgoing.setTimeout(timeoutMs, () => {
      fail(new Error(`${method} request timed out after ${timeoutMs}ms`));
    });

    if (bodyPath === undefined) {
      outgoing.end();
      return;
    }

    input = createReadStreamImpl(bodyPath);
    input.once("error", fail);
    input.pipe(outgoing);
  });
}

function acceptsSuccess(statusCode) {
  return statusCode >= 200 && statusCode < 300;
}

function exactStatus(expected) {
  return (statusCode) => statusCode === expected;
}

function createHttpClient(options) {
  const httpsRequest = options.httpsRequest ?? https.request;
  const createReadStreamImpl = options.createReadStream ?? createReadStream;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  return async (requestOptions) => request({
    ...requestOptions,
    acceptStatus: requestOptions.acceptStatus ?? acceptsSuccess,
    httpsRequest,
    createReadStreamImpl,
    timeoutMs,
  });
}

export function createAmplifyAdapter(options = {}) {
  const appId = options.appId ?? RELEASE.appId;
  const profile = options.profile ?? RELEASE.profile;
  const region = options.region ?? RELEASE.region;
  const makeRequest = createHttpClient(options);

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
      await makeRequest({
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

    async checkUrl(url, { expectedRedirectUrl } = {}) {
      if (expectedRedirectUrl === undefined) {
        await makeRequest({ url, method: "GET", acceptStatus: exactStatus(200) });
        return;
      }

      const redirect = await makeRequest({
        url,
        method: "GET",
        acceptStatus: exactStatus(301),
      });
      const location = redirect.headers.location;
      if (typeof location !== "string") {
        throw new Error("GET redirect response is missing a Location header");
      }
      const destination = new URL(location, url).href;
      if (destination !== new URL(expectedRedirectUrl).href) {
        throw new Error("GET redirected to an unexpected URL");
      }
      await makeRequest({
        url: destination,
        method: "GET",
        acceptStatus: exactStatus(200),
      });
    },
  };
}
