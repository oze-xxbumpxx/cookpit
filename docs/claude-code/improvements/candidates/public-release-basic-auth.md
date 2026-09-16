# 改善候補: public-release-basic-auth

> reflection-agent が起票。1 タスクの振り返りから抽出した知見をまとめる。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: public-release-basic-auth
- **作成日**: 2026-09-16
- **対象タスク概要**: 「cookpit を private から public にしたい」から始まり、公開可否の監査 →
  本番を Basic 認証で保護する L3 実装 → PR #202（draft）作成まで。変更レベル L3。
  実装ルート: Orchestrator 主導で Subagent（architecture-designer / implementation-planner /
  test-designer / implementer / reviewer / security-reviewer）へ委譲。
- **関連成果物**: docs/requirements/public-release-basic-auth.md /
  docs/designs/public-release-basic-auth.md /
  docs/implementation-plans/public-release-basic-auth.md /
  docs/tests/public-release-basic-auth.md / docs/reviews/public-release-basic-auth.md /
  docs/decisions/ADR-0021-basic-auth-for-public-repository.md /
  `apps/web/src/middleware.ts` / logs/2026-09-15.md（前セッションの公開可否監査）

> `.claude/state/subagent-log.jsonl` は本セッションに存在しない（リモート・エフェメラル環境の
> 既知の制約。improvement-cycle.md §計測の原則）。本候補は Orchestrator の記録と成果物の
> 現物確認（`docs/reviews/public-release-basic-auth.md` の証拠 EV-01〜EV-08、ADR-0021 本文、
> `apps/web/src/middleware.ts` の実コード）で裏取りした。`metrics/public-release-basic-auth.yml`
> はこの Agent の権限（Read/Grep/Glob/Write/SubagentHandback のみ）では生成できないため、
> Orchestrator または close-session 側での記録を申し送る。

## 観測した事象（複数可）

### 事象 1: Fable の月間支出上限（HTTP 429）で architecture-designer が停止（累計 2 回目）

- **種類**: 環境要因（手戻り小・往復 1 回）
- **観測した事象**: `orchestration-policy.md` の規定どおり L3 設計を `model: fable` で起動したが、
  HTTP 429（monthly spend limit）で停止し設計判断に到達しなかった（成果物ゼロ）。
  `orchestration-policy.md` §Fable の使い方に明記されたフォールバック（設計判断をメインの
  Opus で行い、成果物化を architecture-designer/Sonnet へ委譲）を適用し、手戻りなく続行できた。
- **発生回数**: このタスク内 1 回 / **累計 2 回**（[candidates/expiry-alert.md](./expiry-alert.md)
  事象 3「Fable のクレジット切れ」で 1 回、本タスクで 1 回）
- **対象タスク**: public-release-basic-auth / expiry-alert
- **原因仮説**: フォールバック手順が実際に機能した点は良い。一方で
  `orchestration-policy.md` のフォールバック文言は「オーバーライドが CLI バージョンにより
  効かない場合」と書かれており、実際に 2 回とも発生したトリガーは HTTP 429（予算/利用上限）
  であって CLI バージョン不整合ではない。トリガーの書き方と実際の発生条件がずれている。
- **改善案**: `orchestration-policy.md` §Fable の使い方の該当箇所に、トリガー条件を
  「CLI バージョン不整合、または 429 等のクレジット/利用上限超過」のように広げる 1 行修正。
  手順自体（設計判断はメイン・成果物化は Sonnet へ）は変更しない。
- **変更対象**: `docs/claude-code/orchestration-policy.md`（文言の精緻化のみ）
- **想定される副作用**: なし（挙動は変えず、既に機能しているフォールバックの説明を実態に合わせるだけ）
- **評価方法**: 次回 L3 で Fable 起動が失敗した際、記述を読んで迷わずフォールバックへ移れるかを確認
- **昇格判定**: **Memory 留め（2 回。3 回条件未達）**。ただし memory-policy.md の早期昇格例外
  （確証あり・修正極小）に該当しうる 1 行修正であり、manager 判断を仰ぐ余地を記録しておく。

