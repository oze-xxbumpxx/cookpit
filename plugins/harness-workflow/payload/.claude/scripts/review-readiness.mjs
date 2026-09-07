#!/usr/bin/env node
// review-readiness.mjs — レビュー対象の鮮度と、人間向け handoff packet の構造を検証する。
//
// このスクリプトは read-only。render は marker 全体を stdout へ出すだけで、
// docs/reviews を直接変更しない。意味判断は Reviewer、人間の受容はマージ判断が担う。

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { uncovered as reviewTasksUncovered } from './check-review-coverage.mjs';

export const SUBJECT_ALGORITHM = 'git-raw-v1';
export const REVIEW_SCHEMA_VERSION = 1;
export const REVIEW_BEGIN = '<!-- review-readiness:begin -->';
export const REVIEW_END = '<!-- review-readiness:end -->';
const PRETTIER_IGNORE_START = '<!-- prettier-ignore-start -->';
const PRETTIER_IGNORE_END = '<!-- prettier-ignore-end -->';

const REVIEW_STATUSES = new Set(['ai_blocked', 'evidence_pending', 'human_review_requested']);
const REVIEW_TIERS = new Set(['R0', 'R1', 'R2', 'R3']);
const HUMAN_KINDS = new Set(['subjective', 'irreversible', 'unknown']);
const EVIDENCE_KINDS = new Set([
  'static',
  'test',
  'counterfactual',
  'black_box',
  'production_like',
]);
const EVIDENCE_RESULTS = new Set(['pass', 'fail', 'unknown']);
const MAX_HUMAN_HANDOFF_ITEMS = 3;
const MAX_BEHAVIOR_CHANGES = 5;
const MAX_RESIDUAL_RISKS = 5;
const MAX_EVIDENCE_ITEMS = 8;
const MAX_BUFFER = 64 * 1024 * 1024;

export class ReviewReadinessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReviewReadinessError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReviewReadinessError(code, message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, path) {
  if (!isPlainObject(value)) fail('invalid_schema', `${path} は object で指定してください`);
  return value;
}

function assertKnownKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail('invalid_schema', `${path}.${key} は未対応のフィールドです`);
  }
}

function assertString(value, path, { max = 500 } = {}) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('invalid_schema', `${path} は空でない string で指定してください`);
  }
  if (value.length > max) fail('invalid_schema', `${path} は ${max} 文字以内にしてください`);
  if (value.includes('-->') || value.includes('review-readiness:')) {
    fail('marker_injection', `${path} に review marker と競合する文字列を含められません`);
  }
  return value.trim();
}

function assertEnum(value, values, path) {
  if (!values.has(value)) {
    fail('invalid_schema', `${path} の値が不正です: ${String(value)}`);
  }
  return value;
}

function assertCount(value, path) {
  if (!Number.isInteger(value) || value < 0) {
    fail('invalid_schema', `${path} は 0 以上の整数で指定してください`);
  }
  return value;
}

function assertArray(value, path, max) {
  if (!Array.isArray(value)) fail('invalid_schema', `${path} は array で指定してください`);
  if (value.length > max) fail('invalid_schema', `${path} は ${max} 件以内にしてください`);
  return value;
}

function assertId(value, path) {
  const id = assertString(value, path, { max: 32 });
  if (!/^[A-Z][A-Z0-9-]{1,31}$/.test(id)) {
    fail('invalid_schema', `${path} は英大文字・数字・ハイフンの ID にしてください`);
  }
  return id;
}

function assertUniqueIds(items, path) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) fail('invalid_schema', `${path} に重複 ID があります: ${item.id}`);
    seen.add(item.id);
  }
}

export function validateFeatureName(value) {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    fail('invalid_feature', `feature は kebab-case で指定してください: ${String(value)}`);
  }
  if (value.length > 100) fail('invalid_feature', 'feature は 100 文字以内にしてください');
  return value;
}

function normalizeAiAssessment(value) {
  const obj = assertObject(value, 'aiAssessment');
  assertKnownKeys(
    obj,
    new Set(['blockingOpen', 'highImpactUnverified', 'followUpOpen']),
    'aiAssessment',
  );
  return {
    blockingOpen: assertCount(obj.blockingOpen, 'aiAssessment.blockingOpen'),
    highImpactUnverified: assertCount(
      obj.highImpactUnverified,
      'aiAssessment.highImpactUnverified',
    ),
    followUpOpen: assertCount(obj.followUpOpen, 'aiAssessment.followUpOpen'),
  };
}

