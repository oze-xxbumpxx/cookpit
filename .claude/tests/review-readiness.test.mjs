// review subject の鮮度、state schema、人間向け packet、warning-only CI の回帰試験。
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  REVIEW_BEGIN,
  ReviewReadinessError,
  checkReview,
  computeSubject,
  deriveStatus,
  lintHandoffContent,
  parseReviewState,
  renderHandoffBlurb,
  renderPacket,
  validateAssessment,
  validateFeatureName,
} from '../scripts/review-readiness.mjs';

const SCRIPT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../scripts/review-readiness.mjs',
);

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function write(root, path, content) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'review-readiness-'));
  const root = join(base, 'repo');
  mkdirSync(root, { recursive: true });
  git(root, ['init', '--initial-branch=main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Review Test']);
  write(root, 'src/example.txt', 'base\n');
  git(root, ['add', '--all']);
  git(root, ['commit', '-m', 'initial']);
  return {
    base,
    root,
    initial: git(root, ['rev-parse', 'HEAD']),
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

function baseAssessment(overrides = {}) {
  const base = {
    schemaVersion: 1,
    reviewTier: 'R2',
    aiAssessment: {
      blockingOpen: 0,
      highImpactUnverified: 0,
      followUpOpen: 1,
    },
    humanItems: [
      {
        id: 'HC-01',
        kind: 'subjective',
        question: '操作感を許容できるか',
        recommendation: 'accept',
        evidenceRefs: ['EV-01'],
      },
    ],
    residualRisks: ['実機では未確認'],
    behaviorChanges: ['保存後に一覧を更新する'],
    evidence: [
      {
        id: 'EV-01',
        claim: '保存後に一覧が更新される',
        kind: 'black_box',
        result: 'pass',
        ref: 'Playwright scenario',
      },
    ],
    reviewer: {
      agent: 'reviewer',
      model: 'claude-opus-5',
      reviewedAt: '2026-08-11T00:00:00Z',
    },
  };
  return {
    ...base,
    ...overrides,
    aiAssessment: { ...base.aiAssessment, ...(overrides.aiAssessment ?? {}) },
    reviewer: { ...base.reviewer, ...(overrides.reviewer ?? {}) },
  };
}

function fakeSubject(overrides = {}) {
  return {
    algorithm: 'git-raw-v1',
    baseSha: 'a'.repeat(40),
    digest: `sha256:${'b'.repeat(64)}`,
    source: 'index',
    entryCount: 3,
    ...overrides,
  };
}

function runScript(root, args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT_PATH, ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: error.status ?? 1,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? ''),
    };
  }
}

test('feature 名は kebab-case だけを許可する', () => {
  assert.equal(validateFeatureName('review-readiness'), 'review-readiness');
  for (const value of ['', '../review', 'Review', 'review_ready', 'review/readiness']) {
    assert.throws(
      () => validateFeatureName(value),
      (error) => error instanceof ReviewReadinessError && error.code === 'invalid_feature',
    );
  }
});

test('有効な assessment を正規化する', () => {
  const result = validateAssessment(baseAssessment());
  assert.equal(result.value.reviewTier, 'R2');
  assert.equal(result.value.humanItems.length, 1);
  assert.deepEqual(result.warnings, []);
});

test('未知 enum、負数 count、重複 ID、存在しない evidence ref を拒否する', () => {
  assert.throws(() => validateAssessment(baseAssessment({ reviewTier: 'R9' })), /reviewTier/);
  assert.throws(
    () => validateAssessment(baseAssessment({ aiAssessment: { blockingOpen: -1 } })),
    /0 以上の整数/,
  );

  const duplicated = baseAssessment({
    evidence: [...baseAssessment().evidence, { ...baseAssessment().evidence[0], claim: 'another' }],
  });
  assert.throws(() => validateAssessment(duplicated), /重複 ID/);

  const missingRef = baseAssessment({
    humanItems: [{ ...baseAssessment().humanItems[0], evidenceRefs: ['EV-99'] }],
  });
  assert.throws(() => validateAssessment(missingRef), /存在しない evidence/);
});

