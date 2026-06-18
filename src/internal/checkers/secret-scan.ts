import * as path from 'node:path';
import type {
  CheckContext,
  CheckResult,
  Checker,
  SecretScanOptions,
  Severity,
} from '../../types/index.js';

const CHECKER_ID = 'secret-scan';
const CATEGORY = 'security' as const;
/** Severity for skip/pass/error results and the ceiling for built-in finds. */
const BASE_SEVERITY: Severity = 'critical';
const OPTIONS_KEY = 'secret-scan';

const MAX_DETAIL_LINES = 20;

/**
 * Text-ish source globs scanned for secrets. The fs layer filters paths
 * through the project IgnoreMatcher, so anything in .gitignore (e.g. a real
 * `.env`) is not scanned — by design, since ignored files are not shipped.
 */
const SOURCE_GLOBS: readonly string[] = [
  '**/*.js',
  '**/*.jsx',
  '**/*.mjs',
  '**/*.cjs',
  '**/*.ts',
  '**/*.tsx',
  '**/*.mts',
  '**/*.cts',
  '**/*.json',
  '**/*.yaml',
  '**/*.yml',
  '**/*.toml',
  '**/*.ini',
  '**/*.properties',
  '**/*.xml',
  '**/*.py',
  '**/*.rb',
  '**/*.go',
  '**/*.php',
  '**/*.java',
  '**/*.sh',
  '**/*.bash',
  '**/*.zsh',
  '**/*.env',
  '**/.env',
  '**/.env.*',
];

/** A compiled pattern category. resultId for emitted fails equals `id`. */
interface CompiledPattern {
  readonly id: string;
  readonly label: string;
  readonly regex: RegExp;
  readonly severity: Severity;
  readonly redactFully?: boolean;
}

/**
 * Built-in patterns (all critical). Each regex carries the global flag
 * (required for matchAll). Provider prefixes (AKIA, ghp_, AIza, sk_live_) are
 * public identifiers, so a 4-char prefix is shown and the remainder masked.
 * These literals are shaped so they do NOT match their own source form.
 */
const BUILTIN_PATTERNS: ReadonlyArray<CompiledPattern> = [
  {
    id: 'private-key',
    label: 'private key block(s)',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    severity: 'critical',
    redactFully: true,
  },
  {
    id: 'aws-access-key-id',
    label: 'AWS access key id(s)',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    severity: 'critical',
  },
  {
    id: 'github-token',
    label: 'GitHub token(s)',
    regex: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g,
    severity: 'critical',
  },
  {
    id: 'slack-token',
    label: 'Slack token(s)',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    severity: 'critical',
  },
  {
    id: 'google-api-key',
    label: 'Google API key(s)',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    severity: 'critical',
  },
  {
    id: 'stripe-secret-key',
    label: 'Stripe secret key(s)',
    regex: /\b(?:sk|rk)_live_[0-9A-Za-z]{24,}\b/g,
    severity: 'critical',
  },
  {
    id: 'generic-credential-assignment',
    label: 'hardcoded credential assignment(s)',
    regex:
      /(?:password|passwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret)\s*[:=]\s*['"][^'"\n]{8,}['"]/gi,
    severity: 'critical',
  },
];

const BUILTIN_IDS: ReadonlySet<string> = new Set(BUILTIN_PATTERNS.map((p) => p.id));

