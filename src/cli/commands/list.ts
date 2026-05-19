import type { Command } from 'commander';
import { REGISTRY } from '../../internal/registry/index.js';
import type { RegistryEntry } from '../../internal/registry/types.js';
import type { CheckCategory } from '../../types/index.js';
import { formatListJson } from '../format/json.js';
import { formatListTerminal } from '../format/table.js';
import { closestMatch } from '../util/levenshtein.js';

const VALID_CATEGORIES = [
  'code-quality',
  'security',
  'performance',
  'seo',
  'accessibility',
  'dependencies',
  'deployment',
  'documentation',
] as const satisfies ReadonlyArray<CheckCategory>;

export interface ListOptions {
  json?: boolean;
  category?: string;
}

/**
 * Pure function — returns the formatted output string. The CLI wrapper
 * writes it to stdout. Throws Error on invalid input; commander's
 * action handler catches and exits with non-zero status.
 */
export function runList(options: ListOptions): string {
  let entries: ReadonlyArray<RegistryEntry> = REGISTRY;

  if (options.category !== undefined) {
    if (!(VALID_CATEGORIES as ReadonlyArray<string>).includes(options.category)) {
      const suggestion = closestMatch(options.category, VALID_CATEGORIES);
      const suggestionText = suggestion ? ` Did you mean '${suggestion}'?` : '';
      throw new Error(
        `Unknown category: '${options.category}'.${suggestionText} ` +
          `Valid categories: ${VALID_CATEGORIES.join(', ')}.`,
      );
    }
    entries = REGISTRY.filter((e) => e.category === options.category);
  }

  return options.json ? formatListJson(entries) : formatListTerminal(entries);
}

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('Print the registered checkers')
    .option('--json', 'Output as JSON for scripting')
    .option('--category <name>', 'Filter by category name')
    .action((options: ListOptions) => {
      try {
        const output = runList(options);
        process.stdout.write(output);
        if (!output.endsWith('\n')) process.stdout.write('\n');
      } catch (err) {
        process.stderr.write(`error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}
