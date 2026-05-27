import { describe, expect, test } from 'vitest';
import type { RawConfig } from '../load.js';
import { resolveConfig } from '../resolve.js';

const PROJECT_DIR = '/tmp/launchcheck-project';

describe('resolveConfig', () => {
  test('defaults (no file, no cli) returns {url:null, projectDir, empty records, empty ignore}', () => {
    const result = resolveConfig({ projectDir: PROJECT_DIR });
    expect(result).toEqual({
      url: null,
      projectDir: PROJECT_DIR,
      checkers: {},
      thresholds: {},
      checkerOptions: {},
      ignore: [],
    });
  });

  test('fileConfig.url is used when cliOverrides.url is undefined', () => {
    const fileConfig: RawConfig = { url: 'https://from-file.example' };
    const result = resolveConfig({ projectDir: PROJECT_DIR, fileConfig, cliOverrides: {} });
    expect(result.url).toBe('https://from-file.example');
  });

  test('cliOverrides.url overrides fileConfig.url', () => {
    const fileConfig: RawConfig = { url: 'https://from-file.example' };
    const cliOverrides: RawConfig = { url: 'https://from-cli.example' };
    const result = resolveConfig({ projectDir: PROJECT_DIR, fileConfig, cliOverrides });
    expect(result.url).toBe('https://from-cli.example');
  });

  test('cliOverrides.url=null overrides fileConfig.url=string (explicit null precedence)', () => {
    const fileConfig: RawConfig = { url: 'https://from-file.example' };
    const cliOverrides: RawConfig = { url: null };
    const result = resolveConfig({ projectDir: PROJECT_DIR, fileConfig, cliOverrides });
    expect(result.url).toBeNull();
  });

  test('checkers shallow-merge: CLI wins on per-key conflict, file-only keys preserved', () => {
    const fileConfig: RawConfig = {
      checkers: { 'console-log-scan': true, 'env-example-exists': true },
    };
    const cliOverrides: RawConfig = { checkers: { 'console-log-scan': false } };
    const result = resolveConfig({ projectDir: PROJECT_DIR, fileConfig, cliOverrides });
    expect(result.checkers).toEqual({
      'console-log-scan': false,
      'env-example-exists': true,
    });
  });

  test('thresholds shallow-merge: CLI wins on per-key conflict', () => {
    const fileConfig: RawConfig = { thresholds: { 'lighthouse-performance': 0.8, lcp: 2500 } };
    const cliOverrides: RawConfig = { thresholds: { 'lighthouse-performance': 0.95 } };
    const result = resolveConfig({ projectDir: PROJECT_DIR, fileConfig, cliOverrides });
    expect(result.thresholds).toEqual({
      'lighthouse-performance': 0.95,
      lcp: 2500,
    });
  });

  test('ignore concatenates: file patterns first, then CLI', () => {
    const fileConfig: RawConfig = { ignore: ['dist/**', 'coverage/**'] };
    const cliOverrides: RawConfig = { ignore: ['tmp/**'] };
    const result = resolveConfig({ projectDir: PROJECT_DIR, fileConfig, cliOverrides });
    expect(result.ignore).toEqual(['dist/**', 'coverage/**', 'tmp/**']);
  });

  test('checkerOptions shallow-merge: CLI replaces inner object on conflict (no deep merge)', () => {
    const fileConfig: RawConfig = { checkerOptions: { a: { x: 1, y: 2 }, b: { keep: true } } };
    const cliOverrides: RawConfig = { checkerOptions: { a: { x: 3 } } };
    const result = resolveConfig({ projectDir: PROJECT_DIR, fileConfig, cliOverrides });
    expect(result.checkerOptions).toEqual({
      a: { x: 3 },
      b: { keep: true },
    });
  });

  test('projectDir is taken from args.projectDir', () => {
    const result = resolveConfig({ projectDir: '/some/other/path' });
    expect(result.projectDir).toBe('/some/other/path');
  });

  test('empty cliOverrides preserves all fileConfig fields', () => {
    const fileConfig: RawConfig = {
      url: 'https://from-file.example',
      checkers: { 'console-log-scan': true },
      thresholds: { lcp: 2500 },
      checkerOptions: { 'secret-scan': { patterns: ['AWS_KEY'] } },
      ignore: ['dist/**'],
    };
    const result = resolveConfig({ projectDir: PROJECT_DIR, fileConfig, cliOverrides: {} });
    expect(result).toEqual({
      url: 'https://from-file.example',
      projectDir: PROJECT_DIR,
      checkers: { 'console-log-scan': true },
      thresholds: { lcp: 2500 },
      checkerOptions: { 'secret-scan': { patterns: ['AWS_KEY'] } },
      ignore: ['dist/**'],
    });
  });
});
