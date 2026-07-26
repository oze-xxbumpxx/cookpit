#!/usr/bin/env node
// harness-approve.mjs — 保護対象の変更に対する人間承認を発行する（人間専用）。
//
// **AI はこのスクリプトを実行できない。** guard-dangerous.mjs が、このスクリプト名・
// 状態ディレクトリ・承認ファイルに触れる Bash / Write 操作を deny する。
// 人間が自分の端末から直接実行することを想定している。
//
// 人間であることの確認（いずれか必須）:
//   1. 対話端末（TTY）で実行し、確認語を入力する。
//      → Claude Code などが実行する非対話シェルには TTY が無いため、この経路は通らない。
//   2. out-of-band に設定した HARNESS_APPROVAL_TOKEN と一致する --token を渡す。
//      → CI やリモートで人間が別経路からトークンを与える場合に使う。
//
// 使い方:
//   node .claude/scripts/harness-approve.mjs --target .claude/hooks/ [--ttl-minutes 15]
//   node .claude/scripts/harness-approve.mjs --target CLAUDE.md --token "$HARNESS_APPROVAL_TOKEN"
//   node .claude/scripts/harness-approve.mjs --revoke
//   node .claude/scripts/harness-approve.mjs --status
//
// 承認は runId・操作・対象パス・有効期限に束縛され、単回使用で失効する。

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  APPROVAL_SCHEMA_VERSION,
  MAX_APPROVAL_TTL_MS,
  OPERATION_CONFIG_CHANGE,
  PROTECTED_TARGETS,
  isProtectedPath,
  resolveApprovalPath,
  toRepoRelative,
} from '../lib/harness-approval.mjs';
import { atomicWriteJson } from '../lib/harness-state.mjs';
import { loadRunState } from '../lib/harness-state.mjs';
import { stateDir } from '../lib/harness-paths.mjs';

const CONFIRM_PHRASE = 'approve';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function readLineFromTty() {
  // /dev/tty から 1 行読む。パイプ経由の入力では失敗させたいため stdin ではなく tty を使う。
  try {
    const raw = readFileSync('/dev/tty', 'utf8');
    return raw.split('\n')[0]?.trim() ?? '';
  } catch {
    return null;
  }
}

function assertHumanPresence(args) {
  const expectedToken = process.env.HARNESS_APPROVAL_TOKEN;
  if (typeof args.token === 'string' && args.token !== '') {
    if (!expectedToken || expectedToken.trim() === '') {
      fail('HARNESS_APPROVAL_TOKEN が設定されていません（--token は使えません）');
    }
    if (args.token !== expectedToken) fail('--token が HARNESS_APPROVAL_TOKEN と一致しません');
    return 'token';
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail(
      '対話端末（TTY）でのみ承認を発行できます。\n' +
        'AI エージェントや CI の非対話シェルからは発行できません。\n' +
        '人間が端末から直接実行するか、HARNESS_APPROVAL_TOKEN を out-of-band に設定して --token を渡してください。',
      2,
    );
  }

  process.stdout.write(`承認する場合は「${CONFIRM_PHRASE}」と入力してください: `);
  const answer = readLineFromTty();
  if (answer !== CONFIRM_PHRASE) fail('確認語が一致しないため中止しました', 2);
  return 'tty';
}

const args = parseArgs(process.argv.slice(2));

const location = resolveApprovalPath();
if (!location.ok) {
  fail(
    `承認を保存できません（${location.reason}）: ${location.detail}\n` +
      'HARNESS_STATE_DIR にリポジトリ外の絶対パスを設定してください。',
  );
}

if (args.status) {
  if (!existsSync(location.approvalPath)) {
    process.stdout.write(`承認なし（${location.approvalPath}）\n`);
    process.exit(0);
  }
  process.stdout.write(`${readFileSync(location.approvalPath, 'utf8')}\n`);
  process.exit(0);
}

if (args.revoke) {
  assertHumanPresence(args);
  if (existsSync(location.approvalPath)) {
    rmSync(location.approvalPath, { force: true });
    process.stdout.write('承認を取り消しました\n');
  } else {
    process.stdout.write('取り消す承認はありません\n');
  }
  process.exit(0);
}

const target = typeof args.target === 'string' ? args.target : null;
if (target === null) {
  fail(
    `--target <path> を指定してください。保護対象:\n${PROTECTED_TARGETS.map((t) => `  - ${t}`).join('\n')}`,
  );
}

const relTarget = toRepoRelative(target);
if (!isProtectedPath(relTarget)) {
  fail(`--target が保護対象ではありません（承認は不要です）: ${relTarget}`);
}

const operation =
  typeof args.operation === 'string' ? args.operation : OPERATION_CONFIG_CHANGE;

const ttlMinutes = Number(args['ttl-minutes'] ?? 15);
if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) fail('--ttl-minutes は正の数で指定してください');
if (ttlMinutes * 60_000 > MAX_APPROVAL_TTL_MS) {
  fail(`--ttl-minutes は最大 ${MAX_APPROVAL_TTL_MS / 60_000} 分です`);
}

let runId = typeof args['run-id'] === 'string' ? args['run-id'] : null;
if (runId === null) {
  const run = loadRunState();
  if (!run.ok) {
    fail(
      `run 状態を読めないため承認を発行できません（${run.reason}）: ${run.detail}\n` +
        'node .claude/scripts/harness-run.mjs start を先に実行するか --run-id を指定してください。',
    );
  }
  runId = run.state.runId;
}

const method = assertHumanPresence(args);

const now = new Date();
const approval = {
  schemaVersion: APPROVAL_SCHEMA_VERSION,
  approvalId: randomUUID(),
  runId,
  operation,
  target: relTarget,
  approvedAt: now.toISOString(),
  expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
  approvedBy: 'human',
};

stateDir(); // mode 0700 で作成を保証
atomicWriteJson(location.approvalPath, approval);

process.stdout.write(
  `承認を発行しました（${method}）\n` +
    `  run:     ${approval.runId}\n` +
    `  操作:    ${approval.operation}\n` +
    `  対象:    ${approval.target}\n` +
    `  有効期限: ${approval.expiresAt}（${ttlMinutes} 分・単回使用）\n` +
    `  保存先:  ${location.approvalPath}\n`,
);
