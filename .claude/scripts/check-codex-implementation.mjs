#!/usr/bin/env node
/**
 * check-codex-implementation.mjs — Codex 実装の既知ミス型を機械検出する
 *
 * tsc / eslint を通過してしまうミス型（docs/06-ai-tools.md のレビューチェックリスト由来）を
 * 静的ヒューリスティクスで検出する。検出できない項目（import type / 差し戻し部分反映 /
 * バリデーション分岐の妥当性）は人間チェックリスト側で確認する。
 *
 * 使い方:
 *   node .claude/scripts/check-codex-implementation.mjs                # merge-base origin/main 以降の変更を検査
 *   node .claude/scripts/check-codex-implementation.mjs --base <ref>   # 比較基準を指定
 *   node .claude/scripts/check-codex-implementation.mjs --brief docs/tasks/codex/<feature>
 *   node .claude/scripts/check-codex-implementation.mjs --all          # apps/web/src 全体を検査
 *   node .claude/scripts/check-codex-implementation.mjs --json         # JSON 出力
 *
 * 終了コード: FAIL が 1 件以上 → 1、それ以外 → 0（WARN / INFO は人間の目視確認対象）
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import process from 'node:process';

function gitAt(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const repoRoot = (() => {
  try {
    return gitAt(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  } catch {
    return process.cwd();
  }
})();

function git(args) {
  return gitAt(repoRoot, args);
}

// ---------- 引数 ----------
const argv = process.argv.slice(2);
function argValue(name) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}
const optAll = argv.includes('--all');
const optJson = argv.includes('--json');
const optBase = argValue('--base');
const optBrief = argValue('--brief');

// ---------- 対象ファイルの決定 ----------
function resolveBaseRef() {
  if (optBase) return optBase;
  for (const candidate of ['origin/main', 'main']) {
    try {
      return git(['merge-base', 'HEAD', candidate]).trim();
    } catch {
      /* 次の候補へ */
    }
  }
  try {
    return git(['rev-parse', 'HEAD~1']).trim();
  } catch {
    return null;
  }
}

const baseRef = resolveBaseRef();

function isTarget(file) {
  if (!/\.(ts|tsx)$/.test(file)) return false;
  if (/\.(test|spec)\.(ts|tsx)$/.test(file)) return false;
  if (file.includes('node_modules/')) return false;
  return file.startsWith('apps/') || file.startsWith('packages/');
}

function listChangedFiles() {
  const set = new Set();
  if (baseRef) {
    for (const f of git(['diff', '--name-only', `${baseRef}..HEAD`]).split('\n')) if (f) set.add(f);
  }
  for (const f of git(['diff', '--name-only', 'HEAD']).split('\n')) if (f) set.add(f);
  for (const f of git(['ls-files', '--others', '--exclude-standard']).split('\n'))
    if (f) set.add(f);
  return [...set].filter((f) => isTarget(f) && existsSync(join(repoRoot, f)));
}

function listAllWebFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(repoRoot, dir))) {
      const rel = `${dir}/${entry}`;
      const full = join(repoRoot, rel);
      if (statSync(full).isDirectory()) {
        if (entry !== 'node_modules') walk(rel);
      } else if (isTarget(rel)) {
        out.push(rel);
      }
    }
  };
  if (existsSync(join(repoRoot, 'apps/web/src'))) walk('apps/web/src');
  return out;
}

const targetFiles = optAll ? listAllWebFiles() : listChangedFiles();

// ---------- 検出結果の収集 ----------
const findings = [];
function report(severity, file, line, rule, message) {
  findings.push({ severity, file, line, rule, message });
}

