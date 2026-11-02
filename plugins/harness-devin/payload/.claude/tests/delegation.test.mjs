// delegation.mjs（委譲の記録と集計）のテスト。ghは呼ばない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRIVATE_SUMMARY,
  UsageError,
  addReview,
  mergeRecords,
  preferRecord,
  readKnownRecords,
  readRecord,
  readRecordMerged,
  writeRecord,
  buildGhSection,
  defaultMirrorDir,
  extractPlanTask,
  findTaskIssue,
  openTask,
  taskIssueBody,
  firstCiCommit,
  formatSummary,
  newRecord,
  newSelfRecord,
  parseFinding,
  parseYaml,
  readAllRecords,
  recordKey,
  runnerFromAuthor,
  summarize,
  targetArg,
  toYaml,
} from '../scripts/delegation.mjs';

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), '../scripts/delegation.mjs');

const base = (issue, model = 'swe-2-medium') =>
  newRecord({ issue, title: `Issue ${issue}`, model, level: 1, delegatedAt: '2026-09-26T00:00:00Z' });

function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'delegation-test-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cli = (args) => spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });

test('D-01: 記録の YAML は書き出して読み戻すと一致する', () => {
  let rec = base(43);
  rec.title = "it's: #39 の軽微な指摘 'quoted' # not comment";
  rec = addReview(rec, {
    round: 0,
    sha: 'abc1234',
    verdict: 'fix',
    posted: true,
    findings: [parseFinding('must:test-path-mismatch:bodyParser: false でない'), parseFinding('nit:logging-gap:ログ')],
  });
  rec = addReview(rec, { round: 1, sha: 'def5678', verdict: 'merge' });
  rec = { ...rec, ...buildGhSection({ number: 45, state: 'OPEN', createdAt: '2026-09-26T01:00:00Z', commits: [] }, 43, null) };
  const yaml = toYaml(rec);
  assert.deepEqual(parseYaml(yaml), rec);
  assert.match(yaml, /^reviews:\n {2}- round: 0\n {4}reviewed_sha: 'abc1234'/m);
  assert.match(yaml, /^ {6}- severity: 'must'$/m);
  assert.match(yaml, /^ {4}findings: \[\]$/m);
});

test('D-01: 手で書いた素の値・コメント・空の値も読める', () => {
  const text = [
    '# 手で書いた記録',
    'issue: 33',
    'model: unknown',
    'delegated_at: 2026-09-25T10:00:00Z',
    'outcome: ~',
    'gh:',
    '  pr: 33',
    '  closes_linked: false',
    'reviews:',
    '- round: 0',
    '  findings:',
    '    - severity: must',
    '      category: pr-metadata',
    "      summary: 'Closes #32 が無い'",
    'empty:',
  ].join('\n');
  assert.deepEqual(parseYaml(text), {
    issue: 33,
    model: 'unknown',
    delegated_at: '2026-09-25T10:00:00Z',
    outcome: null,
    gh: { pr: 33, closes_linked: false },
    reviews: [{ round: 0, findings: [{ severity: 'must', category: 'pr-metadata', summary: 'Closes #32 が無い' }] }],
    empty: null,
  });
});

test('D-02: 想定外の形の YAML はエラー', () => {
  for (const text of [
    'a: "double"',
    'a: {x: 1}',
    'a: [1, 2]',
    "a: 'unterminated",
    'a: b # trailing comment',
    'a: 1\na: 2',
    'a:\n  - plain',
    ' a: 1',
    'a: 1\n    b: 2',
    'a: |\n  text',
    '\ta: 1',
  ]) {
    assert.throws(() => parseYaml(text), UsageError, text);
  }
});

test('D-03: init の model の値の制限と重複作成', () => {
  assert.throws(() => base(1, 'swe-1.5'), /--model/);
  assert.throws(() => newRecord({ issue: 1, title: 't', model: 'unknown', level: 5, delegatedAt: '2026-09-26T00:00:00Z' }), /--level/);
  withTmp((dir) => {
    const args = ['init', '44', '--model', 'swe-2-max', '--level', '3', '--title', 'M1-c', '--delegated-at', '2026-09-26T05:30:00Z', '--dir', dir];
    assert.equal(cli(args).status, 0);
    const rec = parseYaml(readFileSync(join(dir, '44.yml'), 'utf8'));
    assert.equal(rec.model, 'swe-2-max');
    assert.equal(rec.change_level, 3);
    assert.deepEqual(rec.reviews, []);
    const again = cli(args);
    assert.equal(again.status, 2);
    assert.match(again.stderr, /作成済み/);
    assert.equal(cli(['init', '45', '--model', 'gpt', '--dir', dir]).status, 2);
    assert.equal(cli(['init', '45', '--dir', dir]).status, 2);
  });
});