test('表示 budget と marker injection を検証する', () => {
  assert.throws(
    () => validateAssessment(baseAssessment({ behaviorChanges: ['1', '2', '3', '4', '5', '6'] })),
    /5 件以内/,
  );
  assert.throws(
    () =>
      validateAssessment(baseAssessment({ behaviorChanges: ['text --> review-readiness:begin'] })),
    (error) => error instanceof ReviewReadinessError && error.code === 'marker_injection',
  );
});

test('status は blocker、未検証、人間 budget、通常の順で導出する', () => {
  const normal = validateAssessment(baseAssessment()).value;
  assert.equal(deriveStatus(normal), 'human_review_requested');

  const blocked = validateAssessment(baseAssessment({ aiAssessment: { blockingOpen: 1 } })).value;
  assert.equal(deriveStatus(blocked), 'ai_blocked');

  const pending = validateAssessment(
    baseAssessment({ aiAssessment: { highImpactUnverified: 1 } }),
  ).value;
  assert.equal(deriveStatus(pending), 'evidence_pending');

  const fourItems = Array.from({ length: 4 }, (_, index) => ({
    ...baseAssessment().humanItems[0],
    id: `HC-0${index + 1}`,
  }));
  const overBudget = validateAssessment(baseAssessment({ humanItems: fourItems }));
  assert.equal(deriveStatus(overBudget.value), 'evidence_pending');
  assert.equal(overBudget.warnings.length, 1);
});

test('fail evidence を blocker 0 のまま成功扱いにしない', () => {
  const evidence = [{ ...baseAssessment().evidence[0], result: 'fail' }];
  assert.throws(() => validateAssessment(baseAssessment({ evidence })), /blockingOpen/);
});

test('packet はリスク優先順で、AI の承認表現を出さない', () => {
  const rendered = renderPacket({
    feature: 'review-readiness',
    subject: fakeSubject(),
    assessment: baseAssessment(),
  }).markdown;
  const human = rendered.indexOf('### あなたが判断・確認すること');
  const residual = rendered.indexOf('### 残余リスク・未確認');
  const behavior = rendered.indexOf('### 振る舞い差分');
  const evidence = rendered.indexOf('### 証拠');
  const ai = rendered.indexOf('<summary>AI assessment</summary>');
  assert.ok(human < residual && residual < behavior && behavior < evidence && evidence < ai);
  assert.equal(rendered.includes('PASS'), false);
  assert.equal(rendered.includes('APPROVED'), false);
  assert.equal(rendered.includes('READY'), false);
  assert.ok(rendered.includes('これは承認ではありません'));
  const begin = rendered.indexOf('<!-- review-readiness:begin -->');
  const prettierStart = rendered.indexOf('<!-- prettier-ignore-start -->');
  const prettierEnd = rendered.indexOf('<!-- prettier-ignore-end -->');
  const end = rendered.indexOf('<!-- review-readiness:end -->');
  assert.ok(begin < prettierStart && prettierStart < prettierEnd && prettierEnd < end);
});

test('人間項目 4 件を切り詰めず、handoff 前として表示する', () => {
  const humanItems = Array.from({ length: 4 }, (_, index) => ({
    ...baseAssessment().humanItems[0],
    id: `HC-0${index + 1}`,
    question: `判断 ${index + 1}`,
  }));
  const rendered = renderPacket({
    feature: 'review-readiness',
    subject: fakeSubject(),
    assessment: baseAssessment({ humanItems }),
  });
  assert.equal(rendered.state.status, 'evidence_pending');
  assert.match(rendered.markdown, /引き渡し前に解消する人間項目（4 件）/);
  for (let index = 1; index <= 4; index += 1) {
    assert.ok(rendered.markdown.includes(`判断 ${index}`));
  }
});

