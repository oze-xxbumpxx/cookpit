#!/usr/bin/env node
// タスク単位の機械メトリクス集計 — 所要時間・トークン・Agent 呼び出し・品質ゲート結果。
//
// 使い方:
//   node .claude/scripts/collect-task-metrics.mjs --feature <name> [options]
//
// オプション:
//   --feature <name>        必須。ブランチ名の部分一致フィルタの既定値にもなる
//   --branch <substr>       ブランチフィルタ（部分一致・複数可）。指定時は既定を置き換える
//   --task-id <TASK-...>    --write 時の出力先 docs/claude-code/improvements/metrics/<task-id>.yml
//   --out <path>            出力先の明示指定（--task-id より優先）
//   --since / --until       集計期間 YYYY-MM-DD（HARNESS_TZ（旧 COOKPIT_TZ）の日付・両端含む）
//   --exclude-session <id>  誤って紐付いたセッションを除外（複数可）
//   --write                 YAML の machine: セクションへマージ（無指定なら stdout に表示のみ）
//   --transcript-dir <dir>  transcript ディレクトリ上書き（既定: ~/.claude/projects/<プロジェクト slug>）
//
// 入力ソース:
//   1. セッション transcript（~/.claude/projects/<slug>/*.jsonl と <session-id>/subagents/agent-*.jsonl）
//      → トークン（usage）・所要時間（タイムスタンプ）・ツール/Agent 呼び出し
//   2. .claude/state/quality-gates-log.jsonl（run-quality-gates.sh が追記）
//      → ゲート実行/FAIL 回数（手戻りプロキシ）
//
// タスクへの紐付け:
//   セッションは「いずれかの行の gitBranch がフィルタに部分一致」または
//   「subagent-log.jsonl の feature が一致」でタスクに帰属させ、セッション丸ごと集計する
//   （1 セッション ≒ 1 タスク運用が前提。外れたら --exclude-session で除外する）。
//
// 集計の注意:
//   - usage は同一 message.id の行で重複するため message.id 単位で 1 回だけ数える。
//   - 所要時間は連続イベント間隔を GAP_CAP_MIN（既定 30 分）で打ち切った「活動時間」。
//     estimate-session-time.mjs と同じ方式。並行セッションは壁時計時間より大きくなり得る。
//   - transcript はローカルマシンにしか残らない。セッションを跨ぐ・環境を破棄する前に
//     --write で YAML へ固定化する（machine.sessions / machine.gate_history は
//     session_id / ts でマージするため再実行・環境替えをまたいで累積できる）。
//   - 意味的な手戻り（requirement/design_rework・user_corrections 等）は機械判定しない。
//     従来どおり reflection-agent / 人間が YAML の該当欄を埋める。

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
// 状態ファイルは永続領域（リポジトリ外）を優先し、旧 .claude/state/ もフォールバックで読む
import { resolveReadablePath } from '../lib/harness-paths.mjs';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
// COOKPIT_* は旧名（後方互換）。新規は HARNESS_* を使う。
const TZ = process.env.HARNESS_TZ || process.env.COOKPIT_TZ || 'Asia/Tokyo';
const GAP_CAP_MIN = Number(
  process.env.HARNESS_GAP_CAP_MIN || process.env.COOKPIT_GAP_CAP_MIN || 30,
);

function dayInTz(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}

// ---- 引数パース -------------------------------------------------------------

const args = {
  feature: null,
  branches: [],
  taskId: null,
  out: null,
  since: null,
  until: null,
  excludeSessions: [],
  write: false,
  transcriptDir: null,
};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--feature') args.feature = next();
    else if (a === '--branch') args.branches.push(next());
    else if (a === '--task-id') args.taskId = next();
    else if (a === '--out') args.out = next();
    else if (a === '--since') args.since = next();
    else if (a === '--until') args.until = next();
    else if (a === '--exclude-session') args.excludeSessions.push(next());
    else if (a === '--write') args.write = true;
    else if (a === '--transcript-dir') args.transcriptDir = next();
    else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
}
if (!args.feature) {
  console.error(
    'usage: collect-task-metrics.mjs --feature <name> [--branch <substr>]... [--task-id <id>] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--exclude-session <id>]... [--write] [--out <path>] [--transcript-dir <dir>]',
  );
  process.exit(2);
}
for (const d of [args.since, args.until]) {
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    console.error(`invalid date: ${d}（YYYY-MM-DD で指定）`);
    process.exit(2);
  }
}
const branchFilters = args.branches.length > 0 ? args.branches : [args.feature];

