import type { Checker } from '../../types/index.js';
import { emailAuthContext, liveResult } from '../runtime/live-checker-support.js';

const ID = 'spf-record';
const CAT = 'security' as const;
const SEV = 'major' as const;

export const spfRecordChecker: Checker = {
  id: ID,
  name: 'SPF record present',
  category: CAT,
  mode: 'live',
  consumes: ['dns'],
  async run(ctx) {
    const got = emailAuthContext(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    try {
      const record = await got.dns.spf(got.domain);
      if (record !== null) {
        return [
          liveResult(ID, CAT, SEV, 'pass', 'spf-present', `SPF record present for ${got.domain}.`),
        ];
      }
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'spf-missing',
          `No SPF (v=spf1) TXT record found for ${got.domain}.`,
          {
            fix: 'Publish an SPF TXT record for the sending domain.',
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
