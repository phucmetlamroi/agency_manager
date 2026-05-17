'use server'

import { put } from '@vercel/blob'
import { prisma } from '@/lib/db'
import { revalidatePath, revalidateTag } from 'next/cache'
import sharp from 'sharp'

/* ──────────────────────────────────────────────────────────────────── */
/*  [Z+1.fix3] Image upload helpers                                      */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Allowed image MIME types — Sharp supports tất cả these natively.
 * iPhone HEIC/HEIF, modern AVIF, plus traditional JPG/PNG/GIF/WebP/TIFF.
 */
const ALLOWED_IMAGE_MIME = [
    'image/jpeg', 'image/jpg', 'image/pjpeg',  // JPG
    'image/png',                                 // PNG
    'image/webp',                                // WebP
    'image/gif',                                 // GIF
    'image/avif',                                // AVIF (modern)
    'image/heic', 'image/heif',                  // iPhone formats
    'image/tiff', 'image/tif',                   // TIFF
] as const

/**
 * Validate file is image type. Returns error message if invalid, null if OK.
 */
function validateImageFile(file: File | null): string | null {
    if (!file) return 'Không tìm thấy tệp tin.'
    // Some browsers / drag-drop scenarios set file.type empty — accept if size > 0,
    // Sharp sẽ tự reject nếu không parse được.
    if (file.type && !(ALLOWED_IMAGE_MIME as readonly string[]).includes(file.type)) {
        return `Định dạng ${file.type} không hỗ trợ. Hãy dùng JPG/PNG/WebP/HEIC/AVIF.`
    }
    return null
}

/**
 * [Z+1.fix3] Sharp pipeline builder với EXIF auto-orient.
 *
 * Critical: `.rotate()` no-args BEFORE `.resize()` để auto-orient theo EXIF tag.
 * Without this, portrait photos từ phone (EXIF Orientation=6) bị xử lý ở raw
 * landscape pixels → output rotated 90° (avatar lying on side).
 *
 * `failOn: 'none'` để Sharp lenient với metadata bất thường (corrupt EXIF,
 * unusual color profile từ iPhone DisplayP3, v.v.) — KHÔNG throw, chỉ skip.
 */
function imagePipeline(buffer: Buffer) {
    return sharp(buffer, { failOn: 'none' }).rotate()
}

