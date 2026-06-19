import { describe, expect, test } from 'vitest';
import { parseDom } from '../parse-dom.js';

const HTML = `<!doctype html><html><head>
<title>Hello World</title>
<meta name="description" content="a description">
<meta property="og:title" content="OG Title">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="https://x.test/">
<link rel="icon" href="/favicon.ico">
<script type="application/ld+json">{"@type":"Thing"}</script>
<script type="application/ld+json">not valid json</script>
</head><body><h1>A</h1><h2>B</h2></body></html>`;

describe('parseDom', () => {
  const dom = parseDom(HTML);
  test('title', () => {
    expect(dom.title).toBe('Hello World');
  });
  test('metaTags expose name/property/content', () => {
    expect(dom.metaTags.find((m) => m.name === 'description')?.content).toBe('a description');
    expect(dom.metaTags.find((m) => m.property === 'og:title')?.content).toBe('OG Title');
    expect(dom.metaTags.find((m) => m.name === 'twitter:card')?.content).toBe('summary');
  });
  test('linkTags expose rel/href', () => {
    expect(dom.linkTags.find((l) => l.rel === 'canonical')?.href).toBe('https://x.test/');
  });
  test('jsonLd parses valid blocks and skips invalid', () => {
    expect(dom.jsonLd).toHaveLength(1);
  });
  test('querySelectorAll / querySelector', () => {
    expect(dom.querySelectorAll('h1')).toHaveLength(1);
    const h2 = dom.querySelector('h2');
    expect(h2?.tagName).toBe('h2');
    expect(h2?.text()).toBe('B');
  });
  test('null title when absent', () => {
    expect(parseDom('<html><head></head><body></body></html>').title).toBeNull();
  });
});
