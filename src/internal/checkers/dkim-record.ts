import type { CheckResult, Checker } from '../../types/index.js';
import { emailAuthContext, liveResult } from '../runtime/live-checker-support.js';

const ID = 'dkim-record';
const CAT = 'security' as const;
const SEV = 'major' as const;

export const dkimRecordChecker: Checker = {
  id: ID,
  name: 'DKIM record present for each configured selector',
  category: CAT,
  mode: 'live',
  consumes: ['dns'],
  async run(ctx): Promise<CheckResult[]> {
    const got = emailAuthContext(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const selectors = got.options.dkimSelectors ?? [];
    if (selectors.length === 0) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'skip',
          'no-dkim-selectors',
          'Skipped: no DKIM selectors configured (set email-auth.dkimSelectors).',
        ),
      ];
    }
    try {
      const missing: string[] = [];
      for (const selector of selectors) {
        const record = await got.dns.dkim(got.domain, selector);
        if (record === null) {
          missing.push(selector);
        }
      }
      if (missing.length === 0) {
        return [
          liveResult(
            ID,
            CAT,
            SEV,
            'pass',
            'dkim-present',
            `DKIM record present for all ${selectors.length} selector(s).`,
          ),
        ];
      }
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'dkim-missing',
          `Missing DKIM record for ${missing.length} of ${selectors.length} selector(s).`,
          {
            detail: missing.map((s) => `${s}._domainkey.${got.domain}`).join('\n'),
            fix: 'Publish a DKIM TXT record for each selector at <selector>._domainkey.<domain>.',
          },
        ),
      ];
    } catch (err) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'dns-error',
          `DNS lookup failed for ${got.domain}: ${(err as Error).message}`,
          {
            fix: 'Verify the domain resolves and DNS is reachable.',
          },
        ),
      ];
    }
  },
};
