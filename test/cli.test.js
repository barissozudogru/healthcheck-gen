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

test("duration overrides reject values outside Docker duration syntax", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/cli.js", "--timeout", "banana", "--dockerfile", "package.json", "--json"],
    { cwd: process.cwd(), encoding: "utf8" }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--timeout must be a valid Docker duration/);
});

test("interval and timeout reject zero durations during CLI parsing", () => {
  for (const [option, value] of [
    ["--interval", "0s"],
    ["--timeout", "0s"],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["dist/cli.js", option, value, "--dockerfile", "package.json", "--json"],
      { cwd: process.cwd(), encoding: "utf8" }
    );

    assert.equal(result.status, 1, `accepted ${option} ${value}`);
    assert.match(result.stderr, new RegExp(`${option} must be a valid Docker duration`));
    assert.doesNotMatch(result.stderr, /Failed to parse Dockerfile/);
  }
});
