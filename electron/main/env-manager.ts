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
 * [AUDIT HT-038 fix] Danh sách CHO PHÉP GHI — không phải danh sách cấm.
 *
 * electron-store 8.x biên dịch schema thành `{type:'object', properties:{…}}` và KHÔNG đặt
 * `additionalProperties: false`, nên `store.set('<khoá bất kỳ>', v)` vẫn qua được kiểm tra, rồi
 * `getStoredEnvVars()` trả nó về nguyên vẹn và `next-server.ts` trải thẳng vào `env` của tiến
 * trình Next.js con. Tức là ghi được khoá tuỳ ý = tiêm được biến môi trường vào một tiến trình
 * Node: NODE_OPTIONS (`--require` nhận cả đường dẫn UNC trên Windows),
 * NODE_TLS_REJECT_UNAUTHORIZED=0, NODE_EXTRA_CA_CERTS…
 *
 * Cố ý KHÔNG suy ra tự động từ `EnvSchema`: thêm trường mới vào schema thì trường đó MẶC ĐỊNH
 * KHÔNG ghi được cho tới khi có người thêm vào đây một cách có chủ đích. Fail-closed.
 */
const WRITABLE_ENV_KEYS: readonly (keyof EnvSchema)[] = [
    'DATABASE_URL',
    'JWT_SECRET',
    'CRON_SECRET',
    'RESEND_API_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'MCP_PROFILE_ID',
    'MCP_WORKSPACE_IDS',
]

export function isWritableEnvKey(key: unknown): key is keyof EnvSchema {
    return typeof key === 'string' && (WRITABLE_ENV_KEYS as readonly string[]).includes(key)
}

/** Giá trị dài tối đa — không biến nào ở đây gần ngưỡng này; cốt để chặn ghi rác vào store. */
const MAX_ENV_VALUE_LEN = 4096

/**
 * [AUDIT HT-038 fix] Từ chối MỌI ký tự điều khiển C0 (0x00–0x1F) và DEL (0x7F).
 *
 * Không ký tự nào trong nhóm đó hợp lệ trong một biến môi trường; chúng chỉ có tác dụng khi giá
 * trị bị ghép vào một chỗ khác — NUL cắt chuỗi ở tầng C, CR/LF tách ra thành biến hay dòng log
 * thứ hai. Chặn cả nhóm thay vì liệt kê vài ký tự: bài học của HT-039 là danh sách nào cũng có
 * thể thiếu, nên chọn tiêu chí bao trọn được.
 */
export function isValidEnvValue(value: unknown): value is string {
    if (typeof value !== 'string') return false
    if (value.length > MAX_ENV_VALUE_LEN) return false
    for (const ch of value) {
        const code = ch.charCodeAt(0)
        if (code < 0x20 || code === 0x7f) return false
    }
    return true
}

/**
 * Set a single env var.
 *
 * [AUDIT HT-038 fix] Chốt đặt Ở ĐÂY, không phải ở nơi gọi. Mọi đường ghi cấu hình đều đi qua hàm
 * này, nên đặt chốt tại điểm nghẽn thì người viết đường ghi thứ hai không phải nhớ gì cả — đúng
 * bài học của HT-035 (8/9 template quên escape vì mỗi nơi phải tự nhớ).
 */
export function setEnvVar<K extends keyof EnvSchema>(
    key: K,
    value: EnvSchema[K],
): void {
    if (!isWritableEnvKey(key)) {
        throw new Error(`setEnvVar: khoá không nằm trong danh sách được ghi: ${String(key)}`)
    }
    if (!isValidEnvValue(value)) {
        throw new Error(`setEnvVar: giá trị không hợp lệ cho ${String(key)}`)
    }
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
