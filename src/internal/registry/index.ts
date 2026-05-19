import type { CheckCategory } from '../../types/index.js';
import { accessibilityCheckers } from './categories/accessibility.js';
import { codeQualityCheckers } from './categories/code-quality.js';
import { dependenciesCheckers } from './categories/dependencies.js';
import { deploymentCheckers } from './categories/deployment.js';
import { documentationCheckers } from './categories/documentation.js';
import { performanceCheckers } from './categories/performance.js';
import { securityCheckers } from './categories/security.js';
import { seoCheckers } from './categories/seo.js';
import type { RegistryEntry } from './types.js';

/**
 * Canonical v1 checker registry. Frozen ordering: entries appear by
 * category in declaration order, then alphabetized by id within
 * each category file. The orchestrator and `launchcheck list` CLI
 * iterate in this order.
 */
export const REGISTRY: ReadonlyArray<RegistryEntry> = Object.freeze([
  ...codeQualityCheckers,
  ...dependenciesCheckers,
  ...securityCheckers,
  ...performanceCheckers,
  ...seoCheckers,
  ...accessibilityCheckers,
  ...deploymentCheckers,
  ...documentationCheckers,
]);

export function findById(id: string): RegistryEntry | undefined {
  return REGISTRY.find((entry) => entry.id === id);
}

export function findByCategory(category: CheckCategory): RegistryEntry[] {
  return REGISTRY.filter((entry) => entry.category === category);
}

export type { RegistryEntry } from './types.js';
