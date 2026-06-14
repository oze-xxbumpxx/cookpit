#!/usr/bin/env node
// PreToolUse Hook — 危険・破壊的・秘密情報アクセスの防止（§13.1）
//
// 方針:
// - 決定論的に判定できる危険操作だけをブロックする（exit 2 で deny、理由を stderr に出す）。
// - 誤検知を避けるため、日常的に正当な操作（rm -rf node_modules 等）はブロックしない。
//   破壊的 rm は「再帰+強制フラグ」かつ「壊滅的ターゲット（/, ~, $HOME, *, ., ..）」のみ deny。
// - settings.json の permissions.deny と二層で併用する（こちらは理由つきの動的判定）。
// - 一時的に無効化したい場合は settings.json の PreToolUse から本フックを外す（最終報告 §9）。
//
// 対象ツール: Bash（コマンド検査） / Read・Edit・Write・MultiEdit（秘密ファイル検査）。

import { readFileSync } from 'node:fs';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function deny(reason) {
  process.stderr.write(
    `⛔ 危険操作をブロックしました: ${reason}\n` +
      `この操作は人間の承認が必要です（本番影響・破壊的・秘密情報）。意図的な場合は手動で実行するか、\n` +
      `.claude/settings.json の PreToolUse から guard-dangerous を一時的に外してください。\n`
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

const READ_CMD =
  /\b(cat|less|more|head|tail|bat|nl|od|xxd|strings|grep|rg|awk|sed|cp|scp|rsync)\b/;

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

function checkBash(cmd) {
  if (typeof cmd !== 'string' || cmd.trim() === '') return;
  for (const d of ALWAYS_DENY) if (d.re.test(cmd)) deny(d.why);
  if (rmHasRecursiveForce(cmd) && rmHasCatastrophicTarget(cmd)) {
    deny('壊滅的な再帰削除（rm -rf で / ~ $HOME * . .. を対象）');
  }
  const secret = bashSecretRead(cmd);
  if (secret) deny(secret);
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

function main() {
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    process.exit(0);
  }
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};

  if (tool === 'Bash') checkBash(ti.command);
  else if (tool === 'Read' || tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') {
    if (isSecretPath(ti.file_path)) deny(`秘密情報ファイルへのアクセス: ${ti.file_path}`);
  }

  process.exit(0); // 危険でなければ許可
}

main();