test('人間項目 0 件でも承認済みとは表示しない', () => {
  const rendered = renderPacket({
    feature: 'review-readiness',
    subject: fakeSubject(),
    assessment: baseAssessment({ humanItems: [] }),
  }).markdown;
  assert.match(rendered, /これは承認済みを意味しません/);
});

test('Markdown 表示では HTML と table separator を escape する', () => {
  const rendered = renderPacket({
    feature: 'review-readiness',
    subject: fakeSubject(),
    assessment: baseAssessment({
      behaviorChanges: ['<script>x</script> | safe [click](javascript:alert(1)) **bold** `code`'],
    }),
  }).markdown;
  const visible = rendered.slice(rendered.indexOf('## Review handoff'));
  assert.ok(visible.includes('&lt;script&gt;x&lt;/script&gt; \\| safe'));
  assert.equal(visible.includes('<script>'), false);
  assert.equal(visible.includes('[click](javascript:alert(1))'), false);
  assert.equal(visible.includes('**bold**'), false);
  assert.equal(visible.includes('`code`'), false);
});

test('render 済み block を parse し、legacy と drift を区別する', () => {
  assert.deepEqual(parseReviewState('# legacy\n'), { kind: 'legacy' });

  const rendered = renderPacket({
    feature: 'review-readiness',
    subject: fakeSubject(),
    assessment: baseAssessment(),
  }).markdown;
  const parsed = parseReviewState(`# title\n\n${rendered}\n## audit\n`);
  assert.equal(parsed.kind, 'structured');
  assert.equal(parsed.state.feature, 'review-readiness');

  assert.throws(() => parseReviewState(`${rendered}\n${rendered}`), /1 組だけ/);
  assert.throws(
    () => parseReviewState(rendered.replace('人間レビュー待ちです', '変更済みです')),
    (error) => error instanceof ReviewReadinessError && error.code === 'render_drift',
  );
  assert.throws(
    () => parseReviewState(rendered.replace('"schemaVersion": 1', '"schemaVersion":')),
    (error) => error instanceof ReviewReadinessError && error.code === 'invalid_json',
  );
});

test('index subject は同じ snapshot で安定し、内容変更を検出する', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    write(root, 'src/example.txt', 'version 1\n');
    git(root, ['add', 'src/example.txt']);
    const first = computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' });
    const repeated = computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' });
    assert.equal(first.digest, repeated.digest);
    assert.equal(first.entryCount, 1);

    write(root, 'src/example.txt', 'version 2\n');
    git(root, ['add', 'src/example.txt']);
    const second = computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' });
    assert.notEqual(first.digest, second.digest);
  } finally {
    cleanup();
  }
});

test('index と commit の同一差分は同じ digest になる', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    write(root, 'src/example.txt', 'reviewed\n');
    git(root, ['add', 'src/example.txt']);
    const staged = computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' });
    git(root, ['commit', '-m', 'change']);
    const committed = computeSubject({
      root,
      feature: 'demo',
      baseRef: initial,
      source: 'commit',
      headRef: 'HEAD',
    });
    assert.equal(staged.digest, committed.digest);
    assert.equal(staged.entryCount, committed.entryCount);
  } finally {
    cleanup();
  }
});

test('review 文書だけの変更では digest が変わらない', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    write(root, 'src/example.txt', 'reviewed\n');
    git(root, ['add', 'src/example.txt']);
    const before = computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' });
    write(root, 'docs/reviews/demo.md', '# audit\n');
    git(root, ['add', 'docs/reviews/demo.md']);
    const after = computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' });
    assert.equal(before.digest, after.digest);
    assert.equal(before.entryCount, after.entryCount);
  } finally {
    cleanup();
  }
});

