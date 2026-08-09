# ADR-0017: 賞味期限アラートを Web Push（VAPID）+ 日次 Cron で実現する

- Status: Accepted
- Date: 2026-08-09
- 関連 feature: expiry-alert

## Context（背景・なぜ判断が必要か）

Sprint 8 のゴールは「賞味期限が実データとして入り、期限切れ前に**能動的に**気づける」ことである。
完了条件 3 件のうち 2 件は Unit A（stock-edit）が満たしたが、3 件目
「**期限が近い在庫にアプリを開かずに気づける**」（`docs/05-roadmap.md:640`）だけが残っている。

現状、期限が近い在庫はダッシュボードの「賞味期限が近い在庫」セクションに表示される
（2026-07-21 実装。閾値 3 日は `docs/designs/dashboard.md` P-1）。しかしこれは
**アプリを開いた人にしか届かない**。roadmap のタスク 3 は当初「PWA Badge / 通知」と
両論併記だったが、`setAppBadge` は iOS で未対応であり、かつ Badge の更新自体に
アプリの起動が必要なため、「アプリを開かずに」という完了条件を満たせない。

判断が必要な理由は 3 つある。

1. **ADR-0001 の前提の一部を再訪することになる。** ADR-0001（Web か ネイティブか）は
   Web + PWA を採る理由の 4 番目に「**プッシュ通知は MVP1 のスコープ外なので、ネイティブの
   アドバンテージが活きる場面が少ない**」を挙げている（同 :36）。同様に
   `docs/02-tech-stack.md:118` は「MVP1 ではプッシュ通知を使わないため、両 OS で
   機能差は出ない想定」と書いている。本 ADR はこの前提が変わったことを明文化する。
2. **外部サービス連携の新設である。** これまで Cookpit の外部依存は Neon（DB）と Vercel
   （ホスティング）だけだった。Push Service（FCM / Apple / Mozilla）への送信は、
   Infrastructure 層から出ていく初めての外部 I/O であり、秘密鍵（VAPID）の管理と
   スケジュール実行基盤という新しい運用要素を持ち込む。
3. **購読情報をドメインモデルにどう位置づけるかの判断が要る。** 既存 9 テーブルは
   例外なくドメイン集約と 1:1 対応している。購読情報は業務概念ではなく配信チャネルであり、
   この一貫性を保つか例外を作るかを決める必要がある。

なお実装基盤の前提は既に部分的に整っている。`apps/web/src/app/manifest.ts` と
`layout.tsx` の `appleWebApp: { capable: true }` は iOS Web Push の前提（ホーム画面追加）を
満たし、`apps/web/src/app/sw.ts`（Serwist）も存在する。未整備なのは `push` ハンドラ・
購読テーブル・VAPID 鍵・`vercel.json` の 4 点である（同 :663）。

## Decision（採用した決定）

**賞味期限アラートを、Web Push（VAPID）による通知と Vercel Cron による日次実行で実現する。
購読情報は新規ドメイン集約 `PushSubscription` として `packages/domain` に置く。**

決定の内訳は 6 点。

### 1. 通知方式は Web Push（VAPID）とする

「アプリを開かずに気づける」を満たせる方式は Web Push のみである。iOS 16.4+ は
ホーム画面に追加した PWA に限り Web Push をサポートし、VAPID 認証は Chrome / Firefox /
Safari で共通に使える。**Apple Developer Program への加入は不要**であり
（2026-08-09 に WebKit の公式ブログで確認）、追加費用は発生しない。

`setAppBadge` は採らない。iOS 非対応であることに加え、Badge の更新にアプリ起動が
必要なため完了条件を満たさない。

### 2. スケジュール実行基盤は Vercel Cron とする

`vercel.json` に `crons` を定義し、`GET /api/cron/expiry-alerts` を日次で呼ばせる。
実行時刻は **JST 08:00 台**（UTC 表記で `0 23 * * *`）とし、朝に「今日・明日期限のもの」に
気づいて当日の調理に活かせるようにする。

Vercel Cron は全プランに含まれ無料である。Hobby プランは**日次 1 回まで**という制約が
あるが、本決定はまさに日次なので抵触しない。**ただし Hobby では発火が指定時刻の 1 時間内で
ブレる**（`0 8 * * *` は 08:00:00〜08:59:59 のどこか）。したがって「毎朝ちょうど 8 時に
届く」ことは設計上も試験上も保証しない。

