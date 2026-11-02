#!/usr/bin/env node
// 論点の記録（docs/discussions/<機能名>.md）と進み具合（<機能名>.progress.json）を扱い、確認のページを作る。
//
// 使い方（リポジトリのルートで）:
//   node .claude/scripts/discussion.mjs init <機能名> --level L2|L3 --title <名前>
//   node .claude/scripts/discussion.mjs check [<機能名>]
//   node .claude/scripts/discussion.mjs page <機能名> --out <path> [--review <断片のpath>] [--next-round]
//   node .claude/scripts/discussion.mjs set-page <機能名> <URL>
//   node .claude/scripts/discussion.mjs answers <JSONのpath> <機能名> [--json]
//   node .claude/scripts/discussion.mjs stage <機能名> <工程> <状態> [--reason <理由>] [--pr <番号>] [--doc <path>]
//   node .claude/scripts/discussion.mjs status [--hook]
//
// 終了コード: 0 / 1（記録の形の誤り・答えがまだ無い） / 2（引数の誤り）
//
// 方針:
// - 読み解き・形の確認・ページの中身・答えの突き合わせ・工程の移り方は純粋関数にし、テストで固定する。
// - 正式な記録はリポジトリのMarkdownとJSON。ページは表示と回答の窓口で、ページを出す・読むのはClaude CodeのArtifactの道具が行う。
// - ページの文章はページ側でtextContentで描く。ここではJSONを埋め込むときに`<`を<にするだけにする。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayInTz, harnessTz } from '../lib/harness-time.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CLAUDE_PROJECT_DIR || resolve(here, '../..');
export const DEFAULT_DIR = join(ROOT, 'docs/discussions');
export const TEMPLATE_PATH = join(here, 'discussion-page.html');

export class UsageError extends Error {}

/** 工程。順番が進み具合の帯の並び。 */
export const STAGES = [
  { id: 'requirements', label: '要件' },
  { id: 'design', label: '設計' },
  { id: 'plan', label: '実装計画・試験観点' },
  { id: 'implement', label: '実装' },
  { id: 'review', label: 'レビュー' },
  { id: 'merge', label: 'マージ' },
  { id: 'reflect', label: '振り返り' },
];
export const STAGE_STATES = {
  pending: '未着手',
  active: '進行中',
  waiting: '回答待ち',
  approval: '承認待ち',
  done: '完了',
  skipped: '省略',
};
/** 完了にするとき、承認したPRの番号が要る工程（ユーザーが承認する工程）。 */
const APPROVAL_STAGES = new Set(['requirements', 'design']);

export const POINT_STATES = ['回答待ち', '仮決定', '後の工程へ', '決定', '取り下げ'];
const PHASES = ['要件', '設計', '実装', '運用'];
const PRIORITIES = ['高', '中', '低'];
/** 相談の種類。画面は見た目と流れ、アプリの決まりは何ができるか、APIは返す形・エラー・再送、設計はDB・内部の作り・範囲と進め方。 */
export const KINDS = ['画面', 'アプリの決まり', 'API', '設計'];
const KNOWN_FIELDS = new Set([
  '工程',
  '種類',
  '優先度',
  '状態',
  'なぜ今',
  '根拠',
  '選択肢',
  '推奨',
  '決定',
  '推奨と同じか',
  '理由',
  '選ばなかった理由',
  '反映先',
  '決めた日',
  '前の決定',
]);
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const FEATURE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

// ── 論点の記録 ─────────────────────────────────────────────

/**
 * 論点の記録（Markdown）を読み解く。形の誤りは投げずにproblemsに集める（checkRecordが使う）。
 * @param {string} md
 */
