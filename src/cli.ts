#!/usr/bin/env node

import { createRequire } from "module";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  analyzeDockerfile,
  appendHealthcheckToDockerfile,
} from "./index.js";
import type { HealthcheckOverrides } from "./index.js";

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

function readVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const req = createRequire(import.meta.url);
    // Walk up from dist/ to find package.json.
    const pkg = req(resolve(__dirname, "..", "package.json")) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

function printHelp(): void {
  console.log(`
${color("healthcheck-gen", BOLD, CYAN)} - Generate Docker HEALTHCHECK instructions

${color("USAGE", BOLD)}
  healthcheck-gen [options]

${color("OPTIONS", BOLD)}
  --dockerfile <path>      Path to Dockerfile (default: ./Dockerfile)
  --append                 Append HEALTHCHECK to the Dockerfile
  --compose                Output docker-compose.yml healthcheck block
  --json                   Output result as JSON
  --none                   Generate HEALTHCHECK NONE (disable healthcheck)
  --interval <duration>    Override interval  (default: 30s)
  --timeout <duration>     Override timeout   (default: 5s)
  --retries <n>            Override retries   (default: 3)
  --start-period <duration> Override start-period (default: 10s)
  --help, -h               Show this help message
  --version, -v            Show version

${color("EXAMPLES", BOLD)}
  healthcheck-gen
  healthcheck-gen --dockerfile ./docker/Dockerfile.prod
  healthcheck-gen --append
  healthcheck-gen --compose
  healthcheck-gen --json
  healthcheck-gen --none --append
  healthcheck-gen --interval 60s --timeout 10s --retries 5
`);
}

function printVersion(): void {
  console.log(readVersion());
}

interface ParsedArgs {
  dockerfilePath: string;
  append: boolean;
  compose: boolean;
  json: boolean;
  none: boolean;
  help: boolean;
  version: boolean;
  overrides: HealthcheckOverrides;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let dockerfilePath = resolve(process.cwd(), "Dockerfile");
  let append = false;
  let compose = false;
  let json = false;
  let none = false;
  let help = false;
  let version = false;
  const overrides: HealthcheckOverrides = {};

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
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--none") {
      none = true;
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
    } else if (arg === "--interval") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        console.error(
          `${color("error", RED, BOLD)}: --interval requires a duration argument`
        );
        process.exit(1);
      }
      overrides.interval = next;
      i++;
    } else if (arg === "--timeout") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        console.error(
          `${color("error", RED, BOLD)}: --timeout requires a duration argument`
        );
        process.exit(1);
      }
      overrides.timeout = next;
      i++;
    } else if (arg === "--retries") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        console.error(
          `${color("error", RED, BOLD)}: --retries requires a number argument`
        );
        process.exit(1);
      }
      const parsed = parseInt(next, 10);
      if (isNaN(parsed) || parsed < 1) {
        console.error(
          `${color("error", RED, BOLD)}: --retries must be a positive integer`
        );
        process.exit(1);
      }
      overrides.retries = parsed;
      i++;
    } else if (arg === "--start-period") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        console.error(
          `${color("error", RED, BOLD)}: --start-period requires a duration argument`
        );
        process.exit(1);
      }
      overrides.startPeriod = next;
      i++;
    } else {
      console.error(
        `${color("error", RED, BOLD)}: unknown option: ${arg}`
      );
      process.exit(1);
    }
  }

  overrides.useNone = none;

  return { dockerfilePath, append, compose, json, none, help, version, overrides };
}

function main(): void {
  const { dockerfilePath, append, compose, json, none, help, version, overrides } =
    parseArgs(process.argv);

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
    result = analyzeDockerfile(dockerfilePath, overrides);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `${color("error", RED, BOLD)}: Failed to parse Dockerfile: ${message}`
    );
    process.exit(1);
  }

  const { analysis, healthcheck, dockerfileInstruction, composeBlock, healthEndpointSnippet } =
    result;

  if (json) {
    const output = {
      analysis,
      healthcheck,
      dockerfileInstruction,
      composeBlock,
      healthEndpointSnippet,
    };
    console.log(JSON.stringify(output, null, 2));

    if (append) {
      try {
        appendHealthcheckToDockerfile(dockerfilePath, dockerfileInstruction);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `${color("error", RED, BOLD)}: Failed to write Dockerfile: ${message}\n`
        );
        process.exit(1);
      }
    }

    process.exit(0);
  }

  console.log(`
${color("healthcheck-gen", BOLD, CYAN)} analysis for ${color(dockerfilePath, DIM)}
${"─".repeat(60)}

${color("Detected", BOLD)}
  Base image  : ${color(analysis.rawFrom || "(none)", YELLOW)}
  App type    : ${color(analysis.baseImage, GREEN, BOLD)}
  Framework   : ${color(analysis.framework, GREEN)}
  Port        : ${color(
    analysis.port !== null ? String(analysis.port) : "(not detected)",
    analysis.port !== null ? YELLOW : DIM
  )}

${color("HEALTHCHECK instruction", BOLD)}
${color(dockerfileInstruction, CYAN)}
`);

  if (none) {
    console.log(
      color("Note: HEALTHCHECK NONE disables health checking for this image.", DIM)
    );
    console.log();
  }

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
