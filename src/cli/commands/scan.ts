import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { Command } from 'commander';
import { ConfigError, type RawConfig, loadConfigFile } from '../../internal/config/load.js';
import { resolveConfig } from '../../internal/config/resolve.js';
import { crawl } from '../../internal/crawl/crawl.js';
import { collectSitemapUrls } from '../../internal/crawl/sitemap.js';
import { type RunLiveChecksOptions, runLiveChecks } from '../../internal/orchestrator/run-live.js';
import {
  type RunStaticChecksOptions,
  runStaticChecks,
} from '../../internal/orchestrator/run-static.js';
import {
  baselineExitCode,
  baselineSummary,
  diffBaseline,
  parseBaseline,
  serializeBaseline,
} from '../../internal/reporter/baseline.js';
import { computeExitCode } from '../../internal/reporter/exit-code.js';
import { formatHtml } from '../../internal/reporter/html.js';
import { formatJunit } from '../../internal/reporter/junit.js';
import { formatSarif } from '../../internal/reporter/sarif.js';
import { formatTerminal } from '../../internal/reporter/terminal.js';
import { DefaultHttpClient } from '../../internal/runtime/http-client.js';
import type { CheckResult, Checker, HttpClient } from '../../types/index.js';

export type OutputFormat = 'terminal' | 'sarif' | 'junit' | 'html';

/** Renders results in the requested format. */
function formatResults(
  results: CheckResult[],
  format: OutputFormat,
  color: boolean,
  summary: boolean,
): string {
  if (format === 'sarif') {
    return formatSarif(results);
  }
  if (format === 'junit') {
    return formatJunit(results);
  }
  if (format === 'html') {
    return formatHtml(results);
  }
  return formatTerminal(results, { color, summary });
}

const DEFAULT_BASELINE = '.launchcheck-baseline.json';

/**
 * Produces the final ScanResult: applies the baseline gate when requested.
 * - updateBaseline: write the current findings' fingerprints and exit 0.
 * - baseline: gate the exit code on NEW findings only; append a summary in
 *   terminal mode. A missing/invalid baseline file is a usage error (exit 2).
 */
async function finalize(
  results: CheckResult[],
  format: OutputFormat,
  color: boolean,
  summary: boolean,
  baseDir: string,
  baseline: string | undefined,
  updateBaseline: boolean,
): Promise<ScanResult> {
  if (updateBaseline) {
    const target = path.resolve(baseDir, baseline ?? DEFAULT_BASELINE);
    await writeFile(target, serializeBaseline(results));
    return { stdout: `Wrote baseline to ${target}\n`, stderr: '', exitCode: 0 };
  }
  if (baseline === undefined) {
    return {
      stdout: formatResults(results, format, color, summary),
      stderr: '',
      exitCode: computeExitCode(results),
    };
  }
  const target = path.resolve(baseDir, baseline);
  let text: string;
  try {
    text = await readFile(target, 'utf8');
  } catch {
    return {
      stdout: '',
      stderr: `error: baseline file not found: ${target} (run --update-baseline to create it)\n`,
      exitCode: 2,
    };
  }
  let accepted: Set<string>;
  try {
    accepted = parseBaseline(text);
  } catch (err) {
    return { stdout: '', stderr: formatGenericError(err), exitCode: 2 };
  }
  const diff = diffBaseline(results, accepted);
  const stdout =
    format === 'terminal'
      ? `${formatResults(results, format, color, summary)}\n${baselineSummary(diff)}\n`
      : formatResults(results, format, color, summary);
  return { stdout, stderr: '', exitCode: baselineExitCode(diff) };
}

