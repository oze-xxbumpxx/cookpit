#!/usr/bin/env node
// 委譲の記録を状態として使い、進行中の委譲ごとの「次の動き」・Issueに紐づかないDevinのPR・未起票の昇格候補を出す。
//
// 使い方:
//   node .claude/scripts/delegation.mjs status [--json] [--no-gh] [--dir <path>] [--mirror-dir <path>]
//   （このファイルを直接実行しても同じ）
//     --no-ghはghを呼ばず、記録だけで分かること（記録上の最後の状態・未起票の昇格候補）を出す。
//   セッション開始時のフック（.claude/hooks/delegation-status.mjs）も同じ判定を使う。
//
// 終了コード: 0（出す行が無くても0）/ 2引数の誤り
//
// 方針:
// - 判定（nextAction・findPromotions・prunableMirrorKeys・buildStatus・formatStatus）は純粋関数にし、テストで固定する。
//   ghの呼び出しはcollectStatusに閉じ込める。
// - 待機スクリプトはセッションと一緒に止まるため、次のセッションが記録から待機の起動し直し・レビュー・finalizeを決める。
// - ghが失敗しても止めない。記録上の最後の状態を出す（クラウドのセッションなどghが無い環境）。
// - 写し（状態ディレクトリ）の完了済みの記録は、完了から30日で消す。正はclose-sessionでmainに入る。
// - delegation.mjsからは動的に読み込む（こちらがwait-for-devin-pr.mjsを読み、あちらがdelegation.mjsを読むため）。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DIR,
  UsageError,
  defaultMirrorDir,
  mergeRecords,
  parseOptions,
  readAllRecords,
  recordKey,
  summarize,
} from './delegation.mjs';
import { findLinkedPr } from './wait-for-pr.mjs';
import { filterUnreviewed, findUnlinkedDevinPrs, knownFromRecords, listOpenDevinPrs, prComments } from './wait-for-devin-pr.mjs';

export const CANDIDATES_DIR = join(DEFAULT_DIR, '../candidates');
/** wait-for-pr.mjsの既定の時間切れ。これを過ぎてもPRが無ければ、DevinがPRを作らずに終わった可能性がある。 */
export const WAIT_PR_LIMIT_HOURS = 8;
export const MIRROR_KEEP_DAYS = 30;
const GH_TIMEOUT_MS = 30_000;
const TITLE_MAX = 80;

export const isDone = (record) => record.outcome === 'merged' || record.outcome === 'closed';

/** 記録のPR番号。記録のpr・gh.pr、無ければIssueに紐づくPRを一覧から探す（wait-for-prと同じ規則）。 */
export function prNumberOf(record, prs) {
  if (Number.isInteger(record.pr)) return record.pr;
  if (Number.isInteger(record.gh?.pr)) return record.gh.pr;
  if (!Number.isInteger(record.issue)) return null;
  return findLinkedPr(prs, record.issue, record.delegated_at)?.number ?? null;
}

/**
 * 完了していない記録の次の動き。完了済みならnull。
 * @param {object} record委譲の記録
 * @param {{prs: Array<{number:number,state:string,headRefOid?:string}>, now: number}} context
 *   prsはgh pr list（--state all）の結果。nowはミリ秒。
 */
export function nextAction(record, { prs, now }) {
  if (isDone(record)) return null;
  const key = recordKey(record);
  const number = prNumberOf(record, prs);
  if (number === null) {
    const elapsedHours = (now - Date.parse(record.delegated_at)) / 3_600_000;
    return { key, pr: null, state: 'wait-pr', elapsedHours, overdue: elapsedHours > WAIT_PR_LIMIT_HOURS };
  }
  const pr = prs.find((p) => p.number === number);
  if (pr === undefined) return { key, pr: number, state: 'unknown' };
  if (pr.state === 'MERGED' || pr.state === 'CLOSED') return { key, pr: number, state: 'finalize', prState: pr.state };
  const reviews = record.reviews ?? [];
  if (reviews.length === 0) return { key, pr: number, state: 'review', round: 0 };
  const last = reviews.at(-1);
  if (last.reviewed_sha !== pr.headRefOid || !/^[0-9a-f]{40}$/.test(last.reviewed_sha ?? '')) {
    return { key, pr: number, state: 're-review', round: last.round + 1 };
  }
  if (last.verdict === 'fix') {
    return {
      key,
      pr: number,
      state: 'wait-update',
      round: last.round,
      since: last.reviewed_at ?? record.delegated_at,
      sha: last.reviewed_sha,
      local: record.runner === 'local',
    };
  }
  if (last.verdict === 'escalate') return { key, pr: number, state: 'await-user', round: last.round, verdict: last.verdict };
  return { key, pr: number, state: 'await-user', round: last.round, verdict: last.verdict };
}

/** ghで確かめられないときの、記録上の最後の状態。 */
export function offlineAction(record) {
  const last = (record.reviews ?? []).at(-1) ?? null;
  const pr = Number.isInteger(record.pr) ? record.pr : (record.gh?.pr ?? null);
  return { key: recordKey(record), pr, state: 'offline', round: last?.round ?? null, verdict: last?.verdict ?? null };
}

