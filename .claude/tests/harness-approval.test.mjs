// 承認検証と保護対象判定のテスト（fail-closed の確認）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  APPROVAL_SCHEMA_VERSION,
  APPROVAL_FILENAME,
  MAX_APPROVAL_TTL_MS,
  OPERATION_CONFIG_CHANGE,
  approvalCoversTarget,
  consumeApproval,
  isProtectedPath,
  toRepoRelative,
  verifyApproval,
} from '../lib/harness-approval.mjs';

const RUN_ID = 'run-test-0001';

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'harness-approval-'));
  const root = join(base, 'repo');
  const state = join(base, 'state');
  mkdirSync(root, { recursive: true });
  mkdirSync(state, { recursive: true });
  return {
    base,
    root,
    state,
    env: { HARNESS_STATE_DIR: state },
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

function writeApproval(stateDirPath, overrides = {}) {
  const now = Date.now();
  const approval = {
    schemaVersion: APPROVAL_SCHEMA_VERSION,
    approvalId: randomUUID(),
    runId: RUN_ID,
    operation: OPERATION_CONFIG_CHANGE,
    target: '.claude/hooks/',
    approvedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60_000).toISOString(),
    approvedBy: 'human',
    ...overrides,
  };
  writeFileSync(join(stateDirPath, APPROVAL_FILENAME), JSON.stringify(approval));
  return approval;
}

function verify(sb, target = '.claude/hooks/guard-dangerous.mjs', runId = RUN_ID) {
  return verifyApproval({
    operation: OPERATION_CONFIG_CHANGE,
    target,
    runId,
    env: sb.env,
    root: sb.root,
  });
}

// ── 保護対象の判定 ──────────────────────────────────────────

test('保護対象を正しく判定する', () => {
  const protectedPaths = [
    'CLAUDE.md',
    'AGENTS.md',
    'lefthook.yml',
    '.claude/settings.json',
    '.claude/settings.local.json',
    '.claude/agents/implementer.md',
    '.claude/hooks/guard-dangerous.mjs',
    '.claude/lib/harness-approval.mjs',
    '.claude/rules/coding-standards.md',
    '.claude/scripts/run-quality-gates.sh',
    '.claude/skills/quality-gates/SKILL.md',
    '.claude/tests/harness-approval.test.mjs',
    '.github/workflows/ci.yml',
    '.github/actions/setup/action.yml',
  ];
  for (const path of protectedPaths) {
    assert.equal(isProtectedPath(path, '/repo'), true, `保護されていません: ${path}`);
  }
});

test('成果物・アプリコードは保護対象ではない', () => {
  const unprotected = [
    'docs/designs/foo.md',
    'logs/2026-07-26.md',
    '.claude/state/run-state.json',
    '.claude/evals/cases/refactoring.md',
    'packages/domain/src/recipe/recipe.ts',
    'apps/web/src/app/page.tsx',
    'README.md',
  ];
  for (const path of unprotected) {
    assert.equal(isProtectedPath(path, '/repo'), false, `過剰に保護されています: ${path}`);
  }
});

test('絶対パスもリポジトリ相対へ正規化して判定する', () => {
  assert.equal(isProtectedPath('/repo/.claude/hooks/x.mjs', '/repo'), true);
  assert.equal(toRepoRelative('/repo/.claude/hooks/x.mjs', '/repo'), '.claude/hooks/x.mjs');
  assert.equal(toRepoRelative('./.claude/hooks/x.mjs', '/repo'), '.claude/hooks/x.mjs');
});

test('前置一致 target はディレクトリ配下だけを覆う', () => {
  assert.equal(approvalCoversTarget('.claude/hooks/', '.claude/hooks/a.mjs'), true);
  assert.equal(approvalCoversTarget('.claude/hooks/', '.claude/agents/a.md'), false);
  assert.equal(approvalCoversTarget('CLAUDE.md', 'CLAUDE.md'), true);
  assert.equal(approvalCoversTarget('CLAUDE.md', 'CLAUDE.md.bak'), false);
});

// ── 承認の検証 ──────────────────────────────────────────────

test('正しい承認を受理する', () => {
  const sb = sandbox();
  try {
    writeApproval(sb.state);
    const result = verify(sb);
    assert.equal(result.ok, true);
  } finally {
    sb.cleanup();
  }
});

test('承認が無ければ拒否する（missing）', () => {
  const sb = sandbox();
  try {
    const result = verify(sb);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'missing');
  } finally {
    sb.cleanup();
  }
});

