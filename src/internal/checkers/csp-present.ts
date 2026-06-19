import type { Checker } from '../../types/index.js';
import { liveResult, withRootResponse } from '../runtime/live-checker-support.js';

const ID = 'csp-present';
const CAT = 'security' as const;
const SEV = 'major' as const;

export const cspPresentChecker: Checker = {
  id: ID,
  name: 'Content-Security-Policy header present',
  category: CAT,
  mode: 'live',
  consumes: ['rootResponse'],
  async run(ctx) {
    const got = await withRootResponse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const value = got.response.headers.get('content-security-policy');
    if (value === null) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'csp-missing',
          'Content-Security-Policy header is absent.',
          {
            fix: 'Add a Content-Security-Policy header scoped to your app.',
          },
        ),
      ];
    }
    const unsafe = /unsafe-inline|unsafe-eval/i.test(value);
    const mitigated = /'nonce-|'sha(256|384|512)-/i.test(value);
    if (unsafe && !mitigated) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'warn',
          'csp-unsafe',
          "CSP present but uses 'unsafe-inline' or 'unsafe-eval' without a nonce/hash.",
          {
            fix: "Replace 'unsafe-inline'/'unsafe-eval' with nonces or hashes.",
          },
        ),
      ];
    }
    return [
      liveResult(ID, CAT, SEV, 'pass', 'csp-present', 'Content-Security-Policy header present.'),
    ];
  },
};
