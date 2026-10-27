#!/usr/bin/env node
// Usage: n8n-node-tooling <command> [--cwd <dir>]
//                         [--upstream <v>] [--n8n <v>] [--n8n-workflow <v>]
//
//   check         Compare the repo with the latest upstream and n8n versions.
//                 Exit 0 up to date, 1 drift found, 2 the check itself failed.
//   update        Apply those changes to package.json, README.md and pinned files.
//   latest        Print the latest versions as key=value lines (for $GITHUB_OUTPUT).
//   files         Print every file `update` may touch, one per line (a PR allowlist).
//
// The three version flags override the lookup for that version (and skip its network
// call). A later job can pass the exact versions an earlier job tested, so it applies
// precisely those and nothing it did not test.
//   next-version  Print the version the next release must carry. Offline: uses the
//                 upstream version recorded in package.json.
//   verify        Offline: fail (exit 1) if the package version is out of sync with
//                 the recorded upstream version, or the README has no versioning section.
//                 --skip-version checks only the README: main is legitimately out of sync
//                 between a compatibility bump and the release that follows it.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadConfig, trackedUpstreamVersion } from '../lib/config.mjs';
import { computeSync } from '../lib/sync.mjs';
import { latestN8n, latestUpstreamVersion } from '../lib/upstream.mjs';
import { isInSync, nextVersion } from '../lib/versions.mjs';

const args = process.argv.slice(2);
const command = args[0];

function flag(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`);
  return value;
}

// Only plain versions: these values end up written into repository files.
function versionFlag(name) {
  const value = flag(name);
  if (value !== undefined && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) {
    throw new Error(`${name} must be a plain version like 1.2.3, got ${JSON.stringify(value)}`);
  }
  return value;
}

const root = resolve(flag('--cwd') ?? process.cwd());

function read(path) {
  const full = join(root, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

function load() {
  const pkgText = read('package.json');
  if (pkgText == null) throw new Error(`No package.json in ${root}`);
  const pkg = JSON.parse(pkgText);
  return { pkgText, pkg, config: loadConfig(pkg) };
}

async function resolveLatest(config) {
  const overrides = {
    upstream: versionFlag('--upstream'),
    n8n: versionFlag('--n8n'),
    n8nWorkflow: versionFlag('--n8n-workflow'),
  };
  const needN8n = overrides.n8n === undefined || overrides.n8nWorkflow === undefined;
  const [upstream, n8n] = await Promise.all([
    overrides.upstream ?? latestUpstreamVersion(config.upstream.source),
    needN8n ? latestN8n() : { n8n: overrides.n8n, n8nWorkflow: overrides.n8nWorkflow },
  ]);
  return {
    upstream,
    n8n: overrides.n8n ?? n8n.n8n,
    n8nWorkflow: overrides.n8nWorkflow ?? n8n.n8nWorkflow,
  };
}

async function sync(write) {
  const { pkgText, config } = load();
  const latest = await resolveLatest(config);
  console.log(`Latest ${config.upstream.name}: ${latest.upstream}`);
  console.log(`Latest n8n: ${latest.n8n} (n8n-workflow ${latest.n8nWorkflow})`);

  const files = Object.fromEntries(config.pins.map((pin) => [pin.file, read(pin.file)]));
  const result = computeSync({
    pkgText,
    readmeText: read('README.md'),
    files,
    config,
    latest,
  });

  for (const change of result.changes) console.log(change);
  if (result.changes.length === 0) {
    console.log('Everything is up to date.');
    return 0;
  }
  if (!write) {
    console.log("\nDrift found. Run the 'update' command to apply it.");
    return 1;
  }
  for (const [path, text] of Object.entries(result.files)) writeFileSync(join(root, path), text);
  console.log('\nProject files updated.');
  return 0;
}

function currentUpstream(pkg, config) {
  const version = trackedUpstreamVersion(pkg, config);
  if (!version) {
    throw new Error(`package.json does not record the ${config.upstream.name} version it tracks`);
  }
  return version;
}

async function main() {
  switch (command) {
    case 'check':
      return sync(false);
    case 'update':
      return sync(true);
    case 'latest': {
      const latest = await resolveLatest(load().config);
      console.log(`upstream=${latest.upstream}`);
      console.log(`n8n=${latest.n8n}`);
      console.log(`n8n_workflow=${latest.n8nWorkflow}`);
      return 0;
    }
    case 'files': {
      const { config } = load();
      const files = ['package.json', 'package-lock.json'];
      if (config.readme) files.push('README.md');
      for (const pin of config.pins) if (!files.includes(pin.file)) files.push(pin.file);
      console.log(files.join('\n'));
      return 0;
    }
    case 'next-version': {
      const { pkg, config } = load();
      const next = nextVersion(pkg.version, currentUpstream(pkg, config), config.upstream.majorOffset);
      if (next.ahead) {
        console.error(`warning: ${pkg.version} is ahead of what ${config.upstream.name} dictates`);
      }
      console.log(args.includes('--json') ? JSON.stringify(next) : next.version);
      return 0;
    }
    case 'verify': {
      const { pkg, config } = load();
      const upstream = currentUpstream(pkg, config);
      let ok = true;
      if (!args.includes('--skip-version') && !isInSync(pkg.version, upstream, config.upstream.majorOffset)) {
        console.error(
          `Version ${pkg.version} does not mirror ${config.upstream.name} ${upstream} ` +
            `(major offset ${config.upstream.majorOffset}).`,
        );
        ok = false;
      }
      if (!/^#{1,6}\s+.*versioning/im.test(read('README.md') ?? '')) {
        console.error('README.md has no "Versioning" section explaining how versions map to upstream.');
        ok = false;
      }
      if (ok) console.log(`Version ${pkg.version} mirrors ${config.upstream.name} ${upstream}.`);
      return ok ? 0 : 1;
    }
    default:
      console.error('Usage: n8n-node-tooling <check|update|latest|files|next-version|verify> [--cwd <dir>]');
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    // Exit 2 so callers can tell a failed check (e.g. a transient API error) from
    // exit 1's "confirmed drift" — they must not be treated as the same signal.
    console.error(`Error: ${error.message}`);
    process.exit(2);
  },
);
