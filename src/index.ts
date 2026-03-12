import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type {
  BaseImage,
  DockerfileAnalysis,
  Framework,
  GeneratedHealthcheck,
  HealthcheckConfig,
} from "./types.js";

export type {
  BaseImage,
  DockerfileAnalysis,
  Framework,
  GeneratedHealthcheck,
  HealthcheckConfig,
} from "./types.js";

const BASE_IMAGE_PATTERNS: Record<string, BaseImage> = {
  node: "node",
  "node:": "node",
  python: "python",
  "python:": "python",
  postgres: "postgres",
  "postgres:": "postgres",
  redis: "redis",
  "redis:": "redis",
  nginx: "nginx",
  "nginx:": "nginx",
  golang: "golang",
  "golang:": "golang",
  go: "golang",
};

const FRAMEWORK_PATTERNS: Record<string, Framework> = {
  uvicorn: "uvicorn",
  gunicorn: "gunicorn",
  fastapi: "fastapi",
  flask: "flask",
  django: "django",
  express: "express",
  fastify: "fastify",
  next: "nextjs",
  "next start": "nextjs",
  nest: "nestjs",
  nestjs: "nestjs",
  gin: "gin",
  echo: "echo",
  fiber: "fiber",
};

/** Returns true when the FROM image name suggests an Alpine-based distribution. */
function isAlpineImage(rawFrom: string): boolean {
  const lower = rawFrom.toLowerCase();
  return lower.includes("alpine");
}

export function parseDockerfile(content: string): DockerfileAnalysis {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  // Track stages for multi-stage build support.
  // We only want analysis from the FINAL stage.
  let currentStageFrom = "";
  const rawExpose: string[] = [];
  const rawCmd: string[] = [];
  const rawEntrypoint: string[] = [];

  // Per-stage collections that get reset on each FROM.
  let stageExpose: string[] = [];
  let stageCmd: string[] = [];
  let stageEntrypoint: string[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (upper.startsWith("FROM ")) {
      // Flush previous stage data (ignored; only the last stage is kept).
      stageExpose = [];
      stageCmd = [];
      stageEntrypoint = [];

      // Strip --flag=value tokens (e.g. --platform=linux/amd64) before
      // extracting the image name.
      currentStageFrom = line
        .slice(5)
        .replace(/--\w+=\S+\s*/g, "")
        .trim()
        .split(/\s+/)[0];
    } else if (upper.startsWith("EXPOSE ")) {
      stageExpose.push(line.slice(7).trim());
    } else if (upper.startsWith("CMD ")) {
      stageCmd.push(line.slice(4).trim());
    } else if (upper.startsWith("ENTRYPOINT ")) {
      stageEntrypoint.push(line.slice(11).trim());
    }
  }

  // Copy the final stage's collected values into the output arrays.
  rawExpose.push(...stageExpose);
  rawCmd.push(...stageCmd);
  rawEntrypoint.push(...stageEntrypoint);

  const rawFrom = currentStageFrom;
  const baseImage = detectBaseImage(rawFrom);
  const port = detectPort(rawExpose, baseImage);
  const framework = detectFramework(rawCmd, rawEntrypoint, rawFrom, baseImage);

  return {
    baseImage,
    port,
    framework,
    rawFrom,
    rawExpose,
    rawCmd,
    rawEntrypoint,
  };
}

function detectBaseImage(fromValue: string): BaseImage {
  const lower = fromValue.toLowerCase();
  const imageName = lower.split(":")[0].split("/").pop() ?? lower;

  for (const [pattern, base] of Object.entries(BASE_IMAGE_PATTERNS)) {
    const patternName = pattern.replace(/:$/, "");
    if (imageName === patternName || imageName.includes(patternName)) {
      return base;
    }
  }

  return "unknown";
}

function detectPort(
  exposeLines: string[],
  baseImage: BaseImage
): number | null {
  // Use defaults for known services if EXPOSE is absent.
  if (exposeLines.length === 0) {
    if (baseImage === "postgres") return 5432;
    if (baseImage === "redis") return 6379;
    if (baseImage === "nginx") return 80;
    return null;
  }

  const first = exposeLines[0].split(/[\s/]/)[0];
  const parsed = parseInt(first, 10);
  return isNaN(parsed) ? null : parsed;
}

