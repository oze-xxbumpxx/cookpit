#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CLONE } from './devin-watch.mjs';
import { resolveStateDir } from '../lib/harness-paths.mjs';

const MODELS = ['swe-2-medium', 'swe-2-high', 'swe-2-max'];
const CONFIG = join(dirname(fileURLToPath(import.meta.url)), '../config/delegation-review.json');

/**
 * 使い方: delegation-launch.mjs <Issue番号> --runner local --model <swe-2-medium|swe-2-high|swe-2-max>
 *   --prompt-file <本人だけが読めるファイル> [--clone <専用クローン>]
 * Issueは`delegation.mjs open-task`で作ったもの。起動の結果は1行のJSONで出し、自動で起動し直さない。
 */
export function parseLaunchArgs(argv) {
  const [issueText, ...args] = argv;
  const options = { issue: Number(issueText), runner: null, model: null, promptFile: null, clone: null };
  for (let i = 0; i < args.length; i += 2) {
    const field = { '--runner': 'runner', '--model': 'model', '--prompt-file': 'promptFile', '--clone': 'clone' }[args[i]];
    if (field === undefined || args[i + 1] === undefined || options[field] !== null) throw new Error('起動引数を確認してください');
    options[field] = args[i + 1];
  }
  if (!/^[1-9]\d*$/.test(issueText ?? '') || !['local', 'cloud'].includes(options.runner) || !MODELS.includes(options.model) || !options.promptFile) {
    throw new Error('Issue番号、runner、model、非公開prompt fileが必要です');
  }
  return options;
}

export function buildDevinArgs({ runner, model, promptFile, exportFile = null }) {
  if (!['local', 'cloud'].includes(runner) || !MODELS.includes(model)) throw new Error('runner/modelが不正です');
  return [...(runner === 'cloud' ? ['--cloud'] : []), '--model', model, '--permission-mode', 'dangerous', ...(exportFile === null ? [] : ['--export', exportFile]), '-p', '--prompt-file', promptFile];
}

const SESSION = /^[A-Za-z0-9_-]{1,128}$/;
const LOCK_NAME = 'devin-clone.lock';

/**
 * 専用クローンごとのロックの名前。既定のクローンは前からの`devin-clone.lock`のままにし、
 * 変更の前に起動したDevinのロックも効くようにする。ほかのクローンは実パスの要約値で分ける。
 */
export function lockNameFor(clone, defaultClone = DEFAULT_CLONE) {
  let base = defaultClone;
  try { base = realpathSync(defaultClone); } catch { /* 既定のクローンが無くても名前は決められる */ }
  if (clone === base) return LOCK_NAME;
  return `devin-clone-${createHash('sha256').update(clone).digest('hex').slice(0, 16)}.lock`;
}
export const OBSERVE_MS = 60_000;
export const OBSERVE_INTERVAL_MS = 2_000;

/** 手元の`devin list --format json`を、専用クローンを作業フォルダにして読む（読み取りだけ）。 */
function listLocalSessions(clone, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    execFile('devin', ['list', '--format', 'json'], { cwd: clone, timeout: Math.max(1, Math.min(10_000, timeoutMs)), maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) { reject(error); return; }
      try { resolve(JSON.parse(stdout)); } catch (parseError) { reject(parseError); }
    });
  });
}

/** 一覧のうち、専用クローンで動いたセッションのIDだけを返す。形が違えば例外。 */
export function sessionIdsIn(list, clone) {
  if (!Array.isArray(list)) throw new Error('セッションの一覧の形が違います');
  return list.filter((item) => item?.working_directory === clone).map((item) => {
    if (typeof item.id !== 'string' || !SESSION.test(item.id)) throw new Error('セッションのIDの形が違います');
    return item.id;
  });
}

