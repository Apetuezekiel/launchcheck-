import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { run } from '../index.js';

/**
 * Exercises the top-level CLI entry — the argv → subcommand wiring that
 * lives in src/cli/index.ts. Per-subcommand behavior is covered by
 * list.test.ts and scan.test.ts; this file only asserts that
 * `run(argv)` actually dispatches to those subcommands and routes their
 * stdout/stderr/exit correctly through commander's parseAsync.
 *
 * Subcommand registration drift (a typo in a flag name, a missing
 * registerXCommand call) is otherwise invisible until production.
 */

class ExitError extends Error {
  constructor(readonly code: number) {
    super(`process.exit(${code})`);
  }
}

interface IoCapture {
  stdout: string[];
  stderr: string[];
  restore: () => void;
}

function captureStdio(): IoCapture {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const realStdoutWrite = process.stdout.write.bind(process.stdout);
  const realStderrWrite = process.stderr.write.bind(process.stderr);
  const realExit = process.exit;

  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stderr.write;

  process.exit = ((code?: number): never => {
    throw new ExitError(code ?? 0);
  }) as typeof process.exit;

  return {
    stdout,
    stderr,
    restore() {
      process.stdout.write = realStdoutWrite;
      process.stderr.write = realStderrWrite;
      process.exit = realExit;
    },
  };
}

async function runAndCaptureExit(argv: string[]): Promise<number | null> {
  try {
    await run(argv);
    return null;
  } catch (err) {
    if (err instanceof ExitError) return err.code;
    throw err;
  }
}

let io: IoCapture;
const tmpDirs: string[] = [];

beforeEach(() => {
  io = captureStdio();
});

afterEach(async () => {
  io.restore();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir !== undefined) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

async function project(content: { [relPath: string]: string }): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lc-cli-index-'));
  tmpDirs.push(dir);
  for (const [rel, body] of Object.entries(content)) {
    const full = path.join(dir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body, 'utf8');
  }
  return dir;
}

describe('run (CLI argv → subcommand wiring)', () => {
  test('list subcommand: --json emits valid JSON on stdout', async () => {
    await run(['node', 'launchcheck', 'list', '--json']);
    expect(io.stdout.length).toBeGreaterThan(0);
    const text = io.stdout.join('');
    expect(() => JSON.parse(text.trim())).not.toThrow();
    expect(io.stderr.join('')).toBe('');
  });

  test('list subcommand: default output contains the registry header', async () => {
    await run(['node', 'launchcheck', 'list']);
    const text = io.stdout.join('');
    expect(text).toContain('launchcheck v');
    expect(text).toContain('checker registry');
  });

  test('list subcommand: --category code-quality narrows the JSON output to one category', async () => {
    await run(['node', 'launchcheck', 'list', '--json', '--category', 'code-quality']);
    const text = io.stdout.join('').trim();
    const parsed = JSON.parse(text) as { count: number; entries: Array<{ category: string }> };
    expect(parsed.count).toBe(7);
    expect(parsed.entries.every((e) => e.category === 'code-quality')).toBe(true);
  });

  test('scan subcommand: clean project routes through to process.exit(0)', async () => {
    const dir = await project({ 'src/clean.ts': 'export const x = 1;\n' });
    const code = await runAndCaptureExit(['node', 'launchcheck', 'scan', '--project-dir', dir]);
    expect(code).toBe(0);
    expect(io.stdout.join('')).toContain('Summary:');
  });

  test('scan subcommand: project with console.log routes through to process.exit(1)', async () => {
    const dir = await project({ 'src/dirty.ts': "console.log('hi');\n" });
    const code = await runAndCaptureExit(['node', 'launchcheck', 'scan', '--project-dir', dir]);
    expect(code).toBe(1);
    expect(io.stdout.join('')).toContain('FAIL');
  });

  test('scan subcommand: --no-color suppresses ANSI even when stdout.isTTY=true', async () => {
    const dir = await project({ 'src/dirty.ts': "console.log('hi');\n" });
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      const code = await runAndCaptureExit([
        'node',
        'launchcheck',
        'scan',
        '--project-dir',
        dir,
        '--no-color',
      ]);
      expect(code).toBe(1);
      expect(io.stdout.join('')).not.toContain('\x1b[');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      });
    }
  });

  test('scan subcommand: ANSI is enabled when --no-color is omitted and stdout.isTTY=true', async () => {
    const dir = await project({ 'src/dirty.ts': "console.log('hi');\n" });
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    try {
      const code = await runAndCaptureExit(['node', 'launchcheck', 'scan', '--project-dir', dir]);
      expect(code).toBe(1);
      expect(io.stdout.join('')).toContain('\x1b[');
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      });
    }
  });
});
