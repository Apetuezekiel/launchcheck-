import type { Checker } from '../../types/index.js';
import { canonicalUrlChecker } from '../checkers/canonical-url.js';
import { ciConfigExistsChecker } from '../checkers/ci-config-exists.js';
import { clickjackingProtectionChecker } from '../checkers/clickjacking-protection.js';
import { compressionEnabledChecker } from '../checkers/compression-enabled.js';
import { consoleLogScanChecker } from '../checkers/console-log-scan.js';
import { corsNotWildcardChecker } from '../checkers/cors-not-wildcard.js';
import { cspPresentChecker } from '../checkers/csp-present.js';
import { dkimRecordChecker } from '../checkers/dkim-record.js';
import { dmarcRecordChecker } from '../checkers/dmarc-record.js';
import { envExampleExistsChecker } from '../checkers/env-example-exists.js';
import { eslintPassingChecker } from '../checkers/eslint-passing.js';
import { faviconPresentChecker } from '../checkers/favicon-present.js';
import { fontPreloadAndDisplaySwapChecker } from '../checkers/font-preload-and-display-swap.js';
import { gitignoreCoverageChecker } from '../checkers/gitignore-coverage.js';
import { headingHierarchyChecker } from '../checkers/heading-hierarchy.js';
import { healthEndpointRespondsChecker } from '../checkers/health-endpoint-responds.js';
import { hstsPresentChecker } from '../checkers/hsts-present.js';
import { httpsEnforcementChecker } from '../checkers/https-enforcement.js';
import { largeFilesInGitHistoryChecker } from '../checkers/large-files-in-git-history.js';
import { lockfileCommittedChecker } from '../checkers/lockfile-committed.js';
import { metaDescriptionPresentChecker } from '../checkers/meta-description-present.js';
import { notFoundReturns404Checker } from '../checkers/not-found-returns-404.js';
import { npmAuditChecker } from '../checkers/npm-audit.js';
import { openGraphTagsChecker } from '../checkers/open-graph-tags.js';
import { permissionsPolicyPresentChecker } from '../checkers/permissions-policy-present.js';
import { prettierPassingChecker } from '../checkers/prettier-passing.js';
import { readmeRequiredSectionsChecker } from '../checkers/readme-required-sections.js';
import { referrerPolicyPresentChecker } from '../checkers/referrer-policy-present.js';
import { robotsTxtAccessibleChecker } from '../checkers/robots-txt-accessible.js';
import { secretScanChecker } from '../checkers/secret-scan.js';
import { serverHeadersSuppressedChecker } from '../checkers/server-headers-suppressed.js';
import { singleH1Checker } from '../checkers/single-h1.js';
import { sitemapXmlAccessibleChecker } from '../checkers/sitemap-xml-accessible.js';
import { spfRecordChecker } from '../checkers/spf-record.js';
import { sslNotExpiringChecker } from '../checkers/ssl-not-expiring.js';
import { sslValidChecker } from '../checkers/ssl-valid.js';
import { staticAssetCacheHeadersChecker } from '../checkers/static-asset-cache-headers.js';
import { structuredDataChecker } from '../checkers/structured-data.js';
import { titleTagPresentChecker } from '../checkers/title-tag-present.js';
import { todoFixmeScanChecker } from '../checkers/todo-fixme-scan.js';
import { twitterCardTagsChecker } from '../checkers/twitter-card-tags.js';
import { typescriptStrictCompileChecker } from '../checkers/typescript-strict-compile.js';
import { unusedDependenciesChecker } from '../checkers/unused-dependencies.js';
import { xContentTypeOptionsNosniffChecker } from '../checkers/x-content-type-options-nosniff.js';
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
  ciConfigExistsChecker,
  readmeRequiredSectionsChecker,
  eslintPassingChecker,
  lockfileCommittedChecker,
  prettierPassingChecker,
  typescriptStrictCompileChecker,
  largeFilesInGitHistoryChecker,
  secretScanChecker,
  clickjackingProtectionChecker,
  cspPresentChecker,
  hstsPresentChecker,
  permissionsPolicyPresentChecker,
  referrerPolicyPresentChecker,
  serverHeadersSuppressedChecker,
  xContentTypeOptionsNosniffChecker,
  canonicalUrlChecker,
  headingHierarchyChecker,
  metaDescriptionPresentChecker,
  openGraphTagsChecker,
  singleH1Checker,
  structuredDataChecker,
  titleTagPresentChecker,
  twitterCardTagsChecker,
  sslValidChecker,
  sslNotExpiringChecker,
  spfRecordChecker,
  dmarcRecordChecker,
  dkimRecordChecker,
  robotsTxtAccessibleChecker,
  sitemapXmlAccessibleChecker,
  faviconPresentChecker,
  compressionEnabledChecker,
  httpsEnforcementChecker,
  notFoundReturns404Checker,
  corsNotWildcardChecker,
  healthEndpointRespondsChecker,
  fontPreloadAndDisplaySwapChecker,
  staticAssetCacheHeadersChecker,
  npmAuditChecker,
  unusedDependenciesChecker,
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
