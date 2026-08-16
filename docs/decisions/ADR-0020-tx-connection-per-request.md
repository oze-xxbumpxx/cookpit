# ADR-0020: 書き込みトランザクションの WebSocket 接続をリクエストごとに張り捨てる

- Status: Accepted（決定内容は維持。ただし 2026-08-16 の Preview PASS は撤回 — 下記 実行記録）
- Date: 2026-08-16
- 関連 feature: uow

## Context（背景・なぜ判断が必要か）

[ADR-0019](./ADR-0019-db-transaction-uow.md) は書き込みを対話型トランザクションで包むと決め、
本番ドライバを `neon-serverless`（WebSocket `Pool`）へ切り替えた。2026-08-13 に接続失敗で
読み取りごと全画面が落ち、同 ADR の Rollback 手順で neon-http へ戻した（実行記録）。

2026-08-15、設計書 `docs/designs/uow.md`「トランザクション再導入（案 S）」に沿って
**書き込み経路だけ** WebSocket に載せ直した（PR #171 / `9ce1a06`）。キルスイッチ
`DB_WRITE_TRANSACTION` を置き、既定 OFF とした。

2026-08-16、本番で `DB_WRITE_TRANSACTION=on` にしたところ、次のエラーが再発した。

```
Error: Connection terminated unexpectedly
    at j.<anonymous> (.next/server/chunks/686.js:24:19894)
    ...
    at J.emitClose (.next/server/chunks/686.js:1:8406)
```

本セッションの切り分けで以下が判明した。

1. この文字列を生成するのは `@neondatabase/serverless@1.1.0` の pg 由来 Client の
   `once("end")` ハンドラだけ（`index.mjs:1010`）。スタック末尾の `emitClose` は `ws`。
   **neon-http（fetch）はこの経路を持たない** ため、`createTxDb()` が実際に呼ばれている。
2. **読み取りは健全だった。** 実測（2026-08-16 07:11 UTC）で `GET /api/health` は 200 /
   `db:"connected"` / 0.66s、`/api/recipes` 等の読み取り API と SSR ページは全て 200 /
   0.2〜0.3s。**案 S の経路分離は設計どおり機能している。**
3. ユーザー報告は「読み取りも止まる。書き込みの有無とは無関係」。これは H-3 と整合する。
   `globalThis.__cookpitNeonPool` の WS ソケットは**リクエストより長生きする**ため、
   ソケットが死ぬ時刻は、それを張った書き込みリクエストと切り離されている。死亡イベントが
   飛んだときにたまたま同じインスタンスで処理中だったリクエストが巻き添えになる。
   一度でも書き込みが通ったウォームインスタンスは、以降そのリスクを抱え続ける。
4. **H-1 は少なくともリージョン差ではない。** Vercel は `sin1`（`vercel.json`）、Neon は
   AWS `ap-southeast-1`（Neon Console で確認）で同一メトロ。
5. 設計書の判定表「Pool の error リスナ未登録で落ちる → 該当せず」は**実質的に誤り**。
   リスナは登録されているが、ログが素のスタックトレースである以上
   `console.error('neon pool error', err.message)` を通っていない。登録済みリスナは
   この経路を拾えていない。

ADR-0019 は Consequences で「WebSocket 接続は HTTP より cold start が重い（**warm Pool
再利用で相殺する**）」と書いた。この前提を維持できるかを判断する必要がある。

## Decision（採用した決定）

1. **書き込み用の接続は 1 リクエスト 1 接続にする。** `globalThis` による Pool の
   使い回しを廃止する。ADR-0019 の「warm Pool 再利用で相殺する」という前提を**破棄する**。
2. **`Pool`（`max: 1`）ではなく `Client` を使う。** 1 回使って捨てる `max: 1` の Pool は、
   Client に余計な機構とアイドルソケットの危険を足しただけである。
3. **接続の open / close の責任を `UnitOfWork` に持たせる。** 現行の
   `createTxClient?: (() => DrizzleClient) | null` は閉じる手段を持たない。
   `() => Promise<TxConnection>`（`{ db, close }`）へ変更し、`execute` が `finally` で
   必ず `close()` を await する。
4. **読み取り・SSR は `neon-http` のまま。** 案 S の経路分離は今回の実測で有効性が
   確認できたので継続する。
5. **キルスイッチ `DB_WRITE_TRANSACTION` は維持し、既定 OFF のまま。** 有効化は Preview で
   書き込みを一巡させ、接続確立のレイテンシを実測してから本番へ。
6. **PGlite（dev / テスト）は対象外。** 単一プロセス上の接続で `close` は no-op とする。

## Alternatives（検討した非採用案と却下理由）

