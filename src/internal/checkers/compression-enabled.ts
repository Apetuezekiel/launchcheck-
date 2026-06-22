import type { Checker } from '../../types/index.js';
import { liveResult } from '../runtime/live-checker-support.js';

const ID = 'compression-enabled';
const CAT = 'performance' as const;
const SEV = 'major' as const;
const RECOGNIZED = /\b(gzip|br|deflate|zstd)\b/;

export const compressionEnabledChecker: Checker = {
  id: ID,
  name: 'Gzip/Brotli on text responses',
  category: CAT,
  mode: 'live',
  consumes: ['http'],
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
    // The shared rootResponse is fetched without Accept-Encoding, so its
    // Content-Encoding is unreliable. Issue a dedicated request advertising
    // compression and inspect only the response header (body is ignored, so no
    // decompression is needed).
    let encoding: string | null;
    try {
      const res = await ctx.live.http.fetch(ctx.live.url, {
        method: 'GET',
        headers: { 'accept-encoding': 'gzip, br, zstd' },
      });
      encoding = res.headers.get('content-encoding');
    } catch (err) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'compression-fetch-failed',
          `Failed to fetch ${ctx.live.url}: ${(err as Error).message}`,
          { fix: 'Ensure the URL is reachable and returns an HTTP response.' },
        ),
      ];
    }
    if (encoding === null || encoding.trim() === '') {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'fail',
          'compression-absent',
          'Response has no Content-Encoding despite advertising gzip/br/zstd; text assets are served uncompressed.',
          { fix: 'Enable gzip or brotli compression for text responses on the server or CDN.' },
        ),
      ];
    }
    const normalized = encoding.toLowerCase();
    if (!RECOGNIZED.test(normalized)) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'warn',
          'compression-unrecognized',
          `Content-Encoding is "${encoding}", not a recognized compression algorithm.`,
          { fix: 'Serve text responses with gzip, brotli (br), or zstd.' },
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'pass',
        'compression-enabled',
        `Response compressed with ${normalized}.`,
      ),
    ];
  },
};
