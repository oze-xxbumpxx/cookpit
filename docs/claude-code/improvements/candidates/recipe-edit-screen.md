# 改善候補: recipe-edit-screen

> reflection-agent が起票。1 タスクの振り返りから抽出した知見をまとめる。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: recipe-edit-screen
- **作成日**: 2026-06-25
- **対象タスク概要**: レシピ編集画面の新規追加（Presentation 層のみ、変更レベル L2）。orchestrator フルフロー（5 Agent）をリアル機能開発で初めて通した harness 効果測定タスク。
- **関連成果物**:
  - docs/designs/recipe-edit-screen.md
  - docs/implementation-plans/recipe-edit-screen.md
  - docs/tests/recipe-edit-screen.md
  - docs/reviews/recipe-edit-screen.md
  - docs/claude-code/improvements/metrics/TASK-2026-001.yml

---

## 観測した事象（複数可）

---

### 事象 1: orchestrator フルフロー（5 Agent）が手戻りゼロで完走した（成功手順）

- **種類**: 成功手順
- **観測した事象**: architecture-designer → implementation-planner ∥ test-designer → implementer → reviewer の 5 Agent フローが、差し戻し 0 回・ユーザー修正 0 回・実装リワーク 0 回・reviewer critical/major 0 件で完走した。必要成果物（designs / implementation-plans / tests / reviews）が過不足なく揃い、既存 29 テストが green 維持、lint / type-check も初回から通過。
- **発生回数**: 本タスク 1 回（初の実タスクフル稼働）
- **対象タスク**: recipe-edit-screen（TASK-2026-001）
- **原因仮説**: L2 の判定が正確で必要 Agent が適切に絞られた（5 本すべて必要・不要呼び出しゼロ）。各 Agent が担当範囲に閉じた成果物を出し、設計の未決 2 論点を実装前に解消したことで後段の混乱がなかった。
- **改善案**: この成功パターンを orchestrator Subagent Memory に記録し、次回の L2 フロー組み立ての参照として使えるようにする（「バックエンド既存・ADR 不要の新規画面 = L2 フル 5 本が正解」）。
- **変更対象**: orchestrator Subagent Memory（Auto Memory）
- **想定される副作用**: なし（Memory 追記のみ）
- **評価方法**: 次の L2 タスクで同じ 5 本フローが差し戻しなしで完走するか確認
- **昇格判定**: Memory 留め（昇格せず）。成功パターンの複数再現が昇格条件（memory-policy.md §昇格）だが、今回は 1 回目の確認。次の L2 タスクでも再現したら candidate → proposal 昇格を検討する。

---

### 事象 2: IMP-2026-001（create-test-plan Skill 改善）の実タスク検証成功（採用済み提案の事後評価）

- **種類**: 成功手順（採用済み改善の事後確認）
- **観測した事象**: test-designer が「観点の選択基準」テーブルを正しく適用し、Presentation 層増分タスクにおいて「FE 固有観点（6）= 必須」「冪等性（4）= 対象外（理由明記）」「障害系（5）= 対象外（理由明記）」と正確に判定した。過剰適用も網羅不足もなく、飛ばした理由が試験計画に明記されている（docs/tests/recipe-edit-screen.md §観点の選択基準の適用）。
- **発生回数**: IMP-2026-001 適用後の初回実タスク検証（1 回）
- **対象タスク**: recipe-edit-screen（TASK-2026-001）/ 元改善: test-runner-introduction
- **原因仮説**: Skill に「観点の選択基準」テーブルと判断ガイドを追加した効果が出た。
- **改善案**: 追加不要。IMP-2026-001 は採用済みで本適用済み。この事後確認をもって「空想でなく実タスクで機能した」と記録するのみ。evaluations/IMP-2026-001.md に事後補記することを manager に推奨する。
- **変更対象**: なし（記録のみ）
- **想定される副作用**: なし
- **評価方法**: 完了（IMP-2026-001 の before/after は evaluations/IMP-2026-001.md で既に記録済み）
- **昇格判定**: Memory 留め（昇格せず）。採用済み提案の事後確認であり、新規候補を起票する必要はない。evaluations ファイルへの事後補記推奨として申し送る。

---

### 事象 3: classify-change Skill の判定フローに「新規画面 = L3」と読める曖昧さがある

