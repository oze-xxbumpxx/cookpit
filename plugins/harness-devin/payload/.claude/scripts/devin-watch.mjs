#!/usr/bin/env node
// ローカルのDevinの実装状況を1画面にまとめて定期表示する（見張り画面）。
//
// 使い方:
//   node .claude/scripts/devin-watch.mjs <Issue番号> [--interval秒] [--once] [--clone <path>]
//   node .claude/scripts/devin-watch.mjs --log-path <Issue番号>
//     Devinの出力をteeするログのパスを出す。置き場（0700）とファイル（0600）が無ければ作る。
//     起動はreview-devin-prの「委譲」2のとおり、pipefailを付けてteeする。
//   node .claude/scripts/devin-watch.mjs --install
//     状態ディレクトリのbin/devin-watchにこのスクリプトへのリンクを張る。
//     Claude Codeのターミナル（run_in_terminal）はASCIIのコマンドしか受け付けず、
//     リポジトリのパスに日本語などが入っていると直接呼べないため、リンク経由で起動する:
//     `~/.local/state/<名前空間>/bin/devin-watch <Issue番号>`
//
// なぜ要るか:
// - `devin -p`の出力は発言をつなげた文字列だけで、実行中のコマンドや変更中のファイルが見えない（2026-09-27）。
//   Devinが実行したコマンドは`devin acp`の子プロセスとして現れるので、それと作業用コピーのgitの状態、
//   ログ（review-devin-prの起動手順でteeした`devin-logs/issue-<n>.log`）を組み合わせて見せる。
//
// 方針:
// - 表示の組み立て（render）と、ps・git・ghの出力の解釈は純粋関数にして、テストで固定する。
// - 作業用コピーではDevinを同時に1つしか動かさない（review-devin-pr）。そのため本体は
//   「作業ディレクトリが作業用コピーで、`-p`付きで動いているdevin」を探す。対話で開いたdevin
//   （`-p`なし）と、別の場所で動くdevinは対象にしない。Issue番号で探さないのは、直しを頼む
//   セッションのプロンプトにはIssue番号ではなくPR番号が入るため。
// - ghは30秒に1回だけ呼ぶ。失敗しても画面は止めない。

import { execFileSync } from 'node:child_process';
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStateDir } from '../lib/harness-paths.mjs';
import { checksComplete, ciConclusion } from './wait-for-pr-update.mjs';

// 既定の専用クローンは ~/devin-work/<リポジトリのフォルダ名>。DEVIN_CLONEで変えられる。
const REPO_ROOT = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_CLONE = process.env.DEVIN_CLONE || join(homedir(), 'devin-work', basename(REPO_ROOT));
const DEFAULT_INTERVAL_SEC = 5;
const GH_INTERVAL_MS = 30_000;
const IDLE_WARN_MS = 10 * 60_000;
const RECENT_FILES = 8;

export function parseArgs(argv) {
  const opts = { issue: null, interval: DEFAULT_INTERVAL_SEC, once: false, install: false, logPath: false, clone: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--once') opts.once = true;
    else if (arg === '--install') opts.install = true;
    else if (arg === '--log-path') opts.logPath = true;
    else if (arg === '--interval') opts.interval = Number(argv[++i]);
    else if (arg === '--clone') opts.clone = argv[++i] ?? null;
    else if (/^\d+$/.test(arg) && opts.issue === null) opts.issue = Number(arg);
    else throw new Error(`不明な引数: ${arg}`);
  }
  if (!opts.install && opts.issue === null) throw new Error('Issue 番号を指定してください');
  if (opts.install && opts.logPath) throw new Error('--install と --log-path は同時に使えません');
  if (!Number.isFinite(opts.interval) || opts.interval < 1) throw new Error('--interval は 1 以上の秒数');
  return opts;
}

// 端末では全角文字が2桁を使う。幅で切らないと日本語の行が折り返して画面が崩れる。
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

export function displayWidth(text) {
  let width = 0;
  for (const ch of text) width += WIDE.test(ch) || ch.codePointAt(0) > 0xffff ? 2 : 1;
  return width;
}

/** 表示幅maxに収まるよう文字単位で切る（UTF-8のバイトやUTF-16の途中で切らない）。 */
export function truncate(text, max) {
  if (displayWidth(text) <= max) return text;
  let out = '';
  let width = 0;
  for (const ch of text) {
    const w = displayWidth(ch);
    if (width + w > max - 1) break;
    out += ch;
    width += w;
  }
  return `${out}…`;
}

