import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyzeDockerfile,
  appendHealthcheckToDockerfile,
  generateFromContent,
  isMinimalImage,
  parseDockerfile,
} from "../dist/index.js";

test("detects supported base images correctly", () => {
  assert.equal(parseDockerfile("FROM node:20-alpine").baseImage, "node");
  assert.equal(parseDockerfile("FROM golang:1.21").baseImage, "golang");
  assert.equal(parseDockerfile("FROM go:1.21").baseImage, "golang");
  assert.equal(parseDockerfile("FROM python:3.11-slim").baseImage, "python");
  assert.equal(parseDockerfile("FROM python3:3.11").baseImage, "python");
  assert.equal(parseDockerfile("FROM postgres:15-alpine").baseImage, "postgres");
  assert.equal(parseDockerfile("FROM redis:7-alpine").baseImage, "redis");
  assert.equal(parseDockerfile("FROM nginx:alpine").baseImage, "nginx");
});

test("uses the documented default port for application base images", () => {
  for (const image of ["node:22", "python:3.12", "golang:1.22"]) {
    const analysis = parseDockerfile(`FROM ${image}`);
    assert.equal(analysis.port, 3000, image);
  }
});

test("uses an exposed port for the nginx healthcheck", () => {
  const result = generateFromContent("FROM nginx:1.27\nEXPOSE 8080");

  assert.equal(result.analysis.port, 8080);
  assert.equal(result.healthcheck.test, "curl -f http://localhost:8080/ || exit 1");
});

test("uses port 80 by default for the nginx healthcheck", () => {
  const result = generateFromContent("FROM nginx:1.27");

  assert.equal(result.analysis.port, 80);
  assert.equal(result.healthcheck.test, "curl -f http://localhost:80/ || exit 1");
});

test("resolves global ARG values used in FROM", () => {
  const analysis = parseDockerfile([
    "ARG NODE_VERSION=22",
    "FROM node:${NODE_VERSION}-alpine",
    "EXPOSE 3000",
  ].join("\n"));

  assert.equal(analysis.baseImage, "node");
  assert.equal(analysis.rawFrom, "node:22-alpine");

  assert.equal(
    parseDockerfile("FROM node:$UNDECLARED").rawFrom,
    "node:$UNDECLARED"
  );
  assert.equal(
    parseDockerfile("ARG __proto__=22\nFROM node:${__proto__}").rawFrom,
    "node:22"
  );
  assert.equal(
    parseDockerfile("ARG NODE_VERSION=22\nFROM node:$NODE_VERSION").rawFrom,
    "node:22"
  );
});

test("accepts tabs between Dockerfile instructions and their arguments", () => {
  const analysis = parseDockerfile("FROM\tnode:22\nEXPOSE\t8080");

  assert.equal(analysis.baseImage, "node");
  assert.equal(analysis.port, 8080);
  assert.equal(analysis.rawFrom, "node:22");
  assert.deepEqual(analysis.rawExpose, ["8080"]);
});

