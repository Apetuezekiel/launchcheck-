// -----------------------------------------------------------------------------
// Primitives
// -----------------------------------------------------------------------------

/**
 * Execution mode. Drives which checkers run and which CheckContext fields are
 * populated.
 *   - 'static': project directory only, no URL. ctx.live === null.
 *   - 'live':   URL only, no project directory. ctx.project === null.
 *   - 'combined': both project and URL available. Both sub-contexts populated.
 */
export type Mode = 'static' | 'live' | 'combined';

/**
 * Mode a checker requires. 'both' means the checker has logic for either
 * static or live context independently and can be invoked when at least one
 * is available; the checker is responsible for branching on what's present.
 */
export type CheckerMode = 'static' | 'live' | 'both';

export type ResultStatus = 'pass' | 'fail' | 'warn' | 'skip';

export type Severity = 'critical' | 'major' | 'minor' | 'info';

/**
 * Canonical category taxonomy. This single union is the source of truth for:
 *   - CheckResult.category
 *   - .launchcheckrc config keys
 *   - --only / --skip CLI flag values
 * Any value used in one place MUST exist in this union. No aliases.
 *
 * Note: 'ssl' is intentionally a subcategory of 'security' and does not appear
 * here. CLI/config users who want to disable SSL checks specifically address
 * them by checkerId, not category.
 */
export type CheckCategory =
  | 'code-quality'
  | 'security'
  | 'performance'
  | 'seo'
  | 'accessibility'
  | 'dependencies'
  | 'deployment'
  | 'documentation';
