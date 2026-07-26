#!/usr/bin/env node
// 保護対象の定義と、人間承認の検証（唯一の正典）。
//
// 設計の前提（重要・限界の明示）:
//   AI と人間が**同一 OS ユーザー**で任意のシェルを実行できる環境では、ファイルベースの
//   承認は暗号学的な認証境界にならない。本モジュールが提供するのは
//   「事故と安易な自己承認をコードで排除する」防御であり、悪意ある偽装の完全防止ではない。
//   詳細と残存リスクは docs/claude-code/harness-state-and-approval.md を参照。
//
// 承認の性質:
// - 発行は人間のみ（.claude/scripts/harness-approve.mjs は TTY か out-of-band トークンを要求する）。
// - AI は「読み取り」と「要求」だけができる。発行・変更・取消はできない（guard-dangerous.mjs が
//   承認ファイル・状態ディレクトリ・発行スクリプトに触れる操作を deny する）。
// - 承認は runId / operation / target / 有効期限に束縛され、**単回使用**。
// - 検証不能（不在・破損・スキーマ不一致・信頼できない保存先）はすべて**拒否**（fail-closed）。

import { existsSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { resolveStateDir, repoRoot } from './harness-paths.mjs';
import { appendJsonl, isIsoTimestamp, readJsonl, readJsonStrict } from './harness-state.mjs';

export const APPROVAL_SCHEMA_VERSION = 1;
export const APPROVAL_FILENAME = 'approval.json';
export const USED_APPROVALS_FILENAME = 'used-approvals.jsonl';

/** 承認の最大有効期間。長期有効な承認を作らせない。 */
export const MAX_APPROVAL_TTL_MS = 60 * 60 * 1000; // 60 分

/** 承認が必要な操作の識別子。 */
export const OPERATION_CONFIG_CHANGE = 'config_change';

const ALLOWED_APPROVAL_KEYS = Object.freeze([
  'schemaVersion',
  'approvalId',
  'runId',
  'operation',
  'target',
  'approvedAt',
  'expiresAt',
  'approvedBy',
]);

// ── 保護対象の定義 ──────────────────────────────────────────────
// Agent の指示・挙動・安全境界・品質ゲートを決めるファイル。変更には人間承認が必要。
// 成果物置き場（.claude/state/ .claude/evals/ docs/ logs/）は対象外。
const PROTECTED_EXACT = Object.freeze([
  'CLAUDE.md',
  'AGENTS.md',
  'lefthook.yml',
  '.claude/settings.json',
  '.claude/settings.local.json',
]);

const PROTECTED_PREFIXES = Object.freeze([
  '.claude/agents/',
  '.claude/hooks/',
  '.claude/lib/',
  '.claude/rules/',
  '.claude/scripts/',
  '.claude/skills/',
  '.claude/tests/',
  '.github/actions/',
  '.github/workflows/',
]);

export const PROTECTED_TARGETS = Object.freeze([...PROTECTED_EXACT, ...PROTECTED_PREFIXES]);

/**
 * 絶対パス・相対パスの両方を、リポジトリ相対の POSIX 形式へ**正規化して**返す。
 *
 * path.resolve による正規化を必ず通す。文字列の前置一致だけで判定すると
 * `.claude/./hooks/x` `.claude//hooks/x` `.claude/../.claude/hooks/x` が
 * すべて保護対象から漏れる（2026-07-26 の再監査で実証。OS はこれらを同一ファイルへ解決する）。
 */
export function toRepoRelative(filePath, root = repoRoot()) {
  if (typeof filePath !== 'string' || filePath.trim() === '') return null;
  const absRoot = resolve(root);
  // 相対パスはリポジトリ root 基準で解決する（ハーネスの cwd は常に root）
  const abs = isAbsolute(filePath) ? resolve(filePath) : resolve(absRoot, filePath);
  const rel = relative(absRoot, abs);
  if (rel === '') return null; // root 自身
  return rel.split(sep).join('/');
}

/**
 * 保護対象かどうか（正規化済みのリポジトリ相対パスで判定）。
 * 大文字小文字を区別しない照合も行う（macOS 等の case-insensitive FS で
 * `CLAUDE.MD` が同一ファイルを指すため）。
 */
export function isProtectedPath(filePath, root = repoRoot()) {
  const rel = toRepoRelative(filePath, root);
  if (rel === null) return false;
  // リポジトリ外へ出るパスは保護判定の対象外（別ルールで扱う）
  if (rel === '..' || rel.startsWith('../')) return false;
  const lower = rel.toLowerCase();
  if (PROTECTED_EXACT.some((p) => p === rel || p.toLowerCase() === lower)) return true;
  return PROTECTED_PREFIXES.some(
    (prefix) => rel.startsWith(prefix) || lower.startsWith(prefix.toLowerCase()),
  );
}

/**
 * 承認の target が対象パスを覆うか。
 * - 末尾が `/` の target はディレクトリ前置一致（例 `.claude/hooks/`）。
 * - それ以外は完全一致。
 */
export function approvalCoversTarget(approvalTarget, filePathRel) {
  if (typeof approvalTarget !== 'string' || approvalTarget === '') return false;
  if (approvalTarget.endsWith('/')) return filePathRel.startsWith(approvalTarget);
  return approvalTarget === filePathRel;
}

/** 承認ファイルの位置を解決する。信頼できない保存先（リポジトリ内）は拒否する。 */
export function resolveApprovalPath({ env = process.env, root = repoRoot(env) } = {}) {
  let resolved;
  try {
    resolved = resolveStateDir({ env, root });
  } catch (error) {
    return { ok: false, reason: 'state_dir_unresolved', detail: String(error?.message ?? error) };
  }
  if (!resolved.trusted) {
    return {
      ok: false,
      reason: 'untrusted_location',
      detail:
        'リポジトリ内フォールバックの状態ディレクトリでは承認を受け付けません' +
        `（source: ${resolved.source}）。HARNESS_STATE_DIR を設定してください`,
    };
  }
  return {
    ok: true,
    dir: resolved.dir,
    approvalPath: join(resolved.dir, APPROVAL_FILENAME),
    usedPath: join(resolved.dir, USED_APPROVALS_FILENAME),
  };
}

/** 承認ペイロードの形を厳格に検証する（値の突き合わせは verifyApproval が行う）。 */
export function validateApprovalShape(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'corrupt', detail: 'オブジェクトではありません' };
  }
  if (value.schemaVersion !== APPROVAL_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'schema_mismatch',
      detail: `schemaVersion が ${APPROVAL_SCHEMA_VERSION} ではありません: ${String(value.schemaVersion)}`,
    };
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_APPROVAL_KEYS.includes(key)) {
      return { ok: false, reason: 'unknown_field', detail: `未知のフィールド: ${key}` };
    }
  }
  for (const key of ALLOWED_APPROVAL_KEYS) {
    if (!(key in value)) {
      return { ok: false, reason: 'schema_mismatch', detail: `必須フィールド欠落: ${key}` };
    }
  }
  for (const key of ['approvalId', 'runId', 'operation', 'target']) {
    if (typeof value[key] !== 'string' || value[key].trim() === '') {
      return { ok: false, reason: 'corrupt', detail: `${key} が不正です` };
    }
  }
  if (value.approvedBy !== 'human') {
    return { ok: false, reason: 'not_human', detail: `approvedBy が human ではありません` };
  }
  for (const key of ['approvedAt', 'expiresAt']) {
    if (!isIsoTimestamp(value[key])) {
      return { ok: false, reason: 'corrupt', detail: `${key} が ISO 8601 ではありません` };
    }
  }
  const approvedAt = Date.parse(value.approvedAt);
  const expiresAt = Date.parse(value.expiresAt);
  if (expiresAt <= approvedAt) {
    return { ok: false, reason: 'corrupt', detail: 'expiresAt が approvedAt 以前です' };
  }
  if (expiresAt - approvedAt > MAX_APPROVAL_TTL_MS) {
    return {
      ok: false,
      reason: 'ttl_too_long',
      detail: `有効期間が上限（${MAX_APPROVAL_TTL_MS / 60000} 分）を超えています`,
    };
  }
  return { ok: true };
}

