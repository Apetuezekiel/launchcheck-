import { describe, expect, test } from 'vitest';
import {
  type ParsedSource,
  extractModuleSpecifiers,
  findConsoleAndDebugger,
  parseSource,
  typescriptAvailable,
} from '../parse-source.js';

// The typescript peer is a devDependency, so the AST path is exercised here.
async function parse(file: string, text: string): Promise<ParsedSource> {
  const parsed = await parseSource(file, text);
  if (parsed === null) {
    throw new Error('typescript peer unavailable in test environment');
  }
  return parsed;
}

test('typescript peer is available in the test environment', () => {
  expect(typescriptAvailable()).toBe(true);
});

describe('findConsoleAndDebugger', () => {
  test('flags real console.* member accesses and debugger statements', async () => {
    const parsed = await parse(
      'a.ts',
      ['console.log("x");', 'console.warn("y");', 'debugger;'].join('\n'),
    );
    const occ = findConsoleAndDebugger(parsed);
    expect(occ.map((o) => o.text)).toEqual(['console.log', 'console.warn', 'debugger']);
    expect(occ[0]).toMatchObject({ line: 1, column: 1 });
    expect(occ[2]).toMatchObject({ line: 3, column: 1 });
  });

  test('does NOT flag console/debugger inside strings or comments (the regex FP class)', async () => {
    const src = [
      'const s = "console.log should not match";',
      'const t = `also debugger not here`;',
      '// console.log in a line comment',
      '/* console.error in a block comment */',
      'const u = "debugger";',
    ].join('\n');
    const parsed = await parse('a.ts', src);
    expect(findConsoleAndDebugger(parsed)).toEqual([]);
  });

  test('flags a real console.error among lookalikes', async () => {
    const parsed = await parse(
      'a.ts',
      ['const o = { console: { log() {} } };', 'console.error(1);'].join('\n'),
    );
    const occ = findConsoleAndDebugger(parsed);
    expect(occ.map((o) => o.text)).toContain('console.error');
  });
});

describe('extractModuleSpecifiers', () => {
  test('captures static / type-only / re-export / dynamic / require / import-equals', async () => {
    const src = [
      "import a from 'pkg-a';",
      "import type { T } from 'pkg-types';",
      "export { x } from 'pkg-reexport';",
      "const d = await import('pkg-dyn');",
      "const r = require('pkg-req');",
      "import eq = require('pkg-eq');",
      "import rel from './local';",
      'const n = require(variable);',
    ].join('\n');
    const parsed = await parse('a.ts', src);
    const specs = extractModuleSpecifiers(parsed);
    expect(specs).toContain('pkg-a');
    expect(specs).toContain('pkg-types'); // type-only counts as a real reference
    expect(specs).toContain('pkg-reexport');
    expect(specs).toContain('pkg-dyn');
    expect(specs).toContain('pkg-req');
    expect(specs).toContain('pkg-eq');
    expect(specs).toContain('./local');
    // require(variable) is non-literal and unresolvable: omitted.
    expect(specs).not.toContain('variable');
  });
});

test('parseSource tolerates JSX/TSX', async () => {
  const parsed = await parse('c.tsx', 'const E = () => <div>{console.log(1)}</div>;');
  expect(findConsoleAndDebugger(parsed).map((o) => o.text)).toEqual(['console.log']);
});
