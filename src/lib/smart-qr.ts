import jsQR from 'jsqr'

// Helper: Convert to Grayscale
function toGrayscale(imageData: ImageData): ImageData {
    const d = imageData.data
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i]
        const g = d[i + 1]
        const b = d[i + 2]
        // Standard Luminance
        const v = 0.2126 * r + 0.7152 * g + 0.0722 * b
        d[i] = d[i + 1] = d[i + 2] = v
    }
    return imageData
}

// Helper: Binarize (Black & White)
function toBinary(imageData: ImageData, threshold = 128): ImageData {
    const d = imageData.data
    for (let i = 0; i < d.length; i += 4) {
        // Simple luminance
        const v = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
        const bin = v >= threshold ? 255 : 0
        d[i] = d[i + 1] = d[i + 2] = bin
    }
    return imageData
}

export async function smartCropQr(file: File): Promise<File> {
    return new Promise((resolve) => {
        const reader = new FileReader()

        reader.onload = (e) => {
            const img = new Image()
            img.onload = () => {
                // 1. Setup Canvas
                const canvas = document.createElement('canvas')
                const MAX_DIM = 1200 // Keep high res for quality cropping
                let width = img.width
                let height = img.height

                if (width > MAX_DIM || height > MAX_DIM) {
                    const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
                    width = Math.floor(width * ratio)
                    height = Math.floor(height * ratio)
                }

                canvas.width = width
                canvas.height = height
                const ctx = canvas.getContext('2d', { willReadFrequently: true })

                if (!ctx) {
                    resolve(file)
                    return
                }

                // Draw Original
                ctx.drawImage(img, 0, 0, width, height)

                let code = null
                let usedImageData = null

                // --- PASS 1: Normal Scan (Result: usually works for clean QRs) ---
                try {
                    const originalData = ctx.getImageData(0, 0, width, height)
                    code = jsQR(originalData.data, width, height, { inversionAttempts: "attemptBoth" })
                    if (code) console.log('QR Found in Pass 1 (Normal)')
                } catch (e) { }

                // --- PASS 2: Grayscale (Result: helps with colored QRs) ---
                if (!code) {
                    try {
                        // Refresh data
                        ctx.drawImage(img, 0, 0, width, height)
                        const grayData = toGrayscale(ctx.getImageData(0, 0, width, height))
                        code = jsQR(grayData.data, width, height, { inversionAttempts: "attemptBoth" })
                        if (code) console.log('QR Found in Pass 2 (Grayscale)')
                    } catch (e) { }
                }

                // --- PASS 3: Binarization (Result: helps with low contrast/fancy backgrounds) ---
                if (!code) {
                    // Try a few thresholds
                    const thresholds = [100, 150]
                    for (const t of thresholds) {
                        if (code) break;
                        try {
                            ctx.drawImage(img, 0, 0, width, height)
                            const binData = toBinary(ctx.getImageData(0, 0, width, height), t)
                            code = jsQR(binData.data, width, height, { inversionAttempts: "attemptBoth" })
                            if (code) console.log(`QR Found in Pass 3 (Binary T=${t})`)
                        } catch (e) { }
                    }
                }

                // Found?
                if (code) {
                    const loc = code.location
                    const xCoords = [loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomRightCorner.x, loc.bottomLeftCorner.x]
                    const yCoords = [loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomRightCorner.y, loc.bottomLeftCorner.y]

                    const minX = Math.min(...xCoords)
                    const maxX = Math.max(...xCoords)
                    const minY = Math.min(...yCoords)
                    const maxY = Math.max(...yCoords)

                    const qrW_scaled = maxX - minX
                    const qrH_scaled = maxY - minY

                    // Padding: 20px relative to scaled image
                    const padding = Math.max(20, Math.min(qrW_scaled, qrH_scaled) * 0.1)

                    const relX = (minX - padding) / width
                    const relY = (minY - padding) / height
                    const relW = (qrW_scaled + padding * 2) / width
                    const relH = (qrH_scaled + padding * 2) / height

                    // Map to ORIGINAL
                    const origX = Math.max(0, Math.floor(relX * img.width))
                    const origY = Math.max(0, Math.floor(relY * img.height))
                    const origW = Math.min(img.width - origX, Math.ceil(relW * img.width))
                    const origH = Math.min(img.height - origY, Math.ceil(relH * img.height))

                    const cropCanvas = document.createElement('canvas')
                    cropCanvas.width = origW
                    cropCanvas.height = origH
                    const cropCtx = cropCanvas.getContext('2d')

                    if (cropCtx) {
                        cropCtx.fillStyle = '#FFFFFF'
                        cropCtx.fillRect(0, 0, origW, origH)
                        cropCtx.drawImage(img, origX, origY, origW, origH, 0, 0, origW, origH)

                        cropCanvas.toBlob((blob) => {
                            if (blob) {
                                const croppedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_smartcrop.webp", {
                                    type: 'image/webp',
                                    lastModified: Date.now()
                                })
                                resolve(croppedFile)
                            } else {
                                resolve(file)
                            }
                        }, 'image/webp', 1.0)
                    } else {
                        resolve(file)
                    }
                } else {
                    console.log('SmartQR: Failed all passes.')
                    resolve(file)
                }
            }
            img.onerror = () => resolve(file)
            if (typeof e.target?.result === 'string') img.src = e.target.result
            else resolve(file)
        }
        reader.onerror = () => resolve(file)
        reader.readAsDataURL(file)
    })
}
