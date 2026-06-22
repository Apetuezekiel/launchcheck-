import { describe, expect, test } from 'vitest';
import { DefaultDnsResolver, type DnsBackend } from '../dns-resolver.js';

function backend(txt: Record<string, string[][]>): DnsBackend & { calls: number } {
  return {
    calls: 0,
    resolveTxt(host) {
      this.calls += 1;
      return Promise.resolve(txt[host] ?? []);
    },
    resolve4: () => Promise.resolve([]),
    resolve6: () => Promise.resolve([]),
    resolveMx: () => Promise.resolve([]),
    resolveCname: () => Promise.resolve([]),
  };
}

describe('DefaultDnsResolver', () => {
  test('spf finds the v=spf1 record', async () => {
    const r = new DefaultDnsResolver(backend({ 'x.test': [['v=spf1 include:_spf.x.test ~all']] }));
    expect(await r.spf('x.test')).toContain('v=spf1');
    expect(await r.spf('none.test')).toBeNull();
  });
  test('dmarc looks up _dmarc subdomain', async () => {
    const r = new DefaultDnsResolver(backend({ '_dmarc.x.test': [['v=DMARC1; p=reject']] }));
    expect(await r.dmarc('x.test')).toContain('DMARC1');
  });
  test('dkim looks up selector._domainkey', async () => {
    const r = new DefaultDnsResolver(backend({ 's1._domainkey.x.test': [['v=DKIM1; p=AAAA']] }));
    expect(await r.dkim('x.test', 's1')).toContain('DKIM1');
    expect(await r.dkim('x.test', 'missing')).toBeNull();
  });
  test('memoizes by host', async () => {
    const b = backend({ 'x.test': [['v=spf1 ~all']] });
    const r = new DefaultDnsResolver(b);
    await r.resolveTxt('x.test');
    await r.resolveTxt('x.test');
    expect(b.calls).toBe(1);
  });
});
