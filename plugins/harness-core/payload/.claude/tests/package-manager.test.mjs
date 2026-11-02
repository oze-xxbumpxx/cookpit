// package-manager.mjs — lockfile検出と休眠テストの除外。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPackageManager,
  execArgv,
  scriptArgv,
  selectHarnessTests,
} from '../lib/package-manager.mjs';

function fsWith(names) {
  const set = new Set(names);
  return { existsSync: (p) => [...set].some((name) => String(p).endsWith(name)) };
}

test('lockfile の優先順は pnpm → yarn → bun → npm', () => {
  assert.equal(detectPackageManager('/r', fsWith(['pnpm-lock.yaml', 'package-lock.json'])), 'pnpm');
  assert.equal(detectPackageManager('/r', fsWith(['yarn.lock'])), 'yarn');
  assert.equal(detectPackageManager('/r', fsWith(['bun.lock'])), 'bun');
  assert.equal(detectPackageManager('/r', fsWith(['package-lock.json'])), 'npm');
  assert.equal(detectPackageManager('/r', fsWith([])), 'npm');
});

test('scriptArgv / execArgv は PM ごとに勝手に DL しない', () => {
  assert.deepEqual(scriptArgv('pnpm', 'lint'), ['pnpm', 'lint']);
  assert.deepEqual(scriptArgv('npm', 'lint'), ['npm', 'run', 'lint']);
  assert.deepEqual(execArgv('npm', 'prettier', ['--check', '.']), [
    'npx',
    '--no-install',
    'prettier',
    '--check',
    '.',
  ]);
});

test('selectHarnessTests は既定で review-readiness を除く', () => {
  const files = [
    '.claude/tests/guard-dangerous.test.mjs',
    '.claude/tests/review-readiness.test.mjs',
    '.claude/tests/harness-paths.test.mjs',
  ];
  assert.deepEqual(selectHarnessTests(files), [
    '.claude/tests/guard-dangerous.test.mjs',
    '.claude/tests/harness-paths.test.mjs',
  ]);
  assert.equal(selectHarnessTests(files, { includeDormant: true }).length, 3);
});
