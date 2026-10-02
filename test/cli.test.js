import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("retries rejects values that are not positive integers", () => {
  for (const retries of ["3oops", "1.5"]) {
    const result = spawnSync(
      process.execPath,
      ["dist/cli.js", "--retries", retries, "--dockerfile", "package.json", "--json"],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    assert.equal(result.status, 1, `accepted --retries ${retries}`);
    assert.match(result.stderr, /--retries must be a positive integer/);
  }
});
