import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
