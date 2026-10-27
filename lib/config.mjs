// Consumer configuration lives in the consuming package's package.json:
//
//   "n8nNodeTooling": {
//     "upstream": {
//       "name": "PocketBase",
//       "source": { "type": "github", "repo": "pocketbase/pocketbase" },
//       "track": { "type": "field", "name": "pocketbaseVersion" },
//       "majorOffset": 2
//     },
//     "readme": "Last tested with n8n {n8n} and PocketBase {upstream}.",
//     "pins": [
//       { "file": "docker-compose.test.yml", "template": "image: n8nio/n8n:{version}", "from": "n8n" }
//     ]
//   }
//
// `source`: where the latest upstream version comes from (github release | npm package).
// `track`:  where the package records the upstream version it was synced against
//           (a top-level package.json field | a devDependency).

const SOURCE_TYPES = ['github', 'npm'];
const TRACK_TYPES = ['field', 'devDependency'];
const PIN_SOURCES = ['upstream', 'n8n'];

function fail(message) {
  throw new Error(`Invalid "n8nNodeTooling" config in package.json: ${message}`);
}

export function loadConfig(pkg) {
  const raw = pkg.n8nNodeTooling;
  if (!raw || typeof raw !== 'object') fail('missing');

  const upstream = raw.upstream;
  if (!upstream || typeof upstream !== 'object') fail('"upstream" is required');
  if (!upstream.name) fail('"upstream.name" is required');

  const source = upstream.source;
  if (!source || !SOURCE_TYPES.includes(source.type)) {
    fail(`"upstream.source.type" must be one of ${SOURCE_TYPES.join(', ')}`);
  }
  if (source.type === 'github' && !/^[^/\s]+\/[^/\s]+$/.test(source.repo ?? '')) {
    fail('"upstream.source.repo" must look like "owner/name"');
  }
  if (source.type === 'npm' && !source.package) fail('"upstream.source.package" is required');

  const track = upstream.track;
  if (!track || !TRACK_TYPES.includes(track.type) || !track.name) {
    fail(`"upstream.track" needs a "name" and a "type" of ${TRACK_TYPES.join(' or ')}`);
  }

  const majorOffset = upstream.majorOffset ?? 0;
  if (!Number.isInteger(majorOffset) || majorOffset < 0) {
    fail('"upstream.majorOffset" must be a non-negative integer');
  }

  const pins = raw.pins ?? [];
  for (const pin of pins) {
    if (!pin.file || !pin.template || !PIN_SOURCES.includes(pin.from)) {
      fail(`every pin needs "file", "template" and "from" (${PIN_SOURCES.join(' or ')})`);
    }
    if (!pin.template.includes('{version}')) {
      fail(`pin template ${JSON.stringify(pin.template)} must contain {version}`);
    }
  }

  if (raw.readme && !(raw.readme.includes('{n8n}') && raw.readme.includes('{upstream}'))) {
    fail('"readme" must contain both {n8n} and {upstream}');
  }

  return {
    upstream: { name: upstream.name, source, track, majorOffset },
    readme: raw.readme ?? null,
    pins,
  };
}

export function trackedUpstreamVersion(pkg, config) {
  const { track } = config.upstream;
  return track.type === 'field' ? pkg[track.name] : pkg.devDependencies?.[track.name];
}
