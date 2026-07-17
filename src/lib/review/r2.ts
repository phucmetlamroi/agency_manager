// [Review module P1] Cloudflare R2 (S3 API) client + multipart helpers.
// Browser PUTs parts straight to presigned URLs; the server only orchestrates
// (Create/Complete/Abort/List) and mints presigned URLs. Never proxies bytes.

import {
    S3Client,
    CreateMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
    ListPartsCommand,
    UploadPartCommand,
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Readable } from 'node:stream'

let _client: S3Client | null = null

/** Singleton S3 client bound to the account's R2 endpoint (region 'auto'). */
export function r2Client(): S3Client {
    if (_client) return _client
    const accountId = requireEnv('R2_ACCOUNT_ID')
    _client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
            secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
        },
    })
    return _client
}

export function r2Bucket(): string {
    return process.env.R2_BUCKET || 'hustly-review'
}

function requireEnv(name: string): string {
    const v = process.env[name]
    if (!v) throw new Error(`[review/r2] missing env ${name}`)
    return v
}

export interface CompletedPart {
    partNumber: number
    etag: string
}

/** Begin a multipart upload → returns the S3 UploadId (needed for every later call). */
export async function createMultipart(key: string, contentType: string): Promise<string> {
    const out = await r2Client().send(
        new CreateMultipartUploadCommand({ Bucket: r2Bucket(), Key: key, ContentType: contentType }),
    )
    if (!out.UploadId) throw new Error('[review/r2] CreateMultipartUpload returned no UploadId')
    return out.UploadId
}

/** Presigned PUT URL for one part. Browser reads the ETag from the response header. */
export async function presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresIn = 24 * 60 * 60,
): Promise<string> {
    const cmd = new UploadPartCommand({
        Bucket: r2Bucket(),
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
    })
    return getSignedUrl(r2Client(), cmd, { expiresIn })
}

/** Presigned single PUT (image / tiny file — no multipart). */
export async function presignPutObject(
    key: string,
    contentType: string,
    expiresIn = 24 * 60 * 60,
): Promise<string> {
    const cmd = new PutObjectCommand({ Bucket: r2Bucket(), Key: key, ContentType: contentType })
    return getSignedUrl(r2Client(), cmd, { expiresIn })
}

/** Finalize a multipart upload. Parts must be sorted ascending by partNumber. */
export async function completeMultipart(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
): Promise<{ etag?: string }> {
    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber)
    const out = await r2Client().send(
        new CompleteMultipartUploadCommand({
            Bucket: r2Bucket(),
            Key: key,
            UploadId: uploadId,
            MultipartUpload: {
                Parts: sorted.map((p) => ({ ETag: p.etag, PartNumber: p.partNumber })),
            },
        }),
    )
    return { etag: out.ETag }
}

/** Abort a multipart upload (frees the staged parts). Idempotent on R2. */
export async function abortMultipart(key: string, uploadId: string): Promise<void> {
    await r2Client().send(
        new AbortMultipartUploadCommand({ Bucket: r2Bucket(), Key: key, UploadId: uploadId }),
    )
}

/** List parts already staged for a multipart upload (resume-after-reload). */
export async function listParts(
    key: string,
    uploadId: string,
): Promise<{ partNumber: number; etag: string; size: number }[]> {
    const out = await r2Client().send(
        new ListPartsCommand({ Bucket: r2Bucket(), Key: key, UploadId: uploadId }),
    )
    return (out.Parts ?? []).map((p) => ({
        partNumber: p.PartNumber ?? 0,
        etag: p.ETag ?? '',
        size: p.Size ?? 0,
    }))
}

/** Presigned GET — Mux pull (24h) or member download (15min, attachment). */
export async function presignGetObject(
    key: string,
    opts: { expiresIn?: number; downloadFileName?: string } = {},
): Promise<string> {
    const cmd = new GetObjectCommand({
        Bucket: r2Bucket(),
        Key: key,
        ...(opts.downloadFileName
            ? { ResponseContentDisposition: `attachment; filename="${opts.downloadFileName.replace(/"/g, '')}"` }
            : {}),
    })
    return getSignedUrl(r2Client(), cmd, { expiresIn: opts.expiresIn ?? 24 * 60 * 60 })
}

