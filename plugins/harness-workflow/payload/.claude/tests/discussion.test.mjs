// discussion.mjs（論点の記録・進み具合・確認のページ）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STAGES,
  UsageError,
  KINDS,
  buildNow,
  buildPageState,
  buildStatusLines,
  checkRecord,
  choiceKey,
  currentStage,
  embedJson,
  formatAnswers,
  localTime,
  main,
  matchAnswers,
  newProgress,
  newRecordMarkdown,
  parseRecord,
  renderPage,
  setStage,
} from '../scripts/discussion.mjs';

const NOW = '2026-10-04T05:00:00.000Z';

const RECORD = `# 論点の記録: 見本の機能

- 機能名: sample
- 確認のページ: （まだ無い）
- 進み具合: docs/discussions/sample.progress.json

## 背景

1行目の背景。
2行目の背景。

## 前提

- 精算はアプリの外で受け渡す。

## 論点

### 取り消したあと、もう一度完了にできるか

<!-- id: reconfirm -->

- 工程: 設計
- 種類: アプリの決まり
- 優先度: 高
- 状態: 回答待ち
- なぜ今: ボタンが変わる。
- 根拠: 詳細設計に書いていない。
- 選択肢:
  - A) できる
    - 利点: すぐ戻せる
    - 欠点: 記録が消える
  - B) できない
    - 利点: 記録が残る
    - 欠点: 手間が増える
- 推奨: B（記録が残る）

### 0円のとき確認を作るか

<!-- id: zero-yen -->

- 工程: 要件
- 種類: 画面
- 優先度: 高
- 状態: 回答待ち
- 選択肢:
  - A) 作る
  - B) 作らない
- 推奨: A（区切りが残る）

### 理由を入力させるか

<!-- id: cancel-reason -->

- 工程: 設計
- 優先度: 中
- 状態: 仮決定
- 選択肢:
  - A) させない
  - B) 任意
- 推奨: A（会話で伝わる）

### 何年残すか

<!-- id: retention -->

- 工程: 運用
- 優先度: 低
- 状態: 後の工程へ

### 一覧に件数を出すか

<!-- id: count -->

- 工程: 要件
- 優先度: 高
- 状態: 決定
- 選択肢:
  - A) 出す
  - B) 出さない
- 推奨: A（すぐ分かる）
- 決定: A
- 推奨と同じか: 同じ
- 選ばなかった理由: B（件数がすぐ分からないため）
`;

const withPoint = (md, from, to) => md.replace(from, to);

test('D-01 記録の読み解き: 見出し・背景・前提・論点・選択肢の入れ子・idを読む', () => {
  const r = parseRecord(RECORD);
  assert.equal(r.title, '見本の機能');
  assert.equal(r.header['機能名'], 'sample');
  assert.equal(r.background, '1行目の背景。\n2行目の背景。');
  assert.deepEqual(r.premises, ['精算はアプリの外で受け渡す。']);
  assert.equal(r.points.length, 5);
  const p = r.points[0];
  assert.equal(p.id, 'reconfirm');
  assert.equal(p.fields['状態'], '回答待ち');
  assert.deepEqual(p.options[1], { key: 'B', label: 'できない', pros: '記録が残る', cons: '手間が増える' });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(checkRecord(r, 'sample'), []);
});

test('D-02 形の確認: 状態の値・id・推奨・選択肢の誤りを見つける', () => {
  const cases = [
    [withPoint(RECORD, '- 状態: 仮決定', '- 状態: たぶん'), /状態は/],
    [withPoint(RECORD, '<!-- id: zero-yen -->', '<!-- id: reconfirm -->'), /重なっている/],
    [withPoint(RECORD, '<!-- id: zero-yen -->', '<!-- id: Zero_Yen -->'), /英小文字/],
    [withPoint(RECORD, '- 推奨: B（記録が残る）', '- 推奨: 記録が残るほう'), /推奨を「B（理由）」/],
    [withPoint(RECORD, '- 推奨: A（区切りが残る）', '- 推奨: C（区切りが残る）'), /推奨のCが選択肢に無い/],
    [withPoint(RECORD, '  - B) 作らない\n', ''), /選択肢を2つ以上/],
    [withPoint(RECORD, '- 工程: 運用', '- 工程: 保守'), /工程は/],
    [withPoint(RECORD, '- なぜ今: ボタンが変わる。', '- 気分: よい'), /知らない項目/],
    [withPoint(RECORD, '- なぜ今: ボタンが変わる。', 'ボタンが変わる。'), /読めない/],
  ];
  for (const [md, pattern] of cases) {
    const problems = checkRecord(parseRecord(md), 'sample');
    assert.ok(problems.some((p) => pattern.test(p)), `${pattern} が見つからない: ${problems.join(' / ')}`);
  }
  assert.ok(checkRecord(parseRecord(RECORD), 'other').some((p) => /機能名: other/.test(p)));
});

