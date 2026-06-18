import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { CheckContext, CheckResult, Checker } from '../../types/index.js';

const execFileAsync = promisify(execFile);

const CHECKER_ID = 'large-files-in-git-history';
const CATEGORY = 'code-quality' as const;
const SEVERITY = 'minor' as const;

const THRESHOLD_KEY = 'large-file-bytes';
/** Default threshold when `thresholds.large-file-bytes` is unset or invalid: 5 MiB. */
const DEFAULT_LARGE_FILE_BYTES = 5 * 1024 * 1024;

const MAX_DETAIL_LINES = 20;

/** A blob found in git history: repo-root-relative POSIX path and byte size. */
export interface HistoryFile {
  path: string;
  bytes: number;
}

/** Dependencies — injectable for tests. */
export interface LargeFilesInGitHistoryDeps {
  /**
   * Lists every blob reachable in git history under `gitRoot`, as
   * repo-root-relative POSIX paths with byte sizes. A blob that lived at
   * multiple paths may appear once per representative path. Implementations
   * MAY throw for environmental failures (git missing, ETIMEDOUT, abort);
   * the core maps a throw to a single 'git-runtime-error' fail.
   */
  listHistoryFiles(gitRoot: string, signal: AbortSignal): Promise<HistoryFile[]>;
}

const DEFAULT_DEPS: LargeFilesInGitHistoryDeps = { listHistoryFiles: defaultListHistoryFiles };

async function defaultListHistoryFiles(
  gitRoot: string,
  signal: AbortSignal,
): Promise<HistoryFile[]> {
  // 1) Size of every blob object in the repository, keyed by sha.
  const check = await execFileAsync(
    'git',
    [
      '-C',
      gitRoot,
      'cat-file',
      '--batch-all-objects',
      '--batch-check=%(objecttype) %(objectname) %(objectsize)',
    ],
    { timeout: 60_000, maxBuffer: 100 * 1024 * 1024, signal, windowsHide: true },
  );
  const sizeBySha = new Map<string, number>();
  for (const line of check.stdout.split('\n')) {
    if (!line.startsWith('blob ')) {
      continue;
    }
    const parts = line.split(' ');
    const sha = parts[1];
    const size = Number(parts[2]);
    if (sha !== undefined && Number.isFinite(size)) {
      sizeBySha.set(sha, size);
    }
  }

  // 2) Map reachable blob shas to a path via the object walk.
  const rev = await execFileAsync('git', ['-C', gitRoot, 'rev-list', '--objects', '--all'], {
    timeout: 60_000,
    maxBuffer: 100 * 1024 * 1024,
    signal,
    windowsHide: true,
  });
  const files: HistoryFile[] = [];
  for (const line of rev.stdout.split('\n')) {
    const sp = line.indexOf(' ');
    if (sp === -1) {
      continue; // a commit (no path) — skip
    }
    const sha = line.slice(0, sp);
    const filePath = line.slice(sp + 1);
    const bytes = sizeBySha.get(sha);
    if (bytes !== undefined && filePath.length > 0) {
      files.push({ path: filePath, bytes });
    }
  }
  return files;
}

function makeResult(
  status: CheckResult['status'],
  resultId: string,
  message: string,
  extras: { fix?: string; detail?: string } = {},
): CheckResult {
  const result: CheckResult = {
    checkerId: CHECKER_ID,
    resultId,
    status,
    message,
    severity: SEVERITY,
    category: CATEGORY,
  };
  if (extras.fix !== undefined) {
    result.fix = extras.fix;
  }
  if (extras.detail !== undefined) {
    result.detail = extras.detail;
  }
  return result;
}

function resolveThreshold(thresholds: Record<string, number>): number {
  const configured = thresholds[THRESHOLD_KEY];
  return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_LARGE_FILE_BYTES;
}

/** Repo-root-relative POSIX prefix that selects files under projectDir. */
function projectPrefix(gitRoot: string, projectDir: string): string {
  const rel = path.relative(gitRoot, projectDir);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return '';
  }
  return `${rel.split(path.sep).join('/')}/`;
}