/** ログの末尾を文に分ける。Devinの -p出力は文と文のあいだに改行も空白も無いことがある。 */
export function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/([。.!?！？]) ?(?=[A-Z一-龥ぁ-んァ-ヶ「（(`])/gu, '$1\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** `ps -ax -o pid=,ppid=,etime=,command=`の出力を行に分ける。 */
export function parsePs(text) {
  return text
    .split('\n')
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/))
    .filter((m) => m !== null)
    .map(([, pid, ppid, etime, command]) => ({ pid: Number(pid), ppid: Number(ppid), etime, command }));
}

/** lsofはパスのUTF-8のバイトを`\xe5`の形で出す。元の文字列に戻す。 */
export function decodeLsofPath(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    const m = text.slice(i).match(/^\\x([0-9a-f]{2})/i);
    if (m !== null) {
      bytes.push(parseInt(m[1], 16));
      i += 3;
    } else {
      bytes.push(...Buffer.from(text[i], 'utf8'));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * 見張るDevinの本体と、その下の`devin acp`を探す。
 * @param {(pid:number) => string|null} cwdOfプロセスの作業ディレクトリ（分からなければnull）
 */
export function findDevin(rows, { clone, cwdOf }) {
  const root = rows.find(
    (r) => /(^|\/)devin\s(.*\s)?(-p|--print)(\s|$)/.test(r.command) && !/devin acp/.test(r.command) && cwdOf(r.pid) === clone,
  );
  if (root === undefined) return null;
  const acp = rows.find((r) => r.ppid === root.pid && /devin acp$/.test(r.command)) ?? null;
  return { root, acp };
}

/**
 * Devinが直接実行しているコマンド（`devin acp`の子）と、その下で動くプロセスの数。
 * vitestのワーカーなどは数だけにしないと、画面がプロセスの一覧で埋まる。
 */
export function directCommands(rows, acpPid) {
  const parent = new Map(rows.map((r) => [r.pid, r.ppid]));
  const commands = [];
  let others = 0;
  for (const row of rows) {
    if (row.ppid === acpPid) {
      commands.push(row);
      continue;
    }
    let q = parent.get(row.ppid) === undefined ? null : row.ppid;
    while (q !== null && q !== acpPid && q > 1) q = parent.get(q) ?? null;
    if (q === acpPid) others += 1;
  }
  return { commands, others };
}

/**
 * コマンドの表示を短くする。作業用コピーのパス（psは日本語を`M-`の形で出す）を`<clone>`にし、
 * Devinの定型の`bash -c cd <clone> && `を落とす。
 */
export function shortenCommand(command, clone = DEFAULT_CLONE) {
  const tail = clone.split('/').slice(-2).join('/');
  const pathPattern = new RegExp(`\\S*${tail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
  return command
    .replace(pathPattern, '<clone>')
    .replace(/^(?:\/bin\/)?(?:ba|z)?sh -c (?:cd <clone> && )?/, '')
    .replace(/ 2>&1$/, '');
}

/** `git status --short --untracked-files=all`の行を数える。 */
export function summarizeStatus(lines) {
  const files = lines
    .filter((line) => line.length > 3)
    .map((line) => ({ code: line.slice(0, 2), path: line.slice(3) }));
  const count = (pred) => files.filter(pred).length;
  return {
    files,
    added: count((f) => f.code === '??' || f.code.includes('A')),
    modified: count((f) => f.code.includes('M') || f.code.includes('R')),
    deleted: count((f) => f.code.includes('D')),
  };
}

export function formatAge(ms) {
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))} 秒前`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} 分前`;
  return `${Math.floor(ms / 3_600_000)} 時間 ${Math.round((ms % 3_600_000) / 60_000)} 分前`;
}

/** gh pr listの1件を表示用にまとめる。 */
export function summarizePr(pr, nowMs) {
  if (pr === null || pr === undefined) return null;
  const rollup = pr.statusCheckRollup ?? [];
  const ci = rollup.length === 0 ? 'none' : checksComplete(rollup) ? ciConclusion(rollup) : 'pending';
  const comments = [...(pr.comments ?? []), ...(pr.reviews ?? []).map((r) => ({ ...r, createdAt: r.submittedAt }))]
    .filter((c) => c.createdAt)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const last = comments[0];
  return {
    number: pr.number,
    url: pr.url,
    state: pr.state,
    ci,
    comments: comments.length,
    lastComment: last === undefined ? null : { author: last.author?.login ?? '?', age: formatAge(nowMs - Date.parse(last.createdAt)) },
  };
}

const CI_LABEL = { success: '成功', failure: '失敗あり', pending: '実行中', none: 'まだ無い' };

/**
 * 画面の文字列を作る。snapshotはmainが集めた値（テストでは手で作る）。
 * @param {object} s
 * @param {{width:number}} opts
 */
