#!/usr/bin/env node
// 委譲（Issue → Devin → PR）ごとの記録を作り、集計する。
//
// 使い方:
//   node .claude/scripts/delegation.mjs init <issue> --model <swe-2-medium|swe-2-high|swe-2-max|unknown>
//     [--runner <local|cloud>] [--level 0-3] [--title <題>] [--delegated-at <ISO 8601>] [--follow-up-of <issue|pr-n>]
//       --runnerはDevinを動かした場所。既定はlocal（2026-09-26ユーザー指示: 既定はローカル、出先の指示時だけクラウド）。
//       記録を作る。--titleと --delegated-atを省くとghからIssueの題と作成日時を取る。
//       --follow-up-ofは、前の委譲のPRの指摘を直す後続の委譲のとき、その前の委譲を指す（複数ならいちばん古いもの）。
//   node .claude/scripts/delegation.mjs open-task <計画のpath> <機能名>:<タスク名> --title <題> --model <m>
//     [--runner <local|cloud>] [--level 0-3]
//       承認済みの計画（origin/mainにあるもの）から<!-- delegation-task:<タスク名> -->の区間を取り出し、
//       Issueを作って記録を作る。本文の先頭に印（タスク名と本文のdigest）を入れ、同じ印の開いたIssueが
//       あれば作らずにその番号を返す（同じタスクを二重に作らない）。digestが違えば止める。
//       Issueの番号を出力する。
//   node .claude/scripts/delegation.mjs review <issue> --round <n> --sha <sha> --verdict <merge|fix|escalate>
//     [--posted] [--finding '<must|nit|security|decision>:<category>:<summary>' ...] [--reviewed-at <ISO 8601>]
//       roundの結果を追記する。reviewed_atの既定は今の時刻。
//   node .claude/scripts/delegation.mjs finalize <issue> [--pr <PR番号>]
//       ghからPR・時刻・CI初回（PR作成時のhead）・コミット数・Closesの紐づけを取り、gh: とoutcomeを埋める。
//   node .claude/scripts/delegation.mjs summary [--threshold 3] [--security-threshold 2]
//       記録（正 ∪ 写し）だけを読んで集計する（ghは呼ばない）。
//   Issueに紐づかないDevinのPRは、<issue> の代わりにpr-<PR番号> を指定する。
//     init pr-<n> [--model <m>] [--runner <local|cloud>] … はghからPRの題・作成日時・作成者を取り、
//     --modelの既定はunknown、--runnerの既定は作成者（bot → cloud、それ以外 → local）。記録はpr-<n>.yml。
//   node .claude/scripts/delegation.mjs status [--json] [--no-gh]
//       進行中の委譲ごとの次の動き・IssueなしPR・未起票の昇格候補（delegation-status.mjs）。
//   すべてのサブコマンドで --dir <path> を指定すると記録の置き場を変えられる（テスト用）。
//   --mirror-dir <path> は記録の写しの置き場。既定はハーネスの状態ディレクトリのdelegations/。
//   --dirを指定したときは、--mirror-dirを指定しない限り写さない（テストで手元の写しを汚さない）。
//
// 終了コード: 0成功 / 2引数・記録の誤り / 3 ghの失敗・PRが見つからない
//
// 方針:
// - 記録は公開リポジトリに入る。securityの指摘はsummaryを「(非公開)」に置き換える。
// - YAMLは依存を増やさないため、この記録の形（スカラー・ネストしたmap・mapの配列）だけを
//   読み書きする最小の実装にする。その他の形はエラーにする。
// - 書き込みは一時ファイル → rename。initは既存を上書きしない。
// - 記録の写し: 正（リポジトリ）を書いたあと、状態ディレクトリにも書く。
//   worktreeごとのセッションでも、mainに未マージの進行中の記録が見えるようにするため。
//   読むときは正と写しをkeyでまとめ、reviewsの多い方 → outcomeのある方 → 正の順で選ぶ。写しの失敗は警告だけ。

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { resolveStateDir } from '../lib/harness-paths.mjs';
import { findLinkedPr, listPrs } from './wait-for-pr.mjs';

export const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../docs/claude-code/improvements/delegations');
const GH_TIMEOUT_MS = 30_000;

export const MODELS = ['swe-2-medium', 'swe-2-high', 'swe-2-max', 'unknown'];
// 新しい記録で指定できる実行場所。runnerの無い古い記録は、集計のときだけunknownとして扱う。
export const RUNNERS = ['local', 'cloud'];
export const SEVERITIES = ['must', 'nit', 'security', 'decision'];
export const VERDICTS = ['merge', 'fix', 'escalate'];
export const PRIVATE_SUMMARY = '(非公開)';
// 委譲の起点。issue = Issueを渡した（既定。項目の無い記録もissue）、self = Devinが自分から出したPR。
export const ORIGINS = ['issue', 'self'];
const CATEGORY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export class UsageError extends Error {}

// ---------------------------------------------------------------- YAML（この記録の形だけ）

function emitScalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new UsageError(`YAML に書けない数値: ${value}`);
    return String(value);
  }
  if (typeof value === 'string') {
    if (/[\r\n]/.test(value)) throw new UsageError('YAML の文字列に改行は使えません');
    return `'${value.replaceAll("'", "''")}'`;
  }
  throw new UsageError(`YAML に書けない値: ${typeof value}`);
}

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function emitMap(obj, indent) {
  const pad = ' '.repeat(indent);
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      if (value.length === 0) lines.push(`${pad}${key}: []`);
      else lines.push(`${pad}${key}:`, ...emitList(value, indent + 2));
    } else if (isMap(value)) {
      if (Object.keys(value).length === 0) lines.push(`${pad}${key}: {}`);
      else lines.push(`${pad}${key}:`, ...emitMap(value, indent + 2));
    } else {
      lines.push(`${pad}${key}: ${emitScalar(value)}`);
    }
  }
  return lines;
}

