import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PackageJson, ProjectContext } from '../../types/index.js';
import { DefaultIgnoreMatcher } from '../fs/ignore-matcher.js';
import { DefaultProjectFs } from '../fs/project-fs.js';
import { resolveGitRoot } from './git.js';

/** Options for buildProjectContext. */
export interface BuildProjectContextOptions {
  /**
   * Extra ignore patterns in gitignore syntax, supplied by resolved config
   * (the .launchcheckrc `ignore` field). Composed after the project's own
   * .gitignore so a config negation pattern can override it. Defaults to none.
   */
  ignore?: string[];
}

/**
 * Reads a JSON file and returns it as a plain object, or null when the file
 * is absent, unreadable, not valid JSON, or not a JSON object (array and
 * scalar roots are rejected).
 *
 * NOTE: strict JSON.parse. A tsconfig.json written as JSONC (// comments,
 * trailing commas) will not parse and yields null. Full JSONC support is
 * deferred until a tsconfig-consuming checker lands.
 */
async function readJsonObject<T extends object>(filePath: string): Promise<T | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as T;
}

/**
 * Reads a .gitignore file into a list of pattern lines. Blank lines and
 * full-line comments are dropped; negation (!) and every other pattern is
 * kept verbatim. A missing .gitignore yields an empty list.
 */
async function readGitignorePatterns(filePath: string): Promise<string[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * Assembles a ProjectContext for static-mode runs: resolves the git root,
 * parses package.json and tsconfig.json, reads .gitignore, and wires a
 * DefaultIgnoreMatcher and DefaultProjectFs rooted at projectDir.
 *
 * The ignore matcher is composed from three layers, in order: the built-in
 * default prunes (inside DefaultIgnoreMatcher), the project's .gitignore,
 * then options.ignore from resolved config.
 *
 * This builder does NOT parse .launchcheckrc — config-file resolution is a
 * separate concern; config-derived ignore patterns enter via options.ignore.
 * It also does not verify that projectDir exists; the caller guarantees that.
 */
export async function buildProjectContext(
  projectDir: string,
  options: BuildProjectContextOptions = {},
): Promise<ProjectContext> {
  const dir = path.resolve(projectDir);

  const [gitRoot, packageJson, tsconfigJson, gitignorePatterns] = await Promise.all([
    resolveGitRoot(dir),
    readJsonObject<PackageJson>(path.join(dir, 'package.json')),
    readJsonObject<Record<string, unknown>>(path.join(dir, 'tsconfig.json')),
    readGitignorePatterns(path.join(dir, '.gitignore')),
  ]);

  const ignore = new DefaultIgnoreMatcher(dir, [...gitignorePatterns, ...(options.ignore ?? [])]);
  const projectFs = new DefaultProjectFs(dir, ignore);

  return {
    projectDir: dir,
    gitRoot,
    packageJson,
    tsconfigJson,
    ignore,
    fs: projectFs,
  };
}