| 案                                          | 内容                                                                       | 却下理由                                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W: グローバル Pool を維持し死活確認を足す   | 取得した接続に `SELECT 1` 等を打ち、死んでいたら張り直す                   | 生存確認自体が 1 往復を足すので、都度接続とコストが変わらない。凍結中はタイマーも走らず、いつ死んだかを検出する手段が結局往復しかない。複雑さだけ増える |
| P: `idleTimeoutMillis` / `maxUses` を詰める | アイドル接続を早く捨てる                                                   | **インスタンス凍結中はタイマーが発火しない。** 今回の失敗モードにまったく効かない                                                                       |
| F: Fluid Compute 前提で再利用を続ける       | インスタンスが長生きし同時実行も持つので、再利用が成立するという読み       | 長生きしてもアイドル凍結とソケット切断は残る。現に観測されている障害を説明できない。再利用するなら結局 W の死活確認が要る                               |
| B: 非対話バッチ化                           | 全 SQL を先に並べて 1 往復で送る（ADR-0019 案 A / 設計書 案 B）            | 却下理由は不変。`CompleteShoppingUseCase` は read-modify-write が交互に並び、後続の書き込み内容が前段の読み取り結果に依存する                           |
| H: neon-http の非対話トランザクション       | `sql.transaction([...])` に配列で渡す                                      | 同上。対話型でないと畳めない                                                                                                                            |
| R: トランザクションを諦める                 | `DB_WRITE_TRANSACTION` を恒久 OFF とし、部分失敗の許容範囲を明示して締める | Sprint 10 完了条件 2「集約横断の書き込みが部分失敗しない」が未達のまま残る。ただし**本番復旧の暫定手段としては有効**（Rollback 参照）                   |

## Consequences（良い影響・悪い影響・残るリスク）

- 良: **リクエストより長生きするソケットが無くなる。** 無関係なリクエストが巻き添えで落ちる
  経路が構造的に消える。今回の障害の再発条件そのものが無くなる
- 良: 接続の寿命がリクエストの寿命と一致し、FaaS の凍結・解凍と衝突しない
- 悪: 書き込みのたびに接続確立コストを払う。同一リージョン（`sin1` ↔ `ap-southeast-1`）で
  TCP 1 RTT + TLS 1 RTT + WS アップグレード 1 RTT + パイプライン化された PG 認証
  （`pipelineConnect: "password"` が既定）≒ 4 RTT、**おおむね 10〜30 ms と見積もる。
  これは計算値であり未実測。** 読み取り・SSR には乗らない
- 悪: `createTxClient` が async になるため、既存の UoW テスト 14 件に影響する
- リスク 1: **`close()` の取りこぼしが即再発につながる。** `work()` が例外を投げた場合も
  閉じることをテストで必須化する
- リスク 2: `-pooler`（PgBouncer transaction mode）経由の場合、セッション単位の機能
  （PG レベルの prepared statement・`LISTEN/NOTIFY`・文をまたぐ advisory lock）は使えない。
  drizzle の neon-serverless 経路がこれらに依存していないかは**未確認**
- リスク 3: 本番 `DATABASE_URL` が pooled エンドポイントを指しているかは、Vercel の
  Sensitive 変数が書き込み専用のため**読み出せず未確定**。ローカル `.env.local` には
  `-pooler` が含まれる（値は読まずマッチ数のみ確認）
- 未変更: ADR-0019 のリスク 2（並行 save の lost update）・リスク 3（ネスト `execute` 非対応）は
  そのまま残る

## Migration（移行が必要な場合の手順。不要なら「対象外」）

対象外（DB スキーマ変更なし）。デプロイしただけでは挙動は変わらず、有効化は
`DB_WRITE_TRANSACTION=on` の設定と再デプロイによる。

## Rollback（決定を戻す場合の手順）

**コード変更は不要。** Vercel の Production 環境変数 `DB_WRITE_TRANSACTION` を削除
（または `on` 以外に変更）し、**再デプロイする**。環境変数の変更は再デプロイまで
実行中の関数へ反映されない。

これで `createWriteUnitOfWork` が `useTransaction: false` / `createTxClient: null` を返し、
`getTxConnection` も `createTxConnection` も呼ばれず、`neonConfig` にも触れない。全経路
neon-http の状態（2026-08-13 〜 08-15 と同じ）に戻る。原子性は失われるが、ADR-0006 の
冪等・前方回復は残っているので生成・完了の再実行は従来どおり収束する。

### 実行記録（2026-08-16・Preview）