test('D-03 形の確認: 決定の論点は「決定」と「選ばなかった理由」が要る', () => {
  const noReason = withPoint(RECORD, '- 選ばなかった理由: B（件数がすぐ分からないため）\n', '');
  assert.ok(checkRecord(parseRecord(noReason), 'sample').some((p) => /選ばなかった理由/.test(p)));
  const wrongKey = withPoint(RECORD, '- 決定: A\n', '- 決定: C\n');
  assert.ok(checkRecord(parseRecord(wrongKey), 'sample').some((p) => /決定は選択肢の記号/.test(p)));
  const prose = withPoint(RECORD, '- 決定: A\n', '- 決定: 出すことにした\n');
  assert.ok(checkRecord(parseRecord(prose), 'sample').some((p) => /決定は選択肢の記号/.test(p)));
  const other = withPoint(RECORD, '- 決定: A\n', '- 決定: その他: 件数だけ出す\n');
  assert.deepEqual(checkRecord(parseRecord(other), 'sample'), []);
  const noDecision = withPoint(RECORD, '- 決定: A\n', '');
  assert.ok(checkRecord(parseRecord(noDecision), 'sample').some((p) => /「決定」を書く/.test(p)));
  // 選択肢の無い決定（ユーザーの提案など）は「選ばなかった理由」が要らない
  const proposal = `${newRecordMarkdown({ feature: 'sample', title: '見本' })}
### 提案

<!-- id: proposal -->

- 工程: 設計
- 優先度: 高
- 状態: 決定
- 決定: 図をつける
`;
  assert.deepEqual(checkRecord(parseRecord(proposal), 'sample'), []);
});

test('D-04 choiceKey: 推奨・決定の先頭の記号だけを取る', () => {
  assert.equal(choiceKey('B（理由）'), 'B');
  assert.equal(choiceKey('A'), 'A');
  assert.equal(choiceKey('ADRにも書く'), null);
  assert.equal(choiceKey(''), null);
  assert.equal(choiceKey(undefined), null);
});

test('D-05 ページの中身: 回答待ちに上から番号を振り、状態ごとに分ける', () => {
  const s = buildPageState(parseRecord(RECORD), newProgress({ feature: 'sample', title: '見本', level: 'L2', now: NOW }), { now: NOW });
  assert.deepEqual(s.open.map((q) => [q.n, q.id, q.recommended]), [[1, 'reconfirm', 'B'], [2, 'zero-yen', 'A']]);
  assert.deepEqual(s.provisional.map((p) => p.id), ['cancel-reason']);
  assert.deepEqual(s.later.map((p) => p.id), ['retention']);
  assert.deepEqual(s.decided, [{ id: 'count', title: '一覧に件数を出すか', decision: 'A' }]);
  assert.equal(s.stages.length, STAGES.length);
  assert.equal(s.stages[0].state, 'skipped');
});

