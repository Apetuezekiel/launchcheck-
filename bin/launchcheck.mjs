#!/usr/bin/env node
import('../dist/cli/index.js').then((m) => m.run(process.argv));
