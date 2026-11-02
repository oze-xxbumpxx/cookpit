// PreToolUse Hook — 危険・破壊的・秘密情報アクセス・Hook回避の防止
//
// 方針:
// - 決定論的に判定できる操作だけをブロックする（exit 2でdeny、理由をstderrに出す）。
// - 誤検知を避けるため、日常的に正当な操作（rm -rf node_modules等）はブロックしない。
//   破壊的rmは「再帰+強制フラグ」かつ「壊滅的ターゲット（/, ~, $HOME, *, ., .., ./, ../,
//   /var /etc /usr /opt /home）」のみdeny。
// - 読み取り・調査は妨げない。
//
// 保護ファイルの人間承認層は撤去した。個人開発では承認する人とされる人が同一であり、
// 承認ファイルが実行中コンテナ内に置かれるためリモートから発行できず、ハーネスが自分自身の
// 修正を拒否するデッドロックを生んでいた。構成変更の承認境界は **PRレビュー**が担う。
// 詳細はdocs/claude-code/improvement-cycle.md（承認境界はPRレビュー）。
//
// 限界（隠さない）: 同一OSユーザーで任意シェルを実行できる相手に対し、文字列マッチングは
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

// ── Bashコマンド判定 ───────────────────────────────────────────────
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
    /\s\.\.?\/?(\s|$)/.test(cmd) || // " ." / " .." / " ./" / " ../"
    /\s\/(var|etc|usr|opt|home)\b/.test(cmd)
  );
}

