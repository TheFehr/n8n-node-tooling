# n8n-node-tooling

Shared development tooling for n8n community node packages that **mirror the version of the tool they integrate with** (for example a node for service X that is versioned `X.minor.patch`).

Dev-time only: nothing here ships inside a node package, and nothing is a runtime dependency.

## Status

Work in progress. Implemented: the version rules and the `n8n-node-tooling` CLI (`check`, `update`, `next-version`, `verify`). Planned: reusable GitHub Actions workflows (CI, nightly compatibility bump, release PR, publish), shared lint/format/tsconfig/Renovate presets, and an integration-test skeleton.

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

## CLI

```sh
n8n-node-tooling check         # exit 0 up to date, 1 drift found, 2 the check itself failed
n8n-node-tooling update        # apply the drift to package.json, README.md and pinned files
n8n-node-tooling next-version  # offline: the version the next release must carry
n8n-node-tooling verify        # offline: package version mirrors upstream, README has a Versioning section
```

All commands accept `--cwd <dir>`. Configuration lives in the consuming package's `package.json`:

```json
"n8nNodeTooling": {
  "upstream": {
    "name": "PocketBase",
    "source": { "type": "github", "repo": "pocketbase/pocketbase" },
    "track": { "type": "field", "name": "pocketbaseVersion" },
    "majorOffset": 2
  },
  "readme": "Last tested with n8n {n8n} and PocketBase {upstream}.",
  "pins": [
    { "file": "docker-compose.test.yml", "template": "image: n8nio/n8n:{version}", "from": "n8n" }
  ]
}
```

- `source` is where the latest upstream version comes from: a GitHub release (`github`) or an npm package (`npm`).
- `track` is where the package records the upstream version it was last synced against: a top-level field (`field`) or a `devDependency`.
- `readme` is the compatibility sentence kept up to date. `{n8n}` and `{upstream}` are placeholders; the rest is matched literally.
- `pins` keeps versions in other files (for example container image tags used by integration tests) in step. `{version}` is the placeholder, and `from` picks `upstream` or `n8n`.
- `peerDependencies["n8n-workflow"]` is left alone; the n8n-workflow version synced against is recorded in `n8nWorkflowVersion`.

A missing README sentence or pinned line is an error, never a silent skip.

## Development

```sh
npm test
```

Requires Node 22 or newer.

## License

MIT