PR [#173](https://github.com/oze-xxbumpxx/cookpit/pull/173) の Preview Deployment に
`DB_WRITE_TRANSACTION=on` を設定し、**ユーザーが**読み取りの生存確認と書き込みの一巡を
実施した。**問題なし。**

これは 2026-08-13 と 08-16 の 2 度の事故で**どちらも省略されていた工程**である
（レビュー H-01）。有効化を本番でいきなり試さない運用に切り替えた最初の実施例。

- 判定: PASS（ユーザー実施・観測はユーザーによる報告）
- **書き込みレイテンシの実測値は未記録。** 設計書 U-2 は開いたまま。
  見積もり 10〜30 ms が当たっていたかは確認できていない
- **本番での有効化はこの時点で未実施。** Sprint 10 完了条件 2 は本番 ON をもって達成となる

> **この PASS は撤回する（2026-08-16 追記）。** 下記のとおり本番で `b.mask is not a function`
> が出た。この不具合は環境に依存せず、WS 経路で書き込みが走れば Preview でも必ず落ちる。
> **したがって上記の Preview 検証では WS 経路が一度も実行されていなかった可能性が高い**
> （環境変数の設定後に再デプロイしていなければ、書き込みは neon-http を通って正常に見える）。
> 「本番でいきなり試さない運用の最初の実施例」という評価も撤回する。
> **観測できたのは「画面が正常に動いた」ことだけで、「WS 経路が動いた」ことではなかった。**
> 08-15 のログにある「報告 ≠ 観測」を、記録する側の私が繰り返した。

### 実行記録（2026-08-16・本番）— `b.mask is not a function`

PR #173 をマージし本番で `DB_WRITE_TRANSACTION=on` にしたところ、別の障害が出た。

```
Uncaught Exception: TypeError: b.mask is not a function
    at a.exports.mask (.next/server/chunks/686.js:12:51886)
    at s.frame / s.dispatch / s.send / J.send
    at Timeout._onTimeout
```

**原因は接続の寿命ではなくバンドルである。** ビルド成果物から確認した。

1. Next.js は `ws` の optional なネイティブ依存 `bufferutil` / `utf-8-validate` を
   **空モジュールへエイリアスする**（`chunks/219.js` に `91840:()=>{}`）
2. `ws/lib/buffer-util.js` は `require('bufferutil')` が throw することを前提に
   純 JS 実装へフォールバックする設計。**空モジュールが返ると throw しないので
   catch が働かず**、「ネイティブを呼ぶラッパー」が入る
3. そのラッパーは `length < 48` なら JS、**48 バイト以上なら `bufferUtil.mask`** を呼ぶ。
   `bufferUtil` は `{}` なので `TypeError`
4. `@neondatabase/serverless` は `coalesceWrites`（既定 ON）で同一 tick の書き込みを
   1 フレームに連結し **`setTimeout(0)` で送る**。reject される Promise が無いため
   **未捕捉例外となり、Vercel の関数プロセスごと落ちる**

15 秒後の `neon tx client error Connection terminated unexpectedly` は、本 ADR で追加した
`client.on('error')` が後始末を拾ったログ。この listener 自体は意図どおり機能している。

**対処**: `apps/web/next.config.ts` に `env: { WS_NO_BUFFER_UTIL: '1' }` を追加し、
ビルド時に `ws` 側のガードを静的に false にして try ブロックごと除去する。
`serverExternalPackages: ['ws']` も試したが**効果なし**（`ws` はバンドルされたまま）。

検証（ビルド成果物）: `WS_NO_BUFFER_UTIL` の文字列と 48 バイト分岐が消え、`mask` が
純 JS 実装 `c[d+f]=a[f]^b[3&f]` に固定されることを確認した。

**残る問題**: 自動テストは全層 PGlite で、**WebSocket 経路の実行時カバレッジがゼロ**である。
`pnpm build` が通ってもバンドルの実行時挙動は検証できない。2026-08-13 / 08-16 の 3 度の
障害はいずれもこの穴から出ている。

## References（設計書・要件・関連 ADR・外部資料へのリンク）

- 先行: [ADR-0019](./ADR-0019-db-transaction-uow.md)（本 ADR は Consequences の
  「warm Pool 再利用で相殺する」を破棄し、接続の寿命方針を差し替える）
- 関連: [ADR-0006](./ADR-0006-shopping-list-generate-idempotent.md)（冪等・前方回復は防衛線として維持）
- 設計書: `docs/designs/uow.md`（「トランザクション再導入（案 S）」の H-3 を本 ADR が確定させる）
- 実装計画: `docs/implementation-plans/uow.md`
- 実装: PR #164（`c28123e` 全面 WS）/ PR #168（`e3fe8f5` 差し戻し）/ PR #171（`9ce1a06` 案 S）
- ドライバ既定値は `@neondatabase/serverless@1.1.0` の `index.d.mts` で確認
  （`pipelineConnect: "password"` / `useSecureWebSocket: true` / `wsProxy: host => host + '/v2'`）。
  Neon 公式ドキュメントはこの環境から取得できない（egress が 403）
