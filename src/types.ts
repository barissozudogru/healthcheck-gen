export type BaseImage =
  | "node"
  | "python"
  | "golang"
  | "postgres"
  | "redis"
  | "nginx"
  | "unknown";

export type Framework =
  | "express"
  | "fastify"
  | "nextjs"
  | "nestjs"
  | "uvicorn"
  | "gunicorn"
  | "fastapi"
  | "flask"
  | "django"
  | "gin"
  | "echo"
  | "fiber"
  | "unknown";

export interface DockerfileAnalysis {
  baseImage: BaseImage;
  port: number | null;
  framework: Framework;
  rawFrom: string;
  rawExpose: string[];
  rawCmd: string[];
  rawEntrypoint: string[];
}

export interface HealthcheckConfig {
  test: string;
  interval: string;
  timeout: string;
  startPeriod: string;
  retries: number;
}

export interface GeneratedHealthcheck {
  analysis: DockerfileAnalysis;
  healthcheck: HealthcheckConfig;
  dockerfileInstruction: string;
  composeBlock: string;
  healthEndpointSnippet: string | null;
}