function normalizeHumanItem(value, index) {
  const path = `humanItems[${index}]`;
  const obj = assertObject(value, path);
  assertKnownKeys(obj, new Set(['id', 'kind', 'question', 'recommendation', 'evidenceRefs']), path);
  return {
    id: assertId(obj.id, `${path}.id`),
    kind: assertEnum(obj.kind, HUMAN_KINDS, `${path}.kind`),
    question: assertString(obj.question, `${path}.question`, { max: 300 }),
    recommendation: assertString(obj.recommendation, `${path}.recommendation`, { max: 300 }),
    evidenceRefs: assertArray(obj.evidenceRefs, `${path}.evidenceRefs`, MAX_EVIDENCE_ITEMS).map(
      (item, refIndex) => assertId(item, `${path}.evidenceRefs[${refIndex}]`),
    ),
  };
}

function normalizeEvidence(value, index) {
  const path = `evidence[${index}]`;
  const obj = assertObject(value, path);
  assertKnownKeys(obj, new Set(['id', 'claim', 'kind', 'result', 'ref']), path);
  return {
    id: assertId(obj.id, `${path}.id`),
    claim: assertString(obj.claim, `${path}.claim`, { max: 300 }),
    kind: assertEnum(obj.kind, EVIDENCE_KINDS, `${path}.kind`),
    result: assertEnum(obj.result, EVIDENCE_RESULTS, `${path}.result`),
    ref: assertString(obj.ref, `${path}.ref`, { max: 300 }),
  };
}

function normalizeReviewer(value) {
  const obj = assertObject(value, 'reviewer');
  assertKnownKeys(obj, new Set(['agent', 'model', 'reviewedAt']), 'reviewer');
  const reviewedAt = assertString(obj.reviewedAt, 'reviewer.reviewedAt', { max: 80 });
  if (Number.isNaN(Date.parse(reviewedAt))) {
    fail('invalid_schema', 'reviewer.reviewedAt は ISO 8601 日時で指定してください');
  }
  return {
    agent: assertString(obj.agent, 'reviewer.agent', { max: 100 }),
    model: assertString(obj.model, 'reviewer.model', { max: 100 }),
    reviewedAt,
  };
}

export function validateAssessment(value) {
  const obj = assertObject(value, 'assessment');
  assertKnownKeys(
    obj,
    new Set([
      'schemaVersion',
      'reviewTier',
      'aiAssessment',
      'humanItems',
      'residualRisks',
      'behaviorChanges',
      'evidence',
      'reviewer',
    ]),
    'assessment',
  );
  if (obj.schemaVersion !== REVIEW_SCHEMA_VERSION) {
    fail('invalid_schema', `schemaVersion は ${REVIEW_SCHEMA_VERSION} で指定してください`);
  }

  const humanItems = assertArray(obj.humanItems, 'humanItems', 20).map(normalizeHumanItem);
  const evidence = assertArray(obj.evidence, 'evidence', MAX_EVIDENCE_ITEMS).map(normalizeEvidence);
  const behaviorChanges = assertArray(
    obj.behaviorChanges,
    'behaviorChanges',
    MAX_BEHAVIOR_CHANGES,
  ).map((item, index) => assertString(item, `behaviorChanges[${index}]`, { max: 300 }));
  const residualRisks = assertArray(obj.residualRisks, 'residualRisks', MAX_RESIDUAL_RISKS).map(
    (item, index) => assertString(item, `residualRisks[${index}]`, { max: 300 }),
  );
  const aiAssessment = normalizeAiAssessment(obj.aiAssessment);
  const reviewTier = assertEnum(obj.reviewTier, REVIEW_TIERS, 'reviewTier');

  if (behaviorChanges.length === 0) {
    fail('invalid_schema', 'behaviorChanges は 1 件以上必要です');
  }
  if ((reviewTier === 'R2' || reviewTier === 'R3') && evidence.length === 0) {
    fail('invalid_schema', `${reviewTier} は evidence が 1 件以上必要です`);
  }

  assertUniqueIds(humanItems, 'humanItems');
  assertUniqueIds(evidence, 'evidence');
  const evidenceIds = new Set(evidence.map((item) => item.id));
  for (const item of humanItems) {
    for (const ref of item.evidenceRefs) {
      if (!evidenceIds.has(ref)) {
        fail('invalid_schema', `${item.id} が存在しない evidence を参照しています: ${ref}`);
      }
    }
  }
  if (evidence.some((item) => item.result === 'fail') && aiAssessment.blockingOpen === 0) {
    fail('invalid_schema', 'fail evidence がある場合は blockingOpen を 1 以上にしてください');
  }

  const warnings = [];
  if (humanItems.length > MAX_HUMAN_HANDOFF_ITEMS) {
    warnings.push(
      `人間項目が ${humanItems.length} 件あります。${MAX_HUMAN_HANDOFF_ITEMS} 件以下へ` +
        '絞るまで handoff できません',
    );
  }

  const normalized = {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    reviewTier,
    aiAssessment,
    humanItems,
    residualRisks,
    behaviorChanges,
    evidence,
    reviewer: normalizeReviewer(obj.reviewer),
  };
  warnings.push(...lintHandoffContent(normalized).map((item) => item.message));

  return { value: normalized, warnings };
}

