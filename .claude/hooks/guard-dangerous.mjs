#!/usr/bin/env node
// PreToolUse Hook — 危険・破壊的・秘密情報アクセス・保護対象変更・Hook 回避の防止
//
// 方針:
// - 決定論的に判定できる操作だけをブロックする（exit 2 で deny、理由を stderr に出す）。
// - 誤検知を避けるため、日常的に正当な操作（rm -rf node_modules 等）はブロックしない。
//   破壊的 rm は「再帰+強制フラグ」かつ「壊滅的ターゲット（/, ~, $HOME, *, ., ..）」のみ deny。
// - **保護対象の変更は fail-closed**。承認が無い・壊れている・照合できない場合はすべて拒否する。
//   承認の検証は .claude/lib/harness-approval.mjs（唯一の正典）へ委譲する。
// - AI は承認を「読み取る」ことはできるが「発行・変更・取消」はできない。承認ファイル・
//   状態ディレクトリ・発行スクリプトに触れる Bash / Write は経路を問わず deny する。
// - 読み取り・調査は妨げない（リスク別の fail-closed）。
//
// 限界（隠さない）: 同一 OS ユーザーで任意シェルを実行できる相手に対し、文字列マッチングは
// 難読化で回避されうる。本フックは事故と安易な自己承認を排除する層であり、暗号学的な
// 認証境界ではない。詳細は docs/claude-code/harness-state-and-approval.md §7。
//
// 対象ツール: Bash（コマンド検査） / Read・Edit・Write・MultiEdit・NotebookEdit（パス検査）。

import { readFileSync } from 'node:fs';
import { isInside, legacyStateDir, repoRoot, resolveStateDir } from '../lib/harness-paths.mjs';
import {
  OPERATION_CONFIG_CHANGE,
  consumeApproval,
  describeRejection,
  isProtectedPath,
  toRepoRelative,
  verifyApproval,
} from '../lib/harness-approval.mjs';
import { loadRunState } from '../lib/harness-state.mjs';

const ROOT = repoRoot();

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function deny(reason, extra = '') {
  process.stderr.write(
    `⛔ 危険操作をブロックしました: ${reason}\n` +
      (extra ? `${extra}\n` : '') +
      `この操作は人間の承認が必要です（本番影響・破壊的・秘密情報・保護対象）。\n`,
  );
  process.exit(2);
}

// ── Bash コマンド判定 ───────────────────────────────────────────────
function rmHasRecursiveForce(cmd) {
  const m = cmd.match(/\brm\s+((?:-\S+\s+)+)/);
  if (m) return /r/.test(m[1]) && /f/.test(m[1]);
  return false;
}
function rmHasCatastrophicTarget(cmd) {
  return (
    /\s\/(\s|$)/.test(cmd) || // " / "
    /\s\/\*/.test(cmd) || // " /*"
    /\s~(\/|\s|$)/.test(cmd) || // " ~" / " ~/"
    /\$HOME\b/.test(cmd) || // $HOME
    /\s\*(\s|$)/.test(cmd) || // " * "
    /\s\.\.?(\s|$)/.test(cmd) // " ." / " .."
  );
}

const ALWAYS_DENY = [
  { re: /\bgit\s+push\b[^\n]*\s(--force\b|-f\b)/, why: 'force push（git push --force / -f）' },
  { re: /\bgit\s+reset\s+--hard\b/, why: 'git reset --hard（作業破棄）' },
  { re: /\b(npm|pnpm|yarn)\s+publish\b/, why: 'パッケージ公開（publish）' },
  { re: /\bterraform\s+(apply|destroy)\b/, why: '本番インフラ変更（terraform apply/destroy）' },
  { re: /\b(serverless|sls|sst)\s+deploy\b/, why: '本番デプロイ（serverless/sst deploy）' },
  { re: /\bvercel\b[^\n]*--prod\b/, why: '本番デプロイ（vercel --prod）' },
  { re: /\bkubectl\s+(apply|delete)\b[^\n]*prod/i, why: '本番 Kubernetes 変更' },
  { re: /\baws\s+(deploy|s3\s+rm|cloudformation\s+(deploy|delete))\b/, why: 'AWS 本番操作' },
];

