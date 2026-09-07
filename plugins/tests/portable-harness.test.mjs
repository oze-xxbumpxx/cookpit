import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layers = ['core', 'workflow', 'improvement'];

test('every payload entry exists', async () => {
  for (const layer of layers) {
    const plugin = path.join(root, 'harness-' + layer);
    const manifest = JSON.parse(await readFile(path.join(plugin, 'install-manifest.json'), 'utf8'));
    for (const file of manifest.files) await readFile(path.join(plugin, 'payload', file));
  }
});

test('installer merges hooks idempotently and refuses collisions', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'cookpit-harness-'));
  try {
    const script = path.join(root, 'harness-core', 'scripts', 'install-to-project.mjs');
    let result = spawnSync(process.execPath, [script, '--target', target], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    result = spawnSync(process.execPath, [script, '--target', target], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const settings = JSON.parse(
      await readFile(path.join(target, '.claude', 'settings.json'), 'utf8'),
    );
    assert.equal(settings.hooks.PreToolUse.length, 1);

    const conflict = path.join(target, '.claude', 'lib', 'harness-paths.mjs');
    await writeFile(conflict, 'local change\n');
    result = spawnSync(process.execPath, [script, '--target', target], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Nothing was changed/);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
