import { expect, test } from 'vitest';
import { ResourceDependencyFailedError, ResourceUnavailableError } from '../../index.js';
import type {
  AxeResult,
  AxeViolation,
  CheckCategory,
  CheckContext,
  CheckResult,
  Checker,
  CheckerMode,
  CombinedCheckContext,
  DnsResolver,
  DomElement,
  HttpClient,
  HttpHeaders,
  HttpRequestInit,
  HttpResponse,
  IgnoreMatcher,
  LighthouseResult,
  LiveCheckContext,
  LiveContext,
  Logger,
  Mode,
  PackageJson,
  ParsedDom,
  ProjectContext,
  ProjectFs,
  ResolveResource,
  ResolvedConfig,
  Resource,
  ResourceOutcome,
  ResultStatus,
  Severity,
  StaticCheckContext,
  TlsResult,
} from '../../index.js';

/**
 * Type-level smoke check. Referencing every exported type here forces the
 * compiler to resolve them. If any export is missing or any source file fails
 * to compile, this alias breaks. Kept module-private (no export) to satisfy
 * biome's noExportsInTest rule.
 */
type _PublicSurface = {
  axeResult: AxeResult;
  axeViolation: AxeViolation;
  checkCategory: CheckCategory;
  checkContext: CheckContext;
  checker: Checker;
  checkerMode: CheckerMode;
  checkResult: CheckResult;
  combinedCheckContext: CombinedCheckContext;
  dnsResolver: DnsResolver;
  domElement: DomElement;
  httpClient: HttpClient;
  httpHeaders: HttpHeaders;
  httpRequestInit: HttpRequestInit;
  httpResponse: HttpResponse;
  ignoreMatcher: IgnoreMatcher;
  lighthouseResult: LighthouseResult;
  liveCheckContext: LiveCheckContext;
  liveContext: LiveContext;
  logger: Logger;
  mode: Mode;
  packageJson: PackageJson;
  parsedDom: ParsedDom;
  projectContext: ProjectContext;
  projectFs: ProjectFs;
  resolvedConfig: ResolvedConfig;
  resolveResource: ResolveResource;
  resource: Resource<string>;
  resourceOutcome: ResourceOutcome<string>;
  resultStatus: ResultStatus;
  severity: Severity;
  staticCheckContext: StaticCheckContext;
  tlsResult: TlsResult;
};

test('public type surface compiles', () => {
  // Touch _PublicSurface in a value position so biome's noUnusedVariables sees
  // it as used. The runtime value is null; only the type matters.
  const surface: _PublicSurface | null = null;
  expect(surface).toBeNull();
});

test('error classes are constructible at runtime', () => {
  expect(typeof ResourceUnavailableError).toBe('function');
  expect(typeof ResourceDependencyFailedError).toBe('function');

  const unavailable = new ResourceUnavailableError('chrome', 'puppeteer not installed');
  expect(unavailable).toBeInstanceOf(Error);
  expect(unavailable.name).toBe('ResourceUnavailableError');
  expect(unavailable.resourceName).toBe('chrome');
  expect(unavailable.reason).toBe('puppeteer not installed');

  const original = new Error('boom');
  const cascade = new ResourceDependencyFailedError('lighthouse', 'chrome', original);
  expect(cascade).toBeInstanceOf(Error);
  expect(cascade.name).toBe('ResourceDependencyFailedError');
  expect(cascade.resourceName).toBe('lighthouse');
  expect(cascade.failedDependency).toBe('chrome');
  expect(cascade.originalError).toBe(original);
});