function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)} ${units[i] ?? 'B'}`;
}

/**
 * Static checker core. Walks git history under gitRoot (via the injected
 * listHistoryFiles), filters to files under projectDir (monorepo policy),
 * and flags any whose largest historical blob exceeds the
 * `large-file-bytes` threshold. Emits a single CheckResult:
 *   - 'skip' 'no-project-context' when ctx.project is null
 *   - 'skip' 'aborted' when the scan was aborted
 *   - 'skip' 'no-git' when gitRoot is null (no repo, or git unavailable)
 *   - 'pass' 'no-large-files' when nothing exceeds the threshold
 *   - 'fail' 'large-files-found' when one or more files exceed it; `detail`
 *     lists up to MAX_DETAIL_LINES offenders sorted by size descending,
 *     truncated with a count
 *   - 'fail' 'git-runtime-error' when listHistoryFiles throws
 *
 * Pure with respect to subprocess execution — git lives behind the
 * `deps.listHistoryFiles` seam so tests inject deterministic responses.
 */
export async function runLargeFilesInGitHistory(
  ctx: CheckContext,
  deps: LargeFilesInGitHistoryDeps = DEFAULT_DEPS,
): Promise<CheckResult[]> {
  const project = ctx.project;
  if (project === null) {
    return [makeResult('skip', 'no-project-context', 'Skipped: no project context.')];
  }

  try {
    if (ctx.signal.aborted) {
      return [makeResult('skip', 'aborted', 'Skipped: scan aborted before completion.')];
    }

    const gitRoot = project.gitRoot;
    if (gitRoot === null) {
      return [
        makeResult(
          'skip',
          'no-git',
          'Skipped: not a git repository (or git unavailable); cannot walk history.',
        ),
      ];
    }

    const threshold = resolveThreshold(ctx.config.thresholds);

    let history: HistoryFile[];
    try {
      history = await deps.listHistoryFiles(gitRoot, ctx.signal);
    } catch (err) {
      return [
        makeResult(
          'fail',
          'git-runtime-error',
          `Failed to read git history: ${err instanceof Error ? err.message : String(err)}`,
          { fix: 'Ensure git is installed and the repository is readable.' },
        ),
      ];
    }

    const prefix = projectPrefix(gitRoot, project.projectDir);
    const maxByPath = new Map<string, number>();
    for (const file of history) {
      if (prefix !== '' && !file.path.startsWith(prefix)) {
        continue;
      }
      const current = maxByPath.get(file.path);
      if (current === undefined || file.bytes > current) {
        maxByPath.set(file.path, file.bytes);
      }
    }

    const offenders = [...maxByPath.entries()]
      .filter(([, bytes]) => bytes > threshold)
      .map(([filePath, bytes]) => ({ path: filePath, bytes }))
      .sort((a, b) => b.bytes - a.bytes);

    if (offenders.length === 0) {
      return [
        makeResult(
          'pass',
          'no-large-files',
          `No files exceeding ${formatBytes(threshold)} found in git history.`,
        ),
      ];
    }

    const head = offenders
      .slice(0, MAX_DETAIL_LINES)
      .map((o) => `${o.path} (${formatBytes(o.bytes)})`)
      .join('\n');
    const truncated =
      offenders.length > MAX_DETAIL_LINES
        ? `\n... and ${offenders.length - MAX_DETAIL_LINES} more`
        : '';
    return [
      makeResult(
        'fail',
        'large-files-found',
        `${offenders.length} file(s) in git history exceed ${formatBytes(threshold)}.`,
        {
          detail: head + truncated,
          fix: 'Purge large blobs from history with git-filter-repo or BFG Repo-Cleaner, and add them to .gitignore.',
        },
      ),
    ];
  } catch (err) {
    return [
      makeResult(
        'fail',
        '__error__',
        `large-files-in-git-history failed: ${err instanceof Error ? err.message : String(err)}`,
        { fix: 'Re-run the scan; if it keeps failing, verify the project directory is readable.' },
      ),
    ];
  }
}

/**
 * Static checker: walks git history and flags files whose largest historical
 * blob exceeds the `large-file-bytes` threshold (default 5 MiB), scoped to
 * projectDir. Skips when not in a git repo. Wraps runLargeFilesInGitHistory
 * with the default git-backed dep.
 */
export const largeFilesInGitHistoryChecker: Checker = {
  id: CHECKER_ID,
  name: 'No large files in git history',
  category: CATEGORY,
  mode: 'static',
  run: (ctx) => runLargeFilesInGitHistory(ctx),
};
