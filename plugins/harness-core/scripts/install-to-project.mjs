#!/usr/bin/env node
import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const targetIndex = args.indexOf('--target');
const targetRoot = path.resolve(targetIndex >= 0 ? args[targetIndex + 1] : process.cwd());
if (targetIndex >= 0 && !args[targetIndex + 1]) throw new Error('--target requires a path');

const manifest = JSON.parse(await readFile(path.join(pluginRoot, 'install-manifest.json'), 'utf8'));
const files = manifest.files.map((file) => {
  if (
    typeof file !== 'string' ||
    !file ||
    path.isAbsolute(file) ||
    file.split(/[\\/]/).includes('..')
  ) {
    throw new Error('Unsafe install path: ' + JSON.stringify(file));
  }
  return file;
});
const exists = async (p) => {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};
const same = async (a, b) => (await readFile(a)).equals(await readFile(b));

const settingsPath = path.join(targetRoot, '.claude', 'settings.json');
let settings = {};
if (await exists(settingsPath)) settings = JSON.parse(await readFile(settingsPath, 'utf8'));

const conflicts = [];
for (const file of files) {
  const source = path.join(pluginRoot, 'payload', file);
  const destination = path.join(targetRoot, file);
  if ((await exists(destination)) && !(await same(source, destination))) conflicts.push(file);
}
if (conflicts.length && !force) {
  console.error('Existing files differ. Nothing was changed:');
  for (const file of conflicts) console.error('  - ' + file);
  console.error('Review them, then rerun with --force only if replacement is intended.');
  process.exit(2);
}

for (const file of files) {
  const source = path.join(pluginRoot, 'payload', file);
  const destination = path.join(targetRoot, file);
  await mkdir(path.dirname(destination), { recursive: true });
  if (!(await exists(destination)) || force) await copyFile(source, destination);
}

await mkdir(path.dirname(settingsPath), { recursive: true });
settings.hooks ??= {};
for (const [event, entries] of Object.entries(manifest.hooks ?? {})) {
  const current = settings.hooks[event] ?? [];
  const seen = new Set(current.map((entry) => JSON.stringify(entry)));
  for (const entry of entries) if (!seen.has(JSON.stringify(entry))) current.push(entry);
  settings.hooks[event] = current;
}
const tempPath = settingsPath + '.harness-tmp';
await writeFile(tempPath, JSON.stringify(settings, null, 2) + '\n');
await rename(tempPath, settingsPath);
console.log(`Installed ${manifest.name}: ${files.length} files into ${targetRoot}`);