export function render(s, { width }) {
  const out = [];
  const line = (text = '') => out.push(truncate(text, width));
  const head = s.running
    ? `実行中（経過 ${s.elapsed}）`
    : '停止（Devin のプロセスが見つからない。終わったか、まだ起動していない）';
  line(`■ Devin #${s.issue}${s.title ? ` ${s.title}` : ''}`);
  line(`  ${s.clock}  ${head}  最後の動き: ${s.lastActivity ?? '-'}`);
  if (s.running && s.idleMs !== null && s.idleMs > IDLE_WARN_MS && s.commands.length === 0) {
    line(`  ⚠ ${Math.round(s.idleMs / 60_000)} 分以上、コマンドもファイルの変更もありません。止まっていないか確かめてください`);
  }
  line();

  if (s.running) {
    line('■ 実行中のコマンド');
    if (s.commands.length === 0) line('  （なし。考えている・ファイルを書いている）');
    for (const c of s.commands) line(`  ${c.etime.padStart(8)}  ${c.command}`);
    if (s.others > 0) line(`            （その下で動いているプロセス ${s.others} 個）`);
    line();
  }

  line(`■ ブランチ  ${s.branch ?? '（detached）'}`);
  for (const c of s.commits) line(`  ${c}`);
  if (s.pr !== null) {
    const p = s.pr;
    const comment = p.lastComment === null ? 'コメントなし' : `コメント ${p.comments} 件（最新: ${p.lastComment.author}、${p.lastComment.age}）`;
    line(`  PR #${p.number}（${p.state}）  CI: ${CI_LABEL[p.ci] ?? p.ci}  ${comment}`);
  }
  line();

  const st = s.status;
  line(`■ 変更中のファイル  新規 ${st.added}・変更 ${st.modified}・削除 ${st.deleted}${s.diffStat ? `  ${s.diffStat}` : ''}`);
  if (st.files.length === 0) line('  （未コミットの変更なし）');
  for (const f of s.recentFiles) line(`  ${f.age.padStart(8)}  ${f.code} ${f.path}`);
  if (st.files.length > s.recentFiles.length) line(`  …ほか ${st.files.length - s.recentFiles.length} 件`);
  line();

  // 終わったあとは最後の報告を長めに見せる（止まった理由・品質確認の結果が書かれている）。
  const count = s.running ? 4 : 12;
  line(s.running ? '■ Devin の最近の発言' : '■ Devin の最後の報告');
  if (s.sentences === null) line('  （ログなし）');
  else for (const text of s.sentences.slice(-count)) line(`  ${text}`);
  return out.join('\n');
}

// ---- ここから下は外部コマンドとファイルを読む薄い層 ----

function run(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 });
  } catch {
    return null;
  }
}

function harnessEnv(repo) {
  // ターミナルから直接起動するとsettingsのenv（HARNESS_NAMESPACE）が無い。状態ディレクトリを揃えるため読む。
  if (process.env.HARNESS_NAMESPACE) return process.env;
  try {
    const settings = JSON.parse(readFileSync(join(repo, '.claude/settings.json'), 'utf8'));
    const ns = settings?.env?.HARNESS_NAMESPACE;
    return ns ? { ...process.env, HARNESS_NAMESPACE: ns, CLAUDE_PROJECT_DIR: repo } : process.env;
  } catch {
    return process.env;
  }
}

function cwdOf(pid) {
  const out = run('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn']);
  const line = out?.split('\n').find((l) => l.startsWith('n'));
  return line === undefined ? null : decodeLsofPath(line.slice(1));
}

/** ログの置き場（0700）とファイル（0600）を用意してパスを返す。Devinの発言を他の利用者に読ませない。 */
function ensureLog(stateDirPath, issue) {
  const dir = join(stateDirPath, 'devin-logs');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const path = join(dir, `issue-${issue}.log`);
  closeSync(openSync(path, 'a', 0o600));
  chmodSync(path, 0o600);
  return path;
}