### 事象 2: implementer が完了報告なく停止し、検証 4 種の報告が皆無だった（同型パターン累計 5 回相当）

- **種類**: 手戻り / 環境要因
- **観測した事象**: implementer の出力が 95 分間更新されず、完了通知も来ないまま停止した。
  `middleware.ts` とテストはディスクに書かれていたが、指示していた検証 4 種
  （build / テスト実行 / black-box / 品質ゲート）の報告が一切無かった。
  [candidates/offline-write-queue.md](./offline-write-queue.md) 事象 4 が提案していた
  「git diff への機械的検査（console.log / DEBUG / .only / TODO の混入検査）」を
  Orchestrator が手動で実行して引き継いだ。結果は混入なしだったが、検証（build・テスト実行・
  black-box・品質ゲート）はすべて Orchestrator がやり直した。
- **発生回数**: このタスク内 1 回 / **累計 5 回相当**（offline-write-queue 事象 4 が
  「このタスク内 1 回 / 累計 4 回（2026-08-10 に 3 回）」と記録した後の本タスクの 1 回）
- **対象タスク**: public-release-basic-auth / offline-write-queue / 2026-08-10 のセッション（3 回）
- **原因仮説**: implementer の停止自体は Agent 側で制御できない（既知）。今回新しいのは、
  「コード混入の有無」だけでなく「指示した検証項目の完了報告」そのものが機構的に
  担保されていない点。offline-write-queue の候補ファイルは事象 4 を「昇格条件を満たす
  （4 回観測）→ proposal 起票を推奨」と明記していたが、`improvement-backlog.md` を確認した
  限りこの事象は候補一覧（昇格候補表・Memory 留め表のいずれ）にも追記されておらず、
  proposal 化された痕跡も無い。推奨されたにもかかわらず横断分析（agent-improvement-manager）
  に渡っていない状態のまま、5 回目の再発を迎えた。
- **改善案**: offline-write-queue 事象 4 の提案（`git diff` への機械的検査を Hook または
  quality-gates Skill へ追加）をそのまま維持しつつ、加えて「Agent 停止時、指示した検証項目の
  うちどれが完了報告されたか」をチェックリスト化し、Orchestrator が引き継ぐ際に必ず確認する
  手順を明記する。
- **変更対象**: Hook（Stop 相当）または `.claude/skills/quality-gates/SKILL.md` /
  `docs/claude-code/orchestration-policy.md` の再開時の完了判定周辺
- **想定される副作用**: `eslint-disable` を伴う正当な `console` 利用があれば誤検知しうる
  （現状のコードベースには無い）。検証項目チェックリストの追加は引き継ぎ時の手間を増やす。
- **評価方法**: 本タスクの停止時点の差分に機械検査を適用し、混入が無いことを機械的に
  再現できるか（今回は Orchestrator が手動で確認済み・結果は混入なし）
- **昇格判定**: **昇格条件を満たす（累計 5 回相当。既に offline-write-queue 事象 4 で
  4 回目として「proposal 起票を推奨」と記録済みだが、backlog 未追記のまま今回さらに再発した）**

### 事象 3: turbo のキャッシュ再生を「実行結果」と誤認しかけた（本タスク内で 2 回・上位テーマ累計 3 回相当）

- **種類**: テスト失敗検出漏れ / 品質ゲートの信頼性欠如
- **観測した事象**: `pnpm type-check` が `cache hit, replaying logs` を返し、新規ファイル
  `middleware.ts` が存在しないときの結果を再生していた。`run-quality-gates.sh` でも
  `FULL TURBO` / `Cached: 5 cached` かつ開始時刻が過去の実行結果を PASS として出力した。
  いずれも Orchestrator が気づいて `--force` で流し直し、実実行の結果に置き換えた。
  `run-quality-gates.sh`（`.claude/scripts/run-quality-gates.sh`）を確認したところ、
  turbo の出力テキスト（`cache hit` / `FULL TURBO` 等）や実行時刻の陳腐化を検知するロジックは
  無く、pnpm スクリプトの終了コードのみで PASS/FAIL を判定している。
