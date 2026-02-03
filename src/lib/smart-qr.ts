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

// Helper: Red Channel Filter (For "Red" background QRs like VietQR Tet theme)
function toRedChannel(imageData: ImageData): ImageData {
    const d = imageData.data
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i]
        // Use Red channel as intensity
        // Red (255,0,0) -> 255 (White). Black (0,0,0) -> 0 (Black).
        d[i] = d[i + 1] = d[i + 2] = r
    }
    return imageData
}

// Helper: Binarize (Black & White)
function toBinary(imageData: ImageData, threshold = 128): ImageData {
    const d = imageData.data
    for (let i = 0; i < d.length; i += 4) {
        const v = d[i] // Assumes already grayscale
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
                const MAX_DIM = 2000 // Increased resolution for better detection
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

                ctx.drawImage(img, 0, 0, width, height)

                let code = null

                // --- PASS 1: Dry Run (Clean QR) ---
                try {
                    const data = ctx.getImageData(0, 0, width, height)
                    code = jsQR(data.data, width, height, { inversionAttempts: "attemptBoth" })
                    if (code) console.log('QR Found: Pass 1 (Normal)')
                } catch (e) { }

                // --- PASS 2: Red Filter (Excellent for Tet/Red Backgrounds) ---
                if (!code) {
                    try {
                        ctx.drawImage(img, 0, 0, width, height)
                        const data = toRedChannel(ctx.getImageData(0, 0, width, height))
                        code = jsQR(data.data, width, height, { inversionAttempts: "attemptBoth" })
                        if (code) console.log('QR Found: Pass 2 (Red Filter)')
                    } catch (e) { }
                }

                // --- PASS 3: Grayscale ---
                if (!code) {
                    try {
                        ctx.drawImage(img, 0, 0, width, height)
                        const data = toGrayscale(ctx.getImageData(0, 0, width, height))
                        code = jsQR(data.data, width, height, { inversionAttempts: "attemptBoth" })
                        if (code) console.log('QR Found: Pass 3 (Grayscale)')
                    } catch (e) { }
                }

                // --- PASS 4: Aggressive Binarization ---
                if (!code) {
                    const thresholds = [100, 160, 60] // Try Mid, High, Low
                    for (const t of thresholds) {
                        if (code) break
                        try {
                            // Try Binarizing the Red Channel first (often best signal)
                            ctx.drawImage(img, 0, 0, width, height)
                            const redData = toRedChannel(ctx.getImageData(0, 0, width, height))
                            const binData = toBinary(redData, t)
                            code = jsQR(binData.data, width, height, { inversionAttempts: "attemptBoth" })
                            if (code) console.log(`QR Found: Pass 4 (Red Binary T=${t})`)
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
                    const padding = Math.max(30, Math.min(qrW_scaled, qrH_scaled) * 0.1)

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
                    // Ensure sensible dimensions
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
                    console.log('SmartQR: No QR found, returning original.')
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