代替の GitHub Actions schedule は既存パターン（`.github/workflows/weekly-maintenance.yml`）
があり分単位の精度も出せるが、本番 URL と `CRON_SECRET` を GitHub Secrets に持つ必要があり
設定が 2 箇所に割れる。`docs/02-tech-stack.md:34`「デプロイは Vercel 1 つで完結
（環境変数も 1 箇所）」に整合する Vercel Cron を採る。

### 3. 通知は 1 日 1 通のダイジェストとし、同一在庫を毎日再送する

期限が近い在庫が複数あっても通知は 1 通にまとめ、対象が残っている限り毎日送る。
送信履歴テーブルは作らない。

「同じ在庫は 1 回だけ通知する」方式は、`notified_at` 相当の記録先が必要になり
DB スキーマ変更が 1 つ増えるうえ、消費・廃棄・期限編集時のリセット条件も設計対象になる。
2 人・在庫数十件という運用規模では、毎日の再送による通知疲れは限定的であり、
「今日の期限」を毎朝思い出せる利点のほうが大きい。

在庫ごとに個別通知する方式は、件数が増えると通知が大量に出るため採らない。

### 4. 購読情報は新規ドメイン集約 `PushSubscription` として置く

`packages/domain` に集約と `PushSubscriptionRepository` インターフェースを新設し、
Drizzle 実装を `packages/infrastructure` に置く。ADR-0010 の公開境界に従う。

購読情報は業務概念ではなく配信チャネルなので Infrastructure 限定の技術テーブルとして
扱う整理も筋は通る。しかし**既存 9 テーブルが例外なくドメイン集約と 1:1 対応している**
一貫性を破ることになり、「テーブルには必ず集約が対応する」という読み手の前提を
崩す。実装量の差は小さいため、例外を作らない側を採る。

`endpoint`（Push Service が発行する URL）に **UNIQUE 制約**を付け、`save()` を upsert に
する。制約が無いと同一デバイスの購読が積み重なり、同じ端末に複数回通知が届く。

### 5. 失効した購読を削除する判断は Application 層に置く

Push Service が 404 / 410 を返したら購読は失効しているので削除する。この判断は
`SendExpiryAlertsUseCase`（Application 層）が行い、Infrastructure の `PushSender` は
HTTP ステータスを結果型（`invalid_subscription` / `other`）へ写像するだけに留める。

「失効した購読を消す」はビジネスポリシーであり、Infrastructure に持たせると
`.claude/rules/domain-layer.md` の責務分離（Repository は DB スキーマ変換のみ）から
逸脱する。UseCase テストで挙動を固定できる利点もある。

### 6. 「期限が近い」の判定を Application 層へ移し、ダッシュボードも差し替える

現在この判定は Presentation 層にある（`apps/web/src/app/_utils/expiry.ts` の
`EXPIRY_URGENCY_WITHIN_DAYS = 3` と `dashboard-view.ts` の `selectExpiringStocks`）。
Cron はサーバ側で同じ判定をする必要があるため、`GetExpiringStocksUseCase` として
Application 層へ移し、**ダッシュボードの呼び出しも新 UseCase に差し替える**。

Cron 用に別途持つ案はスコープが最小で済むが、閾値ロジックが 2 箇所に並存し、
「画面には出るが通知は来ない」型のズレが将来出る。既存 UI に手が入ることによる
スコープ拡大を受容して、単一の判定に寄せる。

Cron ルート内に閉じる案は、CLAUDE.md の層責務（Presentation は UseCase を呼ぶだけ）に
反するため採らない。

### 補足: タイムゾーンは環境変数で固定する

`toLocalMidnight` は実行時 TZ に依存し、Vercel の実行時 TZ は UTC である。
`TZ=Asia/Tokyo` を Vercel の環境変数に設定してサーバ側の既存ロジックをそのまま使う。
コード上で `Asia/Tokyo` を明示する案は、既存のローカルタイム規約
（`meal-plan.mapper` / `pantry.mapper` / `expiry.ts`）と二重規範になるため採らない。