interface Occurrence {
  readonly categoryId: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly masked: string;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** Lenient guard for the public SecretScanOptions shape (sufficient to read safely). */
function isSecretScanOptions(value: unknown): value is SecretScanOptions {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (v.allowlist !== undefined && !isStringArray(v.allowlist)) {
    return false;
  }
  if (v.extraPatterns !== undefined) {
    if (!Array.isArray(v.extraPatterns)) {
      return false;
    }
    for (const p of v.extraPatterns) {
      if (typeof p !== 'object' || p === null) {
        return false;
      }
      const pp = p as Record<string, unknown>;
      if (typeof pp.id !== 'string' || typeof pp.regex !== 'string') {
        return false;
      }
      if (pp.flags !== undefined && typeof pp.flags !== 'string') {
        return false;
      }
    }
  }
  return true;
}

function toSeverity(value: unknown): Severity {
  if (value === 'warn') {
    return 'minor';
  }
  if (value === 'critical' || value === 'major' || value === 'info') {
    return value;
  }
  return 'critical';
}

function ensureGlobal(flags: string | undefined): string {
  const f = flags ?? '';
  return f.includes('g') ? f : `${f}g`;
}

function isTestFile(relPath: string): boolean {
  if (/(^|\/)__tests__\//.test(relPath)) {
    return true;
  }
  const base = relPath.slice(relPath.lastIndexOf('/') + 1);
  return /\.(test|spec)\./.test(base);
}

function toPosixRelative(projectDir: string, absPath: string): string {
  return path.relative(projectDir, absPath).split(path.sep).join('/');
}

function maskMatch(matched: string, redactFully: boolean | undefined): string {
  if (redactFully) {
    return '<redacted>';
  }
  if (matched.length <= 4) {
    return '****';
  }
  return `${matched.slice(0, 4)}****`;
}

/**
 * Compiles user `extraPatterns` (public SecretPattern shape). Skips entries
 * whose id collides with a built-in (built-ins cannot be overridden) and
 * entries whose regex/flags fail to compile.
 */
function compileExtraPatterns(options: SecretScanOptions): CompiledPattern[] {
  const out: CompiledPattern[] = [];
  for (const p of options.extraPatterns ?? []) {
    if (BUILTIN_IDS.has(p.id)) {
      continue;
    }
    let regex: RegExp;
    try {
      regex = new RegExp(p.regex, ensureGlobal(p.flags));
    } catch {
      continue;
    }
    out.push({
      id: p.id,
      label: typeof p.description === 'string' && p.description.length > 0 ? p.description : p.id,
      regex,
      severity: toSeverity(p.defaultSeverity),
    });
  }
  return out;
}

/** Builds allowlist predicates. Each entry is a literal substring or `regex:<src>`. */
function buildAllow(entries: ReadonlyArray<string>): Array<(matched: string) => boolean> {
  const tests: Array<(matched: string) => boolean> = [];
  for (const entry of entries) {
    if (entry.startsWith('regex:')) {
      try {
        const re = new RegExp(entry.slice('regex:'.length));
        tests.push((matched) => re.test(matched));
      } catch {
        // Invalid allowlist regex — skip.
      }
    } else if (entry.length > 0) {
      tests.push((matched) => matched.includes(entry));
    }
  }
  return tests;
}

function scanText(
  relFile: string,
  text: string,
  patterns: ReadonlyArray<CompiledPattern>,
  allow: ReadonlyArray<(matched: string) => boolean>,
): Occurrence[] {
  const occurrences: Occurrence[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i] ?? '';
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      for (const m of lineText.matchAll(pattern.regex)) {
        const matched = m[0];
        if (allow.some((t) => t(matched))) {
          continue;
        }
        occurrences.push({
          categoryId: pattern.id,
          file: relFile,
          line: i + 1,
          column: (m.index ?? 0) + 1,
          masked: maskMatch(matched, pattern.redactFully),
        });
      }
    }
  }
  return occurrences;
}

function makeResult(
  status: CheckResult['status'],
  resultId: string,
  message: string,
  severity: Severity,
  extras: { fix?: string; detail?: string; location?: CheckResult['location'] } = {},
): CheckResult {
  const result: CheckResult = {
    checkerId: CHECKER_ID,
    resultId,
    status,
    message,
    severity,
    category: CATEGORY,
  };
  if (extras.fix !== undefined) {
    result.fix = extras.fix;
  }
  if (extras.detail !== undefined) {
    result.detail = extras.detail;
  }
  if (extras.location !== undefined) {
    result.location = extras.location;
  }
  return result;
}

const FIX =
  'Remove the secret from source, rotate it immediately, and load it from an environment variable or secret manager instead.';

