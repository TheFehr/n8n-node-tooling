import { renderTemplate, templateToRegExp } from './template.mjs';
import { trackedUpstreamVersion } from './config.mjs';

// Pure: given the current files and the latest upstream/n8n versions, work out
// what has to change. No network and no disk access, so it can be tested.
//
// `files` maps repo-relative paths to their current text. `pkgText` is the raw
// package.json text so indentation is preserved when it is written back.
//
// Returns { changes, files } where `files` holds only the texts that changed.

function detectIndent(text) {
  const match = /^([ \t]+)"/m.exec(text);
  return match ? match[1] : '  ';
}

export function computeSync({ pkgText, readmeText, files, config, latest }) {
  const pkg = JSON.parse(pkgText);
  const changes = [];
  const changed = {};

  // peerDependencies.n8n-workflow stays "*" (the community-node lint rules reject a
  // pinned peer range). The version synced against is recorded separately.
  if (pkg.n8nWorkflowVersion !== latest.n8nWorkflow) {
    changes.push(`package.json: n8nWorkflowVersion (${pkg.n8nWorkflowVersion} -> ${latest.n8nWorkflow})`);
    pkg.n8nWorkflowVersion = latest.n8nWorkflow;
  }

  const { track, name } = config.upstream;
  const currentUpstream = trackedUpstreamVersion(pkg, config);
  if (currentUpstream !== latest.upstream) {
    const where =
      track.type === 'field' ? track.name : `devDependencies.${track.name}`;
    changes.push(`package.json: ${where} (${currentUpstream} -> ${latest.upstream})`);
    if (track.type === 'field') {
      pkg[track.name] = latest.upstream;
    } else {
      pkg.devDependencies = { ...pkg.devDependencies, [track.name]: latest.upstream };
    }
  }

  if (changes.length > 0) {
    changed['package.json'] = JSON.stringify(pkg, null, detectIndent(pkgText)) + '\n';
  }

  if (config.readme) {
    if (readmeText == null) throw new Error('README.md not found but "readme" is configured');
    const sentence = new RegExp(
      templateToRegExp(config.readme.replace('{n8n}', '{version}').replace('{upstream}', '{version}')).source,
    );
    const match = sentence.exec(readmeText);
    if (!match) {
      throw new Error(`Could not find the ${name} compatibility sentence in README.md: ${config.readme}`);
    }
    const replacement = renderTemplate(config.readme, {
      n8n: latest.n8n,
      upstream: latest.upstream,
    });
    if (match[0] !== replacement) {
      changes.push(`README.md: compatibility (${match[0]} -> ${replacement})`);
      changed['README.md'] = readmeText.replace(match[0], replacement);
    }
  }

  for (const pin of config.pins) {
    const text = changed[pin.file] ?? files[pin.file];
    if (text == null) throw new Error(`Pinned file not found: ${pin.file}`);
    const regexp = templateToRegExp(pin.template);
    const match = regexp.exec(text);
    if (!match) {
      throw new Error(`Could not find ${JSON.stringify(pin.template)} in ${pin.file}`);
    }
    const version = pin.from === 'n8n' ? latest.n8n : latest.upstream;
    const replacement = renderTemplate(pin.template, { version });
    if (match[0] !== replacement) {
      changes.push(`${pin.file}: ${match[0]} -> ${replacement}`);
      changed[pin.file] = text.replace(match[0], replacement);
    }
  }

  return { changes, files: changed };
}