test("preserves earlier stage healthchecks when FROM uses a tab", () => {
  const directory = mkdtempSync("./.append-test-");
  const dockerfile = join(directory, "Dockerfile");

  try {
    writeFileSync(
      dockerfile,
      [
        "FROM\tnode:22 AS builder",
        "HEALTHCHECK CMD curl builder",
        "RUN npm run build",
        "FROM\tnode:22",
        "HEALTHCHECK CMD curl final",
      ].join("\n")
    );

    appendHealthcheckToDockerfile(dockerfile, "HEALTHCHECK CMD curl replacement");

    const updated = readFileSync(dockerfile, "utf8");
    assert.match(updated, /HEALTHCHECK CMD curl builder/);
    assert.doesNotMatch(updated, /HEALTHCHECK CMD curl final/);
    assert.match(updated, /HEALTHCHECK CMD curl replacement/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("does not remove longer instruction names beginning with HEALTHCHECK", () => {
  const directory = mkdtempSync("./.append-boundary-test-");
  const dockerfile = join(directory, "Dockerfile");

  try {
    writeFileSync(
      dockerfile,
      ["FROM node:22", "HEALTHCHECKER CMD echo keep"].join("\n")
    );

    appendHealthcheckToDockerfile(dockerfile, "HEALTHCHECK CMD replacement");

    const updated = readFileSync(dockerfile, "utf8");
    assert.match(updated, /HEALTHCHECKER CMD echo keep/);
    assert.match(updated, /HEALTHCHECK CMD replacement/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("preserves instructions after a HEALTHCHECK ending with an escaped backslash", () => {
  const directory = mkdtempSync("./.append-escaped-backslash-test-");
  const dockerfile = join(directory, "Dockerfile");

  try {
    writeFileSync(
      dockerfile,
      [
        "FROM node:22",
        "HEALTHCHECK CMD echo one \\\\",
        "EXPOSE 8080",
      ].join("\n")
    );

    appendHealthcheckToDockerfile(dockerfile, "HEALTHCHECK CMD echo replacement");

    const updated = readFileSync(dockerfile, "utf8");
    assert.match(updated, /EXPOSE 8080/);
    assert.match(updated, /HEALTHCHECK CMD echo replacement/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("avoids false positive base image matches for substring patterns", () => {
  assert.equal(parseDockerfile("FROM mongo:6.0").baseImage, "unknown");
  assert.equal(parseDockerfile("FROM django:4.2").baseImage, "unknown");
  assert.equal(parseDockerfile("FROM dragonfly:latest").baseImage, "unknown");
  assert.equal(parseDockerfile("FROM cargo:latest").baseImage, "unknown");
  assert.equal(parseDockerfile("FROM pythonista:latest").baseImage, "unknown");
});

test("avoids false positive framework matches inside longer words", () => {
  assert.equal(
    parseDockerfile('FROM scratch\nCMD ["./expressive-server"]').framework,
    "unknown"
  );
  assert.equal(
    parseDockerfile('FROM scratch\nCMD ["./express_server"]').framework,
    "unknown"
  );
});

test("ignores framework names in registry namespaces", () => {
  assert.equal(
    parseDockerfile("FROM registry.example.com/express/python:3.12").framework,
    "unknown"
  );
});

test("ignores framework names in base image tags", () => {
  assert.equal(parseDockerfile("FROM python:3.12-express").framework, "unknown");
});

test("joins backslash continuations of CMD before detecting the framework", () => {
  const dockerfile = [
    "FROM node:22-slim",
    "CMD node \\",
    "  server.js \\",
    "  --framework nestjs",
  ].join("\n");

  const analysis = parseDockerfile(dockerfile);

  assert.equal(analysis.framework, "nestjs");
  assert.deepEqual(analysis.rawCmd, ["node server.js --framework nestjs"]);
});

test("reads the port from a continued EXPOSE instruction", () => {
  const analysis = parseDockerfile("FROM node:22\nEXPOSE \\\n  3000");
  assert.equal(analysis.port, 3000);
});

test("does not continue lines ending with an escaped backslash", () => {
  const analysis = parseDockerfile([
    "FROM node:22",
    "CMD echo one \\\\",
    "EXPOSE 8080",
  ].join("\n"));

  assert.deepEqual(analysis.rawCmd, ["echo one \\\\"]);
  assert.equal(analysis.port, 8080);
});

test("does not partially parse malformed EXPOSE ports", () => {
  const analysis = parseDockerfile("FROM node:22\nEXPOSE 8080oops");
  assert.equal(analysis.port, null);
});

test("uses the first port from an EXPOSE range", () => {
  assert.equal(
    parseDockerfile("FROM node:22\nEXPOSE 8000-8005/tcp").port,
    8000
  );
  assert.equal(parseDockerfile("FROM node:22\nEXPOSE 8005-8000").port, null);
});

test("does not use UDP-only EXPOSE ports for an HTTP healthcheck", () => {
  assert.equal(parseDockerfile("FROM node:22\nEXPOSE 5353/udp").port, null);
  assert.equal(
    parseDockerfile("FROM node:22\nEXPOSE 5353/udp 8080/tcp").port,
    8080
  );
});

test("captures all parts of a continued ENTRYPOINT instruction", () => {
  const analysis = parseDockerfile(
    'FROM python:3.12\nENTRYPOINT ["gunicorn",\\\n  "app.main:app"]'
  );
  assert.deepEqual(analysis.rawEntrypoint, ['["gunicorn", "app.main:app"]']);
});

test("uses only the effective CMD and ENTRYPOINT in a stage", () => {
  const analysis = parseDockerfile([
    "FROM python:3.12",
    'CMD ["uvicorn", "app:app"]',
    'CMD ["python", "server.py"]',
    'ENTRYPOINT ["gunicorn", "app:app"]',
    'ENTRYPOINT ["python", "server.py"]',
  ].join("\n"));

  assert.equal(analysis.framework, "unknown");
  assert.deepEqual(analysis.rawCmd, ['["python", "server.py"]']);
  assert.deepEqual(analysis.rawEntrypoint, ['["python", "server.py"]']);
});

test("detects base images when the registry URL contains a port", () => {
  assert.equal(
    parseDockerfile("FROM localhost:5000/myorg/python:3.11-slim").baseImage,
    "python"
  );
  assert.equal(
    parseDockerfile("FROM registry.example.com:8443/company/node:20").baseImage,
    "node"
  );
});

test("does not classify registry path names as minimal image variants", () => {
  assert.equal(isMinimalImage("registry.example.com/slim/node:22"), false);
  assert.equal(isMinimalImage("registry.example.com/not-slim/node:22"), false);
  assert.equal(
    isMinimalImage("registry.example.com/distroless-images/node:22"),
    false
  );
});

test("rejects invalid and overflowing healthcheck overrides from the public API", () => {
  for (const overrides of [
    { interval: "banana" },
    { interval: "0s" },
    { timeout: "banana" },
    { timeout: "0s" },
    { startPeriod: "1mwat" },
    { retries: 0 },
    { timeout: "9223372036.854775808s" },
  ]) {
    assert.throws(() => generateFromContent("FROM node:22", overrides), {
      message: /must be|positive integer/,
    });
    assert.throws(() => analyzeDockerfile("package.json", overrides), {
      message: /must be|positive integer/,
    });
  }
});

test("rejects positive durations that round down to zero nanoseconds", () => {
  for (const overrides of [
    { interval: "0.0000000001s" },
    { timeout: "0.1ns" },
  ]) {
    assert.throws(() => generateFromContent("FROM node:22", overrides), {
      message: /must be a valid Docker duration/,
    });
  }
});

test("accepts compound Docker durations within the supported range", () => {
  const result = generateFromContent("FROM node:22", {
    interval: "1m30s",
    timeout: ".5s",
    startPeriod: "2500ms",
    retries: 5,
  });

  assert.equal(result.healthcheck.interval, "1m30s");
  assert.equal(result.healthcheck.timeout, ".5s");
  assert.equal(result.healthcheck.startPeriod, "2500ms");
  assert.equal(result.healthcheck.retries, 5);
});
