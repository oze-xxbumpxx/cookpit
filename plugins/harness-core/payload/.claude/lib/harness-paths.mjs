#!/usr/bin/env node
// ハーネス状態ディレクトリの解決（唯一の正典）。
//
// 方針:
// - 状態（run 状態・ゲート結果・実行ログ）は**リポジトリ配下を唯一の永続先にしない**。
//   リポジトリ配下（.claude/state/）は .gitignore 対象かつエフェメラル環境で消滅するため、
//   OS のユーザー状態ディレクトリを既定の永続先とする。
// - 解決順: HARNESS_STATE_DIR → XDG_STATE_HOME/<ns> → ~/.local/state/<ns> → リポジトリ内フォールバック。
//   <ns> はプロジェクト名に依存しないよう導出する（resolveNamespace 参照）。
// - リポジトリ配下を指す明示指定（HARNESS_STATE_DIR / XDG_STATE_HOME）は**拒否**する。
//   シンボリックリンクでリポジトリ内へ逆戻りしている場合も拒否する（realpath で検証）。
// - リポジトリ内フォールバックは `trusted: false` を返し、永続性がないことを呼び出し側へ伝える。
//
// このモジュールは副作用として stateDir() 呼び出し時のみディレクトリを作成する（mode 0700）。

import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

/** 名前空間を導出できなかったときの既定値（プロジェクト名に依存しない）。 */
export const DEFAULT_NAMESPACE = 'claude-harness';

// 名前空間は状態ディレクトリのパスへ連結される。区切り文字や相対参照が残ると
// 指定次第で意図しない場所を指せるため、単一セグメントへ落として無害化する。
function sanitizeNamespaceSegment(value) {
  if (typeof value !== 'string') return null;
  const segment = value
    .trim()
    .replace(/^@/, '') // npm スコープの記号
    .replace(/[^a-zA-Z0-9_-]+/g, '-') // '/' '\' '.' 等はすべて '-' へ倒す
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return segment === '' ? null : segment;
}

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

/**
 * `.git` を持つ最も近い祖先を返す（見つからなければ start をそのまま返す）。
 * CLAUDE_PROJECT_DIR 未設定で cwd がサブディレクトリのとき、モノレポの
 * workspace 側 package.json を誤って拾わないためにリポジトリ境界で止める。
 */
function repoRootFromMarker(start) {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, '.git'))) return current;
    const parent = resolve(current, '..');
    if (parent === current) return resolve(start);
    current = parent;
  }
}

/**
 * OS 状態ディレクトリ配下で使う名前空間を解決する。
 * 解決順: HARNESS_NAMESPACE → package.json の name に `-harness` を付けたもの → DEFAULT_NAMESPACE。
 * **例外を投げない**。名前空間の都合で記録系 Hook を止めないため、読めない場合は既定値へ落とす。
 *
 * モジュール自身の位置は使わない。Plugin として配布するとモジュールは利用者リポジトリの
 * 外に置かれ、全プロジェクトが同一の名前空間になってしまうため。
 */
export function resolveNamespace({ env = process.env, root = repoRoot(env) } = {}) {
  const explicit = sanitizeNamespaceSegment(env.HARNESS_NAMESPACE);
  if (explicit) return explicit;

  try {
    const pkg = JSON.parse(readFileSync(join(repoRootFromMarker(root), 'package.json'), 'utf8'));
    const derived = sanitizeNamespaceSegment(pkg?.name);
    // サフィックスは現行値との互換（cookpit → cookpit-harness）と、
    // OS の状態ディレクトリ配下で用途が名前から分かることの両立。
    if (derived) return `${derived}-harness`;
  } catch {
    // package.json が無い・壊れている・name が無い → 既定値
  }
  return DEFAULT_NAMESPACE;
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

  // HARNESS_STATE_DIR で決まる経路では名前空間を使わないため、ここまで来てから解決する。
  const namespace = resolveNamespace({ env, root });
  // 既定値へ落ちた = プロジェクトを特定できていない。この状態は保存先が本来と変わり、
  // 既存の状態ファイルが参照されなくなる（静かに孤児化する）ため必ず警告する。
  if (namespace === DEFAULT_NAMESPACE && !sanitizeNamespaceSegment(env.HARNESS_NAMESPACE)) {
    warnings.push(
      `プロジェクトを特定できないため名前空間を既定値（${DEFAULT_NAMESPACE}）にしました。` +
        'CLAUDE_PROJECT_DIR を設定するか、リポジトリ内で実行してください' +
        '（別の状態ディレクトリを使うことになり、既存の記録は参照されません）',
    );
  }

  const xdg = env.XDG_STATE_HOME;
  if (xdg && xdg.trim() !== '') {
    const raw = xdg.trim();
    assertOutsideRepo(resolve(join(raw, namespace)), root, 'XDG_STATE_HOME', raw);
    return {
      dir: resolve(join(raw, namespace)),
      source: 'XDG_STATE_HOME',
      trusted: true,
      warnings,
    };
  }

  if (home && home.trim() !== '' && home !== '/') {
    const candidate = resolve(join(home, '.local/state', namespace));
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
 * 安全性判断には**使わない**（あちらは fail-closed が要件）。
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