function emitList(items, indent) {
  return items.flatMap((item) => {
    if (!isMap(item) || Object.keys(item).length === 0) throw new UsageError('YAML の配列の要素は空でない map に限ります');
    const lines = emitMap(item, indent + 2);
    lines[0] = `${' '.repeat(indent)}- ${lines[0].slice(indent + 2)}`;
    return lines;
  });
}

export function toYaml(obj) {
  return `${emitMap(obj, 0).join('\n')}\n`;
}

function parseScalar(text, fail) {
  if (text.startsWith("'")) {
    const inner = text.slice(1, -1);
    if (text.length < 2 || !text.endsWith("'") || inner.replaceAll("''", '').includes("'")) fail('引用符が閉じていません');
    return inner.replaceAll("''", "'");
  }
  if (text === 'null' || text === '~') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === '[]') return [];
  if (text === '{}') return {};
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (/^["{[&*|>!%@`]/.test(text) || / #/.test(text)) fail(`この形の値は読めません: ${text}`);
  return text;
}

export function parseYaml(text) {
  const lines = [];
  text.split('\n').forEach((raw, index) => {
    if (/^\s*(?:#.*)?$/.test(raw)) return;
    const lead = raw.match(/^\s*/)[0];
    if (lead.includes('\t')) throw new UsageError(`YAML ${index + 1} 行目: インデントにタブは使えません`);
    lines.push({ indent: lead.length, text: raw.slice(lead.length).trimEnd(), no: index + 1 });
  });
  let i = 0;
  const failAt = (line) => (message) => {
    throw new UsageError(`YAML ${line.no} 行目: ${message}`);
  };
  const isItem = (line) => line.text === '-' || line.text.startsWith('- ');

  function parseMap(indent) {
    const obj = {};
    while (i < lines.length && lines[i].indent === indent && !isItem(lines[i])) {
      const line = lines[i];
      const fail = failAt(line);
      const m = line.text.match(/^([A-Za-z_][\w-]*):(?: +(.*))?$/);
      if (m === null) fail(`key: value の形ではありません: ${line.text}`);
      const [, key, value] = m;
      if (Object.hasOwn(obj, key)) fail(`キーが重複しています: ${key}`);
      i += 1;
      if (value !== undefined && value !== '') obj[key] = parseScalar(value, fail);
      else if (i < lines.length && lines[i].indent > indent) obj[key] = isItem(lines[i]) ? parseList(lines[i].indent) : parseMap(lines[i].indent);
      else if (i < lines.length && lines[i].indent === indent && isItem(lines[i])) obj[key] = parseList(indent);
      else obj[key] = null;
    }
    if (i < lines.length && lines[i].indent > indent) failAt(lines[i])('インデントが不正です');
    return obj;
  }

  function parseList(indent) {
    const items = [];
    while (i < lines.length && lines[i].indent === indent && isItem(lines[i])) {
      const line = lines[i];
      const rest = line.text.slice(1);
      const gap = rest.match(/^ */)[0].length;
      if (rest.trim() === '' || gap === 0) failAt(line)('配列の要素は「- key: value」の形にしてください');
      const itemIndent = indent + 1 + gap;
      lines[i] = { indent: itemIndent, text: rest.slice(gap), no: line.no };
      items.push(parseMap(itemIndent));
    }
    return items;
  }

  if (lines.length === 0) return {};
  if (lines[0].indent !== 0) failAt(lines[0])('最初の行はインデントなしにしてください');
  const result = parseMap(0);
  if (i < lines.length) failAt(lines[i])('読めない行です');
  return result;
}

// ---------------------------------------------------------------- 記録の操作（純粋関数）

/**
 * @param {{followUpOf?: number|string|null}} args followUpOfは前の委譲のkey（Issue番号か'pr-<n>'）。
 *   指定したときだけfollow_up_ofを書く（項目の無い古い記録と形を揃える）。
 */
export function newRecord({ issue, title, model, runner = 'local', level = null, delegatedAt, followUpOf = null }) {
  if (!Number.isInteger(issue) || issue <= 0) throw new UsageError('Issue 番号が不正です');
  if (!MODELS.includes(model)) throw new UsageError(`--model は ${MODELS.join(' | ')} のどれか`);
  if (!RUNNERS.includes(runner)) throw new UsageError(`--runner は ${RUNNERS.join(' | ')} のどれか`);
  if (level !== null && ![0, 1, 2, 3].includes(level)) throw new UsageError('--level は 0〜3');
  if (Number.isNaN(Date.parse(delegatedAt))) throw new UsageError('委譲の日時が ISO 8601 ではありません');
  const parent = followUpOf === null ? null : targetArg(String(followUpOf));
  if (parent === issue) throw new UsageError('--follow-up-of に自分自身は指定できません');
  return {
    issue,
    title,
    agent: 'devin',
    model,
    runner,
    change_level: level,
    delegated_at: delegatedAt,
    ...(parent === null ? {} : { follow_up_of: parent }),
    reviews: [],
    escalations: 0,
    outcome: null,
    gh: null,
  };
}

/** Issueに紐づかないDevinのPRの記録。Issueが無いのでdelegated_atはPRの作成日時。 */
export function newSelfRecord({ pr, title, model = 'unknown', runner, level = null, createdAt }) {
  if (!Number.isInteger(pr) || pr <= 0) throw new UsageError('PR 番号が不正です');
  const { issue, ...rest } = newRecord({ issue: pr, title, model, runner, level, delegatedAt: createdAt });
  return { issue: null, pr, origin: 'self', ...rest };
}

/** 記録を指す名前。Issueの記録は番号、PRの記録はpr-<n>（ファイル名とCLIの指定に使う）。 */
export const recordKey = (record) => (Number.isInteger(record.issue) ? record.issue : `pr-${record.pr}`);

/** 集計の表示用。Issueは #n、PRはPR#n。 */
const keyLabel = (key) => (typeof key === 'number' ? `#${key}` : `PR#${key.slice(3)}`);

/** 作成者から実行場所を推す。クラウドのDevinはbotのアカウント、ローカルはユーザーのアカウントでPRを作る。 */
export const runnerFromAuthor = (author) => (author?.is_bot === true || /\[bot\]$|^app\//.test(author?.login ?? '') ? 'cloud' : 'local');

/**
 * '<severity>:<category>:<summary>'。summaryには':'を含めてよい。securityのsummaryは公開しない。
 * @throws UsageError severityとcategoryの片方だけがsecurityのとき
 */
export function parseFinding(text) {
  const first = text.indexOf(':');
  const second = first === -1 ? -1 : text.indexOf(':', first + 1);
  if (second === -1) throw new UsageError(`--finding は '<severity>:<category>:<summary>' の形: ${text}`);
  const severity = text.slice(0, first).trim();
  const category = text.slice(first + 1, second).trim();
  const summary = text.slice(second + 1).trim();
  if (!SEVERITIES.includes(severity)) throw new UsageError(`severity は ${SEVERITIES.join(' | ')} のどれか: ${severity}`);
  if (!CATEGORY.test(category)) throw new UsageError(`category は kebab-case: ${category}`);
  if (summary === '') throw new UsageError('summary が空です');
  // 集計はsecurityをcategoryで数え、非公開・自動投稿の禁止はseverityで決める。片方だけだと再発件数から漏れるか、
  // 手順が公開の記録・PRに出るため、両方をそろえる。
  if ((severity === 'security') !== (category === 'security')) {
    throw new UsageError(`security の指摘は severity と category の両方を security にする: ${severity}:${category}`);
  }
  return { severity, category, summary: severity === 'security' ? PRIVATE_SUMMARY : summary.replace(/\s+/g, ' ') };
}

/** atはreviewを記録した時刻（修正待ちのwait-for-pr-updateの --sinceに使う）。指定したときだけreviewed_atを書く。 */
export function addReview(record, { round, sha, verdict, posted = false, findings = [], at = null }) {
  if (!Number.isInteger(round) || round < 0) throw new UsageError('--round は 0 以上の整数');
  if (!VERDICTS.includes(verdict)) throw new UsageError(`--verdict は ${VERDICTS.join(' | ')} のどれか`);
  if (typeof sha !== 'string' || !/^[0-9a-f]{7,40}$/.test(sha)) throw new UsageError('--sha はコミットの SHA');
  if (at !== null && Number.isNaN(Date.parse(at))) throw new UsageError('--reviewed-at は ISO 8601');
  if (record.reviews.some((r) => r.round === round)) throw new UsageError(`round ${round} は記録済みです`);
  if (posted && findings.some((f) => f.severity === 'security' || f.severity === 'decision')) {
    throw new UsageError('security / decision の指摘は自動投稿しません（--posted と併用できない）');
  }
  const review = { round, ...(at === null ? {} : { reviewed_at: at }), reviewed_sha: sha, verdict, posted, findings };
  return {
    ...record,
    reviews: [...record.reviews, review].sort((a, b) => a.round - b.round),
    escalations: record.escalations + (verdict === 'escalate' ? 1 : 0),
  };
}

const PASSING = new Set(['success', 'skipped', 'neutral']);

/**
 * CIの「初回」とみなすコミット = PRを作った時点のhead（作成時刻以前で最後のコミット）。
 * 複数のコミットをまとめてpushするとCIは最後のコミットでしか動かないため、最初のコミットではない。
 */
export function firstCiCommit(commits, prCreatedAt) {
  const created = Date.parse(prCreatedAt);
  const before = commits.filter((c) => Date.parse(c.committedDate) <= created);
  return (before.at(-1) ?? commits[0])?.oid ?? null;
}

/**
 * @param {object} pr gh pr view --json number,state,createdAt,mergedAt,closedAt,commits,closingIssuesReferences
 * @param {Array<{status:string,conclusion:string|null}> | null} firstCommitRuns firstCiCommitのcheck-runs
 */
export function buildGhSection(pr, issue, firstCommitRuns) {
  let ciFirstPass = null;
  const ciRuns = firstCommitRuns === null ? null : firstCommitRuns.filter((r) => r.name !== 'agent-review');
  if (ciRuns !== null && ciRuns.length > 0) {
    ciFirstPass = ciRuns.every((r) => r.status === 'completed' && PASSING.has(r.conclusion));
  }
  return {
    outcome: { MERGED: 'merged', CLOSED: 'closed', OPEN: 'open' }[pr.state] ?? null,
    gh: {
      pr: pr.number,
      pr_created_at: pr.createdAt,
      merged_at: pr.mergedAt || null,
      closed_at: pr.closedAt || null,
      commits: (pr.commits ?? []).length,
      ci_first_pass: ciFirstPass,
      closes_linked: issue === null ? null : (pr.closingIssuesReferences ?? []).some((ref) => ref.number === issue),
    },
  };
}

// ---------------------------------------------------------------- 集計

const minutesBetween = (from, to) => (from && to ? (Date.parse(to) - Date.parse(from)) / 60000 : null);

function median(values) {
  const sorted = values.filter((v) => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 投稿した回数 = 手戻りの回数。 */
export const roundsOf = (record) => record.reviews.filter((r) => r.posted).length;

/** 他の記録のfollow_up_ofに指されているkey（= 後続の委譲を生んだ委譲）。 */
export function parentKeys(records) {
  return new Set(records.map((rec) => rec.follow_up_of ?? null).filter((key) => key !== null));
}

function groupStats(records, keyOf, parents = new Set()) {
  const groups = {};
  for (const rec of records) {
    const m = (groups[keyOf(rec)] ??= {
      count: 0,
      merged: 0,
      finished: 0,
      reviewed: 0,
      firstPass: 0,
      cleanFirstPass: 0,
      spawned: 0,
      rounds: [],
      ciKnown: 0,
      ciPass: 0,
      issueToPr: [],
      prToMerge: [],
      escalations: 0,
    });
    m.count += 1;
    if (rec.outcome === 'merged' || rec.outcome === 'closed') m.finished += 1;
    if (rec.outcome === 'merged') m.merged += 1;
    const spawned = parents.has(recordKey(rec));
    if (spawned) m.spawned += 1;
    if (rec.reviews.length > 0) {
      m.reviewed += 1;
      m.rounds.push(roundsOf(rec));
      if (rec.reviews[0].verdict === 'merge') {
        m.firstPass += 1;
        if (!spawned) m.cleanFirstPass += 1;
      }
    }
    m.escalations += rec.escalations ?? 0;
    if (typeof rec.gh?.ci_first_pass === 'boolean') {
      m.ciKnown += 1;
      if (rec.gh.ci_first_pass) m.ciPass += 1;
    }
    // 自分から出したPRはdelegated_atがPRの作成日時なので、Issue→PRに入れない。
    if (rec.origin !== 'self') m.issueToPr.push(minutesBetween(rec.delegated_at, rec.gh?.pr_created_at));
    m.prToMerge.push(minutesBetween(rec.gh?.pr_created_at, rec.gh?.merged_at));
  }
  return Object.fromEntries(
    Object.entries(groups).map(([key, m]) => [
      key,
      {
        count: m.count,
        merged: m.merged,
        finished: m.finished,
        reviewed: m.reviewed,
        firstPass: m.firstPass,
        cleanFirstPass: m.cleanFirstPass,
        spawned: m.spawned,
        avgRounds: m.rounds.length === 0 ? null : m.rounds.reduce((a, b) => a + b, 0) / m.rounds.length,
        ciKnown: m.ciKnown,
        ciPass: m.ciPass,
        escalations: m.escalations,
        medianIssueToPrMin: median(m.issueToPr),
        medianPrToMergeMin: median(m.prToMerge),
      },
    ]),
  );
}

/** Issue（番号）を先に番号順、PR（pr-<n>）を後に番号順。 */
function compareKeys(a, b) {
  if (typeof a !== typeof b) return typeof a === 'number' ? -1 : 1;
  return typeof a === 'number' ? a - b : Number(a.slice(3)) - Number(b.slice(3));
}

export function summarize(records, { threshold = 3, securityThreshold = 2 } = {}) {
  const categories = new Map();
  for (const rec of records) {
    for (const review of rec.reviews) {
      for (const f of review.findings ?? []) {
        if (!categories.has(f.category)) categories.set(f.category, new Set());
        categories.get(f.category).add(recordKey(rec));
      }
    }
  }
  const byCategory = [...categories]
    .map(([category, issues]) => {
      const limit = category === 'security' ? securityThreshold : threshold;
      return { category, issues: [...issues].sort(compareKeys), threshold: limit, candidate: issues.size >= limit };
    })
    .sort((a, b) => b.issues.length - a.issues.length || a.category.localeCompare(b.category));
  const parents = parentKeys(records);
  const followUps = records
    .filter((rec) => (rec.follow_up_of ?? null) !== null)
    .map((rec) => ({ key: recordKey(rec), parent: rec.follow_up_of }))
    .sort((a, b) => compareKeys(a.key, b.key));
  return {
    total: records.length,
    issueOrigin: records.filter((rec) => (rec.origin ?? 'issue') === 'issue').length,
    followUps,
    outcomes: {
      merged: records.filter((r) => r.outcome === 'merged').length,
      closed: records.filter((r) => r.outcome === 'closed').length,
      open: records.filter((r) => r.outcome !== 'merged' && r.outcome !== 'closed').length,
    },
    models: groupStats(records, (rec) => rec.model, parents),
    runners: groupStats(records, (rec) => rec.runner ?? 'unknown', parents),
    origins: groupStats(records, (rec) => rec.origin ?? 'issue', parents),
    byCategory,
    candidates: byCategory.filter((c) => c.candidate).map((c) => c.category),
  };
}

function formatDuration(min) {
  if (min === null) return '-';
  if (min < 90) return `${Math.round(min)}m`;
  if (min < 48 * 60) return `${(min / 60).toFixed(1)}h`;
  return `${(min / 1440).toFixed(1)}d`;
}

const ratio = (a, b) => (b === 0 ? '-' : `${a}/${b}`);

function formatGroupRows(groups) {
  return Object.entries(groups)
    .sort()
    .map(
      ([key, m]) =>
        `  ${key}: ${m.count} / ${ratio(m.merged, m.finished)} / ${ratio(m.firstPass, m.reviewed)} / ` +
        `${ratio(m.cleanFirstPass, m.reviewed)} / ${m.spawned} / ` +
        `${m.avgRounds === null ? '-' : m.avgRounds.toFixed(1)} / ${ratio(m.ciPass, m.ciKnown)} / ${m.escalations} / ` +
        `${formatDuration(m.medianIssueToPrMin)} / ${formatDuration(m.medianPrToMergeMin)}`,
    );
}

export function formatSummary(s) {
  const out = [`委譲 ${s.total} 件（merged ${s.outcomes.merged} / closed ${s.outcomes.closed} / open ${s.outcomes.open}）`];
  if (s.total === 0) return out.join('\n');
  if (s.followUps.length > 0) {
    const pairs = s.followUps.map((f) => `${keyLabel(f.key)}←${keyLabel(f.parent)}`).join(' ');
    out.push(`後続の委譲（前の PR の指摘を直す委譲）: ${s.followUps.length}/${s.issueOrigin}（${pairs}）`);
  }
  const columns =
    '件数 / マージ / 一発合格 / 後続なしの一発合格 / 後続を生んだ / 平均round / CI初回成功 / 引き渡し / Issue→PR中央値 / PR→マージ中央値';
  out.push('', `モデル別: ${columns}`, ...formatGroupRows(s.models));
  out.push('', `実行場所別: ${columns}`, ...formatGroupRows(s.runners));
  if (Object.keys(s.origins ?? {}).some((key) => key !== 'issue')) {
    out.push('', `起点別（self = Issue なしの PR。Issue→PR は数えない）: ${columns}`, ...formatGroupRows(s.origins));
  }
  out.push('', '分類別（指摘が出た委譲の数 / 昇格の閾値）');
  for (const c of s.byCategory) {
    const note = c.candidate ? '  ← 昇格候補' : `  あと ${c.threshold - c.issues.length} 件`;
    out.push(`  ${c.category}: ${c.issues.length}/${c.threshold}（${c.issues.map(keyLabel).join(' ')}）${note}`);
  }
  out.push('', `昇格候補: ${s.candidates.length === 0 ? 'なし' : s.candidates.join(', ')}`);
  return out.join('\n');
}

// ---------------------------------------------------------------- ファイルとgh

const recordPath = (dir, key) => join(dir, `${key}.yml`);
const RECORD_FILE = /^(\d+|pr-\d+)\.yml$/;

export function readRecord(dir, key) {
  const path = recordPath(dir, key);
  if (!existsSync(path)) throw new UsageError(`記録がありません: ${path}（先に init）`);
  return parseYaml(readFileSync(path, 'utf8'));
}

function writeAtomic(dir, record, mode) {
  mkdirSync(dir, { recursive: true, ...(mode === undefined ? {} : { mode }) });
  const path = recordPath(dir, recordKey(record));
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, toYaml(record));
  renameSync(tmp, path);
  return path;
}

/** 正を書き、mirrorDirがあれば写しも書く。写しの失敗は警告だけにして、正の書き込みは成功扱いにする。 */
export function writeRecord(dir, record, { mirrorDir = null } = {}) {
  const path = writeAtomic(dir, record);
  if (mirrorDir !== null) {
    try {
      writeAtomic(mirrorDir, record, 0o700);
    } catch (error) {
      console.error(`記録の写しを書けませんでした（正は書けています）: ${error.message.split('\n')[0]}`);
    }
  }
  return path;
}

/**
 * @param {{skipInvalid?: boolean}} options skipInvalidは読めないファイルを飛ばす（写しを読むとき。
 *   手元の写しが1つ壊れても、セッション開始の表示や待機を止めない）。正は壊れていたらエラーにする。
 */
export function readAllRecords(dir, { skipInvalid = false } = {}) {
  if (!existsSync(dir)) return [];
  const records = [];
  const keys = readdirSync(dir)
    .filter((name) => RECORD_FILE.test(name))
    .map((name) => name.slice(0, -'.yml'.length))
    .map((key) => (/^\d+$/.test(key) ? Number(key) : key))
    .sort(compareKeys);
  for (const key of keys) {
    try {
      records.push(parseYaml(readFileSync(recordPath(dir, key), 'utf8')));
    } catch (error) {
      if (!skipInvalid) throw error;
      console.error(`記録の写しを読めませんでした（飛ばします）: ${recordPath(dir, key)}: ${error.message.split('\n')[0]}`);
    }
  }
  return records;
}

/**
 * 記録の写しの既定の置き場（ハーネスの状態ディレクトリのdelegations/。worktreeをまたいで同じ場所）。
 * 状態ディレクトリを解決できない・リポジトリ内へのフォールバックしか無いときはnull（写さない）。
 */
export function defaultMirrorDir(env = process.env) {
  try {
    const resolved = resolveStateDir({ env });
    return resolved.trusted ? join(resolved.dir, 'delegations') : null;
  } catch {
    return null;
  }
}

/** 共有フィールドは新しいseqから読み、独立して追記される履歴は両記録を照合して残す。 */
export function preferRecord(primary, mirror) {
  if (primary === null) return mirror;
  if (mirror === null) return primary;
  const seq = (rec) => Number.isSafeInteger(rec.shared_seq) && rec.shared_seq >= 0 ? rec.shared_seq : -1;
  if (seq(primary) >= 0 || seq(mirror) >= 0) {
    const at = (rec) => Date.parse(rec.shared_fetched_at ?? '') || 0;
    const shared = seq(primary) !== seq(mirror) ? (seq(primary) > seq(mirror) ? primary : mirror)
      : at(mirror) > at(primary) ? mirror : primary;
    if (recordKey(primary) !== recordKey(mirror) || (primary.task_key && mirror.task_key && primary.task_key !== mirror.task_key)) {
      throw new UsageError('委譲の記録が競合しています（対応するタスクを確認してください）');
    }
    const a = primary.reviews ?? [];
    const b = mirror.reviews ?? [];
    const byRound = new Map();
    for (const review of [...a, ...b]) {
      if (!Number.isSafeInteger(review.round) || review.round < 0) throw new UsageError('レビュー履歴が不正です（写しは更新しません）');
      if (byRound.has(review.round) && !isDeepStrictEqual(byRound.get(review.round), review)) throw new UsageError('レビュー履歴が競合しています（写しは更新しません）');
      byRound.set(review.round, review);
    }
    const reviews = [...byRound.values()].sort((left, right) => left.round - right.round);
    const merged = { ...shared, reviews,
      escalations: Math.max(primary.escalations ?? 0, mirror.escalations ?? 0, reviews.filter((review) => review.verdict === 'escalate').length) };
    for (const field of ['follow_up_of', 'outcome']) {
      const left = primary[field] ?? null;
      const right = mirror[field] ?? null;
      if (left !== null && right !== null && left !== right) throw new UsageError('委譲の履歴が競合しています（写しは更新しません）');
      if (left !== null || right !== null) merged[field] = left ?? right;
    }
    if (primary.gh?.pr && mirror.gh?.pr && primary.gh.pr !== mirror.gh.pr) throw new UsageError('PRの記録が競合しています（写しは更新しません）');
    merged.gh = shared.gh ?? primary.gh ?? mirror.gh ?? null;
    return isDeepStrictEqual(merged, shared) ? shared : merged;
  }
  const reviews = (rec) => (rec.reviews ?? []).length;
  if (reviews(primary) !== reviews(mirror)) return reviews(primary) > reviews(mirror) ? primary : mirror;
  const decided = (rec) => (rec.outcome ?? null) !== null;
  if (decided(primary) !== decided(mirror)) return decided(primary) ? primary : mirror;
  return primary;
}

/** 正と写しの記録をkeyでまとめる（keyの順）。 */
export function mergeRecords(primary, mirror) {
  const byKey = new Map(primary.map((rec) => [recordKey(rec), rec]));
  for (const rec of mirror) {
    const key = recordKey(rec);
    byKey.set(key, preferRecord(byKey.get(key) ?? null, rec));
  }
  return [...byKey.keys()].sort(compareKeys).map((key) => byKey.get(key));
}

/** 正 ∪ 写しの記録。待機・セッション開始の表示はこれを読む。 */
export function readKnownRecords({ dir = DEFAULT_DIR, mirrorDir = defaultMirrorDir() } = {}) {
  const mirror = mirrorDir === null ? [] : readAllRecords(mirrorDir, { skipInvalid: true });
  return mergeRecords(readAllRecords(dir), mirror);
}

/** 1件の記録を正と写しから読む（別のworktreeで作られ、写しにしか無い記録も続けて扱えるように）。 */
export function readRecordMerged(dir, key, mirrorDir) {
  const primary = existsSync(recordPath(dir, key)) ? readRecord(dir, key) : null;
  let mirror = null;
  if (mirrorDir !== null && existsSync(recordPath(mirrorDir, key))) {
    try {
      mirror = readRecord(mirrorDir, key);
    } catch (error) {
      console.error(`記録の写しを読めませんでした（正だけを使います）: ${error.message.split('\n')[0]}`);
    }
  }
  const record = preferRecord(primary, mirror);
  if (record === null) throw new UsageError(`記録がありません: ${recordPath(dir, key)}（先に init）`);
  return record;
}

class GhError extends Error {}

function gh(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: GH_TIMEOUT_MS });
  } catch (error) {
    throw new GhError(`gh ${args.slice(0, 2).join(' ')} に失敗しました: ${error.message.split('\n')[0]}`);
  }
}

function findPrNumber(record) {
  if (Number.isInteger(record.pr)) return record.pr;
  if (record.gh?.pr) return record.gh.pr;
  const pr = findLinkedPr(listPrs(record.delegated_at), record.issue, record.delegated_at);
  if (pr === null) throw new GhError(`Issue #${record.issue} に紐づく PR が見つかりません（--pr で指定できます）`);
  return pr.number;
}

function fetchFinalize(record, prNumber) {
  const pr = JSON.parse(
    gh(['pr', 'view', String(prNumber), '--json', 'number,state,createdAt,mergedAt,closedAt,commits,closingIssuesReferences']),
  );
  const first = firstCiCommit(pr.commits ?? [], pr.createdAt);
  let runs = null;
  if (first) {
    const res = JSON.parse(gh(['api', `repos/{owner}/{repo}/commits/${first}/check-runs`, '--jq', '{check_runs: [.check_runs[] | {name, status, conclusion}]}']));
    runs = res.check_runs;
  }
  return buildGhSection(pr, record.issue, runs);
}

// ---------------------------------------------------------------- 計画からIssueを作る

const TASK_KEY = /^[a-z0-9-]{1,64}:[a-z0-9-]{1,64}$/;
const MARK = /^<!-- delegation-task-key: ([a-z0-9-]{1,64}:[a-z0-9-]{1,64}) digest: ([0-9a-f]{64}) -->$/m;

/** 計画から`<!-- delegation-task:<タスク名> -->`の区間を1つだけ取り出す。digestは本文（LF）のSHA-256。 */
export function extractPlanTask(plan, taskKey) {
  if (!TASK_KEY.test(taskKey ?? '') || typeof plan !== 'string') throw new UsageError('タスクは <機能名>:<タスク名>（小文字英数字とハイフン）で指定する');
  const text = plan.replace(/\r\n?/g, '\n');
  const start = `<!-- delegation-task:${taskKey.split(':')[1]} -->`;
  const from = text.indexOf(start);
  if (from < 0 || text.indexOf(start, from + 1) >= 0) throw new UsageError(`計画に ${start} がちょうど1つありません`);
  const to = text.indexOf('<!-- /delegation-task -->', from);
  const body = to < 0 ? '' : text.slice(from + start.length, to).replace(/^\n/, '').replace(/\n$/, '');
  if (body.trim() === '' || body.includes('<!-- delegation-task:')) throw new UsageError('タスクの区間が閉じていないか、空です');
  return { body, digest: createHash('sha256').update(body).digest('hex') };
}

/** Issueの本文。先頭の印で同じタスクのIssueを見分ける。 */
export function taskIssueBody(taskKey, digest, body) {
  return [
    `<!-- delegation-task-key: ${taskKey} digest: ${digest} -->`,
    body,
    '',
    '## 進め方',
    '',
    '`.agents/skills/devin-workflow/SKILL.md`に従う。ブランチは`devin/<内容>-<このIssueの番号>`。PR本文に`Closes #<このIssueの番号>`を書く。',
    '',
  ].join('\n');
}

/** 開いたIssueの中から同じタスクの印を探す。digestが違うものがあれば止める。 */
export function findTaskIssue(issues, taskKey, digest) {
  const same = issues.filter((issue) => MARK.exec(issue.body ?? '')?.[1] === taskKey);
  if (same.length > 1) throw new UsageError(`同じタスクの開いたIssueが${same.length}件あります: ${same.map((i) => `#${i.number}`).join(' ')}`);
  if (same.length === 0) return null;
  if (MARK.exec(same[0].body)[2] !== digest) throw new UsageError(`#${same[0].number} は同じタスクだが本文が計画と違う（計画を変えたなら、そのIssueを閉じてから作り直す）`);
  return same[0].number;
}

export function openTask({ planPath, taskKey, title, model, runner = 'local', level = null }, { dir = DEFAULT_DIR, mirrorDir = null, run = gh, git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), now = nowIso } = {}) {
  if (typeof planPath !== 'string' || !/^docs\/implementation-plans\/[a-z0-9-]+\.md$/.test(planPath)) throw new UsageError('計画は docs/implementation-plans/<機能名>.md を指定する');
  if (typeof title !== 'string' || title.trim() === '') throw new UsageError('--title が必要です');
  if (!MODELS.includes(model ?? '')) throw new UsageError(`--model は ${MODELS.join(' | ')} のどれか`);
  // 承認済みの計画はmainにマージされたもの。手元の未マージの版からは作らない。
  git(['fetch', '--quiet', 'origin', 'main']);
  const { body, digest } = extractPlanTask(git(['show', `origin/main:${planPath}`]), taskKey);
  const open = JSON.parse(run(['issue', 'list', '--state', 'open', '--limit', '200', '--search', `"delegation-task-key: ${taskKey}" in:body`, '--json', 'number,body']));
  const existing = findTaskIssue(open, taskKey, digest);
  if (existing !== null) return existing;
  const tmp = mkdtempSync(join(tmpdir(), 'delegation-task-'));
  let url;
  try {
    const file = join(tmp, 'body.md');
    writeFileSync(file, taskIssueBody(taskKey, digest, body), { mode: 0o600 });
    url = run(['issue', 'create', '--title', title, '--body-file', file]).trim();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const issue = Number(/\/issues\/(\d+)$/.exec(url)?.[1]);
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new GhError(`作ったIssueの番号を読めません: ${url}`);
  writeRecord(dir, { ...newRecord({ issue, title, model, runner, level, delegatedAt: now() }), task_key: taskKey }, { mirrorDir });
  return issue;
}

// ---------------------------------------------------------------- CLI

export function parseOptions(argv, spec) {
  const opts = {};
  const repeated = new Set(spec.repeated ?? []);
  const flags = new Set(spec.flags ?? []);
  const values = new Set([...(spec.values ?? []), ...repeated, 'dir', 'mirror-dir']);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].startsWith('--') ? argv[i].slice(2) : null;
    if (key !== null && flags.has(key)) {
      opts[key] = true;
    } else if (key !== null && values.has(key)) {
      const value = argv[i + 1];
      if (value === undefined) throw new UsageError(`--${key} に値がありません`);
      i += 1;
      if (repeated.has(key)) (opts[key] ??= []).push(value);
      else opts[key] = value;
    } else {
      throw new UsageError(`不明な引数: ${argv[i]}`);
    }
  }
  return opts;
}

function toInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new UsageError(`${name} は 0 以上の整数`);
  return n;
}