function detectFramework(
  cmdLines: string[],
  entrypointLines: string[],
  fromValue: string,
  baseImage: BaseImage
): Framework {
  const allText = [...cmdLines, ...entrypointLines, fromValue]
    .join(" ")
    .toLowerCase();

  for (const [pattern, framework] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (allText.includes(pattern)) {
      return framework;
    }
  }

  // Infer from base image when no explicit hints.
  if (baseImage === "node") return "express";
  if (baseImage === "python") return "unknown";
  if (baseImage === "golang") return "unknown";

  return "unknown";
}

export interface HealthcheckOverrides {
  interval?: string;
  timeout?: string;
  startPeriod?: string;
  retries?: number;
  useNone?: boolean;
}

function buildHealthcheckConfig(
  analysis: DockerfileAnalysis,
  overrides: HealthcheckOverrides = {}
): HealthcheckConfig {
  const defaults: Omit<HealthcheckConfig, "test"> = {
    interval: overrides.interval ?? "30s",
    timeout: overrides.timeout ?? "5s",
    startPeriod: overrides.startPeriod ?? "10s",
    retries: overrides.retries ?? 3,
  };

  const port = analysis.port;
  const alpine = isAlpineImage(analysis.rawFrom);

  // Prefer wget on Alpine images where curl may not be installed.
  const httpCheck = (url: string): string =>
    alpine
      ? `wget -q --spider ${url} || exit 1`
      : `curl -f ${url} || exit 1`;

  switch (analysis.baseImage) {
    case "postgres":
      return {
        ...defaults,
        test: "pg_isready -U ${POSTGRES_USER:-postgres}",
      };

    case "redis":
      return {
        ...defaults,
        test: "redis-cli ping",
      };

    case "nginx": {
      return {
        ...defaults,
        test: httpCheck("http://localhost/"),
      };
    }

    default: {
      const healthPort = port ?? 3000;
      return {
        ...defaults,
        test: httpCheck(`http://localhost:${healthPort}/health`),
      };
    }
  }
}

function buildDockerfileInstruction(
  config: HealthcheckConfig,
  none = false
): string {
  if (none) {
    return "HEALTHCHECK NONE";
  }

  return [
    "HEALTHCHECK \\",
    `  --interval=${config.interval} \\`,
    `  --timeout=${config.timeout} \\`,
    `  --start-period=${config.startPeriod} \\`,
    `  --retries=${config.retries} \\`,
    `  CMD ${config.test}`,
  ].join("\n");
}

function buildComposeBlock(config: HealthcheckConfig, none = false): string {
  if (none) {
    return "healthcheck:\n  disable: true";
  }

  const lines = [
    "healthcheck:",
    `  test: ["CMD-SHELL", "${config.test}"]`,
    `  interval: ${config.interval}`,
    `  timeout: ${config.timeout}`,
    `  start_period: ${config.startPeriod}`,
    `  retries: ${config.retries}`,
  ];
  return lines.join("\n");
}

