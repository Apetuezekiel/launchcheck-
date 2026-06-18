import * as path from 'node:path';
import type { CheckContext, CheckResult, Checker } from '../../types/index.js';

const CHECKER_ID = 'readme-required-sections';
const RESULT_ID = 'readme-sections-present';
const CATEGORY = 'documentation' as const;
const SEVERITY = 'minor' as const;
const OPTIONS_KEY = 'readme-sections';

/**
 * README filename candidates checked at the project root, in order. The
 * first existing one wins. Case variants are enumerated because
 * DefaultProjectFs does not enable case-insensitive glob and Linux
 * filesystems are case-sensitive.
 */
const README_CANDIDATES: ReadonlyArray<string> = [
  'README.md',
  'README.MD',
  'Readme.md',
  'readme.md',
  'README.markdown',
];

/**
 * Default required heading groups. Each inner array is a group of
 * alternatives — the section is satisfied when ANY keyword in the group
 * appears in some heading. Mirrors the v1 spec text "Setup/Install,
 * Environment/Configuration, Usage".
 */
const DEFAULT_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ['Setup', 'Install'],
  ['Environment', 'Configuration'],
  ['Usage'],
];

interface ReadmeSectionsOptions {
  /**
   * Flat override of required headings. When supplied and non-empty,
   * replaces DEFAULT_GROUPS entirely. Each entry is treated as its own
   * one-element group — no OR semantics in user overrides; if the user
   * wants alternatives they list them as separate entries.
   */
  requiredHeadings?: ReadonlyArray<string>;
}

function isReadmeSectionsOptions(value: unknown): value is ReadmeSectionsOptions {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.requiredHeadings === undefined) return true;
  return (
    Array.isArray(v.requiredHeadings) && v.requiredHeadings.every((h) => typeof h === 'string')
  );
}

/**
 * ATX heading parser. Returns the text of each `#`-style markdown
 * heading. Strips leading hashes + whitespace and trailing `#`s +
 * whitespace per CommonMark §4.2.
 *
 * Setext headings (Heading\n=====) are NOT supported in v1 — projects
 * using them are rare and can either switch to ATX or supply
 * requiredHeadings explicitly.
 */
function parseAtxHeadings(content: string): string[] {
  const headings: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    // Up to 3 leading spaces, 1-6 hashes, required space, then text,
    // optional trailing hashes for closed-ATX form.
    const match = line.match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
    if (match) {
      headings.push(match[2] ?? '');
    }
  }
  return headings;
}

function headingMatches(headings: ReadonlyArray<string>, keyword: string): boolean {
  const needle = keyword.toLowerCase();
  return headings.some((h) => h.toLowerCase().includes(needle));
}

function makeResult(
  status: CheckResult['status'],
  message: string,
  extras: { fix?: string; detail?: string } = {},
): CheckResult {
  const r: CheckResult = {
    checkerId: CHECKER_ID,
    resultId: RESULT_ID,
    status,
    severity: SEVERITY,
    category: CATEGORY,
    message,
  };
  if (extras.fix !== undefined) r.fix = extras.fix;
  if (extras.detail !== undefined) r.detail = extras.detail;
  return r;
}

/**
 * Static checker: confirms the project README exists and contains the
 * required heading sections. Emits exactly one CheckResult.
 *
 *   - 'pass' — README found and every required heading group is
 *     satisfied (at least one keyword in the group appears in some
 *     heading, case-insensitive substring match).
 *   - 'fail' (severity minor) — README missing entirely, OR README
 *     present but some required heading group has no matching heading.
 *     The detail field lists which groups are missing.
 *   - 'skip' — ctx.project is null or the run aborted before scanning.
 *
 * Configuration: `readme-sections.requiredHeadings: string[]` replaces
 * DEFAULT_GROUPS with a flat list (each entry is its own one-element
 * group — no OR semantics in user overrides). An empty array falls back
 * to defaults so a config file with `requiredHeadings: []` does not
 * silently disable the check.
 */
export const readmeRequiredSectionsChecker: Checker = {
  id: CHECKER_ID,
  name: 'README.md exists with required sections',
  category: CATEGORY,
  mode: 'static',

  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const project = ctx.project;
    if (project === null) {
      return [makeResult('skip', 'Skipped: no project context.')];
    }
    if (ctx.signal.aborted) {
      return [makeResult('skip', 'Skipped: scan aborted before completion.')];
    }

    try {
      // Resolve required heading groups from config; default to spec groups.
      const rawOptions = ctx.config.checkerOptions[OPTIONS_KEY];
      let groups: ReadonlyArray<ReadonlyArray<string>>;
      if (
        rawOptions !== undefined &&
        isReadmeSectionsOptions(rawOptions) &&
        rawOptions.requiredHeadings !== undefined &&
        rawOptions.requiredHeadings.length > 0
      ) {
        groups = rawOptions.requiredHeadings.map((h) => [h] as const);
      } else {
        groups = DEFAULT_GROUPS;
      }

      // Locate a README at the project root.
      let readmePath: string | null = null;
      for (const candidate of README_CANDIDATES) {
        const candidatePath = path.join(project.projectDir, candidate);
        if (await project.fs.exists(candidatePath)) {
          readmePath = candidatePath;
          break;
        }
      }

      if (readmePath === null) {
        return [
          makeResult('fail', 'No README.md at the project root.', {
            fix: 'Create a README.md at the project root documenting setup, environment, and usage.',
          }),
        ];
      }

      let content: string;
      try {
        content = await project.fs.readText(readmePath);
      } catch (err) {
        return [
          makeResult('fail', `Could not read README.md: ${(err as Error).message}`, {
            fix: 'Ensure the README file is readable.',
          }),
        ];
      }

      const headings = parseAtxHeadings(content);
      const missing: string[] = [];
      for (const group of groups) {
        const satisfied = group.some((kw) => headingMatches(headings, kw));
        if (!satisfied) {
          missing.push(group.length === 1 ? (group[0] ?? '') : group.join(' OR '));
        }
      }

      if (missing.length === 0) {
        return [makeResult('pass', `README has all ${groups.length} required heading section(s).`)];
      }

      return [
        makeResult('fail', `README is missing ${missing.length} required heading section(s).`, {
          detail: missing.join('\n'),
          fix: 'Add headings for the missing sections, or customize via `readme-sections.requiredHeadings` if your project uses different naming.',
        }),
      ];
    } catch (err) {
      return [
        makeResult('fail', `readme-required-sections failed: ${(err as Error).message}`, {
          fix: 'Re-run the scan; if it keeps failing, verify the project directory is readable.',
        }),
      ];
    }
  },
};
