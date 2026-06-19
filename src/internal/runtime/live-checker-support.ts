import type {
  CheckCategory,
  CheckContext,
  CheckResult,
  HttpResponse,
  ParsedDom,
  Severity,
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