export function parseRecord(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const record = {
    title: '',
    header: {},
    background: '',
    premises: [],
    points: [],
    problems: [],
  };
  let section = null;
  let point = null;
  let option = null;
  let figure = null; // 読んでいる途中のmermaidの図の行
  const background = [];

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const at = `${index + 1}行目`;
    // 図の中の行は項目として読まない（「- 」で始まっていても）
    if (figure) {
      if (line.trim() === '```') {
        point.figures.push(figure.join('\n'));
        figure = null;
      } else figure.push(raw);
      return;
    }
    if (line.startsWith('# ')) {
      record.title = line.slice(2).replace(/^論点の記録:\s*/, '').trim();
      return;
    }
    if (line.startsWith('## ')) {
      section = line.slice(3).trim();
      point = null;
      option = null;
      return;
    }
    if (line.trim() === '') return;

    if (section === null) {
      const m = line.match(/^- ([^:]+):\s*(.*)$/);
      if (m) record.header[m[1].trim()] = m[2].trim();
      return;
    }
    if (section === '背景') {
      background.push(line.trim());
      return;
    }
    if (section === '前提') {
      const m = line.match(/^- (.*)$/);
      if (m) record.premises.push(m[1].trim());
      else record.problems.push(`前提: ${at}は「- 」で始まる箇条書きにする`);
      return;
    }
    if (section !== '論点') return;

    if (line.startsWith('### ')) {
      point = { title: line.slice(4).trim(), id: '', fields: {}, options: [], figures: [], line: index + 1 };
      option = null;
      record.points.push(point);
      return;
    }
    if (!point) {
      record.problems.push(`論点: ${at}が、どの論点の見出し（### ）の下にもない`);
      return;
    }
    if (line.trim() === '```mermaid') {
      figure = [];
      option = null;
      return;
    }
    const id = line.match(/^<!--\s*id:\s*(\S+)\s*-->$/);
    if (id) {
      point.id = id[1];
      return;
    }
    const opt = line.match(/^ {2}- ([A-Z])\) (.+)$/);
    if (opt) {
      option = { key: opt[1], label: opt[2].trim(), pros: '', cons: '' };
      point.options.push(option);
      return;
    }
    const sub = line.match(/^ {4}- (利点|欠点):\s*(.*)$/);
    if (sub && option) {
      option[sub[1] === '利点' ? 'pros' : 'cons'] = sub[2].trim();
      return;
    }
    const field = line.match(/^- ([^:]+):\s*(.*)$/);
    if (field) {
      const key = field[1].trim();
      if (!KNOWN_FIELDS.has(key)) record.problems.push(`「${point.title}」: ${at}の「${key}」は知らない項目`);
      point.fields[key] = field[2].trim();
      option = null;
      return;
    }
    record.problems.push(`「${point.title}」: ${at}を読めない（「- 項目: 値」か選択肢の形にする）`);
  });
  if (figure) record.problems.push(`「${point.title}」: mermaidの図が \`\`\` で閉じていない`);
  record.background = background.join('\n');
  return record;
}

/** 推奨・決定の先頭の記号（「B（理由）」→「B」）。記号で始まらなければnull。 */
export function choiceKey(value) {
  const m = String(value ?? '').match(/^([A-Z])(?![A-Za-z])/);
  return m ? m[1] : null;
}

/**
 * 論点の記録の形を確かめる。問題の一覧を返す（空なら通る）。
 * @param {ReturnType<typeof parseRecord>} record
 * @param {string} [feature] ファイル名から取った機能名。header の機能名と突き合わせる
 */
