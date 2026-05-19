# v1 checker registry

This is the canonical enumeration of every checker that ships in v1. New checkers added post-v1 extend this list. The registry is the input to every subsequent checker-implementation dispatch.

## Inventory summary

| Category | Static | Live | Total |
|---|---|---|---|
| code-quality | 7 | 0 | 7 |
| dependencies | 5 | 0 | 5 |
| security | 1 | 14 | 15 |
| performance | 0 | 10 | 10 |
| seo | 0 | 11 | 11 |
| accessibility | 0 | 6 | 6 |
| deployment | 2 | 2 | 4 |
| documentation | 1 | 0 | 1 |
| **Total** | **16** | **43** | **59** |

Plus three orchestrator-authored preflight results (not registered checkers): `__preflight__/dns-resolves`, `__preflight__/host-reachable`, `__preflight__/http-responds`, and one optional orchestrator result `__preflight__/git-available`.

## Threshold-key reference

Read from `ResolvedConfig.thresholds`.

| Key | Default | Unit | Consumed by |
|---|---|---|---|
| `lighthouse-performance` | 90 | 0–100 score | `lighthouse-performance-score` |
| `lighthouse-accessibility` | 90 | 0–100 score | `lighthouse-accessibility-score` |
| `lighthouse-best-practices` | 90 | 0–100 score | `lighthouse-best-practices-score` |
| `lighthouse-seo` | 90 | 0–100 score | `lighthouse-seo-score` |
| `lcp` | 2500 | ms | `core-web-vital-lcp` |
| `cls` | 0.1 | unitless | `core-web-vital-cls` |
| `inp` | 200 | ms | `core-web-vital-inp` |
| `ssl-expiry-warning-days` | 30 | days | `ssl-not-expiring` |
| `large-file-bytes` | 5242880 | bytes (5 MB) | `large-files-in-git-history` |

## checkerOptions-key reference

Read from `ResolvedConfig.checkerOptions`.

| Key | Type | Consumed by |
|---|---|---|
| `secret-scan` | `SecretScanOptions` | `secret-scan` |
| `email-auth` | `EmailAuthOptions` | `spf-record`, `dkim-record`, `dmarc-record` |
| `license-compatibility` | `{ allow?: string[]; deny?: string[]; treatProprietaryAsDefault?: boolean }` | `license-compatibility` |
| `readme-sections` | `{ requiredHeadings?: string[] }` | `readme-required-sections` |
| `health-endpoint` | `{ paths?: string[] }` (default `['/health', '/status']`) | `health-endpoint-responds` |
| `cors-policy` | `{ probePath?: string; origin?: string }` | `cors-not-wildcard` |

## Category: code-quality (7 checkers, all static)

| checkerId | name | max severity | description |
|---|---|---|---|
| `console-log-scan` | No console statements in production code | major | AST/regex scan for `console.log`, `console.debug`, `console.error`, `console.warn`, `debugger` statements in `src/` and equivalent (excludes test files matching `*.test.*`, `*.spec.*`, `__tests__/**`). |
| `todo-fixme-scan` | No TODO/FIXME markers in production code | minor | Regex scan for `TODO`, `FIXME`, `XXX`, `HACK` comments in source files, excluding test files. |
| `typescript-strict-compile` | TypeScript strict mode + zero errors | major | Detects `tsconfig.json`; if `strict: true`, runs `tsc --noEmit` and parses output for diagnostics. Skips when no tsconfig. Requires `typescript` peer dep. |
| `eslint-passing` | ESLint configured and passing | major | Detects ESLint config (`.eslintrc*`, `eslint.config.*`, or `eslintConfig` in package.json); runs `npx eslint .` and parses JSON output. Skips when no config. |
| `prettier-passing` | Prettier configured and passing | minor | Detects Prettier config (`.prettierrc*`, `prettier.config.*`, `prettier` in package.json); runs `npx prettier --check .`. Skips when no config. |
| `gitignore-coverage` | .gitignore covers required patterns | major | Reads `<projectDir>/.gitignore`; checks for required patterns: `node_modules`, `.env*`, `dist`, build output, `.DS_Store`, IDE configs. Emits one result per missing pattern category. |
| `large-files-in-git-history` | No large files in git history | minor | Walks git history filtered to `projectDir` (monorepo policy); flags any tracked file exceeding `thresholds.large-file-bytes`. Skips when `gitRoot === null`. |

