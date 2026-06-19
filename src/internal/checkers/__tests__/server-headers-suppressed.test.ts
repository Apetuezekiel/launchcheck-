import { describe, expect, test } from 'vitest';
import { findById } from '../../registry/index.js';
import { serverHeadersSuppressedChecker } from '../server-headers-suppressed.js';
import { makeLiveContext } from './live-context.js';

describe('serverHeadersSuppressedChecker', () => {
  test('matches the registry entry', () => {
    const e = findById('server-headers-suppressed');
    expect(serverHeadersSuppressedChecker.id).toBe(e?.id);
    expect(serverHeadersSuppressedChecker.mode).toBe(e?.mode);
  });
  test('pass when headers absent', async () => {
    const r = await serverHeadersSuppressedChecker.run(makeLiveContext({ headers: {} }));
    expect(r[0]?.status).toBe('pass');
  });
  test('pass when server header version-free', async () => {
    const r = await serverHeadersSuppressedChecker.run(
      makeLiveContext({ headers: { server: 'nginx' } }),
    );
    expect(r[0]?.status).toBe('pass');
  });
  test('fail when server header leaks version', async () => {
    const r = await serverHeadersSuppressedChecker.run(
      makeLiveContext({ headers: { server: 'nginx/1.25.3', 'x-powered-by': 'Express' } }),
    );
    expect(r[0]?.status).toBe('fail');
    expect(r[0]?.resultId).toBe('server-headers-leak-version');
    expect(r[0]?.detail).toContain('nginx/1.25.3');
  });
});
