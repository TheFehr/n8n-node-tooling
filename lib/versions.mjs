// Version rules for n8n community nodes that mirror an upstream tool.
//
// A package version is `major.minor.patch` where:
//   - major = upstream major + majorOffset
//   - minor = upstream minor
//   - patch = the node's own counter (the only thing node-only changes bump)
//
// majorOffset exists so a package whose earlier versions are numerically
// ahead of upstream (e.g. published as 2.3.x while upstream is 0.40.x) can
// adopt mirroring without ever lowering its version.

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(input) {
  const match = SEMVER.exec(String(input).trim());
  if (!match) {
    throw new Error(`Not a semver version: ${JSON.stringify(input)}`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

// The major.minor a package must carry to be in sync with `upstreamVersion`.
export function targetMajorMinor(upstreamVersion, majorOffset = 0) {
  const upstream = parseVersion(upstreamVersion);
  return { major: upstream.major + majorOffset, minor: upstream.minor };
}

function compareMajorMinor(a, b) {
  return a.major - b.major || a.minor - b.minor;
}

// True when the package's major.minor is exactly what upstream dictates.
export function isInSync(currentVersion, upstreamVersion, majorOffset = 0) {
  const current = parseVersion(currentVersion);
  return compareMajorMinor(current, targetMajorMinor(upstreamVersion, majorOffset)) === 0;
}

// The version the next release must carry.
//   - upstream moved ahead of the package: jump to `<target major.minor>.0`
//   - otherwise: bump the patch only
// Node changes, however breaking, never touch major or minor.
// `ahead` is true when the package's major.minor is already past upstream's
// target (a manual bump that the mirroring rule would not have produced); the
// patch is still bumped so a release can proceed, and callers should flag it.
export function nextVersion(currentVersion, upstreamVersion, majorOffset = 0) {
  const current = parseVersion(currentVersion);
  const target = targetMajorMinor(upstreamVersion, majorOffset);
  const order = compareMajorMinor(target, current);

  if (order > 0) {
    return { version: formatVersion({ ...target, patch: 0 }), kind: 'sync', ahead: false };
  }
  return {
    version: formatVersion({ ...current, patch: current.patch + 1 }),
    kind: 'patch',
    ahead: order < 0,
  };
}
