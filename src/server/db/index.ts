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
        // Vercel runs many serverless instances, each with its own pool, all
        // sharing one Supabase pooler that caps total connections (15 on the
        // session pooler). Keep each instance's footprint tiny so they can't
        // collectively exhaust that limit and stall role/permission lookups.
        max: env.NODE_ENV === 'production' ? 1 : 3,
        // Release idle connections back to the pooler quickly between bursts.
        idleTimeoutMillis: 10_000,
        // Fail fast instead of hanging if the pooler is momentarily full.
        connectionTimeoutMillis: 10_000,
    }

    return new Pool(config)
}

// Reuse a single pool per instance across hot reloads / module re-imports in
// ALL environments so we never accumulate orphaned pools holding connections.
const pool = globalForDb.__safeCitiesDbPool ?? createPool()
globalForDb.__safeCitiesDbPool = pool

export const db = drizzle(pool, {
    schema,
})
