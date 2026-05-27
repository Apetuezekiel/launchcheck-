import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Filename of the project config file, read from the project root. */
export const CONFIG_FILENAME = '.launchcheckrc';

/**
 * Validated shape of a .launchcheckrc file. Every field is optional —
 * a file may omit any field, in which case the resolver applies the
 * v1 defaults.
 */
export interface RawConfig {
  url?: string | null;
  checkers?: Record<string, boolean>;
  thresholds?: Record<string, number>;
  checkerOptions?: Record<string, unknown>;
  ignore?: string[];
}

/** Thrown when a config file exists but cannot be parsed or validated. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';

  constructor(
    message: string,
    public readonly source?: string,
  ) {
    super(message);
  }
}

/**
 * Reads and validates `<projectDir>/.launchcheckrc`. Returns the parsed
 * RawConfig on success, null when the file does not exist (ENOENT).
 *
 * Throws ConfigError when:
 *   - the file is unreadable for any reason other than ENOENT,
 *   - the file is not valid JSON,
 *   - the JSON root is not an object,
 *   - any known field has the wrong shape (e.g. `checkers` is not an
 *     object of booleans).
 *
 * Unknown top-level keys are ignored — forward-compatibility for future
 * fields.
 */
export async function loadConfigFile(projectDir: string): Promise<RawConfig | null> {
  const filePath = path.join(projectDir, CONFIG_FILENAME);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Failed to read ${CONFIG_FILENAME}: ${msg}`, filePath);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Failed to parse ${CONFIG_FILENAME} as JSON: ${msg}`, filePath);
  }
  return validateRawConfig(parsed, filePath);
}

function validateRawConfig(parsed: unknown, source: string): RawConfig {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError(`${CONFIG_FILENAME} top-level must be a JSON object.`, source);
  }
  const result: RawConfig = {};
  const obj = parsed as Record<string, unknown>;

  if ('url' in obj) {
    const v = obj.url;
    if (v !== null && typeof v !== 'string') {
      throw new ConfigError(
        `Field 'url' must be a string or null, got ${describeType(v)}.`,
        source,
      );
    }
    result.url = v;
  }

  if ('checkers' in obj) {
    const v = obj.checkers;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new ConfigError("Field 'checkers' must be an object of boolean values.", source);
    }
    const checkers: Record<string, boolean> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof val !== 'boolean') {
        throw new ConfigError(
          `Field 'checkers.${k}' must be a boolean, got ${describeType(val)}.`,
          source,
        );
      }
      checkers[k] = val;
    }
    result.checkers = checkers;
  }

  if ('thresholds' in obj) {
    const v = obj.thresholds;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new ConfigError("Field 'thresholds' must be an object of number values.", source);
    }
    const thresholds: Record<string, number> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new ConfigError(
          `Field 'thresholds.${k}' must be a finite number, got ${describeType(val)}.`,
          source,
        );
      }
      thresholds[k] = val;
    }
    result.thresholds = thresholds;
  }

  if ('checkerOptions' in obj) {
    const v = obj.checkerOptions;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new ConfigError("Field 'checkerOptions' must be an object.", source);
    }
    result.checkerOptions = v as Record<string, unknown>;
  }

  if ('ignore' in obj) {
    const v = obj.ignore;
    if (!Array.isArray(v)) {
      throw new ConfigError("Field 'ignore' must be an array of strings.", source);
    }
    for (let i = 0; i < v.length; i++) {
      if (typeof v[i] !== 'string') {
        throw new ConfigError(
          `Field 'ignore[${i}]' must be a string, got ${describeType(v[i])}.`,
          source,
        );
      }
    }
    result.ignore = v as string[];
  }

  return result;
}

function describeType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
