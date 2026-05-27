import { Command } from 'commander';
import { registerListCommand } from './commands/list.js';
import { registerScanCommand } from './commands/scan.js';
import { LAUNCHCHECK_VERSION } from './version.js';

/**
 * CLI entry. Called by bin/launchcheck.mjs with process.argv.
 * Exported as a function (not auto-invoked on import) so tests can
 * invoke it with arbitrary argv arrays without spawning a subprocess.
 *
 * Returns a Promise because the scan subcommand has an async action;
 * parseAsync awaits it cleanly. Sync subcommands (e.g. list) still work
 * unchanged under parseAsync.
 */
export async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program
    .name('launchcheck')
    .description('Automated pre-launch QA for web projects')
    .version(LAUNCHCHECK_VERSION);

  registerListCommand(program);
  registerScanCommand(program);

  await program.parseAsync(argv);
}