test('mode、追加、削除、base の変化を digest が検出する', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    write(root, 'src/example.txt', 'changed\n');
    git(root, ['add', 'src/example.txt']);
    const content = computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' });

    chmodSync(join(root, 'src/example.txt'), 0o755);
    git(root, ['add', 'src/example.txt']);
    const mode = computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' });
    assert.notEqual(content.digest, mode.digest);

    write(root, 'src/new.txt', 'new\n');
    git(root, ['add', 'src/new.txt']);
    const added = computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' });
    assert.notEqual(mode.digest, added.digest);

    git(root, ['commit', '-m', 'intermediate']);
    write(root, 'src/new.txt', 'next\n');
    git(root, ['add', 'src/new.txt']);
    const fromInitial = computeSubject({
      root,
      feature: 'demo',
      baseRef: initial,
      source: 'index',
    });
    const fromHead = computeSubject({
      root,
      feature: 'demo',
      baseRef: 'HEAD',
      source: 'index',
    });
    assert.notEqual(fromInitial.digest, fromHead.digest);

    rmSync(join(root, 'src/new.txt'));
    git(root, ['add', 'src/new.txt']);
    const deleted = computeSubject({
      root,
      feature: 'demo',
      baseRef: 'HEAD',
      source: 'index',
    });
    assert.notEqual(fromHead.digest, deleted.digest);
  } finally {
    cleanup();
  }
});

test('binary、symlink、gitlink の変化を digest が検出する', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    write(root, 'src/blob.bin', Buffer.from([0, 255, 1, 2]));
    git(root, ['add', 'src/blob.bin']);
    const binary = computeSubject({ root, feature: 'demo', baseRef: initial });

    symlinkSync('example.txt', join(root, 'src/link.txt'));
    git(root, ['add', 'src/link.txt']);
    const symlink = computeSubject({ root, feature: 'demo', baseRef: initial });
    assert.notEqual(binary.digest, symlink.digest);

    git(root, ['update-index', '--add', '--cacheinfo', `160000,${initial},vendor/dependency`]);
    git(root, ['commit', '-m', 'binary symlink and gitlink']);
    const gitlink = computeSubject({
      root,
      feature: 'demo',
      baseRef: initial,
      source: 'commit',
      headRef: 'HEAD',
    });
    assert.notEqual(symlink.digest, gitlink.digest);
  } finally {
    cleanup();
  }
});

test('未 stage の subject 変更を snapshot に含まれたものとして扱わない', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    write(root, 'src/untracked.txt', 'not staged\n');
    assert.throws(
      () => computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' }),
      (error) => error instanceof ReviewReadinessError && error.code === 'snapshot_incomplete',
    );

    write(root, 'docs/reviews/demo.md', '# review only\n');
    rmSync(join(root, 'src/untracked.txt'));
    assert.doesNotThrow(() =>
      computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' }),
    );
  } finally {
    cleanup();
  }
});

test('存在しない base と不正 feature を明示的に拒否する', () => {
  const { root, cleanup } = sandbox();
  try {
    assert.throws(
      () => computeSubject({ root, feature: 'demo', baseRef: 'missing', source: 'index' }),
      (error) => error instanceof ReviewReadinessError && error.code === 'git_failed',
    );
    assert.throws(
      () => computeSubject({ root: '/missing', feature: '../demo', baseRef: 'HEAD' }),
      (error) => error instanceof ReviewReadinessError && error.code === 'invalid_feature',
    );
  } finally {
    cleanup();
  }
});

test('checkReview は current、stale、Task 不足を区別する', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    write(root, 'src/example.txt', 'reviewed\n');
    git(root, ['add', 'src/example.txt']);
    const subject = computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' });
    const packet = renderPacket({
      feature: 'demo',
      subject,
      assessment: baseAssessment(),
    }).markdown;
    write(root, 'docs/reviews/demo.md', `# Review\n\n${packet}\n## Audit\n`);

    const current = checkReview({
      root,
      feature: 'demo',
      baseRef: initial,
      source: 'index',
      coverageFn: () => [2],
    });
    assert.equal(current.ok, true);
    assert.equal(current.effectiveStatus, 'human_review_requested');
    assert.ok(current.diagnostics.some((item) => item.code === 'task_uncovered'));

    write(root, 'src/example.txt', 'changed after review\n');
    git(root, ['add', 'src/example.txt']);
    const stale = checkReview({
      root,
      feature: 'demo',
      baseRef: initial,
      source: 'index',
      coverageFn: () => [],
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.effectiveStatus, 'stale');
    assert.ok(stale.diagnostics.some((item) => item.code === 'stale_subject'));
  } finally {
    cleanup();
  }
});

