import type { Checker } from '../../types/index.js';
import { consoleLogScanChecker } from '../checkers/console-log-scan.js';
import { envExampleExistsChecker } from '../checkers/env-example-exists.js';
import { gitignoreCoverageChecker } from '../checkers/gitignore-coverage.js';
import { todoFixmeScanChecker } from '../checkers/todo-fixme-scan.js';
import { findById } from '../registry/index.js';

/**
 * All Checker objects registered at runtime, in canonical order. New
 * checkers append to this list. Each Checker.id MUST have a matching
 * RegistryEntry — enforced by validateCheckerRegistration().
 *
 * Intentionally contains every checker regardless of mode; the orchestrator
 * filters by mode at run time. Frozen to prevent mutation.
 */
export const ALL_CHECKERS: ReadonlyArray<Checker> = Object.freeze([
  consoleLogScanChecker,
  todoFixmeScanChecker,
  gitignoreCoverageChecker,
  envExampleExistsChecker,
]);

/**
 * Asserts that every Checker in `checkers` has a matching RegistryEntry
 * whose category and mode agree. Throws on drift — a programming error the
 * test suite must catch before release. Cheap; safe to call per orchestrator
 * invocation.
 */
export function validateCheckerRegistration(checkers: ReadonlyArray<Checker> = ALL_CHECKERS): void {
  for (const checker of checkers) {
    const entry = findById(checker.id);
    if (entry === undefined) {
      throw new Error(`Checker '${checker.id}' has no matching RegistryEntry.`);
    }
    if (entry.category !== checker.category) {
      throw new Error(
        `Checker '${checker.id}' category '${checker.category}' does not match RegistryEntry category '${entry.category}'.`,
      );
    }
    if (entry.mode !== checker.mode) {
      throw new Error(
        `Checker '${checker.id}' mode '${checker.mode}' does not match RegistryEntry mode '${entry.mode}'.`,
      );
    }
  }
}
