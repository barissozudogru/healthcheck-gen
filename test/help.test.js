import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("help links to the source repository", () => {
  const result = spawnSync(process.execPath, ["dist/cli.js", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /https:\/\/github\.com\/barissozudogru\/healthcheck-gen/);
});
