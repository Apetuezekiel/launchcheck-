import type { Checker } from '../../types/index.js';
import { liveResult, withRootResponse } from '../runtime/live-checker-support.js';

const ID = 'x-content-type-options-nosniff';
const CAT = 'security' as const;
const SEV = 'major' as const;

export const xContentTypeOptionsNosniffChecker: Checker = {
  id: ID,
  name: 'X-Content-Type-Options: nosniff',
  category: CAT,
  mode: 'live',
  consumes: ['rootResponse'],
  async run(ctx) {
    const got = await withRootResponse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const value = got.response.headers.get('x-content-type-options');
    if (value !== null && value.trim().toLowerCase() === 'nosniff') {
      return [
        liveResult(ID, CAT, SEV, 'pass', 'nosniff-present', 'X-Content-Type-Options is nosniff.'),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'nosniff-missing',
        value === null
          ? 'X-Content-Type-Options header is absent.'
          : `X-Content-Type-Options is "${value}", expected "nosniff".`,
        {
          fix: 'Set `X-Content-Type-Options: nosniff`.',
        },
      ),
    ];
  },
};