**代償として「環境変数の設定忘れで静かに壊れる」依存を作る。** 設定漏れはコード上に
痕跡を残さず「通知が 1 日ずれる」形でしか現れない。設定手順を設計書の移行節に明記する。

なお、この設定はダッシュボードに既に存在する潜在的なズレ（JST 00:00〜09:00 の間、
サーバが前日と見なす）も同時に解消する。

## Alternatives（検討した非採用案と却下理由）

### 案 A: PWA Badge（`setAppBadge`）で件数を出す（却下）

roadmap タスク 3 の当初の両論併記の一方。実装が軽く、購読・VAPID 鍵・Cron が一切不要。

却下理由は 2 つ。**iOS が `setAppBadge` に対応していない**ため、主要な利用端末
（`docs/02-tech-stack.md` の想定は iPhone Safari と Android Chrome の両方）の片方で
まったく機能しない。さらに Badge の更新には**アプリの起動が必要**で、
完了条件「アプリを**開かずに**気づける」を定義上満たせない。

### 案 B: メール通知（却下）

Push の購読・Service Worker・VAPID 鍵が不要で、iOS の PWA 制約も回避できる。

却下理由: メール送信サービス（Resend / SendGrid 等）という新しい外部依存と、
多くの場合**課金**が発生する。また 2 人運用では「毎朝メールが来る」体験が
アプリへの導線として弱く、タップ即 `/pantry` という行動喚起にならない。
PWA として作ってきた本プロダクトの方向性とも合わない。

### 案 C: 通知はせず、ダッシュボードの表示強化に留める（却下）

2026-07-21 に色分けバッジを入れたのと同じ延長線で、コストが最も低い。

却下理由: 完了条件「アプリを**開かずに**気づける」を満たさない。この完了条件は
Sprint 8 のゴール記述「期限切れ**前に能動的に**気づける」の中核であり、
表示強化は「開いたときに気づける」までしか到達しない。

### 案 D: 購読情報を Infrastructure 限定の技術テーブルとして扱う（却下）

購読情報（endpoint・公開鍵）は業務概念ではなく配信チャネルなので、Domain に
持ち込まないほうが素直だという整理。集約・Repository インターフェースの実装が省ける。

却下理由: Decision 4 のとおり。既存 9 テーブルが例外なくドメイン集約と 1:1 対応している
一貫性を破る。実装量の差が小さい一方、「この 1 テーブルだけ集約が無い」という例外を
説明し続けるコストが残る。

### 案 E: GitHub Actions schedule で Cron を回す（却下）

`.github/workflows/weekly-maintenance.yml` という既存パターンがあり、
Hobby プランの「日次 1 回・1 時間のブレ」という制約を受けずに分単位で制御できる。

却下理由: Decision 2 のとおり。本番 URL と `CRON_SECRET` を GitHub Secrets に持つ必要が
あり、環境変数の管理が Vercel と GitHub の 2 箇所に割れる。日次 1 回で足りる本決定では
Actions の精度上の利点が活きない。**なお日次より高頻度が必要になった場合、
この案または Vercel Pro への移行が選択肢として残る**（下記 Consequences 参照）。

### 案 F: VAPID / Web Push 暗号化を Web Crypto で自前実装する（却下）

`web-push` パッケージへの依存を増やさずに済む。

却下理由: RFC 8291（Web Push 暗号化）・RFC 8292（VAPID）の実装は非自明で、
既存コードベースに前例が無い。暗号化の実装ミスは**テストで見つかりにくい**形で
現れる（送信は成功するが端末で復号できない等）。実装ミスによるセキュリティ・
信頼性リスクを避けるコストが、依存 1 つ（MIT・無償）を追加するコストを上回る。

## Consequences（良い影響・悪い影響・残るリスク）

良い影響:

- roadmap Sprint 8 の完了条件 3 件目「期限が近い在庫にアプリを開かずに気づける」が満たされ、
  **Sprint 8 のゴールが閉じる**。
- Unit A で入力できるようになった賞味期限データに、初めて**能動的な出口**ができる。
  ADR-0016 が「Unit B のデータが揃う」と書いた前提の受け側にあたる。
- 期限判定ロジックが Application 層に一本化され、通知と画面表示が同じ判定を共有する。
  ダッシュボードの潜在的な TZ ズレ（JST 00:00〜09:00）も `TZ=Asia/Tokyo` 設定で解消する。