test('checkReview は legacy を warning として維持する', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    write(root, 'docs/reviews/demo.md', '# Legacy review\n');
    const result = checkReview({
      root,
      feature: 'demo',
      baseRef: initial,
      coverageFn: () => [],
    });
    assert.equal(result.ok, true);
    assert.equal(result.legacy, true);
    assert.ok(result.diagnostics.some((item) => item.code === 'legacy_review'));
  } finally {
    cleanup();
  }
});

test('CLI は usage error を 2、CI warn/strict を 0/1 で返す', () => {
  const { base, root, initial, cleanup } = sandbox();
  try {
    const usage = runScript(root, ['subject']);
    assert.equal(usage.code, 2);
    assert.match(usage.stderr, /--feature/);
    const unknownOption = runScript(root, ['subject', '--feature', 'demo', '--baes', initial]);
    assert.equal(unknownOption.code, 2);
    assert.match(unknownOption.stderr, /不明な option/);

    write(root, 'docs/reviews/demo.md', '# Legacy review\n');
    git(root, ['add', 'docs/reviews/demo.md']);
    git(root, ['commit', '-m', 'legacy review']);
    const head = git(root, ['rev-parse', 'HEAD']);
    const warn = runScript(root, ['ci', '--base', initial, '--head', head, '--mode', 'warn']);
    assert.equal(warn.code, 0);
    assert.match(warn.stdout, /legacy_review/);
    const strict = runScript(root, ['ci', '--base', initial, '--head', head, '--mode', 'strict']);
    assert.equal(strict.code, 1);

    const assessmentPath = join(base, 'assessment.json');
    writeFileSync(assessmentPath, JSON.stringify(baseAssessment()));
    write(root, 'src/example.txt', 'next\n');
    git(root, ['add', 'src/example.txt']);
    const render = runScript(root, [
      'render',
      '--feature',
      'demo',
      '--assessment',
      assessmentPath,
      '--base',
      head,
    ]);
    assert.equal(render.code, 0);
    assert.ok(render.stdout.includes(REVIEW_BEGIN));
  } finally {
    cleanup();
  }
});

test('CI は変更された L2/L3 成果物に review が無ければ warning にする', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    write(root, 'docs/requirements/new-feature.md', '# Requirements\n');
    git(root, ['add', 'docs/requirements/new-feature.md']);
    git(root, ['commit', '-m', 'requirements only']);

    const warn = runScript(root, ['ci', '--base', initial, '--head', 'HEAD', '--mode', 'warn']);
    assert.equal(warn.code, 0);
    assert.match(warn.stdout, /review_missing/);

    const strict = runScript(root, ['ci', '--base', initial, '--head', 'HEAD', '--mode', 'strict']);
    assert.equal(strict.code, 1);
  } finally {
    cleanup();
  }
});

test('CI はレビュー対象 feature が無ければ短い info で終了する', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    write(root, 'src/example.txt', 'code only\n');
    git(root, ['add', 'src/example.txt']);
    git(root, ['commit', '-m', 'code only']);
    const result = runScript(root, ['ci', '--base', initial, '--head', 'HEAD', '--mode', 'warn']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /変更されたレビュー対象 feature はありません/);
  } finally {
    cleanup();
  }
});

