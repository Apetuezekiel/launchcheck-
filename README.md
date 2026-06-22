# launchcheck

Automated pre-launch QA for web projects. `launchcheck` runs a suite of checks â€”
code quality, security, SEO, dependencies, deployment config, and documentation
â€” and returns a process exit code you can gate a release or CI job on. It works
in two modes: **static** (against a project directory) and **live** (against a
running URL).

> Status: 0.5.0. 35 checks across both modes. The Lighthouse/axe-based
> performance and accessibility checks (puppeteer) are on the roadmap. See
> [CHANGELOG.md](./CHANGELOG.md).

## Install

Run without installing:

    npx launchcheck scan

Or add it to a project as a dev dependency:

    npm install --save-dev launchcheck

Requires Node.js >= 18. `typescript` and `puppeteer` are optional peer
dependencies, pulled in only by the checkers that use them.

## Usage

### Static checks (project directory)

Scan the current directory (or pass `--project-dir`):

    npx launchcheck scan
    npx launchcheck scan --project-dir ./path/to/project --no-color

Static checks cover code quality (console/debugger statements, TODO/FIXME,
ESLint, Prettier, `tsc --noEmit` under strict, large files in git history),
dependencies (lockfile committed), deployment (`.env.example`, CI config),
documentation (README sections), and security (hardcoded-secret scan).

### Live checks (URL)

Scan a running site:

    npx launchcheck scan --url https://your-site.com

Live checks cover security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-
Options, Referrer-Policy, Permissions-Policy, Server/X-Powered-By leakage),
TLS certificate validity and expiry, SEO (title, meta description, canonical,
single H1, heading order, Open Graph, Twitter Card, JSON-LD, robots.txt,
sitemap.xml, favicon), and â€” when enabled â€” email authentication DNS records
(SPF, DKIM, DMARC).

Combine static and live in one run (pass both a URL and a project directory):

    npx launchcheck scan --url https://your-site.com --project-dir .

Example (abridged):

    security
      PASS  hsts-present/hsts-present [critical]        max-age=63072000
      PASS  ssl-valid/ssl-valid [critical]              issuer: Let's Encrypt
      PASS  ssl-not-expiring/ssl-not-expiring [major]   valid for 80 more days
      WARN  csp-present/csp-unsafe [major]              uses 'unsafe-inline'
      SKIP  spf-record/email-auth-disabled [major]      enable email-auth to run
    seo
      FAIL  canonical-url/canonical-missing [major]
      PASS  structured-data/structured-data-present [minor]   2 JSON-LD blocks
    Summary: 17 passed, 2 failed, 1 warned, 3 skipped   exit 1

A malformed `--url` (or a non-http(s) scheme) is a usage error and exits `2`.
Scanning an `http://` URL skips the TLS checks â€” point `--url` at the https URL.

### list

    npx launchcheck list
    npx launchcheck list --category security
    npx launchcheck list --json

### Exit codes

`scan` exits `2` if any critical check fails, `1` if any check fails, and `0`
otherwise. Warnings and skipped checks do not affect the exit code.

## Configuration

Drop a `.launchcheckrc` JSON file at the project root to tune behavior:

    {
      "checkers": { "console-log-scan": false },
      "thresholds": {
        "large-file-bytes": 5242880,
        "ssl-expiry-warning-days": 30
      },
      "checkerOptions": {
        "readme-sections": { "requiredHeadings": ["Install", "Usage"] },
        "secret-scan": { "allowlist": ["EXAMPLE_KEY"] },
        "email-auth": {
          "enabled": true,
          "domain": "your-domain.com",
          "dkimSelectors": ["default"]
        }
      },
      "ignore": ["vendor/**", "**/*.min.js"]
    }

- `checkers` â€” enable or disable individual checkers by id.
- `thresholds` â€” numeric knobs by well-known key (`large-file-bytes`,
  `ssl-expiry-warning-days`).
- `checkerOptions` â€” per-checker options. Note `email-auth` is **disabled by
  default**: the SPF, DKIM, and DMARC checks skip until you set
  `email-auth.enabled` to `true` (and list `dkimSelectors` for DKIM).
- `ignore` â€” glob patterns excluded from scanning.

## License

MIT Â© Apetu Ezekiel
