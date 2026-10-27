// Network lookups. Kept separate from the pure logic in sync.mjs / versions.mjs.

const TIMEOUT_MS = 15_000;

async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function npmLatest(packageName) {
  const headers = process.env.NPM_TOKEN ? { Authorization: `Bearer ${process.env.NPM_TOKEN}` } : {};
  return getJson(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, headers);
}

export async function latestUpstreamVersion(source) {
  if (source.type === 'npm') {
    return (await npmLatest(source.package)).version;
  }
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  const release = await getJson(`https://api.github.com/repos/${source.repo}/releases/latest`, headers);
  return String(release.tag_name).replace(/^v/, '');
}

// n8n's own release version and its bundled n8n-workflow version are two different
// numbers that do not move in lockstep; the peer range must track the latter.
export async function latestN8n() {
  const data = await npmLatest('n8n');
  const workflow = data.dependencies?.['n8n-workflow'];
  if (!workflow) throw new Error("n8n's package metadata has no n8n-workflow dependency");
  return { n8n: data.version, n8nWorkflow: workflow };
}
