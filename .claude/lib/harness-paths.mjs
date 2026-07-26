#!/usr/bin/env node
// ハーネス状態ディレクトリの解決（唯一の正典）。
//
// 方針:
// - 状態（run 状態・ゲート結果・承認・実行ログ）は**リポジトリ配下を唯一の永続先にしない**。
//   リポジトリ配下（.claude/state/）は .gitignore 対象かつエフェメラル環境で消滅するため、
//   OS のユーザー状態ディレクトリを既定の永続先とする。
// - 解決順: HARNESS_STATE_DIR → XDG_STATE_HOME/<ns> → ~/.local/state/<ns> → リポジトリ内フォールバック。
// - リポジトリ配下を指す明示指定（HARNESS_STATE_DIR / XDG_STATE_HOME）は**拒否**する。
//   シンボリックリンクでリポジトリ内へ逆戻りしている場合も拒否する（realpath で検証）。
// - リポジトリ内フォールバックは `trusted: false` を返す。承認情報は trusted な場所からしか
//   読まない（harness-approval.mjs 側で fail-closed）。
//
// このモジュールは副作用として stateDir() 呼び出し時のみディレクトリを作成する（mode 0700）。

import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

/** OS 状態ディレクトリ配下で使う名前空間。 */
export const STATE_NAMESPACE = 'cookpit-harness';

/** 解決に失敗した（＝安全に決められない）ことを表す。呼び出し側は fail-closed で扱う。 */
export class StateDirError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = 'StateDirError';
    this.reason = reason;
  }
}

export function repoRoot(env = process.env) {
  return env.CLAUDE_PROJECT_DIR || process.cwd();
}

/** child が parent と同一、またはその配下か。 */
export function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

// シンボリックリンク経由でリポジトリ内へ戻っていないかを実体パスで確認する。
// 存在しないパスは realpath できないため、存在する最も近い祖先で判定する。
function realpathOfNearestExisting(target) {
  let current = resolve(target);
  for (;;) {
    if (existsSync(current)) return realpathSync(current);
    const parent = resolve(current, '..');
    if (parent === current) return current;
    current = parent;
  }
}

function assertOutsideRepo(candidate, root, source, raw = candidate) {
  // 相対パスは resolve() で cwd 基準の絶対パスになってしまうため、生の値で判定する
  if (!isAbsolute(raw)) {
    throw new StateDirError(`${source} は絶対パスで指定してください: ${raw}`, 'not_absolute');
  }
  if (isInside(root, candidate)) {
    throw new StateDirError(
      `${source} がリポジトリ配下を指しています（永続領域として使えません）: ${candidate}`,
      'inside_repo',
    );
  }
  const real = realpathOfNearestExisting(candidate);
  // root 側は実在するときだけ realpath を取る。存在しない root で祖先まで遡ると、
  // 同じ祖先を共有する正当な state ディレクトリを誤って「リポジトリ内」と判定し、
  // コンテナ破棄後の復旧そのものを壊す（2026-07-26 の再監査で実証）。
  const rootReal = existsSync(root) ? realpathSync(root) : resolve(root);
  if (isInside(rootReal, real)) {
    throw new StateDirError(
      `${source} の実体パスがリポジトリ配下へ解決されます（シンボリックリンク経由の可能性）: ${candidate} → ${real}`,
      'symlink_into_repo',
    );
  }
}

/**
 * 状態ディレクトリを解決する（ディレクトリ作成は行わない）。
 * @returns {{ dir: string, source: 'HARNESS_STATE_DIR'|'XDG_STATE_HOME'|'home'|'repo-fallback',
 *             trusted: boolean, warnings: string[] }}
 */
