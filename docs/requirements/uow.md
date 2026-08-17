# 要件定義: uow

- task-id / 変更レベル: Sprint 10 Unit B（roadmap タスク3「DB トランザクション / UoW 導入」）/ L3
- 作成日: 2026-08-13（Gate A ユーザー確定・2026-08-13。推奨案を採用し、トランザクション境界は UseCase が貼ると訂正）
- 最終状態: 2026-08-16 に本番有効化済み。初期 Gate A の「全経路 WebSocket + warm Pool」は
  本番障害を受けて撤回し、読み取りは neon-http、書き込みだけ WebSocket の
  **1 リクエスト 1 接続**へ変更した（ADR-0019 / ADR-0020）。境界・原子性・契約不変の要求は維持する。

## 背景

ADR-0006 は Generate の 2 集約更新を非トランザクションのままにし、部分失敗は冪等再実行で収束させると決めた。同じ割り切りが CompleteShopping（4 集約）・在庫引き算連携・献立同期（Unit A）へ継承された。Sprint 10 の完了条件「集約横断の書き込みが部分失敗しない」はこの申し送りを閉じる。

キックオフ時の実測で、現行 `createDb()` は `drizzle-orm/neon-http` であり対話型 `db.transaction()` を持たない。UoW を入れる先行条件はドライバ変更である。加えて Sprint 9 は `DrizzleShoppingListRepository.save()` がチェック 1 回のために 3 往復することを申し送った。原因は HTTPS 1 本ずつのクエリであり、SQL を 1 文にまとめることではない。

## 目的

- 集約をまたぐ書き込みが途中失敗しても、先行した保存が残らないようにする。
- 単一集約の `save()` 複文（upsert → delete → upsert）も同じ仕組みで原子的にする。
- HTTP API・Zod・DB スキーマは変えない。

## ユーザー要求（原文の要約）

- roadmap Sprint 10 完了条件 2 件目: 「集約横断の書き込みが部分失敗しない（トランザクション境界が引かれている）」
- Sprint 9 申し送り: `DrizzleShoppingListRepository.save()` の 3 往復をトランザクション導入と同時に扱う
- Gate A（2026-08-13、ユーザー確定。当初案。接続方式は ADR-0020 が上書き）:
  1. 本番ドライバは `drizzle-orm/neon-serverless` + `Pool`（WebSocket）へ全面切替
  2. トランザクションは **UseCase が `unitOfWork.execute` で貼る**。HTTP ルートは BEGIN/COMMIT しない
  3. 包む範囲は書き込み UseCase すべて（集約横断の 4 本に限定しない）
- 当初の確認不要事項: 読み取り HTTP / 書き込み WS のハイブリッドは作らない。
  この接続方針だけは 2026-08-15 の案 S と ADR-0020 により撤回した。`save()` の SQL 形を
  変えず、既存の冪等・前方回復を残す判断は維持する。

## 機能要件

- FR-1: 本番は読み取り・SSR を `neon-http`、書き込みトランザクションだけを
  `neon-serverless`（WebSocket `Client`）に分ける。書き込み接続は使い回さず、
  `UnitOfWork.execute()` ごとに張って必ず閉じる。dev / テストの PGlite は維持する。
- FR-2: Domain に `UnitOfWork` ポートを置き、Infrastructure が `db.transaction()` で実装する。
- FR-3: 書き込み UseCase は `execute()` の本体を `this.unitOfWork.execute(...)` で包む。Repository は同じ UoW インスタンスの接続（tx 中は tx）を使う。
- FR-4: 集約横断 UseCase（Generate / CompleteShopping / Sync / DeleteStore）で、後段の保存が例外を投げたら先行した保存も残らない。
- FR-5: 単一集約の書き込み（例: チェック操作の `save()` 複文）も UseCase の 1 トランザクションに入る。
- FR-6: 読み取り専用 UseCase（Get*）と SSR は `UnitOfWork.execute` を使わない。
- FR-7: `SendExpiryAlertsUseCase` は Web Push の外部 I/O を含むため、`execute` 全体を DB トランザクションで包まない（購読削除は単一文であり文単位で原子的）。
- FR-8: ネストした `UnitOfWork.execute` はサポートしない（現状 UseCase 間呼び出しは無い）。
- FR-9: HTTP 契約・Zod・DB マイグレーションを追加しない。

## 非機能要件

- WebSocket 接続を `globalThis` や Pool で再利用しない。FaaS のリクエスト寿命に合わせ、
  `Client` を 1 回使って閉じる。接続確立コストは U-2 として実測課題に残す。
- UoW インスタンスはリクエスト毎に `new` する（`currentTx` をフィールドに持つためシングルトンにしない）。
- 追加費用なし（Neon / Vercel 現行プランのまま）。

## 正常系

