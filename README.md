# n8n-node-tooling

Shared development tooling for n8n community node packages that **mirror the version of the tool they integrate with** (for example a node for service X that is versioned `X.minor.patch`).

Dev-time only: nothing here ships inside a node package, and nothing is a runtime dependency.

## Status

Work in progress. Implemented so far: the version rules (`lib/versions.mjs`). Planned: reusable GitHub Actions workflows (CI, nightly compatibility bump, release PR, publish), a generic upstream-version check/update script, shared lint/format/tsconfig/Renovate presets, and an integration-test skeleton.

## Version rules

A package version is `major.minor.patch`:

| Part | Source |
|---|---|
| `major` | upstream major + `majorOffset` |
| `minor` | upstream minor |
| `patch` | the node's own counter |

- Node-only changes only ever bump the **patch**, however breaking they are. Breaking changes are flagged in the changelog and release notes, not in the version.
- When upstream's major or minor moves, the next release is `<target major>.<target minor>.0`.
- `majorOffset` lets a package that was already published at a numerically higher version adopt mirroring without ever lowering its version. For example, a package published as `2.3.x` tracking an upstream at `0.40.x` uses `majorOffset: 2` and becomes `2.40.x`; an upstream `1.0.0` would then become `3.0.0`.

```js
import { nextVersion, isInSync } from './lib/versions.mjs';

nextVersion('26.10.16', '26.10.0');   // { version: '26.10.17', kind: 'patch', ahead: false }
nextVersion('26.10.16', '26.11.0');   // { version: '26.11.0',  kind: 'sync',  ahead: false }
nextVersion('2.3.65', '0.40.5', 2);   // { version: '2.40.0',   kind: 'sync',  ahead: false }
isInSync('2.40.3', '0.40.5', 2);      // true
```

## Development

```sh
npm test
```

Requires Node 22 or newer.

## License

MIT