/** Options for runScan (static mode). */
export interface ScanOptions {
  /** Project directory to scan. Default: process.cwd(). */
  projectDir?: string;
  /** ANSI colors in stdout. Default: false. */
  color?: boolean;
  /** Output format. Default: 'terminal'. */
  format?: OutputFormat;
  /** Terminal summary mode: only fail/warn findings + counts. */
  summary?: boolean;
  /** Path to a baseline file; gate exit code on new findings only. */
  baseline?: string;
  /** Write the current findings as the baseline and exit 0. */
  updateBaseline?: boolean;
  /** Test-only override of ALL_CHECKERS; still validated against the registry. */
  checkers?: ReadonlyArray<Checker>;
}

/** Options for runLiveScan (live / combined mode). */
export interface LiveScanOptions {
  /** Single URL under test. Required unless `urls` is provided. */
  url?: string;
  /** Multiple URLs to test; live checkers run once per URL, tagged by URL. */
  urls?: string[];
  /** Fetch this sitemap.xml and add its page URLs to the target list. */
  sitemap?: string;
  /** Crawl same-origin links from the seed URL and add them to the target list. */
  crawl?: boolean;
  /** Cap for --crawl page discovery. Default 20. */
  maxPages?: number;
  /** Cap for --sitemap URL ingestion. Default 50. */
  maxSitemapUrls?: number;
  /** Honor robots.txt during --crawl. Default true. */
  respectRobots?: boolean;
  /** Terminal summary mode: only fail/warn findings + counts. */
  summary?: boolean;
  /** Test seam: HttpClient used for sitemap/crawl URL discovery. */
  httpClient?: HttpClient;
  /** When provided, the run is 'combined' (static + live); otherwise 'live'. */
  projectDir?: string;
  /** ANSI colors in stdout. Default: false. */
  color?: boolean;
  /** Output format. Default: 'terminal'. */
  format?: OutputFormat;
  /** Path to a baseline file; gate exit code on new findings only. */
  baseline?: string;
  /** Write the current findings as the baseline and exit 0. */
  updateBaseline?: boolean;
  /** Test-only override of ALL_CHECKERS. */
  checkers?: ReadonlyArray<Checker>;
}

/** Output of a scan — three discrete streams the CLI wrapper writes. */
export interface ScanResult {
  stdout: string;
  stderr: string;
  exitCode: 0 | 1 | 2;
}

/**
 * Static-mode scan pipeline: load + resolve config, run the orchestrator,
 * format the results, compute the exit code. Pure with respect to
 * process.exit and stdout.
 */
export async function runScan(options: ScanOptions = {}): Promise<ScanResult> {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const color = options.color ?? false;

  let fileConfig: RawConfig | null;
  try {
    fileConfig = await loadConfigFile(projectDir);
  } catch (err) {
    if (err instanceof ConfigError) {
      return { stdout: '', stderr: formatConfigError(err), exitCode: 2 };
    }
    return { stdout: '', stderr: formatGenericError(err), exitCode: 2 };
  }

  const config = resolveConfig({ projectDir, fileConfig });

  let results: CheckResult[];
  try {
    const orchestratorOptions: RunStaticChecksOptions = { projectDir, config };
    if (options.checkers !== undefined) {
      orchestratorOptions.checkers = options.checkers;
    }
    results = await runStaticChecks(orchestratorOptions);
  } catch (err) {
    return { stdout: '', stderr: formatGenericError(err), exitCode: 2 };
  }

  return finalize(
    results,
    options.format ?? 'terminal',
    color,
    options.summary ?? false,
    projectDir,
    options.baseline,
    options.updateBaseline ?? false,
  );
}

/**
 * Live / combined scan pipeline. Validates the URL (must be http/https),
 * loads + resolves config from projectDir when combined, runs the live
 * orchestrator, formats, and computes the exit code. A malformed URL is a
 * usage error (exit 2) — never a silent fallback to static.
 */
