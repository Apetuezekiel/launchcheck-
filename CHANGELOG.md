# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-06-26

Major release. Everything since 1.0.0: CI-grade reporting (SARIF / JUnit / HTML),
a baseline gate, multi-URL scanning with sitemap ingestion and bounded crawl,
AST-based static scanners, package-manager breadth (npm / pnpm / yarn), Lighthouse
variance damping, and a single shared browser for axe + Lighthouse. One behavior
change makes this a major release (see Changed → Breaking).

### Added

- **Output formats** — `--format sarif` (SARIF 2.1.0 for GitHub code-scanning /
  PR annotations), `--format junit` (JUnit XML for CI test reporters), and
  `--format html` (a single self-contained, shareable report; no scripts, grouped
  by URL then severity). Findings carry a stable fingerprint
  (`checkerId/resultId[@url][@file:line]`), excluding volatile message text.
- **Baseline gate** — `--baseline <file>` gates the exit code on *new* findings
  only (adoptable on legacy projects with pre-existing issues); `--update-baseline`
  snapshots the current findings.
- **Multi-URL scanning** — `--urls a,b,c` runs the live checkers once per URL,
  each finding tagged and fingerprinted by URL; static checkers run once.
- **Sitemap + crawl URL sources** — `--sitemap <url>` ingests a `sitemap.xml`
  (follows a sitemap index one level deep, same-origin, capped via
  `--max-sitemap-urls`, default 50); `--crawl` does a bounded same-origin
  breadth-first crawl from the seed `--url` (`--max-pages`, default 20), honoring
  `robots.txt` (`--no-robots` to opt out).
- **Package-manager breadth** — `npm-audit` and `dependencies-outdated` now detect
  the package manager from the lockfile and run npm, **pnpm**, or **yarn**
  (previously npm-only; non-npm projects were skipped).
- **Lighthouse median-of-N** — `thresholds["lighthouse-runs"]` (default 1) audits
  N times per URL and reports the per-metric median, damping single-run score
  variance.
- **Terminal `--summary`** — a triage view printing only fail/warn findings plus
  the counts line.

### Changed

- **BREAKING: Lighthouse now requires `puppeteer`.** axe and Lighthouse share a
  single headless browser — Lighthouse attaches to the puppeteer browser via its
  CDP debug port instead of self-launching Chrome. This removes the axe/Lighthouse
  contention ("Page/Frame is not ready") and roughly halves browser time/memory.
  Consequence: with `lighthouse` installed but `puppeteer` absent, the Lighthouse
  checks now **skip** instead of running. Install `puppeteer` to keep them.
- `console-log-scan` and `unused-dependencies` are now **AST-based** (TypeScript
  compiler API, via the existing optional `typescript` peer) instead of regex,
  eliminating false positives from matches inside strings and comments. They fall
  back to the prior regex scan when `typescript` is not installed.

### Internal

- Live-pipeline integration tests against a loopback fixture server (zero mocks,
  zero external network) covering the real HTTP/DOM checker pipeline; the test
  suite has grown substantially alongside the features above.

## [1.0.0] - 2026-06-23

First stable release. All 59 registry checkers are implemented and validated; the
browser-based checks (axe accessibility, Lighthouse performance / Core Web Vitals)
have been dogfooded against real sites and are promoted from the 0.6 "pending
validation" status. No checker behaviour changed since 0.6.0 beyond the axe
stability fix below.

### Fixed

