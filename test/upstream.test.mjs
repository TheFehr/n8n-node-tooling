import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { latestN8n, latestUpstreamVersion } from '../lib/upstream.mjs';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.NPM_TOKEN;
  delete process.env.GITHUB_TOKEN;
});

function stub(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers ?? {} });
    return handler(String(url));
  };
  return calls;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, statusText: status === 200 ? 'OK' : 'Error' });

test('an npm package name is encoded for the registry', async () => {
  const calls = stub(() => json({ version: '26.10.0' }));
  assert.equal(await latestUpstreamVersion({ type: 'npm', package: '@actual-app/api' }), '26.10.0');
  assert.equal(calls[0].url, 'https://registry.npmjs.org/%40actual-app%2Fapi/latest');
});

test('a GitHub release tag loses its leading v', async () => {
  const calls = stub(() => json({ tag_name: 'v0.43.0' }));
  assert.equal(await latestUpstreamVersion({ type: 'github', repo: 'eikek/docspell' }), '0.43.0');
  assert.equal(calls[0].url, 'https://api.github.com/repos/eikek/docspell/releases/latest');
});

test('tokens are sent when present and only to their own service', async () => {
  process.env.NPM_TOKEN = 'npm-secret';
  process.env.GITHUB_TOKEN = 'gh-secret';
  const calls = stub(() => json({ version: '1.0.0', tag_name: '1.0.0' }));
  await latestUpstreamVersion({ type: 'npm', package: 'x' });
  await latestUpstreamVersion({ type: 'github', repo: 'a/b' });
  assert.equal(calls[0].headers.Authorization, 'Bearer npm-secret');
  assert.equal(calls[1].headers.Authorization, 'token gh-secret');
});

test('a non-200 answer is an error naming the URL', async () => {
  stub(() => json({}, 404));
  await assert.rejects(() => latestUpstreamVersion({ type: 'npm', package: 'missing' }), /registry\.npmjs\.org\/missing\/latest: 404/);
});

test('latestN8n reports n8n and the n8n-workflow it bundles', async () => {
  stub(() => json({ version: '2.45.7', dependencies: { 'n8n-workflow': '2.45.4' } }));
  assert.deepEqual(await latestN8n(), { n8n: '2.45.7', n8nWorkflow: '2.45.4' });
});

test('latestN8n fails when n8n bundles no n8n-workflow', async () => {
  stub(() => json({ version: '2.45.7', dependencies: {} }));
  await assert.rejects(() => latestN8n(), /no n8n-workflow dependency/);
});
