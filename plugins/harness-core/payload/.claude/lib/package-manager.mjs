#!/usr/bin/env node
// パッケージマネージャー検出。Cookpit由来のpnpm固定をやめる。
// 優先順: pnpm-lock.yaml → yarn.lock → bun.lock(b) → package-lock.json / npm-shrinkwrap → npm。
// lockfileが無くてもnpmを返す（npx / npm runが最も広く入っているため）。

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DORMANT_HARNESS_TESTS = new Set(['review-readiness.test.mjs']);

/**
 * @param {string} root
 * @param {{ existsSync?: typeof existsSync }} [fs]
 * @returns {'pnpm' | 'yarn' | 'bun' | 'npm'}
 */
export function detectPackageManager(root, fs = { existsSync }) {
  if (fs.existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(join(root, 'bun.lockb')) || fs.existsSync(join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

/**
 * package.json scriptsの起動argv。
 * @param {'pnpm' | 'yarn' | 'bun' | 'npm'} pm
 * @param {string} script
 * @returns {string[]}
 */
export function scriptArgv(pm, script) {
  if (pm === 'pnpm') return ['pnpm', script];
  if (pm === 'yarn') return ['yarn', script];
  if (pm === 'bun') return ['bun', 'run', script];
  return ['npm', 'run', script];
}

/**
 * ローカルbin（prettier等）の起動argv。未インストールなら失敗させる（勝手にDLしない）。
 * @param {'pnpm' | 'yarn' | 'bun' | 'npm'} pm
 * @param {string} bin
 * @param {string[]} [args]
 * @returns {string[]}
 */
export function execArgv(pm, bin, args = []) {
  if (pm === 'pnpm') return ['pnpm', 'exec', bin, ...args];
  if (pm === 'yarn') return ['yarn', 'exec', bin, ...args];
  if (pm === 'bun') return ['bunx', '--no-install', bin, ...args];
  return ['npx', '--no-install', bin, ...args];
}

/**
 * ハーネス試験ファイル。休眠中のreview-readinessは既定で除く（D-3）。
 * @param {string[]} files basenameまたは相対パス
 * @param {{ includeDormant?: boolean }} [opts]
 * @returns {string[]}
 */
export function selectHarnessTests(files, { includeDormant = false } = {}) {
  return files.filter((file) => {
    const base = file.split('/').pop();
    if (DORMANT_HARNESS_TESTS.has(base)) return includeDormant;
    return true;
  });
}

export { DORMANT_HARNESS_TESTS };