test('壊れた承認ファイルを拒否する（corrupt）', () => {
  const sb = sandbox();
  try {
    writeFileSync(join(sb.state, APPROVAL_FILENAME), '{ not json');
    const result = verify(sb);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'corrupt');
  } finally {
    sb.cleanup();
  }
});

test('スキーマ不一致を拒否する', () => {
  const sb = sandbox();
  try {
    writeApproval(sb.state, { schemaVersion: 2 });
    const result = verify(sb);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'schema_mismatch');
  } finally {
    sb.cleanup();
  }
});

test('未知フィールドを含む承認を拒否する', () => {
  const sb = sandbox();
  try {
    writeApproval(sb.state, { escalate: true });
    const result = verify(sb);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unknown_field');
  } finally {
    sb.cleanup();
  }
});

test('approvedBy が human でない承認を拒否する', () => {
  const sb = sandbox();
  try {
    writeApproval(sb.state, { approvedBy: 'ai' });
    const result = verify(sb);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'not_human');
  } finally {
    sb.cleanup();
  }
});

test('run ID 不一致を拒否する', () => {
  const sb = sandbox();
  try {
    writeApproval(sb.state, { runId: 'run-other' });
    const result = verify(sb);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'run_mismatch');
  } finally {
    sb.cleanup();
  }
});

test('run 状態が無い（runId 不明）なら拒否する', () => {
  const sb = sandbox();
  try {
    writeApproval(sb.state);
    const result = verify(sb, '.claude/hooks/x.mjs', null);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'run_mismatch');
  } finally {
    sb.cleanup();
  }
});

test('操作種別の不一致を拒否する', () => {
  const sb = sandbox();
  try {
    writeApproval(sb.state, { operation: 'something_else' });
    const result = verify(sb);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'operation_mismatch');
  } finally {
    sb.cleanup();
  }
});

test('対象パスの不一致を拒否する', () => {
  const sb = sandbox();
  try {
    writeApproval(sb.state, { target: '.claude/rules/' });
    const result = verify(sb, '.claude/hooks/guard-dangerous.mjs');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'target_mismatch');
  } finally {
    sb.cleanup();
  }
});

test('期限切れの承認を拒否する', () => {
  const sb = sandbox();
  try {
    const past = Date.now() - 30 * 60_000;
    writeApproval(sb.state, {
      approvedAt: new Date(past).toISOString(),
      expiresAt: new Date(past + 60_000).toISOString(),
    });
    const result = verify(sb);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'expired');
  } finally {
    sb.cleanup();
  }
});

test('有効期間が上限を超える承認を拒否する', () => {
  const sb = sandbox();
  try {
    const now = Date.now();
    writeApproval(sb.state, {
      approvedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + MAX_APPROVAL_TTL_MS + 60_000).toISOString(),
    });
    const result = verify(sb);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'ttl_too_long');
  } finally {
    sb.cleanup();
  }
});

test('使用済み承認を再利用できない（単回使用）', () => {
  const sb = sandbox();
  try {
    const approval = writeApproval(sb.state);
    const first = verify(sb);
    assert.equal(first.ok, true);

    consumeApproval(first);
    assert.equal(existsSync(join(sb.state, APPROVAL_FILENAME)), false, '承認ファイルが残っています');

    // 同一 approvalId を書き戻しても再利用できない
    writeApproval(sb.state, { approvalId: approval.approvalId });
    const second = verify(sb);
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'already_used');
  } finally {
    sb.cleanup();
  }
});

test('リポジトリ内フォールバックの状態ディレクトリでは承認を受け付けない', () => {
  const sb = sandbox();
  try {
    // HOME も XDG も HARNESS_STATE_DIR も無い＝リポジトリ内フォールバック
    const result = verifyApproval({
      operation: OPERATION_CONFIG_CHANGE,
      target: '.claude/hooks/x.mjs',
      runId: RUN_ID,
      env: { HOME: '' },
      root: sb.root,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'untrusted_location');
  } finally {
    sb.cleanup();
  }
});

test('HARNESS_STATE_DIR がリポジトリ配下なら承認解決を拒否する', () => {
  const sb = sandbox();
  try {
    const result = verifyApproval({
      operation: OPERATION_CONFIG_CHANGE,
      target: '.claude/hooks/x.mjs',
      runId: RUN_ID,
      env: { HARNESS_STATE_DIR: join(sb.root, 'state') },
      root: sb.root,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'state_dir_unresolved');
  } finally {
    sb.cleanup();
  }
});