/**
 * Static checker (emitsMultipleResults). Scans non-test source files for known
 * secret patterns. For each pattern category with at least one match, emits one
 * 'fail' (resultId = the category id) whose detail lists up to MAX_DETAIL_LINES
 * masked occurrences. When nothing matches, emits a single 'pass' (resultId
 * 'no-secrets'). Skips on no project / abort.
 *
 * User options (`checkerOptions['secret-scan']`, public SecretScanOptions):
 *   - extraPatterns: SecretPattern[] — merged with built-ins; an entry whose id
 *     collides with a built-in is skipped; invalid regex/flags are skipped. Each
 *     extra pattern's result severity comes from its defaultSeverity (warn ->
 *     minor); its resultId is the pattern id.
 *   - allowlist: string[] — literal substring or 'regex:<src>'; a matching
 *     occurrence is dropped.
 */
export const secretScanChecker: Checker = {
  id: CHECKER_ID,
  name: 'No hardcoded secrets',
  category: CATEGORY,
  mode: 'static',

  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const project = ctx.project;
    if (project === null) {
      return [
        makeResult('skip', 'no-project-context', 'Skipped: no project context.', BASE_SEVERITY),
      ];
    }

    try {
      if (ctx.signal.aborted) {
        return [
          makeResult('skip', 'aborted', 'Skipped: scan aborted before completion.', BASE_SEVERITY),
        ];
      }

      const rawOptions = ctx.config.checkerOptions[OPTIONS_KEY];
      const options: SecretScanOptions = isSecretScanOptions(rawOptions) ? rawOptions : {};
      const allow = buildAllow(options.allowlist ?? []);
      const patterns: CompiledPattern[] = [...BUILTIN_PATTERNS, ...compileExtraPatterns(options)];
      const severityById = new Map<string, Severity>();
      const labelById = new Map<string, string>();
      for (const p of patterns) {
        if (!severityById.has(p.id)) {
          severityById.set(p.id, p.severity);
          labelById.set(p.id, p.label);
        }
      }

      const files = await project.fs.glob([...SOURCE_GLOBS]);
      const occurrences: Occurrence[] = [];
      for (const absPath of files) {
        if (ctx.signal.aborted) {
          return [
            makeResult(
              'skip',
              'aborted',
              'Skipped: scan aborted before completion.',
              BASE_SEVERITY,
            ),
          ];
        }
        const relPath = toPosixRelative(project.projectDir, absPath);
        if (isTestFile(relPath)) {
          continue;
        }
        let content: string;
        try {
          content = await project.fs.readText(absPath);
        } catch {
          continue;
        }
        occurrences.push(...scanText(relPath, content, patterns, allow));
      }

      if (occurrences.length === 0) {
        return [
          makeResult(
            'pass',
            'no-secrets',
            'No hardcoded secrets found in source files.',
            BASE_SEVERITY,
          ),
        ];
      }

      const byCategory = new Map<string, Occurrence[]>();
      for (const occ of occurrences) {
        const bucket = byCategory.get(occ.categoryId);
        if (bucket === undefined) {
          byCategory.set(occ.categoryId, [occ]);
        } else {
          bucket.push(occ);
        }
      }

      const results: CheckResult[] = [];
      for (const [categoryId, occ] of byCategory) {
        const fileCount = new Set(occ.map((o) => o.file)).size;
        const label = labelById.get(categoryId) ?? 'secret(s)';
        const severity = severityById.get(categoryId) ?? BASE_SEVERITY;
        const head = occ
          .slice(0, MAX_DETAIL_LINES)
          .map((o) => `${o.file}:${o.line}:${o.column}  ${o.masked}`)
          .join('\n');
        const truncated =
          occ.length > MAX_DETAIL_LINES ? `\n... and ${occ.length - MAX_DETAIL_LINES} more` : '';
        const first = occ[0];
        const extras: { fix: string; detail: string; location?: CheckResult['location'] } = {
          fix: FIX,
          detail: head + truncated,
        };
        if (first !== undefined) {
          extras.location = { file: first.file, line: first.line, column: first.column };
        }
        results.push(
          makeResult(
            'fail',
            categoryId,
            `Found ${occ.length} ${label} in ${fileCount} file(s).`,
            severity,
            extras,
          ),
        );
      }
      return results;
    } catch (err) {
      return [
        makeResult(
          'fail',
          '__error__',
          `secret-scan failed: ${(err as Error).message}`,
          BASE_SEVERITY,
          {
            fix: 'Re-run the scan; if it keeps failing, verify the project directory is readable.',
          },
        ),
      ];
    }
  },
};