// ローカル Hook（lefthook）の回避。ローカル Hook は早期フィードバック層であり、
// 最終ゲートは CI が担うが、回避操作は検出して止める（docs/claude-code/harness-state-and-approval.md §6）。
const HOOK_BYPASS_DENY = [
  { re: /--no-verify\b/, why: 'Git Hook の回避（--no-verify）' },
  { re: /\bLEFTHOOK\s*=\s*0\b/, why: 'Git Hook の無効化（LEFTHOOK=0）' },
  { re: /\bHUSKY\s*=\s*0\b/, why: 'Git Hook の無効化（HUSKY=0）' },
  { re: /\bSKIP\s*=\S*\s+git\b/, why: 'Git Hook のスキップ（SKIP=... git ...）' },
  { re: /\bgit\s+config\b[^\n]*core\.hooksPath/, why: 'Git Hook パスの変更（core.hooksPath）' },
];

// 承認・状態の「面」に触れる操作。読み取り専用の入口（harness-run.mjs）以外は経路を問わず deny。
const APPROVAL_SURFACE_TOKENS = [
  'harness-approve',
  'config-change-approved',
  'approval.json',
  'used-approvals',
  'run-state.json',
];

// 状態ディレクトリを差し替えて検証を欺く経路を塞ぐ
const STATE_ENV_OVERRIDE =
  /\b(HARNESS_STATE_DIR|XDG_STATE_HOME|HARNESS_APPROVAL_TOKEN)\s*=/;

function currentStateDir() {
  try {
    return resolveStateDir().dir;
  } catch {
    return null;
  }
}

function bashTouchesApprovalSurface(cmd) {
  for (const token of APPROVAL_SURFACE_TOKENS) {
    if (cmd.includes(token)) return `承認・実行状態への操作（${token}）`;
  }
  if (STATE_ENV_OVERRIDE.test(cmd)) return '状態ディレクトリ・承認トークンを差し替える環境変数の設定';
  const stateDirPath = currentStateDir();
  if (stateDirPath && cmd.includes(stateDirPath)) return '状態ディレクトリへの直接操作';
  if (cmd.includes(legacyStateDir(ROOT)) || cmd.includes('.claude/state')) {
    return '状態ディレクトリへの直接操作（.claude/state）';
  }
  return null;
}

const READ_CMD = /\b(cat|less|more|head|tail|bat|nl|od|xxd|strings|grep|rg|awk|sed|cp|scp|rsync)\b/;

