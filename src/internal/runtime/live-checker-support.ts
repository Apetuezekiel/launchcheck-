import type {
  AxeResult,
  AxeViolation,
  CheckCategory,
  CheckContext,
  CheckResult,
  DnsResolver,
  EmailAuthOptions,
  HttpResponse,
  ParsedDom,
  Severity,
  TlsResult,
} from '../../types/index.js';
import { resolveResource } from './resolve-resource.js';

/** Builds a CheckResult with the live checker's fixed checkerId/category/severity. */
export function liveResult(
  checkerId: string,
  category: CheckCategory,
  severity: Severity,
  status: CheckResult['status'],
  resultId: string,
  message: string,
  extras: { fix?: string; detail?: string } = {},
): CheckResult {
  const result: CheckResult = { checkerId, resultId, status, message, severity, category };
  if (extras.fix !== undefined) {
    result.fix = extras.fix;
  }
  if (extras.detail !== undefined) {
    result.detail = extras.detail;
  }
  return result;
}

/**
 * Resolves the shared rootResponse for a header checker, collapsing the common
 * preamble (no live context, resource unavailable, fetch failed) into ready-made
 * results. On success returns the response for the checker to inspect.
 */
export type RootOutcome =
  | { kind: 'done'; results: CheckResult[] }
  | { kind: 'ok'; response: HttpResponse };

export async function withRootResponse(
  ctx: CheckContext,
  checkerId: string,
  category: CheckCategory,
  severity: Severity,
): Promise<RootOutcome> {
  if (ctx.live === null) {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'skip',
          'no-live-context',
          'Skipped: no live context (run with --url).',
        ),
      ],
    };
  }
  const outcome = await resolveResource(ctx.live.rootResponse, ctx.signal);
  if (outcome.kind === 'skip') {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'skip',
          'root-response-unavailable',
          `Skipped: ${outcome.reason}`,
        ),
      ],
    };
  }
  if (outcome.kind === 'fail') {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'fail',
          'fetch-failed',
          `Failed to fetch ${ctx.live.url}: ${outcome.error.message}`,
          { fix: 'Ensure the URL is reachable and returns an HTTP response.' },
        ),
      ],
    };
  }
  return { kind: 'ok', response: outcome.value };
}

/** Resolves the shared dom resource, collapsing the common preamble. */
export type DomOutcome = { kind: 'done'; results: CheckResult[] } | { kind: 'ok'; dom: ParsedDom };

export async function withDom(
  ctx: CheckContext,
  checkerId: string,
  category: CheckCategory,
  severity: Severity,
): Promise<DomOutcome> {
  if (ctx.live === null) {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'skip',
          'no-live-context',
          'Skipped: no live context (run with --url).',
        ),
      ],
    };
  }
  const outcome = await resolveResource(ctx.live.dom, ctx.signal);
  if (outcome.kind === 'skip') {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'skip',
          'dom-unavailable',
          `Skipped: ${outcome.reason}`,
        ),
      ],
    };
  }
  if (outcome.kind === 'fail') {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'fail',
          'dom-failed',
          `Failed to load DOM for ${ctx.live.url}: ${outcome.error.message}`,
          {
            fix: 'Ensure the URL returns a valid HTML response.',
          },
        ),
      ],
    };
  }
  return { kind: 'ok', dom: outcome.value };
}

/** Resolves the shared tls resource, collapsing the common preamble. */
export type TlsOutcome = { kind: 'done'; results: CheckResult[] } | { kind: 'ok'; tls: TlsResult };

export async function withTls(
  ctx: CheckContext,
  checkerId: string,
  category: CheckCategory,
  severity: Severity,
): Promise<TlsOutcome> {
  if (ctx.live === null) {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'skip',
          'no-live-context',
          'Skipped: no live context (run with --url).',
        ),
      ],
    };
  }
  const outcome = await resolveResource(ctx.live.tls, ctx.signal);
  if (outcome.kind === 'skip') {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'skip',
          'tls-unavailable',
          `Skipped: ${outcome.reason}`,
        ),
      ],
    };
  }
  if (outcome.kind === 'fail') {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'fail',
          'tls-failed',
          `TLS handshake failed for ${ctx.live.parsedUrl.hostname}: ${outcome.error.message}`,
          { fix: 'Ensure the host is reachable over HTTPS.' },
        ),
      ],
    };
  }
  return { kind: 'ok', tls: outcome.value };
}

/** Gate for email-auth checkers (SPF / DMARC / DKIM). Synchronous. */
export type EmailAuthOutcome =
  | { kind: 'done'; results: CheckResult[] }
  | { kind: 'ok'; dns: DnsResolver; domain: string; options: EmailAuthOptions };

function isEmailAuthOptions(v: unknown): v is EmailAuthOptions {
  return (
    typeof v === 'object' &&
    v !== null &&
    'enabled' in v &&
    typeof (v as EmailAuthOptions).enabled === 'boolean'
  );
}

export function emailAuthContext(
  ctx: CheckContext,
  checkerId: string,
  category: CheckCategory,
  severity: Severity,
): EmailAuthOutcome {
  const raw = ctx.config.checkerOptions['email-auth'];
  const opts = isEmailAuthOptions(raw) ? raw : null;
  if (!opts?.enabled) {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'skip',
          'email-auth-disabled',
          'Skipped: email-auth checker option is not enabled.',
        ),
      ],
    };
  }
  if (ctx.live === null) {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'skip',
          'no-live-context',
          'Skipped: no live context (run with --url).',
        ),
      ],
    };
  }
  const domain =
    typeof opts.domain === 'string' && opts.domain.length > 0
      ? opts.domain
      : ctx.live.parsedUrl.hostname;
  return { kind: 'ok', dns: ctx.live.dns, domain, options: opts };
}

/** Resolves the shared axe resource, collapsing the common preamble. */
export type AxeOutcome = { kind: 'done'; results: CheckResult[] } | { kind: 'ok'; axe: AxeResult };

export async function withAxe(
  ctx: CheckContext,
  checkerId: string,
  category: CheckCategory,
  severity: Severity,
): Promise<AxeOutcome> {
  if (ctx.live === null) {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'skip',
          'no-live-context',
          'Skipped: no live context (run with --url).',
        ),
      ],
    };
  }
  const outcome = await resolveResource(ctx.live.axe, ctx.signal);
  if (outcome.kind === 'skip') {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'skip',
          'axe-unavailable',
          `Skipped: ${outcome.reason}`,
        ),
      ],
    };
  }
  if (outcome.kind === 'fail') {
    return {
      kind: 'done',
      results: [
        liveResult(
          checkerId,
          category,
          severity,
          'fail',
          'axe-failed',
          `axe-core run failed for ${ctx.live.url}: ${outcome.error.message}`,
          { fix: 'Ensure the URL is reachable and puppeteer can render it.' },
        ),
      ],
    };
  }
  return { kind: 'ok', axe: outcome.value };
}

/**
 * Converts a list of axe violations to a single human-readable detail string
 * suitable for a CheckResult's `detail` field.
 */
export function summarizeAxeViolations(violations: AxeViolation[]): string {
  return violations
    .map((v) => {
      const nodeCount = v.nodes.length;
      return `${v.id} (${nodeCount} node${nodeCount === 1 ? '' : 's'}): ${v.help}`;
    })
    .join('\n');
}