export function checkRecord(record, feature) {
  const problems = [...record.problems];
  if (!record.title) problems.push('先頭に「# 論点の記録: <名前>」が無い');
  if (feature && record.header['機能名'] !== feature) {
    problems.push(`「- 機能名: ${feature}」が無い（ファイル名と合わせる）`);
  }
  const seen = new Set();
  for (const p of record.points) {
    const name = `「${p.title}」`;
    const f = p.fields;
    if (!p.id) problems.push(`${name}: <!-- id: ... --> が無い`);
    else if (!ID_PATTERN.test(p.id)) problems.push(`${name}: id「${p.id}」は英小文字・数字・ハイフンにする`);
    else if (seen.has(p.id)) problems.push(`${name}: id「${p.id}」がほかの論点と重なっている`);
    seen.add(p.id);
    if (!PHASES.includes(f['工程'])) problems.push(`${name}: 工程は${PHASES.join('・')}のどれか`);
    if (!PRIORITIES.includes(f['優先度'])) problems.push(`${name}: 優先度は${PRIORITIES.join('・')}のどれか`);
    if (f['種類'] !== undefined && !KINDS.includes(f['種類'])) problems.push(`${name}: 種類は${KINDS.join('・')}のどれか`);
    else if (f['種類'] === undefined && f['状態'] === '回答待ち') {
      // 今までの記録（仮決定・後の工程へ・決定）は種類が無くても通す。回答待ちに変えるときに書き足す
      problems.push(`${name}: 回答待ちに変えるときは、種類（${KINDS.join('・')}）を書き足す`);
    }
    if (!POINT_STATES.includes(f['状態'])) {
      problems.push(`${name}: 状態は${POINT_STATES.join('・')}のどれか`);
      continue;
    }
    const keys = p.options.map((o) => o.key);
    if (new Set(keys).size !== keys.length) problems.push(`${name}: 選択肢の記号が重なっている`);
    if (f['状態'] === '回答待ち' || f['状態'] === '仮決定') {
      if (p.options.length < 2) problems.push(`${name}: ${f['状態']}の論点には選択肢を2つ以上書く`);
      const rec = choiceKey(f['推奨']);
      if (!rec) problems.push(`${name}: 推奨を「B（理由）」の形で書く`);
      else if (!keys.includes(rec)) problems.push(`${name}: 推奨の${rec}が選択肢に無い`);
    }
    if (f['状態'] === '決定') {
      if (!f['決定']) problems.push(`${name}: 決定の論点には「決定」を書く`);
      else if (p.options.length > 0 && !/^その他/.test(f['決定'])) {
        const key = choiceKey(f['決定']);
        if (!key || !keys.includes(key)) {
          problems.push(`${name}: 決定は選択肢の記号（${keys.join('・')}）か「その他: <答え>」で書く`);
        }
      }
      if (p.options.length >= 2 && !f['選ばなかった理由']) {
        problems.push(`${name}: 決定の論点には「選ばなかった理由」を書く（聞いていなければ「理由は聞いていない」）`);
      }
    }
  }
  return problems;
}

// ── 進み具合 ───────────────────────────────────────────────

/**
 * 新しい進み具合。L2は要件定義書を作らないので要件を省略にし、設計から始める。
 * @param {{feature: string, title: string, level: 'L2'|'L3', now: string}} args
 */
export function newProgress({ feature, title, level, now }) {
  if (!FEATURE_PATTERN.test(feature)) throw new UsageError(`機能名「${feature}」は英小文字・数字・ハイフンにする`);
  if (level !== 'L2' && level !== 'L3') throw new UsageError('--level は L2 か L3');
  const stages = {};
  for (const s of STAGES) stages[s.id] = { state: 'pending' };
  if (level === 'L2') {
    stages.requirements = { state: 'skipped', reason: 'L2なので要件定義書は作らない' };
    stages.design = { state: 'active' };
  } else {
    stages.requirements = { state: 'active' };
  }
  return { feature, title, level, page: null, round: 1, stages, updated_at: now };
}

/** 新しい論点の記録のひな形。 */
export function newRecordMarkdown({ feature, title }) {
  return `# 論点の記録: ${title}

- 機能名: ${feature}
- 確認のページ: （まだ無い）
- 進み具合: docs/discussions/${feature}.progress.json

## 背景

（ページの冒頭に出す。何を作るか、なぜ今かを2〜5文で）

## 前提

## 論点
`;
}

