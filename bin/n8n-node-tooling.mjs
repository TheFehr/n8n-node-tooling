#!/usr/bin/env node
// Usage: n8n-node-tooling <command> [--cwd <dir>]
//
//   check         Compare the repo with the latest upstream and n8n versions.
//                 Exit 0 up to date, 1 drift found, 2 the check itself failed.
//   update        Apply those changes to package.json, README.md and pinned files.
//   next-version  Print the version the next release must carry. Offline: uses the
//                 upstream version recorded in package.json.
//   verify        Offline: fail (exit 1) if the package version is out of sync with
//                 the recorded upstream version, or the README has no versioning section.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadConfig, trackedUpstreamVersion } from '../lib/config.mjs';
import { computeSync } from '../lib/sync.mjs';
import { latestN8n, latestUpstreamVersion } from '../lib/upstream.mjs';
import { isInSync, nextVersion } from '../lib/versions.mjs';

const args = process.argv.slice(2);
const command = args[0];
const cwdFlag = args.indexOf('--cwd');
const root = resolve(cwdFlag === -1 ? process.cwd() : args[cwdFlag + 1]);

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

async function sync(write) {
  const { pkgText, config } = load();
  const [upstream, n8n] = await Promise.all([
    latestUpstreamVersion(config.upstream.source),
    latestN8n(),
  ]);
  console.log(`Latest ${config.upstream.name}: ${upstream}`);
  console.log(`Latest n8n: ${n8n.n8n} (n8n-workflow ${n8n.n8nWorkflow})`);

  const files = Object.fromEntries(config.pins.map((pin) => [pin.file, read(pin.file)]));
  const result = computeSync({
    pkgText,
    readmeText: read('README.md'),
    files,
    config,
    latest: { upstream, n8n: n8n.n8n, n8nWorkflow: n8n.n8nWorkflow },
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
    case 'next-version': {
      const { pkg, config } = load();
      const next = nextVersion(pkg.version, currentUpstream(pkg, config), config.upstream.majorOffset);
      if (next.ahead) {
        console.error(`warning: ${pkg.version} is ahead of what ${config.upstream.name} dictates`);
      }
      console.log(next.version);
      return 0;
    }
    case 'verify': {
      const { pkg, config } = load();
      const upstream = currentUpstream(pkg, config);
      let ok = true;
      if (!isInSync(pkg.version, upstream, config.upstream.majorOffset)) {
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
      console.error('Usage: n8n-node-tooling <check|update|next-version|verify> [--cwd <dir>]');
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