function bashSecretRead(cmd) {
  if (/\bprintenv\b/.test(cmd)) return 'printenv（環境変数の露出）';
  if (!READ_CMD.test(cmd)) return null;
  if (/\.env\.(example|sample|template|dist)\b/.test(cmd)) return null; // テンプレは可
  if (/(^|\s|\/|=|"|')\.env(\.[\w-]+)?(\s|$|"|')/.test(cmd)) return '.env 読み取り';
  if (/\.pem\b/.test(cmd)) return '秘密鍵(.pem)読み取り';
  if (/\bid_rsa\b/.test(cmd)) return 'SSH 秘密鍵 読み取り';
  if (/\/(secrets?|credentials?)\b/i.test(cmd)) return 'secrets/credentials 読み取り';
  if (/\.aws\/credentials\b/.test(cmd)) return 'AWS 認証情報 読み取り';
  if (/\.npmrc\b/.test(cmd)) return '.npmrc 読み取り';
  return null;
}

// Bash 経由で保護対象へ「書き込む」経路だけを検出する。
// 読み取り・実行（cat / rg / bash script.sh）や `2>&1` のような fd 複製は妨げない
// （単にパスを含むだけで deny すると、ハーネススクリプトの実行自体ができなくなる）。
function normalizeToken(token) {
  if (!token) return null;
  return token.replace(/^["']|["']$/g, '');
}

function protectedWriteTargets(cmd) {
  const hits = [];
  const check = (token) => {
    const cleaned = normalizeToken(token);
    if (!cleaned) return;
    const rel = toRepoRelative(cleaned, ROOT);
    if (rel && isProtectedPath(rel, ROOT)) hits.push(rel);
  };

  // 1) リダイレクト先（> f / >> f / 2> f）。`2>&1` のような fd 複製は (?!&) で除外する
  for (const m of cmd.matchAll(/(?:^|\s)\d?>>?\s*(?!&)("[^"]*"|'[^']*'|[^\s"';|&()]+)/g)) {
    check(m[1]);
  }
  // 2) tee の出力先
  for (const m of cmd.matchAll(/\btee\b((?:\s+-\S+)*)((?:\s+[^\s"';|&()]+)*)/g)) {
    for (const t of (m[2] || '').trim().split(/\s+/)) check(t);
  }
  // 3) 全引数が対象になる書き込み系
  for (const m of cmd.matchAll(/\b(touch|truncate|chmod|chown|rm)\b([^|;&]*)/g)) {
    for (const t of m[2].trim().split(/\s+/)) if (t && !t.startsWith('-')) check(t);
  }
  // 4) 最後の非フラグ引数が宛先になる系
  for (const m of cmd.matchAll(/\b(cp|mv|install|ln)\b([^|;&]*)/g)) {
    const args = m[2]
      .trim()
      .split(/\s+/)
      .filter((t) => t && !t.startsWith('-'));
    check(args[args.length - 1]);
  }
  // 5) インプレース編集
  for (const m of cmd.matchAll(/\b(sed|perl)\s+-i\S*([^|;&]*)/g)) {
    for (const t of m[2].trim().split(/\s+/)) if (t && !t.startsWith('-')) check(t);
  }
  return hits;
}

function bashWritesProtected(cmd) {
  const hits = protectedWriteTargets(cmd);
  return hits.length > 0 ? `保護対象への書き込み（${hits[0]}）` : null;
}

// インタープリタのインライン実行（node -e / python -c 等）は、書き込み先を静的に
// 特定できない。保護対象パスに言及していたら書き込みとみなして拒否する
// （2026-07-26 の再監査で、リテラルの保護対象パスを含む node -e が素通りしていた）。
const INLINE_INTERPRETER =
  /\b(node|nodejs|deno|bun|python|python3|ruby|perl|php|osascript)\b[^|;&]*?\s(-e|-c|-p|--eval|--exec)\b/;

function bashInlineInterpreterTouchesProtected(cmd) {
  if (!INLINE_INTERPRETER.test(cmd)) return null;
  for (const token of cmd.split(/[\s"';|&()`,]+/)) {
    const cleaned = normalizeToken(token);
    if (!cleaned) continue;
    const rel = toRepoRelative(cleaned, ROOT);
    if (rel && isProtectedPath(rel, ROOT)) {
      return `インタープリタ経由の保護対象操作（${rel}）`;
    }
  }
  return null;
}

// パッチ適用・チェックアウトによる保護対象の書き換え。
// パッチや stash は内容を安価に検証できないため、保護対象を含みうるものとして拒否する
// （fail-closed）。明示パスがすべて非保護の restore / checkout は妨げない。
const PATCH_APPLY_RE =
  /\bgit\s+(apply|am)\b|\bgit\s+stash\s+(pop|apply)\b|\bgit\s+checkout\b[^\n]*\s--\s|\bgit\s+restore\b/;

function bashPatchApplyRisk(cmd) {
  if (!PATCH_APPLY_RE.test(cmd)) return null;
  const opaque =
    /\.(patch|diff)\b/.test(cmd) ||
    /\bgit\s+(apply|am)\b/.test(cmd) ||
    /\bgit\s+stash\s+(pop|apply)\b/.test(cmd);
  if (opaque) {
    return 'パッチ適用・stash 復元（内容を検証できず保護対象を含みうる）';
  }
  for (const token of cmd.split(/[\s"';|&()]+/)) {
    const cleaned = normalizeToken(token);
    if (!cleaned) continue;
    const rel = toRepoRelative(cleaned, ROOT);
    if (rel && isProtectedPath(rel, ROOT)) {
      return `保護対象の復元・チェックアウト（${rel}）`;
    }
  }
  return null;
}

function checkBash(cmd) {
  if (typeof cmd !== 'string' || cmd.trim() === '') return;
  for (const d of ALWAYS_DENY) if (d.re.test(cmd)) deny(d.why);
  for (const d of HOOK_BYPASS_DENY) {
    if (d.re.test(cmd)) {
      deny(
        d.why,
        'ローカル Hook は早期フィードバック層です。回避せず、失敗の内容を修正してください。',
      );
    }
  }
  const surface = bashTouchesApprovalSurface(cmd);
  if (surface) {
    deny(
      surface,
      '承認の発行・変更・取消は人間のみが行えます（.claude/scripts/harness-approve.mjs を\n' +
        '人間が端末から実行）。承認状態の確認は node .claude/scripts/harness-run.mjs approval-status。',
    );
  }
  if (rmHasRecursiveForce(cmd) && rmHasCatastrophicTarget(cmd)) {
    deny('壊滅的な再帰削除（rm -rf で / ~ $HOME * . .. を対象）');
  }
  const secret = bashSecretRead(cmd);
  if (secret) deny(secret);
  const protectedWrite = bashWritesProtected(cmd);
  if (protectedWrite) {
    deny(protectedWrite, '保護対象の変更には人間承認が必要です（§保護対象）。');
  }
  const inlineRisk = bashInlineInterpreterTouchesProtected(cmd);
  if (inlineRisk) {
    deny(inlineRisk, '保護対象の変更には人間承認が必要です（§保護対象）。');
  }
  const patchRisk = bashPatchApplyRisk(cmd);
  if (patchRisk) {
    deny(patchRisk, '保護対象を書き換えうる操作です。人間が端末から実行してください。');
  }
}

// ── 秘密ファイルへの Read/Edit/Write 判定 ──────────────────────────
function isSecretPath(p) {
  if (typeof p !== 'string') return false;
  if (/\.env\.(example|sample|template|dist)$/.test(p)) return false; // テンプレは可
  return (
    /(^|\/)\.env(\.[\w-]+)?$/.test(p) ||
    /\.pem$/.test(p) ||
    /(^|\/)id_rsa(\.pub)?$/.test(p) ||
    /(^|\/)\.npmrc$/.test(p) ||
    /\/(secrets?|credentials?)(\/|$)/i.test(p) ||
    /\.aws\/credentials$/.test(p)
  );
}

// ── 状態・承認ファイルへの書き込み判定 ────────────────────────────
function isStateWritePath(p) {
  if (typeof p !== 'string' || p === '') return false;
  for (const token of APPROVAL_SURFACE_TOKENS) {
    if (p.includes(token)) return true;
  }
  const stateDirPath = currentStateDir();
  if (stateDirPath && isInside(stateDirPath, p)) return true;
  const rel = toRepoRelative(p, ROOT);
  return typeof rel === 'string' && rel.startsWith('.claude/state');
}

// ── 保護対象への書き込み判定（承認検証） ──────────────────────────
function checkProtectedWrite(filePath) {
  const rel = toRepoRelative(filePath, ROOT);
  if (rel === null || !isProtectedPath(rel, ROOT)) return;

  const run = loadRunState();
  const runId = run.ok ? run.state.runId : null;

  const result = verifyApproval({
    operation: OPERATION_CONFIG_CHANGE,
    target: rel,
    runId,
  });

  if (!result.ok) {
    deny(
      `保護対象の未承認の変更: ${rel}`,
      `理由: ${describeRejection(result)}\n` +
        '人間が端末から次を実行して承認してください（AI は実行できません）:\n' +
        `  node .claude/scripts/harness-run.mjs start\n` +
        `  node .claude/scripts/harness-approve.mjs --target ${rel}`,
    );
  }

  // 再利用条件: ファイル完全一致の承認は単回使用（ここで消費）。
  // ディレクトリ前置一致の承認は同一 run・期限内に限り再利用できる（バッチ変更のため）。
  if (!result.approval.target.endsWith('/')) {
    consumeApproval(result);
  }
}

// 解析できない入力は「保護対象に触れるかどうか」で扱いを分ける（リスク別 fail-closed）。
// 通常の読み取り・調査まで止めない一方、保護対象・承認面に言及する不明な入力は拒否する。
function checkUnparseableInput(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return;
  const markers = [
    ...APPROVAL_SURFACE_TOKENS,
    '.claude/state',
    'CLAUDE.md',
    'AGENTS.md',
    'lefthook.yml',
    '.claude/agents/',
    '.claude/hooks/',
    '.claude/lib/',
    '.claude/rules/',
    '.claude/scripts/',
    '.claude/skills/',
    '.claude/settings',
    '.claude/tests/',
    '.github/workflows/',
    '.github/actions/',
  ];
  for (const marker of markers) {
    if (raw.includes(marker)) {
      deny(
        `フック入力を解析できないうえ、保護対象に言及しています（${marker}）`,
        '安全側に倒して拒否しました。操作をやり直してください。',
      );
    }
  }
}

function main() {
  const raw = readStdin();
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    checkUnparseableInput(raw);
    process.exit(0); // 保護対象と無関係な解析不能入力は通常操作を妨げない
  }

  const tool = input.tool_name || '';
  const ti = input.tool_input || {};

  if (tool === 'Bash') {
    checkBash(ti.command);
  } else if (['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const filePath = ti.file_path ?? ti.notebook_path;
    if (isSecretPath(filePath)) deny(`秘密情報ファイルへのアクセス: ${filePath}`);
    if (tool !== 'Read') {
      if (isStateWritePath(filePath)) {
        deny(
          `実行状態・承認ファイルへの書き込み: ${filePath}`,
          '承認の発行・変更・取消は人間のみが行えます。',
        );
      }
      checkProtectedWrite(filePath);
    }
  }

  process.exit(0); // 危険でなければ許可
}

main();
