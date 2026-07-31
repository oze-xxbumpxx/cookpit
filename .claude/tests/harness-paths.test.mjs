// 状態ディレクトリ解決のテスト（永続化先の決定・リポジトリ配下フォールバックの拒否）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  statSync,
  symlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_NAMESPACE,
  StateDirError,
  hasSafePermissions,
  isInside,
  legacyStateDir,
  legacyStatePath,
  repoRoot,
  resolveNamespace,
  resolveReadablePath,
  resolveStateDir,
  safeStatePath,
  stateDir,
  statePath,
} from '../lib/harness-paths.mjs';

// このテストファイルから見たリポジトリルート（.claude/tests → .claude → root）。
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'harness-paths-'));
  const root = join(base, 'repo');
  const home = join(base, 'home');
  mkdirSync(root, { recursive: true });
  mkdirSync(home, { recursive: true });
  return { base, root, home, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

test('HARNESS_STATE_DIR が最優先で使われる', () => {
  const { base, root, home, cleanup } = sandbox();
  try {
    const explicit = join(base, 'explicit-state');
    const resolved = resolveStateDir({ env: { HARNESS_STATE_DIR: explicit }, root, home });
    assert.equal(resolved.dir, explicit);
    assert.equal(resolved.source, 'HARNESS_STATE_DIR');
    assert.equal(resolved.trusted, true);
  } finally {
    cleanup();
  }
});

test('HARNESS_STATE_DIR がリポジトリ配下なら拒否する', () => {
  const { root, home, cleanup } = sandbox();
  try {
    assert.throws(
      () => resolveStateDir({ env: { HARNESS_STATE_DIR: join(root, '.claude/state') }, root, home }),
      (error) => error instanceof StateDirError && error.reason === 'inside_repo',
    );
  } finally {
    cleanup();
  }
});

test('HARNESS_STATE_DIR が相対パスなら拒否する', () => {
  const { root, home, cleanup } = sandbox();
  try {
    assert.throws(
      () => resolveStateDir({ env: { HARNESS_STATE_DIR: 'state' }, root, home }),
      (error) => error instanceof StateDirError && error.reason === 'not_absolute',
    );
  } finally {
    cleanup();
  }
});

test('シンボリックリンクでリポジトリ内へ戻る指定を拒否する', () => {
  const { base, root, home, cleanup } = sandbox();
  try {
    mkdirSync(join(root, 'inside'), { recursive: true });
    const link = join(base, 'sneaky');
    symlinkSync(join(root, 'inside'), link);
    assert.throws(
      () => resolveStateDir({ env: { HARNESS_STATE_DIR: link }, root, home }),
      (error) => error instanceof StateDirError && error.reason === 'symlink_into_repo',
    );
  } finally {
    cleanup();
  }
});

test('XDG_STATE_HOME を名前空間つきで使う', () => {
  const { base, root, home, cleanup } = sandbox();
  try {
    const xdg = join(base, 'xdg');
    const resolved = resolveStateDir({ env: { XDG_STATE_HOME: xdg }, root, home });
    assert.equal(resolved.dir, join(xdg, resolveNamespace({ env: {}, root })));
    assert.equal(resolved.source, 'XDG_STATE_HOME');
    assert.equal(resolved.trusted, true);
  } finally {
    cleanup();
  }
});

test('環境変数が無ければ ~/.local/state/<ns> を使う', () => {
  const { root, home, cleanup } = sandbox();
  try {
    const resolved = resolveStateDir({ env: {}, root, home });
    assert.equal(resolved.dir, join(home, '.local/state', resolveNamespace({ env: {}, root })));
    assert.equal(resolved.source, 'home');
    assert.equal(resolved.trusted, true);
  } finally {
    cleanup();
  }
});

test('HOME が無い場合のみリポジトリ内へ落ち、trusted:false になる', () => {
  const { root, cleanup } = sandbox();
  try {
    const resolved = resolveStateDir({ env: {}, root, home: '' });
    assert.equal(resolved.dir, join(root, '.claude/state'));
    assert.equal(resolved.source, 'repo-fallback');
    assert.equal(resolved.trusted, false);
    assert.ok(resolved.warnings.length > 0);
  } finally {
    cleanup();
  }
});

// --- 名前空間の導出（harness-portability） ---

test('HARNESS_NAMESPACE が最優先で使われる', () => {
  const { root, cleanup } = sandbox();
  try {
    assert.equal(resolveNamespace({ env: { HARNESS_NAMESPACE: 'my-ns' }, root }), 'my-ns');
  } finally {
    cleanup();
  }
});

test('package.json の name から -harness 付きで導出する', () => {
  const { root, cleanup } = sandbox();
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'acme' }));
    assert.equal(resolveNamespace({ env: {}, root }), 'acme-harness');
  } finally {
    cleanup();
  }
});

