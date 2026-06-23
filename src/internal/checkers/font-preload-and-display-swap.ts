import type { Checker } from '../../types/index.js';
import { liveResult, withDom } from '../runtime/live-checker-support.js';

const ID = 'font-preload-and-display-swap';
const CAT = 'performance' as const;
const SEV = 'minor' as const;

// Bound the number of external stylesheets fetched to keep the scan fast.
const MAX_STYLESHEETS = 5;

const FONT_FACE_BLOCK = /@font-face\s*\{[^}]*\}/gi;

// swap / optional / fallback all avoid the invisible-text (FOIT) failure mode.
const ACCEPTABLE_DISPLAY = /font-display\s*:\s*(swap|optional|fallback)/i;

export const fontPreloadAndDisplaySwapChecker: Checker = {
  id: ID,
  name: 'Fonts preloaded + font-display: swap',
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
    const live = ctx.live;
    const got = await withDom(ctx, ID, CAT, SEV);
    if (got.kind === 'done') {
      return got.results;
    }
    const dom = got.dom;
    const fontPreloads = dom
      .querySelectorAll('link[rel~="preload"]')
      .filter((el) => (el.attr('as') ?? '').toLowerCase() === 'font');
    // Combine inline <style> blocks with up to MAX_STYLESHEETS external sheets.
    let css = dom
      .querySelectorAll('style')
      .map((s) => s.text())
      .join('\n');
    const sheetHrefs = dom
      .querySelectorAll('link[rel~="stylesheet"]')
      .map((l) => l.attr('href'))
      .filter((h): h is string => h !== null && h.length > 0)
      .slice(0, MAX_STYLESHEETS);
    for (const href of sheetHrefs) {
      try {
        const res = await live.http.fetch(new URL(href, live.url).toString());
        css += `\n${res.body}`;
      } catch {
        // A stylesheet we cannot fetch simply contributes no @font-face rules.
      }
    }
    const faces = css.match(FONT_FACE_BLOCK) ?? [];
    if (faces.length === 0) {
      if (fontPreloads.length > 0) {
        return [
          liveResult(
            ID,
            CAT,
            SEV,
            'pass',
            'fonts-preloaded',
            `${fontPreloads.length} font(s) preloaded; no @font-face rules found to check font-display.`,
          ),
        ];
      }
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'pass',
          'no-web-fonts',
          'No web fonts detected; font preload and font-display are not applicable.',
        ),
      ];
    }
    const missingDisplay = faces.filter((f) => !ACCEPTABLE_DISPLAY.test(f)).length;
    if (missingDisplay > 0) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'warn',
          'font-display-missing',
          `${missingDisplay} of ${faces.length} @font-face block(s) lack font-display: swap; text may stay invisible while fonts load.`,
          { fix: 'Add `font-display: swap` (or optional/fallback) to each @font-face rule.' },
        ),
      ];
    }
    if (fontPreloads.length === 0) {
      return [
        liveResult(
          ID,
          CAT,
          SEV,
          'warn',
          'fonts-not-preloaded',
          `${faces.length} @font-face block(s) use font-display: swap, but no font is preloaded.`,
          { fix: 'Preload primary fonts with <link rel="preload" as="font" crossorigin>.' },
        ),
      ];
    }
    return [
      liveResult(
        ID,
        CAT,
        SEV,
        'pass',
        'fonts-optimized',
        `${faces.length} @font-face block(s) use an acceptable font-display and ${fontPreloads.length} font(s) are preloaded.`,
      ),
    ];
  },
};
