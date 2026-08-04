#!/usr/bin/env node
// ハーネス実行状態の読み書き（原子的書き込み・スキーマ検証・ロック）。
//
// 方針:
// - 保存先は harness-paths.mjs が決める（リポジトリ外の永続領域が既定）。
// - 書き込みは常に「一時ファイル → fsync → rename」。部分書き込みを正式状態として読ませない。
// - 読み取りは例外を投げず {ok, reason} を返す。呼び出し側が用途に応じて fail-closed を選ぶ。
// - 秘密情報は保存しない。環境変数は**名前のみ**記録し値は記録しない。
//
// 今回のスコープでは有界修正ループを実装しない。attempt / maxAttempts /
// lastFailureFingerprint は将来拡張のための予約フィールドで、本モジュールは値を解釈しない。

import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { stateDir, statePath } from './harness-paths.mjs';

export const RUN_STATE_SCHEMA_VERSION = 2;
export const RUN_STATE_FILENAME = 'run-state.json';

export const PHASES = Object.freeze([
  'planning',
  'implementing',
  'gates',
  'blocked',
  'completed',
  'failed',
]);
export const STATUSES = Object.freeze(['active', 'completed', 'failed']);

const LEGACY_RUN_STATE_SCHEMA_VERSION = 1;
const LEGACY_APPROVAL_STATUSES = Object.freeze([
  'not_required',
  'pending',
  'approved',
  'rejected',
  'expired',
]);

const REQUIRED_KEYS = Object.freeze([
  'schemaVersion',
  'runId',
  'taskId',
  'phase',
  'status',
  'changedFiles',
  'gateResults',
  'startedAt',
  'updatedAt',
]);
// 予約フィールド（将来の有界修正ループ用。本実装は解釈しない）
const RESERVED_KEYS = Object.freeze(['attempt', 'maxAttempts', 'lastFailureFingerprint']);
const ALLOWED_KEYS = Object.freeze([...REQUIRED_KEYS, ...RESERVED_KEYS]);

export function isIsoTimestamp(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  // Date.parse は緩いため ISO 8601 の形も確認する
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value);
}

/**
 * run 状態を厳格に検証する。未知フィールド・型不一致・不正な列挙値は拒否する。
 * @returns {{ ok: true } | { ok: false, reason: string, detail: string }}
 */
export function validateRunState(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'corrupt', detail: 'オブジェクトではありません' };
  }
  if (value.schemaVersion !== RUN_STATE_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'schema_mismatch',
      detail: `schemaVersion が ${RUN_STATE_SCHEMA_VERSION} ではありません: ${String(value.schemaVersion)}`,
    };
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.includes(key)) {
      return { ok: false, reason: 'unknown_field', detail: `未知のフィールド: ${key}` };
    }
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in value)) {
      return { ok: false, reason: 'schema_mismatch', detail: `必須フィールド欠落: ${key}` };
    }
  }
  if (typeof value.runId !== 'string' || value.runId.trim() === '') {
    return { ok: false, reason: 'corrupt', detail: 'runId が不正です' };
  }
  if (typeof value.taskId !== 'string') {
    return { ok: false, reason: 'corrupt', detail: 'taskId が不正です' };
  }
  if (!PHASES.includes(value.phase)) {
    return { ok: false, reason: 'corrupt', detail: `phase が不正です: ${String(value.phase)}` };
  }
  if (!STATUSES.includes(value.status)) {
    return { ok: false, reason: 'corrupt', detail: `status が不正です: ${String(value.status)}` };
  }
  if (!Array.isArray(value.changedFiles) || value.changedFiles.some((f) => typeof f !== 'string')) {
    return { ok: false, reason: 'corrupt', detail: 'changedFiles が文字列配列ではありません' };
  }
  if (
    value.gateResults === null ||
    typeof value.gateResults !== 'object' ||
    Array.isArray(value.gateResults)
  ) {
    return { ok: false, reason: 'corrupt', detail: 'gateResults がオブジェクトではありません' };
  }
  for (const key of ['startedAt', 'updatedAt']) {
    if (!isIsoTimestamp(value[key])) {
      return { ok: false, reason: 'corrupt', detail: `${key} が ISO 8601 ではありません` };
    }
  }
  return { ok: true };
}

/**
 * 旧 schema v1 のファイル承認状態を schema v2 へ移行する。
 *
 * waiting_for_approval は、作業が完了していないことを保ったまま
 * phase=blocked / status=active へ変換する。承認の判断自体は PR レビューへ移管済み。
 */
export function normalizeRunState(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.schemaVersion !== LEGACY_RUN_STATE_SCHEMA_VERSION ||
    !Object.hasOwn(value, 'approvalStatus') ||
    !LEGACY_APPROVAL_STATUSES.includes(value.approvalStatus)
  ) {
    return value;
  }

  const { approvalStatus: _approvalStatus, ...migrated } = value;
  return {
    ...migrated,
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    phase: value.status === 'waiting_for_approval' ? 'blocked' : value.phase,
    status: value.status === 'waiting_for_approval' ? 'active' : value.status,
  };
}