- **発生回数**: このタスク内 **2 回**（type-check の cache replay 1 回 + run-quality-gates.sh の
  FULL TURBO cache hit 1 回） / 上位テーマ「turbo キャッシュが実行結果を不可視化・誤認させる」
  としては**累計 3 回相当**（improvement-backlog.md の Memory 留め表にある
  「turbo キャッシュが既存エラーを不可視化（node:crypto type-check 失敗）」
  [test-runner-introduction] の 1 回 + 本タスクの 2 回）
- **対象タスク**: public-release-basic-auth / test-runner-introduction
- **原因仮説**: turbo のキャッシュキーがファイル追加/内容変更を正しく捕捉しないケース
  （あるいは捕捉していても Orchestrator/実行者側がキャッシュ由来の出力だと気づきにくい
  ログ表示）があり、`run-quality-gates.sh` はその出力を素通しして PASS 判定してしまう。
  `.claude/scripts/assert-e2e-results.mjs` が E2E に対して行っている「未実行のまま緑を
  構造的に不可能にする」検査に相当するものが、lint/type-check/test の品質ゲート側には無い。
- **改善案**: `run-quality-gates.sh` の各ゲート実行結果に `cache hit` / `FULL TURBO` /
  `replaying logs` 等のキャッシュ再生を示す文字列が含まれていた場合、警告を出し `--force`
  相当で対象ゲートを再実行してから PASS を確定する。あるいは実行時刻と対象ファイルの
  最終更新時刻を突き合わせて陳腐化を検知する。
- **変更対象**: `.claude/scripts/run-quality-gates.sh`（スクリプトの挙動変更。人間承認/PR
  レビューの対象になりうる）
- **想定される副作用**: `--force` 相当を既定にすると実行時間が伸び、turbo キャッシュの
  利点を失う。誤検知（本当にキャッシュ流用で問題ない場合）でも再実行するだけなら実害は小さい。
- **評価方法**: 本タスクで実際に発生した 2 ケース（type-check の cache replay・
  run-quality-gates.sh の FULL TURBO cache hit）を再現し、対策後に「未実行」を検知できるかを確認
- **昇格判定**: **昇格条件を満たす（累計 3 回相当。同じ問題が 3 回以上発生の条件に合致）**

### 事象 4: 設計の疑似実装に実害のあるバグがあり、Orchestrator の設計受け取りレビューで検出

- **種類**: 手戻り回避（成功パターンだが、レビュー工程の欠落リスクの記録でもある）
- **観測した事象**: architecture-designer（Sonnet）が出した資格情報の定数時間比較の疑似実装が、
  `FIXED_LENGTH = 256` の固定長ループで、256 文字超かつ長さが同じ資格情報では末尾を比較せず
  認証を通してしまう切り詰めバグを持っていた。Orchestrator が設計受け取り時のレビューで検出し、
  SHA-256 ダイジェスト比較へ差し替え、試験計画に回帰観点（MW-15）を要求した。
  現在の `apps/web/src/middleware.ts` はダイジェスト比較で実装されており、MW-15 は
  旧実装を再現した検証スクリプトで「旧方式なら通ってしまう入力」を実際に落とすことを
  確認済み（`docs/reviews/public-release-basic-auth.md` EV-02）。
- **発生回数**: このタスク内 1 回
- **対象タスク**: public-release-basic-auth
- **原因仮説**: `docs/reviews/public-release-basic-auth.md` の reviewer 所見によれば
  「`middleware.ts` は設計の疑似実装とほぼ逐語的に一致する」。つまり設計書の疑似実装コードは
  通常そのまま実装に採用される運用になっている。reviewer Agent は実装後にしか走らないため、
  設計段階の疑似実装のバグを実装前に検出する専用のレビュー工程は明文化されていない。
  今回は Orchestrator 自身が設計受け取り時に検出できたが、これは工程として保証されたもの
  ではなく、たまたま気づいた形に近い。