/**
 * 工程の状態を移す。元の進み具合は変えず、新しいものを返す。
 * @param {object} progress
 * @param {string} stage
 * @param {string} state
 * @param {{reason?: string, pr?: number, docs?: string[], now: string}} opts
 */
export function setStage(progress, stage, state, { reason, pr, docs, now }) {
  if (!STAGES.some((s) => s.id === stage)) {
    throw new UsageError(`工程は ${STAGES.map((s) => s.id).join(' / ')} のどれか`);
  }
  if (!(state in STAGE_STATES)) throw new UsageError(`状態は ${Object.keys(STAGE_STATES).join(' / ')} のどれか`);
  if (state === 'skipped' && !reason) throw new UsageError('省略（skipped）には --reason が要る');
  if (state === 'done' && APPROVAL_STAGES.has(stage) && !pr) {
    throw new UsageError(`${stage} の完了には、承認したPRの番号（--pr）が要る`);
  }
  const prev = progress.stages[stage] ?? {};
  const next = { state };
  if (reason) next.reason = reason;
  const allDocs = [...new Set([...(prev.docs ?? []), ...(docs ?? [])])];
  if (allDocs.length > 0) next.docs = allDocs;
  if (state === 'done' && pr) next.approved = { pr, at: dayInTz(new Date(now)) };
  return { ...progress, stages: { ...progress.stages, [stage]: next }, updated_at: now };
}

/** 完了・省略していない最初の工程。全部済んでいればnull。 */
export function currentStage(progress) {
  for (const s of STAGES) {
    const st = progress.stages?.[s.id]?.state ?? 'pending';
    if (st !== 'done' && st !== 'skipped') return { ...s, state: st };
  }
  return null;
}

// ── 確認のページ ───────────────────────────────────────────

/** 工程ごとの「決めること」と「答えたあと」。実装・レビュー・マージ・振り返りは同じ文。 */
const NOW_TEXT = {
  requirements: { decide: '何を作るか', waiting: '答えを記録に写し、要件定義書を書いて承認をお願いする', approval: 'PRのマージで承認。次は設計' },
  design: { decide: 'どう作るか', waiting: '答えを記録に写し、設計書を書いて承認をお願いする', approval: 'PRのマージで承認。次は実装計画と試験観点' },
  plan: { decide: 'どの順で作り、何を試すか', waiting: '答えを記録に写し、計画を直す', approval: '今どおり進める' },
  work: { decide: '作りながら出た問い', waiting: '答えを記録に写し、作業を続ける', approval: '今どおり進める' },
};

/**
 * ページの上の「いまの確認」。いまの工程（完了・省略していない最初の工程）と状態から作る。
 * @param {object} progress
 * @param {Array<{kind: string}>} open 回答待ちの問い
 */
export function buildNow(progress, open) {
  const cur = currentStage(progress);
  if (!cur) return { stage: null, stageLabel: '', state: '', stateLabel: '', decide: '', after: '全部の工程が済んでいる', count: open.length, kinds: [] };
  const text = NOW_TEXT[cur.id] ?? NOW_TEXT.work;
  const kinds = KINDS.map((k) => ({ kind: k, count: open.filter((q) => q.kind === k).length })).filter((k) => k.count > 0);
  const unknown = open.filter((q) => !KINDS.includes(q.kind)).length;
  if (unknown > 0) kinds.push({ kind: '種類なし', count: unknown });
  return {
    stage: cur.id,
    stageLabel: cur.label,
    state: cur.state,
    stateLabel: STAGE_STATES[cur.state] ?? cur.state,
    decide: text.decide,
    after: cur.state === 'approval' ? text.approval : text.waiting,
    count: open.length,
    kinds,
  };
}

/**
 * ページに埋め込む中身。番号は回答待ちの論点に上から1, 2, 3と振る（チャットの「1A 2B」と同じ番号）。
 * @param {ReturnType<typeof parseRecord>} record
 * @param {object} progress
 * @param {{now: string}} opts
 */
