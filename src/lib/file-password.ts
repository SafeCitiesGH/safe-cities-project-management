// Helpers for per-file password protection (Feature 2).
// This is an ACCESS GATE: passwords are bcrypt-hashed and verified server-side
// before protected content is returned. File content is NOT encrypted at rest,
// so an admin can always recover/clear protection if a password is lost.
import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

/** Hash a plaintext file password for storage. */
export async function hashFilePassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS)
}

/** Compare a candidate password against a stored bcrypt hash. */
export async function verifyFilePasswordHash(
    password: string,
    hash: string | null | undefined
): Promise<boolean> {
    if (!hash) return false
    try {
        return await bcrypt.compare(password, hash)
    } catch {
        return false
    }
}

// --- Minimal in-memory brute-force throttle ---
// Caps verification attempts per (user, file) within a sliding window.
// In-memory only (per server instance); good enough to blunt rapid guessing.
const MAX_ATTEMPTS = 8
const WINDOW_MS = 60 * 1000

const attempts = new Map<string, { count: number; resetAt: number }>()

/**
 * Records an attempt and returns whether the caller is allowed to try.
 * Returns false once the cap is exceeded within the window.
 */
export function registerPasswordAttempt(
    userId: string,
    fileId: number
): { allowed: boolean; retryAfterMs: number } {
    const key = `${userId}:${fileId}`
    const now = Date.now()
    const entry = attempts.get(key)

    if (!entry || now > entry.resetAt) {
        attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
        return { allowed: true, retryAfterMs: 0 }
    }

    if (entry.count >= MAX_ATTEMPTS) {
        return { allowed: false, retryAfterMs: entry.resetAt - now }
    }

    entry.count += 1
    return { allowed: true, retryAfterMs: 0 }
}

/** Clears the attempt counter for a (user, file) after a successful unlock. */
export function clearPasswordAttempts(userId: string, fileId: number): void {
    attempts.delete(`${userId}:${fileId}`)
}