// ---------- ユーティリティ ----------
function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function splitIdentifier(ident) {
  return ident
    .replace(/[_$]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

function readBaseFile(path) {
  if (!baseRef) return null;
  try {
    return git(['show', `${baseRef}:${path}`]);
  } catch {
    return null;
  }
}

function listBaseFiles(prefix) {
  if (!baseRef) return [];
  try {
    return git(['ls-tree', '-r', '--name-only', baseRef, '--', prefix])
      .split('\n')
      .filter((f) => f && /\.(ts|tsx)$/.test(f));
  } catch {
    return [];
  }
}

// ---------- Tailwind クラス検査 ----------
const STANDALONE_CLASSES = new Set([
  'flex',
  'grid',
  'block',
  'inline',
  'hidden',
  'truncate',
  'relative',
  'absolute',
  'fixed',
  'sticky',
  'static',
  'container',
  'contents',
  'isolate',
  'italic',
  'underline',
  'overline',
  'uppercase',
  'lowercase',
  'capitalize',
  'antialiased',
  'border',
  'rounded',
  'shadow',
  'ring',
  'transition',
  'resize',
  'grow',
  'shrink',
  'visible',
  'invisible',
  'collapse',
  'flow-root',
  'inline-block',
  'inline-flex',
  'inline-grid',
  'sr-only',
  'not-sr-only',
  'line-through',
  'no-underline',
  'outline',
  'appearance-none',
  'flex-1',
  'flex-auto',
  'flex-none',
  'grid-flow-row',
]);

const COLOR_ROOTS = new Set([
  'bg',
  'text',
  'border',
  'ring',
  'divide',
  'from',
  'via',
  'to',
  'stroke',
  'fill',
  'accent',
  'caret',
  'decoration',
  'placeholder',
  'outline',
  'shadow',
]);

const TAILWIND_PALETTE = new Set([
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
]);
const VALID_SHADES = new Set([
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
]);

// suffix を厳密に検証する root（w-fll / bg-zinc-90 型のタイポがここに集中する）
const SIZE_ROOTS = [
  'w-',
  'h-',
  'size-',
  'min-w-',
  'min-h-',
  'max-w-',
  'max-h-',
  'basis-',
  'p-',
  'px-',
  'py-',
  'pt-',
  'pr-',
  'pb-',
  'pl-',
  'ps-',
  'pe-',
  'm-',
  'mx-',
  'my-',
  'mt-',
  'mr-',
  'mb-',
  'ml-',
  'ms-',
  'me-',
  'gap-',
  'gap-x-',
  'gap-y-',
  'space-x-',
  'space-y-',
  'inset-',
  'inset-x-',
  'inset-y-',
  'top-',
  'right-',
  'bottom-',
  'left-',
  'start-',
  'end-',
  'translate-x-',
  'translate-y-',
  'indent-',
  'scroll-m-',
  'scroll-p-',
];
const SIZE_SUFFIXES = new Set([
  'full',
  'auto',
  'px',
  'fit',
  'min',
  'max',
  'screen',
  'none',
  'prose',
  'dvh',
  'dvw',
  'svh',
  'svw',
  'lvh',
  'lvw',
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  '6xl',
  '7xl',
  '8xl',
  '9xl',
]);
// キーワード系 root は緩く許可（辞書が第一のオラクル）
const LOOSE_ROOTS = [
  'z-',
  'order-',
  'col-',
  'row-',
  'grid-cols-',
  'grid-rows-',
  'flex-',
  'justify-',
  'items-',
  'content-',
  'self-',
  'place-',
  'text-',
  'font-',
  'leading-',
  'tracking-',
  'list-',
  'align-',
  'whitespace-',
  'break-',
  'opacity-',
  'blur-',
  'brightness-',
  'contrast-',
  'drop-shadow-',
  'grayscale-',
  'transition-',
  'duration-',
  'ease-',
  'delay-',
  'animate-',
  'cursor-',
  'pointer-events-',
  'select-',
  'scroll-',
  'snap-',
  'touch-',
  'will-change-',
  'rotate-',
  'scale-',
  'skew-',
  'origin-',
  'underline-offset-',
  'rounded-',
  'object-',
  'overflow-',
  'overscroll-',
  'aspect-',
  'columns-',
  'line-clamp-',
  'hyphens-',
  'table-',
  'border-spacing-',
  'backdrop-',
  'shadow-',
  'ring-',
  'border-',
  'divide-',
  'outline-',
  'decoration-',
  'mix-blend-',
  'font-stretch-',
  'field-sizing-',
  'wrap-',
  'items-',
  'gap-',
  'space-',
  'not-',
  'group-',
  'peer-',
];

function themeNamesFromGlobalsCss() {
  const names = new Set();
  let css = readBaseFile('apps/web/src/app/globals.css');
  if (css === null) {
    const p = join(repoRoot, 'apps/web/src/app/globals.css');
    css = existsSync(p) ? readFileSync(p, 'utf8') : '';
  }
  for (const m of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) names.add(m[1]);
  for (const m of css.matchAll(/--radius-([a-z0-9-]+)\s*:/g)) names.add(m[1]);
  return names;
}

function extractClassCandidates(content) {
  // className= / cn( / cva( / clsx( の近傍にある文字列リテラルをクラスリスト候補とみなす
  const candidates = [];
  const stringRe = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/gs;
  for (const m of content.matchAll(stringRe)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    if (raw.length < 2 || raw.length > 2000) continue;
    const windowStart = Math.max(0, m.index - 400);
    const before = content.slice(windowStart, m.index);
    if (!/className|\bcn\(|\bcva\(|\bclsx\(|Variants\(/.test(before)) continue;
    // テンプレートリテラルの ${} 穴は除去
    const text = raw.replace(/\$\{[^}]*\}/g, ' ');
    candidates.push({ text, index: m.index });
  }
  return candidates;
}

function normalizeToken(token) {
  if (token.includes('[') || token.includes('(') || token.includes('$')) return null; // arbitrary value / 変数
  const parts = token.split(':');
  let t = parts[parts.length - 1];
  t = t.replace(/^!/, '').replace(/^-/, '');
  const slash = t.indexOf('/');
  if (slash > 0) t = t.slice(0, slash);
  if (t.length < 2) return null;
  if (!/^[a-z][a-z0-9.-]*$/.test(t)) return null;
  if (!t.includes('-') && !STANDALONE_CLASSES.has(t)) return null; // Tailwind 形でない単語は対象外
  return t;
}

function harvestDictionary() {
  const dict = new Set();
  const files = listBaseFiles('apps/web/src');
  for (const f of files) {
    const content = readBaseFile(f);
    if (!content) continue;
    for (const cand of extractClassCandidates(content)) {
      for (const tokenRaw of cand.text.split(/\s+/)) {
        const t = normalizeToken(tokenRaw);
        if (t) dict.add(t);
      }
    }
  }
  return dict;
}

function validateTailwindToken(t, dict, themeNames) {
  if (dict.has(t)) return { ok: true };
  if (STANDALONE_CLASSES.has(t)) return { ok: true };
  // テーマトークン（globals.css の @theme 由来）: bg-background / text-muted-foreground など
  const dash = t.indexOf('-');
  if (dash > 0) {
    const root = t.slice(0, dash);
    const rest = t.slice(dash + 1);
    if (COLOR_ROOTS.has(root) && themeNames.has(rest)) return { ok: true };
  }
  // 色スケール: bg-zinc-90 のような不正シェードを検出
  const colorMatch = t.match(/^([a-z]+)-([a-z]+)-(\d+)$/);
  if (colorMatch && COLOR_ROOTS.has(colorMatch[1]) && TAILWIND_PALETTE.has(colorMatch[2])) {
    if (VALID_SHADES.has(colorMatch[3])) return { ok: true };
    return { ok: false, reason: `色シェード ${colorMatch[3]} は Tailwind 標準（50〜950）に無い` };
  }
  // サイズ系 root: suffix を厳密検証（w-fll をここで捕まえる）
  for (const root of SIZE_ROOTS) {
    if (t.startsWith(root)) {
      const suffix = t.slice(root.length);
      if (/^\d+(\.\d+)?$/.test(suffix) || /^\d+\/\d+$/.test(suffix) || SIZE_SUFFIXES.has(suffix)) {
        return { ok: true };
      }
      return { ok: false, reason: `${root} の値 "${suffix}" が Tailwind の標準値に無い` };
    }
  }
  for (const root of LOOSE_ROOTS) {
    if (t.startsWith(root)) return { ok: true };
  }
  return { ok: false, reason: '既存コード・Tailwind 文法のどちらにも無いクラス' };
}

function nearestToken(t, dict) {
  let best = null;
  let bestDist = 3;
  for (const d of dict) {
    const dist = levenshtein(t, d);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best ? { token: best, dist: bestDist } : null;
}

function concatSplit(t, dict, themeNames) {
  if (t.length < 9) return null;
  for (let i = 3; i < t.length - 3; i++) {
    const left = t.slice(0, i);
    const right = t.slice(i);
    // 両片がそれぞれ完全な Tailwind クラスとして成立する場合のみ連結ミスと疑う
    const shaped = (s) => s.includes('-') || STANDALONE_CLASSES.has(s);
    if (!shaped(left) || !shaped(right)) continue;
    const leftOk = dict.has(left) || validateTailwindToken(left, dict, themeNames).ok;
    const rightOk = dict.has(right) || validateTailwindToken(right, dict, themeNames).ok;
    if (leftOk && rightOk && (dict.has(left) || dict.has(right))) return { left, right };
  }
  return null;
}

function checkTailwind(file, content, dict, themeNames) {
  if (!file.endsWith('.tsx')) return;
  const seen = new Set();
  for (const cand of extractClassCandidates(content)) {
    for (const tokenRaw of cand.text.split(/\s+/)) {
      const t = normalizeToken(tokenRaw);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      const line = lineOf(content, cand.index);
      // 辞書に無いトークンは、緩い文法を通過しても連結ミスの可能性を先に確認する
      if (!dict.has(t)) {
        const split = concatSplit(t, dict, themeNames);
        if (split) {
          report(
            'WARN',
            file,
            line,
            'tailwind-concat',
            `"${t}" — 連結ミスの可能性: "${split.left} ${split.right}"`,
          );
          continue;
        }
      }
      const v = validateTailwindToken(t, dict, themeNames);
      if (v.ok) continue;
      const near = nearestToken(t, dict);
      let hint = v.reason;
      if (near) hint += `。近似: ${near.token} (d=${near.dist})`;
      report('WARN', file, line, 'tailwind-unknown', `"${t}" — ${hint}`);
    }
  }
}

// ---------- イベントハンドラ結線検査 ----------
function checkHandlers(file, content) {
  if (!file.endsWith('.tsx')) return;
  const decls = [];
  for (const m of content.matchAll(/(?:async\s+)?function\s+(handle[A-Z]\w*)/g)) {
    decls.push({ name: m[1], index: m.index });
  }
  for (const m of content.matchAll(/const\s+(handle[A-Z]\w*)\s*=/g)) {
    decls.push({ name: m[1], index: m.index });
  }
  for (const { name, index } of decls) {
    const occurrences = content.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 0;
    if (occurrences <= 1) {
      report(
        'FAIL',
        file,
        lineOf(content, index),
        'handler-unwired',
        `${name} は定義後どこからも参照されていない（結線漏れ）`,
      );
    }
  }
  // props で受けた onX が使われていない（型注釈・分割代入以外に出現しない）
  const propNames = new Set();
  for (const m of content.matchAll(/[{,]\s*(on[A-Z]\w*)\s*[,}:=]/g)) propNames.add(m[1]);
  for (const name of propNames) {
    const all = content.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 0;
    const typeAnnotations = content.match(new RegExp(`\\b${name}\\??\\s*:`, 'g'))?.length ?? 0;
    const usages = all - typeAnnotations - 1; // -1 = 分割代入での出現
    if (usages <= 0 && all > 0) {
      const idx = content.search(new RegExp(`\\b${name}\\b`));
      report(
        'WARN',
        file,
        lineOf(content, idx),
        'prop-handler-unused',
        `props の ${name} が要素に渡されていない可能性（型注釈と分割代入以外に出現しない）`,
      );
    }
  }
}

// ---------- 'use client' 検査 ----------
const HOOK_RE =
  /\buse(State|Effect|Ref|Memo|Callback|Reducer|Transition|Optimistic|ActionState|Context|LayoutEffect)\s*\(/;
// notFound / redirect はサーバーでも合法なので、client 専用 hooks の import のみ検出する
const NAV_HOOK_RE =
  /import\s*(?:type\s*)?\{[^}]*\buse(Router|SearchParams|Pathname|Params|SelectedLayoutSegments?)\b[^}]*\}\s*from\s*['"]next\/navigation['"]/;
const EVENT_ATTR_RE = /\son[A-Z]\w*=\{/;
const BROWSER_GLOBAL_RE = /\b(window\.|document\.|localStorage|sessionStorage|navigator\.)/;
// client 前提のライブラリ（これらの import があれば 'use client' は不要付与でない）
const CLIENT_LIB_RE = /from\s+['"](recharts|@base-ui\/react)/;

function hasUseClientDirective(content) {
  const head = content.slice(0, 500);
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(head);
}

function checkUseClient(file, content) {
  if (!file.endsWith('.tsx') || !file.startsWith('apps/web/src')) return;
  const directive = hasUseClientDirective(content);
  const usesHooks = HOOK_RE.test(content) || NAV_HOOK_RE.test(content);
  const usesEvents = EVENT_ATTR_RE.test(content);
  const usesBrowser = BROWSER_GLOBAL_RE.test(content) || CLIENT_LIB_RE.test(content);
  if (!directive && usesHooks) {
    report(
      'FAIL',
      file,
      1,
      'use-client-missing',
      `hooks / next-navigation を使うが 'use client' が無い`,
    );
  } else if (!directive && usesEvents) {
    report(
      'WARN',
      file,
      1,
      'use-client-missing',
      `JSX イベント属性があるが 'use client' が無い（子が client component なら合法。要目視）`,
    );
  }
  if (directive && !usesHooks && !usesEvents && !usesBrowser) {
    report(
      'INFO',
      file,
      1,
      'use-client-unnecessary',
      `'use client' 不要付与の可能性（hooks・イベント・browser API 不使用）`,
    );
  }
}

// ---------- 識別子タイポ検査 ----------
function extractBriefIdentifiers(briefDir) {
  const idents = new Set();
  const dir = join(repoRoot, briefDir);
  if (!existsSync(dir)) return idents;
  for (const entry of readdirSync(dir)) {
    if (extname(entry) !== '.md') continue;
    const md = readFileSync(join(dir, entry), 'utf8');
    const codeText = [
      ...[...md.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]),
      ...[...md.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]),
    ].join('\n');
    for (const m of codeText.matchAll(/[A-Za-z_$][A-Za-z0-9_$]{2,}/g)) idents.add(m[0]);
  }
  return idents;
}

function extractDeclaredIdentifiers(content) {
  const out = [];
  for (const m of content.matchAll(
    /(?:function|class|interface|type|const|let|enum)\s+([A-Za-z_$][A-Za-z0-9_$]{2,})/g,
  )) {
    out.push({ name: m[1], index: m.index });
  }
  return out;
}

function buildBaseWordFrequency() {
  const freq = new Map();
  const files = [...listBaseFiles('apps/web/src'), ...listBaseFiles('packages')].filter(
    (f) => !/\.(test|spec)\./.test(f),
  );
  for (const f of files) {
    const content = readBaseFile(f);
    if (!content) continue;
    for (const m of content.matchAll(/[A-Za-z_$][A-Za-z0-9_$]{2,}/g)) {
      for (const w of splitIdentifier(m[0])) freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  return freq;
}

function checkIdentifiers(file, content, briefIdents, wordFreq) {
  const declared = extractDeclaredIdentifiers(content);
  for (const { name, index } of declared) {
    // 指示書に存在する識別子はタイポ疑いの対象外（brief 由来の正当な新規語を誤検出しない）
    // 出典: shopping-list-core 事象 3（scaled が指示書にあるのに identifier-typo WARN）
    if (briefIdents.size > 0 && briefIdents.has(name)) continue;

    // (a) 指示書との突き合わせ: 指示書に無いが距離 1〜2 の識別子がある → タイポ疑い
    if (briefIdents.size > 0 && name.length >= 5) {
      let best = null;
      let bestDist = 3;
      for (const b of briefIdents) {
        const d = levenshtein(name, b);
        if (d > 0 && d < bestDist) {
          bestDist = d;
          best = b;
        }
      }
      if (best) {
        report(
          'WARN',
          file,
          lineOf(content, index),
          'identifier-brief-mismatch',
          `"${name}" は指示書に無い。指示書の "${best}" (d=${bestDist}) のタイポの可能性`,
        );
        continue;
      }
    }
    // (b) サブトークンのスペルチェック: 既存コードに無い単語で、頻出語と距離 1
    // brief 由来トークンは許可（指示書コードブロックから収穫した語を誤検出しない）
    if (wordFreq) {
      for (const w of splitIdentifier(name)) {
        if (w.length < 4 || (wordFreq.get(w) ?? 0) > 0) continue;
        if (briefIdents.size > 0) {
          let briefOk = false;
          for (const b of briefIdents) {
            if (b === w || splitIdentifier(b).includes(w)) {
              briefOk = true;
              break;
            }
          }
          if (briefOk) continue;
        }
        for (const [known, count] of wordFreq) {
          if (count >= 5 && known.length >= 4 && levenshtein(w, known) === 1) {
            report(
              'WARN',
              file,
              lineOf(content, index),
              'identifier-typo',
              `"${name}" 内の "${w}" は既存コードに無い単語。"${known}" (出現${count}回) のタイポの可能性`,
            );
            break;
          }
        }
      }
    }
  }
}

// ---------- スキーマ命名検査 ----------
function checkSchemaNaming(file, content) {
  if (!/schema\.ts$/.test(file)) return;
  for (const m of content.matchAll(/pgTable\(\s*'(\w+)'/g)) {
    if (!m[1].endsWith('s')) {
      report(
        'WARN',
        file,
        lineOf(content, m.index),
        'table-singular',
        `テーブル名 "${m[1]}" が複数形でない（既存規約: recipes / stores / products / price_records）`,
      );
    }
  }
}

// ---------- Zod refine メッセージ検査 ----------
function checkZodRefine(file, content) {
  for (const m of content.matchAll(/\.(refine|superRefine)\(/g)) {
    const after = content.slice(m.index, m.index + 400);
    if (!/message|error|ctx\.addIssue/.test(after)) {
      report(
        'INFO',
        file,
        lineOf(content, m.index),
        'zod-refine-message',
        `.${m[1]}() にエラーメッセージ指定が見当たらない。排他条件の分岐メッセージを確認`,
      );
    }
  }
}

// ---------- 実行 ----------
if (targetFiles.length === 0) {
  const msg = optAll
    ? 'apps/web/src に対象ファイルがありません'
    : `変更ファイルがありません（基準: ${baseRef ? baseRef.slice(0, 12) : '不明'}）。--all で全体検査できます`;
  if (optJson) {
    console.log(
      JSON.stringify({
        base: baseRef,
        files: [],
        findings: [],
        summary: { FAIL: 0, WARN: 0, INFO: 0 },
      }),
    );
  } else {
    console.log(msg);
  }
  process.exit(0);
}

const dict = harvestDictionary();
const themeNames = themeNamesFromGlobalsCss();
const briefIdents = optBrief ? extractBriefIdentifiers(optBrief) : new Set();
const wordFreq = buildBaseWordFrequency();

for (const file of targetFiles) {
  const content = readFileSync(join(repoRoot, file), 'utf8');
  checkTailwind(file, content, dict, themeNames);
  checkHandlers(file, content);
  checkUseClient(file, content);
  checkIdentifiers(file, content, briefIdents, wordFreq);
  checkSchemaNaming(file, content);
  checkZodRefine(file, content);
}

// ---------- 出力 ----------
const order = { FAIL: 0, WARN: 1, INFO: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file));
const summary = { FAIL: 0, WARN: 0, INFO: 0 };
for (const f of findings) summary[f.severity]++;

if (optJson) {
  console.log(JSON.stringify({ base: baseRef, files: targetFiles, findings, summary }, null, 2));
} else {
  console.log(
    `対象: ${targetFiles.length} ファイル（基準: ${baseRef ? baseRef.slice(0, 12) : 'なし'}）`,
  );
  if (optBrief) console.log(`指示書: ${optBrief}（識別子 ${briefIdents.size} 件）`);
  console.log('');
  for (const f of findings) {
    console.log(`${f.severity} ${f.file}:${f.line} [${f.rule}] ${f.message}`);
  }
  if (findings.length === 0) console.log('指摘なし');
  console.log('');
  console.log('===== summary =====');
  console.log(`FAIL: ${summary.FAIL} / WARN: ${summary.WARN} / INFO: ${summary.INFO}`);
  if (summary.FAIL > 0)
    console.log('FAIL は差し戻し候補。WARN / INFO は目視で PASS / FAIL を確定すること。');
}

process.exit(summary.FAIL > 0 ? 1 : 0);