export function buildPageState(record, progress, { now }) {
  const byState = (s) => record.points.filter((p) => p.fields['状態'] === s);
  const option = (o) => ({ key: o.key, label: o.label, pros: o.pros, cons: o.cons });
  const extras = (p) => ({
    kind: p.fields['種類'] ?? '',
    phase: p.fields['工程'] ?? '',
    figures: p.figures ?? [],
  });
  const open = byState('回答待ち').map((p, i) => ({
    n: i + 1,
    id: p.id,
    title: p.title,
    ...extras(p),
    why: p.fields['なぜ今'] ?? '',
    basis: p.fields['根拠'] ?? '',
    options: p.options.map(option),
    recommended: choiceKey(p.fields['推奨']),
    recommendedText: p.fields['推奨'] ?? '',
  }));
  return {
    feature: progress.feature,
    title: record.title || progress.title,
    level: progress.level,
    round: progress.round ?? 1,
    generatedAt: now,
    stages: STAGES.map((s) => {
      const st = progress.stages?.[s.id] ?? { state: 'pending' };
      return { id: s.id, label: s.label, state: st.state, stateLabel: STAGE_STATES[st.state] ?? st.state, reason: st.reason ?? '' };
    }),
    now: buildNow(progress, open),
    background: record.background,
    premises: record.premises,
    decided: byState('決定').map((p) => ({ id: p.id, title: p.title, decision: p.fields['決定'] ?? '' })),
    open,
    provisional: byState('仮決定').map((p) => ({
      id: p.id,
      title: p.title,
      ...extras(p),
      recommended: choiceKey(p.fields['推奨']),
      recommendedText: p.fields['推奨'] ?? '',
      options: p.options.map(option),
    })),
    later: byState('後の工程へ').map((p) => ({ id: p.id, title: p.title, phase: p.fields['工程'] ?? '', priority: p.fields['優先度'] ?? '' })),
  };
}