export function resolveStateDir({
  env = process.env,
  root = repoRoot(env),
  // HOME は env から取り、未指定のときだけ OS 既定にフォールバックする
  // （テストと実行時で同じ解決経路を通すため）
  home = env.HOME ?? homedir(),
} = {}) {
  const warnings = [];

  const explicit = env.HARNESS_STATE_DIR;
  if (explicit && explicit.trim() !== '') {
    const raw = explicit.trim();
    assertOutsideRepo(resolve(raw), root, 'HARNESS_STATE_DIR', raw);
    return { dir: resolve(raw), source: 'HARNESS_STATE_DIR', trusted: true, warnings };
  }

  const xdg = env.XDG_STATE_HOME;
  if (xdg && xdg.trim() !== '') {
    const raw = xdg.trim();
    assertOutsideRepo(resolve(join(raw, STATE_NAMESPACE)), root, 'XDG_STATE_HOME', raw);
    return {
      dir: resolve(join(raw, STATE_NAMESPACE)),
      source: 'XDG_STATE_HOME',
      trusted: true,
      warnings,
    };
  }

  if (home && home.trim() !== '' && home !== '/') {
    const candidate = resolve(join(home, '.local/state', STATE_NAMESPACE));
    // home がリポジトリ内という異常構成では信頼できない。フォールバックへ落とす。
    if (!isInside(root, candidate)) {
      return { dir: candidate, source: 'home', trusted: true, warnings };
    }
    warnings.push(`ホームディレクトリがリポジトリ配下です（${home}）。永続領域として使いません`);
  }

  // 最終手段: リポジトリ内。エフェメラル環境では失われるため trusted: false。
  warnings.push(
    'ユーザー状態ディレクトリを解決できないため、リポジトリ内 .claude/state/ を使用します。' +
      'この領域は環境破棄で失われます。HARNESS_STATE_DIR を設定してください',
  );
  return { dir: join(root, '.claude/state'), source: 'repo-fallback', trusted: false, warnings };
}

/** 状態ディレクトリを解決し、必要なら mode 0700 で作成して返す。 */
export function stateDir(opts = {}) {
  const resolved = resolveStateDir(opts);
  mkdirSync(resolved.dir, { recursive: true, mode: 0o700 });
  return resolved.dir;
}

/** 状態ディレクトリ内のファイルパス（ディレクトリは作成しない）。 */
export function statePath(name, opts = {}) {
  return join(resolveStateDir(opts).dir, name);
}

/**
 * 書き込み先のパスを決める。解決に失敗しても例外を投げず旧パスへフォールバックする。
 * 記録系 Hook（活動ログ等）は失敗しても作業を止めてはならないため、この関数を使う。
 * 保護対象の判定・承認検証には**使わない**（あちらは fail-closed が要件）。
 */
export function safeStatePath(name, opts = {}) {
  try {
    const dir = stateDir(opts);
    return join(dir, name);
  } catch {
    const root = opts.root || repoRoot(opts.env || process.env);
    const fallback = legacyStateDir(root);
    mkdirSync(fallback, { recursive: true, mode: 0o700 });
    return join(fallback, name);
  }
}

/** 旧来のリポジトリ内状態ディレクトリ（移行元・後方互換の読み取り用）。 */
export function legacyStateDir(root = repoRoot()) {
  return join(root, '.claude/state');
}

export function legacyStatePath(name, root = repoRoot()) {
  return join(legacyStateDir(root), name);
}

/**
 * 読み取り時の後方互換: 永続領域を優先し、無ければ旧パスを見る。
 * どちらにも無ければ null を返す（存在判定は呼び出し側の責務）。
 */
export function resolveReadablePath(name, opts = {}) {
  const root = opts.root || repoRoot(opts.env || process.env);
  let primary = null;
  try {
    primary = statePath(name, opts);
  } catch {
    primary = null; // 解決不能時は旧パスのみを見る（読み取りは非破壊のため fail-open）
  }
  if (primary && existsSync(primary)) return primary;
  const legacy = legacyStatePath(name, root);
  if (existsSync(legacy)) return legacy;
  return null;
}

/** ディレクトリの権限が他ユーザーへ開いていないか（0o077 が立っていないか）。 */
export function hasSafePermissions(dir) {
  try {
    return (statSync(dir).mode & 0o077) === 0;
  } catch {
    return false;
  }
}
