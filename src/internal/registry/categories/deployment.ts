import type { RegistryEntry } from '../types.js';

/** Registry entries for the deployment category (4 checkers: 2 static + 2 live). */
export const deploymentCheckers: ReadonlyArray<RegistryEntry> = [
  {
    id: 'ci-config-exists',
    name: 'CI configuration present',
    category: 'deployment',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'minor',
    description:
      'Detects `.github/workflows/`, `.gitlab-ci.yml`, `circleci/config.yml`, `Jenkinsfile`, or `.buildkite/`.',
  },
  {
    id: 'env-example-exists',
    name: '.env.example or .env.template present',
    category: 'deployment',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'minor',
    description: 'Detects presence of any `.env*example` or `.env*template` file in projectDir.',
  },
  {
    id: 'health-endpoint-responds',
    name: 'Health endpoint returns 2xx',
    category: 'deployment',
    mode: 'live',
    defaultEnabled: true,
    maxSeverity: 'major',
    description:
      'Tries each configured path; passes if any returns 2xx; warns if all return 404; fails if all return 5xx or unreachable.',
    consumes: ['http'],
    optionsKey: 'health-endpoint',
  },
  {
    id: 'not-found-returns-404',
    name: 'Unknown path returns HTTP 404',
    category: 'deployment',
    mode: 'live',
    defaultEnabled: true,
    maxSeverity: 'minor',
    description:
      'GETs a deliberately bad path (`/__launchcheck-404-probe`); expects status 404, not 200-with-error-page.',
    consumes: ['http'],
  },
] as const;
