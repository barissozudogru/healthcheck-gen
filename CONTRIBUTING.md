# Contributing

Thank you for taking the time to contribute. The following guidelines keep the process straightforward for everyone.

## Prerequisites

- Node.js >= 18
- npm >= 9

```bash
git clone https://github.com/barissozudogru/healthcheck-gen.git
cd healthcheck-gen
npm install
```

## Development workflow

Build the TypeScript sources:

```bash
npm run build
```

Run the CLI from the built output:

```bash
node dist/cli.js --dockerfile ./path/to/Dockerfile
```

The project has no runtime dependencies. Keep it that way - `devDependencies` are fine, but anything that ends up in `dist/` must be implemented from scratch.

## Project structure

```
src/
  types.ts      -- shared TypeScript type definitions
  index.ts      -- core parsing and generation logic (importable as a library)
  cli.ts        -- command-line entry point
dist/           -- compiled output (generated, not committed)
```

## Submitting changes

1. Fork the repository and create a branch from `main`.
2. Make your changes in `src/`. Do not edit files in `dist/` directly.
3. Run `npm run build` and verify there are no TypeScript errors.
4. Test the CLI manually against a realistic Dockerfile.
5. Update `CHANGELOG.md` under an `[Unreleased]` heading.
6. Open a pull request against `main`. Fill in the PR template.

## Commit style

Use short, imperative commit messages in the present tense:

```
Add Alpine wget detection
Fix multi-stage FROM parsing
Update default fallback port to 3000
```

No ticket references or co-author lines are required.

## Adding a new base image

1. Add the image name pattern to `BASE_IMAGE_PATTERNS` in `src/index.ts`.
2. Add the corresponding `BaseImage` union member in `src/types.ts`.
3. Add a `case` block in `buildHealthcheckConfig` with the appropriate test command.
4. Document the new entry in the Supported Base Images table in `README.md`.

## Adding a new framework

1. Add the detection string to `FRAMEWORK_PATTERNS` in `src/index.ts`.
2. Add the corresponding `Framework` union member in `src/types.ts`.
3. Add a `case` block in `buildHealthEndpointSnippet` with a minimal working snippet.
4. Document the framework in `README.md`.

## Reporting issues

Use the GitHub issue tracker. Include:

- The Dockerfile content (or a minimal reproduction)
- The command you ran
- The actual output
- The expected output
