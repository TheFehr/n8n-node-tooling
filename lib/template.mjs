// Templates are plain strings with `{name}` placeholders, for example
// `image: ghcr.io/example/app:{version}`. Everything outside the placeholders
// is matched literally, so consumers never write regular expressions.

// A plain version that is not followed by more version-like text, so a suffix such as
// `-ubuntu` is never half-matched and then lost on rewrite.
const VERSION = String.raw`\d+\.\d+\.\d+(?![0-9A-Za-z]|[.-][0-9A-Za-z])`;
const PLACEHOLDER = /\{(\w+)\}/g;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function placeholders(template) {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

export function templateToRegExp(template) {
  const parts = template.split(PLACEHOLDER);
  const source = parts
    .map((part, index) => (index % 2 === 0 ? escapeRegExp(part) : `(${VERSION})`))
    .join('');
  return new RegExp(source, 'g');
}

// Replaces the one place `regexp` matches. Zero or several matches are errors: a second
// copy would stay stale while `check` reported clean.
export function replaceOnly(text, regexp, replacement, what) {
  const matches = [...text.matchAll(regexp)];
  if (matches.length !== 1) {
    throw new Error(
      `${what}: expected exactly one match, found ${matches.length}`,
    );
  }
  const [match] = matches;
  // A function, so `$&` and friends in the replacement are not interpreted.
  return {
    from: match[0],
    text: text.slice(0, match.index) + replacement + text.slice(match.index + match[0].length),
  };
}

export function renderTemplate(template, values) {
  return template.replace(PLACEHOLDER, (_, name) => {
    if (!(name in values)) {
      throw new Error(`Template ${JSON.stringify(template)} uses unknown placeholder {${name}}`);
    }
    return values[name];
  });
}