- **追加費用は発生しない。** Vercel Cron は全プランに含まれ、Push Service（FCM / Apple /
  Mozilla）は VAPID 方式なら無料、`web-push` は MIT、Neon Free の消費は日次 1 回・数秒の
  起床で誤差の範囲（いずれも 2026-08-09 に公式ドキュメントで確認）。

悪い影響 / 残るリスク:

- **ADR-0001 の理由 4（プッシュ通知は MVP1 のスコープ外）と `docs/02-tech-stack.md:118` の
  前提が現状と食い違う。** 本 ADR は ADR-0001 の**結論（Web + PWA を採る）を覆さない** —
  むしろ「PWA でもプッシュ通知が実現できた」ことは結論を補強する。ADR-0001 本文は
  書き換えない（ADR-0016 が `pantry-core.md` S-4 に対して採った方針と同じ。判断の時系列を
  後から編集すると読めなくなる）。`02-tech-stack.md` は現況記述なので訂正する。
- **iOS でしか再現しない不具合の経路が 2 つ増える。** ①ホーム画面追加済み PWA でないと
  Web Push が動かず、権限要求はユーザージェスチャ起点でないと失敗する。②Apple は
  VAPID subject が `mailto:` か HTTPS URL でないと 403 を返す。どちらも
  **Chrome / Android では通る**ため、「Android で確認して iOS だけ落ちる」形で現れる。
- **dev 環境で検証できない。** `apps/web/next.config.ts` は `NODE_ENV === 'production'` の
  ときだけ Serwist を有効化するため、`pnpm dev` では Service Worker が生成されない。
  Push の検証は Vercel Preview Deployment + 実機に限られ、**開発ループが遅くなる**。
- **VAPID 秘密鍵と `CRON_SECRET` という秘密情報が 2 つ増える。** 現状のリポジトリには
  `.env.example` も環境変数の検証層も無く、秘密情報は `DATABASE_URL` 1 つだけだった。
  必要な環境変数の一覧を設計書に残さないと、再デプロイや環境作り直しの際に失われる。
- **通知時刻を約束できない。** Vercel Hobby では発火が 1 時間ブレる。ユーザーに
  「毎朝 8 時に届く」と説明できない。分単位の精度が必要になった場合は案 E（GitHub Actions）
  または Vercel Pro への移行が必要になり、**後者は初めて課金が発生する経路**である。
- **`sw.ts` が Sprint 9（Background Sync）と競合しうる。** 本ユニットは `push` /
  `notificationclick` を、Sprint 9 は `sync` を追加する見込み。いずれも既存の
  `runtimeCaching`（fetch）とは別種のイベントであり、Serwist インスタンスの外側に
  `self.addEventListener` を積む方針を共有すれば共存できる。実装順序は本ユニットが先行する。
- **数量 0（`numeric(10,3)` 丸め）の在庫について、通知と画面表示が非対称になる。**
  通知経路では除外するが、ダッシュボード・`/pantry` の表示には引き続き現れる。
  既存画面の挙動を変えないための意図的な選択であり、根本原因（Unit A レビュー S-5）の
  恒久対処は本ユニットのスコープ外とする。
- **購読の失効検知は送信時にしかできない。** ブラウザ側で購読が破棄されても、次の Cron が
  404/410 を受け取るまで DB に残る。2 人運用では実害が無いため許容する。

## Migration（移行が必要な場合の手順。不要なら「対象外」）

**必要。** 新規テーブルの追加と環境変数の設定を伴う。

1. `packages/infrastructure/src/db/schema.ts` に `push_subscriptions` を追加し、
   `pnpm --filter @cookpit/web db:generate` で `apps/web/src/db/migrations/0008_*.sql` を生成する。
   生成物（`.sql` + `meta/0008_snapshot.json` + `meta/_journal.json`）は手動編集せずコミットする。
2. `packages/infrastructure/tests/testing/create-test-db.ts` の DDL に同じ
   `CREATE TABLE` を手で追記する。**忘れると Repository テストが全滅する**
   （`docs/implementation-plans/pantry-core.md` IMP-2 と同じ罠）。
