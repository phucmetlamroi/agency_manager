/**
 * [Quick Create] AES-256-GCM token encryption for OAuth integration tokens.
 *
 * Uses Node.js native `crypto` module (NOT jose — jose is for JWT,
 * this is symmetric encryption for OAuth access/refresh tokens at rest).
 *
 * Env var: INTEGRATION_TOKEN_SECRET — 64-char hex string (32 bytes).
 * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Format: base64(iv[12] + authTag[16] + ciphertext)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard IV length
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const secret = process.env.INTEGRATION_TOKEN_SECRET
  if (!secret) {
    throw new Error(
      '[token-encryption] INTEGRATION_TOKEN_SECRET env var is not set. ' +
        'Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }
  if (secret.length !== 64) {
    throw new Error(
      `[token-encryption] INTEGRATION_TOKEN_SECRET must be 64 hex chars (32 bytes), got ${secret.length} chars.`,
    )
  }
  return Buffer.from(secret, 'hex')
}

/**
 * Encrypt a plaintext string (OAuth token) using AES-256-GCM.
 * Returns a base64-encoded string containing: iv (12 bytes) + authTag (16 bytes) + ciphertext.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Pack: iv + authTag + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted])
  return packed.toString('base64')
}

/**
 * Decrypt a base64-encoded encrypted token back to plaintext.
 * Throws if tampered or wrong key.
 */
export function decryptToken(encrypted: string): string {
  const key = getKey()
  const packed = Buffer.from(encrypted, 'base64')

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('[token-encryption] Encrypted data too short — corrupted or invalid format.')
  }

  const iv = packed.subarray(0, IV_LENGTH)
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}
