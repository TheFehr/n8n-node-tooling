// Templates are plain strings with `{name}` placeholders, for example
// `image: ghcr.io/example/app:{version}`. Everything outside the placeholders
// is matched literally, so consumers never write regular expressions.

const VERSION = String.raw`\d+\.\d+\.\d+`;
// Where the template has nothing after the version, it must not be followed by more
// version-like text, so a suffix such as `-ubuntu` is never half-matched and then lost on
// rewrite. Where the template spells out what follows (`{version}-ubuntu`), that text is
// what has to match.
const BOUNDARY = String.raw`(?![0-9A-Za-z_+]|[.-][0-9A-Za-z])`;
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
    .map((part, index) => {
      if (index % 2 === 0) return escapeRegExp(part);
      return `(${VERSION})${parts[index + 1] === '' ? BOUNDARY : ''}`;
    })
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

// Replaces what sits between a pair of marker comments, for text the tool owns outright
// (the README compatibility block). Nothing in the block is parsed, so there is no
// partial match to guard against. Missing, repeated or unbalanced markers are errors.
export function replaceBlock(text, name, content) {
  const start = `<!-- n8n-node-tooling:${name} -->`;
  const end = `<!-- /n8n-node-tooling:${name} -->`;
  const count = (marker) => text.split(marker).length - 1;
  if (count(start) !== 1 || count(end) !== 1) {
    throw new Error(
      `README.md: expected exactly one ${start} and one ${end}, found ${count(start)} and ${count(end)}`,
    );
  }
  const from = text.indexOf(start) + start.length;
  const to = text.indexOf(end);
  if (to < from) throw new Error(`README.md: ${end} comes before ${start}`);
  const block = `\n${content}\n`;
  return {
    from: text.slice(from, to).trim(),
    text: text.slice(0, from) + block + text.slice(to),
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
