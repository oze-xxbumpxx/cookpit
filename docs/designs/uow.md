# 設計書: uow

- ステータス: confirmed（Gate A ユーザー確定・2026-08-13。トランザクション境界は UseCase）
- レベル: L3
- 関連: `docs/requirements/uow.md` / [ADR-0019](../decisions/ADR-0019-db-transaction-uow.md) /
  [ADR-0006](../decisions/ADR-0006-shopping-list-generate-idempotent.md)

## 背景

`docs/requirements/uow.md` §背景と同一。要約: 非トランザクションの部分失敗窓を閉じる。
`neon-http` では対話型トランザクションが使えない。境界は UseCase が貼る。

## 目的

集約横断および単一集約の複文書き込みを 1 トランザクションで原子的にし、HTTP 契約は変えない。

## 要件

要件書 FR-1〜FR-9、N-1〜N-5、E-1〜E-5、B-1〜B-4 を参照。

## 対象範囲

| 層             | 実装対象                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Domain         | `UnitOfWork` ポート（`packages/domain/src/shared/unit-of-work.ts`）                                 |
| Infrastructure | `createDb` を neon-serverless へ。`DrizzleUnitOfWork`。全 Drizzle Repository が `uow.client` を使う |
| Application    | 書き込み UseCase のコンストラクタに `UnitOfWork` を追加し、`execute` を包む                         |
| Presentation   | `createWriteContext()`。書き込み Hono ルートが同一 UoW から組み立てる                               |
| テスト         | PGlite ロールバック。Application は passthrough UoW                                                 |

## 対象外

要件書 §対象外と同一。`SendExpiryAlertsUseCase` 全体の包みは FR-7。

## 現状構成

- [`packages/infrastructure/src/db/client.ts`](../../packages/infrastructure/src/db/client.ts): `drizzle(neon(url))`（neon-http）
- Repository: `constructor(private readonly db: DrizzleClient)`
- UseCase: Repository だけを手動 DI。複数 `save()` を順に await
- ルート: `shoppingListRepository()` 等が毎回 `new Drizzle*(getDb())`

## 変更後構成

```
Route ── new UseCase(repos..., uow) ── execute()
                                          │
                                          ▼
                                   uow.execute(work)
                                          │
                                          ▼
                              db.transaction(async tx => {
                                uow.currentTx = tx
                                await work()   // find / ドメイン / save
                              })
```

Repository は `this.uow.client`（tx 中は tx、それ以外は db）を使う。コンストラクタ時に
`uow.client` を値として受け取ると、execute 前の db が固定されて tx に乗らない。

## データフロー

1. 書き込みルートが `createWriteContext()` で 1 リクエスト = 1 `DrizzleUnitOfWork` と配下 Repository を作る
2. UseCase に repos + uow を渡して `execute`
3. `uow.execute` が BEGIN。work 内の全クエリが同一セッション
4. work が正常 return なら COMMIT、throw なら ROLLBACK
5. 読み取りルートは従来どおり `recipeRepository()` 等（内部で使い捨ての UoW を持ち、`execute` は呼ばない）

## API 設計

対象外（契約変更なし）。

## DB 設計

対象外（スキーマ変更なし。ドライバとセッションのみ）。

## フロントエンド設計

対象外。

## バックエンド設計

### Domain

```ts
export interface UnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
```

Repository と同じポートとして Domain に置く。Application に置くと Infrastructure → Application になり依存方向が壊れる。

### Infrastructure

`DrizzleUnitOfWork`:

- `constructor(db: DrizzleClient)`
- `get client(): DrizzleClient` → `currentTx ?? db`
- `execute`: ネストなら throw。`db.transaction` 内で `currentTx` をセットし、finally で戻す
- **リクエスト毎に new**。Pool は `globalThis` シングルトン

`createDb`:

- `Pool` + `drizzle-orm/neon-serverless`
- Node 向け `neonConfig.webSocketConstructor = ws`
- `max: 1`、Pool を `globalThis` に保持

