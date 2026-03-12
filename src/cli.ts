#!/usr/bin/env node

import { existsSync } from "fs";
import { resolve } from "path";
import {
  analyzeDockerfile,
  appendHealthcheckToDockerfile,
} from "./index.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

function color(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${RESET}`;
}

function printHelp(): void {
  console.log(`
${color("healthcheck-gen", BOLD, CYAN)} - Generate Docker HEALTHCHECK instructions

${color("USAGE", BOLD)}
  healthcheck-gen [options]

${color("OPTIONS", BOLD)}
  --dockerfile <path>   Path to Dockerfile (default: ./Dockerfile)
  --append              Append HEALTHCHECK to the Dockerfile
  --compose             Output docker-compose.yml healthcheck block
  --help, -h            Show this help message
  --version, -v         Show version

${color("EXAMPLES", BOLD)}
  healthcheck-gen
  healthcheck-gen --dockerfile ./docker/Dockerfile.prod
  healthcheck-gen --append
  healthcheck-gen --compose
  healthcheck-gen --append --compose
`);
}

function printVersion(): void {
  console.log("0.1.0");
}

function parseArgs(argv: string[]): {
  dockerfilePath: string;
  append: boolean;
  compose: boolean;
  help: boolean;
  version: boolean;
} {
  const args = argv.slice(2);
  let dockerfilePath = resolve(process.cwd(), "Dockerfile");
  let append = false;
  let compose = false;
  let help = false;
  let version = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--version" || arg === "-v") {
      version = true;
    } else if (arg === "--append") {
      append = true;
    } else if (arg === "--compose") {
      compose = true;
    } else if (arg === "--dockerfile") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        console.error(
          `${color("error", RED, BOLD)}: --dockerfile requires a path argument`
        );
        process.exit(1);
      }
      dockerfilePath = resolve(process.cwd(), next);
      i++;
    } else {
      console.error(
        `${color("error", RED, BOLD)}: unknown option: ${arg}`
      );
      process.exit(1);
    }
  }

  return { dockerfilePath, append, compose, help, version };
}

function main(): void {
  const { dockerfilePath, append, compose, help, version } = parseArgs(
    process.argv
  );

  if (help) {
    printHelp();
    process.exit(0);
  }

  if (version) {
    printVersion();
    process.exit(0);
  }

  if (!existsSync(dockerfilePath)) {
    console.error(
      `${color("error", RED, BOLD)}: Dockerfile not found at ${dockerfilePath}`
    );
    console.error(
      `Use ${color("--dockerfile <path>", CYAN)} to specify a custom path.`
    );
    process.exit(1);
  }

  let result;
  try {
    result = analyzeDockerfile(dockerfilePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${color("error", RED, BOLD)}: Failed to parse Dockerfile: ${message}`);
    process.exit(1);
  }

  const { analysis, dockerfileInstruction, composeBlock, healthEndpointSnippet } = result;

  console.log(`
${color("healthcheck-gen", BOLD, CYAN)} analysis for ${color(dockerfilePath, DIM)}
${"─".repeat(60)}

${color("Detected", BOLD)}
  Base image  : ${color(analysis.rawFrom || "(none)", YELLOW)}
  App type    : ${color(analysis.baseImage, GREEN, BOLD)}
  Framework   : ${color(analysis.framework, GREEN)}
  Port        : ${color(analysis.port !== null ? String(analysis.port) : "(not detected)", analysis.port !== null ? YELLOW : DIM)}

${color("HEALTHCHECK instruction", BOLD)}
${color(dockerfileInstruction, CYAN)}
`);

  if (compose) {
    console.log(`${color("docker-compose.yml block", BOLD)}`);
    console.log(`${color("services:", DIM)}`);
    console.log(`${color("  your-service:", DIM)}`);
    const indented = composeBlock
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n");
    console.log(color(indented, CYAN));
    console.log();
  }

  if (healthEndpointSnippet) {
    console.log(`${color("Suggested /health endpoint", BOLD)}`);
    console.log(color(healthEndpointSnippet, DIM));
    console.log();
  }

  if (append) {
    try {
      appendHealthcheckToDockerfile(dockerfilePath, dockerfileInstruction);
      console.log(
        `${color("success", GREEN, BOLD)}: HEALTHCHECK appended to ${dockerfilePath}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `${color("error", RED, BOLD)}: Failed to write Dockerfile: ${message}`
      );
      process.exit(1);
    }
  }
}

main();