const BANNED_HANDOFF_PATTERNS = [
  { code: 'banned_acceptance', re: /受け入れ可/ },
  { code: 'banned_approved', re: /\bAPPROVED\b/i },
  { code: 'banned_merge_ok', re: /マージ\s*OK/i },
  { code: 'banned_pass_banner', re: /レビュー\s*PASS/i },
];

const PROCESS_BEHAVIOR_PATTERN =
  /(UseCase|use case|schema\.ts|\bdrizzle\b|\bOrchestrator\b|current-state packet|CI step)/i;

/**
 * Gate B の人間向け文言を warn 検査する。schema は通っても、判断 UI として弱い表現を検出する。
 * 失敗にはしない（warn-first）。
 */
export function lintHandoffContent(assessment) {
  const diagnostics = [];
  const push = (code, message) => {
    diagnostics.push({ code, message });
  };

  const scan = (text, path) => {
    for (const pattern of BANNED_HANDOFF_PATTERNS) {
      if (pattern.re.test(text)) {
        push(pattern.code, `${path} に禁止語があります: ${text}`);
      }
    }
  };

  for (const item of assessment.humanItems) {
    scan(item.question, `${item.id}.question`);
    scan(item.recommendation, `${item.id}.recommendation`);
    if (!/[?？]|か\s*$|か。$/.test(item.question) && !item.question.includes('か')) {
      push(
        'question_not_decisive',
        `${item.id}.question は Yes/No または A/B で答えられる疑問形にしてください`,
      );
    }
    if (!/\b(accept_risk|accept|reject)\b/i.test(item.recommendation)) {
      push(
        'recommendation_missing_action',
        `${item.id}.recommendation に accept / reject / accept_risk のいずれかを含めてください`,
      );
    }
  }

  assessment.residualRisks.forEach((risk, index) => {
    scan(risk, `residualRisks[${index}]`);
  });

  assessment.behaviorChanges.forEach((behavior, index) => {
    scan(behavior, `behaviorChanges[${index}]`);
    if (PROCESS_BEHAVIOR_PATTERN.test(behavior)) {
      push(
        'behavior_process_language',
        `behaviorChanges[${index}] が実装/プロセス言語です。利用者から見える変化で書いてください`,
      );
    }
  });

  return diagnostics;
}

export function deriveStatus(assessment) {
  if (
    assessment.aiAssessment.blockingOpen > 0 ||
    assessment.evidence.some((item) => item.result === 'fail')
  ) {
    return 'ai_blocked';
  }
  if (
    assessment.aiAssessment.highImpactUnverified > 0 ||
    assessment.humanItems.length > MAX_HUMAN_HANDOFF_ITEMS
  ) {
    return 'evidence_pending';
  }
  return 'human_review_requested';
}

function validateGitRef(value, path) {
  if (typeof value !== 'string' || value.startsWith('-')) {
    fail('invalid_ref', `${path} が不正です`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/@{}~^:+-]*$/.test(value)) {
    fail('invalid_ref', `${path} に使用できない文字があります: ${value}`);
  }
  return value;
}

function runGit(root, args, { buffer = false } = {}) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: buffer ? null : 'utf8',
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = Buffer.isBuffer(error?.stderr)
      ? error.stderr.toString('utf8').trim()
      : String(error?.stderr ?? '').trim();
    fail(
      'git_failed',
      `git ${args[0] ?? ''} に失敗しました${stderr ? `: ${stderr}` : ''}。` +
        'base ref と fetch-depth を確認してください',
    );
  }
}