- **改善案**: 認証・認可・暗号等の security-critical な観点を含む L3 設計に限り、
  architecture-designer の成果物受け取り時点で、疑似実装コードそのものを対象にした軽量な
  確認（Orchestrator または security-reviewer による設計段階レビュー）を挟む工程を明示する。
- **変更対象**: `docs/claude-code/orchestration-policy.md` または
  `.claude/skills/create-design-document/SKILL.md`（要検討）
- **想定される副作用**: L3 のたびに追加レビューを固定で挟むとコストが増える。
  security-critical な観点に限定すれば過剰適用を避けられる。
- **評価方法**: 次回同種（認証・暗号関連）の L3 タスクで、設計受け取り時レビューが機能するかを確認
- **昇格判定**: **Memory 留め（1 回目の観測）**。再発したら昇格を検討する。

### 事象 5: security-reviewer が実装済みコードから追加の穴を検出（多層レビューの成功パターン）

- **種類**: レビュー指摘（成功パターン）
- **観測した事象**: `config.matcher` の除外パターンがセグメント境界に固定されておらず、
  `/workbox-x/api/pantry.js` 等 6 パターンが保護を素通りしていた（Orchestrator が実サーバで
  再現確認した）。現状は全て 404 になるルートのため実害は無かったが、ルート直下に
  catch-all を足せば穴になる。`apps/web/src/middleware.ts` には現在この修正が反映されており、
  除外パターンをセグメント境界（`$` 終端・`[^/]*`）に固定した理由がコメントで明記されている。
- **発生回数**: このタスク内 1 回
- **対象タスク**: public-release-basic-auth
- **原因仮説**: 正規表現による除外パターンは境界を明示しないと意図しないパスにもマッチする
  典型的な落とし穴で、設計段階・実装段階のいずれでも見逃されており、独立した専門観点を持つ
  security-reviewer が実装済みコードを見て初めて検出した。事象 4（設計段階での Orchestrator
  レビュー）と合わせて、**認証のような security-critical な実装では、設計段階と実装段階の
  両方でレビューが機能した**実例になった。どちらか一方だけでは見逃していた。
  加えて、ADR-0021 が指摘する「ローカルの `next start` と Vercel 本番の proxy 層は
  matcher の正規表現を別エンジンで評価しうる」というリスクに対し、black-box 確認
  （本番相当サーバへの実リクエスト。EV-06 / EV-07）を必須にしたことで、単体テストだけでは
  担保できない matcher の実挙動を確認できた。
- **改善案（変更提案は無し・運用の継続を推奨）**: 認証・認可の matcher/正規表現を含む
  設計・実装では、security-reviewer によるレビューと black-box 確認（本番相当サーバへの
  実リクエスト）の両方を必須にする既存運用が今回も機能した。変更提案は無い。
- **変更対象**: なし（既存の security-reviewer 起動条件・black-box 確認の継続を推奨するのみ）
- **昇格判定**: **Memory 留め（成功パターンの記録。既存運用の有効性を確認したのみで新規変更提案は無し）**

### 事象 6: Orchestrator 自身の集計手法の誤りが複数の恒久成果物へ伝播した（上位テーマ累計 3 回以上）