test('D-06 ページの作成: JSONの`<`を置き換え、`</script>`で途切れない', () => {
  const evil = RECORD.replace('1行目の背景。', '</script><script>alert(1)</script>');
  const state = buildPageState(parseRecord(evil), newProgress({ feature: 'sample', title: '見本', level: 'L2', now: NOW }), { now: NOW });
  const template = '<title>__TITLE__</title><script type="application/json">/*__STATE__*/null</script><div><!--__REVIEW__--></div>';
  const html = renderPage(template, { ...state, title: '<b>見本</b>' }, '<pre class="mermaid">a</pre>');
  assert.ok(!html.includes('</script><script>alert'));
  assert.ok(html.includes('<title>&lt;b&gt;見本&lt;/b&gt;</title>'));
  assert.ok(html.includes('<pre class="mermaid">a</pre>'));
  const json = html.slice(html.indexOf('json">') + 6, html.indexOf('</script>'));
  assert.equal(JSON.parse(json).background.startsWith('</script>'), true);
  assert.equal(embedJson(' '), '"\\u2028"');
  assert.throws(() => renderPage('<title>x</title>', state), /ひな形に/);
});

test('D-07 ページの作成: 実際のひな形に差し込み口がそろっている', () => {
  const template = readFileSync(new URL('../scripts/discussion-page.html', import.meta.url), 'utf8');
  const state = buildPageState(parseRecord(RECORD), newProgress({ feature: 'sample', title: '見本', level: 'L2', now: NOW }), { now: NOW });
  const html = renderPage(template, state);
  assert.ok(!html.includes('__STATE__') && !html.includes('__TITLE__') && !html.includes('__REVIEW__'));
});

test('D-08 答えの取り出し: 写しの答えを番号つきで並べ、推奨との違いを出す', () => {
  const record = parseRecord(RECORD);
  const doc = {
    round: 1,
    submittedAt: NOW,
    submittedBy: 'u_x',
    answers: {
      'zero-yen': { choice: 'B', reason: '手間を減らしたい' },
      reconfirm: { choice: 'B' },
      'cancel-reason': { choice: null, objection: '任意がよい' },
    },
    added: [{ title: '件数を出すか', body: '' }, { title: '', body: '' }],
  };
  const r = matchAnswers(doc, record, 1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map((a) => [a.n, a.id]), [[1, 'reconfirm'], [2, 'zero-yen'], [null, 'cancel-reason']]);
  assert.deepEqual(r.added, [{ title: '件数を出すか', body: '' }]);
  assert.deepEqual(r.warnings, []);
  const text = formatAnswers(r);
  assert.match(text, /1\. 取り消したあと.*B（推奨どおり）/);
  assert.match(text, /2\. 0円.*B（推奨はA） \/ 理由: 手間を減らしたい/);
  assert.match(text, /異議: 任意がよい/);
  assert.match(text, /足した論点: 件数を出すか/);
  // ArtifactDataの結果を {data: ...} で包んで保存しても読める
  assert.equal(matchAnswers({ data: doc }, record, 1).ok, true);
});

test('D-17 答えの取り出し: 「その他」が書かれていれば記号より優先し、両方を答えに見せない', () => {
  const r = matchAnswers({ round: 1, answers: { reconfirm: { choice: 'B', other: '次回まで決めない' }, 'zero-yen': { choice: 'A' } } }, parseRecord(RECORD), 1);
  const a = r.items.find((x) => x.id === 'reconfirm');
  assert.equal(a.choice, null);
  assert.equal(a.other, '次回まで決めない');
  const text = formatAnswers(r);
  assert.match(text, /1\. 取り消したあと[^\n]*（回答待ち）: その他: 次回まで決めない$/m);
  assert.doesNotMatch(text, /推奨どおり[^\n]*次回まで/);
  // 推奨に戻したあとに残った古い理由は答えに含めない
  const back = matchAnswers({ round: 1, answers: { 'zero-yen': { choice: 'A', reason: '前に書いた理由' }, reconfirm: { choice: 'A', reason: '違う理由' } } }, parseRecord(RECORD), 1);
  assert.equal(back.items.find((x) => x.id === 'zero-yen').reason, '');
  assert.equal(back.items.find((x) => x.id === 'reconfirm').reason, '違う理由');
});

test('D-19 送った日時は日本時間で出す', () => {
  assert.equal(localTime('2026-10-04T05:56:52.604Z', 'Asia/Tokyo'), '2026-10-04 14:56');
  assert.equal(localTime('2026-10-03T16:30:00.000Z', 'Asia/Tokyo'), '2026-10-04 01:30');
  assert.equal(localTime(null), '不明');
  assert.equal(localTime('not-a-date'), 'not-a-date');
});

