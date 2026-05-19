import type { CheckCategory, CheckerMode, Severity } from '../../types/index.js';

/**
 * Internal registry entry describing one v1 checker. Consumed by the
 * orchestrator (for filtering) and the `launchcheck list` CLI subcommand
 * (for documentation output). NOT part of the public API; if a plugin
 * API ships in v1.1+, this contract is what it will expose.
 */
export interface RegistryEntry {
  /** Stable checkerId, kebab-case, must match /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/. */
  id: string;

  /** Human-readable title for `launchcheck list`. */
  name: string;

  category: CheckCategory;
  mode: CheckerMode;

  /** v1: always true. Field exists so post-v1 entries can default off. */
  defaultEnabled: boolean;

  /**
   * Worst-case severity this checker can emit. Used for `launchcheck list`
   * grouping and for severity-budget calculations in CI gating.
   */
  maxSeverity: Severity;

  /** One-line description; shown in `launchcheck list` output. */
  description: string;

  /**
   * Resources consumed in live mode. 'http' = ad-hoc HttpClient.fetch()
   * (e.g., for /sitemap.xml). Static-mode checkers omit this field.
   */
  consumes?: ReadonlyArray<'rootResponse' | 'dom' | 'lighthouse' | 'axe' | 'tls' | 'dns' | 'http'>;

  /** Threshold keys this checker reads from ResolvedConfig.thresholds. */
  thresholdKeys?: ReadonlyArray<string>;

  /** checkerOptions key this checker reads, if any. */
  optionsKey?: string;

  /** True for checkers that emit N results from one invocation. Default false. */
  emitsMultipleResults?: boolean;

  /** True for static checkers that require gitRoot !== null to run. */
  requiresGit?: boolean;

  /** Peer dependency required (declared in package.json as optional peer). */
  requiresPeerDep?: 'puppeteer' | 'typescript';
}