- **種類**: Agent 間認識不一致（潜在的）/ Skill の曖昧記述
- **観測した事象**: classify-change Skill の判定フロー step4 に「新規画面」が L3 列挙の一要素として記載されている（`.claude/skills/classify-change/SKILL.md:28`）。一方、eval ケース（frontend-screen-addition）では「新規画面でもバックエンド既存・ADR 不要なら L2」と定義されており矛盾している。今回は「バックエンドは既存・ADR 不要・Presentation 層のみ」という実態から orchestrator が正しく L2 と判定したが、Skill の文言どおりに読むと L3 と誤判定するリスクがある。
- **発生回数**: 今回 1 回観測（明示的な誤判定は発生していないが、潜在リスク）
- **対象タスク**: recipe-edit-screen
- **原因仮説**: step4 の「新規画面」がそれ単体で L3 トリガーとして書かれており、「なぜ L3 か」（= 新規 API・DBスキーマ・ADR が伴う場合）の条件が付帯していない。
- **改善案**: step4 の記述を「新規 API・DB スキーマ変更・データ移行・認証認可・ADR が必要な新規画面・外部/AWS 連携・アーキテクチャ変更・大規模リファクタ・後方互換に影響するか？」と改定し、「新規画面」の単体記述を除去する。または「新規画面」に「（既存 API を使うだけで ADR 不要なら L2）」と注記を添える。
- **変更対象**: `.claude/skills/classify-change/SKILL.md`（Skill チェック項目の改善 → manager レビュー後可）
- **想定される副作用**: step4 の敷居が上がり L3 判定が減る可能性。ただし「ADR が必要か」「DBスキーマ変更があるか」などの明示条件を付ければ過小判定は防げる。
- **評価方法**: eval ケース frontend-screen-addition（バックエンド既存・ADR 不要の新規画面）で before/after を採点。L2 判定が維持されること・L3 に誤判定しないことを確認。
- **昇格判定**: Memory 留め＋再発監視（昇格条件に「今回のみ潜在的観測・明示的誤判定は未発生」で未到達）。次タスクで同種の曖昧さによる L3 誤判定が起きたら即昇格を検討。Skill の軽微改善に該当するため、manager 判断で proposal → 直接適用も可能（人間承認不要領域）。

---

### 事象 4: coding-standards.md に Next.js page/layout の default export 例外が未記載（reviewer N2 発）

- **種類**: レビュー指摘（nit, N2）/ Rule の記述漏れ
- **観測した事象**: reviewer が N2（nit 扱い）として「`page.tsx` の `export default` が coding-standards.md の『デフォルトエクスポートは禁止』と表面的に矛盾する」と指摘した（docs/reviews/recipe-edit-screen.md §N2）。Next.js App Router では page.tsx / layout.tsx / route.ts 等は `export default` がフレームワーク要件であり、既存の `[id]/page.tsx` / `new/page.tsx` も同じ例外パターンを採用しているが、Rule ドキュメントに例外が明記されていない。
- **発生回数**: 今回 1 回（ただし既存 page.tsx 群でも同パターンが継続中 → 事実上プロジェクト全体で例外化されている）
- **対象タスク**: recipe-edit-screen（TASK-2026-001）
- **原因仮説**: coding-standards.md が「全 TypeScript コード」に適用する原則として書かれており、Next.js フレームワーク固有の例外を考慮していなかった。新規 page 追加のたびに同じ指摘が潜在的に生じる構造。
- **改善案**: `.claude/rules/coding-standards.md` の「デフォルトエクスポートは禁止」の記述に、「ただし Next.js App Router の `page.tsx` / `layout.tsx` / `route.ts` などフレームワーク規約が `export default` を要求するファイルは除く」の一文を追記する（非破壊的 Rules 追加 → manager レビュー後可）。
- **変更対象**: `.claude/rules/coding-standards.md`（非破壊的 Rules 追加 → manager レビュー後可）
- **想定される副作用**: implementer が page.tsx を追加する際に例外を明示的に認識できるようになり、不要な指摘が減る。reviewer が同じ nit を繰り返すコストを削減。本来例外でない場所に default export が使われても検出が難しくなるリスクがあるが、page/layout/route に限定した例外であれば影響は局所的。
- **評価方法**: 次回 page.tsx を新規追加するタスクで reviewer が同じ N2 指摘を再発させないことを確認。
- **昇格判定**: Memory 留め＋昇格条件への距離を明記（昇格せず）。reviewer 指摘由来だが nit 1 件・今回初観測のため昇格条件（「同種の重大指摘を複数回」）には未到達。ただし新規 page 追加のたびに再発し得る構造的問題であるため、次回タスクで同じ nit が出たら即座に昇格させる。Skill/Rule の非破壊的追加カテゴリであり、manager が proposal 対象と判断した場合は即適用可。