// Claude Code の projects ディレクトリ slug はプロジェクト絶対パスの英数字以外を '-' にしたもの
const transcriptDir =
  args.transcriptDir || join(homedir(), '.claude/projects', ROOT.replace(/[^a-zA-Z0-9-]/g, '-'));

function inRange(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return false;
  const day = dayInTz(d);
  if (args.since && day < args.since) return false;
  if (args.until && day > args.until) return false;
  return true;
}

function parseJsonl(path) {
  const out = [];
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // 壊れた行は無視
    }
  }
  return out;
}

// ---- 1. タスクに帰属するセッションの特定 -------------------------------------

// subagent-log の feature 一致でセッションを直接紐付け（current-feature 運用時）
const featureSessionIds = new Set();
for (const rec of parseJsonl(resolveReadablePath('subagent-log.jsonl') ?? '')) {
  if (rec.feature === args.feature && rec.session_id) featureSessionIds.add(rec.session_id);
}

const sessionFiles = existsSync(transcriptDir)
  ? readdirSync(transcriptDir).filter((f) => f.endsWith('.jsonl'))
  : [];
if (!existsSync(transcriptDir)) {
  console.error(`⚠ transcript ディレクトリが見つかりません: ${transcriptDir}`);
}

const sessions = [];
for (const file of sessionFiles) {
  const sessionId = file.replace(/\.jsonl$/, '');
  if (args.excludeSessions.some((x) => sessionId.startsWith(x))) continue;

  const mainLines = parseJsonl(join(transcriptDir, file));
  const branches = new Set();
  for (const o of mainLines) {
    if (o.gitBranch) branches.add(o.gitBranch);
  }
  const branchMatched = [...branches].some((b) => branchFilters.some((f) => b.includes(f)));
  if (!branchMatched && !featureSessionIds.has(sessionId)) continue;

  // Subagent transcript（トークンの大半はここで消費される）も同一セッションとして合算する
  const subagentDir = join(transcriptDir, sessionId, 'subagents');
  const subagentLines = [];
  const agentCalls = {};
  if (existsSync(subagentDir)) {
    for (const f of readdirSync(subagentDir)) {
      if (f.endsWith('.jsonl')) subagentLines.push(...parseJsonl(join(subagentDir, f)));
      if (f.endsWith('.meta.json')) {
        try {
          const meta = JSON.parse(readFileSync(join(subagentDir, f), 'utf8'));
          if (meta.agentType) agentCalls[meta.agentType] = (agentCalls[meta.agentType] || 0) + 1;
        } catch {
          // meta が読めなければ transcript 側のフォールバックに任せる
        }
      }
    }
  }

  const tokens = { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
  const seenMessageIds = new Set();
  const timestamps = [];
  const models = new Set();
  let toolUses = 0;
  let userPrompts = 0;
  const agentCallsFromToolUse = {};

  for (const o of [...mainLines, ...subagentLines]) {
    if (!o.timestamp || !inRange(o.timestamp)) continue;
    timestamps.push(new Date(o.timestamp).getTime());

    if (o.type === 'assistant' && o.message) {
      const u = o.message.usage;
      const msgId = o.message.id || o.requestId || o.uuid;
      // 1 応答が content block ごとに複数行へ分割され usage が重複するため message 単位で 1 回だけ数える
      if (u && msgId && !seenMessageIds.has(msgId)) {
        seenMessageIds.add(msgId);
        tokens.input += u.input_tokens || 0;
        tokens.output += u.output_tokens || 0;
        tokens.cache_creation += u.cache_creation_input_tokens || 0;
        tokens.cache_read += u.cache_read_input_tokens || 0;
        if (o.message.model) models.add(o.message.model);
      }
      if (Array.isArray(o.message.content)) {
        for (const c of o.message.content) {
          if (c.type !== 'tool_use') continue;
          toolUses++;
          if ((c.name === 'Agent' || c.name === 'Task') && c.input?.subagent_type) {
            agentCallsFromToolUse[c.input.subagent_type] =
              (agentCallsFromToolUse[c.input.subagent_type] || 0) + 1;
          }
        }
      }
    } else if (o.type === 'user' && !o.isSidechain && o.message) {
      const content = o.message.content;
      const isPrompt =
        typeof content === 'string' ||
        (Array.isArray(content) &&
          content.some((c) => c.type === 'text') &&
          !content.some((c) => c.type === 'tool_result'));
      if (isPrompt) userPrompts++;
    }
  }

  if (timestamps.length === 0) continue; // 期間外のみのセッション

  timestamps.sort((a, b) => a - b);
  let activeMs = 0;
  for (let i = 1; i < timestamps.length; i++) {
    activeMs += Math.min(timestamps[i] - timestamps[i - 1], GAP_CAP_MIN * 60_000);
  }

  sessions.push({
    id: sessionId,
    date: dayInTz(new Date(timestamps[0])),
    branches: [...branches].sort(),
    matched_by: branchMatched ? 'branch' : 'subagent-log',
    active_minutes: Math.round(activeMs / 60_000),
    tokens,
    tool_uses: toolUses,
    user_prompts: userPrompts,
    agent_calls: Object.keys(agentCalls).length > 0 ? agentCalls : agentCallsFromToolUse,
    models: [...models].sort(),
  });
}
sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));

