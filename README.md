# healthcheck-gen

Generate Docker HEALTHCHECK instructions by analyzing your Dockerfile.

Reads your Dockerfile, detects the application type and exposed port, then outputs ready-to-use HEALTHCHECK instructions for both `Dockerfile` and `docker-compose.yml`.

## Install

```bash
npm install -g @barissozudogru/healthcheck-gen
```

Or run without installing:

```bash
npx @barissozudogru/healthcheck-gen
```

## Usage

```
healthcheck-gen [options]

Options:
  --dockerfile <path>       Path to Dockerfile (default: ./Dockerfile)
  --append                  Append HEALTHCHECK to the Dockerfile
  --compose                 Output docker-compose.yml healthcheck block
  --json                    Output result as JSON
  --none                    Generate HEALTHCHECK NONE (disable healthcheck)
  --interval <duration>     Override interval (default: 30s)
  --timeout <duration>      Override timeout (default: 5s)
  --retries <n>             Override retries (default: 3)
  --start-period <duration> Override start-period (default: 10s)
  --help, -h                Show help
  --version, -v             Show version
```

## Examples

Analyze the Dockerfile in the current directory:

```bash
healthcheck-gen
```

Analyze a specific Dockerfile:

```bash
healthcheck-gen --dockerfile ./docker/Dockerfile.prod
```

Append the generated HEALTHCHECK directly to the Dockerfile:

```bash
healthcheck-gen --append
```

Show the docker-compose.yml equivalent block:

```bash
healthcheck-gen --compose
```

Append to Dockerfile and show compose block together:

```bash
healthcheck-gen --append --compose
```

Output result as JSON (useful for scripting):

```bash
healthcheck-gen --json
```

Disable health checking entirely:

```bash
healthcheck-gen --none --append
```

Override timing parameters:

```bash
healthcheck-gen --interval 60s --timeout 10s --retries 5 --start-period 30s
```

## Detected app types

| Base image | Health check strategy |
|---|---|
| node | `curl -f http://localhost:PORT/health` |
| python | `curl -f http://localhost:PORT/health` |
| golang | `curl -f http://localhost:PORT/health` |
| postgres | `pg_isready` |
| redis | `redis-cli ping` |
| nginx | `curl -f http://localhost/` |

Detected frameworks (Express, Fastify, Next.js, NestJS, FastAPI, Flask, Django, Gin, Fiber, Echo) also get a minimal `/health` endpoint snippet.

## Defaults

```
--interval=30s
--timeout=5s
--start-period=10s
--retries=3
```

## License

MIT
