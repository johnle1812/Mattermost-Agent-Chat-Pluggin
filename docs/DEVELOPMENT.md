# Maintainer workflow

## Change checklist

1. Install dependencies with `npm ci` in `webapp/`.
2. Make source changes; do not edit generated `server/manifest.go` or `webapp/src/manifest.ts` directly.
3. Run `./build/bin/manifest apply` after changing `plugin.json`.
4. Run Go tests and web-app lint, type checks, and tests.
5. Build with `make dist` and test the artifact on a non-production Mattermost server.
6. Increment the semantic version in `plugin.json` for a release.

## Configuration rule

Environment coordinates belong in Mattermost plugin settings. Secrets belong in the external gateway/agent secret store. Neither category should be hard-coded in Go, TypeScript, tests, screenshots, or documentation.

Before committing, inspect staged changes and scan tracked files:

```bash
git diff --cached
git grep -nEi '(api[_-]?key|access[_-]?token|authorization:|password|secret|webhook)'
```

Treat scan results as prompts for review because documentation may intentionally contain these words. Never paste real secret values into an issue, commit, or build log.

## Repository hygiene

The `.gitignore` excludes generated bundles, compiled binaries, dependency directories, local environment files, test output, and editor state. If a generated file was already tracked, remove it from the Git index before publishing:

```bash
git rm --cached <generated-file>
```

## Remote module path

`go.mod` initially uses `example.com/your-organization/agent-assistant-plugin` as an obvious placeholder. Once the repository location is final, change it to the clone path without protocol or `.git`. For example:

```text
gitlab.example.com/platform/mattermost/agent-assistant-plugin
```