function mtimeMs(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

function logTail(path) {
  const size = mtimeMs(path) === null ? null : statSync(path).size;
  if (size === null) return null;
  const buf = readFileSync(path);
  // バイトの途中から読むと先頭の文字が壊れるため、壊れた文字（U+FFFD）を落とす。
  return buf.subarray(Math.max(0, size - 4000)).toString('utf8').replace(/^�+/, '');
}

function collect(opts, cache, nowMs) {
  const rows = parsePs(run('ps', ['-ax', '-o', 'pid=,ppid=,etime=,command=']) ?? '');
  const devin = findDevin(rows, { clone: opts.clone, cwdOf });
  const { commands, others } = devin?.acp ? directCommands(rows, devin.acp.pid) : { commands: [], others: 0 };
  const clone = opts.clone;
  const branch = run('git', ['-C', clone, 'branch', '--show-current'])?.trim() || null;
  const commits = (run('git', ['-C', clone, 'log', '--format=%h %cr  %s', 'origin/main..HEAD']) ?? '')
    .split('\n').filter(Boolean).slice(0, 5);
  const status = summarizeStatus((run('git', ['-C', clone, 'status', '--short', '--untracked-files=all']) ?? '').split('\n'));
  const diffStat = run('git', ['-C', clone, 'diff', '--shortstat'])?.trim() ?? '';

  const filesWithTime = status.files
    .map((f) => ({ ...f, mtime: mtimeMs(join(clone, f.path)) }))
    .filter((f) => f.mtime !== null)
    .sort((a, b) => b.mtime - a.mtime);
  const recentFiles = filesWithTime.slice(0, RECENT_FILES).map((f) => ({ ...f, age: formatAge(nowMs - f.mtime) }));

  const logMtime = mtimeMs(opts.logPath);
  const lastCommitMs = Number(run('git', ['-C', clone, 'log', '-1', '--format=%ct', 'origin/main..HEAD'])?.trim() || 0) * 1000 || null;
  const activity = [logMtime, filesWithTime[0]?.mtime ?? null, lastCommitMs].filter((v) => v !== null);
  const lastMs = activity.length === 0 ? null : Math.max(...activity);

  if (branch !== null && nowMs - cache.ghAt > GH_INTERVAL_MS) {
    cache.ghAt = nowMs;
    const json = run('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1',
      '--json', 'number,url,state,statusCheckRollup,comments,reviews'], opts.repo);
    if (json !== null) {
      try {
        cache.pr = JSON.parse(json)[0] ?? null;
      } catch {
        // 次の周期で取り直す
      }
    }
    if (cache.title === null) {
      cache.title = run('gh', ['issue', 'view', String(opts.issue), '--json', 'title', '-q', '.title'], opts.repo)?.trim() || null;
    }
  }

  const tail = logTail(opts.logPath);
  return {
    issue: opts.issue,
    title: cache.title,
    clock: new Date(nowMs).toTimeString().slice(0, 8),
    running: devin !== null,
    elapsed: devin?.root.etime ?? null,
    commands: commands.map((c) => ({ etime: c.etime, command: shortenCommand(c.command, clone) })),
    others,
    lastActivity: lastMs === null ? null : formatAge(nowMs - lastMs),
    idleMs: lastMs === null ? null : nowMs - lastMs,
    branch,
    commits,
    pr: summarizePr(cache.pr, nowMs),
    status,
    diffStat,
    recentFiles,
    sentences: tail === null ? null : splitSentences(tail),
  };
}

function install(stateDirPath, scriptPath) {
  const binDir = join(stateDirPath, 'bin');
  mkdirSync(binDir, { recursive: true, mode: 0o700 });
  const link = join(binDir, 'devin-watch');
  if (existsSync(link) || (() => { try { return lstatSync(link).isSymbolicLink(); } catch { return false; } })()) unlinkSync(link);
  symlinkSync(scriptPath, link);
  chmodSync(scriptPath, 0o755);
  return link;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  const scriptPath = realpathSync(fileURLToPath(import.meta.url));
  const repo = dirname(dirname(dirname(scriptPath)));
  const state = resolveStateDir({ env: harnessEnv(repo), root: repo });
  if (opts.install) {
    const link = install(state.dir, scriptPath);
    process.stdout.write(`リンクを作りました: ${link}\n起動: ${link.replace(homedir(), '~')} <Issue番号>\n`);
    return;
  }
  if (opts.logPath) {
    process.stdout.write(`${ensureLog(state.dir, opts.issue)}\n`);
    return;
  }
  opts.clone ??= process.env.DEVIN_CLONE || DEFAULT_CLONE;
  opts.repo = repo;
  opts.logPath = join(state.dir, 'devin-logs', `issue-${opts.issue}.log`);
  const cache = { ghAt: 0, pr: null, title: null };

  const draw = () => {
    const width = Math.max(40, (process.stdout.columns || 100) - 1);
    const screen = render(collect(opts, cache, Date.now()), { width });
    // 消してから描くとちらつくので、カーソルを先頭へ戻して上書きし、残りを消す。
    process.stdout.write(opts.once ? `${screen}\n` : `\x1b[H${screen.split('\n').map((l) => `${l}\x1b[K`).join('\n')}\n\x1b[J`);
  };
  if (opts.once) {
    draw();
    return;
  }
  process.stdout.write('\x1b[2J');
  draw();
  setInterval(draw, opts.interval * 1000);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
