import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { classify } from '../lib/classify.mjs';

const CLI = fileURLToPath(new URL('../bin/n8n-node-tooling.mjs', import.meta.url));

test('an assertion failure is the node', () => {
  assert.equal(classify('x\n FAIL  tests/a.spec.ts\nAssertionError: expected 1'), 'node');
  assert.equal(classify('❌ Verification failed: no item'), 'node');
});

test('a crash of the environment is upstream', () => {
  assert.equal(classify('connect ECONNREFUSED 127.0.0.1:8090'), 'upstream');
  assert.equal(classify('docker: Error response from daemon: pull access denied'), 'upstream');
});

test('the node wins when both appear: the tests did run', () => {
  assert.equal(classify('ECONNREFUSED retry\nAssertionError: boom'), 'node');
});

test('anything else is unknown', () => {
  assert.equal(classify('something odd'), 'unknown');
  assert.equal(classify(''), 'unknown');
});

test('extra upstream patterns are applied, one per line', () => {
  assert.equal(classify('panic: runtime error', 'SQLITE_ERROR\npanic:'), 'upstream');
  assert.equal(classify('panic: runtime error'), 'unknown');
});

test('an invalid extra pattern is an error, not a skip', () => {
  assert.throws(() => classify('x', '('), /Invalid upstream pattern/);
});

function cli(log, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'n8n-node-tooling-'));
  const file = join(dir, 'pipeline.log');
  if (log !== null) writeFileSync(file, log);
  return spawnSync(process.execPath, [CLI, 'classify-failure', '--file', file], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: '', ...env },
  });
}

test('classify-failure prints an annotation for the verdict', () => {
  assert.match(cli('AssertionError').stdout, /^::error::/);
  assert.match(cli('ECONNREFUSED').stdout, /^::warning::/);
  assert.match(cli('hm').stdout, /^::notice::/);
});

test('classify-failure takes extra patterns from the environment', () => {
  const result = cli('SQLITE_ERROR', { N8N_NODE_TOOLING_UPSTREAM_PATTERNS: 'SQLITE_ERROR' });
  assert.match(result.stdout, /^::warning::/);
});

test('classify-failure without a log does nothing and succeeds', () => {
  const result = cli(null);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /nothing to classify/);
});

test('classify-failure needs --file', () => {
  const result = spawnSync(process.execPath, [CLI, 'classify-failure'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
});

test('extra patterns are JavaScript regular expressions, not POSIX', () => {
  assert.equal(classify('migration 123 failed', 'migration \\d+ failed'), 'upstream');
  assert.equal(classify('migration 123 failed', 'migration [[:digit:]]+ failed'), 'unknown');
});
