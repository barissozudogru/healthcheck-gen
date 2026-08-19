import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFromContent, isMinimalImage } from "../dist/index.js";

/**
 * Debian slim images ship neither curl nor wget, verified against node:22-slim
 * and python:3.12-slim. A curl probe there fails with "curl: not found" and the
 * container is marked unhealthy while the app serves normally.
 */

function probeFor(dockerfile) {
  return generateFromContent(dockerfile).healthcheck.test;
}

const NODE_SLIM = 'FROM node:22-slim\nEXPOSE 3000\nCMD ["node","server.js"]';
const PY_SLIM = 'FROM python:3.12-slim\nEXPOSE 8000\nCMD ["uvicorn","app:app"]';
const NODE_FULL = 'FROM node:22\nEXPOSE 3000\nCMD ["node","server.js"]';
const NODE_ALPINE = 'FROM node:22-alpine\nEXPOSE 3000\nCMD ["node","server.js"]';

test("slim images never get a curl probe when the runtime is known", () => {
  assert.ok(!probeFor(NODE_SLIM).includes("curl"));
  assert.ok(!probeFor(PY_SLIM).includes("curl"));
});

test("node slim uses the node runtime", () => {
  const probe = probeFor(NODE_SLIM);
  assert.match(probe, /^node -e /);
  assert.ok(probe.includes("http://localhost:3000/health"));
  assert.ok(probe.includes("catch"), "a network error must exit non-zero, not throw");
});

test("python slim uses the python runtime", () => {
  const probe = probeFor(PY_SLIM);
  assert.match(probe, /^python -c /);
  assert.ok(probe.includes("http://localhost:8000/health"));
});

test("full images keep curl, which they ship", () => {
  assert.match(probeFor(NODE_FULL), /^curl -f /);
});

test("alpine keeps wget, which busybox provides", () => {
  assert.match(probeFor(NODE_ALPINE), /^wget -q --spider /);
});

test("isMinimalImage recognises slim and distroless", () => {
  assert.equal(isMinimalImage("node:22-slim"), true);
  assert.equal(isMinimalImage("python:3.12-slim"), true);
  assert.equal(isMinimalImage("python:3.11-bookworm-slim"), true);
  assert.equal(isMinimalImage("gcr.io/distroless/nodejs22"), true);
  assert.equal(isMinimalImage("node:22"), false);
  assert.equal(isMinimalImage("python:3.12"), false);
});

test("multi-stage builds are judged on the final stage", () => {
  const multi = [
    "FROM node:22 AS builder",
    "RUN npm ci && npm run build",
    "FROM node:22-slim",
    "EXPOSE 3000",
    'CMD ["node","dist/index.js"]',
  ].join("\n");
  // The builder is a full image but the shipped stage is slim, so the probe
  // must suit the slim stage.
  assert.match(probeFor(multi), /^node -e /);
});