- **種類**: Agent 間認識不一致 / 事実誤りの伝播（Orchestrator 自身が発生源）
- **観測した事象**: 無認証ルート数を「GET 12 / POST 9 / DELETE 4」と報告したが、これは
  `sort | uniq -c` で重複を除いた**パスパターン数**をルート数と誤読したものだった。
  正しくは `GET 12 / POST 19 / PUT 5 / DELETE 6`。この誤りが要件書・設計書・
  **ADR-0021（恒久記録）**の 3 箇所へ伝播し、reviewer の F-03 指摘で発覚した。
  ただし reviewer が提示した訂正値「POST 18」も誤りで、Orchestrator が数え直して最終確定させた
  （つまり同じ数値を数える試みが 3 回あり、うち 2 回〔Orchestrator の初回・reviewer〕が誤り）。
  現在の `docs/requirements/public-release-basic-auth.md` / `docs/decisions/ADR-0021-*.md`
  はいずれも正しい値（GET 12 / POST 19 / PUT 5 / DELETE 6）に更新済みであることを確認した。
- **発生回数**: このタスク内 2 回（Orchestrator の初回誤り + reviewer の再カウントも誤り）/
  上位テーマ「機械的カウントの母集団カバレッジ誤り」としては**累計 3 回以上**
  （`improvement-backlog.md` の Memory 留め表に既に 2 件記録されている: harness-portability
  事象 2「`COOKPIT_TZ` を列挙して探し `COOKPIT_GAP_CAP_MIN` を見落とした」、
  harness-plugin-split 事象 1「パス形式の grep で数え、パスを持たない出典 11 箇所を
  母集団から落とした」。いずれも「**proposal 起票が必要（未起票）**」のまま残っている）
- **対象タスク**: public-release-basic-auth / harness-portability / harness-plugin-split
- **原因仮説**: 集計したい母集団の定義（「エンドポイント定義の数」）と、実際に使った集計手法
  （「重複除去されたパスパターン文字列の数」）がずれていた。「何を数えたいか」を先に定義せず
  「どう数えるか」（`sort | uniq -c`）を選んでしまうと、除去・集約された値をそのまま
  母集団数と誤読しやすい。既存 2 件（harness-portability / harness-plugin-split）と同一の
  根本原因だが、今回は誤った数値が**調査フェーズの一時的な報告ではなく、恒久記録である
  ADR 本文にまで伝播した**点で重大度が増している。
- **改善案**: 既存の Memory 留め項目（harness-portability・harness-plugin-split）と統合し、
  「N 件を数える」「N 箇所を全て変更する」型の作業では、検索式を書く前に母集団の定義を
  1 行で明記し、集計手法（重複除去・パターンマッチ等）が母集団の定義とズレていないかを
  確認する手順を追加する。恒久記録（ADR 等）へ数値を転記する前に、別の集計方法で
  再検証する 1 行チェックも加える価値がある。
- **変更対象**: `.claude/skills/audit-skills/SKILL.md`、または ADR 作成手順
- **想定される副作用**: 過剰適用の回避（「N 件全て」を宣言する作業に限定する）
- **評価方法**: `refactoring` / `documentation-only-change` の eval ケースで、意図的に
  母集団カバレッジがずれた集計指示を与え、対策の有無で誤りが検出できるかを比較
- **昇格判定**: **昇格条件を満たす（上位テーマとして累計 3 回以上。既存 2 件が
  「proposal 起票が必要（未起票）」のまま残っていたところへ本件が加わり、恒久記録への伝播
  という重大度も増した）**。既存の Memory 留め行と統合して manager が横断分析することを推奨。

### 事象 7: 監査のキーワード走査が実名と三人称代名詞を取りこぼした

- **種類**: 監査の見落とし（自己発見・レビュー指摘ではない）
- **観測した事象**: 公開可否の監査（logs/2026-09-15.md、前セッション）で
  `妻|夫|家族|住所|電話|クレジット|口座|本名|実家` を走査して「個人情報なし」と報告したが、
  後の作業中に `docs/decisions/ADR-0003-no-auth-in-mvp1.md` /
  `docs/decisions/ADR-0001-web-not-native.md` に**実名（姓）と「彼女」**が残っているのを
  偶然発見した。現在この 2 ファイルを確認したところ「パートナー」という語に置き換わっており、
  実名・「彼女」は grep で検出できない状態になっている（本タスク中に修正済みと見られる）。