function issueArg(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new UsageError('Issue 番号が不正です');
  return n;
}

/** 写しの置き場。--mirror-dirが無く --dirを指定したとき（テスト・別の置き場）は写さない。 */
function mirrorOf(opts) {
  if (opts['mirror-dir'] !== undefined) return opts['mirror-dir'];
  return opts.dir === undefined ? defaultMirrorDir() : null;
}

/** 正か写しに記録があるか（別のworktreeで作った記録をinitし直さない）。 */
function existingRecordPath(dir, key, mirrorDir) {
  if (existsSync(recordPath(dir, key))) return recordPath(dir, key);
  if (mirrorDir !== null && existsSync(recordPath(mirrorDir, key))) return recordPath(mirrorDir, key);
  return null;
}

/** 秒までのISO 8601。 */
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** '<Issue番号>' → 番号、'pr-<PR番号>' → そのままの文字列。 */
export function targetArg(value) {
  const m = /^pr-(\d+)$/.exec(value ?? '');
  if (m !== null) {
    if (Number(m[1]) <= 0) throw new UsageError('PR 番号が不正です');
    return `pr-${Number(m[1])}`;
  }
  return issueArg(value);
}

export function runCli(argv) {
  const [command, ...rest] = argv;
  if (command === 'summary') {
    const opts = parseOptions(rest, { values: ['threshold', 'security-threshold'] });
    // statusと同じく正 ∪ 写しを数える（別のworktreeで進行中の委譲の指摘も、昇格の判定に入れる）
    const summary = summarize(readKnownRecords({ dir: opts.dir ?? DEFAULT_DIR, mirrorDir: mirrorOf(opts) }), {
      threshold: opts.threshold === undefined ? 3 : toInt(opts.threshold, '--threshold'),
      securityThreshold: opts['security-threshold'] === undefined ? 2 : toInt(opts['security-threshold'], '--security-threshold'),
    });
    console.log(formatSummary(summary));
    return;
  }
  if (command === 'open-task') {
    const [planPath, taskKey, ...taskArgs] = rest;
    const opts = parseOptions(taskArgs, { values: ['title', 'model', 'runner', 'level'] });
    console.log(openTask({ planPath, taskKey, title: opts.title, model: opts.model, runner: opts.runner ?? 'local',
      level: opts.level === undefined ? null : toInt(opts.level, '--level') }, { dir: opts.dir ?? DEFAULT_DIR, mirrorDir: mirrorOf(opts) }));
    return;
  }
  const [issueText, ...optArgs] = rest;
  if (command === 'init') {
    const target = targetArg(issueText);
    if (typeof target === 'string') {
      initSelf(Number(target.slice(3)), optArgs);
      return;
    }
    const issue = target;
    const opts = parseOptions(optArgs, { values: ['model', 'runner', 'level', 'title', 'delegated-at', 'follow-up-of'] });
    const dir = opts.dir ?? DEFAULT_DIR;
    const mirrorDir = mirrorOf(opts);
    if (opts.model === undefined) throw new UsageError('--model が必要です');
    if (!MODELS.includes(opts.model)) throw new UsageError(`--model は ${MODELS.join(' | ')} のどれか`);
    const existing = existingRecordPath(dir, issue, mirrorDir);
    if (existing !== null) throw new UsageError(`記録は作成済みです: ${existing}`);
    const followUpOf = opts['follow-up-of'] === undefined ? null : targetArg(opts['follow-up-of']);
    let { title, 'delegated-at': delegatedAt } = opts;
    if (title === undefined || delegatedAt === undefined) {
      const info = JSON.parse(gh(['issue', 'view', String(issue), '--json', 'title,createdAt']));
      title ??= info.title;
      delegatedAt ??= info.createdAt;
    }
    const level = opts.level === undefined ? null : toInt(opts.level, '--level');
    const record = newRecord({ issue, title, model: opts.model, runner: opts.runner ?? 'local', level, delegatedAt, followUpOf });
    console.log(writeRecord(dir, record, { mirrorDir }));
    return;
  }
  if (command === 'review') {
    const issue = targetArg(issueText);
    const opts = parseOptions(optArgs, { values: ['round', 'sha', 'verdict', 'reviewed-at'], flags: ['posted'], repeated: ['finding'] });
    const dir = opts.dir ?? DEFAULT_DIR;
    const mirrorDir = mirrorOf(opts);
    if (opts.round === undefined) throw new UsageError('--round が必要です');
    const record = addReview(readRecordMerged(dir, issue, mirrorDir), {
      round: toInt(opts.round, '--round'),
      sha: opts.sha,
      verdict: opts.verdict,
      posted: opts.posted === true,
      findings: (opts.finding ?? []).map(parseFinding),
      at: opts['reviewed-at'] ?? nowIso(),
    });
    console.log(writeRecord(dir, record, { mirrorDir }));
    return;
  }
  if (command === 'finalize') {
    const issue = targetArg(issueText);
    const opts = parseOptions(optArgs, { values: ['pr'] });
    const dir = opts.dir ?? DEFAULT_DIR;
    const mirrorDir = mirrorOf(opts);
    const record = readRecordMerged(dir, issue, mirrorDir);
    const prNumber = opts.pr === undefined ? findPrNumber(record) : issueArg(opts.pr);
    console.log(writeRecord(dir, { ...record, ...fetchFinalize(record, prNumber) }, { mirrorDir }));
    return;
  }
  throw new UsageError('usage: delegation.mjs <open-task|init|review|finalize|summary|status> …（詳細はファイル先頭のコメント）');
}

