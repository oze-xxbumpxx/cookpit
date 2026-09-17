import { createAuthClient } from 'better-auth/react';

/**
 * `basePath` は `/api/auth`（`server/app.ts` の Hono マウント先と一致させる。契約書 §5）。
 * `baseURL` は省略し同一オリジンに委ねる。`useSession()` は使わない（設計書のとおり。
 * マウントごとの往復を避け、Server Component から得た session をそのまま使う）。
 */
export const authClient = createAuthClient({ basePath: '/api/auth' });