function defaultBaseRef(root) {
  for (const candidate of ['origin/main', 'main']) {
    try {
      const base = execFileSync('git', ['-C', root, 'merge-base', 'HEAD', candidate], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (base) return base;
    } catch {
      // 次の候補へ進む。
    }
  }
  fail('base_unresolved', 'base を解決できません。--base <ref> を指定してください');
}

function resolveCommit(root, ref, path) {
  const validRef = validateGitRef(ref, path);
  return runGit(root, ['rev-parse', '--verify', `${validRef}^{commit}`]).trim();
}

function nullSeparatedPaths(buffer) {
  return buffer
    .toString('utf8')
    .split('\0')
    .filter((item) => item !== '');
}

function assertIndexSnapshotComplete(root, reviewPath) {
  const unstaged = nullSeparatedPaths(
    runGit(root, ['diff', '--name-only', '-z'], { buffer: true }),
  );
  const untracked = nullSeparatedPaths(
    runGit(root, ['ls-files', '--others', '--exclude-standard', '-z'], { buffer: true }),
  );
  const omitted = [...new Set([...unstaged, ...untracked])].filter((path) => path !== reviewPath);
  if (omitted.length > 0) {
    const shown = omitted.slice(0, 8).join(', ');
    const more = omitted.length > 8 ? ` ほか ${omitted.length - 8} 件` : '';
    fail(
      'snapshot_incomplete',
      `staged snapshot に含まれない変更があります: ${shown}${more}。` +
        'レビュー対象を stage してから再実行してください',
    );
  }
}

function rawEntryCount(raw) {
  let count = 0;
  let start = 0;
  for (let index = 0; index <= raw.length; index += 1) {
    if (index === raw.length || raw[index] === 0) {
      if (index > start && raw[start] === 58) count += 1; // ':'
      start = index + 1;
    }
  }
  return count;
}

export function computeSubject({
  root = process.cwd(),
  feature,
  baseRef = null,
  source = 'index',
  headRef = 'HEAD',
}) {
  const normalizedRoot = resolve(root);
  const normalizedFeature = validateFeatureName(feature);
  if (source !== 'index' && source !== 'commit') {
    fail('invalid_source', 'source は index または commit で指定してください');
  }

  const chosenBase = baseRef === null ? defaultBaseRef(normalizedRoot) : baseRef;
  const baseSha = resolveCommit(normalizedRoot, chosenBase, 'base');
  const reviewPath = `docs/reviews/${normalizedFeature}.md`;
  const pathspec = ['.', `:(exclude)${reviewPath}`];
  let raw;

  if (source === 'index') {
    assertIndexSnapshotComplete(normalizedRoot, reviewPath);
    raw = runGit(
      normalizedRoot,
      [
        'diff',
        '--cached',
        '--raw',
        '-z',
        '--no-renames',
        '--no-abbrev',
        baseSha,
        '--',
        ...pathspec,
      ],
      { buffer: true },
    );
  } else {
    const headSha = resolveCommit(normalizedRoot, headRef, 'head');
    raw = runGit(
      normalizedRoot,
      ['diff', '--raw', '-z', '--no-renames', '--no-abbrev', baseSha, headSha, '--', ...pathspec],
      { buffer: true },
    );
  }

  const prefix = Buffer.from(`${SUBJECT_ALGORITHM}\0${normalizedFeature}\0${baseSha}\0`, 'utf8');
  const digest = createHash('sha256').update(prefix).update(raw).digest('hex');
  return {
    algorithm: SUBJECT_ALGORITHM,
    baseSha,
    digest: `sha256:${digest}`,
    source,
    entryCount: rawEntryCount(raw),
  };
}

function escapeMarkdown(value) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/([`*_[\]()#!~])/g, '\\$1')
    .replaceAll('|', '\\|')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ');
}

function humanKindLabel(kind) {
  return {
    subjective: '主観',
    irreversible: '不可逆',
    unknown: '未知',
  }[kind];
}

function statusBanner(state) {
  if (state.status === 'ai_blocked') {
    return [
      '> **AI review blocked — 人間への引き渡し前です。**',
      `> open blocker: ${state.aiAssessment.blockingOpen}。先に指摘を解消してください。`,
    ];
  }
  if (state.status === 'evidence_pending') {
    const reason =
      state.humanItems.length > MAX_HUMAN_HANDOFF_ITEMS
        ? `人間判断が ${state.humanItems.length} 件あり、3 件の budget を超えています。`
        : `高影響の未検証事項が ${state.aiAssessment.highImpactUnverified} 件あります。`;
    return [
      '> **Evidence pending — 人間への引き渡し前です。**',
      `> ${reason} PR 分割、設計判断の前倒し、追加証拠のいずれかを行ってください。`,
    ];
  }
  return [
    '> **人間レビュー待ちです。**',
    '> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。',
  ];
}

function assessmentFromState(state) {
  return {
    schemaVersion: state.schemaVersion,
    reviewTier: state.reviewTier,
    aiAssessment: state.aiAssessment,
    humanItems: state.humanItems,
    residualRisks: state.residualRisks,
    behaviorChanges: state.behaviorChanges,
    evidence: state.evidence,
    reviewer: state.reviewer,
  };
}

export function renderPacket({ feature, subject, assessment }) {
  const normalizedFeature = validateFeatureName(feature);
  const { value: normalized, warnings } = validateAssessment(assessment);
  const state = {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    feature: normalizedFeature,
    status: deriveStatus(normalized),
    reviewTier: normalized.reviewTier,
    subject,
    aiAssessment: normalized.aiAssessment,
    humanItems: normalized.humanItems,
    residualRisks: normalized.residualRisks,
    behaviorChanges: normalized.behaviorChanges,
    evidence: normalized.evidence,
    reviewer: normalized.reviewer,
  };
  validateState(state);

  const lines = [
    REVIEW_BEGIN,
    PRETTIER_IGNORE_START,
    '',
    '<!-- review-readiness:state',
    JSON.stringify(state, null, 2),
    '-->',
    '## Review handoff',
    '',
    ...statusBanner(state),
    `> 対象: \`${state.subject.digest.slice(0, 19)}…\` / ${state.reviewTier} / ${state.subject.entryCount} changes`,
    '',
  ];

  const humanHeading =
    state.status === 'human_review_requested'
      ? `### あなたが判断・確認すること（${state.humanItems.length} 件）`
      : `### 引き渡し前に解消する人間項目（${state.humanItems.length} 件）`;
  lines.push(humanHeading, '');
  if (state.humanItems.length === 0) {
    lines.push('- 追加の主観・不可逆・未知の判断はありません。これは承認済みを意味しません。');
  } else {
    state.humanItems.forEach((item, index) => {
      const refs = item.evidenceRefs.length > 0 ? item.evidenceRefs.join(', ') : 'なし';
      lines.push(
        `${index + 1}. **[${humanKindLabel(item.kind)}] ${escapeMarkdown(item.question)}** — ` +
          `推奨: ${escapeMarkdown(item.recommendation)} / 証拠: ${escapeMarkdown(refs)}`,
      );
    });
  }

  lines.push('', '### 残余リスク・未確認', '');
  if (state.residualRisks.length === 0) {
    lines.push(
      '- Claude が明示した残余リスクはありません。未知のリスクがないという意味ではありません。',
    );
  } else {
    for (const risk of state.residualRisks) lines.push(`- ${escapeMarkdown(risk)}`);
  }

  lines.push('', '### 振る舞い差分', '');
  for (const behavior of state.behaviorChanges) lines.push(`- ${escapeMarkdown(behavior)}`);

  lines.push('', '### 証拠', '');
  if (state.evidence.length === 0) {
    lines.push('- 記録された証拠はありません。');
  } else {
    lines.push('| ID | 主張 | 種別 | 結果 | 参照 |', '| --- | --- | --- | --- | --- |');
    for (const item of state.evidence) {
      lines.push(
        `| ${escapeMarkdown(item.id)} | ${escapeMarkdown(item.claim)} | ` +
          `${escapeMarkdown(item.kind)} | ${escapeMarkdown(item.result)} | ` +
          `${escapeMarkdown(item.ref)} |`,
      );
    }
  }

  lines.push(
    '',
    '<details>',
    '<summary>AI assessment</summary>',
    '',
    `- blocking open: ${state.aiAssessment.blockingOpen}`,
    `- high-impact unverified: ${state.aiAssessment.highImpactUnverified}`,
    `- follow-up open: ${state.aiAssessment.followUpOpen}`,
    `- reviewer: ${escapeMarkdown(state.reviewer.agent)} / ${escapeMarkdown(state.reviewer.model)}`,
    `- reviewed at: ${escapeMarkdown(state.reviewer.reviewedAt)}`,
    '',
    '</details>',
    '',
    PRETTIER_IGNORE_END,
    REVIEW_END,
  );

  return { markdown: `${lines.join('\n')}\n`, state, warnings };
}

function validateSubject(value) {
  const obj = assertObject(value, 'subject');
  assertKnownKeys(
    obj,
    new Set(['algorithm', 'baseSha', 'digest', 'source', 'entryCount']),
    'subject',
  );
  if (obj.algorithm !== SUBJECT_ALGORITHM) {
    fail('invalid_schema', `subject.algorithm は ${SUBJECT_ALGORITHM} で指定してください`);
  }
  if (typeof obj.baseSha !== 'string' || !/^[0-9a-f]{40,64}$/.test(obj.baseSha)) {
    fail('invalid_schema', 'subject.baseSha が不正です');
  }
  if (typeof obj.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(obj.digest)) {
    fail('invalid_schema', 'subject.digest が不正です');
  }
  if (obj.source !== 'index' && obj.source !== 'commit') {
    fail('invalid_schema', 'subject.source が不正です');
  }
  return {
    algorithm: SUBJECT_ALGORITHM,
    baseSha: obj.baseSha,
    digest: obj.digest,
    source: obj.source,
    entryCount: assertCount(obj.entryCount, 'subject.entryCount'),
  };
}

function validateState(value) {
  const obj = assertObject(value, 'state');
  assertKnownKeys(
    obj,
    new Set([
      'schemaVersion',
      'feature',
      'status',
      'reviewTier',
      'subject',
      'aiAssessment',
      'humanItems',
      'residualRisks',
      'behaviorChanges',
      'evidence',
      'reviewer',
    ]),
    'state',
  );
  const feature = validateFeatureName(obj.feature);
  const subject = validateSubject(obj.subject);
  const { value: assessment } = validateAssessment(assessmentFromState(obj));
  const status = assertEnum(obj.status, REVIEW_STATUSES, 'status');
  const expectedStatus = deriveStatus(assessment);
  if (status !== expectedStatus) {
    fail('invalid_schema', `status は assessment から ${expectedStatus} と導出されます`);
  }
  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    feature,
    status,
    subject,
    ...assessment,
  };
}