- axe analysis now waits for the page to settle (`document.readyState` complete)
  and retries `analyze()` once on a "Page/Frame is not ready" error, fixing flaky
  `a11y-*` failures when axe and Lighthouse run in the same scan (their two
  headless-Chrome instances could race the page's late navigation/redirect).

## [0.6.0] - 2026-06-23

All 59 registry checkers are implemented across **static**, **live**
(HTTP / DOM / TLS / DNS), and **browser** (Lighthouse / axe) modes
(35 -> 59 since 0.5.0). The browser-based checks are gated behind optional peer
dependencies, skip when those peers are absent, and are pending real-site
validation -- hence the 0.6 line rather than 1.0.

### Added

- **Performance (live)** -- `compression-enabled`, `font-preload-and-display-swap`,
  `static-asset-cache-headers` (HTTP/DOM); and the Lighthouse-backed
  `lighthouse-performance-score`, `lighthouse-accessibility-score`,
  `lighthouse-best-practices-score`, `lighthouse-seo-score`, `core-web-vital-lcp`,
  `core-web-vital-cls`, `core-web-vital-inp`.
- **Accessibility (live, axe)** -- `a11y-aria-valid`, `a11y-color-contrast`,
  `a11y-focus-states`, `a11y-image-alt-text`, `a11y-keyboard-tab-order`,
  `a11y-touch-targets`.
- **Security (live)** -- `https-enforcement` (HTTP-to-HTTPS redirect),
  `cors-not-wildcard` (preflight `Access-Control-Allow-Origin`).
- **Deployment (live)** -- `health-endpoint-responds`, `not-found-returns-404`.
- **Dependencies (static)** -- `npm-audit`, `dependencies-outdated`
  (deprecated-package detection via registry lookup), `unused-dependencies`,
  `license-compatibility`.
- **Browser resources** -- a shared `ChromeResource` (puppeteer) backing
  `AxeResource` (`@axe-core/puppeteer`) for accessibility, and an independent
  `LighthouseResource` (lighthouse's bundled `chrome-launcher`) for performance.
  All sit behind injectable adapters; each reports unavailable -- and its
  checkers `skip` -- when its optional peer is not installed.
- **Checker options** -- `cors-policy` (`probePath`), `health-endpoint`
  (`paths`), and `license-compatibility` (`denyList`, `treatProprietaryAsDefault`).
- **Thresholds** -- configurable Lighthouse / Core-Web-Vital limits
  (`lcp`, `cls`, `inp`, `lighthouse-performance`, `lighthouse-accessibility`,
  `lighthouse-best-practices`, `lighthouse-seo`).
- A severity-ceiling guard test asserting every axe- and lighthouse-backed
  checker emits a `severity` equal to its registry `maxSeverity`.

### Fixed

- `compression-enabled` issues its own request advertising
  `Accept-Encoding: gzip, br, zstd` rather than reading the shared rootResponse
  (which is fetched without content negotiation), avoiding false failures.
- `a11y-image-alt-text` and `a11y-touch-targets` severities clamped to their
  registry `maxSeverity` (`major` and `minor` respectively).
- `core-web-vital-inp` reports `skip` / `inp-unavailable` when Lighthouse does
  not measure INP, instead of falsely passing with a 0ms value.
- Subprocess checkers (`typescript-strict-compile`, `npm-audit`, `eslint-passing`,
  `prettier-passing`, `dependencies-outdated`) spawn `.cmd` binaries via a shell
  on Windows, fixing a `spawn EINVAL` that broke them on every Windows run.

### Dependencies

- Added optional peer dependencies `@axe-core/puppeteer` and `lighthouse`
  (alongside `puppeteer`). The browser-based checks also require a
  Chrome/Chromium binary discoverable by chrome-launcher.

## [0.5.0] - 2026-06-19

### Added

- Three http-only live checkers (use the shared HTTP client directly, no new
  resource): `robots-txt-accessible` and `sitemap-xml-accessible` (SEO),
  and `favicon-present` (SEO; `<link rel="icon">` in the DOM or a 200 from
  `/favicon.ico`).

### Fixed

- SSL checkers no longer falsely pass for `http://` URLs: the TLS resource is
  unavailable (checkers skip) unless the scanned URL is https.
- `favicon-present` no longer issues a second network request when the page
  failed to load, avoiding a ~20s double-timeout on unreachable hosts.

## [0.4.0] - 2026-06-19

### Added

- TLS resource (`node:tls`) and DNS resolver (`node:dns/promises`) for live mode.
- Five security checkers (live): `ssl-valid`, `ssl-not-expiring` (consume `tls`);
  `spf-record`, `dmarc-record`, `dkim-record` (consume `dns`, gated by the
  `email-auth` checker option â€” `enabled`, `domain`, `dkimSelectors`).

## [0.3.0] - 2026-06-19

### Added

- DOM resource (cheerio-backed) for live mode: parses the primary URL's HTML
  once per run, shared by SEO and HTML checkers; depends on rootResponse.
- Eight SEO checkers (live, consume `dom`): `title-tag-present`,
  `meta-description-present`, `canonical-url`, `single-h1`,
  `heading-hierarchy`, `structured-data`, `open-graph-tags`,
  `twitter-card-tags`.

### Dependencies

- Added `cheerio` (HTML parsing for the DOM resource).

## [0.2.0] - 2026-06-19

### Added

- Live-check runtime: `launchcheck scan --url <url>` runs live checks against a
  URL. `--url` alone runs live mode; `--url` with `--project-dir` runs combined
  (static + live); no `--url` is static (unchanged). A malformed `--url` is a
  usage error (exit 2).
- Seven **security** header checkers (live, consume the shared rootResponse):
  `hsts-present`, `csp-present`, `x-content-type-options-nosniff`,
  `referrer-policy-present`, `permissions-policy-present`,
  `clickjacking-protection`, `server-headers-suppressed`.
- HTTP client (undici) with manual redirect following and multi-value,
  case-insensitive header access; shared `rootResponse` resource (one fetch per
  run). dom / tls / dns / lighthouse / axe are placeholders pending later phases.

## [0.1.1] - 2026-06-18

Patch release: documentation and packaging corrections. No checker logic changed.

### Fixed

- Release notes and README now list all twelve checkers; the `secret-scan`
  (security) checker shipped in 0.1.0 but was omitted from the 0.1.0 notes.
- `package.json` `bin` path normalized to drop the leading `./`, silencing the
  npm publish-time auto-correction warning.


## [0.1.0] - 2026-06-18

First usable release. The static-analysis core is functional; the live-check
runtime is declared in the registry but not yet implemented.

### Added

- `launchcheck scan` â€” runs the enabled static checkers against a project and
  reports results with a process exit code (2 on any critical fail, 1 on any
  fail, 0 otherwise).
- `launchcheck list` â€” prints the registered checkers; supports `--category`
  filtering and `--json` output.
- Twelve static checkers:
  - **code-quality** â€” `console-log-scan`, `todo-fixme-scan`,
    `gitignore-coverage`, `eslint-passing`, `prettier-passing`,
    `typescript-strict-compile`, `large-files-in-git-history`
  - **deployment** â€” `env-example-exists`, `ci-config-exists`
  - **dependencies** â€” `lockfile-committed`
  - **documentation** â€” `readme-required-sections`
  - **security** â€” `secret-scan`
- Configuration via a `.launchcheckrc` JSON file: per-checker enable/disable,
  `thresholds`, `checkerOptions`, and `ignore` globs.
- Dual ESM/CJS package with bundled type declarations.

### Notes

- Requires Node.js >= 18.
- `typescript` and `puppeteer` are optional peer dependencies, consumed only by
  the checkers that need them.
