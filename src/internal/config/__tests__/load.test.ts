import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CONFIG_FILENAME, ConfigError, loadConfigFile } from '../load.js';

async function writeRc(dir: string, content: string): Promise<void> {
  await fs.writeFile(path.join(dir, CONFIG_FILENAME), content, 'utf8');
}

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'launchcheck-config-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('loadConfigFile', () => {
  test('returns null when .launchcheckrc does not exist', async () => {
    const result = await loadConfigFile(root);
    expect(result).toBeNull();
  });

  test('parses a valid file with all known fields', async () => {
    const payload = {
      url: 'https://example.com',
      checkers: { 'console-log-scan': false, 'env-example-exists': true },
      thresholds: { 'lighthouse-performance': 0.9, lcp: 2500 },
      checkerOptions: { 'secret-scan': { patterns: ['AWS_KEY'] } },
      ignore: ['dist/**', 'coverage/**'],
    };
    await writeRc(root, JSON.stringify(payload));
    const result = await loadConfigFile(root);
    expect(result).toEqual(payload);
  });

  test('parses a file containing only a subset of known fields', async () => {
    await writeRc(root, JSON.stringify({ url: 'https://example.com' }));
    const result = await loadConfigFile(root);
    expect(result).toEqual({ url: 'https://example.com' });
  });

  test('ignores unknown top-level keys (accepts them silently)', async () => {
    await writeRc(
      root,
      JSON.stringify({ url: 'https://example.com', unknownKey: 42, somethingElse: 'x' }),
    );
    const result = await loadConfigFile(root);
    expect(result).toEqual({ url: 'https://example.com' });
    expect(result).not.toHaveProperty('unknownKey');
    expect(result).not.toHaveProperty('somethingElse');
  });

  test('throws ConfigError on malformed JSON', async () => {
    await writeRc(root, '{ not valid json');
    await expect(loadConfigFile(root)).rejects.toThrow(ConfigError);
    await expect(loadConfigFile(root)).rejects.toThrow(/Failed to parse/);
  });

  test('throws ConfigError on non-object root (e.g. JSON array)', async () => {
    await writeRc(root, JSON.stringify(['url', 'value']));
    await expect(loadConfigFile(root)).rejects.toThrow(ConfigError);
    await expect(loadConfigFile(root)).rejects.toThrow(/top-level must be a JSON object/);
  });

  test('throws ConfigError when checkers contains a non-boolean value', async () => {
    await writeRc(root, JSON.stringify({ checkers: { 'console-log-scan': 'yes' } }));
    await expect(loadConfigFile(root)).rejects.toThrow(ConfigError);
    await expect(loadConfigFile(root)).rejects.toThrow(
      /'checkers.console-log-scan' must be a boolean/,
    );
  });

  test('throws ConfigError when ignore contains a non-string element', async () => {
    await writeRc(root, JSON.stringify({ ignore: ['dist/**', 42] }));
    await expect(loadConfigFile(root)).rejects.toThrow(ConfigError);
    await expect(loadConfigFile(root)).rejects.toThrow(/'ignore\[1\]' must be a string/);
  });
});
