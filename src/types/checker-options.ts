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
