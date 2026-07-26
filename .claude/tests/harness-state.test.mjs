// run 状態の検証・原子的書き込み・破損検出のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  RUN_STATE_FILENAME,
  RUN_STATE_SCHEMA_VERSION,
  atomicWriteJson,
  createRunState,
  isIsoTimestamp,
  loadRunState,
  readJsonStrict,
  saveRunState,
  updateRunState,
  validateRunState,
  withLock,
} from '../lib/harness-state.mjs';

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'harness-state-'));
  const root = join(base, 'repo');
  const state = join(base, 'state');
  mkdirSync(root, { recursive: true });
  mkdirSync(state, { recursive: true });
  return {
    base,
    root,
    state,
    opts: { env: { HARNESS_STATE_DIR: state }, root },
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

test('正常な run 状態を検証できる', () => {
  const result = validateRunState(createRunState({ taskId: 'T-1' }));
  assert.equal(result.ok, true);
});

test('未知フィールドを拒否する', () => {
  const state = { ...createRunState(), injected: 'x' };
  const result = validateRunState(state);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unknown_field');
});

test('schemaVersion 不一致を拒否する', () => {
  const state = { ...createRunState(), schemaVersion: 999 };
  const result = validateRunState(state);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'schema_mismatch');
});

test('必須フィールド欠落を拒否する', () => {
  const state = createRunState();
  delete state.phase;
  const result = validateRunState(state);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'schema_mismatch');
});

test('不正な phase / status / approvalStatus を拒否する', () => {
  for (const [key, value] of [
    ['phase', 'bogus'],
    ['status', 'bogus'],
    ['approvalStatus', 'bogus'],
  ]) {
    const result = validateRunState({ ...createRunState(), [key]: value });
    assert.equal(result.ok, false, `${key} が拒否されていません`);
    assert.equal(result.reason, 'corrupt');
  }
});

test('ISO 8601 でないタイムスタンプを拒否する', () => {
  assert.equal(isIsoTimestamp('2026-07-26'), false);
  assert.equal(isIsoTimestamp('not-a-date'), false);
  assert.equal(isIsoTimestamp(new Date().toISOString()), true);
  const result = validateRunState({ ...createRunState(), updatedAt: '2026-07-26' });
  assert.equal(result.ok, false);
});

test('保存 → 読み込みが往復する', () => {
  const { opts, state: stateDirPath, cleanup } = sandbox();
  try {
    const created = createRunState({ taskId: 'T-2' });
    saveRunState(created, opts);
    const loaded = loadRunState(opts);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.state.runId, created.runId);
    assert.equal(loaded.state.schemaVersion, RUN_STATE_SCHEMA_VERSION);
    // 予約フィールドは保持されるが解釈されない
    assert.equal(loaded.state.attempt, 0);
    assert.equal(loaded.state.maxAttempts, 0);
    assert.equal(loaded.state.lastFailureFingerprint, null);
    // 権限が他ユーザーへ開いていない
    assert.equal(statSync(join(stateDirPath, RUN_STATE_FILENAME)).mode & 0o077, 0);
  } finally {
    cleanup();
  }
});

test('状態が無いときは missing を返す（例外を投げない）', () => {
  const { opts, cleanup } = sandbox();
  try {
    const loaded = loadRunState(opts);
    assert.equal(loaded.ok, false);
    assert.equal(loaded.reason, 'missing');
  } finally {
    cleanup();
  }
});

test('壊れた JSON は corrupt として検出する', () => {
  const { opts, state: stateDirPath, cleanup } = sandbox();
  try {
    writeFileSync(join(stateDirPath, RUN_STATE_FILENAME), '{ broken');
    const loaded = loadRunState(opts);
    assert.equal(loaded.ok, false);
    assert.equal(loaded.reason, 'corrupt');
  } finally {
    cleanup();
  }
});

test('スキーマ不一致の状態ファイルは schema_mismatch として検出する', () => {
  const { opts, state: stateDirPath, cleanup } = sandbox();
  try {
    writeFileSync(join(stateDirPath, RUN_STATE_FILENAME), JSON.stringify({ schemaVersion: 2 }));
    const loaded = loadRunState(opts);
    assert.equal(loaded.ok, false);
    assert.equal(loaded.reason, 'schema_mismatch');
  } finally {
    cleanup();
  }
});

test('原子的書き込みが一時ファイルを残さない', () => {
  const { state: stateDirPath, cleanup } = sandbox();
  try {
    const target = join(stateDirPath, 'atomic.json');
    atomicWriteJson(target, { a: 1 });
    assert.deepEqual(readJsonStrict(target).value, { a: 1 });
    assert.deepEqual(
      readdirSync(stateDirPath).filter((f) => f.startsWith('.tmp-')),
      [],
    );
  } finally {
    cleanup();
  }
});

test('中断された一時ファイルを正式な状態として読まない', () => {
  const { opts, state: stateDirPath, cleanup } = sandbox();
  try {
    // 書き込み途中で落ちたことを模す（.tmp- 接頭辞のまま残る）
    writeFileSync(join(stateDirPath, '.tmp-123-partial'), '{"schemaVersion":1,"runId":"x"');
    const loaded = loadRunState(opts);
    assert.equal(loaded.ok, false);
    assert.equal(loaded.reason, 'missing', '一時ファイルが状態として読まれています');
  } finally {
    cleanup();
  }
});

test('不正な状態は保存できない', () => {
  const { opts, cleanup } = sandbox();
  try {
    assert.throws(() => saveRunState({ schemaVersion: 1 }, opts));
  } finally {
    cleanup();
  }
});

test('updateRunState は updatedAt を進めて既存値を保つ', () => {
  const { opts, cleanup } = sandbox();
  try {
    const created = createRunState({ taskId: 'T-3' });
    saveRunState(created, opts);
    const next = updateRunState({ phase: 'gates' }, opts);
    assert.equal(next.phase, 'gates');
    assert.equal(next.taskId, 'T-3');
    assert.equal(next.runId, created.runId);
    assert.ok(Date.parse(next.updatedAt) >= Date.parse(created.updatedAt));
  } finally {
    cleanup();
  }
});

test('ロックは排他され、解放後に再取得できる', () => {
  const { state: stateDirPath, cleanup } = sandbox();
  try {
    const lock = join(stateDirPath, 'x.lock');
    let inner = null;
    withLock(lock, () => {
      inner = () => withLock(lock, () => 'nested', { timeoutMs: 50 });
      assert.throws(inner, /ロックを取得できません/);
      return null;
    });
    // 解放後は取得できる
    assert.equal(
      withLock(lock, () => 'ok'),
      'ok',
    );
  } finally {
    cleanup();
  }
});
