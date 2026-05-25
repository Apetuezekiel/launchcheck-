import * as path from 'node:path';
import type { CheckContext, CheckResult, Checker } from '../../types/index.js';

const CHECKER_ID = 'console-log-scan';
const RESULT_ID = 'no-console-statements';
const CATEGORY = 'code-quality' as const;
const SEVERITY = 'major' as const;

/** Source-file glob patterns scanned by this checker. */
const SOURCE_GLOBS: readonly string[] = [
  '**/*.js',
  '**/*.jsx',
  '**/*.mjs',
  '**/*.cjs',
  '**/*.ts',
  '**/*.tsx',
  '**/*.mts',
  '**/*.cts',
];

/**
 * Matches a console.log / console.debug / console.error / console.warn member
 * access, or a bare debugger statement. Textual scan — see scanText for the
 * comment handling; string-literal occurrences are not excluded.
 */
const STATEMENT_RE = /\bconsole\s*\.\s*(?:log|debug|error|warn)\b|\bdebugger\b/g;

interface Occurrence {
  /** Path relative to projectDir, POSIX separators. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column: number;
  /** The matched statement, whitespace-collapsed (e.g. 'console.log'). */
  text: string;
}

/** True when relPath is a test file, which this checker does not scan. */
function isTestFile(relPath: string): boolean {
  if (/(^|\/)__tests__\//.test(relPath)) return true;
  const base = relPath.slice(relPath.lastIndexOf('/') + 1);
  return /\.(test|spec)\./.test(base);
}

function toPosixRelative(projectDir: string, absPath: string): string {
  return path.relative(projectDir, absPath).split(path.sep).join('/');
}

/**
 * Scans one file's text for console/debugger statements. Line comments and
 * block comments are blanked out before matching (column positions preserved
 * by replacing commented characters with spaces). String literals are NOT
 * parsed: a statement inside a string may still be reported — a documented
 * limitation of the regex-based approach.
 */
function scanText(relFile: string, text: string): Occurrence[] {
  const occurrences: Occurrence[] = [];
  const lines = text.split(/\r?\n/);
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const chars = (lines[i] ?? '').split('');
    let j = 0;
    while (j < chars.length) {
      if (inBlockComment) {
        if (chars[j] === '*' && chars[j + 1] === '/') {
          chars[j] = ' ';
          chars[j + 1] = ' ';
          j += 2;
          inBlockComment = false;
        } else {
          chars[j] = ' ';
          j += 1;
        }
        continue;
      }
      if (chars[j] === '/' && chars[j + 1] === '/') {
        for (let k = j; k < chars.length; k++) chars[k] = ' ';
        break;
      }
      if (chars[j] === '/' && chars[j + 1] === '*') {
        chars[j] = ' ';
        chars[j + 1] = ' ';
        inBlockComment = true;
        j += 2;
        continue;
      }
      j += 1;
    }
    const code = chars.join('');
    for (const m of code.matchAll(STATEMENT_RE)) {
      occurrences.push({
        file: relFile,
        line: i + 1,
        column: (m.index ?? 0) + 1,
        text: m[0].replace(/\s+/g, ''),
      });
    }
  }
  return occurrences;
}

function singleResult(status: CheckResult['status'], message: string, fix?: string): CheckResult[] {
  const result: CheckResult = {
    checkerId: CHECKER_ID,
    resultId: RESULT_ID,
    status,
    message,
    severity: SEVERITY,
    category: CATEGORY,
  };
  if (fix !== undefined) {
    result.fix = fix;
  }
  return [result];
}

/**
 * Static checker: flags console.log / console.debug / console.error /
 * console.warn / debugger statements left in source files. Test files
 * (*.test.*, *.spec.*, anything under __tests__/) are excluded. Emits exactly
 * one CheckResult.
 */
export const consoleLogScanChecker: Checker = {
  id: CHECKER_ID,
  name: 'No console statements in production code',
  category: CATEGORY,
  mode: 'static',

  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const project = ctx.project;
    if (project === null) {
      return singleResult('skip', 'Skipped: no project context.');
    }

    try {
      if (ctx.signal.aborted) {
        return singleResult('skip', 'Skipped: scan aborted before completion.');
      }

      const files = await project.fs.glob([...SOURCE_GLOBS]);
      const occurrences: Occurrence[] = [];

      for (const absPath of files) {
        if (ctx.signal.aborted) {
          return singleResult('skip', 'Skipped: scan aborted before completion.');
        }
        const relPath = toPosixRelative(project.projectDir, absPath);
        if (isTestFile(relPath)) continue;
        let content: string;
        try {
          content = await project.fs.readText(absPath);
        } catch {
          continue;
        }
        occurrences.push(...scanText(relPath, content));
      }

      if (occurrences.length === 0) {
        return singleResult('pass', 'No console or debugger statements found in source files.');
      }

      const fileCount = new Set(occurrences.map((o) => o.file)).size;
      const detail = occurrences
        .map((o) => `${o.file}:${o.line}:${o.column}  ${o.text}`)
        .join('\n');
      const failResult: CheckResult = {
        checkerId: CHECKER_ID,
        resultId: RESULT_ID,
        status: 'fail',
        message: `Found ${occurrences.length} console/debugger statement(s) in ${fileCount} file(s).`,
        detail,
        fix: 'Remove debug console/debugger statements from production code, or use a dedicated logger.',
        severity: SEVERITY,
        category: CATEGORY,
      };
      const first = occurrences[0];
      if (first !== undefined) {
        failResult.location = { file: first.file, line: first.line, column: first.column };
      }
      return [failResult];
    } catch (err) {
      return singleResult(
        'fail',
        `console-log-scan failed: ${(err as Error).message}`,
        'Re-run the scan; if it keeps failing, verify the project directory is readable.',
      );
    }
  },
};
