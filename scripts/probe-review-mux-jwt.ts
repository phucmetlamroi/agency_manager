/**
 * [Review module P1.7] Verify the hand-rolled Mux RS256 playback JWT is well-formed
 * AND signature-valid against a real RSA key pair. Pure crypto — no DB/session.
 * Run: npx tsx scripts/probe-review-mux-jwt.ts
 */
import { generateKeyPairSync, createPublicKey, verify as cryptoVerify } from 'node:crypto'
// mux-jwt reads env at CALL time (inside signingKey()), not at import — so a static import
// is safe as long as env is set before the first mint call below.
import { mintPlaybackTokens, signMuxToken } from '../src/lib/review/mux-jwt'

// Generate an RSA key pair; feed the private key (base64-encoded PEM, as Mux ships it) via env.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
})
process.env.MUX_SIGNING_KEY_ID = 'test-kid-123'
process.env.MUX_SIGNING_PRIVATE_KEY = Buffer.from(privateKey, 'utf8').toString('base64')

let ok = 0,
    fail = 0
const check = (name: string, pass: boolean, detail = '') => {
    pass ? ok++ : fail++
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !detail ? '' : ` — ${detail}`}`)
}

function b64urlToBuf(s: string): Buffer {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}
function decodeJson(seg: string): Record<string, unknown> {
    return JSON.parse(b64urlToBuf(seg).toString('utf8'))
}

const PLAYBACK_ID = 'AbC123playbackId'
const { tokens, expiresAt } = mintPlaybackTokens(PLAYBACK_ID)
const pub = createPublicKey(publicKey)
const nowSec = Math.floor(Date.now() / 1000)

for (const [name, aud] of [
    ['playback', 'v'],
    ['thumbnail', 't'],
    ['storyboard', 's'],
] as const) {
    const jwt = tokens[name]
    const parts = jwt.split('.')
    check(`${name}: 3 segments`, parts.length === 3, `got ${parts.length}`)

    const header = decodeJson(parts[0])
    check(`${name}: header alg RS256`, header.alg === 'RS256', String(header.alg))
    check(`${name}: header typ JWT`, header.typ === 'JWT', String(header.typ))
    check(`${name}: header kid`, header.kid === 'test-kid-123', String(header.kid))

    const payload = decodeJson(parts[1])
    check(`${name}: payload sub=playbackId`, payload.sub === PLAYBACK_ID, String(payload.sub))
    check(`${name}: payload aud=${aud}`, payload.aud === aud, String(payload.aud))
    const exp = Number(payload.exp)
    check(`${name}: exp ≈ +6h`, exp > nowSec + 6 * 3600 - 120 && exp <= nowSec + 6 * 3600 + 5, `exp=${exp}`)
    check(`${name}: no iat (Mux omits)`, !('iat' in payload), 'iat present')

    // Signature must verify against the public key over "header.payload".
    const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8')
    const sigValid = cryptoVerify('RSA-SHA256', signingInput, pub, b64urlToBuf(parts[2]))
    check(`${name}: RS256 signature valid`, sigValid, 'verify failed')
}

// expiresAt matches the +6h window.
const expMs = new Date(expiresAt).getTime()
check('expiresAt ≈ +6h ISO', expMs > Date.now() + 6 * 3600_000 - 120_000 && expMs <= Date.now() + 6 * 3600_000 + 5000, expiresAt)

// A tampered payload must FAIL verification (integrity).
const tampered = (() => {
    const p = tokens.playback.split('.')
    const badPayload = Buffer.from(JSON.stringify({ sub: 'OTHER', aud: 'v', exp: nowSec + 3600 }), 'utf8')
        .toString('base64')
        .replace(/=+$/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
    return cryptoVerify('RSA-SHA256', Buffer.from(`${p[0]}.${badPayload}`, 'utf8'), pub, b64urlToBuf(p[2]))
})()
check('tampered payload → signature INVALID', tampered === false)

// Custom TTL honored.
const shortExp = decodeJson(signMuxToken(PLAYBACK_ID, 'v', nowSec + 60).split('.')[1])
check('custom exp honored', Number(shortExp.exp) === nowSec + 60, String(shortExp.exp))

console.log(`\nRESULT: ${ok} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
