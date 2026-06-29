import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool, type PoolConfig } from 'pg'

import { env } from '~/env'
import * as schema from './schema'

const globalForDb = globalThis as typeof globalThis & {
    __safeCitiesDbPool?: Pool
}

function createPool() {
    const config: PoolConfig = {
        connectionString: env.DATABASE_URL,
        max: env.NODE_ENV === 'production' ? 10 : 5,
        idleTimeoutMillis: 30_000,
    }

    return new Pool(config)
}

const pool = globalForDb.__safeCitiesDbPool ?? createPool()

if (env.NODE_ENV !== 'production') {
    globalForDb.__safeCitiesDbPool = pool
}

export const db = drizzle(pool, {
    schema,
})
