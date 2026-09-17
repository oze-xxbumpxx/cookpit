/**
 * リダイレクト応答・非 200 応答を SW ランタイムキャッシュへ書き込ませない（D-9）。
 * Serwist/Workbox の既定 `cacheOkAndOpaquePlugin` は opaqueredirect（`status: 0`）も
 * 保存するため、未認証 navigation の 302 がキャッシュされ、ログイン後のオフライン
 * 再訪問で `/login` へ誤誘導される事故を防ぐ（R-5）。
 *
 * `sw.ts`（`self.__SW_MANIFEST` に依存し Node/happy-dom 環境で import できない）から
 * 独立した純関数として切り出す（試験計画 §14-2 差し戻し候補 1、Orchestrator 判断で採用）。
 * 型は `{ response: Response }` の最小限にとどめる（Serwist の `WorkboxPlugin` 型は
 * import しない。構造的に適合するため plugins 配列へそのまま渡せる）。
 */
export async function cacheWillUpdate({
  response,
}: {
  response: Response;
}): Promise<Response | null> {
  return response.status === 200 && !response.redirected ? response : null;
}
