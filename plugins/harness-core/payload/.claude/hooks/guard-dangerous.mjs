// PreToolUse Hook — 危険・破壊的・秘密情報アクセス・Hook 回避の防止
//
// 方針:
// - 決定論的に判定できる操作だけをブロックする（exit 2 で deny、理由を stderr に出す）。
// - 誤検知を避けるため、日常的に正当な操作（rm -rf node_modules 等）はブロックしない。
//   破壊的 rm は「再帰+強制フラグ」かつ「壊滅的ターゲット（/, ~, $HOME, *, ., ..）」のみ deny。
// - 読み取り・調査は妨げない。
//
// 保護ファイルの人間承認層は撤去した。個人開発では承認する人とされる人が同一であり、
// 承認ファイルが実行中コンテナ内に置かれるためリモートから発行できず、ハーネスが自分自身の
// 修正を拒否するデッドロックを生んでいた。構成変更の承認境界は **PR レビュー**が担う。
// 詳細は docs/claude-code/harness-state.md。
//
// 限界（隠さない）: 同一 OS ユーザーで任意シェルを実行できる相手に対し、文字列マッチングは
// 難読化で回避されうる。本フックは事故を防ぐ層であり、認証境界ではない。
//
// 対象ツール: Bash（コマンド検査） / Read・Edit・Write・MultiEdit・NotebookEdit（パス検査）。

import { readFileSync } from 'node:fs';

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
      `この操作は人間の確認が必要です（本番影響・破壊的・秘密情報）。\n`,
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
// 最終ゲートは CI が担うが、回避操作は検出して止める。
const HOOK_BYPASS_DENY = [
  { re: /--no-verify\b/, why: 'Git Hook の回避（--no-verify）' },
  { re: /\bLEFTHOOK\s*=\s*0\b/, why: 'Git Hook の無効化（LEFTHOOK=0）' },
  { re: /\bHUSKY\s*=\s*0\b/, why: 'Git Hook の無効化（HUSKY=0）' },
  { re: /\bSKIP\s*=\S*\s+git\b/, why: 'Git Hook のスキップ（SKIP=... git ...）' },
  { re: /\bgit\s+config\b[^\n]*core\.hooksPath/, why: 'Git Hook パスの変更（core.hooksPath）' },
];

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
  const raw = readStdin();
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    process.exit(0); // 解析不能な入力で通常操作を妨げない
  }

  const tool = input.tool_name || '';
  const ti = input.tool_input || {};

  if (tool === 'Bash') {
    checkBash(ti.command);
  } else if (['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const filePath = ti.file_path ?? ti.notebook_path;
    if (isSecretPath(filePath)) deny(`秘密情報ファイルへのアクセス: ${filePath}`);
  }

  process.exit(0); // 危険でなければ許可
}

main();
