import type { RegistryEntry } from '../types.js';

/** Registry entries for the accessibility category (6 live checkers, all consume axe). */
export const accessibilityCheckers: ReadonlyArray<RegistryEntry> = [
  {
    id: 'a11y-aria-valid',
    name: 'ARIA attributes used correctly',
    category: 'accessibility',
    mode: 'live',
    defaultEnabled: true,
    maxSeverity: 'major',
    description: 'ARIA attributes are used correctly. Consolidates all axe `aria-*` rules.',
    consumes: ['axe'],
    requiresPeerDep: 'puppeteer',
  },
  {
    id: 'a11y-color-contrast',
    name: 'Color contrast meets WCAG AA',
    category: 'accessibility',
    mode: 'live',
    defaultEnabled: true,
    maxSeverity: 'major',
    description: 'Text color contrast meets WCAG AA. Axe rule: `color-contrast`.',
    consumes: ['axe'],
    requiresPeerDep: 'puppeteer',
  },
  {
    id: 'a11y-focus-states',
    name: 'Focus states on interactive elements',
    category: 'accessibility',
    mode: 'live',
    defaultEnabled: true,
    maxSeverity: 'major',
    description:
      'Interactive elements have visible focus states. Axe rules: `focus-order-semantics`, `focusable-content`.',
    consumes: ['axe'],
    requiresPeerDep: 'puppeteer',
  },
  {
    id: 'a11y-image-alt-text',
    name: 'All images have alt text',
    category: 'accessibility',
    mode: 'live',
    defaultEnabled: true,
    maxSeverity: 'major',
    description:
      'All images have alternative text. Axe rules: `image-alt`, `area-alt`, `input-image-alt`.',
    consumes: ['axe'],
    requiresPeerDep: 'puppeteer',
  },
  {
    id: 'a11y-keyboard-tab-order',
    name: 'Logical tab order (partial automation)',
    category: 'accessibility',
    mode: 'live',
    defaultEnabled: true,
    maxSeverity: 'major',
    description:
      'Logical tab order for keyboard navigation. Axe rules: `tabindex`, `landmark-*` (partial signal — axe cannot fully verify keyboard nav).',
    consumes: ['axe'],
    requiresPeerDep: 'puppeteer',
  },
  {
    id: 'a11y-touch-targets',
    name: 'Touch targets ≥ 44x44px',
    category: 'accessibility',
    mode: 'live',
    defaultEnabled: true,
    maxSeverity: 'minor',
    description: 'Touch targets are at least 44×44px. Axe rule: `target-size`.',
    consumes: ['axe'],
    requiresPeerDep: 'puppeteer',
  },
] as const;
