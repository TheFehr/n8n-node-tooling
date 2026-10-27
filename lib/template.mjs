// Templates are plain strings with `{name}` placeholders, for example
// `image: ghcr.io/example/app:{version}`. Everything outside the placeholders
// is matched literally, so consumers never write regular expressions.

const VERSION = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`;
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
  return new RegExp(source);
}

export function renderTemplate(template, values) {
  return template.replace(PLACEHOLDER, (_, name) => {
    if (!(name in values)) {
      throw new Error(`Template ${JSON.stringify(template)} uses unknown placeholder {${name}}`);
    }
    return values[name];
  });
}