export function parseReviewState(content) {
  const beginCount = content.split(REVIEW_BEGIN).length - 1;
  const endCount = content.split(REVIEW_END).length - 1;
  if (beginCount === 0 && endCount === 0) return { kind: 'legacy' };
  if (beginCount !== 1 || endCount !== 1) {
    fail('invalid_marker', 'review-readiness marker は begin/end を 1 組だけ置いてください');
  }

  const begin = content.indexOf(REVIEW_BEGIN);
  const end = content.indexOf(REVIEW_END, begin);
  if (end < begin) fail('invalid_marker', 'review-readiness marker の順序が不正です');
  const rawBlock = content.slice(begin, end + REVIEW_END.length);
  const stateMatches = [...rawBlock.matchAll(/<!-- review-readiness:state\n([\s\S]*?)\n-->/g)];
  if (stateMatches.length !== 1) {
    fail('invalid_marker', 'review-readiness:state JSON は 1 個だけ必要です');
  }

  let parsed;
  try {
    parsed = JSON.parse(stateMatches[0][1]);
  } catch {
    fail('invalid_json', 'review-readiness:state JSON を解析できません');
  }
  const state = validateState(parsed);
  const expected = renderPacket({
    feature: state.feature,
    subject: state.subject,
    assessment: assessmentFromState(state),
  }).markdown.trim();
  if (rawBlock.trim() !== expected) {
    fail(
      'render_drift',
      'state JSON と人間向け summary が一致しません。render を再実行してください',
    );
  }
  return { kind: 'structured', state, rawBlock };
}

