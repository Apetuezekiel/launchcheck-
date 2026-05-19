# launchcheck

Pre-launch project verification tool.

**Status:** pre-alpha, not yet usable.

## Usage (pre-alpha)

The `list` subcommand prints all registered checkers:

    node ./bin/launchcheck.mjs list

Filter by category:

    node ./bin/launchcheck.mjs list --category security

JSON output for scripting:

    node ./bin/launchcheck.mjs list --json

Once published to npm, the binary will be invokable directly:

    npx launchcheck list

**Status:** pre-alpha. Only the `list` subcommand is functional.
The scanning runtime (static and live checks) is not yet implemented.
