'use server'

import { put } from '@vercel/blob'
import { prisma } from '@/lib/db'
import { revalidatePath, revalidateTag } from 'next/cache'
import sharp from 'sharp'

export async function uploadPaymentQr(userId: string, formData: FormData) {
    try {
        const file = formData.get('file') as File
        const bankName = formData.get('bankName') as string
        const accountNum = formData.get('accountNum') as string

        if (!file) return { error: 'No file provided' }

        // 1. Validate Size (Server-side double check)
        if (file.size > 4 * 1024 * 1024) {
            return { error: 'File too large (>4MB)' }
        }

        // 2. Optimization Pipeline with Sharp
        const buffer = Buffer.from(await file.arrayBuffer())

        const optimizedBuffer = await sharp(buffer)
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
        if (!file) return { error: 'Không tìm thấy tệp tin' }

        // 1. Validate Size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            return { error: 'Dung lượng ảnh tối đa là 10MB' }
        }

        // 2. Optimization Pipeline with Sharp
        // We crop to square (512x512) to ensure it fits perfectly in circular UI components
        const buffer = Buffer.from(await file.arrayBuffer())
        const optimizedBuffer = await sharp(buffer)
            .resize(512, 512, {
                fit: 'cover',
                position: 'center'
            })
            .webp({ quality: 85 })
            .toBuffer()

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
        if (!file) return { error: 'Không tìm thấy tệp tin.' }
        if (file.size > 10 * 1024 * 1024) return { error: 'Dung lượng tối đa 10MB.' }

        const buffer = Buffer.from(await file.arrayBuffer())
        const optimizedBuffer = await sharp(buffer)
            .resize(1500, 500, { fit: 'cover', position: 'center' })
            .webp({ quality: 85 })
            .toBuffer()

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
        if (!file) return { error: 'Không tìm thấy tệp tin.' }
        if (file.size > 5 * 1024 * 1024) return { error: 'Dung lượng tối đa 5MB.' }

        const buffer = Buffer.from(await file.arrayBuffer())
        const optimizedBuffer = await sharp(buffer)
            .resize(512, 512, { fit: 'cover', position: 'center' })
            .webp({ quality: 90, lossless: false })
            .toBuffer()

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