/** JSONを<script>に埋め込める形にする（`</script>`で途切れないように）。 */
export function embedJson(value) {
  return JSON.stringify(value).replace(/[<\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * ひな形にページの中身と設計の説明を入れる。
 * @param {string} template
 * @param {object} state buildPageStateの結果
 * @param {string} [reviewHtml] 設計の説明（Claudeが書いたHTMLの断片）。承認を頼むときだけ
 */
export function renderPage(template, state, reviewHtml = '') {
  const parts = ['__TITLE__', '/*__STATE__*/null', '<!--__REVIEW__-->'];
  for (const p of parts) if (!template.includes(p)) throw new Error(`ひな形に ${p} が無い`);
  return template
    .replace('__TITLE__', () => escapeHtml(state.title))
    .replace('/*__STATE__*/null', () => embedJson(state))
    .replace('<!--__REVIEW__-->', () => reviewHtml);
}

// ── 答え ───────────────────────────────────────────────────

/**
 * ページのデータベースから読んだ「送った答えの写し」（submissions/r<回>）を、記録の論点と突き合わせる。
 * @param {unknown} raw 写しの文書。{data: {...}} で包まれていてもよい
 * @param {ReturnType<typeof parseRecord>} record
 * @param {number} round 今の回
 */
export function matchAnswers(raw, record, round) {
  const doc = raw && typeof raw === 'object' && 'data' in raw && !('answers' in raw) ? raw.data : raw;
  if (!doc || typeof doc !== 'object' || typeof doc.answers !== 'object' || doc.answers === null) {
    return { ok: false, reason: 'まだ送られていない（答えの写しが無い）' };
  }
  if (Number(doc.round) !== Number(round)) {
    return { ok: false, reason: `今の回（${round}）の写しではない（写しは${doc.round}回目）` };
  }
  const points = new Map(record.points.map((p) => [p.id, p]));
  const openOrder = record.points.filter((p) => p.fields['状態'] === '回答待ち').map((p) => p.id);
  const items = [];
  const warnings = [];
  for (const [id, a] of Object.entries(doc.answers)) {
    const p = points.get(id);
    if (!p) {
      warnings.push(`記録に無い論点「${id}」への答えがある`);
      continue;
    }
    const other = String(a?.other ?? '').trim();
    const answer = {
      id,
      n: openOrder.includes(id) ? openOrder.indexOf(id) + 1 : null,
      title: p.title,
      state: p.fields['状態'],
      // 「その他」は選択肢に無い答えなので、書かれていれば記号より優先する（記号と両方を決定に見せない）
      choice: other ? null : (a?.choice ?? null),
      other,
      reason: '',
      question: String(a?.question ?? '').trim(),
      objection: String(a?.objection ?? '').trim(),
      recommended: choiceKey(p.fields['推奨']),
    };
    // 理由は推奨と違う案を選んだときだけ意味を持つ。推奨に戻したあとに残った古い理由は捨てる
    const rawReason = String(a?.reason ?? '').trim();
    if (rawReason && !other && answer.choice && answer.choice !== answer.recommended) answer.reason = rawReason;
    if (answer.choice && !p.options.some((o) => o.key === answer.choice)) {
      warnings.push(`「${p.title}」の答え ${answer.choice} は選択肢に無い`);
    }
    if (p.fields['状態'] === '決定' && answer.choice && choiceKey(p.fields['決定']) !== answer.choice) {
      warnings.push(`「${p.title}」は記録では${p.fields['決定']}に決まっているが、写しの答えは${answer.choice}（送ったあとに変えた可能性）`);
    }
    items.push(answer);
  }
  for (const id of openOrder) {
    if (!(id in doc.answers)) warnings.push(`回答待ちの「${points.get(id).title}」に答えが無い`);
  }
  items.sort((x, y) => (x.n ?? 999) - (y.n ?? 999));
  const added = Array.isArray(doc.added)
    ? doc.added.map((x) => ({ title: String(x?.title ?? '').trim(), body: String(x?.body ?? '').trim() })).filter((x) => x.title || x.body)
    : [];
  return { ok: true, round: doc.round, submittedAt: doc.submittedAt ?? null, submittedBy: doc.submittedBy ?? null, items, added, warnings };
}

/** ISOの日時を、ハーネスの時間帯（既定は日本時間）の「YYYY-MM-DD HH:MM」にする。読めなければそのまま返す。 */
export function localTime(iso, tz = harnessTz()) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return iso ?? '不明';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** matchAnswersの結果を読みやすい行にする。 */
export function formatAnswers(result) {
  if (!result.ok) return result.reason;
  const lines = [`${result.round}回目の答え（送った日時: ${localTime(result.submittedAt)}）`];
  for (const a of result.items) {
    const head = a.n ? `${a.n}. ` : '';
    const parts = [];
    if (a.choice) parts.push(a.choice + (a.recommended && a.choice !== a.recommended ? `（推奨は${a.recommended}）` : a.recommended ? '（推奨どおり）' : ''));
    if (a.other) parts.push(`その他: ${a.other}`);
    if (a.reason) parts.push(`理由: ${a.reason}`);
    if (a.question) parts.push(`質問: ${a.question}`);
    if (a.objection) parts.push(`異議: ${a.objection}`);
    if (parts.length === 0) continue;
    lines.push(`- ${head}${a.title} [${a.id}]（${a.state}）: ${parts.join(' / ')}`);
  }
  for (const x of result.added) lines.push(`- 足した論点: ${x.title}${x.body ? ` ／ ${x.body}` : ''}`);
  for (const w of result.warnings) lines.push(`警告: ${w}`);
  return lines.join('\n');
}

// ── 進行中の一覧 ───────────────────────────────────────────

/**
 * 完了していない機能の行。
 * @param {Array<{progress: object, record: ReturnType<typeof parseRecord> | null}>} features
 */
export function buildStatusLines(features) {
  const lines = [];
  for (const { progress, record } of features) {
    const cur = currentStage(progress);
    if (!cur) continue;
    const waiting = record ? record.points.filter((p) => p.fields['状態'] === '回答待ち').length : 0;
    let line = `- ${progress.title}（${progress.feature}、${progress.level}）: ${cur.label}が${STAGE_STATES[cur.state] ?? cur.state}`;
    if (cur.state === 'waiting') line += `（回答待ち ${waiting}問、${progress.round ?? 1}回目）`;
    if (progress.page) line += ` ページ: ${progress.page}`;
    if (cur.state === 'waiting') {
      line += `\n  → ArtifactData で submissions/r${progress.round ?? 1} を読み、届いていれば answers で取り出して記録する`;
    }
    lines.push(line);
  }
  return lines;
}

export function formatStatus(lines) {
  if (lines.length === 0) return '';
  return ['進行中の機能（docs/discussions の進み具合から。ユーザーの今の依頼を優先する）:', ...lines].join('\n');
}

// ── ファイル ───────────────────────────────────────────────

const recordPath = (dir, feature) => join(dir, `${feature}.md`);
const progressPath = (dir, feature) => join(dir, `${feature}.progress.json`);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
function loadFeature(dir, feature) {
  const rp = recordPath(dir, feature);
  const pp = progressPath(dir, feature);
  if (!existsSync(rp) || !existsSync(pp)) {
    throw new UsageError(`${feature} の記録が無い（先に init する）: ${rp}`);
  }
  return { record: parseRecord(readFileSync(rp, 'utf8')), progress: readJson(pp) };
}
export function listFeatures(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.progress.json'))
    .map((f) => f.slice(0, -'.progress.json'.length))
    .sort();
}

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (['next-round', 'json', 'hook'].includes(key)) opts[key] = true;
      else {
        if (i + 1 >= argv.length) throw new UsageError(`${a} に値が無い`);
        opts[key] = opts[key] && key === 'doc' ? [...[].concat(opts[key]), argv[++i]] : argv[++i];
      }
    } else positional.push(a);
  }
  return { positional, opts };
}