/**
 * 承認を検証する。すべての失敗は理由つきで拒否を返す（例外は投げない）。
 * @param {{ operation: string, target: string, runId: string|null, now?: Date,
 *           env?: NodeJS.ProcessEnv, root?: string }} params
 * @returns {{ ok: true, approval: object, approvalPath: string, usedPath: string }
 *          | { ok: false, reason: string, detail: string }}
 */
export function verifyApproval({
  operation,
  target,
  runId,
  now = new Date(),
  env = process.env,
  root = repoRoot(env),
} = {}) {
  const location = resolveApprovalPath({ env, root });
  if (!location.ok) return location;

  const read = readJsonStrict(location.approvalPath);
  if (!read.ok) {
    return { ok: false, reason: read.reason, detail: read.detail };
  }
  const shape = validateApprovalShape(read.value);
  if (!shape.ok) return { ...shape, ok: false };

  const approval = read.value;

  if (approval.operation !== operation) {
    return {
      ok: false,
      reason: 'operation_mismatch',
      detail: `承認の operation は ${approval.operation} で、要求 ${operation} と一致しません`,
    };
  }

  const rel = toRepoRelative(target, root);
  if (rel === null || !approvalCoversTarget(approval.target, rel)) {
    return {
      ok: false,
      reason: 'target_mismatch',
      detail: `承認の target は ${approval.target} で、要求 ${rel ?? String(target)} を含みません`,
    };
  }

  if (typeof runId !== 'string' || runId.trim() === '') {
    return {
      ok: false,
      reason: 'run_mismatch',
      detail: 'run 状態が無いため承認を照合できません（run を開始してください）',
    };
  }
  if (approval.runId !== runId) {
    return {
      ok: false,
      reason: 'run_mismatch',
      detail: '承認の runId が現在の run と一致しません',
    };
  }

  if (Date.parse(approval.expiresAt) <= now.getTime()) {
    return { ok: false, reason: 'expired', detail: `承認は ${approval.expiresAt} に失効しています` };
  }

  const used = readJsonl(location.usedPath);
  if (used.some((entry) => entry.approvalId === approval.approvalId)) {
    return { ok: false, reason: 'already_used', detail: 'この承認は使用済みです（再利用不可）' };
  }

  return {
    ok: true,
    approval,
    approvalPath: location.approvalPath,
    usedPath: location.usedPath,
  };
}

