import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// DATABASE_URL が未設定の場合は接続を作らない（ローカル開発時の安全弁）
const createDb = () => {
  const url = process.env.DATABASE_URL
  if (!url) return null
  return drizzle(neon(url), { schema })
}

export const db = createDb()
