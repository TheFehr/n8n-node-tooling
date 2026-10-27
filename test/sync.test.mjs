import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadConfig } from '../lib/config.mjs';
import { computeSync } from '../lib/sync.mjs';
import { renderTemplate, templateToRegExp } from '../lib/template.mjs';

const pocketbaseConfig = loadConfig({
  n8nNodeTooling: {
    upstream: {
      name: 'PocketBase',
      source: { type: 'github', repo: 'pocketbase/pocketbase' },
      track: { type: 'field', name: 'pocketbaseVersion' },
      majorOffset: 2,
    },
    readme: 'Last tested with n8n {n8n} and PocketBase {upstream}.',
    pins: [
      { file: 'docker-compose.test.yml', template: 'image: ghcr.io/muchobien/pocketbase:{version}', from: 'upstream' },
      { file: 'docker-compose.test.yml', template: 'image: n8nio/n8n:{version}', from: 'n8n' },
    ],
  },
});

const compose = [
  'services:',
  '  pb:',
  '    image: ghcr.io/muchobien/pocketbase:0.40.5',
  '  n8n:',
  '    image: n8nio/n8n:2.44.2',
  '',
].join('\n');

const pkgText = JSON.stringify(
  { name: 'x', version: '2.40.0', pocketbaseVersion: '0.40.5', n8nWorkflowVersion: '2.44.2' },
  null,
  '\t',
) + '\n';

const base = {
  pkgText,
  readmeText: 'Intro.\n\nLast tested with n8n 2.44.2 and PocketBase 0.40.5.\n',
  files: { 'docker-compose.test.yml': compose },
  config: pocketbaseConfig,
};

test('templateToRegExp matches literally and captures versions', () => {
  const regexp = templateToRegExp('image: n8nio/n8n:{version}');
  assert.equal(regexp.exec('  image: n8nio/n8n:2.44.2\n')[1], '2.44.2');
  assert.equal(regexp.exec('image: n8nio-n8n:2.44.2'), null);
});

test('renderTemplate rejects unknown placeholders', () => {
  assert.throws(() => renderTemplate('{nope}', {}), /unknown placeholder/);
});

test('no changes when everything is current', () => {
  const result = computeSync({
    ...base,
    latest: { upstream: '0.40.5', n8n: '2.44.2', n8nWorkflow: '2.44.2' },
  });
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.files, {});
});

test('upstream and n8n drift updates package.json, README and both pins', () => {
  const result = computeSync({
    ...base,
    latest: { upstream: '0.41.0', n8n: '2.45.0', n8nWorkflow: '2.45.0' },
  });
  assert.equal(result.changes.length, 5);
  const pkg = JSON.parse(result.files['package.json']);
  assert.equal(pkg.pocketbaseVersion, '0.41.0');
  assert.equal(pkg.n8nWorkflowVersion, '2.45.0');
  assert.equal(pkg.version, '2.40.0', 'the package version is never touched here');
  assert.match(result.files['package.json'], /^\{\n\t"name"/, 'tab indentation is preserved');
  assert.match(result.files['README.md'], /n8n 2\.45\.0 and PocketBase 0\.41\.0\./);
  assert.match(result.files['docker-compose.test.yml'], /pocketbase:0\.41\.0/);
  assert.match(result.files['docker-compose.test.yml'], /n8nio\/n8n:2\.45\.0/);
});

test('a devDependency can be the tracked upstream version', () => {
  const config = loadConfig({
    n8nNodeTooling: {
      upstream: {
        name: 'Actual',
        source: { type: 'npm', package: '@actual-app/api' },
        track: { type: 'devDependency', name: '@actual-app/api' },
      },
    },
  });
  const result = computeSync({
    pkgText: JSON.stringify({ devDependencies: { '@actual-app/api': '26.10.0' }, n8nWorkflowVersion: '2.44.2' }),
    readmeText: null,
    files: {},
    config,
    latest: { upstream: '26.11.0', n8n: '2.44.2', n8nWorkflow: '2.44.2' },
  });
  assert.equal(JSON.parse(result.files['package.json']).devDependencies['@actual-app/api'], '26.11.0');
});

test('a missing README sentence or pinned line is an error, not a silent skip', () => {
  const latest = { upstream: '0.41.0', n8n: '2.45.0', n8nWorkflow: '2.45.0' };
  assert.throws(() => computeSync({ ...base, readmeText: 'no sentence', latest }), /compatibility sentence/);
  assert.throws(
    () => computeSync({ ...base, files: { 'docker-compose.test.yml': 'services: {}' }, latest }),
    /Could not find/,
  );
  assert.throws(() => computeSync({ ...base, files: {}, latest }), /Pinned file not found/);
});

test('loadConfig rejects broken configuration with a clear message', () => {
  assert.throws(() => loadConfig({}), /missing/);
  assert.throws(
    () => loadConfig({ n8nNodeTooling: { upstream: { name: 'X', source: { type: 'github', repo: 'nope' }, track: { type: 'field', name: 'v' } } } }),
    /owner\/name/,
  );
  assert.throws(
    () => loadConfig({ n8nNodeTooling: { upstream: { name: 'X', source: { type: 'npm', package: 'x' }, track: { type: 'field', name: 'v' } }, pins: [{ file: 'a', template: 'no placeholder', from: 'n8n' }] } }),
    /\{version\}/,
  );
});
