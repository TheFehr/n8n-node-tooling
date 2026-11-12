// Tells a failure of the node's own tests apart from a crash in the environment the tests
// run in (Docker, n8n, the service under test), so a red run says which one to look at.

// The tests ran and an assertion failed: a real compatibility problem to fix in the node.
const NODE = [
  /❌ (Verification failed|.* did not (succeed|fail) as expected)/,
  /^\s*(FAIL|✗|✕) /m,
  /AssertionError/,
];

// The run broke before the node's own checks could say anything.
const UPSTREAM = [
  /ECONNREFUSED/,
  /did not start in time/,
  /docker: [Ee]rror/,
  /Error response from daemon/,
  /exitWithCrash/,
];

export const MESSAGES = {
  node: "The failure happened inside the node's own verification or test assertions: likely a real compatibility issue in this package, or a behaviour change upstream that it has to adapt to.",
  upstream:
    "This looks like an upstream or environment problem (n8n, the service under test or Docker itself): the failure came before the node's own verification ran. Probably not a bug in this package; check the release notes of what was bumped.",
  unknown: 'The failure could not be classified automatically. Read the log.',
};

// `extraUpstream` holds one JavaScript regular expression per line, for crashes that only the
// package's own service produces. A line that is not a valid expression is an error, never
// a silent skip: it would otherwise hide every failure it was meant to catch.
export function classify(log, extraUpstream = '') {
  const extra = extraUpstream
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return new RegExp(line);
      } catch (error) {
        throw new Error(`Invalid upstream pattern ${JSON.stringify(line)}: ${error.message}`);
      }
    });
  if (NODE.some((pattern) => pattern.test(log))) return 'node';
  if ([...UPSTREAM, ...extra].some((pattern) => pattern.test(log))) return 'upstream';
  return 'unknown';
}
