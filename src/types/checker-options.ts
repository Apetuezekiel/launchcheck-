/**
 * Per-checker configuration shapes addressable via
 * ResolvedConfig.checkerOptions[checkerId].
 */

// -------------------- secret-scan --------------------

export type SecretPatternSeverity = 'critical' | 'major' | 'warn' | 'info';

export interface SecretPattern {
  id: string;
  regex: string;
  flags?: string;
  defaultSeverity: SecretPatternSeverity;
  description: string;
}

export interface SecretScanOptions {
  /**
   * Additional patterns merged with the built-in set. User patterns cannot
   * override built-in pattern IDs; collisions are a config error at startup.
   */
  extraPatterns?: SecretPattern[];

  /**
   * Allowlist entries drop matching findings entirely. Each entry is either
   * a literal string or 'regex:<pattern>' (compiled per JS RegExp). Applied
   * after the built-in pre-allowlist; never overrides built-in.
   */
  allowlist?: string[];
}

// -------------------- email-auth --------------------

export interface EmailAuthOptions {
  /**
   * Master toggle for the email-auth checker family (spf-record,
   * dkim-record, dmarc-record). Default: false. When false, all three
   * checkers run but emit status: 'skip' with a message pointing the user
   * at this option. When true, the checkers perform their actual DNS lookups.
   */
  enabled: boolean;

  /**
   * Domain to query. Defaults to the primary URL's hostname when null.
   * Useful when the project sends mail from a different domain than the
   * web-facing one.
   */
  domain?: string | null;

  /**
   * DKIM selectors to verify. Each is queried at <selector>._domainkey.<domain>.
   * Required (non-empty) when enabled === true AND the dkim-record checker
   * is enabled in the registry. SPF and DMARC do not consume this field.
   */
  dkimSelectors?: string[];
}

// -------------------- cors-policy --------------------

export interface CorsPolicyOptions {
  /**
   * Path the preflight OPTIONS request is sent to. Default: '/'.
   */
  probePath?: string;
}

// -------------------- health-endpoint --------------------

export interface HealthEndpointOptions {
  /**
   * Candidate health-check paths, tried in order. The check passes if any
   * path returns a 2xx status. Default: ['/health', '/healthz', '/api/health'].
   */
  paths?: string[];
}

// -------------------- license-compatibility --------------------

export interface LicenseCompatibilityOptions {
  /**
   * SPDX license prefixes to deny (case-insensitive, matched against each
   * token of an installed package's license). Default: ['AGPL', 'LGPL', 'GPL'].
   */
  denyList?: string[];

  /**
   * Whether to treat the project as proprietary (the case in which copyleft
   * dependencies are a problem). Default: true. Set to false for a project
   * that is itself copyleft/open-source — the checker then skips.
   */
  treatProprietaryAsDefault?: boolean;
}