test('D-04: review の追記と、同じ round の重複・security の自動投稿はエラー', () => {
  const rec = addReview(base(1), { round: 0, sha: 'abc1234', verdict: 'fix', posted: true, findings: [] });
  assert.equal(rec.reviews.length, 1);
  assert.throws(() => addReview(rec, { round: 0, sha: 'abc1234', verdict: 'merge' }), /記録済み/);
  assert.throws(() => addReview(rec, { round: 1, sha: 'nothex', verdict: 'merge' }), /--sha/);
  assert.throws(() => addReview(rec, { round: 1, sha: 'abc1234', verdict: 'ok' }), /--verdict/);
  assert.throws(
    () => addReview(rec, { round: 1, sha: 'abc1234', verdict: 'fix', posted: true, findings: [parseFinding('security:security:x')] }),
    /自動投稿しません/,
  );
  const escalated = addReview(rec, { round: 1, sha: 'def5678', verdict: 'escalate' });
  assert.equal(escalated.escalations, 1);

  withTmp((dir) => {
    cli(['init', '7', '--model', 'swe-2-high', '--title', 't', '--delegated-at', '2026-09-26T00:00:00Z', '--dir', dir]);
    const ok = cli(['review', '7', '--round', '0', '--sha', 'abc1234', '--verdict', 'fix', '--posted', '--finding', 'must:missing-test:A-01 が無い', '--finding', 'nit:coding-standard:any', '--dir', dir]);
    assert.equal(ok.status, 0, ok.stderr);
    const rec7 = parseYaml(readFileSync(join(dir, '7.yml'), 'utf8'));
    assert.equal(rec7.reviews[0].posted, true);
    assert.equal(rec7.reviews[0].findings.length, 2);
    assert.equal(cli(['review', '8', '--round', '0', '--sha', 'abc1234', '--verdict', 'merge', '--dir', dir]).status, 2);
    assert.equal(cli(['review', '7', '--round', '1', '--sha', 'abc1234', '--verdict', 'merge', '--bogus', '--dir', dir]).status, 2);
  });
});

test('D-05: finding の解析（summary の : は残す・未知の severity と category の形はエラー）', () => {
  assert.deepEqual(parseFinding('must:error-shape:400 が {code: message} でない'), {
    severity: 'must',
    category: 'error-shape',
    summary: '400 が {code: message} でない',
  });
  assert.throws(() => parseFinding('blocker:x:y'), /severity/);
  assert.throws(() => parseFinding('must:Error_Shape:y'), /kebab-case/);
  assert.throws(() => parseFinding('must:error-shape'), /の形/);
  assert.throws(() => parseFinding('must:error-shape:  '), /空/);
});

test('D-06b: security は severity と category の両方にそろえる', () => {
  assert.throws(() => parseFinding('security:auth:x'), /両方を security/);
  assert.throws(() => parseFinding('must:security:Origin ヘッダを外すと迂回できる'), /両方を security/);
  assert.equal(parseFinding('security:security:x').category, 'security');
});

test('D-06: security の summary は公開しない', () => {
  const f = parseFinding('security:security:Origin ヘッダを外すと迂回できる。手順: curl …');
  assert.equal(f.summary, PRIVATE_SUMMARY);
  assert.doesNotMatch(toYaml({ f: [f] }), /迂回/);
});

test('D-07: finalize の gh 応答から gh: と outcome を作る', () => {
  const pr = {
    number: 39,
    state: 'MERGED',
    createdAt: '2026-09-26T00:20:27Z',
    mergedAt: '2026-09-26T05:01:41Z',
    closedAt: '2026-09-26T05:01:41Z',
    commits: [{ oid: 'a' }, { oid: 'b' }, { oid: 'c' }, { oid: 'd' }],
    closingIssuesReferences: [{ number: 37 }],
  };
  const runs = [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'skipped' }];
  assert.deepEqual(buildGhSection(pr, 37, runs), {
    outcome: 'merged',
    gh: {
      pr: 39,
      pr_created_at: '2026-09-26T00:20:27Z',
      merged_at: '2026-09-26T05:01:41Z',
      closed_at: '2026-09-26T05:01:41Z',
      commits: 4,
      ci_first_pass: true,
      closes_linked: true,
    },
  });
  const failed = buildGhSection({ ...pr, state: 'OPEN', mergedAt: null, closedAt: null }, 38, [{ status: 'completed', conclusion: 'failure' }]);
  assert.equal(failed.outcome, 'open');
  assert.equal(failed.gh.ci_first_pass, false);
  assert.equal(failed.gh.closes_linked, false);
  assert.equal(failed.gh.merged_at, null);
  assert.equal(buildGhSection({ ...pr, state: 'CLOSED' }, 37, []).gh.ci_first_pass, null);
  assert.equal(buildGhSection({ ...pr, state: 'CLOSED' }, 37, null).outcome, 'closed');
});

