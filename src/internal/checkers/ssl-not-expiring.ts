import type { Checker } from '../../types/index.js';
import { liveResult, withTls } from '../runtime/live-checker-support.js';

const ID = 'ssl-not-expiring';
const CAT = 'security' as const;
const SEV = 'major' as const;
const THRESHOLD_KEY = 'ssl-expiry-warning-days';
const DEFAULT_WARNING_DAYS = 30;

export const sslNotExpiringChecker: Checker = {
  id: ID,
  name: 'SSL certificate not expiring within N days',
  category: CAT,
  mode: 'live',
  consumes: ['tls'],
  async run(ctx) {
    const got = await withTls(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const configured = ctx.config.thresholds[THRESHOLD_KEY];
    const warningDays =
      typeof configured === 'number' && Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_WARNING_DAYS;
    const days = got.tls.daysUntilExpiry;
    if (days < 0) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'ssl-expired',
          `TLS certificate expired ${-days} day(s) ago.`,
          {
            fix: 'Renew the TLS certificate.',
          },
        ),
      ];
    }
    if (days < warningDays) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'ssl-expiring-soon',
          `TLS certificate expires in ${days} day(s), within the ${warningDays}-day window.`,
          {
            fix: 'Renew the TLS certificate before it expires.',
          },
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'pass',
        'ssl-not-expiring',
        `TLS certificate valid for ${days} more day(s).`,
      ),
    ];
  },
};