test('D-09 答えの取り出し: 写しが無い・別の回なら止め、記録に無い論点と答え漏れを警告する', () => {
  const record = parseRecord(RECORD);
  assert.equal(matchAnswers(null, record, 1).ok, false);
  assert.equal(matchAnswers({ round: 1 }, record, 1).ok, false);
  assert.match(matchAnswers({ round: 1, answers: {} }, record, 2).reason, /今の回（2）/);
  const r = matchAnswers({ round: 1, answers: { reconfirm: { choice: 'C' }, ghost: { choice: 'A' }, count: { choice: 'B' } } }, record, 1);
  assert.ok(r.warnings.some((w) => /記録に無い論点「ghost」/.test(w)));
  assert.ok(r.warnings.some((w) => /C は選択肢に無い/.test(w)));
  assert.ok(r.warnings.some((w) => /0円のとき確認を作るか」に答えが無い/.test(w)));
  assert.ok(r.warnings.some((w) => /記録ではAに決まっている/.test(w)));
});

test('D-10 進み具合: L2は要件を省略して設計から、L3は要件から始める', () => {
  const l2 = newProgress({ feature: 'sample', title: '見本', level: 'L2', now: NOW });
  assert.equal(l2.stages.requirements.state, 'skipped');
  assert.equal(currentStage(l2).id, 'design');
  const l3 = newProgress({ feature: 'sample', title: '見本', level: 'L3', now: NOW });
  assert.equal(currentStage(l3).id, 'requirements');
  assert.throws(() => newProgress({ feature: 'Bad_Name', title: 'x', level: 'L2', now: NOW }), UsageError);
  assert.throws(() => newProgress({ feature: 'ok', title: 'x', level: 'L1', now: NOW }), UsageError);
});

test('D-11 工程の移り方: 省略は理由、設計の完了は承認したPRが要る', () => {
  const p = newProgress({ feature: 'sample', title: '見本', level: 'L2', now: NOW });
  assert.throws(() => setStage(p, 'reflect', 'skipped', { now: NOW }), /--reason/);
  assert.throws(() => setStage(p, 'design', 'done', { now: NOW }), /--pr/);
  assert.throws(() => setStage(p, 'design', 'finished', { now: NOW }), /状態は/);
  assert.throws(() => setStage(p, 'deploy', 'done', { now: NOW }), /工程は/);
  const a = setStage(p, 'design', 'waiting', { docs: ['docs/designs/a.md'], now: NOW });
  const b = setStage(a, 'design', 'done', { pr: 132, docs: ['docs/designs/a.md'], now: '2026-10-03T16:00:00.000Z' });
  assert.deepEqual(b.stages.design.docs, ['docs/designs/a.md']);
  // 承認の日付はUTCではなくハーネスの日付（JST）で残す
  assert.deepEqual(b.stages.design.approved, { pr: 132, at: '2026-10-04' });
  assert.equal(p.stages.design.state, 'active', '元の進み具合は変えない');
  assert.equal(currentStage(b).id, 'plan');
});

test('D-12 進行中の一覧: 済んだ機能は出さず、回答待ちには数と読み方を添える', () => {
  const record = parseRecord(RECORD);
  let waiting = newProgress({ feature: 'sample', title: '見本', level: 'L2', now: NOW });
  waiting = setStage(waiting, 'design', 'waiting', { now: NOW });
  waiting.page = 'https://claude.ai/artifact/x';
  let finished = newProgress({ feature: 'old', title: '古い', level: 'L2', now: NOW });
  for (const s of STAGES.slice(1)) finished = setStage(finished, s.id, 'done', { pr: 1, now: NOW });
  const lines = buildStatusLines([{ progress: waiting, record }, { progress: finished, record: null }]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /見本（sample、L2）: 設計が回答待ち（回答待ち 2問、1回目） ページ: https:\/\/claude\.ai\/artifact\/x/);
  assert.match(lines[0], /submissions\/r1/);
});

