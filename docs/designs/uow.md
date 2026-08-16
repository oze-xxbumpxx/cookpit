# 設計書: uow

- ステータス: confirmed（Gate A ユーザー確定・2026-08-13。トランザクション境界は UseCase）
- レベル: L3
- 関連: `docs/requirements/uow.md` / [ADR-0019](../decisions/ADR-0019-db-transaction-uow.md) /
  [ADR-0006](../decisions/ADR-0006-shopping-list-generate-idempotent.md)
- 本番: 2026-08-13 に neon-http へロールバック。UseCase の包みは残るが、本番 `execute` は
  `work()` の恒等実行（ADR-0019 実行記録）。再導入は Preview で接続確認してから。

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
- `execute`: 入場時に同期的に `busy` を立て、ネスト / 並行呼び出しなら throw。`db.transaction` 内で `currentTx` をセットし、finally で戻す
- **リクエスト毎に new**。Pool は `globalThis` シングルトン

`createDb`:

- `Pool` + `drizzle-orm/neon-serverless`
- Node 向け `neonConfig.webSocketConstructor = ws`
- `max: 1`、Pool を `globalThis` に保持
- idle 切断の未捕捉例外を避けるため `pool.on('error')` を登録する（`err.message` のみログ）
- `connectionTimeoutMillis: 5000`。`max: 1` の取得待ちを無期限にしない
- `databaseUrl` が変わったときは旧 Pool を `end()` してから差し替える

Repository コンストラクタは `DrizzleUnitOfWork` を受け、`private get db()` で `uow.client` を返す。既存の `this.db.select()` はそのまま。

### Application

書き込み UseCase の最後の引数に `UnitOfWork`。`execute` は `return this.unitOfWork.execute(async () => { ... })` で本体を包む。保存順序・冪等分岐は変えない。

対象（uow を足す）:

- shopping-list: Generate / AddItem / MarkAsBought / SetItemChecked / ReassignStore / RemoveItem / CompleteShopping / Reopen / Sync
- recipe: Create / Update / Delete
- product: Create / Update / Delete / RecordPrice / UpdatePriceRecord / DeletePriceRecord
- pantry: AddStock / ConsumeStock / DiscardStock / UpdateStockDetails
- meal-plan: Create / AddRecipe / RemoveRecipe
- store: Create / Rename / Delete
- notification: Subscribe / Unsubscribe

対象外（読み取り、または FR-7）: 全ての Get\*、GetStoreUsage、GetProductDetail、GetCheapestStore、SendExpiryAlerts、GetExpiringStocks

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

## トランザクション再導入の設計案（2026-08-15・提案。未確定）

**本節は提案であり、採用は未確定。** 実装前にユーザー確認を要する（CLAUDE.md「提案 → 確認 →
実装」）。ADR-0019 の実行記録（2026-08-13 ロールバック）を受けた再検討。

### 現状の問題

`apps/web/src/server/repositories.ts:32` が `new DrizzleUnitOfWork(getDb(), { useTransaction: false })`
であり、**本番ではトランザクションが効いていない**。`useTransaction: false` は `work()` を
そのまま実行するだけなので、Sprint 10 完了条件 2「集約横断の書き込みが部分失敗しない」は
**構造だけ入って実質未達**の状態にある。PGlite（dev・テスト）だけが原子性を持つ。

### 非対話バッチ（ADR-0019 案 A）では代替できない理由 — 再確認

`CompleteShoppingUseCase.execute()` の実体を読み直した。read-modify-write が交互に並ぶ。

```
findById(shoppingList) → ドメイン検証 → pantry.find() → pantry.save()
  → product.findById() × N → product.save() × N
  → shoppingList.complete() → shoppingList.save()
  → mealPlan.findById() → mealPlan.save()
```

**後続の書き込み内容が前段の読み取り結果に依存する**（`pantry.hasStockFromShoppingItem()` で
スキップ判定、`product.priceHistory` の突き合わせで二重記録を回避）。全 SQL を先に並べる
バッチには原理的に畳めない。ADR-0019 案 A の却下理由は今も有効で、**対話型トランザクション
以外に完了条件 2 を素直に満たす道は無い**。

### 前回失敗の再検討 — 「定番のミス」は既に潰れている

差し戻したコード（`c28123e`）を読み直したところ、WebSocket 接続の典型的な失敗要因は
**すでに対処済み**だった。

| よくある原因                             | 前回の実装                                      | 判定     |
| ---------------------------------------- | ----------------------------------------------- | -------- |
| `neonConfig.webSocketConstructor` 未設定 | `ws` の `WebSocket` を設定済み                  | 該当せず |
| Edge Runtime で `ws` が動かない          | `route.ts` は `export const runtime = 'nodejs'` | 該当せず |
| Pool の error リスナ未登録で落ちる       | `pool.on('error', ...)` 登録済み                | 該当せず |