test('D-07: CI の初回は PR 作成時の head（まとめて push したときは最後のコミット）', () => {
  const commits = [
    { oid: 'a', committedDate: '2026-09-26T00:00:00Z' },
    { oid: 'b', committedDate: '2026-09-26T00:10:00Z' },
    { oid: 'c', committedDate: '2026-09-26T03:00:00Z' },
  ];
  assert.equal(firstCiCommit(commits, '2026-09-26T00:20:00Z'), 'b');
  // 作成時刻より前のコミットが無い（rebaseで時刻が変わった等）ときは最初のコミット
  assert.equal(firstCiCommit(commits, '2026-09-25T00:00:00Z'), 'a');
  assert.equal(firstCiCommit([], '2026-09-26T00:00:00Z'), null);
});

function merged(issue, model, { rounds = 0, ci = true, prAfterMin = 60, mergeAfterMin = 120, findings = [] } = {}) {
  let rec = base(issue, model);
  for (let r = 0; r < rounds; r += 1) {
    rec = addReview(rec, { round: r, sha: 'abc1234', verdict: 'fix', posted: true, findings: r === 0 ? findings : [] });
  }
  rec = addReview(rec, { round: rounds, sha: 'abc1234', verdict: 'merge', findings: rounds === 0 ? findings : [] });
  const t0 = Date.parse(rec.delegated_at);
  const iso = (min) => new Date(t0 + min * 60000).toISOString();
  return {
    ...rec,
    outcome: 'merged',
    gh: { pr: issue + 100, pr_created_at: iso(prAfterMin), merged_at: iso(prAfterMin + mergeAfterMin), closed_at: null, commits: 1, ci_first_pass: ci, closes_linked: true },
  };
}

test('D-08: モデル別の件数・一発合格・平均 round・CI 初回成功・所要時間の中央値', () => {
  const s = summarize([
    merged(1, 'swe-2-medium', { rounds: 0, prAfterMin: 30, mergeAfterMin: 60 }),
    merged(2, 'swe-2-medium', { rounds: 2, ci: false, prAfterMin: 50, mergeAfterMin: 300 }),
    merged(3, 'swe-2-max', { rounds: 1 }),
    base(4, 'swe-2-max'),
  ]);
  assert.equal(s.total, 4);
  assert.deepEqual(s.outcomes, { merged: 3, closed: 0, open: 1 });
  const med = s.models['swe-2-medium'];
  assert.equal(med.count, 2);
  assert.equal(med.merged, 2);
  assert.equal(med.firstPass, 1);
  assert.equal(med.reviewed, 2);
  assert.equal(med.avgRounds, 1);
  assert.equal(med.ciPass, 1);
  assert.equal(med.ciKnown, 2);
  assert.equal(med.medianIssueToPrMin, 40);
  assert.equal(med.medianPrToMergeMin, 180);
  const max = s.models['swe-2-max'];
  assert.equal(max.count, 2);
  assert.equal(max.reviewed, 1);
  assert.equal(max.firstPass, 0);
  assert.equal(max.finished, 1);
  const text = formatSummary(s);
  assert.match(text, /委譲 4 件（merged 3 \/ closed 0 \/ open 1）/);
  // 件数 / マージ / 一発合格 / 後続なしの一発合格 / 後続を生んだ / 平均round / CI初回成功 / 引き渡し / Issue→PR / PR→マージ
  assert.match(text, /swe-2-medium: 2 \/ 2\/2 \/ 1\/2 \/ 1\/2 \/ 0 \/ 1\.0 \/ 1\/2 \/ 0 \/ 40m \/ 3\.0h/);
});

test('D-09: 分類は Issue 単位で数える（同じ Issue で何度出ても 1 件）', () => {
  let rec = base(10);
  rec = addReview(rec, { round: 0, sha: 'abc1234', verdict: 'fix', posted: true, findings: [parseFinding('must:missing-test:a'), parseFinding('must:missing-test:b')] });
  rec = addReview(rec, { round: 1, sha: 'abc1234', verdict: 'fix', posted: true, findings: [parseFinding('must:missing-test:c')] });
  const s = summarize([rec]);
  assert.deepEqual(s.byCategory, [{ category: 'missing-test', issues: [10], threshold: 3, candidate: false }]);
});

