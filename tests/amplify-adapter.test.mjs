import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
import test from "node:test";

import { createAmplifyAdapter } from "../scripts/release/amplify-adapter.mjs";

const WATCHDOG_MS = 50;

function withWatchdog(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("test watchdog expired")), WATCHDOG_MS);
    }),
  ]);
}

function responseFor({ statusCode = 200, headers = {}, event = "end" }) {
  const response = new PassThrough();
  response.statusCode = statusCode;
  response.headers = headers;
  if (event === "end") {
    queueMicrotask(() => response.end());
  } else if (event === "aborted") {
    queueMicrotask(() => response.emit("aborted"));
  } else if (event === "error") {
    queueMicrotask(() => response.emit("error", new Error("response stream failed")));
  }
  return response;
}

function recordingHttps(scenarios) {
  const requests = [];

  return {
    requests,
    request(url, options, onResponse) {
      const scenario = scenarios.shift();
      const outgoing = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
      outgoing.setTimeout = (milliseconds, callback) => {
        requests.at(-1).timeout = milliseconds;
        if (scenario.type === "timeout") queueMicrotask(callback);
        return outgoing;
      };
      requests.push({ url: String(url), options, timeout: undefined });

      if (scenario.type === "request-error") {
        queueMicrotask(() => outgoing.emit("error", new Error("request socket failed")));
      } else if (scenario.type !== "timeout") {
        queueMicrotask(() => onResponse(responseFor(scenario)));
      }
      return outgoing;
    },
  };
}

test("URL checks require the www redirect to reach the canonical apex", async () => {
  const transport = recordingHttps([
    {
      statusCode: 301,
      headers: { location: "mock://gradientmgmt.com/" },
      event: "end",
    },
    { statusCode: 200, event: "end" },
  ]);
  const adapter = createAmplifyAdapter({
    httpsRequest: transport.request,
    requestTimeoutMs: 25,
  });

  await assert.doesNotReject(adapter.checkUrl(
    "mock://www.gradientmgmt.com/",
    { expectedRedirectUrl: "mock://gradientmgmt.com/" },
  ));
  assert.deepEqual(transport.requests.map(({ url }) => url), [
    "mock://www.gradientmgmt.com/",
    "mock://gradientmgmt.com/",
  ]);
});

test("URL checks reject redirects to an unexpected destination", async () => {
  const transport = recordingHttps([{
    statusCode: 301,
    headers: { location: "mock://unexpected.example/" },
    event: "end",
  }]);
  const adapter = createAmplifyAdapter({ httpsRequest: transport.request });

  await assert.rejects(
    adapter.checkUrl(
      "mock://www.gradientmgmt.com/",
      { expectedRedirectUrl: "mock://gradientmgmt.com/" },
    ),
    /redirected to an unexpected URL/,
  );
});

test("HTTP requests reject on their configured deadline", async () => {
  const transport = recordingHttps([{ type: "timeout" }]);
  const adapter = createAmplifyAdapter({
    httpsRequest: transport.request,
    requestTimeoutMs: 25,
  });

  await assert.rejects(
    withWatchdog(adapter.checkUrl("mock://staging.example.test/")),
    /GET request timed out after 25ms/,
  );
  assert.equal(transport.requests[0].timeout, 25);
});

test("HTTP requests reject when the response is aborted", async () => {
  const transport = recordingHttps([{ statusCode: 200, event: "aborted" }]);
  const adapter = createAmplifyAdapter({ httpsRequest: transport.request });

  await assert.rejects(
    withWatchdog(adapter.checkUrl("mock://staging.example.test/")),
    /GET response aborted/,
  );
});

test("HTTP requests reject response stream errors", async () => {
  const transport = recordingHttps([{ statusCode: 200, event: "error" }]);
  const adapter = createAmplifyAdapter({ httpsRequest: transport.request });

  await assert.rejects(
    withWatchdog(adapter.checkUrl("mock://staging.example.test/")),
    /response stream failed/,
  );
});

test("upload failures destroy the ZIP input stream", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "amplify-adapter-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const zipPath = join(root, "site.zip");
  await writeFile(zipPath, "zip bytes");

  const input = new Readable({ read() {} });
  const transport = recordingHttps([{ type: "request-error" }]);
  const adapter = createAmplifyAdapter({
    httpsRequest: transport.request,
    createReadStream: () => input,
  });

  await assert.rejects(
    adapter.uploadZip("mock://upload.example.test/presigned", zipPath),
    /request socket failed/,
  );
  assert.equal(input.destroyed, true);
});

test("ZIP uploads reject redirects instead of following them", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "amplify-adapter-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const zipPath = join(root, "site.zip");
  await writeFile(zipPath, "zip bytes");

  const transport = recordingHttps([{
    statusCode: 307,
    headers: { location: "mock://elsewhere.example.test/" },
    event: "end",
  }]);
  const adapter = createAmplifyAdapter({ httpsRequest: transport.request });

  await assert.rejects(
    adapter.uploadZip("mock://upload.example.test/presigned", zipPath),
    /PUT request failed with HTTP 307/,
  );
});
