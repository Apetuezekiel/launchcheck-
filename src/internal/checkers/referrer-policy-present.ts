import type { Checker } from '../../types/index.js';
import { liveResult, withRootResponse } from '../runtime/live-checker-support.js';

const ID = 'referrer-policy-present';
const CAT = 'security' as const;
const SEV = 'minor' as const;

export const referrerPolicyPresentChecker: Checker = {
  id: ID,
  name: 'Referrer-Policy header present',
  category: CAT,
  mode: 'live',
  consumes: ['rootResponse'],
  async run(ctx) {
    const got = await withRootResponse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const value = got.response.headers.get('referrer-policy');
    if (value !== null && value.trim().length > 0) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'referrer-policy-present',
          `Referrer-Policy present: ${value.trim()}.`,
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'referrer-policy-missing',
        'Referrer-Policy header is absent.',
        {
          fix: 'Set a Referrer-Policy (e.g. `strict-origin-when-cross-origin`).',
        },
      ),
    ];
  },
};
