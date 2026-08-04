#!/usr/bin/env node
// harness-run.mjs — run 状態（実行単位）の作成・参照・更新 CLI。
//
// run 状態はリポジトリ外の永続領域に保存される（.claude/lib/harness-paths.mjs）。
// 使い方:
//   node .claude/scripts/harness-run.mjs start [--task-id <id>] [--force]
//   node .claude/scripts/harness-run.mjs show
//   node .claude/scripts/harness-run.mjs run-id
//   node .claude/scripts/harness-run.mjs set --phase <p> [--status <s>]
//   node .claude/scripts/harness-run.mjs gate --name <gate> --result <pass|fail|skip>
//   node .claude/scripts/harness-run.mjs where
//
// 秘密情報は保存しない。changedFiles / gateResults にパスとゲート名だけを記録する。

import { resolveStateDir } from '../lib/harness-paths.mjs';
import {
  PHASES,
  STATUSES,
  createRunState,
  loadRunState,
  saveRunState,
  updateRunState,
} from '../lib/harness-state.mjs';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

switch (command) {
  case 'start': {
    const existing = loadRunState();
    if (existing.ok && existing.state.status === 'active' && !args.force) {
      process.stdout.write(
        `既存の run を継続します: ${existing.state.runId}（作り直すには --force）\n`,
      );
      break;
    }
    const state = createRunState({
      taskId: typeof args['task-id'] === 'string' ? args['task-id'] : '',
    });
    const path = saveRunState(state);
    process.stdout.write(`run を開始しました: ${state.runId}\n保存先: ${path}\n`);
    break;
  }

  case 'show': {
    const result = loadRunState();
    if (!result.ok) fail(`run 状態を読めません（${result.reason}）: ${result.detail}`);
    process.stdout.write(`${JSON.stringify(result.state, null, 2)}\n`);
    break;
  }

  case 'run-id': {
    const result = loadRunState();
    if (!result.ok) fail(`run 状態を読めません（${result.reason}）: ${result.detail}`);
    process.stdout.write(`${result.state.runId}\n`);
    break;
  }

  case 'set': {
    const patch = {};
    if (typeof args.phase === 'string') {
      if (!PHASES.includes(args.phase)) fail(`phase が不正です（${PHASES.join(' | ')}）`);
      patch.phase = args.phase;
    }
    if (typeof args.status === 'string') {
      if (!STATUSES.includes(args.status)) fail(`status が不正です（${STATUSES.join(' | ')}）`);
      patch.status = args.status;
    }
    if (Object.keys(patch).length === 0) fail('--phase / --status のいずれかを指定してください');
    const next = updateRunState(patch);
    process.stdout.write(`更新しました: phase=${next.phase} status=${next.status}\n`);
    break;
  }

  case 'gate': {
    const name = args.name;
    const result = args.result;
    if (typeof name !== 'string' || typeof result !== 'string') {
      fail('--name <gate> --result <pass|fail|skip> を指定してください');
    }
    if (!['pass', 'fail', 'skip'].includes(result)) fail('--result は pass | fail | skip です');
    // 読み取りから書き込みまでを updateRunState のロック内で行う（lost update 防止）
    const next = updateRunState((state) => ({
      gateResults: {
        ...(state?.gateResults ?? {}),
        [name]: { result, at: new Date().toISOString() },
      },
    }));
    process.stdout.write(`ゲート結果を記録: ${name}=${result}（run ${next.runId}）\n`);
    break;
  }

  case 'where': {
    const resolved = resolveStateDir();
    process.stdout.write(
      `state dir: ${resolved.dir}\nsource: ${resolved.source}\ntrusted: ${resolved.trusted}\n`,
    );
    for (const warning of resolved.warnings) process.stdout.write(`warning: ${warning}\n`);
    break;
  }

  default:
    fail('usage: harness-run.mjs <start|show|run-id|set|gate|where> [options]');
}
