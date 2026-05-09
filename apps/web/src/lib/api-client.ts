import { hc } from 'hono/client'
import type { AppType } from '@/server/app'

export const client = hc<AppType>('/')