| #   | 観点                                                          | 期待                                              |
| --- | ------------------------------------------------------------- | ------------------------------------------------- |
| N-1 | Generate が ShoppingList・Pantry・MealPlan を保存して成功する | 3 集約とも永続化される。HTTP の入出力は現行どおり |
| N-2 | CompleteShopping が 4 集約を保存して成功する                  | 現行の保存順序のまま全てコミットされる            |
| N-3 | Sync がリストと Pantry を保存して成功する                     | 現行どおり                                        |
| N-4 | チェック操作（SetItemChecked）が成功する                      | リスト行と品目行が矛盾なく残る                    |
| N-5 | 読み取り GET / SSR はトランザクションを開始しない             | 現行と同じ単発クエリ                              |

## 異常系

| #   | 観点                                                  | 期待                                                               |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| E-1 | Generate で MealPlan 保存の直前に例外                 | ShoppingList / Pantry の先行保存が残らない                         |
| E-2 | CompleteShopping で後段保存が例外                     | 先行した Pantry / Product / ShoppingList が残らない                |
| E-3 | 単一集約 `save()` の途中（delete 後 upsert 前）で例外 | 品目が消えた中間状態が残らない                                     |
| E-4 | `UnitOfWork.execute` のネスト                         | 例外（サポート外）                                                 |
| E-5 | ドメイン例外（NotFound 等）                           | トランザクションは ROLLBACK。HTTP の既存エラーマッピングは変えない |

## 境界条件

| #   | 観点                                                                | 期待                                                 |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| B-1 | 書き込み UseCase が save を 1 回も呼ばない（no-op）                 | 空のトランザクションがコミットされるだけで副作用なし |
| B-2 | 冪等パス（Generate の既存返却、CompleteShopping の completed 修復） | 包んだまま現行の分岐が動く                           |
| B-3 | PGlite（dev / テスト）                                              | 同じ `UnitOfWork` 実装で ROLLBACK を検証できる       |
| B-4 | SendExpiryAlerts の購読削除                                         | トランザクション対象外。単一文 DELETE                |

## 前提

- Gate A 3 点はユーザー確定済み。
- 手動 DI。DI コンテナは導入しない。
- Domain は Drizzle を知らない。Repository インターフェースは Domain に置く現行どおり。
- Unit A（meal-plan-sync）は main 反映済み。本ユニットは独立。

## 制約

- `neon-http` の非対話バッチ（全 SQL を先に並べる）は使わない。Find → ドメイン操作 → Save が混在するため。
- AsyncLocalStorage は使わない（接続の出所をコード上見えるようにする）。
- `save()` の SQL（全品目 delete + 再 upsert）は書き換えない。

## 対象範囲

- Domain: `UnitOfWork` ポート
- Infrastructure: 読み取り用 `createDb`（neon-http）、書き込み用 `createTxConnection`
  （neon-serverless）、`DrizzleUnitOfWork`、全 Drizzle Repository の接続の取り方
- Application: 書き込み UseCase への `UnitOfWork` 注入と `execute` の包み
- Presentation: 書き込みルートが同一 UoW から Repository と UseCase を組み立てる。読み取り factory は維持
- テスト: PGlite での ROLLBACK、Application は passthrough UoW

## 対象外

- HTTP API / Zod / DB マイグレーション
- Domain Entity の変更
- UseCase の保存順序・冪等ロジックの組み替え（包むだけ）
- `save()` の SQL 統合、部分 UPDATE 化
- Unit C（ConsumeStock 冪等キー）、タスク 2（mapper JST）、タスク 5（Push 実機）
- `SendExpiryAlertsUseCase` 全体の DB トランザクション化（FR-7）

## 後方互換性・データ移行

対象外（スキーマ変更なし。既存行の意味は変わらない）。クライアントから見た HTTP 契約も不変。

## 受け入れ条件（Definition of Done に対応）

- Generate / CompleteShopping / Sync / DeleteStore で後段失敗時に先行保存が残らないことを PGlite で示せる
- 書き込み UseCase が `unitOfWork.execute` を呼ぶ。ルートは BEGIN/COMMIT しない
- 本番接続が `drizzle-orm/neon-serverless` である
- `pnpm lint` / `pnpm type-check` / `pnpm test` が対象パッケージで通る
- L3 成果物（要件・設計・ADR・実装計画・試験計画・レビュー）が揃う

## 未決事項

- U-2: 書き込み用 WebSocket 接続のレイテンシ実測（見積もり 10〜30 ms の裏取り）
- U-3: 本番 `DATABASE_URL` が pooled endpoint か（Vercel Sensitive 変数のため確認不能）
- U-4: transaction pooling とセッション機能の両立
- WebSocket 経路の自動テストは未整備。依存更新時は Preview で書き込みを一巡させる。