function diagnostic(level, code, message) {
  return { level, code, message };
}

export function checkReview({
  root = process.cwd(),
  feature,
  baseRef = null,
  source = 'index',
  headRef = 'HEAD',
  coverageFn = reviewTasksUncovered,
  requireHandoff = false,
}) {
  const normalizedFeature = validateFeatureName(feature);
  const reviewPath = join(resolve(root), `docs/reviews/${normalizedFeature}.md`);
  if (!existsSync(reviewPath)) {
    return {
      ok: false,
      legacy: false,
      effectiveStatus: 'evidence_pending',
      diagnostics: [
        diagnostic('error', 'review_missing', `docs/reviews/${normalizedFeature}.md がありません`),
      ],
    };
  }

  const diagnostics = [];
  let parsed;
  try {
    parsed = parseReviewState(readFileSync(reviewPath, 'utf8'));
  } catch (error) {
    const code = error instanceof ReviewReadinessError ? error.code : 'parse_failed';
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      legacy: false,
      effectiveStatus: 'evidence_pending',
      diagnostics: [diagnostic('error', code, message)],
    };
  }

  const uncoveredTasks = coverageFn(normalizedFeature);
  if (uncoveredTasks.length > 0) {
    diagnostics.push(
      diagnostic(
        requireHandoff ? 'error' : 'warning',
        'task_uncovered',
        `受け入れレビュー記録がない Task: ${uncoveredTasks.join(', ')}`,
      ),
    );
  }

  if (parsed.kind === 'legacy') {
    diagnostics.push(
      diagnostic(
        requireHandoff ? 'error' : 'warning',
        requireHandoff ? 'legacy_not_handoffable' : 'legacy_review',
        requireHandoff
          ? 'legacy 監査ログのままでは人間へ引き渡せません。structured packet を生成してください'
          : 'current-state marker がありません。既存監査ログとして扱います',
      ),
    );
    return {
      ok: diagnostics.every((item) => item.level !== 'error'),
      legacy: true,
      effectiveStatus: 'evidence_pending',
      diagnostics,
    };
  }

  const { state } = parsed;
  if (state.feature !== normalizedFeature) {
    diagnostics.push(
      diagnostic(
        'error',
        'feature_mismatch',
        `state.feature が ${normalizedFeature} と一致しません`,
      ),
    );
  }

  let currentSubject = null;
  try {
    currentSubject = computeSubject({
      root,
      feature: normalizedFeature,
      baseRef,
      source,
      headRef,
    });
  } catch (error) {
    const code = error instanceof ReviewReadinessError ? error.code : 'subject_failed';
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(diagnostic('error', code, message));
  }

  let effectiveStatus = state.status;
  if (
    currentSubject !== null &&
    (state.subject.baseSha !== currentSubject.baseSha ||
      state.subject.digest !== currentSubject.digest ||
      state.subject.entryCount !== currentSubject.entryCount)
  ) {
    effectiveStatus = 'stale';
    diagnostics.push(
      diagnostic(
        'error',
        'stale_subject',
        '保存された review subject と現在の差分が一致しません。再レビューしてください',
      ),
    );
  }

  if (effectiveStatus !== 'stale' && state.status !== 'human_review_requested') {
    diagnostics.push(
      diagnostic(
        'error',
        'handoff_not_ready',
        `現在状態は ${state.status} です。人間レビューへ引き渡せません`,
      ),
    );
  }

  // Gate B 文言は warn-first。requireHandoff でも内容 lint 単独では止めない。
  for (const item of lintHandoffContent(assessmentFromState(state))) {
    diagnostics.push(diagnostic('warning', item.code, item.message));
  }

  return {
    ok: diagnostics.every((item) => item.level !== 'error'),
    legacy: false,
    effectiveStatus,
    diagnostics,
    state,
    currentSubject,
  };
}

