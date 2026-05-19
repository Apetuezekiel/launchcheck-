import type { RegistryEntry } from '../types.js';

/** Registry entries for the documentation category (1 static checker). */
export const documentationCheckers: ReadonlyArray<RegistryEntry> = [
  {
    id: 'readme-required-sections',
    name: 'README.md exists with required sections',
    category: 'documentation',
    mode: 'static',
    defaultEnabled: true,
    maxSeverity: 'minor',
    description:
      'Checks `<projectDir>/README.md` exists; scans for headings matching `Setup`/`Install`, `Environment`/`Configuration`, `Usage`. Configurable via `readme-sections.requiredHeadings`.',
    optionsKey: 'readme-sections',
  },
] as const;
