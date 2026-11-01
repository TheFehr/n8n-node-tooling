import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compareVersions, isInSync, nextVersion, parseVersion, targetMajorMinor } from '../lib/versions.mjs';

test('parseVersion accepts a leading v', () => {
  assert.deepEqual(parseVersion('v0.40.5'), { major: 0, minor: 40, patch: 5 });
});

test('parseVersion rejects non-semver input', () => {
  assert.throws(() => parseVersion('26.10'), /Not a semver/);
  assert.throws(() => parseVersion(''), /Not a semver/);
});

test('targetMajorMinor applies the major offset', () => {
  assert.deepEqual(targetMajorMinor('0.40.5', 2), { major: 2, minor: 40 });
  assert.deepEqual(targetMajorMinor('26.10.0'), { major: 26, minor: 10 });
});

test('isInSync compares major.minor only', () => {
  assert.equal(isInSync('26.10.16', '26.10.0'), true);
  assert.equal(isInSync('26.10.16', '26.11.0'), false);
  assert.equal(isInSync('2.40.3', '0.40.5', 2), true);
  assert.equal(isInSync('2.3.65', '0.40.5', 2), false);
});

test('nextVersion only bumps the patch while major.minor is in sync', () => {
  assert.deepEqual(nextVersion('26.10.16', '26.10.0'), {
    version: '26.10.17',
    kind: 'patch',
    ahead: false,
  });
});

test('nextVersion jumps to <target>.0 when upstream minor moves', () => {
  assert.equal(nextVersion('26.10.16', '26.11.0').version, '26.11.0');
});

test('nextVersion jumps when upstream major moves', () => {
  assert.equal(nextVersion('26.12.4', '27.0.0').version, '27.0.0');
});

test('pocketbase migration: 2.3.65 with offset 2 jumps to 2.40.0, never lowers', () => {
  assert.equal(nextVersion('2.3.65', '0.40.5', 2).version, '2.40.0');
  assert.equal(nextVersion('2.40.0', '0.40.7', 2).version, '2.40.1');
  assert.equal(nextVersion('2.40.9', '0.41.0', 2).version, '2.41.0');
  assert.equal(nextVersion('2.41.2', '1.0.0', 2).version, '3.0.0');
});

test('docspell first release: 0.1.0 mirrors Docspell 0.43.0', () => {
  assert.equal(nextVersion('0.1.0', '0.43.0').version, '0.43.0');
});

test('nextVersion flags a package that is ahead of upstream but still patches', () => {
  assert.deepEqual(nextVersion('26.12.3', '26.10.0'), {
    version: '26.12.4',
    kind: 'patch',
    ahead: true,
  });
});

test('parseVersion rejects prereleases, build metadata and ranges instead of dropping them', () => {
  assert.throws(() => parseVersion('26.10.0-beta.1'), /Not a semver/);
  assert.throws(() => parseVersion('26.10.0+abc'), /Not a semver/);
  assert.throws(() => parseVersion('^26.10.0'), /Not a semver/);
});

test('compareVersions orders by major, minor, then patch', () => {
  assert.ok(compareVersions('1.2.3', '1.2.4') < 0);
  assert.ok(compareVersions('1.3.0', '1.2.9') > 0);
  assert.ok(compareVersions('2.0.0', '1.99.99') > 0);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
});
