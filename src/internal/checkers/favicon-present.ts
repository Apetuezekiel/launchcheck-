import type { Checker } from '../../types/index.js';
import { liveResult, readThreshold } from '../runtime/live-checker-support.js';
import { resolveResource } from '../runtime/resolve-resource.js';

const ID = 'favicon-present';
const CAT = 'seo' as const;
const SEV = 'minor' as const;

export const faviconPresentChecker: Checker = {
  id: ID,
  name: 'Favicon present',
  category: CAT,
  mode: 'live',
  consumes: ['dom', 'http'],
  async run(ctx) {
    if (ctx.live === null) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'skip',
          'no-live-context',
          'Skipped: no live context (run with --url).',
        ),
      ];
    }
    const dom = await resolveResource(ctx.live.dom, ctx.signal);
    if (dom.kind === 'ok') {
      const hasIconLink = dom.value.linkTags.some((l) =>
        (l.rel ?? '').split(/\s+/).some((token) => token.toLowerCase() === 'icon'),
      );
      if (hasIconLink) {
        return [
          liveResult(
            ID,
            CAT,
            SEV,
            'pass',
            'favicon-link',
            '<link rel="icon"> present in the document head.',
          ),
        ];
      }
      // DOM loaded but no icon link â€” the host is up, so the /favicon.ico probe
      // is meaningful and fast. (Only attempted here, never when the DOM failed.)
      const timeoutMs = readThreshold(ctx, 'ancillary-timeout-ms', 8000);
      const target = new URL('/favicon.ico', ctx.live.url).toString();
      try {
        const res = await ctx.live.http.fetch(target, { timeoutMs });
        if (res.status === 200) {
          return [liveResult(ID, CAT, SEV, 'pass', 'favicon-file', '/favicon.ico returns 200.')];
        }
      } catch {
        // fall through to the missing result
      }
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'favicon-missing',
          'No <link rel="icon"> and /favicon.ico does not return 200.',
          {
            fix: 'Add a <link rel="icon"> or serve /favicon.ico.',
          },
        ),
      ];
    }
    // DOM unavailable (e.g. the page did not load). Do NOT issue a second
    // network request â€” it would only add another timeout on a dead host.
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'fail',
        'favicon-missing',
        `No favicon could be determined: ${dom.kind === 'skip' ? dom.reason : dom.error.message}`,
        {
          fix: 'Ensure the page loads, then add a <link rel="icon"> or serve /favicon.ico.',
        },
      ),
    ];
  },
};
