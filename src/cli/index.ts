import { Command } from 'commander';
import { registerListCommand } from './commands/list.js';
import { LAUNCHCHECK_VERSION } from './version.js';

/**
 * CLI entry. Called by bin/launchcheck.mjs with process.argv.
 * Exported as a function (not auto-invoked on import) so tests can
 * invoke it with arbitrary argv arrays without spawning a subprocess.
 */
export function run(argv: string[]): void {
  const program = new Command();
  program
    .name('launchcheck')
    .description('Automated pre-launch QA for web projects')
    .version(LAUNCHCHECK_VERSION);

  registerListCommand(program);

  program.parse(argv);
}
