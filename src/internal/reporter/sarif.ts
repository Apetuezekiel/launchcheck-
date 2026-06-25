import type { CheckResult, Severity } from '../../types/index.js';
import { findById } from '../registry/index.js';
import { LAUNCHCHECK_VERSION } from '../version.js';
import { fingerprint } from './fingerprint.js';

/** SARIF 2.1.0 level. */
type SarifLevel = 'error' | 'warning' | 'note';

function levelFor(severity: Severity): SarifLevel {
  if (severity === 'critical' || severity === 'major') {
    return 'error';
  }
  if (severity === 'minor') {
    return 'warning';
  }
  return 'note';
}

interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: { text: string };
  partialFingerprints: { launchcheckId: string };
  properties?: { url: string };
  locations?: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region?: { startLine: number; startColumn?: number };
    };
  }>;
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
}

/**
 * Formats results as SARIF 2.1.0 for GitHub code-scanning / PR annotations.
 * Emits only findings (status 'fail' or 'warn'); 'pass'/'skip' are not problems.
 * Live findings carry no file location (SARIF allows that); static findings with
 * a `location` are mapped to a physicalLocation.
 */
export function formatSarif(results: ReadonlyArray<CheckResult>): string {
  const findings = results.filter((r) => r.status === 'fail' || r.status === 'warn');

  const ruleMap = new Map<string, SarifRule>();
  for (const r of findings) {
    if (!ruleMap.has(r.checkerId)) {
      ruleMap.set(r.checkerId, {
        id: r.checkerId,
        name: findById(r.checkerId)?.name ?? r.checkerId,
        shortDescription: { text: findById(r.checkerId)?.description ?? r.checkerId },
      });
    }
  }

  const sarifResults: SarifResult[] = findings.map((r) => {
    const out: SarifResult = {
      ruleId: r.checkerId,
      level: levelFor(r.severity),
      message: { text: r.fix ? `${r.message} Fix: ${r.fix}` : r.message },
      partialFingerprints: { launchcheckId: fingerprint(r) },
    };
    if (r.url !== undefined) {
      out.properties = { url: r.url };
    }
    if (r.location !== undefined) {
      out.locations = [
        {
          physicalLocation: {
            artifactLocation: { uri: r.location.file },
            ...(r.location.line !== undefined
              ? {
                  region: {
                    startLine: r.location.line,
                    ...(r.location.column !== undefined ? { startColumn: r.location.column } : {}),
                  },
                }
              : {}),
          },
        },
      ];
    } else if (r.url !== undefined) {
      // Live finding with no file location: use the page URL as the SARIF artifact.
      out.locations = [{ physicalLocation: { artifactLocation: { uri: r.url } } }];
    }
    return out;
  });

  const doc = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'launchcheck',
            informationUri: 'https://www.npmjs.com/package/launchcheck',
            version: LAUNCHCHECK_VERSION,
            rules: [...ruleMap.values()],
          },
        },
        results: sarifResults,
      },
    ],
  };
  return JSON.stringify(doc, null, 2);
}
