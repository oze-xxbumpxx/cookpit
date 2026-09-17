# docs/decisions

アーキテクチャ意思決定記録（ADR）を `ADR-<番号>-<タイトル>.md` で置く。

- プロジェクト恒久 ADR（ADR-0001〜0004）はここが正典（2026-07-04 に `docs/` 直下から移設・改名）。
- feature に伴う新規 ADR は主に Level 3 で作成し、`ADR-0005` から連番を続ける
  （採番規則は `.claude/skills/create-adr/SKILL.md`）。
- 新しい ADR を追加したら、下の一覧にも 1 行追記する。

## ADR 一覧

| ADR                                                          | タイトル                                                                                | ステータス                                                                  | 決定日     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------- |
| [0001](./ADR-0001-web-not-native.md)                         | Web アプリで実装する                                                                    | 採択                                                                        | 2026-05    |
| [0002](./ADR-0002-nextjs-hono-mounted.md)                    | Next.js 内に Hono をマウントする                                                        | 採択                                                                        | 2026-05    |
| [0003](./ADR-0003-no-auth-in-mvp1.md)                        | MVP1 は認証なしで運用する                                                               | 置換済み（[0021](./ADR-0021-basic-auth-for-public-repository.md)）          | 2026-05    |
| [0004](./ADR-0004-no-user-in-domain.md)                      | ドメインから User 集約を外す                                                            | 採択                                                                        | 2026-05    |
| [0005](./ADR-0005-week-definition-saturday-start.md)         | MealPlan の週定義に ISO 8601 週番号を採用せず土曜始まりを採用する                       | 採択                                                                        | 2026-07-05 |
| [0006](./ADR-0006-shopping-list-generate-idempotent.md)      | ShoppingList 生成を冪等にし、MealPlan 遷移の担当と `meal_plan_id` UNIQUE 制約を導入する | 採択                                                                        | 2026-07-13 |
| [0007](./ADR-0007-shopping-list-differential-merge.md)       | 献立変更を買い物リストへ差分マージする（明示トリガの同期 UseCase を追加）               | 採択                                                                        | 2026-07-24 |
| [0008](./ADR-0008-free-text-units.md)                        | 単位を自由記述（string）にする                                                          | 採択                                                                        | 2026-07-24 |
| [0009](./ADR-0009-shopping-list-item-check-uncheck.md)       | 買い物リストのチェックを価格記録から分離し、チェック解除を許可する                      | 採択                                                                        | 2026-07-24 |
| [0010](./ADR-0010-package-public-boundary.md)                | パッケージの公開境界をバレル（`index.ts`）に統一する                                    | 採択                                                                        | 2026-07-25 |
| [0011](./ADR-0011-shopping-item-hard-delete.md)              | 買い物リスト品目は物理削除する（`skipped` 状態を再利用しない）                          | 採択                                                                        | 2026-07-25 |
| [0012](./ADR-0012-store-delete-restrict-on-reference.md)     | 店舗は物理削除し、参照が 1 件でもあれば削除を拒否する                                   | 置換済み（[0013](./ADR-0013-store-limit-and-delete-cascade.md)）            | 2026-07-27 |
| [0013](./ADR-0013-store-limit-and-delete-cascade.md)         | 店舗マスタを 3 件上限・同名禁止とし、削除は参照ごとカスケードする                       | 採択                                                                        | 2026-07-27 |
| [0014](./ADR-0014-harness-plugin-three-layer-split.md)       | ハーネスを 3 層 Plugin として配布し、スタック固有資産は同梱しない                       | 採択                                                                        | 2026-07-31 |
| [0015](./ADR-0015-store-rename-for-typo-correction.md)       | 店舗のリネームを「誤字訂正」目的で採用する（重複統合は対象外）                          | 採択                                                                        | 2026-08-05 |
| [0016](./ADR-0016-stock-details-mutable.md)                  | Stock の数量・賞味期限・保存場所を可変にする                                            | 採択                                                                        | 2026-08-09 |
| [0017](./ADR-0017-web-push-expiry-alert.md)                  | 賞味期限アラートを Web Push（VAPID）+ 日次 Cron で実現する                              | 採択                                                                        | 2026-08-09 |
| [0018](./ADR-0018-meal-plan-sync-delete-and-quantity.md)     | 献立同期で pending 品目の削除追随と数量上書きを行う                                     | 採択                                                                        | 2026-08-13 |
| [0019](./ADR-0019-db-transaction-uow.md)                     | 書き込み UseCase を DB トランザクション（UoW）で原子的に実行する                        | 採択（接続方式は [0020](./ADR-0020-tx-connection-per-request.md) が上書き） | 2026-08-13 |
| [0020](./ADR-0020-tx-connection-per-request.md)              | 書き込みトランザクションの WebSocket 接続をリクエストごとに張り捨てる                   | 採択                                                                        | 2026-08-16 |
| [0021](./ADR-0021-basic-auth-for-public-repository.md)       | リポジトリ公開にあたり本番を Basic 認証で保護する                                       | 採択                                                                        | 2026-09-16 |
| [0022](./ADR-0022-review-readiness-as-decision-interface.md) | レビュー記録を監査ログと意思決定インターフェースの二層にする                            | 採択                                                                        | 2026-08-11 |