test('D-10: 異なる Issue で 3 件なら昇格候補。2 件は候補外。security は 2 件で候補', () => {
  const f = (text) => ({ findings: [parseFinding(text)] });
  const s = summarize([
    merged(1, 'unknown', f('must:test-path-mismatch:a')),
    merged(2, 'unknown', f('must:test-path-mismatch:b')),
    merged(3, 'unknown', f('must:test-path-mismatch:c')),
    merged(4, 'unknown', f('must:error-shape:d')),
    merged(5, 'unknown', f('must:error-shape:e')),
    merged(6, 'unknown', f('security:security:f')),
    merged(7, 'unknown', f('security:security:g')),
  ]);
  assert.deepEqual(s.candidates.sort(), ['security', 'test-path-mismatch']);
  assert.equal(s.byCategory.find((c) => c.category === 'error-shape').candidate, false);
  assert.match(formatSummary(s), /error-shape: 2\/3（#4 #5）  あと 1 件/);
  assert.deepEqual(summarize([merged(1, 'unknown', f('must:x-y:a'))], { threshold: 1 }).candidates, ['x-y']);
});

test('D-11: 記録が 0 件（ディレクトリが無い・空）でも集計できる', () => {
  assert.deepEqual(readAllRecords('/nonexistent/delegations'), []);
  const s = summarize([]);
  assert.equal(s.total, 0);
  assert.deepEqual(s.candidates, []);
  assert.equal(formatSummary(s), '委譲 0 件（merged 0 / closed 0 / open 0）');
  withTmp((dir) => {
    writeFileSync(join(dir, 'README.md'), '# not a record');
    const res = cli(['summary', '--dir', dir]);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /委譲 0 件/);
  });
});

test('不明なサブコマンドは exit 2', () => {
  const res = cli(['bogus']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /usage/);
});