export function renderHandoffBlurb({ feature, result }) {
  const normalizedFeature = validateFeatureName(feature);
  if (
    !result.ok ||
    result.legacy ||
    result.effectiveStatus !== 'human_review_requested' ||
    result.state === undefined
  ) {
    fail(
      'handoff_not_ready',
      `${normalizedFeature} は人間引き渡し可能な current packet ではありません。` +
        '先に handoff-check を通してください',
    );
  }

  const state = result.state;
  const lines = [
    '## Review handoff',
    '',
    '状態: **人間レビュー待ち**（これは承認ではありません）',
    `feature: \`${normalizedFeature}\` / tier: ${state.reviewTier} / ` +
      `digest: \`${state.subject.digest.slice(0, 19)}…\` / changes: ${state.subject.entryCount}`,
    '',
    `### あなたが判断すること（${state.humanItems.length} 件）`,
  ];

  if (state.humanItems.length === 0) {
    lines.push('- 追加の主観・不可逆・未知の判断はありません。残余リスクと振る舞い差分を確認してください。');
  } else {
    state.humanItems.forEach((item, index) => {
      lines.push(
        `${index + 1}. **[${humanKindLabel(item.kind)}] ${item.question}** — 推奨: ${item.recommendation}`,
      );
    });
  }

  lines.push(
    '',
    `残余リスク: ${state.residualRisks.length} 件 / 振る舞い差分: ${state.behaviorChanges.length} 件`,
    '',
    `詳細（正本）: \`docs/reviews/${normalizedFeature}.md\` の Review handoff を読み、` +
      'マージ可否を判断してください。',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function changedReviewCandidates(root, baseRef, headRef) {
  const baseSha = resolveCommit(root, baseRef, 'base');
  const headSha = resolveCommit(root, headRef, 'head');
  const paths = nullSeparatedPaths(
    runGit(
      root,
      [
        'diff',
        '--name-only',
        '-z',
        baseSha,
        headSha,
        '--',
        'docs/requirements',
        'docs/designs',
        'docs/implementation-plans',
        'docs/tests',
        'docs/reviews',
      ],
      { buffer: true },
    ),
  );
  const features = [];
  for (const path of paths) {
    const match = path.match(
      /^docs\/(?:requirements|designs|implementation-plans|tests|reviews)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/,
    );
    if (match) features.push(match[1]);
  }
  return [...new Set(features)].sort();
}

function parseCli(argv) {
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) fail('usage', `不明な引数です: ${token}`);
    const key = token.slice(2);
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith('--')) fail('usage', `${token} に値が必要です`);
    if (Object.hasOwn(options, key)) fail('usage', `${token} が重複しています`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function assertOptions(options, allowed) {
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) fail('usage', `不明な option です: --${key}`);
  }
}

function option(options, name, { required = false, fallback = null } = {}) {
  const value = options[name] ?? fallback;
  if (required && value === null) fail('usage', `--${name} が必要です`);
  return value;
}

function printCheck(feature, result) {
  process.stdout.write(`### Review readiness: ${feature}\n\n`);
  process.stdout.write(`- status: ${result.effectiveStatus}\n`);
  for (const item of result.diagnostics) {
    const mark = item.level === 'error' ? 'ERROR' : item.level === 'warning' ? 'WARN' : 'INFO';
    process.stdout.write(`- ${mark} [${item.code}] ${item.message}\n`);
  }
  if (result.diagnostics.length === 0) process.stdout.write('- 診断なし\n');
}

function usage() {
  return (
    'usage:\n' +
    '  review-readiness.mjs subject --feature <name> [--base <ref>] [--source index|commit] [--head <ref>]\n' +
    '  review-readiness.mjs render --feature <name> --assessment <json> [--base <ref>] [--source index|commit] [--head <ref>]\n' +
    '  review-readiness.mjs check --feature <name> [--base <ref>] [--source index|commit] [--head <ref>] [--require-handoff true|false]\n' +
    '  review-readiness.mjs handoff-check --feature <name> [--base <ref>] [--source index|commit] [--head <ref>]\n' +
    '  review-readiness.mjs handoff-blurb --feature <name> [--base <ref>] [--source index|commit] [--head <ref>]\n' +
    '  review-readiness.mjs ci --base <ref> [--head <ref>] [--mode warn|strict]\n'
  );
}