3. VAPID 鍵ペアを生成し、Vercel の環境変数に設定する。秘密鍵はサーバ限定、公開鍵のみを
   クライアントへ配る。VAPID subject は **`mailto:` か HTTPS URL** にする（Apple の制約）。
4. `CRON_SECRET` を Vercel の環境変数に設定する。
5. **`TZ=Asia/Tokyo` を Vercel の環境変数に設定する。** これを忘れると通知日が 1 日ずれるが、
   コード上に痕跡が残らないため気づきにくい。
6. リポジトリルートに `vercel.json` を新設し、`crons` に `0 23 * * *`（UTC）を定義する。

既存データへの影響は無い。`push_subscriptions` は新規テーブルであり、既存 9 テーブルの
スキーマは変更しない。購読が 0 件の間、Cron は早期 return するだけで副作用が無い。

## Rollback（決定を戻す場合の手順）

1. `vercel.json` の `crons` エントリを削除する（ファイルごと消してもよい）。これで
   日次実行が止まり、通知は送られなくなる。**最も速い緊急停止手段**であり、
   以降の手順を待たずに実行できる。
2. `apps/web/src/server/routes/` の購読ルートと Cron ルートを削除し、
   `apps/web/src/server/app.ts` の対応する `.route()` を戻す。
3. `apps/web/src/app/sw.ts` の `push` / `notificationclick` ハンドラを削除する。
   既存の `runtimeCaching` 4 件には触れない。
4. ダッシュボードの購読 UI（`_components/dashboard.tsx`）を削除する。
5. `SendExpiryAlertsUseCase` / 購読登録・解除 UseCase / `PushSubscription` 集約 /
   `PushSubscriptionRepository` / Drizzle 実装 / Zod スキーマを削除し、各バレルから外す。
6. `web-push` 依存を `apps/web/package.json` から外す。
7. 環境変数（VAPID 鍵・`CRON_SECRET`）を Vercel から削除する。**`TZ=Asia/Tokyo` は残す**
   — これは本決定に固有ではなく、既存のダッシュボード表示のズレも直しているため。

`GetExpiringStocksUseCase` への差し替え（Decision 6）は**戻さなくてよい**。層責務として
正しい形であり、通知を止めても画面表示は同じ結果になる。戻す場合は
`page.tsx` を `selectExpiringStocks` 呼び出しへ復帰させる。

`push_subscriptions` テーブルは残しても害が無い（誰も読まなくなるだけ）。消す場合は
ロールバック用のマイグレーションを別途生成する。**保存済みの購読情報は端末側の
購読が生きている限り有効なので、テーブルを消すと再購読が必要になる**点に注意する。

## References

- 設計書: `docs/designs/expiry-alert.md`（ステータス confirmed。P-1〜P-11 の確定内容と
  実装上の罠 9 件）
- 要件定義書: `docs/requirements/expiry-alert.md`
- 契約設計書: `docs/designs/expiry-alert.contract.md`
- `docs/05-roadmap.md` Sprint 8（`:612-669`。完了条件・ユニット分割・方式のユーザー確定）
- [ADR-0001: ネイティブアプリではなく Web アプリを採用する](./ADR-0001-web-not-native.md)
  （§決定の理由 4「プッシュ通知は MVP1 のスコープ外」を本 ADR が再訪する。結論は覆さない）
- [ADR-0003: MVP1 では認証を導入しない](./ADR-0003-no-auth-in-mvp1.md)
  （Cron エンドポイントの保護を汎用ミドルウェアではなく当該ルート限定にする根拠）
- [ADR-0010: パッケージの公開境界](./ADR-0010-package-public-boundary.md)
  （新規集約と Repository 実装の re-export 方針）
- [ADR-0016: Stock の数量・賞味期限・保存場所を可変にする](./ADR-0016-stock-details-mutable.md)
  （Unit A。本決定の前提となる期限データの流入経路）
- `docs/designs/dashboard.md` §P-1（閾値 3 日）/ §P-6（文言 5 パターン。通知本文が流用する）
- `docs/reviews/stock-edit.md` §S-5（`numeric(10,3)` 丸めによる数量 0 の在庫）
- `docs/02-tech-stack.md`（:34 環境変数 1 箇所 / :112-118 PWA の OS 差異。:118 は本決定に
  伴い訂正する）
