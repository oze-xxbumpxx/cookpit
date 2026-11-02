import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layers = ['core', 'workflow', 'improvement', 'devin'];

const walk = async (dir) => {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
};
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readManifest = (layer) =>
  readJson(path.join(root, 'harness-' + layer, 'install-manifest.json'));
const install = (layer, target) =>
  spawnSync(
    process.execPath,
    [path.join(root, 'harness-' + layer, 'scripts', 'install-to-project.mjs'), '--target', target],
    { encoding: 'utf8' },
  );
const withTarget = async (fn) => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'cookpit-harness-'));
  try {
    spawnSync('git', ['init', '-q', target]);
    await fn(target);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
};

test('every manifest entry exists and every payload file is listed', async () => {
  for (const layer of layers) {
    const payload = path.join(root, 'harness-' + layer, 'payload');
    const manifest = await readManifest(layer);
    for (const file of manifest.files) await readFile(path.join(payload, file));
    const shipped = (await walk(payload)).map((f) => path.relative(payload, f)).sort();
    assert.deepEqual(shipped, [...manifest.files].sort(), layer);
  }
});

test('plugin, manifest, and marketplace versions agree', async () => {
  const marketplace = await readJson(path.join(root, '..', '.claude-plugin', 'marketplace.json'));
  // Claude Code の marketplace は owner を必須にし、policy を受け付けない
  assert.ok(marketplace.owner?.name);
  assert.equal(marketplace.policy, undefined);
  assert.deepEqual(
    marketplace.plugins.map((p) => p.name),
    layers.map((l) => 'harness-' + l),
  );
  for (const entry of marketplace.plugins) {
    assert.equal(entry.policy, undefined, entry.name);
    const plugin = await readJson(path.join(root, entry.name, '.claude-plugin', 'plugin.json'));
    const manifest = await readJson(path.join(root, entry.name, 'install-manifest.json'));
    assert.equal(plugin.version, entry.version, entry.name);
    assert.equal(manifest.version, entry.version, entry.name);
  }
});

test('no product-specific names or ChatGPT (Codex) entry points are shipped', async () => {
  const banned = /tomotabi|codex|handoff-v3|v3の|v3-screens/i;
  for (const layer of layers) {
    const plugin = path.join(root, 'harness-' + layer);
    await assert.rejects(stat(path.join(plugin, '.codex-plugin')), layer);
    for (const file of await walk(plugin)) {
      assert.doesNotMatch(await readFile(file, 'utf8'), banned, path.relative(root, file));
    }
  }
});

test('installer merges hooks idempotently and refuses collisions', async () => {
  await withTarget(async (target) => {
    let result = install('core', target);
    assert.equal(result.status, 0, result.stderr);
    result = install('core', target);
    assert.equal(result.status, 0, result.stderr);
    const settings = await readJson(path.join(target, '.claude', 'settings.json'));
    assert.equal(settings.hooks.PreToolUse.length, 1);
    assert.equal(settings.env.HARNESS_NAMESPACE, path.basename(target) + '-harness');
    assert.ok(settings.permissions.deny.length > 0);
    assert.equal(settings.permissions.deny.length, new Set(settings.permissions.deny).size);

    await writeFile(path.join(target, '.claude', 'lib', 'harness-paths.mjs'), 'local change\n');
    result = install('core', target);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Nothing was changed/);
  });
});

test('installer keeps an existing namespace', async () => {
  await withTarget(async (target) => {
    await mkdir(path.join(target, '.claude'));
    const settingsPath = path.join(target, '.claude', 'settings.json');
    await writeFile(settingsPath, JSON.stringify({ env: { HARNESS_NAMESPACE: 'mine' } }));
    assert.equal(install('core', target).status, 0);
    assert.equal((await readJson(settingsPath)).env.HARNESS_NAMESPACE, 'mine');
  });
});

test('all four layers install in order, link skills for Devin, and pass the harness tests', async () => {
  await withTarget(async (target) => {
    for (const layer of layers) {
      const result = install(layer, target);
      assert.equal(result.status, 0, layer + ': ' + result.stderr);
    }
    const settingsPath = path.join(target, '.claude', 'settings.json');
    const settings = await readJson(settingsPath);
    const commands = Object.values(settings.hooks).flatMap((entries) =>
      entries.flatMap((entry) => entry.hooks.map((hook) => hook.command)),
    );
    for (const command of commands) {
      await stat(path.join(target, command.match(/\$CLAUDE_PROJECT_DIR\/([^"]+)/)[1]));
    }
    assert.ok(commands.some((c) => c.includes('delegation-status.mjs')));

    const { links } = await readManifest('devin');
    for (const [link, linkTarget] of Object.entries(links)) {
      assert.ok((await lstat(path.join(target, link))).isSymbolicLink(), link);
      assert.equal(await readlink(path.join(target, link)), linkTarget);
      await stat(path.join(target, link, 'SKILL.md'));
    }
    await stat(path.join(target, '.agents', 'skills', 'devin-workflow', 'SKILL.md'));

    for (const layer of layers) assert.equal(install(layer, target).status, 0, layer);
    assert.deepEqual(await readJson(settingsPath), settings);

    const tests = (await readdir(path.join(target, '.claude', 'tests')))
      .filter((f) => f.endsWith('.test.mjs'))
      .map((f) => path.join('.claude', 'tests', f));
    const env = { ...process.env, HARNESS_STATE_DIR: path.join(target, '.state') };
    delete env.CLAUDE_PROJECT_DIR;
    // 外側のnode --testの文脈を引き継ぐと、子は入れ子と見なして試験を飛ばし、成功を返す
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ['--test', ...tests], {
      cwd: target,
      encoding: 'utf8',
      env,
    });
    assert.equal(run.status, 0, run.stdout.slice(-4000) + run.stderr.slice(-2000));
    const passed = Number(/^# pass (\d+)$/m.exec(run.stdout)?.[1] ?? 0);
    const failed = Number(/^# fail (\d+)$/m.exec(run.stdout)?.[1] ?? -1);
    assert.ok(passed > 0, 'installed harness tests did not run:\n' + run.stdout.slice(-2000));
    assert.equal(failed, 0);
  });
});
