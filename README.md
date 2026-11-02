# n8n-node-tooling

Shared development tooling for n8n community node packages that **mirror the version of the tool they integrate with** (for example a node for service X that is versioned `X.minor.patch`).

Dev-time only: nothing here ships inside a node package, and nothing is a runtime dependency.

## Status

Work in progress. Implemented: the version rules and the `n8n-node-tooling` CLI (`check`, `update`, `next-version`, `verify`). Reusable GitHub Actions workflows (CI, nightly compatibility bump, release, publish) with caller templates. Planned: shared lint/format/tsconfig/Renovate presets and an integration-test skeleton. The workflows are in use by n8n-nodes-docspell.

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
n8n-node-tooling next-version  # offline: the version the next release must carry (exit 1 if the package is already ahead of upstream)
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
- `readme` is the compatibility text kept up to date. `{n8n}` and `{upstream}` are placeholders. The text lives in the README between a pair of marker comments (see below); everything between them is replaced.
- `pins` keeps versions in other files (for example container image tags used by integration tests) in step. `{version}` is the placeholder, and `from` picks `upstream` or `n8n`.
- `peerDependencies["n8n-workflow"]` is left alone; the n8n-workflow version synced against is recorded in `n8nWorkflowVersion`.

The README block is fenced by markers, which GitHub and npm do not show:

```md
<!-- n8n-node-tooling:compatibility -->
Last tested with n8n 2.45.7 and PocketBase 0.40.5.
<!-- /n8n-node-tooling:compatibility -->
```

Edits inside the markers are overwritten. Missing, repeated or unbalanced markers, and a missing pinned line, are errors, never a silent skip. A pin is matched by its template, so write it so that nothing version-like follows `{version}` except text the template itself spells out.

## Workflows

Reusable workflows in `.github/workflows/`, called from thin per-repo files (copy `templates/workflows/*.yml`, replace `<SHA>` with a commit of this repository in the `uses:` line, which is the only place that names a version; each workflow reads the commit it was called at from the run and checks the tooling out at that same commit.. This reads the run without any permission beyond `contents: read`, which only works for public repositories; a private caller would need `actions: read` granted by the caller and declared in each workflow):

| Workflow | Purpose |
|---|---|
| `ci.yml` | Lint (`lint-script`, plus an optional `extra-lint-script` as a separate step), build (`build-script`, default `build`, skipped if the package has none), unit tests, README versioning section, optional integration pipeline (when set, it replaces the plain unit-test step). |
| `nightly-compat.yml` | Detects drift in the upstream, n8n and n8n-workflow versions, tests the bump, then opens an auto-merging PR from a separate job with write access. |
| `release.yml` | Decides whether a release is due, opens an auto-merging release PR, and tags the merge commit. |
| `publish.yml` | On a version tag: checks that the tag equals the package version and the tagged commit is on the default branch, verifies the version mirror, publishes (skipped if that version is already on npm, so a rerun can finish the GitHub release) with npm provenance, creates the GitHub release. Notes in `.github/release-notes/<version>.md` are put in front of the generated ones. |

- Every workflow checks the tooling out into the workspace and moves it to the runner's temp directory straight away, so the package's own test runner, linters and formatters never see its files.
- A release is due when upstream's major.minor moved, or a commit since the last tag was not authored by Renovate.
- Nightly compatibility bumps are applied in a fresh checkout by a job that resolves the versions itself and stops unless they equal the ones the test job tested; the test job's outputs are only compared, never used. Nothing the test job produced on disk is committed.
- The repository needs a GitHub App (secrets `CLIENT_ID`, `APP_PRIVATE_KEY`) so pull requests and tags it creates trigger workflows. Publishing uses npm Trusted Publishing for the caller's `publish.yml`, or an `NPM_TOKEN` secret.

## Development

```sh
npm test
```

Requires Node 22 or newer.

## License

MIT
