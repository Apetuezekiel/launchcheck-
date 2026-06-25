import type { CheckResult } from '../../types/index.js';
import { REGISTRY } from '../registry/index.js';

/** Options for formatTerminal. */
export interface FormatTerminalOptions {
  /**
   * ANSI colors. Default: false (deterministic — safe for tests and pipes).
   * The CLI flips this to true when stdout.isTTY.
   */
  color?: boolean;
  /**
   * Summary mode: print only fail/warn findings, one terse line each, plus the
   * counts line. A quick triage view; pass/skip are omitted.
   */
  summary?: boolean;
}

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

/** Canonical category order, derived from the registry. */
const CATEGORY_ORDER: ReadonlyArray<string> = Array.from(new Set(REGISTRY.map((e) => e.category)));

/** Status display order within a category: fails first, then warns, skips, passes. */
const STATUS_ORDER: Record<CheckResult['status'], number> = {
  fail: 0,
  warn: 1,
  skip: 2,
  pass: 3,
};

interface Colorizers {
  bold: (s: string) => string;
  dim: (s: string) => string;
  red: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  cyan: (s: string) => string;
  gray: (s: string) => string;
}

/**
 * Formats a CheckResult[] into a human-readable terminal string. Pure —
 * does not write to stdout. The CLI is responsible for printing.
 *
 * Layout: one block per category in canonical registry order, then any
 * unknown categories alphabetically. Each block lists its results sorted
 * by (status: fail > warn > skip > pass, then checkerId, then resultId).
 * Empty categories are omitted. Final summary line counts results by
 * status.
 */
export function formatTerminal(
  results: ReadonlyArray<CheckResult>,
  options: FormatTerminalOptions = {},
): string {
  const c = colorizers(options.color ?? false);

  if (results.length === 0) {
    return 'launchcheck: no results.\n';
  }

  const counts = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const r of results) {
    counts[r.status] += 1;
  }
  const summaryLine = `Summary: ${c.green(`${counts.pass} passed`)}, ${c.red(`${counts.fail} failed`)}, ${c.yellow(`${counts.warn} warned`)}, ${c.gray(`${counts.skip} skipped`)}`;

  if (options.summary === true) {
    const problems = results
      .filter((r) => r.status === 'fail' || r.status === 'warn')
      .sort(compareResults);
    const out: string[] = [];
    for (const r of problems) {
      const where =
        r.url !== undefined
          ? ` ${r.url}`
          : r.location !== undefined
            ? ` ${formatLocation(r.location)}`
            : '';
      out.push(
        `${statusGlyph(r.status, c)}  ${c.bold(`${r.checkerId}/${r.resultId}`)}${c.dim(where)}  ${r.message}`,
      );
    }
    out.push(summaryLine);
    return `${out.join('\n')}\n`;
  }

  const grouped = new Map<string, CheckResult[]>();
  for (const r of results) {
    const arr = grouped.get(r.category);
    if (arr === undefined) {
      grouped.set(r.category, [r]);
    } else {
      arr.push(r);
    }
  }

  const knownInOrder = CATEGORY_ORDER.filter((cat) => grouped.has(cat));
  const unknown = [...grouped.keys()].filter((k) => !CATEGORY_ORDER.includes(k)).sort();
  const orderedCategories = [...knownInOrder, ...unknown];

  const lines: string[] = [];
  for (const category of orderedCategories) {
    const items = grouped.get(category);
    if (items === undefined || items.length === 0) continue;
    lines.push(c.bold(category));
    items.sort(compareResults);
    for (const r of items) {
      lines.push(...formatOne(r, c));
    }
    lines.push('');
  }

  lines.push(summaryLine);

  return `${lines.join('\n')}\n`;
}

function colorizers(enabled: boolean): Colorizers {
  if (!enabled) {
    const noop = (s: string): string => s;
    return { bold: noop, dim: noop, red: noop, green: noop, yellow: noop, cyan: noop, gray: noop };
  }
  return {
    bold: (s) => `${ANSI.bold}${s}${ANSI.reset}`,
    dim: (s) => `${ANSI.dim}${s}${ANSI.reset}`,
    red: (s) => `${ANSI.red}${s}${ANSI.reset}`,
    green: (s) => `${ANSI.green}${s}${ANSI.reset}`,
    yellow: (s) => `${ANSI.yellow}${s}${ANSI.reset}`,
    cyan: (s) => `${ANSI.cyan}${s}${ANSI.reset}`,
    gray: (s) => `${ANSI.gray}${s}${ANSI.reset}`,
  };
}

function compareResults(a: CheckResult, b: CheckResult): number {
  const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (s !== 0) return s;
  if (a.checkerId !== b.checkerId) return a.checkerId < b.checkerId ? -1 : 1;
  if (a.resultId < b.resultId) return -1;
  if (a.resultId > b.resultId) return 1;
  return 0;
}

function statusGlyph(status: CheckResult['status'], c: Colorizers): string {
  switch (status) {
    case 'pass':
      return c.green('PASS');
    case 'fail':
      return c.red('FAIL');
    case 'warn':
      return c.yellow('WARN');
    case 'skip':
      return c.gray('SKIP');
  }
}

function formatLocation(loc: { file: string; line?: number; column?: number }): string {
  if (loc.line === undefined) return loc.file;
  if (loc.column === undefined) return `${loc.file}:${loc.line}`;
  return `${loc.file}:${loc.line}:${loc.column}`;
}

function formatOne(r: CheckResult, c: Colorizers): string[] {
  const id = c.bold(`${r.checkerId}/${r.resultId}`);
  const meta: string[] = [`[${r.severity}]`];
  if (r.durationMs !== undefined) meta.push(`${Math.round(r.durationMs)}ms`);
  const out: string[] = [`  ${statusGlyph(r.status, c)}  ${id} ${c.dim(meta.join(' '))}`];
  out.push(`    ${r.message}`);
  if (r.url !== undefined) {
    out.push(`    ${c.dim(`url: ${r.url}`)}`);
  }
  if (r.detail !== undefined && r.detail.length > 0) {
    for (const line of r.detail.split('\n')) {
      out.push(`    ${c.dim(line)}`);
    }
  }
  if (r.location !== undefined) {
    out.push(`    ${c.dim(`at ${formatLocation(r.location)}`)}`);
  }
  if (r.fix !== undefined) {
    out.push(`    ${c.cyan(`fix: ${r.fix}`)}`);
  }
  return out;
}