## Category: dependencies (5 checkers, all static)

| checkerId | name | max severity | options | description |
|---|---|---|---|---|
| `npm-audit` | No critical vulnerabilities | critical | — | Runs `npm audit --json`; fails on any `critical`, warns on `high`, ignores moderate/low. Severity escalates to `critical` on any critical finding. |
| `dependencies-outdated` | No deprecated dependencies | major | — | Runs `npm outdated --json` plus a registry query (or parses npm's deprecation flag) to flag deprecated packages. Outdated-but-not-deprecated is `info`-level. |
| `license-compatibility` | No copyleft licenses in proprietary projects | major | `license-compatibility` | Walks dependency tree, checks SPDX license identifier. Default deny list: GPL-*, AGPL-*, LGPL-* (configurable). Skips when `treatProprietaryAsDefault: false` in options. |
| `unused-dependencies` | No unused dependencies | minor | — | Cross-references `package.json` `dependencies` against import/require statements in `src/`. Excludes obvious peer/dev deps. Heuristic — high FP risk; default severity `info`, can be elevated via config. |
| `lockfile-committed` | Lockfile committed to repo | major | — | Checks `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` is tracked at `<projectDir>` (monorepo-scoped). Skips when `gitRoot === null`. |

## Category: security (15 checkers)

### Static (1)

| checkerId | name | mode | max severity | options |
|---|---|---|---|---|
| `secret-scan` | No hardcoded secrets | static | critical | `secret-scan` |

### Live — security headers (9, all consume `rootResponse`)

| checkerId | name | max severity | options | description |
|---|---|---|---|---|
| `https-enforcement` | HTTP redirects to HTTPS | critical | — | GET against `http://` variant of URL; expects redirect chain ending at `https://`. Also consumes ad-hoc `http`. |
| `hsts-present` | Strict-Transport-Security header present | critical | — | Header check + parses `max-age`; warns if max-age < 15768000 (6 months). |
| `csp-present` | Content-Security-Policy header present | major | — | Header check; warns if uses `unsafe-inline` or `unsafe-eval` without nonce/hash. |
| `x-content-type-options-nosniff` | X-Content-Type-Options: nosniff | major | — | Header equals `nosniff`. |
| `clickjacking-protection` | X-Frame-Options or CSP frame-ancestors | major | — | Either `X-Frame-Options: DENY/SAMEORIGIN` OR CSP with `frame-ancestors` directive. |
| `referrer-policy-present` | Referrer-Policy header present | minor | — | Any valid Referrer-Policy value. |
| `permissions-policy-present` | Permissions-Policy header present | minor | — | Header presence; no value validation in v1. |
| `server-headers-suppressed` | Server / X-Powered-By suppressed | major | — | `Server` and `X-Powered-By` headers absent or generic (no version info). |
| `cors-not-wildcard` | CORS not wildcard in production | critical | `cors-policy` | OPTIONS request via configured `probePath` (default `/`); checks `Access-Control-Allow-Origin` is not `*`. Also consumes ad-hoc `http`. |

### Live — TLS/SSL (2, consume `tls`)

| checkerId | name | max severity | thresholds |
|---|---|---|---|
| `ssl-valid` | SSL certificate valid | critical | — |
| `ssl-not-expiring` | SSL certificate not expiring within N days | major | `ssl-expiry-warning-days` |

### Live — email auth (3, consume `dns`, gated by `email-auth.enabled`)

| checkerId | name | max severity | options |
|---|---|---|---|
| `spf-record` | SPF record present | major | `email-auth` |
| `dkim-record` | DKIM record present for each configured selector | major | `email-auth` |
| `dmarc-record` | DMARC record present | minor | `email-auth` |

## Category: performance (10 checkers, all live)

### Consume `lighthouse` (7)

| checkerId | name | max severity | thresholds |
|---|---|---|---|
| `lighthouse-performance-score` | Lighthouse Performance ≥ threshold | major | `lighthouse-performance` |
| `lighthouse-accessibility-score` | Lighthouse Accessibility ≥ threshold | major | `lighthouse-accessibility` |
| `lighthouse-best-practices-score` | Lighthouse Best Practices ≥ threshold | major | `lighthouse-best-practices` |
| `lighthouse-seo-score` | Lighthouse SEO ≥ threshold | major | `lighthouse-seo` |
| `core-web-vital-lcp` | LCP < threshold | major | `lcp` |
| `core-web-vital-cls` | CLS < threshold | major | `cls` |
| `core-web-vital-inp` | INP < threshold | major | `inp` |

### Consume `rootResponse` / `dom` / ad-hoc HTTP (3)

| checkerId | name | max severity | consumes | description |
|---|---|---|---|---|
| `compression-enabled` | Gzip/Brotli on text responses | major | `rootResponse` | Sends request with `Accept-Encoding: gzip, br`; checks `Content-Encoding` in response. |
| `static-asset-cache-headers` | Cache-Control on static assets | minor | `dom`, `http` | Extracts `<script>`, `<link rel="stylesheet">`, `<img>` URLs from DOM; HEAD each; checks `Cache-Control` is long-lived (max-age ≥ 86400). Emits one consolidated result per asset class. |
| `font-preload-and-display-swap` | Fonts preloaded + font-display: swap | minor | `dom`, `http` | Checks `<link rel="preload" as="font">` for primary fonts; fetches CSS, scans for `font-display: swap`. |

## Category: seo (11 checkers, all live, all consume `dom`)

| checkerId | name | max severity | consumes | description |
|---|---|---|---|---|
| `title-tag-present` | Unique title tag present | major | `dom` | `<title>` exists, non-empty, length 10–60 chars (warn outside range). |
| `meta-description-present` | Meta description present | major | `dom` | `<meta name="description">` exists, non-empty, length 50–160 (warn outside). |
| `single-h1` | Exactly one H1 per page | major | `dom` | Count of `<h1>` elements === 1. |
| `heading-hierarchy` | No skipped heading levels | minor | `dom` | Walks heading tree, flags level jumps (e.g., h2 → h4). |
| `canonical-url` | Canonical URL set | major | `dom` | `<link rel="canonical" href="...">` exists. |
| `open-graph-tags` | og:title, og:description, og:image present | minor | `dom` | All three `<meta property="og:*">` tags present. Multi-result: one per missing tag. |
| `twitter-card-tags` | Twitter Card tags present | minor | `dom` | `<meta name="twitter:card">` and at least one of `twitter:title`/`twitter:description`. Multi-result: one per missing tag. |
| `sitemap-xml-accessible` | sitemap.xml fetchable | major | `http` | GET `/sitemap.xml`; expects 200 + valid XML. |
| `robots-txt-accessible` | robots.txt fetchable and not blocking production | major | `http` | GET `/robots.txt`; expects 200; warns if `Disallow: /` is set. |
| `structured-data` | JSON-LD structured data present | minor | `dom` | At least one `<script type="application/ld+json">` block with parseable JSON. |
| `favicon-present` | Favicon present | minor | `dom`, `http` | `<link rel="icon">` in DOM OR `/favicon.ico` returns 200. |

## Category: accessibility (6 checkers, all live, all consume `axe`)

Each checker reads `ctx.live.axe.get()` and filters violations by axe rule ID.

| checkerId | name | max severity | axe rule(s) consumed |
|---|---|---|---|
| `a11y-image-alt-text` | All images have alt text | major | `image-alt`, `area-alt`, `input-image-alt` |
| `a11y-color-contrast` | Color contrast meets WCAG AA | major | `color-contrast` |
| `a11y-focus-states` | Focus states on interactive elements | major | `focus-order-semantics`, `focusable-content` |
| `a11y-touch-targets` | Touch targets ≥ 44x44px | minor | `target-size` |
| `a11y-aria-valid` | ARIA attributes used correctly | major | All `aria-*` axe rules (consolidated) |
| `a11y-keyboard-tab-order` | Logical tab order (partial automation) | major | `tabindex`, `landmark-*` rules; partial signal — axe cannot fully verify keyboard nav. |

## Category: deployment (4 checkers)

### Static (2)

| checkerId | name | max severity | description |
|---|---|---|---|
| `env-example-exists` | .env.example or .env.template present | minor | Detects presence of any `.env*example` or `.env*template` file in projectDir. |
| `ci-config-exists` | CI configuration present | minor | Detects `.github/workflows/`, `.gitlab-ci.yml`, `circleci/config.yml`, `Jenkinsfile`, or `.buildkite/`. |

### Live (2)

| checkerId | name | max severity | consumes | options | description |
|---|---|---|---|---|---|
| `health-endpoint-responds` | Health endpoint returns 2xx | major | `http` | `health-endpoint` | Tries each configured path; passes if any returns 2xx; warns if all return 404; fails if all return 5xx or unreachable. |
| `not-found-returns-404` | Unknown path returns HTTP 404 | minor | `http` | — | GETs a deliberately bad path (`/__launchcheck-404-probe`); expects status 404, not 200-with-error-page. |

## Category: documentation (1 checker, static)

| checkerId | name | max severity | options | description |
|---|---|---|---|---|
| `readme-required-sections` | README.md exists with required sections | minor | `readme-sections` | Checks `<projectDir>/README.md` exists; scans for headings matching `Setup`/`Install`, `Environment`/`Configuration`, `Usage`. Configurable via `readme-sections.requiredHeadings`. |

## Multi-result checkers

Default contract: 1 checker → 1 result. The following v1 checkers emit multiple results from a single invocation:

| Checker | resultId pattern | Notes |
|---|---|---|
| `secret-scan` | one per finding; resultId is `<patternId>-<sha1-of-location>` for stability | One pattern match = one result |
| `gitignore-coverage` | one per missing required-pattern group: `node-modules`, `env-files`, `build-output`, `os-files`, `ide-configs` | Five fixed result IDs |
| `npm-audit` | one per package with critical vulns: resultId is the package name | Aggregates by package |
| `open-graph-tags` | one per missing tag: e.g., `og-title-missing`, `og-image-missing` | Up to five fixed result IDs |
| `twitter-card-tags` | one per missing tag | Up to five fixed result IDs |
| `static-asset-cache-headers` | one per non-cached asset class: `script`, `stylesheet`, `image`, `font` | Four fixed result IDs |

All others emit a single result whose resultId equals the checkerId.

## Resource consumption matrix (live checkers only)

| Resource | Consumed by |
|---|---|
| `rootResponse` | All 9 security-headers checkers, `compression-enabled`, `cors-not-wildcard` |
| `dom` | All 11 SEO checkers, `static-asset-cache-headers`, `font-preload-and-display-swap`, `favicon-present` |
| `lighthouse` | 7 performance checkers (4 score, 3 CWV) |
| `axe` | 6 accessibility checkers |
| `tls` | `ssl-valid`, `ssl-not-expiring` |
| `dns` | `spf-record`, `dkim-record`, `dmarc-record` |
| ad-hoc `http` | `sitemap-xml-accessible`, `robots-txt-accessible`, `favicon-present`, `static-asset-cache-headers`, `font-preload-and-display-swap`, `health-endpoint-responds`, `not-found-returns-404`, `https-enforcement`, `cors-not-wildcard` |

## Default-enabled state

All 59 checkers default to `enabled: true`. The three email-auth checkers run but self-skip at runtime when `checkerOptions['email-auth'].enabled !== true`. The `license-compatibility` checker self-skips when `treatProprietaryAsDefault === false`.

## Registry file location

The registry lives at `src/internal/registry/`. Each checker entry conforms to the `RegistryEntry` interface at `src/internal/registry/types.ts`. The eight categories are sub-modules under `src/internal/registry/categories/`. The registry is internal — not exported through the public package surface.