**最も有力な手がかりは、設定した 5 秒のタイムアウトが効かなかったこと。**
`connectionTimeoutMillis: 5_000` を入れているのに実測は約 15 秒で失敗している
（ADR-0019 実行記録）。`connectionTimeoutMillis` は Pool の**接続取得待ち**に効く値なので、
これが発火していないなら、詰まっているのは Pool の待ち行列ではなく
**その先（WebSocket ハンドシェイクまたは名前解決・TLS）**である可能性が高い。

| #   | 仮説                                                                    | 切り分け方（Preview で 1 回ずつ）                                              |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| H-1 | `DATABASE_URL` が WebSocket を受けないホスト（pooler の有無違い）を指す | 接続文字列のホストを確認し、pooler 有無の両方で `GET /api/health` を叩き分ける |
| H-2 | Vercel `sin1` から Neon への WS 経路が通らない                          | `regions` を外した（既定）Preview で同じ計測を行い、リージョン依存かを判定する |
| H-3 | グローバル Pool の使い回しで死んだソケットを掴む                        | Pool をリクエスト毎生成にした Preview で計測。改善するなら warm 再利用側の問題 |
| H-4 | Neon の compute サスペンドからの復帰待ち                                | 直前に別経路（neon-http）で 1 回叩いて起こしてから WS 経路を叩く               |

**この 4 つはこの環境からは切り分けられない。** Vercel / Neon への egress がプロキシで
遮断されており（`orm.drizzle.team` / `neon.com` も 403）、ドライバの一次情報にも到達できない。
**Preview Deployment での実測はユーザーの手が要る。**

### 案の比較

| 案                                 | 内容                                                                                              | 完了条件 2 | 前回の再発リスク                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------- |
| **S: 書き込み経路だけ WS**（推奨） | 読み取り・SSR は `neon-http` のまま。`UnitOfWork.execute` の中だけ `neon-serverless` の接続を使う | 満たす     | **小**。WS が落ちても読み取りは生存。画面は表示できる |
| W: 全面 WS 再挑戦                  | `c28123e` を H-1〜H-4 の切り分け後に再投入                                                        | 満たす     | 大。前回は読み取りごと落ちて全画面がクラッシュした    |
| B: バッチ化（ADR-0019 案 A）       | UseCase を read フェーズと write フェーズに分離し 1 バッチで送る                                  | 満たす     | 小だが**改修が最大**。冪等ガードの構造まで書き換え    |
| R: 完了条件の再定義                | neon-http のまま、部分失敗の許容範囲を明示して締める                                              | 満たさない | なし                                                  |

### 推奨: 案 S（書き込み経路だけ WebSocket）

理由は **前回の事故が「トランザクションが動かなかったこと」ではなく「読み取りまで巻き添えで
落ちたこと」だった**点にある。`GET /api/stores` が 500、トップが `loading.tsx` の後に
クラッシュ、という被害範囲は、書き込み経路と読み取り経路が同じドライバを共有していたから
生じた。分ければ、WS 側が死んでも**閲覧は生き残り、失敗するのは書き込みだけ**になる。

併せて入れるもの:

1. **env によるキルスイッチ。** `useTransaction` は既にコンストラクタ引数として存在する。
   環境変数から与える形にすれば、事故時にコード変更・再ビルドなしで無効化できる。前回は
   ロールバック PR（#168）を作る必要があった。
2. **Preview 検証の必須化。** レビュー H-01「Preview で書き込みを一巡させてから本番へ」の
   未実施が前回の直接原因だと ADR-0019 が記録している。**読み取りだけでなく書き込み一巡
   （買い物完了・献立同期・チェック）を Preview で通すこと**を再導入の前提条件にする。

### 未確認の前提（一次情報で裏取りできていない）

- `drizzle-orm/neon-http` の `db.batch()` がトランザクション相当の原子性を持つか（案 B の前提）。
  公式ドキュメントへ到達できないため未確認。案 B を採るなら裏取りが先。
- 1 リクエスト内で `neon-http` と `neon-serverless` の 2 接続を併用したときの
  cold start 実コスト（案 S の悪影響）。実測が要る。

### 次のステップ（採用が決まった場合）

1. H-1〜H-4 を Preview で切り分け、失敗原因を 1 つに特定する（**ユーザーの手が要る**）
2. 原因に応じて案 S の接続構成を確定し、設計書本文へ反映する
3. 実装 → Preview で書き込み一巡 → 本番

## 未決事項

| #   | 未決事項                                                     | 状態                                                                           |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| U-1 | 本番でトランザクションを再導入するか、完了条件を再定義するか | **未決**（2026-08-15）。上記「トランザクション再導入の設計案」を提案として提示 |