// ---- 2. 品質ゲート実行結果（手戻りプロキシ） ---------------------------------

const gateHistory = [];
for (const rec of parseJsonl(resolveReadablePath('quality-gates-log.jsonl') ?? '')) {
  if (!rec.ts || !inRange(rec.ts)) continue;
  const branchOk = rec.branch && branchFilters.some((f) => rec.branch.includes(f));
  if (!branchOk) continue;
  gateHistory.push({
    ts: rec.ts,
    branch: rec.branch,
    pass: rec.pass || [],
    fail: rec.fail || [],
    skip: rec.skip || [],
  });
}

// ---- 3. 既存 YAML の machine: セクションとマージ（--write 用） ----------------

const outPath =
  args.out ||
  (args.taskId ? join(ROOT, 'docs/claude-code/improvements/metrics', `${args.taskId}.yml`) : null);

let mergedSessions = sessions;
let mergedGates = gateHistory;
if (args.write && outPath && existsSync(outPath)) {
  const existing = extractMachineEntries(readFileSync(outPath, 'utf8'));
  mergedSessions = mergeById(existing.sessions, sessions, (s) => s.id);
  mergedGates = mergeById(existing.gates, gateHistory, (g) => g.ts);
  mergedSessions.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id),
  );
  mergedGates.sort((a, b) => (a.ts < b.ts ? -1 : 1));
}

function extractMachineEntries(yamlText) {
  const sessions = [];
  const gates = [];
  const m = yamlText.match(/^machine:\r?\n([\s\S]*?)(?=^\S|(?![\s\S]))/m);
  if (!m) return { sessions, gates };
  for (const line of m[1].split('\n')) {
    const jm = line.match(/^\s*- (\{.*\})\s*$/);
    if (!jm) continue;
    try {
      const obj = JSON.parse(jm[1]);
      if (obj.id) sessions.push(obj);
      else if (obj.ts) gates.push(obj);
    } catch {
      // 手で壊された行は捨てる（次回 --write で再集計される）
    }
  }
  return { sessions, gates };
}

function mergeById(oldArr, newArr, keyFn) {
  const map = new Map();
  for (const o of oldArr) map.set(keyFn(o), o);
  for (const n of newArr) map.set(keyFn(n), n); // 同一キーは新しい集計で上書き
  return [...map.values()];
}

// ---- 4. 合計とレンダリング ----------------------------------------------------

const totals = {
  sessions: mergedSessions.length,
  active_minutes: mergedSessions.reduce((s, x) => s + x.active_minutes, 0),
  tokens_input: mergedSessions.reduce((s, x) => s + x.tokens.input, 0),
  tokens_output: mergedSessions.reduce((s, x) => s + x.tokens.output, 0),
  tokens_cache_creation: mergedSessions.reduce((s, x) => s + x.tokens.cache_creation, 0),
  tokens_cache_read: mergedSessions.reduce((s, x) => s + x.tokens.cache_read, 0),
  tool_uses: mergedSessions.reduce((s, x) => s + x.tool_uses, 0),
  user_prompts: mergedSessions.reduce((s, x) => s + x.user_prompts, 0),
};
totals.tokens_total =
  totals.tokens_input +
  totals.tokens_output +
  totals.tokens_cache_creation +
  totals.tokens_cache_read;

