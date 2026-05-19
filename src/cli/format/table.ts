import chalk from 'chalk';
import type { RegistryEntry } from '../../internal/registry/types.js';
import type { Severity } from '../../types/index.js';
import { LAUNCHCHECK_VERSION } from '../version.js';

const SEVERITY_COLOR: Record<Severity, (s: string) => string> = {
  critical: chalk.red.bold,
  major: chalk.yellow,
  minor: chalk.cyan,
  info: chalk.gray,
};

const ID_WIDTH = 32;
const MODE_WIDTH = 6;
const DEFAULT_WIDTH = 7;
const SEVERITY_WIDTH = 8;

function pad(s: string, width: number): string {
  return s.length >= width ? `${s} ` : s + ' '.repeat(width - s.length);
}

/**
 * Render the registry as a grouped terminal table. Categories appear
 * in REGISTRY iteration order (declaration order from the registry
 * index module). Within each category, entries appear in their
 * already-alphabetized file order.
 */
export function formatListTerminal(entries: ReadonlyArray<RegistryEntry>): string {
  const lines: string[] = [];
  const entryWord = entries.length === 1 ? 'entry' : 'entries';
  lines.push(
    chalk.bold(
      `launchcheck v${LAUNCHCHECK_VERSION} — checker registry (${entries.length} ${entryWord})`,
    ),
  );
  lines.push('');

  // Group by category, preserving order of first appearance.
  const grouped = new Map<string, RegistryEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.category);
    if (list) list.push(entry);
    else grouped.set(entry.category, [entry]);
  }

  const header =
    chalk.dim(pad('  id', ID_WIDTH + 2)) +
    chalk.dim(pad('mode', MODE_WIDTH)) +
    chalk.dim(pad('default', DEFAULT_WIDTH)) +
    chalk.dim(pad('severity', SEVERITY_WIDTH)) +
    chalk.dim('description');

  for (const [category, list] of grouped) {
    lines.push(chalk.bold.underline(`${category} (${list.length})`));
    lines.push(header);
    for (const entry of list) {
      const sevColor = SEVERITY_COLOR[entry.maxSeverity];
      lines.push(
        `  ${pad(entry.id, ID_WIDTH)}${pad(entry.mode, MODE_WIDTH)}${pad(
          entry.defaultEnabled ? 'on' : 'off',
          DEFAULT_WIDTH,
        )}${sevColor(pad(entry.maxSeverity, SEVERITY_WIDTH))}${chalk.dim(entry.description)}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