export async function uploadPaymentQr(userId: string, formData: FormData) {
    try {
        const file = formData.get('file') as File
        const bankName = formData.get('bankName') as string
        const accountNum = formData.get('accountNum') as string

        // [Z+1.fix3] Validate file early
        const validateErr = validateImageFile(file)
        if (validateErr) return { error: validateErr }

        // 1. Validate Size (Server-side double check)
        if (file.size > 4 * 1024 * 1024) {
            return { error: 'File too large (>4MB)' }
        }

        // 2. Optimization Pipeline with Sharp (auto-orient EXIF, lenient on metadata)
        const buffer = Buffer.from(await file.arrayBuffer())

        let optimizedBuffer: Buffer
        try {
            optimizedBuffer = await imagePipeline(buffer)
                .resize(800, 800, { // Limit max dimension, maintain aspect ratio
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .webp({
                    quality: 90,
                    lossless: true, // Crucial for QR codes
                    effort: 6 // Higher effort = better compression
                })
                .toBuffer()
        } catch (sharpErr: any) {
            console.error('[uploadPaymentQr] Sharp error:', sharpErr)
            return { error: `Không xử lý được ảnh: ${sharpErr?.message?.slice(0, 100) || 'unknown'}. Vui lòng thử ảnh khác.` }
        }

        // 3. Upload to Vercel Blob
        // Filename: user-id-timestamp.webp
        const filename = `payment-qr-${userId}-${Date.now()}.webp`

        const blob = await put(filename, optimizedBuffer, {
            access: 'public',
            contentType: 'image/webp'
        })

        // 4. Update Database
        await prisma.user.update({
            where: { id: userId },
            data: {
                paymentQrUrl: blob.url,
                paymentBankName: bankName,
                paymentAccountNum: accountNum
            }
        })

        revalidatePath('/dashboard/profile', 'page')
        return { success: true, url: blob.url }

    } catch (error: any) {
        console.error('Upload error:', error)
        // Return specific error for debugging
        return { error: error.message || 'Failed to upload image' }
    }
}

export async function uploadAvatar(userId: string, formData: FormData) {
    try {
        const file = formData.get('file') as File

        // [Z+1.fix3] Validate file early
        const validateErr = validateImageFile(file)
        if (validateErr) return { error: validateErr }

        // 1. Validate Size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            return { error: 'Dung lượng ảnh tối đa là 10MB' }
        }

        // 2. Optimization Pipeline with Sharp (auto-orient EXIF cho phone portrait photos)
        const buffer = Buffer.from(await file.arrayBuffer())

        let optimizedBuffer: Buffer
        try {
            optimizedBuffer = await imagePipeline(buffer)
                .resize(512, 512, {
                    fit: 'cover',
                    position: 'center'
                })
                .webp({ quality: 85 })
                .toBuffer()
        } catch (sharpErr: any) {
            console.error('[uploadAvatar] Sharp error:', sharpErr)
            return { error: `Không xử lý được ảnh: ${sharpErr?.message?.slice(0, 100) || 'unknown'}. Vui lòng thử ảnh khác.` }
        }

        // 3. Upload to Vercel Blob
        const filename = `avatar-${userId}-${Date.now()}.webp`
        const blob = await put(filename, optimizedBuffer, {
            access: 'public',
            contentType: 'image/webp'
        })

        // 4. Update Database
        const { prisma } = await import('@/lib/db')
        await prisma.user.update({
            where: { id: userId },
            data: { 
                // @ts-ignore - prisma client might not have refreshed yet in some contexts
                avatarUrl: blob.url 
            }
        })

        // [Z+1.fix2] BEFORE: revalidatePath('/', 'layout') — quá rộng, sau Sprint Z+1
        //   RBAC migration có thể trigger downstream errors → Server Action trả về HTML
        //   error page thay vì JSON → user thấy "An unexpected response was received from the server".
        // AFTER: chỉ revalidateTag('leaderboard') (specific tag-based invalidation).
        //   Avatar URL được fetch fresh trên next navigation; browser cache tự refresh.
        try {
            // @ts-ignore
            revalidateTag('leaderboard')
        } catch (e) {
            console.warn('[uploadAvatar] revalidateTag failed (non-fatal):', e)
        }

        return { success: true, url: blob.url }

    } catch (error: any) {
        console.error('Avatar upload error:', error)
        // Always return JSON, never throw — prevents "unexpected response" error
        return { error: error?.message?.slice(0, 200) || 'Lỗi khi tải ảnh đại diện. Vui lòng thử lại.' }
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  [Sprint Z+1] Profile banner + logo upload                            */
/* ──────────────────────────────────────────────────────────────────── */

import { getSession } from '@/lib/auth'

async function verifyProfileOwner(profileId: string) {
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Bạn cần đăng nhập.', userId: null }

    const { getProfileRole } = await import('@/lib/profile-permissions')
    const role = await getProfileRole(session.user.id, profileId)
    if (role !== 'OWNER') return { error: 'Chỉ Owner mới có quyền upload.', userId: null }

    return { error: null, userId: session.user.id }
}

/**
 * [Sprint Z+1] Upload profile banner (1500x500 cover, webp).
 */
export async function uploadProfileBanner(profileId: string, formData: FormData) {
    try {
        const { error: authErr } = await verifyProfileOwner(profileId)
        if (authErr) return { error: authErr }

        const file = formData.get('file') as File

        // [Z+1.fix3] Validate file early
        const validateErr = validateImageFile(file)
        if (validateErr) return { error: validateErr }

        if (file.size > 10 * 1024 * 1024) return { error: 'Dung lượng tối đa 10MB.' }

        const buffer = Buffer.from(await file.arrayBuffer())

        let optimizedBuffer: Buffer
        try {
            optimizedBuffer = await imagePipeline(buffer)
                .resize(1500, 500, { fit: 'cover', position: 'center' })
                .webp({ quality: 85 })
                .toBuffer()
        } catch (sharpErr: any) {
            console.error('[uploadProfileBanner] Sharp error:', sharpErr)
            return { error: `Không xử lý được ảnh: ${sharpErr?.message?.slice(0, 100) || 'unknown'}. Vui lòng thử ảnh khác.` }
        }

        const filename = `profile-banner-${profileId}-${Date.now()}.webp`
        const blob = await put(filename, optimizedBuffer, {
            access: 'public',
            contentType: 'image/webp',
        })

        await prisma.profile.update({
            where: { id: profileId },
            data: { bannerUrl: blob.url },
        })

        // [Z+1.fix2] Removed revalidatePath('/', 'layout') — too broad, can cascade
        // through Sprint Z+1 RBAC layout → trigger HTML error response.
        // Banner URL is on Profile row; consumers re-fetch on next navigation.
        return { success: true as const, url: blob.url }
    } catch (error: any) {
        console.error('Profile banner upload error:', error)
        return { error: error?.message?.slice(0, 200) || 'Lỗi khi tải banner. Vui lòng thử lại.' }
    }
}

/**
 * [Sprint Z+1] Upload profile logo (512x512 square, webp lossless cho sharp icon).
 */
export async function uploadProfileLogo(profileId: string, formData: FormData) {
    try {
        const { error: authErr } = await verifyProfileOwner(profileId)
        if (authErr) return { error: authErr }

        const file = formData.get('file') as File

        // [Z+1.fix3] Validate file early
        const validateErr = validateImageFile(file)
        if (validateErr) return { error: validateErr }

        if (file.size > 5 * 1024 * 1024) return { error: 'Dung lượng tối đa 5MB.' }

        const buffer = Buffer.from(await file.arrayBuffer())

        let optimizedBuffer: Buffer
        try {
            optimizedBuffer = await imagePipeline(buffer)
                .resize(512, 512, { fit: 'cover', position: 'center' })
                .webp({ quality: 90, lossless: false })
                .toBuffer()
        } catch (sharpErr: any) {
            console.error('[uploadProfileLogo] Sharp error:', sharpErr)
            return { error: `Không xử lý được ảnh: ${sharpErr?.message?.slice(0, 100) || 'unknown'}. Vui lòng thử ảnh khác.` }
        }

        const filename = `profile-logo-${profileId}-${Date.now()}.webp`
        const blob = await put(filename, optimizedBuffer, {
            access: 'public',
            contentType: 'image/webp',
        })

        await prisma.profile.update({
            where: { id: profileId },
            data: { logoUrl: blob.url },
        })

        // [Z+1.fix2] Removed revalidatePath('/', 'layout') — see uploadProfileBanner comment.
        return { success: true as const, url: blob.url }
    } catch (error: any) {
        console.error('Profile logo upload error:', error)
        return { error: error?.message?.slice(0, 200) || 'Lỗi khi tải logo. Vui lòng thử lại.' }
    }
}
