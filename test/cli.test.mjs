import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/n8n-node-tooling.mjs', import.meta.url));

function project(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'n8n-node-tooling-'));
  const pkg = {
    name: 'n8n-nodes-example',
    version: '2.40.0',
    exampleVersion: '0.40.5',
    n8nWorkflowVersion: '2.44.2',
    n8nNodeTooling: {
      upstream: {
        name: 'Example',
        source: { type: 'github', repo: 'example/example' },
        track: { type: 'field', name: 'exampleVersion' },
        majorOffset: 2,
      },
      readme: 'Last tested with n8n {n8n} and Example {upstream}.',
      pins: [{ file: 'compose.yml', template: 'image: n8nio/n8n:{version}', from: 'n8n' }],
    },
    ...overrides,
  };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  writeFileSync(join(dir, 'README.md'), '# x\n\n## Versioning\n\nLast tested with n8n 2.44.2 and Example 0.40.5.\n');
  writeFileSync(join(dir, 'compose.yml'), 'image: n8nio/n8n:2.44.2\n');
  return dir;
}

function run(dir, ...args) {
  // The version flags remove every network call, so these tests are offline.
  return spawnSync(process.execPath, [CLI, ...args, '--cwd', dir], { encoding: 'utf8' });
}

const PINNED = ['--upstream', '0.41.0', '--n8n', '2.45.0', '--n8n-workflow', '2.45.0'];

test('check exits 1 on drift without writing, update applies it, then check exits 0', () => {
  const dir = project();
  assert.equal(run(dir, 'check', ...PINNED).status, 1);
  assert.match(readFileSync(join(dir, 'compose.yml'), 'utf8'), /2\.44\.2/);

  assert.equal(run(dir, 'update', ...PINNED).status, 0);
  assert.match(readFileSync(join(dir, 'compose.yml'), 'utf8'), /n8nio\/n8n:2\.45\.0/);
  assert.match(readFileSync(join(dir, 'README.md'), 'utf8'), /n8n 2\.45\.0 and Example 0\.41\.0\./);
  assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).exampleVersion, '0.41.0');

  assert.equal(run(dir, 'check', ...PINNED).status, 0);
});

test('update with explicit versions never applies anything else', () => {
  const dir = project();
  run(dir, 'update', '--upstream', '0.40.5', '--n8n', '2.45.0', '--n8n-workflow', '2.44.2');
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  assert.equal(pkg.exampleVersion, '0.40.5');
  assert.equal(pkg.n8nWorkflowVersion, '2.44.2');
});

test('latest prints key=value lines', () => {
  const result = run(project(), 'latest', ...PINNED);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'upstream=0.41.0\nn8n=2.45.0\nn8n_workflow=2.45.0\n');
});

test('next-version and verify work offline', () => {
  const dir = project({ version: '2.40.3' });
  assert.equal(run(dir, 'next-version').stdout.trim(), '2.40.4');
  assert.equal(run(dir, 'verify').status, 0);
  assert.equal(run(project({ version: '2.3.65' }), 'verify').status, 1);
});

test('verify fails without a Versioning section', () => {
  const dir = project();
  writeFileSync(join(dir, 'README.md'), '# x\n\nLast tested with n8n 2.44.2 and Example 0.40.5.\n');
  assert.equal(run(dir, 'verify').status, 1);
});

test('a version flag that is not a plain version exits 2', () => {
  const result = run(project(), 'check', '--upstream', '0.41.0; rm -rf /', '--n8n', '2.45.0', '--n8n-workflow', '2.45.0');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /plain version/);
});

test('files lists exactly what update may touch', () => {
  assert.equal(run(project(), 'files').stdout, 'package.json\npackage-lock.json\nREADME.md\ncompose.yml\n');
});

test('next-version --json reports whether upstream forced a sync', () => {
  assert.deepEqual(JSON.parse(run(project({ version: '2.3.65' }), 'next-version', '--json').stdout), {
    version: '2.40.0',
    kind: 'sync',
    ahead: false,
  });
  assert.equal(JSON.parse(run(project(), 'next-version', '--json').stdout).kind, 'patch');
});

test('verify --skip-version ignores the version mirror but still needs the README section', () => {
  assert.equal(run(project({ version: '2.3.65' }), 'verify', '--skip-version').status, 0);
  const dir = project({ version: '2.3.65' });
  writeFileSync(join(dir, 'README.md'), '# x\n');
  assert.equal(run(dir, 'verify', '--skip-version').status, 1);
});
