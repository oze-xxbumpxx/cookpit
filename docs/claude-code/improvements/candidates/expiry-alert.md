# 振り返り候補: expiry-alert（Sprint 8 Unit B・設計フェーズ）

- 作成日: 2026-08-09（作業日）/ 記録日: 2026-08-10
- 対象: L3 設計フェーズ（成果物 7 点）。実装は未着手
- 変更レベル: L3 / 実装ルート: Orchestrator 経路
- 作成者: Orchestrator（メインセッション）。**reflection-agent は起動していない**
  （セッション上限に 2 度到達したため、文脈を最も持つメインセッションが直接記録した）

## 事象 1: 下流 Agent が上流の確定事項の欠陥を 6 件検出した（成功パターン・再現したい）

Unit A（stock-edit）では confirmed の設計書から 8 件の欠陥が下流工程で見つかった。本ユニットでも
同じ構造が働き、**実装前に 6 件を捕まえた**。内訳と検出者は以下。

| #   | 検出者                 | 内容                                                                                                    | 確定 |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------- | ---- |
| 1   | contract-designer      | `GET /vapid-public-key` だけ環境変数未設定時に 200 + 空文字を返し、Cron の 500 フェイルクローズと非対称 | P-12 |
| 2   | implementation-planner | `PushSender` port を Application に置くと Infrastructure → Application の依存が生じ依存方向ルール違反   | P-13 |
| 3   | implementation-planner | P-4「文言は apps/web に残す」と P-7「通知本文が依存する」が両立しない                                   | P-14 |
| 4   | security-reviewer      | 無認証 subscribe の**受容根拠が論理的に誤り**（推測困難性は登録を防がない）                             | P-15 |
| 5   | security-reviewer      | `endpoint` 経由の blind SSRF                                                                            | P-16 |
| 6   | security-reviewer      | 鍵長の下限 `min(1)` により、失敗し続ける購読行が恒久的に残る                                            | P-17 |

加えて reviewer が Must 5 / Should 8 / Nice 7 を検出し、うち **M-3（要件 E-7 がどの成果物にも
実装されていない）**と **M-4（`sw.ts` のコード例が type-check を通らない）**は実装着手直後に
詰まる類のものだった。

**効いた要因（仮説）**:

- 各 Agent への委譲時に「**設計書の記述を前提にせず実コードを当たること**」を明示した。
  Unit A の教訓（設計書の記述を下流が前提にして誤りが伝播した）を毎回プロンプトに書いた。
- 委譲プロンプトに**実測結果を埋め込んだ**（Explore 3 本の結果）。再調査のコストが減り、
  検証に労力が向いた。
- 各成果物に「**Orchestrator への申し送り**」節を持たせ、**越権せずに差し戻す**経路を用意した。
  contract-designer / implementation-planner / test-designer のいずれもこの節を使って返した。

**改善候補**: この 3 点は Unit A から引き継いだ運用だが、Agent 定義側には明文化されていない。
`orchestration-policy.md` に「委譲プロンプトに含める 3 点」として昇格する価値がある
（段階原則: `繰り返す → 改善候補`。Unit A・Unit B の 2 回で観測）。

## 事象 2: 「根拠は書かれているが根拠が誤っている」型の欠陥（新種）

P-15 は他の 5 件と質が異なる。設計書は無認証 subscribe のリスクを**認識して根拠を書いていた**
（「`endpoint` は推測困難な URL だから」）。問題はその根拠が**適用先を 1 つ間違えていた**こと。
推測困難性は `unsubscribe`（他人の購読の削除）となりすまし送信には効くが、`subscribe`
（新規登録）には効かない。VAPID 公開鍵を無認証で配っているため、攻撃者は自分のブラウザで
購読を作って登録するだけでよい。

**「未記載」ではなく「記載されているが誤り」**なので、チェックリスト型の確認では素通りする。
security-reviewer が脅威モデルを自分で組み立て直したから見つかった。

**改善候補**: セキュリティ観点の委譲時に「**設計書が書いているリスク受容の根拠を、鵜呑みにせず
再導出すること**」を明示する。今回は結果的に見つかったが、プロンプトには書いていなかった。

## 事象 3: セッション上限・クレジット切れで Agent が 3 回停止した（環境要因）

- **Fable のクレジット切れ**: `orchestration-policy.md` は L3 の architecture-designer を
  `model: fable` で起動する規定だが、クレジット切れで起動できなかった。
  同 :258-265 のフォールバック（設計判断はメインセッション、成果物化は Sonnet の
  architecture-designer）へ切り替えて成立した。**フォールバックが実際に機能することを初めて実証した。**
- **セッション上限 2 回**: 1 回目は architecture-designer が成果物を書き終えた直後、2 回目は
  implementation-planner と test-designer が 1 通目の指示を処理し終えた直後。
  いずれも**成果物はディスクに残っていた**ため、ファイルの実体を確認してから続行できた。
- ただし 2 回目では implementation-planner に**2 通目（reviewer の Must 4 件）が届く前**に
  停止しており、Orchestrator が M-3 / M-4 / M-5 を手作業で修正した。

