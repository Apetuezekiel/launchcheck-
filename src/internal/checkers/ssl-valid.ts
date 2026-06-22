import type { Checker } from '../../types/index.js';
import { liveResult, withTls } from '../runtime/live-checker-support.js';

const ID = 'ssl-valid';
const CAT = 'security' as const;
const SEV = 'critical' as const;

export const sslValidChecker: Checker = {
  id: ID,
  name: 'SSL certificate valid',
  category: CAT,
  mode: 'live',
  consumes: ['tls'],
  async run(ctx) {
    const got = await withTls(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    if (got.tls.valid) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'ssl-valid',
          `TLS certificate valid (issuer: ${got.tls.issuer || 'unknown'}).`,
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'ssl-invalid',
        `TLS certificate is not trusted: ${got.tls.errorReason ?? 'unknown reason'}.`,
        {
          fix: 'Install a valid certificate trusted by the system root store.',
        },
      ),
    ];
  },
};
