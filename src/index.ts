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

export function parseDockerfile(content: string): DockerfileAnalysis {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  let rawFrom = "";
  const rawExpose: string[] = [];
  const rawCmd: string[] = [];
  const rawEntrypoint: string[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (upper.startsWith("FROM ")) {
      // Use last FROM for multi-stage builds
      rawFrom = line.slice(5).trim().split(/\s+/)[0];
    } else if (upper.startsWith("EXPOSE ")) {
      rawExpose.push(line.slice(7).trim());
    } else if (upper.startsWith("CMD ")) {
      rawCmd.push(line.slice(4).trim());
    } else if (upper.startsWith("ENTRYPOINT ")) {
      rawEntrypoint.push(line.slice(11).trim());
    }
  }

  const baseImage = detectBaseImage(rawFrom);
  const port = detectPort(rawExpose, baseImage);
  const framework = detectFramework(
    rawCmd,
    rawEntrypoint,
    rawFrom,
    baseImage
  );

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
  // Use defaults for known services if EXPOSE is absent
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

  // Infer from base image when no explicit hints
  if (baseImage === "node") return "express";
  if (baseImage === "python") return "unknown";
  if (baseImage === "golang") return "unknown";

  return "unknown";
}

function buildHealthcheckConfig(
  analysis: DockerfileAnalysis
): HealthcheckConfig {
  const defaults: Omit<HealthcheckConfig, "test"> = {
    interval: "30s",
    timeout: "5s",
    startPeriod: "10s",
    retries: 3,
  };

  const port = analysis.port;

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

    case "nginx":
      return {
        ...defaults,
        test: "curl -f http://localhost/ || exit 1",
      };

    default: {
      const healthPort = port ?? 3000;
      return {
        ...defaults,
        test: `curl -f http://localhost:${healthPort}/health || exit 1`,
      };
    }
  }
}

function buildDockerfileInstruction(config: HealthcheckConfig): string {
  return [
    "HEALTHCHECK \\",
    `  --interval=${config.interval} \\`,
    `  --timeout=${config.timeout} \\`,
    `  --start-period=${config.startPeriod} \\`,
    `  --retries=${config.retries} \\`,
    `  CMD ${config.test}`,
  ].join("\n");
}

function buildComposeBlock(config: HealthcheckConfig): string {
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
  port: number | null
): string | null {
  const p = port ?? 3000;

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

export function analyzeDockerfile(dockerfilePath: string): GeneratedHealthcheck {
  const absolutePath = resolve(dockerfilePath);
  const content = readFileSync(absolutePath, "utf-8");
  return generateFromContent(content);
}

export function generateFromContent(content: string): GeneratedHealthcheck {
  const analysis = parseDockerfile(content);
  const healthcheck = buildHealthcheckConfig(analysis);
  const dockerfileInstruction = buildDockerfileInstruction(healthcheck);
  const composeBlock = buildComposeBlock(healthcheck);
  const healthEndpointSnippet = buildHealthEndpointSnippet(
    analysis.framework,
    analysis.port
  );

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

  // Remove any existing HEALTHCHECK instruction
  const withoutExisting = content
    .split("\n")
    .filter((line) => !line.trim().toUpperCase().startsWith("HEALTHCHECK"))
    .join("\n");

  const trimmed = withoutExisting.trimEnd();
  const updated = `${trimmed}\n\n${instruction}\n`;

  writeFileSync(absolutePath, updated, "utf-8");
}
