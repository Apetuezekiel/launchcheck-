import type { Checker } from '../../types/index.js';
import { liveResult, withRootResponse } from '../runtime/live-checker-support.js';

const ID = 'permissions-policy-present';
const CAT = 'security' as const;
const SEV = 'minor' as const;

export const permissionsPolicyPresentChecker: Checker = {
  id: ID,
  name: 'Permissions-Policy header present',
  category: CAT,
  mode: 'live',
  consumes: ['rootResponse'],
  async run(ctx) {
    const got = await withRootResponse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const value = got.response.headers.get('permissions-policy');
    if (value !== null && value.trim().length > 0) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'permissions-policy-present',
          'Permissions-Policy header present.',
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'permissions-policy-missing',
        'Permissions-Policy header is absent.',
        {
          fix: 'Add a Permissions-Policy header restricting powerful features.',
        },
      ),
    ];
  },
};
