import * as path from 'node:path';
import type { Command } from 'commander';
import { ConfigError, type RawConfig, loadConfigFile } from '../../internal/config/load.js';
import { resolveConfig } from '../../internal/config/resolve.js';
import { runStaticChecks } from '../../internal/orchestrator/run-static.js';
import { computeExitCode } from '../../internal/reporter/exit-code.js';
import { formatTerminal } from '../../internal/reporter/terminal.js';
import type { CheckResult } from '../../types/index.js';

/** Options for runScan. */
export interface ScanOptions {
  /** Project directory to scan. Default: process.cwd(). */
  projectDir?: string;
  /** ANSI colors in stdout. Default: false. */
  color?: boolean;
}

/** Output of runScan — three discrete streams the CLI wrapper writes. */
export interface ScanResult {
  stdout: string;
  stderr: string;
  exitCode: 0 | 1 | 2;
}

/**
 * Static-mode scan pipeline: load + resolve config, run the orchestrator,
 * format the results, compute the exit code. Pure with respect to
 * process.exit and stdout — the CLI wrapper writes the streams and calls
 * process.exit(result.exitCode).
 *
 * Exit-code mapping:
 *   - 0 / 1 / 2 from computeExitCode on a successful run.
 *   - 2 on any ConfigError (file invalid JSON or shape).
 *   - 2 on any other thrown error during orchestrator construction or
 *     execution (e.g. registry drift caught by validateCheckerRegistration).
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
    results = await runStaticChecks({ projectDir, config });
  } catch (err) {
    return { stdout: '', stderr: formatGenericError(err), exitCode: 2 };
  }

  return {
    stdout: formatTerminal(results, { color }),
    stderr: '',
    exitCode: computeExitCode(results),
  };
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
    .description('Run the static-mode pre-launch checks against the project')
    .option('--project-dir <path>', 'Path to the project directory (default: cwd)')
    .option('--no-color', 'Disable ANSI colors in output')
    .action(async (options: { projectDir?: string; color?: boolean }) => {
      const colorEnabled = options.color !== false && process.stdout.isTTY === true;
      const runOptions: ScanOptions = { color: colorEnabled };
      if (options.projectDir !== undefined) {
        runOptions.projectDir = options.projectDir;
      }
      const result = await runScan(runOptions);
      if (result.stdout.length > 0) process.stdout.write(result.stdout);
      if (result.stderr.length > 0) process.stderr.write(result.stderr);
      process.exit(result.exitCode);
    });
}