function buildHealthEndpointSnippet(
  framework: Framework,
  _port: number | null
): string | null {
  switch (framework) {
    case "express":
      return [
        "// Express health endpoint",
        `app.get('/health', (req, res) => {`,
        `  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });`,
        `});`,
      ].join("\n");

    case "fastify":
      return [
        "// Fastify health endpoint",
        `fastify.get('/health', async () => ({`,
        `  status: 'ok',`,
        `  timestamp: new Date().toISOString(),`,
        `}));`,
      ].join("\n");

    case "nextjs":
      return [
        "// pages/api/health.ts or app/api/health/route.ts",
        `export async function GET() {`,
        `  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });`,
        `}`,
      ].join("\n");

    case "nestjs":
      return [
        "// health.controller.ts",
        `@Controller('health')`,
        `export class HealthController {`,
        `  @Get()`,
        `  check() {`,
        `    return { status: 'ok', timestamp: new Date().toISOString() };`,
        `  }`,
        `}`,
      ].join("\n");

    case "fastapi":
    case "uvicorn":
      return [
        "# FastAPI health endpoint",
        `@app.get("/health")`,
        `async def health_check():`,
        `    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}`,
      ].join("\n");

    case "flask":
    case "gunicorn":
      return [
        "# Flask health endpoint",
        `@app.route('/health')`,
        `def health_check():`,
        `    return jsonify({'status': 'ok', 'timestamp': datetime.utcnow().isoformat()})`,
      ].join("\n");

    case "django":
      return [
        "# urls.py",
        `from django.http import JsonResponse`,
        `from datetime import datetime`,
        ``,
        `def health_check(request):`,
        `    return JsonResponse({'status': 'ok', 'timestamp': datetime.utcnow().isoformat()})`,
        ``,
        `# Add to urlpatterns:`,
        `# path('health', health_check),`,
      ].join("\n");

    case "gin":
      return [
        "// Gin health endpoint",
        `r.GET("/health", func(c *gin.Context) {`,
        `    c.JSON(http.StatusOK, gin.H{`,
        `        "status":    "ok",`,
        `        "timestamp": time.Now().UTC().Format(time.RFC3339),`,
        `    })`,
        `})`,
      ].join("\n");

    case "fiber":
      return [
        "// Fiber health endpoint",
        `app.Get("/health", func(c *fiber.Ctx) error {`,
        `    return c.JSON(fiber.Map{`,
        `        "status":    "ok",`,
        `        "timestamp": time.Now().UTC().Format(time.RFC3339),`,
        `    })`,
        `})`,
      ].join("\n");

    case "echo":
      return [
        "// Echo health endpoint",
        `e.GET("/health", func(c echo.Context) error {`,
        `    return c.JSON(http.StatusOK, map[string]string{`,
        `        "status":    "ok",`,
        `        "timestamp": time.Now().UTC().Format(time.RFC3339),`,
        `    })`,
        `})`,
      ].join("\n");

    default:
      return null;
  }
}

export function analyzeDockerfile(
  dockerfilePath: string,
  overrides: HealthcheckOverrides = {}
): GeneratedHealthcheck {
  const absolutePath = resolve(dockerfilePath);
  const content = readFileSync(absolutePath, "utf-8");
  return generateFromContent(content, overrides);
}

export function generateFromContent(
  content: string,
  overrides: HealthcheckOverrides = {}
): GeneratedHealthcheck {
  const analysis = parseDockerfile(content);
  const healthcheck = buildHealthcheckConfig(analysis, overrides);
  const none = overrides.useNone ?? false;
  const dockerfileInstruction = buildDockerfileInstruction(healthcheck, none);
  const composeBlock = buildComposeBlock(healthcheck, none);
  const healthEndpointSnippet = none
    ? null
    : buildHealthEndpointSnippet(analysis.framework, analysis.port);

  return {
    analysis,
    healthcheck,
    dockerfileInstruction,
    composeBlock,
    healthEndpointSnippet,
  };
}

export function appendHealthcheckToDockerfile(
  dockerfilePath: string,
  instruction: string
): void {
  const absolutePath = resolve(dockerfilePath);
  const content = readFileSync(absolutePath, "utf-8");

  const lines = content.split("\n");

  // Find the index of the last FROM line to locate the final stage boundary.
  let lastFromIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().toUpperCase().startsWith("FROM ")) {
      lastFromIndex = i;
    }
  }

  // Remove any existing HEALTHCHECK instruction that belongs to the final
  // stage only (lines after lastFromIndex).
  const filtered = lines.filter((line, idx) => {
    if (idx <= lastFromIndex) return true;
    return !line.trim().toUpperCase().startsWith("HEALTHCHECK");
  });

  const trimmed = filtered.join("\n").trimEnd();
  const updated = `${trimmed}\n\n${instruction}\n`;

  writeFileSync(absolutePath, updated, "utf-8");
}