export async function runLiveScan(options: LiveScanOptions): Promise<ScanResult> {
  const color = options.color ?? false;

  const explicit =
    options.urls !== undefined && options.urls.length > 0
      ? options.urls
      : options.url !== undefined
        ? [options.url]
        : [];

  // Discover additional targets from a sitemap and/or a same-origin crawl.
  const discovered: string[] = [];
  if (options.sitemap !== undefined || options.crawl === true) {
    const http = options.httpClient ?? new DefaultHttpClient();
    try {
      if (options.sitemap !== undefined) {
        const sitemapOpts =
          options.maxSitemapUrls !== undefined ? { maxUrls: options.maxSitemapUrls } : {};
        discovered.push(...(await collectSitemapUrls(http, options.sitemap, sitemapOpts)));
      }
      if (options.crawl === true) {
        const seed = explicit[0] ?? options.url;
        if (seed === undefined) {
          return { stdout: '', stderr: 'error: --crawl requires --url (a seed)\n', exitCode: 2 };
        }
        const crawlOpts: { maxPages?: number; respectRobots?: boolean } = {};
        if (options.maxPages !== undefined) crawlOpts.maxPages = options.maxPages;
        if (options.respectRobots === false) crawlOpts.respectRobots = false;
        discovered.push(...(await crawl(http, seed, crawlOpts)));
      }
    } catch (err) {
      return {
        stdout: '',
        stderr: `error: URL discovery failed: ${(err as Error).message}\n`,
        exitCode: 2,
      };
    }
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const u of [...explicit, ...discovered]) {
    if (!seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  }
  if (urls.length === 0) {
    return { stdout: '', stderr: 'error: provide --url, --urls, or --sitemap\n', exitCode: 2 };
  }
  for (const u of urls) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return { stdout: '', stderr: `error: invalid URL '${u}'\n`, exitCode: 2 };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        stdout: '',
        stderr: `error: URLs must use http or https, got '${parsed.protocol}' in '${u}'\n`,
        exitCode: 2,
      };
    }
  }

  const runOptions: RunLiveChecksOptions = { urls };
  if (options.checkers !== undefined) {
    runOptions.checkers = options.checkers;
  }

  if (options.projectDir !== undefined) {
    const projectDir = path.resolve(options.projectDir);
    let fileConfig: RawConfig | null;
    try {
      fileConfig = await loadConfigFile(projectDir);
    } catch (err) {
      if (err instanceof ConfigError) {
        return { stdout: '', stderr: formatConfigError(err), exitCode: 2 };
      }
      return { stdout: '', stderr: formatGenericError(err), exitCode: 2 };
    }
    runOptions.projectDir = projectDir;
    runOptions.config = resolveConfig({
      projectDir,
      fileConfig,
      cliOverrides: { url: urls[0] as string },
    });
  }

  let results: CheckResult[];
  try {
    results = await runLiveChecks(runOptions);
  } catch (err) {
    return { stdout: '', stderr: formatGenericError(err), exitCode: 2 };
  }

  return finalize(
    results,
    options.format ?? 'terminal',
    color,
    options.summary ?? false,
    options.projectDir !== undefined ? path.resolve(options.projectDir) : process.cwd(),
    options.baseline,
    options.updateBaseline ?? false,
  );
}

function formatConfigError(err: ConfigError): string {
  const where = err.source !== undefined ? ` (${err.source})` : '';
  return `error: ${err.message}${where}\n`;
}

function formatGenericError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `error: ${msg}\n`;
}