const agentCallsByType = {};
for (const s of mergedSessions) {
  for (const [type, n] of Object.entries(s.agent_calls || {})) {
    agentCallsByType[type] = (agentCallsByType[type] || 0) + n;
  }
}
const agentCallsTotal = Object.values(agentCallsByType).reduce((a, b) => a + b, 0);
const agentRestarts = Object.values(agentCallsByType).reduce((a, n) => a + Math.max(0, n - 1), 0);

const gateRuns = mergedGates.length;
const gateFailRuns = mergedGates.filter((g) => g.fail.length > 0).length;
const gateReworkRate = gateRuns > 0 ? Math.round((gateFailRuns / gateRuns) * 100) / 100 : null;

function durationLabel(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `約${m}分`;
  return `約${h}時間${m > 0 ? `${m}分` : ''}`;
}

function renderMachineBlock() {
  const lines = [];
  lines.push('machine:');
  lines.push(
    '  # collect-task-metrics.mjs による自動集計。手で編集しない（--write の再実行で更新）',
  );
  lines.push(`  collected_at: ${dayInTz(new Date())}`);
  lines.push(`  branch_filters: [${branchFilters.map((b) => JSON.stringify(b)).join(', ')}]`);
  lines.push('  sessions:  # session_id 単位でマージ・累積（1 行 = 1 セッション）');
  if (mergedSessions.length === 0) {
    lines.push('    []');
  } else {
    for (const s of mergedSessions) lines.push(`    - ${JSON.stringify(s)}`);
  }
  lines.push('  gate_history:  # run-quality-gates.sh の実行記録（ts 単位でマージ・累積）');
  if (mergedGates.length === 0) {
    lines.push('    []');
  } else {
    for (const g of mergedGates) lines.push(`    - ${JSON.stringify(g)}`);
  }
  lines.push('  totals:');
  lines.push(`    sessions: ${totals.sessions}`);
  lines.push(
    `    active_minutes: ${totals.active_minutes}  # ${durationLabel(totals.active_minutes)}（活動時間ベース・空白${GAP_CAP_MIN}分超は除外）`,
  );
  lines.push(`    tokens_input: ${totals.tokens_input}`);
  lines.push(`    tokens_output: ${totals.tokens_output}`);
  lines.push(`    tokens_cache_creation: ${totals.tokens_cache_creation}`);
  lines.push(`    tokens_cache_read: ${totals.tokens_cache_read}`);
  lines.push(`    tokens_total: ${totals.tokens_total}`);
  lines.push(`    tool_uses: ${totals.tool_uses}`);
  lines.push(`    user_prompts: ${totals.user_prompts}`);
  lines.push(`    agent_calls: ${agentCallsTotal}`);
  lines.push(`    agent_calls_by_type: ${JSON.stringify(agentCallsByType)}`);
  lines.push(
    `    agent_restarts: ${agentRestarts}  # 同一 Subagent 種の再起動数（手戻りプロキシ）`,
  );
  lines.push(`    gate_runs: ${gateRuns}`);
  lines.push(`    gate_fail_runs: ${gateFailRuns}`);
  lines.push(
    `    gate_rework_rate: ${gateReworkRate === null ? 'unknown  # ゲート実行記録なし' : `${gateReworkRate}  # FAIL を含む実行 / 総実行（手戻りプロキシ）`}`,
  );
  return lines.join('\n') + '\n';
}

const block = renderMachineBlock();

if (!args.write) {
  process.stdout.write(block);
  console.error(
    `\n（表示のみ。YAML へ反映するには --task-id <TASK-ID> --write を付ける / セッション ${mergedSessions.length} 件・ゲート実行 ${gateRuns} 件）`,
  );
  process.exit(0);
}

if (!outPath) {
  console.error('--write には --task-id か --out が必要です');
  process.exit(2);
}
if (!existsSync(outPath)) {
  console.error(
    `出力先がありません: ${outPath}\n先に record-task-metrics.sh で雛形を作成してください`,
  );
  process.exit(1);
}

{
  const original = readFileSync(outPath, 'utf8');
  let updated;
  if (/^machine:/m.test(original)) {
    updated = original.replace(/^machine:\r?\n([\s\S]*?)(?=^\S|(?![\s\S]))/m, block);
  } else {
    updated = original.replace(/\s*$/, '\n\n') + block;
  }
  writeFileSync(outPath, updated);
  console.log(
    `machine セクションを更新: ${outPath}（セッション ${mergedSessions.length} 件 / ゲート実行 ${gateRuns} 件 / 活動 ${durationLabel(totals.active_minutes)} / トークン計 ${totals.tokens_total.toLocaleString()}）`,
  );
}