function initSelf(pr, optArgs) {
  const opts = parseOptions(optArgs, { values: ['model', 'runner', 'level', 'title', 'created-at'] });
  const dir = opts.dir ?? DEFAULT_DIR;
  const mirrorDir = mirrorOf(opts);
  const key = `pr-${pr}`;
  if (opts.model !== undefined && !MODELS.includes(opts.model)) throw new UsageError(`--model は ${MODELS.join(' | ')} のどれか`);
  const existing = existingRecordPath(dir, key, mirrorDir);
  if (existing !== null) throw new UsageError(`記録は作成済みです: ${existing}`);
  let { title, 'created-at': createdAt, runner } = opts;
  if (title === undefined || createdAt === undefined || runner === undefined) {
    const info = JSON.parse(gh(['pr', 'view', String(pr), '--json', 'title,createdAt,author']));
    title ??= info.title;
    createdAt ??= info.createdAt;
    runner ??= runnerFromAuthor(info.author);
  }
  const level = opts.level === undefined ? null : toInt(opts.level, '--level');
  console.log(writeRecord(dir, newSelfRecord({ pr, title, model: opts.model ?? 'unknown', runner, level, createdAt }), { mirrorDir }));
}

function exitWith(error) {
  console.error(error.message);
  process.exit(error instanceof UsageError ? 2 : error instanceof GhError ? 3 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'status') {
    // statusはwait-for-devin-pr.mjsを使い、あちらがこのファイルを読むため、静的に読み込むと循環する。
    // ここでawaitすると、このファイルの評価が終わらないまま相手の読み込みを待ち、止まってしまう。
    // 評価を終えてからthenで実行する。
    import('./delegation-status.mjs')
      .then(({ runStatusCli }) => runStatusCli(process.argv.slice(3)))
      .catch(exitWith);
  } else {
    try {
      runCli(process.argv.slice(2));
    } catch (error) {
      exitWith(error);
    }
  }
}
