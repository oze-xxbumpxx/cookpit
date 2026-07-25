# ADR-0010: パッケージの公開境界をバレル（index.ts）に統一する

- Status: Accepted
- Date: 2026-07-25
- 関連 feature: project-refactoring

## Context（背景・なぜ判断が必要か）

`packages/domain` は `package.json` で `main: ./src/index.ts` / `types: ./src/index.ts` を
宣言しているが、`src/index.ts` の中身はコメント 1 行だけで何も re-export していない。
その結果、消費側は実装ファイルを直接指す deep import を使っている。

2026-07-25 時点の実測: `@cookpit/domain/src/...` 形式の import が **285 箇所**
（application 213 / infrastructure 65 / api-contract 5 / apps/web 2）。
一方で `application` / `infrastructure` / `api-contract` の 3 パッケージはバレルを備えており、
消費側は `@cookpit/application` のように**パッケージ名だけ**で import できる。

つまり同一モノレポ内に 2 つの import 規約が併存している。これが引き起こしていること：

1. **公開 API と内部実装の区別が無い。** domain のどのファイルを移動・改名しても、
   285 箇所のどれが壊れるか事前に分からない。ディレクトリ構成がそのまま外部契約になっている。
2. **新規実装時の参照コスト。** 「`Quantity` はどこから import するのか」を毎回
   ファイルパスまで思い出す必要がある（`@cookpit/domain/src/shared/quantity`）。
3. **`main` フィールドが嘘をついている。** ツール（bundler・IDE・将来の型生成）が
   `main` を信じると空のモジュールを見ることになる。

Clean Architecture の依存方向（`Presentation → Application → Domain ← Infrastructure`）は
現状も守られており、**依存の向きが問題なのではない**。問題は「依存先の粒度」が
パッケージではなくファイルになっていることである。

## Decision（採用した決定）

**全ワークスペースパッケージについて、公開境界を `src/index.ts`（バレル）に統一する。**

- 消費側は `@cookpit/<package>` のみを import する。`@cookpit/<package>/src/...` は使わない。
- パッケージ**内部**の相互参照は従来どおり相対パス（`./quantity` / `../shared/money`）。
  バレル経由の自己参照はしない（循環参照を避けるため）。
- バレルに載せるのは公開シンボルのみ。テストファイルは載せない。
- 新しい集約・値オブジェクトを追加したら、同じコミットでバレルにも追加する。

派生する 1 件の改名：`packages/domain/src/recipe/recipe-ingredient.ts` が
`export interface ProductId`（構造的な `{ readonly value: string }`）を持ち、
`packages/domain/src/product/product-id.ts` の `class ProductId` と名前衝突する。
フラットなバレルを成立させるため、**前者を `ProductRef` へ改名**する。
この `interface` を外部から import している箇所は 0 件のため、影響は宣言箇所のみ。

## Alternatives（検討した非採用案と却下理由）

### 案 A: 現状維持（deep import を許容する）

却下。パッケージ内のファイル構成が外部契約になり続け、リファクタリング耐性が下がる。
`main` フィールドとの不整合も残る。既に 285 箇所あり、放置すると機能追加のたびに増える。

### 案 B: `package.json` の `exports` フィールドでサブパスを公開する

例: `@cookpit/domain/recipe`、`@cookpit/domain/shared` のような集約単位のサブパス公開。

却下。バレル 1 枚より公開面が細かく制御でき、大規模なら妥当だが、
本プロジェクトは private パッケージ・単一アプリ・開発者 1 名の規模であり、
`exports` マップの維持コストが便益を上回る。ビルドを持たない
（`main` が `.ts` を直接指す）現構成では TypeScript 側の解決設定も追加で必要になる。
将来 domain が肥大化したときの移行先としては有効なので、選択肢として記録しておく。

### 案 C: domain だけ deep import を残し、他 3 パッケージに合わせない

却下。「domain だけ例外」という規約は覚えられず、レビューでも指摘が漏れる。
実際に api-contract のテストが domain を deep import しており、既に規約が混ざっている。

### 案 D: `ProductId` の衝突を、`RecipeIngredient` 側を `ProductId` 値オブジェクトに

置き換えることで解消する

今回は不採用（先送り）。衝突解消としては最も筋が良く、集約をまたぐ ID 参照の
型安全性（`Identifier` のファントムブランドによる公称型付け）も回復する。
ただしドメインモデルの意味を変える変更であり、mapper・repository・テストの
`{ value: 'prod-1' }` リテラルすべてに波及する。挙動不変を要件とする今回の
リファクタリングのスコープを超えるため、**別タスクとして提案**する。
今回は改名（`ProductRef`）にとどめる。

## Consequences（良い影響・悪い影響・残るリスク）

良い影響：

- domain のファイル移動・改名がパッケージ内に閉じる。公開 API の変更はバレルの差分に現れる。
- import 文が短くなり、新規実装時に「どのファイルか」を思い出す必要がなくなる。
- 4 パッケージすべてで同じ規約になり、レビュー観点が 1 つ減る。

悪い影響・コスト：

- バレルの更新漏れという新しい失敗モードが生まれる（新しい VO を作ったのに export し忘れる）。
  → 消費側で即座に型エラーになるため検知は早い。
- バレル経由の import は「そのパッケージの全モジュールを読み込む」ため、
  Server 側バンドルに domain 全体が含まれ得る。Client Component は `@cookpit/domain` を
  値として import していない（棚卸しで確認済み。Client の値 import は
  `@cookpit/api-contract` のみ）ため、クライアントバンドルへの影響は無い。
- 将来 domain が大きくなり Client での部分参照が必要になった場合は、案 B（`exports` サブパス）
  への移行を検討する。

残るリスク：

- `RecipeIngredient.productRef` が構造的型のままであり、`ProductId` の公称型付けを
  回避できてしまう点は未解決（案 D 参照）。

## Migration（移行手順）

1. `recipe-ingredient.ts` の `interface ProductId` を `ProductRef` へ改名する。
2. `packages/domain/src/index.ts` に公開シンボルを `export * from ...` で集約する。
3. `@cookpit/domain/src/...` を `@cookpit/domain` へ機械置換し、同一ファイル内の
   重複 import 文をまとめる。`import type` と値 import の区別は維持する。
4. `apps/web/src/db/pglite-client.ts` の `@cookpit/infrastructure/src/db/schema` も
   `@cookpit/infrastructure` へ寄せる。
5. `pnpm type-check` / `pnpm test` でベースライン（1269 件）と一致することを確認する。

データ移行・DB マイグレーションは不要。

## Rollback（決定を戻す場合の手順）

観点 A は単一コミットにまとめるため、`git revert` 1 回で deep import 構成に戻せる。
バレル（`index.ts`）を残したまま deep import を併用することも技術的には可能だが、
規約の二重化になるため、戻すなら全体を戻す。

## References（設計書・要件・関連 ADR・外部資料へのリンク）

- docs/designs/project-refactoring.md（本 ADR を含むリファクタリング全体の設計）
- docs/implementation-plans/project-refactoring.md ステップ 1
- docs/tests/project-refactoring.md 観点 A
- docs/03-architecture.md「パッケージ間の依存関係」
- `.claude/rules/domain-layer.md`（domain は他パッケージに依存しない原則）