function runHandoffCheck(root, options) {
  assertOptions(options, new Set(['feature', 'base', 'source', 'head']));
  const feature = option(options, 'feature', { required: true });
  const result = checkReview({
    root,
    feature,
    baseRef: option(options, 'base'),
    source: option(options, 'source', { fallback: 'index' }),
    headRef: option(options, 'head', { fallback: 'HEAD' }),
    requireHandoff: true,
  });
  printCheck(feature, result);
  return { feature, result, code: result.ok ? 0 : 1 };
}

export function runCli(argv, { root = process.env.CLAUDE_PROJECT_DIR || process.cwd() } = {}) {
  const { command, options } = parseCli(argv);
  if (!command) fail('usage', 'command が必要です');

  if (command === 'subject') {
    assertOptions(options, new Set(['feature', 'base', 'source', 'head']));
    const subject = computeSubject({
      root,
      feature: option(options, 'feature', { required: true }),
      baseRef: option(options, 'base'),
      source: option(options, 'source', { fallback: 'index' }),
      headRef: option(options, 'head', { fallback: 'HEAD' }),
    });
    process.stdout.write(`${JSON.stringify(subject, null, 2)}\n`);
    return 0;
  }

  if (command === 'render') {
    assertOptions(options, new Set(['feature', 'assessment', 'base', 'source', 'head']));
    const feature = option(options, 'feature', { required: true });
    const assessmentPath = option(options, 'assessment', { required: true });
    let assessment;
    try {
      assessment = JSON.parse(readFileSync(assessmentPath, 'utf8'));
    } catch {
      fail('invalid_json', `assessment JSON を解析できません: ${assessmentPath}`);
    }
    const subject = computeSubject({
      root,
      feature,
      baseRef: option(options, 'base'),
      source: option(options, 'source', { fallback: 'index' }),
      headRef: option(options, 'head', { fallback: 'HEAD' }),
    });
    const rendered = renderPacket({ feature, subject, assessment });
    for (const warning of rendered.warnings) process.stderr.write(`WARN: ${warning}\n`);
    process.stdout.write(rendered.markdown);
    return 0;
  }

  if (command === 'check') {
    assertOptions(options, new Set(['feature', 'base', 'source', 'head', 'require-handoff']));
    const feature = option(options, 'feature', { required: true });
    const requireHandoffRaw = option(options, 'require-handoff', { fallback: 'false' });
    if (requireHandoffRaw !== 'true' && requireHandoffRaw !== 'false') {
      fail('usage', '--require-handoff は true または false です');
    }
    const result = checkReview({
      root,
      feature,
      baseRef: option(options, 'base'),
      source: option(options, 'source', { fallback: 'index' }),
      headRef: option(options, 'head', { fallback: 'HEAD' }),
      requireHandoff: requireHandoffRaw === 'true',
    });
    printCheck(feature, result);
    return result.ok ? 0 : 1;
  }

  if (command === 'handoff-check') {
    return runHandoffCheck(root, options).code;
  }

  if (command === 'handoff-blurb') {
    const { feature, result, code } = runHandoffCheck(root, options);
    if (code !== 0) return code;
    process.stdout.write('\n');
    process.stdout.write(renderHandoffBlurb({ feature, result }));
    return 0;
  }

  if (command === 'ci') {
    assertOptions(options, new Set(['base', 'head', 'mode']));
    const baseRef = option(options, 'base', { required: true });
    const headRef = option(options, 'head', { fallback: 'HEAD' });
    const mode = option(options, 'mode', { fallback: 'warn' });
    if (mode !== 'warn' && mode !== 'strict') fail('usage', '--mode は warn または strict です');
    const features = changedReviewCandidates(root, baseRef, headRef);
    if (features.length === 0) {
      process.stdout.write(
        '### Review readiness\n\n- 変更されたレビュー対象 feature はありません。\n',
      );
      return 0;
    }

    let invalid = false;
    for (const feature of features) {
      const result = checkReview({
        root,
        feature,
        baseRef,
        source: 'commit',
        headRef,
      });
      printCheck(feature, result);
      if (!result.ok || (mode === 'strict' && result.legacy)) invalid = true;
      process.stdout.write('\n');
    }
    return mode === 'strict' && invalid ? 1 : 0;
  }

  fail('usage', `不明な command です: ${command}`);
}

function main() {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`review-readiness: ${message}\n`);
    if (error instanceof ReviewReadinessError && error.code === 'usage') {
      process.stderr.write(usage());
      process.exitCode = 2;
    } else {
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