test('package.json が無ければ既定値へ落ちる', () => {
  const { root, cleanup } = sandbox();
  try {
    assert.equal(resolveNamespace({ env: {}, root }), DEFAULT_NAMESPACE);
  } finally {
    cleanup();
  }
});

test('スコープ付き名を安全な 1 セグメントへ変換する', () => {
  const { root, cleanup } = sandbox();
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@acme/web' }));
    assert.equal(resolveNamespace({ env: {}, root }), 'acme-web-harness');
  } finally {
    cleanup();
  }
});

test('相対参照を名前空間に持ち込めない', () => {
  const { root, cleanup } = sandbox();
  try {
    const ns = resolveNamespace({ env: { HARNESS_NAMESPACE: '../../etc' }, root });
    assert.ok(!ns.includes('..'), `'..' が残っている: ${ns}`);
    assert.ok(!ns.includes('/'), `'/' が残っている: ${ns}`);
    assert.ok(!ns.includes('\\'), `'\\' が残っている: ${ns}`);
  } finally {
    cleanup();
  }
});

test('空・空白・記号のみの HARNESS_NAMESPACE は次の解決元へ落ちる', () => {
  const { root, cleanup } = sandbox();
  try {
    // sandbox の root には package.json が無いため、既定値まで落ちる。
    for (const value of ['', '   ', '///']) {
      assert.equal(resolveNamespace({ env: { HARNESS_NAMESPACE: value }, root }), DEFAULT_NAMESPACE);
    }
  } finally {
    cleanup();
  }
});

test('package.json が壊れていても例外を投げず既定値へ落ちる', () => {
  const { root, cleanup } = sandbox();
  try {
    writeFileSync(join(root, 'package.json'), '{"name":');
    assert.equal(resolveNamespace({ env: {}, root }), DEFAULT_NAMESPACE);
  } finally {
    cleanup();
  }
});

// 回帰: 導出結果が現行の状態ディレクトリ名と一致すること（一致しないと既存状態が孤児化する）。
test('このリポジトリでは cookpit-harness を導出する（移行不要の固定）', () => {
  assert.equal(resolveNamespace({ env: {}, root: REPO_ROOT }), 'cookpit-harness');
});

test('isInside は同一パスと配下を真、外を偽とする', () => {
  assert.equal(isInside('/a/b', '/a/b'), true);
  assert.equal(isInside('/a/b', '/a/b/c'), true);
  assert.equal(isInside('/a/b', '/a/bc'), false);
  assert.equal(isInside('/a/b', '/a'), false);
});

// --- 以下は Plugin 切り出し前の土台固め（harness-core として他プロジェクトへ配るため） ---

test('repoRoot は CLAUDE_PROJECT_DIR を優先し、無ければ cwd を返す', () => {
  assert.equal(repoRoot({ CLAUDE_PROJECT_DIR: '/some/repo' }), '/some/repo');
  assert.equal(repoRoot({}), process.cwd());
});

test('stateDir は状態ディレクトリを 0700 で作成して返す', () => {
  const { root, home, cleanup } = sandbox();
  try {
    const dir = stateDir({ env: {}, root, home });
    assert.equal(dir, join(home, '.local/state', resolveNamespace({ env: {}, root })));
    assert.ok(existsSync(dir), '作成されていない');
    // 他ユーザーへ開いていないこと（0o077 が立っていない）。
    assert.equal(statSync(dir).mode & 0o077, 0);
  } finally {
    cleanup();
  }
});

