// 状態ディレクトリ解決のテスト（永続化先の決定・リポジトリ配下フォールバックの拒否）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  STATE_NAMESPACE,
  StateDirError,
  isInside,
  resolveStateDir,
} from '../lib/harness-paths.mjs';

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'harness-paths-'));
  const root = join(base, 'repo');
  const home = join(base, 'home');
  mkdirSync(root, { recursive: true });
  mkdirSync(home, { recursive: true });
  return { base, root, home, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

test('HARNESS_STATE_DIR が最優先で使われる', () => {
  const { base, root, home, cleanup } = sandbox();
  try {
    const explicit = join(base, 'explicit-state');
    const resolved = resolveStateDir({ env: { HARNESS_STATE_DIR: explicit }, root, home });
    assert.equal(resolved.dir, explicit);
    assert.equal(resolved.source, 'HARNESS_STATE_DIR');
    assert.equal(resolved.trusted, true);
  } finally {
    cleanup();
  }
});

test('HARNESS_STATE_DIR がリポジトリ配下なら拒否する', () => {
  const { root, home, cleanup } = sandbox();
  try {
    assert.throws(
      () => resolveStateDir({ env: { HARNESS_STATE_DIR: join(root, '.claude/state') }, root, home }),
      (error) => error instanceof StateDirError && error.reason === 'inside_repo',
    );
  } finally {
    cleanup();
  }
});

test('HARNESS_STATE_DIR が相対パスなら拒否する', () => {
  const { root, home, cleanup } = sandbox();
  try {
    assert.throws(
      () => resolveStateDir({ env: { HARNESS_STATE_DIR: 'state' }, root, home }),
      (error) => error instanceof StateDirError && error.reason === 'not_absolute',
    );
  } finally {
    cleanup();
  }
});

test('シンボリックリンクでリポジトリ内へ戻る指定を拒否する', () => {
  const { base, root, home, cleanup } = sandbox();
  try {
    mkdirSync(join(root, 'inside'), { recursive: true });
    const link = join(base, 'sneaky');
    symlinkSync(join(root, 'inside'), link);
    assert.throws(
      () => resolveStateDir({ env: { HARNESS_STATE_DIR: link }, root, home }),
      (error) => error instanceof StateDirError && error.reason === 'symlink_into_repo',
    );
  } finally {
    cleanup();
  }
});

test('XDG_STATE_HOME を名前空間つきで使う', () => {
  const { base, root, home, cleanup } = sandbox();
  try {
    const xdg = join(base, 'xdg');
    const resolved = resolveStateDir({ env: { XDG_STATE_HOME: xdg }, root, home });
    assert.equal(resolved.dir, join(xdg, STATE_NAMESPACE));
    assert.equal(resolved.source, 'XDG_STATE_HOME');
    assert.equal(resolved.trusted, true);
  } finally {
    cleanup();
  }
});

test('環境変数が無ければ ~/.local/state/<ns> を使う', () => {
  const { root, home, cleanup } = sandbox();
  try {
    const resolved = resolveStateDir({ env: {}, root, home });
    assert.equal(resolved.dir, join(home, '.local/state', STATE_NAMESPACE));
    assert.equal(resolved.source, 'home');
    assert.equal(resolved.trusted, true);
  } finally {
    cleanup();
  }
});

test('HOME が無い場合のみリポジトリ内へ落ち、trusted:false になる', () => {
  const { root, cleanup } = sandbox();
  try {
    const resolved = resolveStateDir({ env: {}, root, home: '' });
    assert.equal(resolved.dir, join(root, '.claude/state'));
    assert.equal(resolved.source, 'repo-fallback');
    assert.equal(resolved.trusted, false);
    assert.ok(resolved.warnings.length > 0);
  } finally {
    cleanup();
  }
});

test('isInside は同一パスと配下を真、外を偽とする', () => {
  assert.equal(isInside('/a/b', '/a/b'), true);
  assert.equal(isInside('/a/b', '/a/b/c'), true);
  assert.equal(isInside('/a/b', '/a/bc'), false);
  assert.equal(isInside('/a/b', '/a'), false);
});