/** 一時ファイル → fsync → rename の原子的書き込み（mode 0600）。 */
export function atomicWriteFile(path, contents) {
  const tmp = join(dirname(path), `.tmp-${process.pid}-${randomUUID()}`);
  const fd = openSync(tmp, 'wx', 0o600);
  try {
    writeSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

export function atomicWriteJson(path, value) {
  atomicWriteFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * JSON を厳格に読む。存在しない・壊れている・読めないを区別して返す（例外を投げない）。
 * @returns {{ ok: true, value: unknown } | { ok: false, reason: 'missing'|'corrupt'|'unreadable', detail: string }}
 */
export function readJsonStrict(path) {
  if (!existsSync(path)) return { ok: false, reason: 'missing', detail: path };
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    return { ok: false, reason: 'unreadable', detail: String(error?.message ?? error) };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, reason: 'corrupt', detail: String(error?.message ?? error) };
  }
}

export function appendJsonl(path, record) {
  writeFileSync(path, `${JSON.stringify(record)}\n`, { flag: 'a', mode: 0o600 });
}

const LOCK_STALE_MS = 30_000;

/** O_EXCL による素朴な排他ロック。同時更新時の破損を防ぐ。 */
export function withLock(lockPath, fn, { timeoutMs = 5_000, staleMs = LOCK_STALE_MS } = {}) {
  const deadline = Date.now() + timeoutMs;
  let fd = null;
  for (;;) {
    try {
      fd = openSync(lockPath, 'wx', 0o600);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      // 古いロックは奪う（プロセス異常終了で残った場合の回復）。
      // 生成直後はロック内容がまだ書き込まれておらず空になりうるため、内容ではなく
      // ファイルの mtime で年齢を判定する（内容ベースだと age=Date.now()-0 の
      // 誤った巨大値になり、生きたロックを誤って「古い」と判定して奪ってしまう）。
      let age = 0;
      try {
        age = Date.now() - statSync(lockPath).mtimeMs;
      } catch {
        age = staleMs + 1;
      }
      if (age > staleMs) {
        rmSync(lockPath, { force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`ロックを取得できません（${timeoutMs}ms 超過）: ${lockPath}`);
      }
      // busy-wait（Node 標準のみで sleep するための最小実装）
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    writeSync(fd, String(Date.now()));
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    return fn();
  } finally {
    if (fd !== null) closeSync(fd);
    try {
      unlinkSync(lockPath);
    } catch {
      // 既に消えている場合は何もしない
    }
  }
}

export function newRunId() {
  return `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
}

export function createRunState({ runId = newRunId(), taskId = '', now = new Date() } = {}) {
  const iso = now.toISOString();
  return {
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    runId,
    taskId,
    phase: 'planning',
    status: 'active',
    changedFiles: [],
    gateResults: {},
    startedAt: iso,
    updatedAt: iso,
    // 予約フィールド（自動修正処理は未実装）
    attempt: 0,
    maxAttempts: 0,
    lastFailureFingerprint: null,
  };
}

export function runStatePath(opts = {}) {
  return statePath(RUN_STATE_FILENAME, opts);
}

/**
 * run 状態を読む。不在・破損・スキーマ不一致を区別して返す。
 * @returns {{ ok: true, state: object } | { ok: false, reason: string, detail: string }}
 */
export function loadRunState(opts = {}) {
  let path;
  try {
    path = runStatePath(opts);
  } catch (error) {
    return { ok: false, reason: 'state_dir_unresolved', detail: String(error?.message ?? error) };
  }
  const read = readJsonStrict(path);
  if (!read.ok) return { ok: false, reason: read.reason, detail: read.detail };
  const state = normalizeRunState(read.value);
  const valid = validateRunState(state);
  if (!valid.ok) return { ok: false, reason: valid.reason, detail: valid.detail };
  return { ok: true, state };
}

// ロックを取らずに書き込む内部関数。呼び出し側がロックを保持していること。
function writeRunStateUnlocked(state, path) {
  const valid = validateRunState(state);
  if (!valid.ok) {
    throw new Error(`run 状態が不正です（${valid.reason}）: ${valid.detail}`);
  }
  atomicWriteJson(path, state);
  return path;
}

/** run 状態を書き込む（検証 → ロック → 原子的書き込み）。 */
export function saveRunState(state, opts = {}) {
  const path = join(stateDir(opts), RUN_STATE_FILENAME);
  return withLock(`${path}.lock`, () => writeRunStateUnlocked(state, path));
}

/**
 * 既存 run 状態へ差分を適用する。存在しなければ新規作成する。
 *
 * **読み取りから書き込みまでを 1 つのロック区間に収める。** 読み取りをロック外で
 * 行うと、並行更新が無言で失われる（2026-07-26 の再監査で 4 並行中 3 件消失を実証）。
 * 有界修正ループの attempt カウンタが失われると上限が機能しないため、ここは必須。
 *
 * @param {object|((current: object) => object)} patchOrFn
 *   差分オブジェクト、または現在の状態を受け取って差分を返す関数。
 *   gateResults のような累積フィールドは関数形式でマージすること。
 */
export function updateRunState(patchOrFn, opts = {}) {
  const path = join(stateDir(opts), RUN_STATE_FILENAME);
  return withLock(`${path}.lock`, () => {
    const read = readJsonStrict(path);
    let base = null;
    if (read.ok) {
      const state = normalizeRunState(read.value);
      const valid = validateRunState(state);
      if (valid.ok) base = state;
    }
    const patch = typeof patchOrFn === 'function' ? patchOrFn(base) : patchOrFn;
    if (base === null) base = createRunState({ taskId: patch.taskId ?? '' });
    const next = { ...base, ...patch, updatedAt: new Date().toISOString() };
    writeRunStateUnlocked(next, path);
    return next;
  });
}
