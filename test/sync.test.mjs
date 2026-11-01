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
  readmeText: 'Intro.\n\n<!-- n8n-node-tooling:compatibility -->\nLast tested with n8n 2.44.2 and PocketBase 0.40.5.\n<!-- /n8n-node-tooling:compatibility -->\n',
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

test('missing README markers or a missing pinned line is an error, not a silent skip', () => {
  const latest = { upstream: '0.41.0', n8n: '2.45.0', n8nWorkflow: '2.45.0' };
  assert.throws(() => computeSync({ ...base, readmeText: 'no markers', latest }), /expected exactly one/);
  assert.throws(
    () => computeSync({ ...base, files: { 'docker-compose.test.yml': 'services: {}' }, latest }),
    /expected exactly one match, found 0/,
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

function run(overrides) {
  return computeSync({
    pkgText: JSON.stringify({ pocketbaseVersion: '0.40.5', n8nWorkflowVersion: '2.44.2' }),
    readmeText: '<!-- n8n-node-tooling:compatibility -->\nLast tested with n8n 2.44.2 and PocketBase 0.40.5.\n<!-- /n8n-node-tooling:compatibility -->\n',
    files: { 'docker-compose.test.yml': compose },
    config: pocketbaseConfig,
    latest: { upstream: '0.40.5', n8n: '2.44.2', n8nWorkflow: '2.44.2' },
    ...overrides,
  });
}

test('a pin that appears twice is an error, not a half-updated file', () => {
  assert.throws(
    () => run({ files: { 'docker-compose.test.yml': compose + '    image: n8nio/n8n:2.44.2\n' }, latest: { upstream: '0.40.5', n8n: '2.45.0', n8nWorkflow: '2.45.0' } }),
    /expected exactly one match, found 2/,
  );
});

test('README markers that repeat, are unbalanced or are in the wrong order are errors', () => {
  const block = '<!-- n8n-node-tooling:compatibility -->\nLast tested with n8n 2.44.2 and PocketBase 0.40.5.\n<!-- /n8n-node-tooling:compatibility -->\n';
  assert.throws(() => run({ readmeText: block + block }), /found 2 and 2/);
  assert.throws(() => run({ readmeText: block.replace('<!-- /n8n-node-tooling:compatibility -->', '') }), /found 1 and 0/);
  assert.throws(() => run({ readmeText: '<!-- /n8n-node-tooling:compatibility -->\n<!-- n8n-node-tooling:compatibility -->\n' }), /comes before/);
});

test('the whole README block is replaced, whatever it held', () => {
  const result = run({
    readmeText: 'Intro\n<!-- n8n-node-tooling:compatibility -->\nold text\nmore old text\n<!-- /n8n-node-tooling:compatibility -->\nOutro\n',
    latest: { upstream: '0.41.0', n8n: '2.45.0', n8nWorkflow: '2.45.0' },
  });
  assert.equal(
    result.files['README.md'],
    'Intro\n<!-- n8n-node-tooling:compatibility -->\nLast tested with n8n 2.45.0 and PocketBase 0.41.0.\n<!-- /n8n-node-tooling:compatibility -->\nOutro\n',
  );
});

test('a pin with a tag suffix is not half-matched and rewritten without it', () => {
  const files = { 'docker-compose.test.yml': compose.replace('n8nio/n8n:2.44.2', 'n8nio/n8n:2.44.2-ubuntu') };
  assert.throws(
    () => run({ files, latest: { upstream: '0.40.5', n8n: '2.45.0', n8nWorkflow: '2.45.0' } }),
    /expected exactly one match, found 0/,
  );
});

test('dollar patterns in a template are written literally', () => {
  const config = loadConfig({
    n8nNodeTooling: {
      upstream: {
        name: 'X',
        source: { type: 'npm', package: 'x' },
        track: { type: 'field', name: 'xVersion' },
      },
      pins: [{ file: 'f.txt', template: "v='$&{version}$1'", from: 'upstream' }],
    },
  });
  const result = computeSync({
    pkgText: JSON.stringify({ xVersion: '1.0.0', n8nWorkflowVersion: '2.0.0' }),
    readmeText: null,
    files: { 'f.txt': "v='$&1.0.0$1'\n" },
    config,
    latest: { upstream: '1.1.0', n8n: '2.0.0', n8nWorkflow: '2.0.0' },
  });
  assert.equal(result.files['f.txt'], "v='$&1.1.0$1'\n");
});

test('a lower version is refused against the floor of a caret or tilde range', () => {
  const config = loadConfig({
    n8nNodeTooling: {
      upstream: { name: 'X', source: { type: 'npm', package: 'x' }, track: { type: 'devDependency', name: 'x' } },
    },
  });
  for (const range of ['^1.2.0', '~1.2.0']) {
    assert.throws(
      () =>
        computeSync({
          pkgText: JSON.stringify({ devDependencies: { x: range }, n8nWorkflowVersion: '2.0.0' }),
          readmeText: null,
          files: {},
          config,
          latest: { upstream: '1.1.0', n8n: '2.0.0', n8nWorkflow: '2.0.0' },
        }),
      /Refusing to move X from [\^~]1\.2\.0 back to 1\.1\.0/,
      range,
    );
  }
});

test('moving upstream backwards is refused, a tracked range is replaced', () => {
  assert.throws(
    () => run({ latest: { upstream: '0.39.0', n8n: '2.44.2', n8nWorkflow: '2.44.2' } }),
    /Refusing to move PocketBase from 0\.40\.5 back to 0\.39\.0/,
  );
  const config = loadConfig({
    n8nNodeTooling: {
      upstream: { name: 'X', source: { type: 'npm', package: 'x' }, track: { type: 'devDependency', name: 'x' } },
    },
  });
  const result = computeSync({
    pkgText: JSON.stringify({ devDependencies: { x: '^1.0.0' }, n8nWorkflowVersion: '2.0.0' }),
    readmeText: null,
    files: {},
    config,
    latest: { upstream: '1.0.0', n8n: '2.0.0', n8nWorkflow: '2.0.0' },
  });
  assert.equal(JSON.parse(result.files['package.json']).devDependencies.x, '1.0.0');
});

test('a pin version followed by _variant or +metadata is not half-matched', () => {
  const latest = { upstream: '0.40.5', n8n: '2.45.0', n8nWorkflow: '2.45.0' };
  for (const suffix of ['_variant', '+meta', '-ubuntu', '.1']) {
    const files = { 'docker-compose.test.yml': compose.replace('n8nio/n8n:2.44.2', `n8nio/n8n:2.44.2${suffix}`) };
    assert.throws(() => run({ files, latest }), /expected exactly one match, found 0/, suffix);
  }
});

test('text after a suffix the template spells out is not half-matched', () => {
  const regexp = templateToRegExp('image: app:{version}-alpine');
  assert.equal('image: app:1.2.3-alpine\n'.match(regexp)?.length, 1);
  assert.equal('image: app:1.2.3-alpine-extra\n'.match(regexp), null);
});

test('a pin on its own line is bounded before the newline, not after it', () => {
  const regexp = templateToRegExp('N8N_VERSION={version}\n');
  assert.equal('N8N_VERSION=1.2.3\nNODE_ENV=test\n'.match(regexp)?.length, 1);
  assert.equal('N8N_VERSION=1.2.3-rc\nNODE_ENV=test\n'.match(regexp), null);
});

test('a readme template that ends in a newline is not reported as drift once written', () => {
  const config = { ...pocketbaseConfig, readme: pocketbaseConfig.readme + '\n' };
  const latest = { upstream: '0.41.0', n8n: '2.45.0', n8nWorkflow: '2.45.0' };
  const first = run({ config, latest });
  const readmeText = first.files['README.md'];
  const second = run({ config, latest, readmeText, files: first.files, pkgText: first.files['package.json'] });
  assert.equal(second.files['README.md'], undefined);
});

test('a suffix the template spells out is matched and kept', () => {
  const config = loadConfig({
    n8nNodeTooling: {
      upstream: {
        name: 'X',
        source: { type: 'npm', package: 'x' },
        track: { type: 'field', name: 'xVersion' },
      },
      pins: [{ file: 'f.txt', template: 'image: app:{version}_variant', from: 'upstream' }],
    },
  });
  const sync = (text) =>
    computeSync({
      pkgText: JSON.stringify({ xVersion: '1.0.0', n8nWorkflowVersion: '2.0.0' }),
      readmeText: null,
      files: { 'f.txt': text },
      config,
      latest: { upstream: '1.1.0', n8n: '2.0.0', n8nWorkflow: '2.0.0' },
    });
  assert.equal(sync('image: app:1.0.0_variant\n').files['f.txt'], 'image: app:1.1.0_variant\n');
  assert.throws(() => sync('image: app:1.0.0_other\n'), /found 0/);
  assert.throws(() => sync('image: app:1.0.0.1_variant\n'), /found 0/);
});

