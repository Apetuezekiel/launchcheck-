import type { Checker } from '../../types/index.js';
import { liveResult, withRootResponse } from '../runtime/live-checker-support.js';

const ID = 'hsts-present';
const CAT = 'security' as const;
const SEV = 'critical' as const;
const MIN_MAX_AGE = 15_768_000; // 6 months in seconds

export const hstsPresentChecker: Checker = {
  id: ID,
  name: 'Strict-Transport-Security header present',
  category: CAT,
  mode: 'live',
  consumes: ['rootResponse'],
  async run(ctx) {
    const got = await withRootResponse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const value = got.response.headers.get('strict-transport-security');
    if (value === null) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'hsts-missing',
          'Strict-Transport-Security header is absent.',
          {
            fix: 'Add `Strict-Transport-Security: max-age=31536000; includeSubDomains`.',
          },
        ),
      ];
    }
    const match = /max-age\s*=\s*(\d+)/i.exec(value);
    const maxAge = match ? Number(match[1] ?? '0') : 0;
    if (maxAge < MIN_MAX_AGE) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'warn',
          'hsts-low-max-age',
          `HSTS max-age is ${maxAge}s, below the recommended ${MIN_MAX_AGE}s (6 months).`,
          {
            fix: 'Raise max-age to at least 15768000 (6 months).',
          },
        ),
      ];
    }
    return [
      liveResult(ID, CAT, SEV, 'pass', 'hsts-present', `HSTS present with max-age=${maxAge}.`),
    ];
  },
};