---

### 事象 5: Stop フック（check-deliverables / check-improvement-cycle）が多段進行中に毎ターン発火してノイズを生む

- **種類**: 重複作業・トークン浪費（プロセス上の問題）
- **観測した事象**: multi-agent オーケストレーション中、`current-feature` 設定後にバックグラウンド Agent の完了を待つ期間、`check-deliverables` と `check-improvement-cycle` の Stop フックが毎ターン末に発火し「成果物未充足」「改善サイクル未実行」を警告し続けた。工程の途中なので当然未充足であり、これは誤警告ではないが、十数ターン分の空の待機応答を誘発し、トークン消費と処理時間の浪費につながった。
- **発生回数**: 今回 1 回（ただし multi-agent L2/L3 タスクは今後も発生する構造）
- **対象タスク**: recipe-edit-screen（TASK-2026-001）
- **原因仮説**: Stop フックが「current-feature が設定されていれば即チェック」という設計になっており、バックグラウンド Agent がまだ動いている（= 工程進行中）かどうかを区別しない。フル稼働の orchestrator フローは今回が初のため、この誤発火パターンが事前に観測されていなかった。
- **改善案（3 案、manager に選択を委ねる）**:
  1. **完了マーカー方式**: `current-feature` 設定と並んで「工程進行中フラグ（`current-feature-phase`）」を state に置き、フックはフラグ不在または `done` のときのみフルチェックを行う。
  2. **最終チェック限定方式**: Stop フックのチェックを current-feature クリア直前（= orchestrator の最終フェーズ）にのみ走らせる。中間ターンでは簡易チェック（state ファイルの存在確認のみ）に留める。
  3. **抑制ウィンドウ方式**: current-feature 設定から N ターン（例：3 ターン）はフルチェックを抑制し、その後から警告を開始する（粗い対策だが実装が単純）。
- **変更対象**: Hook（`check-deliverables` / `check-improvement-cycle`）。**ブロック条件の変更を伴うため人間承認必須領域**。manager は提案を起票し、人間承認を取得してから適用する。
- **想定される副作用**: 案 1 は state ファイル管理の複雑化。案 2 は「最終フェーズ」の定義をどこに持たせるかが難しい。案 3 は短時間タスクで警告が出ない可能性。いずれの案も実際に成果物が揃わないまま完了した場合の検知が遅れるリスクがある。
- **評価方法**: 多段 L2/L3 タスクで Stop フックの発火回数と空の待機応答の発生回数を before/after で比較。
- **昇格判定**: Memory 留め（昇格せず）。今回 1 回の初観測。ただし L2/L3 フルフローは今後も継続的に発生し、同じ浪費が繰り返される構造であるため、**次の L2/L3 タスクでも再発が確認されれば即昇格**する（「継続的なトークン浪費」昇格条件に該当）。Hook の変更は人間承認必須であり、manager は提案段階で人間承認ルートを明示すること。

---

## まとめ

- 改善候補として起票したもの（→ backlog に追記した ID）:
  - 事象 3: classify-change Skill の曖昧な L3 判定基準（Memory 留め・再発監視）
  - 事象 4: coding-standards.md の Next.js default export 例外の未記載（Memory 留め・再発監視）
  - 事象 5: Stop フックの多段進行中ノイズ（Memory 留め・再発監視・次回再発で即昇格）

- Memory に留めたもの（昇格せず・再発監視）:
  - 事象 1: orchestrator L2 フルフロー 5 本が手戻りゼロで完走（成功パターン・複数再現で昇格）
  - 事象 2: IMP-2026-001 の実タスク検証成功（採用済み提案の事後確認・新規昇格なし）
  - 事象 3 / 4 / 5: いずれも今回初観測のため Memory 留め（再発監視で昇格を判断）
