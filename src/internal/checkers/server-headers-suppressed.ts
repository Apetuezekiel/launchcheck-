import type { Checker } from '../../types/index.js';
import { liveResult, withRootResponse } from '../runtime/live-checker-support.js';

const ID = 'server-headers-suppressed';
const CAT = 'security' as const;
const SEV = 'major' as const;

export const serverHeadersSuppressedChecker: Checker = {
  id: ID,
  name: 'Server / X-Powered-By suppressed',
  category: CAT,
  mode: 'live',
  consumes: ['rootResponse'],
  async run(ctx) {
    const got = await withRootResponse(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const headers = got.response.headers;
    // A header leaks version info when its value contains a digit (e.g. "nginx/1.25.3").
    const offenders: string[] = [];
    for (const name of ['server', 'x-powered-by']) {
      const value = headers.get(name);
      if (value !== null && /\d/.test(value)) {
        offenders.push(`${name}: ${value}`);
      }
    }
    if (offenders.length === 0) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'server-headers-suppressed',
          'Server / X-Powered-By absent or version-free.',
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'server-headers-leak-version',
        `${offenders.length} response header(s) leak software version info.`,
        {
          detail: offenders.join('\n'),
          fix: 'Remove or genericize the Server and X-Powered-By headers (strip version numbers).',
        },
      ),
    ];
  },
};