/** 昇格候補のうち、candidates/delegation-<category>.md（archive/ に移したものを含む）がまだ無いもの。 */
export function findPromotions(summary, candidateFiles) {
  const filed = new Set(candidateFiles);
  return summary.byCategory
    .filter((c) => c.candidate && !filed.has(`delegation-${c.category}.md`))
    .map((c) => ({ category: c.category, issues: c.issues }));
}

/** 写しのうち、完了からkeepDays日を過ぎたもののkey。完了していない・完了の日時が無いものは消さない。 */
export function prunableMirrorKeys(records, now, keepDays = MIRROR_KEEP_DAYS) {
  return records
    .filter((rec) => isDone(rec))
    .filter((rec) => {
      const closed = Date.parse(rec.gh?.closed_at ?? rec.gh?.merged_at ?? '');
      return !Number.isNaN(closed) && now - closed > keepDays * 86_400_000;
    })
    .map(recordKey);
}

/**
 * @param {{records: object[], prs?: object[], openPrs?: object[], commentsOf?: (pr: number) => object[],
 *   candidateFiles?: string[], now: number, offline?: boolean, ghError?: string|null}} input
 *   offlineのときはghの結果を使わず、記録上の最後の状態だけを出す。
 */
export function buildStatus({ records, prs = [], openPrs = [], commentsOf = () => [], candidateFiles = [], now, offline = false, ghError = null }) {
  const open = records.filter((rec) => !isDone(rec));
  const actions = offline ? open.map(offlineAction) : open.map((rec) => nextAction(rec, { prs, now }));
  let unlinked = [];
  let unchecked = [];
  if (!offline) {
    const candidates = findUnlinkedDevinPrs(openPrs, knownFromRecords(records));
    ({ pending: unlinked, unchecked } = filterUnreviewed(candidates, commentsOf));
  }
  const prStates = Object.fromEntries([...prs, ...openPrs].filter((pr) => /^[0-9a-f]{40}$/.test(pr.headRefOid ?? '')).map((pr) => [pr.number, { head_sha: pr.headRefOid, state: pr.state }]));
  return { actions, unlinked, unchecked, prStates, promotions: findPromotions(summarize(records), candidateFiles), offline, ghError };
}

/** 外部（Devin）の文字列を1行にして切る。 */
export function oneLine(text, max = TITLE_MAX) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const keyLabel = (key) => (typeof key === 'number' ? `#${key}` : `PR#${key.slice(3)}`);
const cmd = (text) => `\`${text}\``;

function subject(action) {
  if (typeof action.key === 'string') return action.key.startsWith('pr-') ? `PR #${action.key.slice(3)}` : `タスク ${action.key}`;
  return action.pr === null ? `Issue #${action.key}` : `Issue #${action.key}（PR #${action.pr}）`;
}

function describe(action) {
  switch (action.state) {
    case 'wait-pr': {
      const base = `PR 待ち（委譲から ${action.elapsedHours.toFixed(1)} 時間）→ Bash の run_in_background で ${cmd(`node .claude/scripts/wait-for-pr.mjs ${action.key}`)} を起動し直す`;
      return action.overdue
        ? `${base}。${WAIT_PR_LIMIT_HOURS} 時間を超えたので、Devin が PR を作らずに終わった可能性もある（ローカルなら Devin のプロセスと専用クローンを確かめる）`
        : base;
    }
    case 'review':
      return `初回レビュー前 → review-devin-pr の round 0${typeof action.key === 'string' ? '（「Issue なし PR」の節）' : ''}`;
    case 're-review':
      return `再レビュー（最後のレビューの後に head が変わった）→ review-devin-pr の round ${action.round}`;
    case 'wait-update': {
      const wait = cmd(`node .claude/scripts/wait-for-pr-update.mjs ${action.pr} --since ${action.since} --sha ${action.sha}`);
      const local = action.local ? '。ローカルの委譲なので、Devin の修正セッションが動いているかも確かめる' : '';
      return `修正待ち（round ${action.round} で指摘を投稿）→ Bash の run_in_background で ${wait} を起動し直す${local}`;
    }
    case 'await-user':
      return action.verdict === 'merge'
        ? 'レビュー済み。マージ判断はユーザー'
        : `ユーザーの判断待ち（round ${action.round} で引き渡し）`;
    case 'finalize':
      return `PR が ${action.prState === 'MERGED' ? 'マージ' : 'クローズ'}された → ${cmd(`node .claude/scripts/delegation.mjs finalize ${action.key}`)}`;
    case 'unknown':
      return 'PR の状態を gh の一覧で確かめられなかった（`gh pr view` で確かめる）';
    case 'offline':
      return action.round === null ? '記録上: レビュー前' : `記録上: round ${action.round} の判定 ${action.verdict}`;
    default:
      return action.state;
  }
}

