# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-18

First usable release. The static-analysis core is functional; the live-check
runtime is declared in the registry but not yet implemented.

### Added

- `launchcheck scan` — runs the enabled static checkers against a project and
  reports results with a process exit code (2 on any critical fail, 1 on any
  fail, 0 otherwise).
- `launchcheck list` — prints the registered checkers; supports `--category`
  filtering and `--json` output.
- Eleven static checkers:
  - **code-quality** — `console-log-scan`, `todo-fixme-scan`,
    `gitignore-coverage`, `eslint-passing`, `prettier-passing`,
    `typescript-strict-compile`, `large-files-in-git-history`
  - **deployment** — `env-example-exists`, `ci-config-exists`
  - **dependencies** — `lockfile-committed`
  - **documentation** — `readme-required-sections`
- Configuration via a `.launchcheckrc` JSON file: per-checker enable/disable,
  `thresholds`, `checkerOptions`, and `ignore` globs.
- Dual ESM/CJS package with bundled type declarations.

### Notes

- Requires Node.js >= 18.
- `typescript` and `puppeteer` are optional peer dependencies, consumed only by
  the checkers that need them.
