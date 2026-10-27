import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Specs, plans, agent files, questions and secrets must never reach a public repo, and dist/ must stay tracked (GitHub Pages
// serves it). The .gitignore is pinned as text, like the template and the stylesheet.
const lines = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.gitignore'), 'utf8')
  .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

test('.gitignore keeps secrets, agent files, specs and questions out of the repo', () => {
  for (const must of ['.env', '*.pem', '*.key', '*secret*', '*token*', '*password*', 'node_modules/', '.superpowers/', '.claude/', 'docs/superpowers/', 'questions.md']) {
    assert.ok(lines.includes(must), `.gitignore lacks "${must}"`);
  }
});

test('.gitignore does not hide dist/ (the built page is committed for GitHub Pages) unless you decide so on purpose', () => {
  assert.ok(!lines.includes('dist/') && !lines.includes('dist'), 'dist/ is ignored: remove this test if you do not serve the repo as it is');
});