/** Wires the `scan` subcommand into the commander program. */
export function registerScanCommand(program: Command): void {
  program
    .command('scan')
    .description('Run pre-launch checks. Static by default; --url adds live checks.')
    .option('--project-dir <path>', 'Path to the project directory (default: cwd)')
    .option('--url <url>', 'URL to run live checks against (live or combined mode)')
    .option('--urls <list>', 'Comma-separated URLs to run live checks against (multi-URL)')
    .option('--sitemap <url>', 'Fetch a sitemap.xml and scan the page URLs it lists')
    .option('--crawl', 'Crawl same-origin links from the seed --url (bounded)')
    .option('--max-pages <n>', 'Max pages for --crawl discovery (default 20)')
    .option('--max-sitemap-urls <n>', 'Max URLs ingested from --sitemap (default 50)')
    .option('--no-robots', 'Ignore robots.txt during --crawl')
    .option('--summary', 'Terminal: print only fail/warn findings and the counts line')
    .option('--no-color', 'Disable ANSI colors in output')
    .option(
      '--format <format>',
      'Output format: terminal | sarif | junit | html (default: terminal)',
    )
    .option('--baseline <file>', 'Baseline file; gate exit code on new findings only')
    .option('--update-baseline', 'Write current findings as the baseline and exit 0')
    .action(
      async (options: {
        projectDir?: string;
        url?: string;
        urls?: string;
        sitemap?: string;
        crawl?: boolean;
        maxPages?: string;
        maxSitemapUrls?: string;
        robots?: boolean;
        summary?: boolean;
        color?: boolean;
        format?: string;
        baseline?: string;
        updateBaseline?: boolean;
      }) => {
        const colorEnabled = options.color !== false && process.stdout.isTTY === true;
        const format = options.format ?? 'terminal';
        if (
          format !== 'terminal' &&
          format !== 'sarif' &&
          format !== 'junit' &&
          format !== 'html'
        ) {
          process.stderr.write(
            `error: invalid --format '${format}' (use terminal | sarif | junit | html)\n`,
          );
          process.exit(2);
        }

        const urlList =
          options.urls !== undefined
            ? options.urls
                .split(',')
                .map((u) => u.trim())
                .filter((u) => u.length > 0)
            : undefined;

        const maxPagesNum =
          options.maxPages !== undefined ? Number.parseInt(options.maxPages, 10) : undefined;

        let result: ScanResult;
        if (
          options.url !== undefined ||
          urlList !== undefined ||
          options.sitemap !== undefined ||
          options.crawl === true
        ) {
          // live (url[s]/sitemap/crawl) or combined (+ explicit project-dir)
          const liveOptions: LiveScanOptions = { color: colorEnabled, format };
          if (options.url !== undefined) {
            liveOptions.url = options.url;
          }
          if (urlList !== undefined) {
            liveOptions.urls = urlList;
          }
          if (options.sitemap !== undefined) {
            liveOptions.sitemap = options.sitemap;
          }
          if (options.crawl === true) {
            liveOptions.crawl = true;
          }
          if (maxPagesNum !== undefined && Number.isFinite(maxPagesNum) && maxPagesNum > 0) {
            liveOptions.maxPages = maxPagesNum;
          }
          const maxSitemapNum =
            options.maxSitemapUrls !== undefined
              ? Number.parseInt(options.maxSitemapUrls, 10)
              : undefined;
          if (maxSitemapNum !== undefined && Number.isFinite(maxSitemapNum) && maxSitemapNum > 0) {
            liveOptions.maxSitemapUrls = maxSitemapNum;
          }
          if (options.robots === false) {
            liveOptions.respectRobots = false;
          }
          if (options.summary === true) {
            liveOptions.summary = true;
          }
          if (options.projectDir !== undefined) {
            liveOptions.projectDir = options.projectDir;
          }
          if (options.baseline !== undefined) {
            liveOptions.baseline = options.baseline;
          }
          if (options.updateBaseline === true) {
            liveOptions.updateBaseline = true;
          }
          result = await runLiveScan(liveOptions);
        } else {
          const runOptions: ScanOptions = { color: colorEnabled, format };
          if (options.summary === true) {
            runOptions.summary = true;
          }
          if (options.projectDir !== undefined) {
            runOptions.projectDir = options.projectDir;
          }
          if (options.baseline !== undefined) {
            runOptions.baseline = options.baseline;
          }
          if (options.updateBaseline === true) {
            runOptions.updateBaseline = true;
          }
          result = await runScan(runOptions);
        }

        if (result.stdout.length > 0) process.stdout.write(result.stdout);
        if (result.stderr.length > 0) process.stderr.write(result.stderr);
        process.exit(result.exitCode);
      },
    );
}