test('stateDir は既存ディレクトリでも失敗しない（冪等）', () => {
  const { root, home, cleanup } = sandbox();
  try {
    const first = stateDir({ env: {}, root, home });
    const second = stateDir({ env: {}, root, home });
    assert.equal(first, second);
  } finally {
    cleanup();
  }
});

test('statePath はディレクトリを作らずにパスだけ返す', () => {
  const { root, home, cleanup } = sandbox();
  try {
    const p = statePath('run.json', { env: {}, root, home });
    assert.equal(p, join(home, '.local/state', resolveNamespace({ env: {}, root }), 'run.json'));
    assert.equal(existsSync(dirname(p)), false, 'ディレクトリを作ってしまっている');
  } finally {
    cleanup();
  }
});

test('safeStatePath は解決できれば永続領域のパスを返す', () => {
  const { root, home, cleanup } = sandbox();
  try {
    const p = safeStatePath('activity-log.jsonl', { env: {}, root, home });
    assert.equal(dirname(p), join(home, '.local/state', resolveNamespace({ env: {}, root })));
    assert.ok(existsSync(dirname(p)), 'ディレクトリが作られていない');
  } finally {
    cleanup();
  }
});

// 記録系 Hook は状態ディレクトリを解決できなくても作業を止めてはならない（fail-open）。
test('safeStatePath は解決に失敗しても例外を投げず旧パスへ落ちる', () => {
  const { root, home, cleanup } = sandbox();
  try {
    // リポジトリ配下を指す HARNESS_STATE_DIR は resolveStateDir が拒否する（StateDirError）。
    const env = { HARNESS_STATE_DIR: join(root, '.claude/state') };
    const p = safeStatePath('activity-log.jsonl', { env, root, home });
    assert.equal(p, join(legacyStateDir(root), 'activity-log.jsonl'));
    assert.ok(existsSync(legacyStateDir(root)), 'フォールバック先が作られていない');
  } finally {
    cleanup();
  }
});

test('legacyStateDir / legacyStatePath は <root>/.claude/state を指す', () => {
  const { root, cleanup } = sandbox();
  try {
    assert.equal(legacyStateDir(root), join(root, '.claude/state'));
    assert.equal(legacyStatePath('run.json', root), join(root, '.claude/state/run.json'));
  } finally {
    cleanup();
  }
});

test('resolveReadablePath は永続領域を優先する', () => {
  const { root, home, cleanup } = sandbox();
  try {
    // 新旧の両方に同名ファイルを置き、永続領域が選ばれることを確認する。
    const persistent = stateDir({ env: {}, root, home });
    writeFileSync(join(persistent, 'run.json'), '{}');
    mkdirSync(legacyStateDir(root), { recursive: true });
    writeFileSync(legacyStatePath('run.json', root), '{}');

    assert.equal(
      resolveReadablePath('run.json', { env: {}, root, home }),
      join(persistent, 'run.json'),
    );
  } finally {
    cleanup();
  }
});

test('resolveReadablePath は永続領域に無ければ旧パスを返す', () => {
  const { root, home, cleanup } = sandbox();
  try {
    mkdirSync(legacyStateDir(root), { recursive: true });
    writeFileSync(legacyStatePath('run.json', root), '{}');

    assert.equal(
      resolveReadablePath('run.json', { env: {}, root, home }),
      legacyStatePath('run.json', root),
    );
  } finally {
    cleanup();
  }
});

test('resolveReadablePath はどちらにも無ければ null を返す', () => {
  const { root, home, cleanup } = sandbox();
  try {
    assert.equal(resolveReadablePath('missing.json', { env: {}, root, home }), null);
  } finally {
    cleanup();
  }
});

test('hasSafePermissions は他ユーザーへ開いた権限を偽とする', () => {
  const { base, cleanup } = sandbox();
  try {
    const safe = join(base, 'safe');
    const open = join(base, 'open');
    mkdirSync(safe, { mode: 0o700 });
    mkdirSync(open, { mode: 0o700 });
    chmodSync(open, 0o777);

    assert.equal(hasSafePermissions(safe), true);
    assert.equal(hasSafePermissions(open), false);
    // 存在しないパスは判定できないため false（fail-closed）。
    assert.equal(hasSafePermissions(join(base, 'nonexistent')), false);
  } finally {
    cleanup();
  }
});