- **発生回数**: このタスク内 1 回
- **対象タスク**: public-release-basic-auth
- **原因仮説**: キーワードリスト型の監査は「思いつく限りの関係性を表す名詞」を列挙する発想に
  なりがちで、(a) 個人の実名（事前に列挙できない固有名詞）、(b) 三人称代名詞
  （「彼女」「彼」等、そもそも「個人情報らしい単語」というカテゴリに直感的には入らない表現）
  を見落とす。事象 6 と同じ「母集団の定義と検索式のズレ」という根本原因の、別ドメイン
  （個人情報監査）でのバリエーションと考えられる。
- **改善案**: 個人情報監査の手順に、キーワード列挙型の走査に加えて (a) 実在人物の姓・名を
  明示的に grep 対象へ追加する、(b) 三人称代名詞（彼/彼女/君/くん/ちゃん 等）を検査対象に
  加える、(c) コミットの著者情報から実名を逆引きして grep 対象に加える、という具体的な
  手順を追加する。
- **変更対象**: 個人情報監査の手順（現時点でこの監査自体を明文化した Skill が見当たらない。
  新設するなら軽量なチェックリストとして。汎用の Skill よりは Cookpit ローカルの運用手順向き）
- **想定される副作用**: チェックリストが長くなりすぎると監査コストが増える。実在人物の
  姓名という具体固有名詞を対象にするため汎用の Skill には書きにくい。
- **評価方法**: 次回同種の公開可否監査で、実在人物の姓名・三人称代名詞を対象にした確認を
  明示的に行い、見落としが再発しないかを確認
- **昇格判定**: **Memory 留め（1 回目の観測）**。事象 6 と根本原因が同型（別ドメイン）である点は
  manager の横断分析での関連づけ材料として付記する。

## まとめ

- **改善候補として起票**（→ `improvement-backlog.md` の「昇格候補」表へ追記）:
  - 事象 2: implementer 停止時の検証報告欠落・機械的検査の未実装（**累計 5 回相当**。
    offline-write-queue 事象 4 の推奨が backlog 未追記のまま再発）
  - 事象 3: turbo キャッシュ再生を実行結果と誤認する `run-quality-gates.sh` の穴
    （**累計 3 回相当**）
  - 事象 6: 機械的カウントの母集団カバレッジ誤りが恒久記録（ADR）へ伝播
    （**上位テーマ累計 3 回以上**。既存 2 件と統合検討）
- **Memory に留めたもの**（昇格せず・再発監視）:
  - 事象 1: Fable 429 のフォールバック文言と実際のトリガーのずれ（累計 2 回。3 回条件未達だが
    修正極小のため早期昇格の余地を記録）
  - 事象 4: 設計疑似実装のバグを Orchestrator が設計受け取り時に検出（1 回目）
  - 事象 5: security-reviewer + black-box 確認の多層レビューが機能した（成功パターン。
    変更提案なし）
  - 事象 7: 個人情報監査のキーワード走査が実名・三人称代名詞を取りこぼした（1 回目。
    事象 6 と根本原因が同型）

## うまくいった手順（再現したい）

- **Fable フォールバックの文書化が実際に機能した**（事象 1）。429 で停止しても、
  `orchestration-policy.md` の記載に従って手戻りなく続行できた。
- **black-box 確認（本番相当サーバへの実リクエスト）を必須にしたことで、matcher の実挙動を
  ローカル環境だけでは担保できないリスクを検出・確認できた**（事象 5、EV-06/EV-07）。
- **設計段階と実装段階の二層レビューが、互いに見逃した欠陥を補い合った**（事象 4 + 5）。
  どちらか一方だけでは今回検出できなかった欠陥がそれぞれにあった。
- **MW-15 の counterfactual 検証**（旧実装を再現したスクリプトで実際に落とすことを確認）は、
  「テストが本当にそのバグを検出できるか」を実証する手法として再利用性が高い（EV-02）。
