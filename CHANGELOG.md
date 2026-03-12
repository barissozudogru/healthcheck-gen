# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] - 2026-03-12

### Added
- Alpine image detection: use `wget -q --spider` instead of `curl -f` when the base image tag contains `alpine`
- Multi-stage build support: only the final `FROM` stage is analyzed
- Automatic removal of an existing `HEALTHCHECK` instruction before appending a new one, including multi-line continuations
- `--start-period` timing override flag

### Changed
- `FROM` line parsing now strips `--platform` and other `--flag=value` tokens before extracting the image name

### Fixed
- Incorrect port detection when `EXPOSE` contained a protocol suffix (e.g. `8080/tcp`)

---

## [0.2.0] - 2026-02-18

### Added
- `--interval`, `--timeout`, and `--retries` timing override flags
- `--none` flag to generate `HEALTHCHECK NONE`
- `--json` flag for machine-readable output
- Health endpoint code snippets for all supported frameworks (Express, Fastify, Next.js, NestJS, FastAPI, Flask, Django, Gin, Fiber, Echo)
- TTY-aware color output; colors are suppressed when stdout is not a terminal

### Changed
- Default fallback port changed from `8080` to `3000` to match the Node.js ecosystem convention

---

## [0.1.0] - 2026-01-30

### Added
- Initial release
- Dockerfile analysis: detect base image (`node`, `python`, `golang`, `postgres`, `redis`, `nginx`) and exposed port
- Generate `HEALTHCHECK` instruction for Dockerfile
- `--append` flag to write the instruction directly to the Dockerfile
- `--compose` flag to output the equivalent `docker-compose.yml` healthcheck block
- `--dockerfile` flag to specify a custom Dockerfile path
- Framework detection for Express, Fastify, Next.js, NestJS, FastAPI, Flask, Django, Gin, Fiber, Echo
