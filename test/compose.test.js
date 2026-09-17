import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "yaml";
import { generateFromContent } from "../dist/index.js";

/**
 * The compose block gets pasted into real docker-compose.yml files and read by
 * CI from the --json output, so it has to survive a YAML parser. The probes
 * for slim images run the language runtime (node -e "...", python -c "...")
 * and carry double quotes of their own, which end a double-quoted scalar early
 * unless they are escaped.
 */

// Every probe shape buildHealthcheckConfig can emit.
const VARIANTS = [
  ["node slim", 'FROM node:22-slim\nEXPOSE 3000\nCMD ["node","server.js"]'],
  ["python slim", 'FROM python:3.12-slim\nEXPOSE 8000\nCMD ["uvicorn","app:app"]'],
  ["full image", 'FROM node:22\nEXPOSE 3000\nCMD ["node","server.js"]'],
  ["alpine", 'FROM node:22-alpine\nEXPOSE 3000\nCMD ["node","server.js"]'],
  ["minimal image without a known runtime", "FROM golang:1.22-slim\nEXPOSE 8080\n"],
  ["postgres", "FROM postgres:15\n"],
  ["redis", "FROM redis:7\n"],
  ["nginx", "FROM nginx:alpine\n"],
];

function parseComposeBlock(composeBlock) {
  const compose = `services:\n  app:\n    ${composeBlock.split("\n").join("\n    ")}\n`;
  return parse(compose).services.app.healthcheck;
}

for (const [name, dockerfile] of VARIANTS) {
  test(`compose block for ${name} parses as YAML`, () => {
    const { composeBlock, healthcheck } = generateFromContent(dockerfile);
    const emitted = parseComposeBlock(composeBlock);

    // The parsed probe must round-trip to the raw command exactly; escaping
    // that altered the command would emit a healthcheck that never runs.
    assert.deepEqual(emitted.test, ["CMD-SHELL", healthcheck.test]);
    assert.equal(emitted.retries, healthcheck.retries);
    assert.equal(emitted.interval, healthcheck.interval);
  });
}

test("disabled healthcheck compose block parses as YAML", () => {
  const { composeBlock } = generateFromContent("FROM node:22\n", {
    useNone: true,
  });
  assert.deepEqual(parseComposeBlock(composeBlock), { disable: true });
});