const prLine = (pr, note = '') => `- PR #${pr.number}（${oneLine(pr.headRefName, 60)}）${oneLine(pr.title)}${note}`;

/** 人向けの表示。出す行が無ければ空文字（ghが失敗しただけなら何も出さない）。 */
export function formatStatus(status) {
  const out = [];
  if (status.actions.length > 0) {
    out.push('📋 進行中の Devin への委譲（記録から。ユーザーの今の依頼を優先し、区切りのよいところで対応する）:');
    for (const action of status.actions) {
      const who = subject(action);
      out.push(`- ${who}${who.endsWith('）') ? '' : ' '}${describe(action)}`);
    }
    if (status.offline) {
      const reason = status.ghError === null ? 'gh を使わずに' : `gh で確かめられなかったため（${oneLine(status.ghError, 120)}）`;
      out.push(`  ※ ${reason}、記録上の最後の状態だけを出した。PR の状態は gh で確かめる`);
    }
  }
  if (status.unlinked.length > 0 || status.unchecked.length > 0) {
    out.push(
      '📌 Issue に紐づかない Devin の PR（記録なし）: `node .claude/scripts/delegation.mjs init pr-<番号>` の後、' +
        'review-devin-pr の「Issue なし PR」の手順でレビューする:',
    );
    for (const pr of status.unlinked) out.push(prLine(pr));
    for (const pr of status.unchecked) out.push(prLine(pr, ' ※コメントを取得できず、レビュー済みかは未確認'));
  }
  if (status.promotions.length > 0) {
    out.push(
      '🔁 未起票の昇格候補（improvement-cycle.md の「委譲ループの軽量サイクル」で candidates/delegation-<category>.md と backlog を起票する）:',
    );
    for (const p of status.promotions) out.push(`- ${p.category}（${p.issues.map(keyLabel).join(' ')}）`);
  }
  return out.join('\n');
}

function ghJson(args, timeout) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout }));
}

/** 完了していない記録のPR（作成日時がいちばん古い委譲以降のPRを、閉じたものも含めて）。 */
function listRecordPrs(records, timeout) {
  const times = records.filter((rec) => !isDone(rec)).map((rec) => Date.parse(rec.delegated_at)).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return [];
  const since = new Date(Math.min(...times)).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const prs = ghJson(
    [
      'pr', 'list', '--state', 'all', '--limit', '1000',
      '--search', `created:>=${since}`,
      '--json', 'number,title,body,headRefName,createdAt,state,headRefOid,closingIssuesReferences',
    ],
    timeout,
  );
  if (!Array.isArray(prs) || prs.length >= 1000) throw new Error('PR一覧を全件確認できません');
  return prs;
}

function pruneMirror(mirrorDir, mirrorRecords, now) {
  if (mirrorDir === null) return;
  for (const key of prunableMirrorKeys(mirrorRecords, now)) {
    try {
      rmSync(join(mirrorDir, `${key}.yml`), { force: true });
    } catch {
      // 掃除に失敗しても表示は続ける
    }
  }
}

/** 記録（正 ∪ 写し）とghから状態を集める。ghが失敗したら記録上の最後の状態にする。 */
export function collectStatus({
  dir = DEFAULT_DIR,
  mirrorDir = defaultMirrorDir(),
  candidatesDir = CANDIDATES_DIR,
  now = Date.now(),
  useGh = true,
  timeout = GH_TIMEOUT_MS,
} = {}) {
  const mirror = mirrorDir === null ? [] : readAllRecords(mirrorDir, { skipInvalid: true });
  const records = mergeRecords(readAllRecords(dir), mirror);
  pruneMirror(mirrorDir, mirror, now);
  // 対応済みの候補はcandidates/archive/ へ移る（memory-policy）。移した後も起票済みとして扱う。
  const listNames = (path) => (existsSync(path) ? readdirSync(path) : []);
  const candidateFiles = [...listNames(candidatesDir), ...listNames(join(candidatesDir, 'archive'))];
  if (!useGh) return buildStatus({ records, candidateFiles, now, offline: true });
  try {
    const prs = listRecordPrs(records, timeout);
    const openPrs = listOpenDevinPrs(null, timeout);
    return buildStatus({ records, prs, openPrs, commentsOf: (n) => prComments(n, timeout), candidateFiles, now });
  } catch (error) {
    return buildStatus({ records, candidateFiles, now, offline: true, ghError: error.message.split('\n')[0] });
  }
}

export async function runStatusCli(argv) {
  const opts = parseOptions(argv, { flags: ['json', 'no-gh'] });
  const status = collectStatus({
    dir: opts.dir ?? DEFAULT_DIR,
    mirrorDir: opts['mirror-dir'] ?? (opts.dir === undefined ? defaultMirrorDir() : null),
    useGh: opts['no-gh'] !== true,
  });
  if (opts.json === true) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  const text = formatStatus(status);
  console.log(text === '' ? '進行中の委譲・未レビューの Issue なし PR・未起票の昇格候補はありません' : text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await runStatusCli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(error instanceof UsageError ? 2 : 1);
  }
}