export function main(argv, { dir = process.env.DISCUSSION_DIR || DEFAULT_DIR, out = console.log, err = console.error } = {}) {
  const [cmd, ...rest] = argv;
  const { positional, opts } = parseArgs(rest);
  const need = (n, usage) => {
    if (positional.length < n) throw new UsageError(`使い方: discussion.mjs ${usage}`);
  };
  switch (cmd) {
    case 'init': {
      need(1, 'init <機能名> --level L2|L3 --title <名前>');
      const feature = positional[0];
      if (!opts.title) throw new UsageError('--title が要る');
      mkdirSync(dir, { recursive: true });
      const rp = recordPath(dir, feature);
      const pp = progressPath(dir, feature);
      if (existsSync(rp) || existsSync(pp)) {
        out(`${feature} の記録はもうある。何もしない`);
        return 0;
      }
      const progress = newProgress({ feature, title: opts.title, level: opts.level, now: nowIso() });
      writeFileSync(rp, newRecordMarkdown({ feature, title: opts.title }));
      writeJson(pp, progress);
      out(`作った: ${rp} / ${pp}`);
      return 0;
    }
    case 'check': {
      const features = positional.length > 0 ? positional : listFeatures(dir);
      let failed = false;
      for (const feature of features) {
        const { record } = loadFeature(dir, feature);
        const problems = checkRecord(record, feature);
        if (problems.length > 0) {
          failed = true;
          err(`${feature}:`);
          for (const p of problems) err(`  - ${p}`);
        }
      }
      if (!failed) out(`記録の形に問題なし（${features.length}件）`);
      return failed ? 1 : 0;
    }
    case 'page': {
      need(1, 'page <機能名> --out <path> [--review <断片のpath>] [--next-round]');
      if (!opts.out) throw new UsageError('--out が要る');
      const feature = positional[0];
      let { record, progress } = loadFeature(dir, feature);
      const problems = checkRecord(record, feature);
      if (problems.length > 0) {
        err(`${feature} の記録の形に問題があるので、ページを作らない:`);
        for (const p of problems) err(`  - ${p}`);
        return 1;
      }
      const review = opts.review ? readFileSync(opts.review, 'utf8') : '';
      // 回は、ページを書き出せたあとで進める（途中で失敗すると、公開中のページの答えを別の回として読めなくなるため）
      if (opts['next-round']) progress = { ...progress, round: (progress.round ?? 1) + 1, updated_at: nowIso() };
      const state = buildPageState(record, progress, { now: nowIso() });
      mkdirSync(dirname(resolve(opts.out)), { recursive: true });
      writeFileSync(opts.out, renderPage(readFileSync(TEMPLATE_PATH, 'utf8'), state, review));
      if (opts['next-round']) writeJson(progressPath(dir, feature), progress);
      out(`ページを作った: ${opts.out}（${state.round}回目、回答待ち ${state.open.length}問）`);
      return 0;
    }
    case 'set-page': {
      need(2, 'set-page <機能名> <URL>');
      const [feature, url] = positional;
      if (!/^https:\/\/claude\.ai\//.test(url)) throw new UsageError('URLは https://claude.ai/ で始まる確認のページのリンク');
      const { progress } = loadFeature(dir, feature);
      writeJson(progressPath(dir, feature), { ...progress, page: url, updated_at: nowIso() });
      const rp = recordPath(dir, feature);
      const md = readFileSync(rp, 'utf8').replace(/^- 確認のページ:.*$/m, `- 確認のページ: ${url}`);
      writeFileSync(rp, md);
      out(`確認のページを記録した: ${url}`);
      return 0;
    }
    case 'answers': {
      need(2, 'answers <JSONのpath> <機能名> [--json]');
      const [jsonPath, feature] = positional;
      const { record, progress } = loadFeature(dir, feature);
      let raw;
      try {
        raw = readJson(jsonPath);
      } catch (e) {
        err(`答えのJSONを読めない: ${e.message}`);
        return 1;
      }
      const result = matchAnswers(raw, record, progress.round ?? 1);
      out(opts.json ? JSON.stringify(result, null, 2) : formatAnswers(result));
      return result.ok ? 0 : 1;
    }
    case 'stage': {
      need(3, 'stage <機能名> <工程> <状態> [--reason <理由>] [--pr <番号>] [--doc <path>]');
      const [feature, stage, state] = positional;
      const { progress } = loadFeature(dir, feature);
      const pr = opts.pr ? Number(opts.pr) : undefined;
      if (opts.pr && !Number.isInteger(pr)) throw new UsageError('--pr は数');
      const docs = opts.doc ? [].concat(opts.doc) : undefined;
      const next = setStage(progress, stage, state, { reason: opts.reason, pr, docs, now: nowIso() });
      writeJson(progressPath(dir, feature), next);
      out(`${feature}: ${stage} を ${STAGE_STATES[state]} にした`);
      return 0;
    }
    case 'status': {
      const features = listFeatures(dir).map((feature) => {
        const progress = readJson(progressPath(dir, feature));
        const rp = recordPath(dir, feature);
        return { progress, record: existsSync(rp) ? parseRecord(readFileSync(rp, 'utf8')) : null };
      });
      const text = formatStatus(buildStatusLines(features));
      if (opts.hook) {
        if (text !== '') out(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
      } else out(text === '' ? '進行中の機能は無い' : text);
      return 0;
    }
    default:
      throw new UsageError('使い方: discussion.mjs init|check|page|set-page|answers|stage|status ...（先頭のコメントを参照）');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(e.message);
      process.exitCode = 2;
    } else throw e;
  }
}