/** 書き出し（ATIF）の先頭のsession_idを読む。会話の本文は使わない。まだ無い・読めなければnull。 */
export function readExportSessionId(path) {
  try {
    const id = JSON.parse(readFileSync(path, 'utf8'))?.session_id;
    return typeof id === 'string' && SESSION.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * 手元のセッションのIDを、起動の前の一覧との差で決める。
 * 書き出しは作業が終わるまで出ない見込みなので、確定には使わず、出ていれば照合だけに使う。
 * 待つ時間いっぱい読み、最後まで新しいIDがちょうど1つのときだけ返す。途中で2つ以上になればnull。
 */
export async function observeLocalSession({ before, clone, exportFile, listSessions, sleep, now = Date.now, observeMs = OBSERVE_MS, intervalMs = OBSERVE_INTERVAL_MS }) {
  let found = [];
  // 一覧を読む時間も含めて数える。読むのが遅くても、待つ時間の上限を超えないため。
  const deadline = now() + observeMs;
  while (now() < deadline) {
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
    const remaining = deadline - now();
    if (remaining <= 0) break;
    let current;
    try { current = sessionIdsIn(await listSessions(clone, remaining), clone); } catch { return null; }
    found = current.filter((id) => !before.has(id));
    if (found.length > 1) return null;
  }
  if (found.length !== 1) return null;
  const exported = readExportSessionId(exportFile);
  if (exported !== null && exported !== found[0]) return null;
  return found[0];
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/**
 * 1つの専用クローンを使う起動を1つに絞る（クローンが違えば並行で起動できる）。起動したら、Devinのプロセスが終わるまでロックを残す
 * （同じクローンで2つの作業が混ざらないため）。記録したDevinのプロセスが終わっていれば
 * 取り直す。プロセスが分からないロック（起動の結果が不明なもの）は自動で消さず、人が確かめる。
 */
export function acquireCloneLock(stateDir, { clone, isAlive = processAlive } = {}) {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const name = lockNameFor(clone);
  const path = join(stateDir, name);
  // クローンごとに分ける前のロックには、どのクローンかの記録が無い。既定以外のクローンで
  // 取られたかもしれないので、そのDevinが動いているかもしれないあいだは、どのクローンでも起動しない。
  const legacy = join(stateDir, LOCK_NAME);
  if (name !== LOCK_NAME && existsSync(legacy)) {
    let previous = null;
    try { previous = JSON.parse(readFileSync(legacy, 'utf8')); } catch { previous = null; }
    const pid = previous?.devin_pid;
    if (typeof previous?.clone !== 'string' && (!Number.isSafeInteger(pid) || pid <= 0 || isAlive(pid))) throw new Error('クローンの記録が無いロックがあります');
  }
  if (existsSync(path)) {
    let previous = null;
    try { previous = JSON.parse(readFileSync(path, 'utf8')); } catch { previous = null; }
    const pid = previous?.devin_pid;
    if (!Number.isSafeInteger(pid) || pid <= 0 || isAlive(pid)) throw new Error('専用クローンを使う別の起動があります');
    rmSync(path, { force: true });
  }
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify({ clone, wrapper_pid: process.pid, devin_pid: null, at: new Date().toISOString() })); } finally { closeSync(fd); }
  let held = false;
  return {
    /** 起動したDevinのプロセスを書いて、ロックを残す。pidが分からなければnullのまま残す。 */
    hold(devinPid) {
      held = true;
      writeFileSync(path, JSON.stringify({ clone, wrapper_pid: process.pid, devin_pid: Number.isSafeInteger(devinPid) && devinPid > 0 ? devinPid : null, at: new Date().toISOString() }), { mode: 0o600 });
    },
    /** 起動しなかったときだけロックを外す。 */
    finish() {
      if (!held) rmSync(path, { force: true });
    },
  };
}

function privatePrompt(path) {
  const file = realpathSync(path);
  const info = statSync(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error('prompt fileは本人だけが読める通常ファイルにしてください');
  return file;
}

function privateLog(stateDir, issue) {
  const dir = join(stateDir, 'devin-logs');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const path = join(dir, `issue-${issue}.log`);
  const fd = openSync(path, 'a', 0o600);
  chmodSync(path, 0o600);
  return { path, fd };
}

async function spawnDevin({ args, clone, logFd }) {
  return new Promise((resolve, reject) => {
    const child = spawn('devin', args, { cwd: clone, detached: true, stdio: ['ignore', logFd, logFd] });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve({ session_id: null, session_url: null, observed_model: 'unknown', pid: child.pid ?? null }); });
  });
}

