import { BrowserMultiFormatReader } from '@zxing/browser'
import { Result, DecodeHintType, BarcodeFormat, NotFoundException } from '@zxing/library'

export async function smartCropQr(file: File): Promise<File> {
    return new Promise(async (resolve) => {
        try {
            // Setup Hints for "Try Harder" -> Better detection on complex images
            const hints = new Map()
            hints.set(DecodeHintType.TRY_HARDER, true)
            hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE])

            const reader = new BrowserMultiFormatReader(hints)
            const imageUrl = URL.createObjectURL(file)
            const img = new Image()

            img.onload = async () => {
                try {
                    // Decide from Image Element
                    const result = await reader.decodeFromImageElement(img)

                    if (result && result.getResultPoints().length > 0) {
                        const points = result.getResultPoints()

                        const xCoords = points.map(p => p.getX())
                        const yCoords = points.map(p => p.getY())

                        let minX = Math.min(...xCoords)
                        let maxX = Math.max(...xCoords)
                        let minY = Math.min(...yCoords)
                        let maxY = Math.max(...yCoords)

                        // Calculate Dimensions
                        const qrW = maxX - minX
                        const qrH = maxY - minY

                        // Padding Strategy: INCREASED to 35% (Safe margin for any angle)
                        // Min padding: 60px
                        const padding = Math.max(60, Math.max(qrW, qrH) * 0.35)

                        // Apply Padding & Clamp to Image Bounds
                        minX = Math.max(0, minX - padding)
                        minY = Math.max(0, minY - padding)
                        maxX = Math.min(img.width, maxX + padding)
                        maxY = Math.min(img.height, maxY + padding)

                        const cropW = maxX - minX
                        const cropH = maxY - minY

                        // Draw to new Canvas
                        const canvas = document.createElement('canvas')
                        canvas.width = cropW
                        canvas.height = cropH
                        const ctx = canvas.getContext('2d')

                        if (ctx) {
                            // White Background (seamless look)
                            ctx.fillStyle = '#FFFFFF'
                            ctx.fillRect(0, 0, cropW, cropH)

                            // Draw Crop
                            ctx.drawImage(
                                img,
                                minX, minY, cropW, cropH,
                                0, 0, cropW, cropH
                            )

                            canvas.toBlob((blob) => {
                                if (blob) {
                                    resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_smartcrop.webp", {
                                        type: 'image/webp',
                                        lastModified: Date.now()
                                    }))
                                } else {
                                    resolve(file)
                                }
                            }, 'image/webp', 1.0)
                        } else {
                            resolve(file)
                        }
                    } else {
                        console.log('ZXing: No points found')
                        resolve(file)
                    }
                } catch (err) {
                    if (err instanceof NotFoundException) {
                        console.log('ZXing: QR not found (fallback to original)')
                    } else {
                        console.error('ZXing Error:', err)
                    }
                    resolve(file)
                } finally {
                    URL.revokeObjectURL(imageUrl)
                }
            }
            img.onerror = () => resolve(file)
            img.src = imageUrl

        } catch (error) {
            console.error('Setup Error:', error)
            resolve(file)
        }
    })
}
