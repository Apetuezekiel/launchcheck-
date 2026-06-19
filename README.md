# launchcheck

Automated pre-launch QA for web projects. `launchcheck` runs a suite of static
checks — code quality, security, dependencies, deployment config, and documentation —
and returns a process exit code you can gate a release or CI job on.

> Status: early release (0.1.1). The static-analysis core is functional; the
> live-check runtime is on the roadmap. See [CHANGELOG.md](./CHANGELOG.md).

## Install

Run without installing:

    npx launchcheck scan

Or add it to a project as a dev dependency:

    npm install --save-dev launchcheck

Requires Node.js >= 18. `typescript` and `puppeteer` are optional peer
dependencies, pulled in only by the checkers that use them.

## Usage

Scan the current directory:

    npx launchcheck scan

Scan a specific project directory, with colors disabled for CI logs:

    npx launchcheck scan --project-dir ./path/to/project --no-color

List the registered checkers (optionally filtered, or as JSON):

    npx launchcheck list
    npx launchcheck list --category code-quality
    npx launchcheck list --json

### Exit codes

`scan` exits `2` if any critical check fails, `1` if any check fails, and `0`
otherwise. Warnings and skipped checks do not affect the exit code.

## Configuration

Drop a `.launchcheckrc` JSON file at the project root to tune behavior:

    {
      "checkers": { "console-log-scan": false },
      "thresholds": { "large-file-bytes": 5242880 },
      "checkerOptions": {
        "readme-sections": { "requiredHeadings": ["Install", "Usage"] }
      },
      "ignore": ["vendor/**", "**/*.min.js"]
    }

- `checkers` — enable or disable individual checkers by id.
- `thresholds` — numeric knobs addressed by well-known keys (e.g.
  `large-file-bytes`).
- `checkerOptions` — per-checker option objects.
- `ignore` — glob patterns excluded from scanning.

## License

MIT © Apetu Ezekiel
