import type { CheckCategory, ResultStatus, Severity } from './common.js';

// -----------------------------------------------------------------------------
// CheckResult
// -----------------------------------------------------------------------------

export interface CheckResult {
  /**
   * Identifier of the checker module that produced this result.
   * Kebab-case, stable across versions. Used for config-level enable/disable.
   * Example: 'security-headers'.
   */
  checkerId: string;

  /**
   * Identifier of the specific finding within the checker.
   * Kebab-case, stable across versions. Unique within its checkerId.
   * Example: 'hsts-present'. Fully qualified form: 'security-headers/hsts-present'.
   * The orchestrator constructs the fully qualified form for reporting.
   */
  resultId: string;

  status: ResultStatus;

  /** Short human-readable summary. Single line. Shown in terminal output. */
  message: string;

  /**
   * Optional longer-form detail. May contain multiple lines, file paths,
   * line numbers, header values, URLs, etc. Not shown in terse output modes.
   */
  detail?: string;

  /**
   * Optional actionable remediation. Must describe what the user should do,
   * not what went wrong. Required on 'fail'; recommended on 'warn'.
   */
  fix?: string;

  severity: Severity;

  category: CheckCategory;

  /**
   * Optional source location, when the finding maps to a specific file.
   * Used by HTML reporter to render file references.
   */
  location?: {
    file: string; // path relative to projectDir
    line?: number;
    column?: number;
  };

  /**
   * Wall-clock duration of this individual finding's computation, in ms.
   * Set by the orchestrator, not the checker. Used for performance debugging.
   */
  durationMs?: number;

  /**
   * The live URL this finding pertains to, when the run targeted one or more
   * URLs. Set by the live orchestrator (one value per URL); absent for static
   * findings. Part of the finding fingerprint so the same checker on different
   * URLs stays distinct.
   */
  url?: string;
}
