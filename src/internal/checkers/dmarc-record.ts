import type { Checker } from '../../types/index.js';
import { emailAuthContext, liveResult } from '../runtime/live-checker-support.js';

const ID = 'dmarc-record';
const CAT = 'security' as const;
const SEV = 'minor' as const;

export const dmarcRecordChecker: Checker = {
  id: ID,
  name: 'DMARC record present',
  category: CAT,
  mode: 'live',
  consumes: ['dns'],
  async run(ctx) {
    const got = emailAuthContext(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    try {
      const record = await got.dns.dmarc(got.domain);
      if (record !== null) {
        return [
          liveResult(
            ID,
            CAT,
            SEV,
            'pass',
            'dmarc-present',
            `DMARC record present at _dmarc.${got.domain}.`,
          ),
        ];
      }
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'dmarc-missing',
          `No DMARC (v=DMARC1) record found at _dmarc.${got.domain}.`,
          {
            fix: 'Publish a DMARC TXT record at _dmarc.<domain>.',
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
          `DNS lookup failed for _dmarc.${got.domain}: ${(err as Error).message}`,
          {
            fix: 'Verify the domain resolves and DNS is reachable.',
          },
        ),
      ];
    }
  },
};
