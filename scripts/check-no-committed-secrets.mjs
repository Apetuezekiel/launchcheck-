#!/usr/bin/env node
// Scan tracked source for contiguous, scanner-matchable secret tokens. This
// guards the class of failure that got secret-scan reverted (PR #27): a full
// provider token committed even in a test fixture trips GitGuardian / GitHub
// push protection. Assemble fixture secrets from fragments instead.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, 'private-key'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'aws-access-key-id'],
  [/\bgh[pousr]_[A-Za-z0-9]{36}\b/g, 'github-token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, 'slack-token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, 'google-api-key'],
  [/\b(?:sk|rk)_live_[0-9A-Za-z]{24,}\b/g, 'stripe-secret-key'],
];

const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|ya?ml|toml|ini|env|sh|bash|zsh|md|txt|properties|xml)$/;

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && TEXT_EXT.test(s));

let findings = 0;
for (const file of tracked) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const [re, name] of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(lines[i] ?? '')) {
        findings += 1;
        console.error(`::error file=${file},line=${i + 1}::committed ${name} token`);
      }
    }
  }
}

if (findings > 0) {
  console.error(
    `\nFound ${findings} contiguous secret token(s) in tracked source. Assemble test fixtures from fragments so no full token is committed.`,
  );
  process.exit(1);
}
console.log('✓ No committed secret tokens in tracked source');
