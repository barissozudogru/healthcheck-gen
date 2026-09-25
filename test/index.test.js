import test from "node:test";
import assert from "node:assert/strict";
import { parseDockerfile } from "../dist/index.js";

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

test("avoids false positive base image matches for substring patterns", () => {
  assert.equal(parseDockerfile("FROM mongo:6.0").baseImage, "unknown");
  assert.equal(parseDockerfile("FROM django:4.2").baseImage, "unknown");
  assert.equal(parseDockerfile("FROM dragonfly:latest").baseImage, "unknown");
  assert.equal(parseDockerfile("FROM cargo:latest").baseImage, "unknown");
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

test("captures all parts of a continued ENTRYPOINT instruction", () => {
  const analysis = parseDockerfile(
    'FROM python:3.12\nENTRYPOINT ["gunicorn",\\\n  "app.main:app"]'
  );
  assert.deepEqual(analysis.rawEntrypoint, ['["gunicorn", "app.main:app"]']);
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