test('D-12: runner（実行場所）は既定 local、cloud を選べ、それ以外はエラー。古い記録は unknown として集計する', () => {
  assert.equal(base(60).runner, 'local');
  assert.equal(
    newRecord({ issue: 61, title: 't', model: 'swe-2-high', runner: 'cloud', delegatedAt: '2026-09-26T00:00:00Z' }).runner,
    'cloud',
  );
  assert.throws(
    () => newRecord({ issue: 62, title: 't', model: 'swe-2-high', runner: 'remote', delegatedAt: '2026-09-26T00:00:00Z' }),
    /--runner/,
  );
  withTmp((dir) => {
    const common = ['--model', 'swe-2-high', '--title', 't', '--delegated-at', '2026-09-26T00:00:00Z', '--dir', dir];
    assert.equal(cli(['init', '63', ...common]).status, 0);
    assert.equal(parseYaml(readFileSync(join(dir, '63.yml'), 'utf8')).runner, 'local');
    assert.equal(cli(['init', '64', '--runner', 'cloud', ...common]).status, 0);
    assert.equal(parseYaml(readFileSync(join(dir, '64.yml'), 'utf8')).runner, 'cloud');
    assert.equal(cli(['init', '65', '--runner', 'remote', ...common]).status, 2);
    assert.equal(cli(['init', '66', '--runner', 'unknown', ...common]).status, 2);
  });
  const legacy = base(66);
  delete legacy.runner;
  const s = summarize([base(67), { ...base(68), runner: 'cloud' }, legacy]);
  assert.equal(s.runners.local.count, 1);
  assert.equal(s.runners.cloud.count, 1);
  assert.equal(s.runners.unknown.count, 1);
  assert.match(formatSummary(s), /実行場所別: .*\n {2}cloud: 1 \//);
});

// ---- Issueに紐づかないDevinのPR

const self = (pr, extra = {}) =>
  newSelfRecord({ pr, title: `PR ${pr}`, runner: 'cloud', createdAt: '2026-09-26T09:20:00Z', ...extra });

test('U-11: Issue なし PR の記録は issue: null・pr・origin: self。model の既定は unknown。YAML で往復できる', () => {
  const rec = self(53);
  assert.equal(rec.issue, null);
  assert.equal(rec.pr, 53);
  assert.equal(rec.origin, 'self');
  assert.equal(rec.model, 'unknown');
  assert.equal(rec.delegated_at, '2026-09-26T09:20:00Z');
  assert.equal(recordKey(rec), 'pr-53');
  assert.equal(recordKey(base(55)), 55);
  assert.deepEqual(Object.keys(rec).slice(0, 3), ['issue', 'pr', 'origin']);
  assert.deepEqual(parseYaml(toYaml(rec)), rec);
  assert.throws(() => self(0), /PR 番号/);
  // closes_linkedはIssueが無いのでnull
  assert.equal(buildGhSection({ number: 53, state: 'MERGED', createdAt: 'x', commits: [], closingIssuesReferences: [{ number: 51 }] }, null, null).gh.closes_linked, null);
});

test('U-12: 指定は <Issue> か pr-<n>。作成者から実行場所を推す', () => {
  assert.equal(targetArg('55'), 55);
  assert.equal(targetArg('pr-53'), 'pr-53');
  assert.equal(targetArg('pr-053'), 'pr-53');
  assert.throws(() => targetArg('pr-0'), UsageError);
  assert.throws(() => targetArg('pr-x'), UsageError);
  assert.throws(() => targetArg(undefined), UsageError);
  assert.equal(runnerFromAuthor({ login: 'app/devin-ai-integration', is_bot: true }), 'cloud');
  assert.equal(runnerFromAuthor({ login: 'devin-ai-integration[bot]' }), 'cloud');
  assert.equal(runnerFromAuthor({ login: 'oze-xxbumpxx', is_bot: false }), 'local');
  assert.equal(runnerFromAuthor(null), 'local');
});

test('U-13: CLI の init / review を pr-<n> で扱い、pr-<n>.yml に書く。重複 init はエラー', () => {
  withTmp((dir) => {
    const init = ['init', 'pr-53', '--title', 't', '--created-at', '2026-09-26T09:20:01Z', '--runner', 'cloud', '--dir', dir];
    assert.equal(cli(init).status, 0);
    assert.equal(cli(init).status, 2);
    const rec = parseYaml(readFileSync(join(dir, 'pr-53.yml'), 'utf8'));
    assert.equal(rec.pr, 53);
    assert.equal(rec.model, 'unknown');
    assert.equal(rec.runner, 'cloud');
    const review = cli(['review', 'pr-53', '--round', '0', '--sha', 'abc1234', '--verdict', 'fix', '--posted', '--finding', 'must:knowledge-inaccurate:x', '--dir', dir]);
    assert.equal(review.status, 0, review.stderr);
    assert.equal(parseYaml(readFileSync(join(dir, 'pr-53.yml'), 'utf8')).reviews[0].findings[0].category, 'knowledge-inaccurate');
    assert.equal(cli(['init', 'pr-54', '--model', 'bogus', '--dir', dir]).status, 2);
  });
});

test('U-14: 集計は Issue と PR の記録を混ぜて読み、分類は委譲ごとに数え、Issue→PR から self を除く', () => {
  withTmp((dir) => {
    for (const rec of [base(55), self(53), base(9), self(4)]) writeFileSync(join(dir, `${recordKey(rec)}.yml`), toYaml(rec));
    writeFileSync(join(dir, 'pr-x.yml'), 'bogus');
    assert.deepEqual(readAllRecords(dir).map(recordKey), [9, 55, 'pr-4', 'pr-53']);
  });
  const f = (text) => [parseFinding(text)];
  const withFinding = (rec, text) => addReview(rec, { round: 0, sha: 'abc1234', verdict: 'merge', findings: f(text) });
  const selfMerged = {
    ...withFinding(self(54), 'must:harness-conflict:a'),
    outcome: 'merged',
    gh: { pr: 54, pr_created_at: '2026-09-26T09:20:00Z', merged_at: '2026-09-26T10:20:00Z', closed_at: null, commits: 2, ci_first_pass: true, closes_linked: null },
  };
  const s = summarize([merged(1, 'unknown', { findings: f('must:harness-conflict:b') }), selfMerged, withFinding(self(53), 'must:harness-conflict:c')]);
  const c = s.byCategory.find((x) => x.category === 'harness-conflict');
  assert.deepEqual(c.issues, [1, 'pr-53', 'pr-54']);
  assert.equal(c.candidate, true);
  assert.equal(s.origins.self.count, 2);
  assert.equal(s.origins.issue.count, 1);
  assert.equal(s.origins.self.medianIssueToPrMin, null);
  assert.equal(s.origins.self.medianPrToMergeMin, 60);
  const text = formatSummary(s);
  assert.match(text, /harness-conflict: 3\/3（#1 PR#53 PR#54）  ← 昇格候補/);
  assert.match(text, /起点別.*\n {2}issue: 1 \/[^\n]*\n {2}self: 2 \//);
  // Issueの記録だけのときは起点別の行を出さない（今までの出力を変えない）
  assert.doesNotMatch(formatSummary(summarize([base(1)])), /起点別/);
});

// ---- 記録を状態として使う

test('S-01: follow_up_of は任意。Issue 番号と pr-<n> を受け付け、不正な値・自分自身はエラー。YAML で往復できる', () => {
  assert.equal('follow_up_of' in base(43), false);
  const rec = newRecord({ issue: 43, title: 't', model: 'unknown', delegatedAt: '2026-09-26T05:25:28Z', followUpOf: 37 });
  assert.equal(rec.follow_up_of, 37);
  assert.deepEqual(Object.keys(rec).slice(6, 8), ['delegated_at', 'follow_up_of']);
  assert.deepEqual(parseYaml(toYaml(rec)), rec);
  assert.equal(newRecord({ issue: 60, title: 't', model: 'unknown', delegatedAt: '2026-09-26T00:00:00Z', followUpOf: 'pr-54' }).follow_up_of, 'pr-54');
  assert.throws(() => newRecord({ issue: 60, title: 't', model: 'unknown', delegatedAt: '2026-09-26T00:00:00Z', followUpOf: 'x' }), UsageError);
  assert.throws(() => newRecord({ issue: 60, title: 't', model: 'unknown', delegatedAt: '2026-09-26T00:00:00Z', followUpOf: 60 }), /自分自身/);
  withTmp((dir) => {
    const common = ['--model', 'swe-2-medium', '--title', 't', '--delegated-at', '2026-09-26T00:00:00Z', '--dir', dir];
    assert.equal(cli(['init', '59', '--follow-up-of', '51', ...common]).status, 0);
    assert.equal(parseYaml(readFileSync(join(dir, '59.yml'), 'utf8')).follow_up_of, 51);
    assert.equal(cli(['init', '61', '--follow-up-of', 'bogus', ...common]).status, 2);
  });
});

test('S-02: reviewed_at は任意。指定したときだけ round の次に入る。CLI の review は既定で今の時刻を入れる', () => {
  const plain = addReview(base(1), { round: 0, sha: 'abc1234', verdict: 'merge' });
  assert.equal('reviewed_at' in plain.reviews[0], false);
  const timed = addReview(base(1), { round: 0, sha: 'abc1234', verdict: 'fix', posted: true, at: '2026-09-27T01:00:00Z' });
  assert.deepEqual(Object.keys(timed.reviews[0]).slice(0, 3), ['round', 'reviewed_at', 'reviewed_sha']);
  assert.throws(() => addReview(base(1), { round: 0, sha: 'abc1234', verdict: 'fix', at: 'yesterday' }), /--reviewed-at/);
  withTmp((dir) => {
    cli(['init', '7', '--model', 'swe-2-high', '--title', 't', '--delegated-at', '2026-09-26T00:00:00Z', '--dir', dir]);
    const before = Date.now() - 1000;
    assert.equal(cli(['review', '7', '--round', '0', '--sha', 'abc1234', '--verdict', 'merge', '--dir', dir]).status, 0);
    const at = parseYaml(readFileSync(join(dir, '7.yml'), 'utf8')).reviews[0].reviewed_at;
    assert.match(at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.ok(Date.parse(at) >= before - 1000);
    assert.equal(cli(['review', '7', '--round', '1', '--sha', 'abc1234', '--verdict', 'merge', '--reviewed-at', '2026-09-27T02:00:00Z', '--dir', dir]).status, 0);
    assert.equal(parseYaml(readFileSync(join(dir, '7.yml'), 'utf8')).reviews[1].reviewed_at, '2026-09-27T02:00:00Z');
  });
});

test('S-03: 写し。writeRecord は写しにも書き、写しの失敗は警告だけ。CLI は --dir のとき写さず、--mirror-dir で写す', () => {
  withTmp((dir) => {
    const primary = join(dir, 'primary');
    const mirror = join(dir, 'mirror');
    writeRecord(primary, base(70), { mirrorDir: mirror });
    assert.deepEqual(parseYaml(readFileSync(join(mirror, '70.yml'), 'utf8')), base(70));
    // 写しの置き場がファイルで塞がっていても、正は書ける
    writeFileSync(join(dir, 'blocked'), 'x');
    const path = writeRecord(primary, base(71), { mirrorDir: join(dir, 'blocked') });
    assert.equal(path, join(primary, '71.yml'));
    const common = ['--model', 'swe-2-high', '--title', 't', '--delegated-at', '2026-09-26T00:00:00Z'];
    assert.equal(cli(['init', '72', ...common, '--dir', primary]).status, 0);
    assert.equal(existsSync(join(mirror, '72.yml')), false);
    assert.equal(cli(['init', '73', ...common, '--dir', primary, '--mirror-dir', mirror]).status, 0);
    assert.equal(existsSync(join(mirror, '73.yml')), true);
    // 写しにだけある記録（別のworktreeでinitしたもの）はinitし直せず、reviewできる
    assert.equal(cli(['init', '70', ...common, '--dir', join(dir, 'other'), '--mirror-dir', mirror]).status, 2);
    const review = cli(['review', '70', '--round', '0', '--sha', 'abc1234', '--verdict', 'merge', '--dir', join(dir, 'other'), '--mirror-dir', mirror]);
    assert.equal(review.status, 0, review.stderr);
    assert.equal(parseYaml(readFileSync(join(dir, 'other', '70.yml'), 'utf8')).reviews.length, 1);
    assert.equal(parseYaml(readFileSync(join(mirror, '70.yml'), 'utf8')).reviews.length, 1);
  });
  // 状態ディレクトリを明示すると、そのdelegations/ が既定の写し先になる
  assert.equal(defaultMirrorDir({ HARNESS_STATE_DIR: '/tmp/sample-state-test', CLAUDE_PROJECT_DIR: '/home/user/x' }), '/tmp/sample-state-test/delegations');
});

test('S-04: 正と写しの統合（reviews の多い方 → outcome のある方 → 正）', () => {
  const reviewed = addReview(base(80), { round: 0, sha: 'abc1234', verdict: 'fix', posted: true });
  const done = { ...base(80), outcome: 'merged' };
  const mirrorCopy = { ...base(80), title: 'mirror' };
  assert.equal(preferRecord(base(80), null).issue, 80);
  assert.equal(preferRecord(null, mirrorCopy).title, 'mirror');
  assert.equal(preferRecord(base(80), reviewed).reviews.length, 1);
  assert.equal(preferRecord(reviewed, base(80)).reviews.length, 1);
  assert.equal(preferRecord(base(80), done).outcome, 'merged');
  assert.equal(preferRecord(base(80), mirrorCopy).title, 'Issue 80');
  const merged = mergeRecords([base(81), base(80)], [reviewed, self(53)]);
  assert.deepEqual(merged.map(recordKey), [80, 81, 'pr-53']);
  assert.equal(merged[0].reviews.length, 1);
  withTmp((dir) => {
    const primary = join(dir, 'p');
    const mirror = join(dir, 'm');
    writeRecord(primary, base(80));
    writeRecord(mirror, reviewed);
    writeRecord(mirror, base(82));
    writeFileSync(join(mirror, '83.yml'), 'bogus: "x"');
    assert.deepEqual(readKnownRecords({ dir: primary, mirrorDir: mirror }).map(recordKey), [80, 82]);
    assert.equal(readRecordMerged(primary, 80, mirror).reviews.length, 1);
    assert.equal(readKnownRecords({ dir: primary, mirrorDir: null }).length, 1);
    assert.throws(() => readRecordMerged(primary, 99, mirror), /記録がありません/);
  });
});

test('S-05: summary は後続を生んだ委譲と、後続なしの一発合格を数える', () => {
  const parent = merged(37, 'unknown');
  const child = { ...merged(43, 'unknown'), follow_up_of: 37 };
  const lone = merged(41, 'unknown');
  const s = summarize([parent, lone, child]);
  const g = s.models.unknown;
  assert.equal(g.firstPass, 3);
  assert.equal(g.spawned, 1);
  assert.equal(g.cleanFirstPass, 2);
  assert.deepEqual(s.followUps, [{ key: 43, parent: 37 }]);
  assert.equal(s.issueOrigin, 3);
});

test('S-06: 「後続の委譲」の行は後続があるときだけ出す', () => {
  const s = summarize([merged(37, 'unknown'), { ...merged(43, 'unknown'), follow_up_of: 37 }, { ...merged(48, 'unknown'), follow_up_of: 'pr-54' }]);
  assert.match(formatSummary(s), /後続の委譲（前の PR の指摘を直す委譲）: 2\/3（#43←#37 #48←PR#54）/);
  assert.doesNotMatch(formatSummary(summarize([merged(1, 'unknown')])), /後続の委譲/);
});

test('I-21: 共有seqと取得日時を優先し、旧記録のレビューは独立して残す', () => {
  const primary = { ...base(81), shared_seq: 4, shared_fetched_at: '2026-10-09T10:00:00Z' };
  const legacy = addReview(base(81), { round: 0, sha: 'abc1234', verdict: 'merge' });
  const combined = preferRecord(primary, legacy);
  assert.equal(combined.shared_seq, 4);
  assert.deepEqual(combined.reviews, legacy.reviews);
  const newer = { ...primary, shared_seq: 5 };
  assert.equal(preferRecord(primary, newer), newer);
  const later = { ...primary, shared_fetched_at: '2026-10-09T10:01:00Z' };
  assert.equal(preferRecord(primary, later), later);
  assert.deepEqual(parseYaml(toYaml(later)), later);
});

test('I-17: 初回CIの集計からagent-reviewを外す', () => {
  const pr = { number: 82, state: 'OPEN', commits: [], closingIssuesReferences: [] };
  assert.equal(buildGhSection(pr, 81, [{ name: 'agent-review', status: 'in_progress', conclusion: null }, { name: 'quality', status: 'completed', conclusion: 'success' }]).gh.ci_first_pass, true);
  assert.equal(buildGhSection(pr, 81, [{ name: 'agent-review', status: 'completed', conclusion: 'failure' }]).gh.ci_first_pass, null);
});

test('open-task: 承認済みの計画から区間を取り出し、印つきのIssueを作って記録する', () => {
  const dir = mkdtempSync(join(tmpdir(), 'open-task-'));
  const plan = '# 計画\n\n<!-- delegation-task:fix-date -->\n## 目的\n\n日付を直す。\n<!-- /delegation-task -->\n';
  try {
    const { body, digest } = extractPlanTask(plan, 'polish:fix-date');
    assert.equal(body, '## 目的\n\n日付を直す。');
    assert.match(digest, /^[0-9a-f]{64}$/);
    const calls = [];
    const run = (args) => {
      calls.push(args);
      if (args[1] === 'list') return '[]';
      assert.match(readFileSync(args[args.indexOf('--body-file') + 1], 'utf8'), new RegExp(`^<!-- delegation-task-key: polish:fix-date digest: ${digest} -->`));
      return 'https://github.com/o/r/issues/123\n';
    };
    const git = (args) => (args[0] === 'show' ? (assert.equal(args[1], 'origin/main:docs/implementation-plans/polish.md'), plan) : '');
    const issue = openTask({ planPath: 'docs/implementation-plans/polish.md', taskKey: 'polish:fix-date', title: 'fix(web): 日付', model: 'swe-2-medium' }, { dir, run, git, now: () => '2026-10-25T00:00:00Z' });
    assert.equal(issue, 123);
    const record = readRecord(dir, 123);
    assert.equal(record.task_key, 'polish:fix-date');
    assert.equal(record.model, 'swe-2-medium');
    assert.equal(calls.filter((args) => args[1] === 'create').length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('open-task: 同じ印のIssueが既にあり記録だけ無いときは、Issueを作らずに記録を作る', () => {
  const dir = mkdtempSync(join(tmpdir(), 'open-task-'));
  const mirrorDir = mkdtempSync(join(tmpdir(), 'open-task-mirror-'));
  const plan = '# 計画\n\n<!-- delegation-task:fix-date -->\n## 目的\n\n日付を直す。\n<!-- /delegation-task -->\n';
  try {
    const { body, digest } = extractPlanTask(plan, 'polish:fix-date');
    const calls = [];
    const run = (args) => {
      calls.push(args);
      if (args[1] === 'list') return JSON.stringify([{ number: 81, body: taskIssueBody('polish:fix-date', digest, body) }]);
      return assert.fail('Issueを作り直さない');
    };
    const git = (args) => (args[0] === 'show' ? plan : '');
    const options = { planPath: 'docs/implementation-plans/polish.md', taskKey: 'polish:fix-date', title: 'fix(web): 日付', model: 'swe-2-medium' };
    assert.equal(openTask(options, { dir, mirrorDir, run, git, now: () => '2026-10-25T00:00:00Z' }), 81);
    assert.equal(readRecord(dir, 81).task_key, 'polish:fix-date');
    assert.equal(readRecord(mirrorDir, 81).task_key, 'polish:fix-date');
    // 記録があれば上書きしない
    assert.equal(openTask(options, { dir, mirrorDir, run, git, now: () => '2026-10-26T00:00:00Z' }), 81);
    assert.equal(readRecord(dir, 81).delegated_at, '2026-10-25T00:00:00Z');
    assert.equal(calls.filter((args) => args[1] === 'create').length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(mirrorDir, { recursive: true, force: true });
  }
});

test('open-task: 同じ印の開いたIssueがあれば作らず、本文が違えば止める', () => {
  const digest = 'a'.repeat(64);
  const body = taskIssueBody('polish:fix-date', digest, '## 目的');
  assert.equal(findTaskIssue([{ number: 7, body }, { number: 8, body: 'ほか' }], 'polish:fix-date', digest), 7);
  assert.equal(findTaskIssue([{ number: 8, body: taskIssueBody('polish:other', digest, 'x') }], 'polish:fix-date', digest), null);
  assert.throws(() => findTaskIssue([{ number: 7, body }], 'polish:fix-date', 'b'.repeat(64)), /本文が計画と違う/);
  assert.throws(() => findTaskIssue([{ number: 7, body }, { number: 9, body }], 'polish:fix-date', digest), /2件/);
  assert.throws(() => extractPlanTask('<!-- delegation-task:x -->\nA\n<!-- /delegation-task -->\n<!-- delegation-task:x -->\nB\n<!-- /delegation-task -->', 'f:x'), /ちょうど1つ/);
  assert.throws(() => openTask({ planPath: '/etc/passwd', taskKey: 'f:x', title: 't', model: 'swe-2-high' }, { run: () => assert.fail(), git: () => assert.fail() }), UsageError);
});