Repository コンストラクタは `DrizzleUnitOfWork` を受け、`private get db()` で `uow.client` を返す。既存の `this.db.select()` はそのまま。

### Application

書き込み UseCase の最後の引数に `UnitOfWork`。`execute` は `return this.unitOfWork.execute(() => this.run(input))`。本体は `private run` へ移す。保存順序・冪等分岐は変えない。

対象（uow を足す）:

- shopping-list: Generate / AddItem / MarkAsBought / SetItemChecked / ReassignStore / RemoveItem / CompleteShopping / Reopen / Sync
- recipe: Create / Update / Delete
- product: Create / Update / Delete / RecordPrice / UpdatePriceRecord / DeletePriceRecord
- pantry: AddStock / ConsumeStock / DiscardStock / UpdateStockDetails
- meal-plan: Create / AddRecipe / RemoveRecipe
- store: Create / Rename / Delete
- notification: Subscribe / Unsubscribe

対象外（読み取り、または FR-7）: 全ての Get*、GetStoreUsage、GetProductDetail、GetCheapestStore、SendExpiryAlerts、GetExpiringStocks

### Presentation

```ts
export function createWriteContext(): WriteContext {
  const uow = new DrizzleUnitOfWork(getDb());
  return {
    uow,
    recipe: new DrizzleRecipeRepository(uow),
    // ...全 Repository
  };
}
```

書き込みルートだけ context から組み立てる。読み取り factory は `new DrizzleXRepository(new DrizzleUnitOfWork(getDb()))` に更新（execute しないので現行と同じ自動コミット）。

## エラー処理

外部 I/O は DB（既存）と、除外した Web Push のみ。

- (a) リトライ: 新規の自動リトライは置かない。既存の冪等再実行（ADR-0006）がクライアント／ユーザー再操作で収束する
- (b) タイムアウト: DB は既存 `getDb()` / Neon 側。トランザクションを長く持たない（外部 I/O を tx に入れない）
- (c) 冪等性: 既存 UseCase の冪等を維持。トランザクションは部分失敗窓を閉じる追加
- (d) 部分失敗: `uow.execute` 内の例外は ROLLBACK。ルートの onError は現行どおり
- (e) フォールバック: DB ダウン時は既存 500。縮退なし

## ログと監視

対象外（既存 `console.error`）。

## セキュリティ

新規認証・新規公開面なし。Pool のリーク防止として isolate あたり `max: 1`、UoW はリクエストスコープ。未コミットの tx は Drizzle が throw 時に ROLLBACK する。

## 性能

WebSocket セッション上の複文は、Sprint 9 で測った HTTPS 4 往復より安い想定。Pool をリクエスト毎に new+end しない。`save()` の SQL 形は変えない。

## テスト方針

- Infrastructure: PGlite で COMMIT / ROLLBACK / 2 Repository の原子性 / ネスト拒否
- Application: passthrough UoW（`execute: (w) => w()`）で既存テストを維持
- Presentation: ルートテストは Hono 経由のため、factory 変更に追随するだけ

詳細は `docs/tests/uow.md`。

## 移行とリリース

スキーマ移行なし。マージ後のデプロイでドライバが切り替わる。ロールバックは ADR-0019 参照。

## リスク

| #   | リスク                                                           | 対応                                            |
| --- | ---------------------------------------------------------------- | ----------------------------------------------- |
| R-1 | コンストラクタ時に `uow.client` を値キャプチャして tx に乗らない | Repository は getter で都度 `uow.client` を見る |
| R-2 | UoW をシングルトンにして currentTx が混線                        | リクエスト毎に new。Pool だけ使い回す           |
| R-3 | ルートが別々の UoW から repo と UseCase を作る                   | `createWriteContext()` で一組にする             |
| R-4 | PGlite と neon-serverless の型不一致                             | 現行どおり `as unknown as DrizzleClient`        |
| R-5 | SendExpiryAlerts を包んで Push 中に tx を保持                    | FR-7 で除外                                     |

## 未決事項

なし。
