/**
 * Environment variable manager — persists secrets with electron-store (encrypted).
 *
 * Schema mirrors the env vars needed by the Next.js app and MCP server.
 */
import Store from 'electron-store'

// ---------------------------------------------------------------------------
// Store schema
// ---------------------------------------------------------------------------
interface EnvSchema {
    DATABASE_URL: string
    JWT_SECRET: string
    CRON_SECRET: string
    RESEND_API_KEY: string
    UPSTASH_REDIS_REST_URL: string
    UPSTASH_REDIS_REST_TOKEN: string
    MCP_PROFILE_ID: string
    MCP_WORKSPACE_IDS: string
}

const store = new Store<EnvSchema>({
    name: 'hustly-env',
    encryptionKey: 'hustly-tasker-desktop-v1', // obfuscation layer for at-rest storage
    schema: {
        DATABASE_URL: {
            type: 'string',
            default: '',
        },
        JWT_SECRET: {
            type: 'string',
            default: '',
        },
        CRON_SECRET: {
            type: 'string',
            default: 'local-cron',
        },
        RESEND_API_KEY: {
            type: 'string',
            default: '',
        },
        UPSTASH_REDIS_REST_URL: {
            type: 'string',
            default: '',
        },
        UPSTASH_REDIS_REST_TOKEN: {
            type: 'string',
            default: '',
        },
        MCP_PROFILE_ID: {
            type: 'string',
            default: '',
        },
        MCP_WORKSPACE_IDS: {
            type: 'string',
            default: '',
        },
    },
})

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all env vars as a flat Record suitable for `process.env` injection.
 * Only includes non-empty values.
 */
export function getStoredEnvVars(): Record<string, string> {
    const allVars = store.store // full object
    const result: Record<string, string> = {}

    for (const [key, value] of Object.entries(allVars)) {
        if (typeof value === 'string' && value.length > 0) {
            result[key] = value
        }
    }

    return result
}

/**
 * Get every env var including empty ones (for settings UI).
 */
export function getAllEnvVars(): EnvSchema {
    return { ...store.store }
}

/**
 * Set a single env var.
 */
export function setEnvVar<K extends keyof EnvSchema>(
    key: K,
    value: EnvSchema[K],
): void {
    store.set(key, value)
}

/**
 * Returns true when the required DATABASE_URL or JWT_SECRET are missing,
 * signalling that the first-run setup wizard should be shown.
 */
export function isFirstRun(): boolean {
    const dbUrl = store.get('DATABASE_URL', '')
    const jwtSecret = store.get('JWT_SECRET', '')
    return !dbUrl || !jwtSecret
}
