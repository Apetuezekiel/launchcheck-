import type { ResolvedConfig } from '../../types/index.js';
import type { RawConfig } from './load.js';

/** Inputs to resolveConfig. */
export interface ResolveConfigArgs {
  /** Absolute path to the project directory. Required. */
  projectDir: string;
  /** Parsed `.launchcheckrc` content, or null if no file was found. */
  fileConfig?: RawConfig | null;
  /** Partial config supplied by CLI flags. Highest precedence. */
  cliOverrides?: RawConfig;
}

/**
 * Pure merge of (defaults, fileConfig, cliOverrides) into a fully-formed
 * ResolvedConfig. Precedence (highest first): cliOverrides > fileConfig
 * > defaults.
 *
 * Field-level rules:
 *   - url: scalar precedence. Explicit null in cliOverrides overrides
 *     fileConfig (so a CLI flag meaning "no URL" works). undefined
 *     falls through to fileConfig, then defaults to null.
 *   - checkers, thresholds, checkerOptions: shallow object merge with
 *     CLI winning on per-key conflict. checkerOptions does NOT
 *     deep-merge inner objects — a per-id override fully replaces the
 *     file's per-id entry.
 *   - ignore: concatenation (file patterns first, then CLI). Each side
 *     may add patterns without clobbering the other.
 */
export function resolveConfig(args: ResolveConfigArgs): ResolvedConfig {
  const file: RawConfig = args.fileConfig ?? {};
  const cli: RawConfig = args.cliOverrides ?? {};

  let url: string | null;
  if (cli.url !== undefined) {
    url = cli.url;
  } else if (file.url !== undefined) {
    url = file.url;
  } else {
    url = null;
  }

  return {
    url,
    projectDir: args.projectDir,
    checkers: { ...(file.checkers ?? {}), ...(cli.checkers ?? {}) },
    thresholds: { ...(file.thresholds ?? {}), ...(cli.thresholds ?? {}) },
    checkerOptions: { ...(file.checkerOptions ?? {}), ...(cli.checkerOptions ?? {}) },
    ignore: [...(file.ignore ?? []), ...(cli.ignore ?? [])],
  };
}
