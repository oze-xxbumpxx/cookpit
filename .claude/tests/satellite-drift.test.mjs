// IMP-2026-027 v2 の採択結果を固定する。
// 例外ファイル列挙は coding-standards.md だけが正典。implementer の骨子は消さない。
// 出典: docs/claude-code/improvements/evaluations/IMP-2026-032.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const AGENTS_DIR = join(REPO_ROOT, '.claude/agents');
const CODING_STANDARDS = join(REPO_ROOT, '.claude/rules/coding-standards.md');
const IMPLEMENTER = join(REPO_ROOT, '.claude/agents/implementer.md');

// page.tsx / layout.tsx は CLAUDE.md の短い例外言及にも出る。完全列挙の目印はそれ以外。
const EXCEPTION_MARKERS = [
  'loading.tsx',
  'error.tsx',
  'not-found.tsx',
  'template.tsx',
  'default.tsx',
];

function read(path) {
  return readFileSync(path, 'utf8');
}

function markerHits(text) {
  return EXCEPTION_MARKERS.filter((name) => text.includes(name));
}

test('coding-standards.md が App Router 例外の正典である', () => {
  const hits = markerHits(read(CODING_STANDARDS));
  assert.deepEqual(
    hits,
    EXCEPTION_MARKERS,
    '例外ファイル列挙の正典が欠けている。CLAUDE.md の「等は例外」が空振りになる',
  );
});

test('Agent 定義に例外ファイル列挙を再掲しない', () => {
  const copied = [];
  for (const name of readdirSync(AGENTS_DIR).filter((n) => n.endsWith('.md'))) {
    const hits = markerHits(read(join(AGENTS_DIR, name)));
    if (hits.length >= 3) copied.push({ name, hits });
  }
  assert.deepEqual(
    copied,
    [],
    'Agent 定義が coding-standards.md の例外列挙を再コピーしている（衛星ドリフト）',
  );
});

test('implementer.md は規約の骨子をフェイルセーフとして残す', () => {
  const text = read(IMPLEMENTER);
  assert.match(
    text,
    /Presentation → Application → Domain ← Infrastructure/,
    '依存方向の骨子が implementer.md から消えている（IMP-2026-032 変更 B 相当）',
  );
  assert.match(text, /create\(\)/, 'create() の骨子が implementer.md から消えている');
  assert.match(text, /reconstruct\(\)/, 'reconstruct() の骨子が implementer.md から消えている');
});
