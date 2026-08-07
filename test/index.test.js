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
