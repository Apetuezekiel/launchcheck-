import * as path from 'node:path';
import type { CheckContext, CheckResult, Checker } from '../../types/index.js';

const CHECKER_ID = 'todo-fixme-scan';
const RESULT_ID = 'no-todo-fixme-markers';
const CATEGORY = 'code-quality' as const;
const SEVERITY = 'minor' as const;

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
 * Matches TODO, FIXME, XXX, and HACK markers as standalone tokens. Word
 * boundaries prevent matching substrings like `PROTODO` or `XXXY`. Case-
 * sensitive (uppercase only) — `Todo` in casual text is not a marker.
 */
const MARKER_RE = /\b(TODO|FIXME|XXX|HACK)\b/g;

interface Occurrence {
  /** Path relative to projectDir, POSIX separators. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column: number;
  /** The matched marker text. */
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
 * Scans one file's text for TODO / FIXME / XXX / HACK markers INSIDE
 * comments only. The comment handler is the inverse of console-log-scan's:
 * code characters are blanked out, comment characters are preserved.
 * Markers bare in code or inside string literals are NOT matched.
 *
 * Known limitation: comment-style sequences inside string literals are
 * interpreted as comment delimiters. A `/*` inside a string literal can
 * put the scanner into block-comment state mid-line and produce false
 * positives. Same regex-level limitation as console-log-scan's inverse;
 * AST detection is a later refinement.
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
          j += 2;
          inBlockComment = false;
        } else {
          j += 1;
        }
        continue;
      }
      if (chars[j] === '/' && chars[j + 1] === '/') {
        break;
      }
      if (chars[j] === '/' && chars[j + 1] === '*') {
        inBlockComment = true;
        j += 2;
        continue;
      }
      chars[j] = ' ';
      j += 1;
    }
    const commentsOnly = chars.join('');
    for (const m of commentsOnly.matchAll(MARKER_RE)) {
      occurrences.push({
        file: relFile,
        line: i + 1,
        column: (m.index ?? 0) + 1,
        text: m[0],
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
 * Static checker: flags TODO / FIXME / XXX / HACK markers inside comments
 * of source files. Test files (*.test.*, *.spec.*, anything under
 * __tests__/) are excluded. Emits exactly one CheckResult.
 */
export const todoFixmeScanChecker: Checker = {
  id: CHECKER_ID,
  name: 'No TODO/FIXME markers in production code',
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
        return singleResult('pass', 'No TODO/FIXME markers found in source files.');
      }

      const fileCount = new Set(occurrences.map((o) => o.file)).size;
      const detail = occurrences
        .map((o) => `${o.file}:${o.line}:${o.column}  ${o.text}`)
        .join('\n');
      const failResult: CheckResult = {
        checkerId: CHECKER_ID,
        resultId: RESULT_ID,
        status: 'fail',
        message: `Found ${occurrences.length} TODO/FIXME marker(s) in ${fileCount} file(s).`,
        detail,
        fix: 'Resolve TODO/FIXME markers before release, or move them to tracked issues.',
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
        `todo-fixme-scan failed: ${(err as Error).message}`,
        'Re-run the scan; if it keeps failing, verify the project directory is readable.',
      );
    }
  },
};