/** Read a byte range of an object (magic-byte content sniff in P1.4). */
export async function getObjectRange(key: string, start: number, end: number): Promise<Uint8Array> {
    const out = await r2Client().send(
        new GetObjectCommand({ Bucket: r2Bucket(), Key: key, Range: `bytes=${start}-${end}` }),
    )
    // aws-sdk v3 stream → bytes (Node runtime).
    const body = out.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined
    if (!body?.transformToByteArray) throw new Error('[review/r2] GetObject body not a byte stream')
    return body.transformToByteArray()
}

/** HEAD an object (exists + size). Returns null on 404/NoSuchKey. */
export async function headObject(key: string): Promise<{ size: number; etag?: string } | null> {
    try {
        const out = await r2Client().send(new HeadObjectCommand({ Bucket: r2Bucket(), Key: key }))
        return { size: out.ContentLength ?? 0, etag: out.ETag }
    } catch (e) {
        const err = e as { name?: string; $metadata?: { httpStatusCode?: number } }
        if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound' || err.name === 'NoSuchKey') return null
        throw e
    }
}

/** Delete an object (cleanup on abort / failed magic-byte). Idempotent. */
export async function deleteObject(key: string): Promise<void> {
    await r2Client().send(new DeleteObjectCommand({ Bucket: r2Bucket(), Key: key }))
}

/** Read a WHOLE object into memory — server-side derivative generation (e.g. B1 image previews). */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
    const out = await r2Client().send(new GetObjectCommand({ Bucket: r2Bucket(), Key: key }))
    const body = out.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined
    if (!body?.transformToByteArray) throw new Error('[review/r2] GetObject body not a byte stream')
    return body.transformToByteArray()
}

/** Upload bytes directly from the server (small server-generated objects like image previews). */
export async function putObjectBytes(key: string, body: Uint8Array | Buffer, contentType: string): Promise<void> {
    await r2Client().send(new PutObjectCommand({ Bucket: r2Bucket(), Key: key, Body: body, ContentType: contentType }))
}

/**
 * Stream an UNKNOWN-length Node Readable up to R2 via hand-rolled multipart (no @aws-sdk/lib-storage
 * dep). Buffers into ≥PART_SIZE chunks (S3 requires ≥5 MiB per part except the last); the `for await`
 * applies backpressure so memory stays ~one part. Used by the color-retag pipeline to pipe ffmpeg's
 * stdout straight to R2 with NO /tmp — so it handles arbitrarily large videos. If the source stream
 * ERRORS (e.g. ffmpeg destroyed stdout on a non-zero exit / timeout), the in-flight multipart is
 * ABORTED and the error re-thrown, so a truncated object can never be completed and reach Mux.
 */
export async function putObjectFromStream(key: string, body: Readable, contentType: string): Promise<void> {
    const PART_SIZE = 8 * 1024 * 1024 // 8 MiB (min 5 MiB except the final part)
    const uploadId = await createMultipart(key, contentType)
    const parts: CompletedPart[] = []
    let partNumber = 1
    let pending: Buffer[] = []
    let pendingLen = 0

    const flush = async (): Promise<void> => {
        if (pendingLen === 0) return
        const data = Buffer.concat(pending, pendingLen)
        pending = []
        pendingLen = 0
        const out = await r2Client().send(
            new UploadPartCommand({ Bucket: r2Bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber, Body: data }),
        )
        if (!out.ETag) throw new Error('[review/r2] UploadPart returned no ETag')
        parts.push({ partNumber, etag: out.ETag })
        partNumber++
    }

    try {
        for await (const chunk of body as AsyncIterable<Buffer>) {
            const c: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            pending.push(c)
            pendingLen += c.length
            if (pendingLen >= PART_SIZE) await flush()
        }
        await flush() // final (possibly < PART_SIZE) part
        if (parts.length === 0) throw new Error('[review/r2] empty stream — nothing uploaded')
        await completeMultipart(key, uploadId, parts)
    } catch (e) {
        await abortMultipart(key, uploadId).catch(() => { /* best-effort */ })
        throw e
    }
}

/** A Node Readable of an object's body — server-side STREAMING (e.g. zip export of many files). */
export async function getObjectStream(key: string): Promise<Readable> {
    const out = await r2Client().send(new GetObjectCommand({ Bucket: r2Bucket(), Key: key }))
    if (!out.Body) throw new Error('[review/r2] GetObject returned no body')
    return out.Body as Readable
}