test('D-13 コマンド: init → check → page → stage → status → answers を通す', () => {
  const dir = mkdtempSync(join(tmpdir(), 'discussion-'));
  const out = [];
  const err = [];
  const run = (...args) => main(args, { dir, out: (s) => out.push(s), err: (s) => err.push(s) });
  try {
    assert.equal(run('init', 'sample', '--level', 'L2', '--title', '見本'), 0);
    assert.equal(run('init', 'sample', '--level', 'L2', '--title', '見本'), 0, '二度目は何もしない');
    writeFileSync(join(dir, 'sample.md'), RECORD);
    assert.equal(run('check', 'sample'), 0);
    const pagePath = join(dir, 'nested', 'preview', 'page.html'); // 置き場が無くても作る
    assert.equal(run('page', 'sample', '--out', pagePath, '--next-round'), 0);
    assert.match(readFileSync(pagePath, 'utf8'), /"round":2/);
    assert.equal(run('set-page', 'sample', 'https://claude.ai/artifact/abc'), 0);
    assert.match(readFileSync(join(dir, 'sample.md'), 'utf8'), /- 確認のページ: https:\/\/claude\.ai\/artifact\/abc/);
    assert.throws(() => run('set-page', 'sample', 'https://example.com/x'), UsageError);
    assert.equal(run('stage', 'sample', 'design', 'waiting', '--doc', 'docs/designs/sample.md'), 0);
    out.length = 0;
    assert.equal(run('status', '--hook'), 0);
    assert.match(JSON.parse(out[0]).hookSpecificOutput.additionalContext, /設計が回答待ち/);
    const answerPath = join(dir, 'r2.json');
    writeFileSync(answerPath, JSON.stringify({ round: 2, answers: { reconfirm: { choice: 'B' }, 'zero-yen': { choice: 'A' } } }));
    assert.equal(run('answers', answerPath, 'sample'), 0);
    writeFileSync(answerPath, JSON.stringify({ round: 1, answers: {} }));
    assert.equal(run('answers', answerPath, 'sample'), 1, '前の回の写しは読まない');
    writeFileSync(join(dir, 'sample.md'), RECORD.replace('- 状態: 仮決定', '- 状態: たぶん'));
    assert.equal(run('check', 'sample'), 1);
    assert.equal(run('page', 'sample', '--out', pagePath), 1, '形が崩れた記録からページを作らない');
    // ページを書き出せなかったときは回を進めない（公開中のページの答えを読めなくしない）
    writeFileSync(join(dir, 'sample.md'), RECORD);
    const roundBefore = JSON.parse(readFileSync(join(dir, 'sample.progress.json'), 'utf8')).round;
    assert.throws(() => run('page', 'sample', '--out', pagePath, '--next-round', '--review', join(dir, 'missing.html')));
    assert.equal(JSON.parse(readFileSync(join(dir, 'sample.progress.json'), 'utf8')).round, roundBefore);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('D-14 status: 記録の置き場が無くても何も出さずに終わる', () => {
  const out = [];
  assert.equal(main(['status', '--hook'], { dir: join(tmpdir(), 'no-such-discussions-dir'), out: (s) => out.push(s) }), 0);
  assert.deepEqual(out, []);
});

// ── 種類・図・いまの確認 ──

const FENCE = '```';
const VISUAL = RECORD.replace(
  '- 推奨: A（区切りが残る）\n',
  `- 推奨: A（区切りが残る）

${FENCE}mermaid
flowchart LR
  - a[ここは項目ではない] --> b

  b --> c
${FENCE}
`,
);

test('D-20 記録の読み解き: 種類・図を読み、図の中の「- 」の行を項目にしない', () => {
  const r = parseRecord(VISUAL);
  assert.deepEqual(r.problems, []);
  const p = r.points.find((x) => x.id === 'zero-yen');
  assert.equal(p.fields['種類'], '画面');
  assert.deepEqual(p.figures, ['flowchart LR\n  - a[ここは項目ではない] --> b\n\n  b --> c']);
  assert.deepEqual(r.points[0].figures, []);
  assert.deepEqual(checkRecord(r, 'sample'), []);
  const unclosed = parseRecord(VISUAL.replace('  b --> c\n```\n', '  b --> c\n'));
  assert.ok(unclosed.problems.some((x) => /閉じていない/.test(x)));
});

test('D-21 形の確認: 回答待ちには種類が要る。仮決定・後の工程へ・決定は種類が無くても通す', () => {
  const noKind = RECORD.replace('- 種類: アプリの決まり\n', '');
  const problems = checkRecord(parseRecord(noKind), 'sample');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /回答待ちに変えるときは、種類（画面・アプリの決まり・API・設計）を書き足す/);
  // 見本の仮決定・後の工程へ・決定には種類が無いが、誤りにしない
  assert.deepEqual(checkRecord(parseRecord(RECORD), 'sample'), []);
  assert.ok(checkRecord(parseRecord(RECORD.replace('- 種類: 画面', '- 種類: 見た目')), 'sample').some((x) => /種類は画面・アプリの決まり・API・設計/.test(x)));
  assert.equal(KINDS.length, 4);
});

test('D-23 いまの確認: 工程と状態ごとに、決めることと答えたあとを出す', () => {
  const l3 = newProgress({ feature: 'sample', title: '見本', level: 'L3', now: NOW });
  const open = [{ kind: '画面' }, { kind: '画面' }, { kind: 'API' }, { kind: '' }];
  const req = buildNow(setStage(l3, 'requirements', 'waiting', { now: NOW }), open);
  assert.equal(req.stageLabel, '要件');
  assert.equal(req.decide, '何を作るか');
  assert.equal(req.after, '答えを記録に写し、要件定義書を書いて承認をお願いする');
  assert.deepEqual(req.kinds, [{ kind: '画面', count: 2 }, { kind: 'API', count: 1 }, { kind: '種類なし', count: 1 }]);
  assert.equal(req.count, 4);
  assert.equal(buildNow(setStage(l3, 'requirements', 'approval', { now: NOW }), []).after, 'PRのマージで承認。次は設計');
  let p = setStage(l3, 'requirements', 'done', { pr: 1, now: NOW });
  assert.equal(buildNow(setStage(p, 'design', 'waiting', { now: NOW }), []).after, '答えを記録に写し、設計書を書いて承認をお願いする');
  assert.equal(buildNow(setStage(p, 'design', 'approval', { now: NOW }), []).after, 'PRのマージで承認。次は実装計画と試験観点');
  p = setStage(p, 'design', 'done', { pr: 2, now: NOW });
  const plan = buildNow(setStage(p, 'plan', 'waiting', { now: NOW }), []);
  assert.equal(plan.decide, 'どの順で作り、何を試すか');
  assert.equal(plan.after, '答えを記録に写し、計画を直す');
  p = setStage(setStage(p, 'plan', 'done', { now: NOW }), 'implement', 'waiting', { now: NOW });
  assert.deepEqual([buildNow(p, []).decide, buildNow(p, []).after], ['作りながら出た問い', '答えを記録に写し、作業を続ける']);
  for (const s of STAGES) p = setStage(p, s.id, 'done', { pr: 3, now: NOW });
  assert.equal(buildNow(p, []).stage, null);
});

test('D-24 ページの中身: カードに種類・工程・図が入る', () => {
  const progress = newProgress({ feature: 'sample', title: '見本', level: 'L2', now: NOW });
  const s = buildPageState(parseRecord(VISUAL), progress, { now: NOW });
  const q = s.open.find((x) => x.id === 'zero-yen');
  assert.equal(q.kind, '画面');
  assert.equal(q.phase, '要件');
  assert.equal(q.figures.length, 1);
  assert.equal(s.open[0].kind, 'アプリの決まり');
  assert.equal(s.provisional[0].kind, '');
  assert.equal(s.now.stage, 'design');
  assert.equal(s.now.count, 2);
  // 実際のひな形に入れても、図の文字は<を置き換えたまま埋まる
  const html = renderPage(readFileSync(new URL('../scripts/discussion-page.html', import.meta.url), 'utf8'), s);
  assert.ok(!html.includes('<pre class="mermaid">flowchart'));
  assert.match(html, /"kind":"画面"/);
});

