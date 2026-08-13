# ADR-0019: 書き込み UseCase を DB トランザクション（UoW）で原子的に実行する

- Status: Accepted（2026-08-13 ユーザー確定・Gate A）
- Date: 2026-08-13
- 関連 feature: uow

## Context（背景・なぜ判断が必要か）

[ADR-0006](./ADR-0006-shopping-list-generate-idempotent.md) は Generate の 2 集約更新を
非トランザクションのままにし、部分失敗は冪等再実行で収束させると決めた。全 Repository 横断の
課題として Sprint 4 スコープ外へ送った。その後 CompleteShopping・在庫引き算・献立同期が
同じ窓を継承した。

Sprint 10 の完了条件は「集約横断の書き込みが部分失敗しない」。これを満たすには対話型
トランザクションが要る。現行 `createDb()` は `drizzle-orm/neon-http` で
`db.transaction()` を持たない。どこに境界を置くか（ルートか UseCase か）も決める必要がある。

## Decision（採用した決定）

1. **本番ドライバを `drizzle-orm/neon-serverless`（WebSocket `Pool`）へ切り替える。**
   PGlite（dev / テスト）は維持する。
2. **トランザクション境界は書き込み UseCase。** Domain に `UnitOfWork` ポートを置き、
   UseCase が `this.unitOfWork.execute(() => 本体)` で包む。HTTP ルートは BEGIN/COMMIT せず、
   同じ UoW インスタンスから Repository と UseCase を組み立てるだけとする。
3. **包む対象は書き込み UseCase すべて**（集約横断の 4 本に限定しない）。単一集約の
   `save()` 複文も同じ窓を持つ。読み取り専用 UseCase と SSR は包まない。
4. **例外:** `SendExpiryAlertsUseCase` は Web Push の外部 I/O を `execute` 内で行うため、
   全体を DB トランザクションで包まない。
5. **ADR-0006 の冪等・前方回復は残す。** 本 ADR が閉じるのは「トランザクションを入れない」
   という申し送りだけ。リトライ安全性（既存リスト返却、completed の修復）は防衛線として残る。

## Alternatives（検討した非採用案と却下理由）

| 案                               | 内容                                                          | 却下理由                                                                                           |
| -------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A: neon-http の非対話バッチ      | 全 SQL を先に並べて 1 HTTP で送る                             | Find → ドメイン操作 → Save が混在する CompleteShopping 等を Application から組み替える侵襲が大きい |
| B: ルートで `runInTransaction`   | UseCase を触らず composition root が包む                      | 「どの操作が原子的か」が HTTP アダプタに漏れる。別入口からの呼び出し忘れで部分失敗が復活する       |
| C: AsyncLocalStorage             | UseCase は `uow.execute` し、Repository は ALS から tx を取る | 動くが接続の出所が見えない。手動 DI の明示志向と合わない                                           |
| D: 集約横断の 4 UseCase だけ包む | 完了条件の文言どおり最小                                      | 単一集約 `save()` の複文（チェック途中で品目が消える）が残る                                       |
| E: `save()` の SQL を 1 文に統合 | delete + upsert を CTE 化                                     | Sprint 9 の 3 往復の主因は HTTPS。ドライバ変更で足りる。SQL 形の変更は別リスク                     |

## Consequences（良い影響・悪い影響・残るリスク）

- 良: 集約横断の部分失敗窓が閉じる。チェック 1 回の複文も原子的。UseCase が境界を宣言するので呼び出し忘れがない
- 悪: 書き込み UseCase とルートの組み立て、Repository テストのコンストラクタが少し増える。WebSocket 接続は HTTP より cold start が重い（warm Pool 再利用で相殺する）
- リスク 1: トランザクション中に長い外部 I/O を入れないこと（FR-7 で SendExpiryAlerts を除外済み）
- リスク 2: 並行リクエスト間の lost update（集約丸ごと save）は本 ADR の対象外。既存の既知制約
- リスク 3: ネストした `execute` は未サポート。UseCase 間呼び出しを将来足すときは再訪する

## Migration（移行が必要な場合の手順。不要なら「対象外」）

対象外（DB スキーマ変更なし。デプロイした瞬間から新しいドライバとトランザクションが有効）。

## Rollback（決定を戻す場合の手順）

1. `packages/infrastructure/src/db/client.ts` を `drizzle-orm/neon-http` に戻す
2. `UnitOfWork.execute` を恒等関数（`work()` をそのまま呼ぶ）に差し替えるか、UseCase から除去する
3. 部分失敗の自己修復（ADR-0006）は残っているので、戻しても生成・完了の再実行は従来どおり収束する

## References（設計書・要件・関連 ADR・外部資料へのリンク）

- 要件: `docs/requirements/uow.md`
- 設計書: `docs/designs/uow.md`
- 先行: [ADR-0006](./ADR-0006-shopping-list-generate-idempotent.md)（冪等は維持、非トランザクションの申し送りを本 ADR が閉じる）
- 関連: `docs/designs/pantry-core.md` R-3 / `docs/designs/meal-plan-sync.md` 対象外（Unit B）
- ドライバ: [Drizzle + Neon](https://orm.drizzle.team/docs/connect-neon)
