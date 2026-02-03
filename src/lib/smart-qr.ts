import { BrowserMultiFormatReader, NotFoundException } from '@zxing/browser'
import { Result } from '@zxing/library'

export async function smartCropQr(file: File): Promise<File> {
    return new Promise(async (resolve) => {
        try {
            const reader = new BrowserMultiFormatReader()
            const imageUrl = URL.createObjectURL(file)
            const img = new Image()

            img.onload = async () => {
                try {
                    // ZXing is powerful but needs clean input
                    // It scans the image element directly
                    const result = await reader.decodeFromImageElement(img)

                    if (result && result.getResultPoints().length > 0) {
                        const points = result.getResultPoints()

                        // Calculate Bounds from ResultPoints
                        // usually 3 points (finder patterns) or 4
                        const xCoords = points.map(p => p.getX())
                        const yCoords = points.map(p => p.getY())

                        let minX = Math.min(...xCoords)
                        let maxX = Math.max(...xCoords)
                        let minY = Math.min(...yCoords)
                        let maxY = Math.max(...yCoords)

                        // ZXing often finds the "centers" of the corner markers.
                        // We need to expand slightly to include the full marker + quiet zone.
                        // Estimate module size?
                        // Simple heuristic: The QR is likely slightly larger than the points bounding box.
                        const qrWidthEst = maxX - minX
                        const qrHeightEst = maxY - minY

                        // Expansion factor: 
                        // The points are usually top-left, top-right, bottom-left.
                        // So the "bottom-right" is missing in the bounds.
                        // We need to project the missing corner or just expand.

                        // Heuristic: Expand by ~20% ensures we cover the edges + quiet zone
                        const expansion = Math.max(40, Math.max(qrWidthEst, qrHeightEst) * 0.25)

                        minX = Math.max(0, minX - expansion)
                        minY = Math.max(0, minY - expansion)
                        maxX = Math.min(img.width, maxX + expansion)
                        maxY = Math.min(img.height, maxY + expansion)

                        // Crop
                        const cropW = maxX - minX
                        const cropH = maxY - minY

                        const canvas = document.createElement('canvas')
                        canvas.width = cropW
                        canvas.height = cropH
                        const ctx = canvas.getContext('2d')

                        if (ctx) {
                            ctx.fillStyle = '#FFFFFF'
                            ctx.fillRect(0, 0, cropW, cropH)
                            ctx.drawImage(
                                img,
                                minX, minY, cropW, cropH,
                                0, 0, cropW, cropH
                            )

                            canvas.toBlob((blob) => {
                                if (blob) {
                                    resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_zxing.webp", {
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
                        console.log('ZXing: QR not found')
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