**改善候補**: `orchestration-policy.md` の「再開時の完了判定」（resume 直後は notification を
待たず成果物の存在・更新時刻で冪等判定する）は今回機能した。一方で
**「Agent へ送った追加指示が処理されたか」の判定手段が無い**。成果物の内容を Orchestrator が
検証する手順（今回は `grep` で `?? ''` やディープ import の残存を確認した）を明文化する価値がある。

## 事象 4: Orchestrator の指示が誤っており下流が訂正した（1 件）

`web-push` の追加先を Orchestrator が `apps/web/package.json` と指示したが、
implementation-planner が「実際に import するのは `packages/infrastructure` であり、
pnpm の phantom dependency 制約がある」として訂正した。**下流が上流の指示を訂正した唯一の例**。

改善というより、委譲プロンプトに書く「実測済みの前提」にも誤りが混じりうるという記録。
Orchestrator の埋め込み情報を Agent が無条件に信じない運用が正しく働いた。

## 事象 5: 論点が 11 件 → 17 件へ増えた（工程設計の観察）

P-1〜P-11 は設計フェーズで確定したが、P-12 は契約設計、P-13 / P-14 は実装計画、
P-15〜P-17 はセキュリティレビューの各フェーズで**新たに検出**された。

「設計書を confirmed にしてから下流へ渡す」という工程は、**下流が上流を検証して論点を増やす**
ことを織り込む必要がある。今回は各フェーズごとにユーザー確認を挟んだため 4 往復した。

**改善候補**: L3 では「設計書の confirmed は暫定であり、契約・計画・レビューの各フェーズで
論点が増えうる」ことを document-policy に明記するか、逆に**セキュリティレビューを設計フェーズの
早い段階に前倒しする**（今回 P-15〜P-17 は設計書の記述だけで検出可能だった）。
後者はレビュー 1 回分のコストで論点確定の往復を減らせる可能性がある。

## 事象 6: Markdown テーブルの崩れが 0 件（Unit A の N-4 が再発しなかった）

Unit A ではセル内改行でテーブルが壊れ、レビュー N-4 として指摘された。本ユニットでは
**全委譲プロンプトに「表のセル内で改行しないこと」を明記**し、reviewer が 6 文書すべてで
崩れ 0 件を確認した。

**改善候補**: 委譲プロンプトの定型文として `create-design-document` / `create-test-plan` /
`create-implementation-plan` の各 Skill に 1 行入れれば、毎回書かなくて済む。
（段階原則: `検証済み → Skill`。Unit A で問題を観測し、Unit B で対策の有効性を確認した = 2 回）

## 数値

- 成果物: 7 点（要件・設計・契約設計・試験計画・実装計画・ADR-0017・レビュー 2 本）
- 確定した論点: 17 件（うち 6 件は下流フェーズで新規検出）
- レビュー指摘: reviewer Must 5 / Should 8 / Nice 7、security-reviewer High 2 / Medium 4 / Low 5
- 起動した Subagent: Explore 3 / architecture-designer 2（1 回は Fable でクレジット切れ）/
  contract-designer 1（+ 追加指示 1）/ implementation-planner 1（+ 追加指示 2・うち 1 通未処理）/
  test-designer 1（+ 追加指示 2・うち 1 通は処理後に停止）/ reviewer 1 / security-reviewer 1
- コミット: 9 本

## 申し送り（本ユニットの実装フェーズへ）

- 実装ルート（Codex 委譲 か Orchestrator 経路か）は**未確定**。ユーザーから質問はあったが
  選択に至っていない。Codex へ渡す場合は実装計画を軽量版へ組み替え、
  `create-codex-brief` で `docs/tasks/codex/expiry-alert/` を生成する必要がある（IMP-2026-025）。
- 実装時に確認が必要な未確定点が 5 件残っている（設計書 §将来課題・試験計画 §15）。
  `PushEvent` 型の解決可否 / zod v4 の `z.url({ protocol })` の有無 / `@types/web-push` の要否 /
  クライアントバンドルのビルド可否 / 再購読時の `createdAt` 保持ほか 2 件。
- `hono` を 4.12.34 以上へ上げる Should（security-reviewer）。本ユニット起因ではないが、
  Hono ルートを 2 本増やす前に済ませると順序として自然。

## 昇格判断（2026-08-12）

前回ログが「委譲プロンプト定型 3 点を orchestration-policy と Skill へ昇格するか」を
次回やることへ残していた。本セッションでは **昇格しない**。

| 候補 | 観測 | 判断 |
| --- | --- | --- |
| 委譲プロンプト定型 3 点（実測埋め込み / 実コードを当たれ / 表セル内改行禁止） | Unit A・Unit B の 2 回 | IMP-2026-030 の 3 回条件未達。`orchestration-policy.md` は既に肥大側（harness-complexity-audit 事象 5）なので、2 回で正典へ追記しない |
| 表セル内改行禁止だけ Skill へ 1 行 | 問題 1 回 + 対策有効 1 回 | 同上。3 回目で Skill チェック項目として再評価する |

Memory 留め。再発監視は backlog の当該行（あれば）と本節。