/**
 * 承認を消費する（単回使用）。使用済み台帳へ追記し、承認ファイルを削除する。
 * 秘密情報は台帳へ書かない（識別子と対象のみ）。
 */
export function consumeApproval(verified, { now = new Date() } = {}) {
  appendJsonl(verified.usedPath, {
    approvalId: verified.approval.approvalId,
    runId: verified.approval.runId,
    operation: verified.approval.operation,
    target: verified.approval.target,
    usedAt: now.toISOString(),
  });
  if (existsSync(verified.approvalPath)) {
    rmSync(verified.approvalPath, { force: true });
  }
}

/** 拒否理由を人間向けの 1 行に整形する。 */
export function describeRejection(result) {
  const messages = {
    missing: '承認がありません',
    corrupt: '承認ファイルが壊れています',
    unreadable: '承認ファイルを読み取れません',
    schema_mismatch: '承認のスキーマが一致しません',
    unknown_field: '承認に未知のフィールドがあります',
    not_human: '承認の発行者が human ではありません',
    ttl_too_long: '承認の有効期間が上限を超えています',
    expired: '承認の有効期限が切れています',
    run_mismatch: '承認の runId が現在の run と一致しません',
    operation_mismatch: '承認の操作種別が一致しません',
    target_mismatch: '承認の対象パスが一致しません',
    already_used: '承認は使用済みです',
    untrusted_location: '状態ディレクトリが信頼できません（リポジトリ内フォールバック）',
    state_dir_unresolved: '状態ディレクトリを解決できません',
  };
  const head = messages[result.reason] ?? `検証できません（${result.reason}）`;
  return result.detail ? `${head}: ${result.detail}` : head;
}
