'use server'

import { put } from '@vercel/blob'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
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

        revalidatePath('/dashboard/profile')
        return { success: true, url: blob.url }

    } catch (error: any) {
        console.error('Upload error:', error)
        // Return specific error for debugging
        return { error: error.message || 'Failed to upload image' }
    }
}