export async function launchDelegation(options, dependencies = {}) {
  const config = dependencies.config ?? JSON.parse(readFileSync(CONFIG, 'utf8'));
  if (config.cli_launch_verified !== true) return { exitCode: 4, state: 'unknown', reason: '手元の起動の確認待ちです' };
  if (!Number.isSafeInteger(options.issue) || options.issue <= 0 || !MODELS.includes(options.model)) return { exitCode: 2, state: 'invalid' };
  // クラウドは内部の再送とURLの形を確かめるまで止める。
  if (options.runner !== 'local') return { exitCode: 4, state: 'unknown', reason: 'クラウドの起動は確認待ちです' };
  let promptFile;
  let stateDir;
  try {
    promptFile = privatePrompt(options.promptFile);
    const resolved = dependencies.stateDir === undefined ? resolveStateDir({ env: process.env }) : { dir: dependencies.stateDir, trusted: true };
    if (!resolved.trusted) return { exitCode: 4, state: 'unknown', reason: '永続する状態保存先を確認できません' };
    stateDir = resolved.dir;
  } catch {
    return { exitCode: 2, state: 'invalid', reason: '非公開ファイルと状態保存先を確認してください' };
  }
  let clone;
  let lock;
  try {
    clone = realpathSync(options.clone ?? DEFAULT_CLONE);
    lock = (dependencies.acquireCloneLock ?? acquireCloneLock)(stateDir, { clone, isAlive: dependencies.isAlive ?? processAlive });
  } catch {
    return { exitCode: 4, state: 'unknown', reason: `このクローンを使う別の起動があるか、クローンがありません。状態の置き場の${clone === undefined ? LOCK_NAME : lockNameFor(clone)}を確かめてください` };
  }
  const listSessions = dependencies.listSessions ?? listLocalSessions;
  let spawned = false;
  let observed = null;
  let log;
  const activationId = (dependencies.uuid ?? randomUUID)();
  const exportFile = join(stateDir, 'devin-logs', `export-${activationId}.json`);
  try {
    let before;
    try { before = new Set(sessionIdsIn(await listSessions(clone), clone)); } catch { return { exitCode: 5, state: 'unknown', reason: 'セッションの一覧を読めません。起動していません' }; }
    try {
      if (existsSync(exportFile)) throw new Error('書き出し先が既にあります');
      log = privateLog(stateDir, options.issue);
      spawned = true;
      observed = await (dependencies.spawnOnce ?? spawnDevin)({ args: buildDevinArgs({ runner: 'local', model: options.model, promptFile, exportFile }), clone, logFd: log.fd });
    } catch {
      observed = null;
    } finally {
      if (log !== undefined) closeSync(log.fd);
      // 起動を試みたら、成否が分からなくてもロックを残す（同じクローンで2つ動かさない）。
      if (spawned) lock.hold(observed?.pid ?? null);
    }
    // 手元のセッションにURLは無い。IDは起動の前後の一覧の差で決める。
    const sessionId = observed === null ? null : await observeLocalSession({ before, clone, exportFile, listSessions, sleep: dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))), now: dependencies.now, observeMs: dependencies.observeMs, intervalMs: dependencies.intervalMs });
    if (sessionId !== null) return { exitCode: 0, state: 'running', issue: options.issue, runner: 'local', requested_model: options.model, session_id: sessionId, pid: observed.pid ?? null };
    return { exitCode: 4, state: 'launch_unknown', issue: options.issue, reason: '起動結果を確かめてください（devin listとログ）。自動で起動し直しません' };
  } finally {
    lock.finish();
  }
}

export async function runLaunchCli(argv, dependencies = {}) {
  let options;
  try { options = parseLaunchArgs(argv); } catch { return { exitCode: 2, state: 'invalid', reason: '起動引数を確認してください' }; }
  return launchDelegation(options, dependencies);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await runLaunchCli(process.argv.slice(2));
    console.log(JSON.stringify(result));
    process.exitCode = result.exitCode;
  } catch {
    console.error('起動結果を確認できません。起動し直さず、devin listとログを確かめてください');
    process.exitCode = 5;
  }
}