test('script 自身は review 文書を書き換えない', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    const path = join(root, 'docs/reviews/demo.md');
    write(root, 'docs/reviews/demo.md', '# immutable\n');
    const before = readFileSync(path, 'utf8');
    checkReview({ root, feature: 'demo', baseRef: initial, coverageFn: () => [] });
    assert.equal(readFileSync(path, 'utf8'), before);
  } finally {
    cleanup();
  }
});

test('lintHandoffContent は禁止語とプロセス言語を warn する', () => {
  const dirty = baseAssessment({
    humanItems: [
      {
        id: 'HC-01',
        kind: 'subjective',
        question: '受け入れ可としてよいか',
        recommendation: '良さそう',
        evidenceRefs: ['EV-01'],
      },
    ],
    behaviorChanges: ['UpdateStockDetails UseCase を追加する'],
  });
  const warnings = lintHandoffContent(validateAssessment(dirty).value);
  assert.ok(warnings.some((item) => item.code === 'banned_acceptance'));
  assert.ok(warnings.some((item) => item.code === 'recommendation_missing_action'));
  assert.ok(warnings.some((item) => item.code === 'behavior_process_language'));
});

test('requireHandoff は legacy と Task 不足を error にする', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    write(root, 'docs/reviews/demo.md', '# Legacy review\n');
    const legacy = checkReview({
      root,
      feature: 'demo',
      baseRef: initial,
      coverageFn: () => [],
      requireHandoff: true,
    });
    assert.equal(legacy.ok, false);
    assert.ok(legacy.diagnostics.some((item) => item.code === 'legacy_not_handoffable'));

    write(root, 'src/example.txt', 'reviewed\n');
    git(root, ['add', 'src/example.txt']);
    const subject = computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' });
    const packet = renderPacket({
      feature: 'demo',
      subject,
      assessment: baseAssessment(),
    }).markdown;
    write(root, 'docs/reviews/demo.md', `# Review\n\n${packet}\n## Task 1\n`);
    const uncovered = checkReview({
      root,
      feature: 'demo',
      baseRef: initial,
      source: 'index',
      coverageFn: () => [2],
      requireHandoff: true,
    });
    assert.equal(uncovered.ok, false);
    assert.ok(uncovered.diagnostics.some((item) => item.code === 'task_uncovered'));
  } finally {
    cleanup();
  }
});

test('handoff-check / handoff-blurb は current packet だけを通す', () => {
  const { root, initial, cleanup } = sandbox();
  try {
    write(root, 'docs/reviews/demo.md', '# Legacy review\n');
    const blocked = runScript(root, [
      'handoff-check',
      '--feature',
      'demo',
      '--base',
      initial,
    ]);
    assert.equal(blocked.code, 1);
    assert.match(blocked.stdout, /legacy_not_handoffable/);

    write(root, 'src/example.txt', 'reviewed\n');
    git(root, ['add', 'src/example.txt']);
    const subject = computeSubject({ root, feature: 'demo', baseRef: initial, source: 'index' });
    const packet = renderPacket({
      feature: 'demo',
      subject,
      assessment: baseAssessment(),
    }).markdown;
    write(root, 'docs/reviews/demo.md', `# Review\n\n${packet}\n## Audit\n`);

    const ready = checkReview({
      root,
      feature: 'demo',
      baseRef: initial,
      source: 'index',
      coverageFn: () => [],
      requireHandoff: true,
    });
    assert.equal(ready.ok, true);
    const blurb = renderHandoffBlurb({ feature: 'demo', result: ready });
    assert.match(blurb, /人間レビュー待ち/);
    assert.match(blurb, /docs\/reviews\/demo\.md/);
    assert.doesNotMatch(blurb, /受け入れ可|APPROVED/);

    const cli = runScript(root, [
      'handoff-blurb',
      '--feature',
      'demo',
      '--base',
      initial,
    ]);
    assert.equal(cli.code, 0);
    assert.match(cli.stdout, /Review handoff/);
  } finally {
    cleanup();
  }
});
