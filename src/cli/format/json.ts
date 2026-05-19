import type { RegistryEntry } from '../../internal/registry/types.js';
import { LAUNCHCHECK_VERSION } from '../version.js';

/**
 * Machine-readable list output. Includes the full RegistryEntry shape
 * for each entry. Consumers can group or filter as needed; entries are
 * returned in REGISTRY iteration order.
 */
export function formatListJson(entries: ReadonlyArray<RegistryEntry>): string {
  const payload = {
    version: LAUNCHCHECK_VERSION,
    count: entries.length,
    entries,
  };
  return JSON.stringify(payload, null, 2);
}