const ALWAYS_DENY = [
  { re: /\bgit\s+push\b[^\n]*\s(--force\b|-f\b)/, why: 'force push（git push --force / -f）' },
  { re: /\bgit\s+reset\s+--hard\b/, why: 'git reset --hard（作業破棄）' },
  {
    re: /\bgit\s+clean\b[^\n]*-[a-zA-Z]*[fd]/,
    why: 'git clean（未追跡ファイルの削除）',
    allowIf: /(?:\s)-(?:[a-zA-Z]*n[a-zA-Z]*|--dry-run)\b/,
  },
  {
    re: /\bgit\s+(checkout|restore)(?:\s+--)?\s+\.(?:\s|$)/,
    why: '作業ツリー全体の変更破棄（git checkout/restore .）',
  },
  {
    re: /\bgit\s+(checkout|restore)\s+\S+\s+--\s+\.(?:\s|$)/,
    why: '作業ツリー全体の変更破棄（git checkout/restore -- .）',
  },
  { re: /\bgit\s+stash\s+(drop|clear)\b/, why: 'stash の破棄' },
  { re: /\bgit\s+branch\s+-D\b/, why: 'ブランチの強制削除' },
  { re: /\bgit\s+push\b[^\n]*(--delete|:refs\/heads\/)/, why: 'リモートブランチの削除' },
  { re: /\b(npm|pnpm|yarn)\s+publish\b/, why: 'パッケージ公開（publish）' },
  { re: /\bterraform\s+(apply|destroy)\b/, why: '本番インフラ変更（terraform apply/destroy）' },
  { re: /\b(serverless|sls|sst)\s+deploy\b/, why: '本番デプロイ（serverless/sst deploy）' },
  { re: /\bvercel\b[^\n]*--prod\b/, why: '本番デプロイ（vercel --prod）' },
  { re: /\bkubectl\s+(apply|delete)\b[^\n]*prod/i, why: '本番 Kubernetes 変更' },
  { re: /\baws\s+deploy\b/, why: 'AWS 本番操作（aws deploy）' },
  { re: /\baws\s+cloudformation\s+deploy\b/, why: 'AWS 本番操作（cloudformation deploy）' },
  { re: /\baws\s+s3\s+(rm|rb)\b/, why: 'AWS S3 削除（s3 rm / rb）' },
  {
    re: /\baws\s+\S+\s+(delete-[a-z0-9-]+|terminate-[a-z0-9-]+)\b/i,
    why: 'AWS 削除・停止操作',
  },
  {
    re: /(?:AWS_PROFILE\s*=\s*|(?:^|[\s])--profile\s+)['"]?(prod|production)\b/i,
    why: '本番 AWS プロファイル',
  },
  {
    re: /\bsequelize(-cli)?\s+db:drop\b/i,
    require: /\b(prod|production)\b/i,
    why: '本番 DB の破壊操作（sequelize db:drop）',
  },
  {
    re: /\bprisma\s+migrate\s+reset\b/i,
    require: /\b(prod|production)\b/i,
    why: '本番 DB の破壊操作（prisma migrate reset）',
  },
  {
    re: /\bdrop\s+(database|schema)\b/i,
    require: /\b(prod|production)\b/i,
    why: '本番 DB の破壊操作（DROP DATABASE）',
  },
  {
    re: /\bdropdb\b/i,
    require: /\b(prod|production)\b/i,
    why: '本番 DB の破壊操作（dropdb）',
  },
  { re: /\bDATABASE_URL=[^\s]*prod/i, why: '本番 DB への接続文字列' },
];

// ローカルHook（lefthook）の回避。ローカルHookは早期フィードバック層であり、
// 最終ゲートはCIが担うが、回避操作は検出して止める。
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
  if (/(?:^|\/|[\s"'`])(?:\.\/)?(secrets?|credentials?)(?:\/|\s|$|["'`])/i.test(cmd)) {
    const looksLikeDoc =
      /(?:^|\/|[\s"'`])(?:\.\/)?(secrets?|credentials?)\/[^\s"'`]*\.(md|markdown|txt)\b/i.test(
        cmd,
      );
    const looksLikeSecretFile = /\.(json|ya?ml|env|pem|key)\b/i.test(cmd);
    if (!looksLikeDoc || looksLikeSecretFile) return 'secrets/credentials 読み取り';
  }
  if (/\.aws\/credentials\b/.test(cmd)) return 'AWS 認証情報 読み取り';
  if (/\.npmrc\b/.test(cmd)) return '.npmrc 読み取り';
  return null;
}

function checkBash(cmd) {
  if (typeof cmd !== 'string' || cmd.trim() === '') return;
  for (const d of ALWAYS_DENY) {
    if (!d.re.test(cmd)) continue;
    if (d.allowIf && d.allowIf.test(cmd)) continue;
    if (d.require && !d.require.test(cmd)) continue;
    deny(d.why);
  }
  for (const d of HOOK_BYPASS_DENY) {
    if (d.re.test(cmd)) {
      deny(
        d.why,
        'ローカル Hook は早期フィードバック層です。回避せず、失敗の内容を修正してください。',
      );
    }
  }
  if (rmHasRecursiveForce(cmd) && rmHasCatastrophicTarget(cmd)) {
    deny('壊滅的な再帰削除（rm -rf で / ~ $HOME * . .. ./ ../ /var /etc /usr /opt /home を対象）');
  }
  const secret = bashSecretRead(cmd);
  if (secret) deny(secret);
}

// ── 秘密ファイルへのRead/Edit/Write判定 ──────────────────────────
function isSecretDirFile(p) {
  const m = p.match(/(?:^|\/)(secrets?|credentials?)(?:\/(.*))?$/i);
  if (!m) return false;
  const rest = m[2];
  if (!rest) return true;
  const name = rest.split('/').pop() || '';
  if (/\.(json|ya?ml|env|pem|key)$/i.test(name)) return true;
  if (!/\.[A-Za-z0-9]+$/.test(name)) return true;
  return false;
}

function isSecretPath(p) {
  if (typeof p !== 'string') return false;
  if (/\.env\.(example|sample|template|dist)$/.test(p)) return false; // テンプレは可
  return (
    /(^|\/)\.env(\.[\w-]+)?$/.test(p) ||
    /\.pem$/.test(p) ||
    /(^|\/)id_rsa(\.pub)?$/.test(p) ||
    /(^|\/)\.npmrc$/.test(p) ||
    isSecretDirFile(p) ||
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
