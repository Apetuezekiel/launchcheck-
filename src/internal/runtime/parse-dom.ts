import * as cheerio from 'cheerio';
import type { DomElement, ParsedDom } from '../../types/index.js';

/**
 * Adapts cheerio into the frozen ParsedDom contract. Pure — takes an HTML
 * string, returns plain objects with text()/attr()/html() so the cheerio type
 * never leaks into checker code. No network (cheerio's fetch APIs are unused).
 */
export function parseDom(html: string): ParsedDom {
  const $ = cheerio.load(html);

  const toElements = (selector: string): DomElement[] => {
    const out: DomElement[] = [];
    $(selector).each((_, el) => {
      const $el = $(el);
      out.push({
        tagName: String($el.prop('tagName') ?? '').toLowerCase(),
        attr: (name) => $el.attr(name) ?? null,
        text: () => $el.text(),
        html: () => $el.html() ?? '',
      });
    });
    return out;
  };

  const titleEl = $('title').first();
  const title = titleEl.length > 0 ? titleEl.text() : null;

  const metaTags: ParsedDom['metaTags'] = [];
  $('meta').each((_, el) => {
    const $el = $(el);
    const entry: ParsedDom['metaTags'][number] = {};
    const name = $el.attr('name');
    const property = $el.attr('property');
    const content = $el.attr('content');
    const httpEquiv = $el.attr('http-equiv');
    if (name !== undefined) entry.name = name;
    if (property !== undefined) entry.property = property;
    if (content !== undefined) entry.content = content;
    if (httpEquiv !== undefined) entry.httpEquiv = httpEquiv;
    metaTags.push(entry);
  });

  const linkTags: ParsedDom['linkTags'] = [];
  $('link').each((_, el) => {
    const $el = $(el);
    const entry: ParsedDom['linkTags'][number] = {};
    const rel = $el.attr('rel');
    const href = $el.attr('href');
    const type = $el.attr('type');
    const sizes = $el.attr('sizes');
    if (rel !== undefined) entry.rel = rel;
    if (href !== undefined) entry.href = href;
    if (type !== undefined) entry.type = type;
    if (sizes !== undefined) entry.sizes = sizes;
    linkTags.push(entry);
  });

  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
      // skip unparseable JSON-LD blocks
    }
  });

  return {
    html,
    querySelectorAll: (selector) => toElements(selector),
    querySelector: (selector) => toElements(selector)[0] ?? null,
    title,
    metaTags,
    linkTags,
    jsonLd,
  };
}
