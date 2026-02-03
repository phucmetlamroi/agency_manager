import jsQR from 'jsqr'

export async function smartCropQr(file: File): Promise<File> {
    return new Promise((resolve) => {
        const reader = new FileReader()

        reader.onload = (e) => {
            const img = new Image()
            img.onload = () => {
                // 1. Setup Canvas for Processing
                const canvas = document.createElement('canvas')
                const MAX_DIM = 1200
                let width = img.width
                let height = img.height

                // Scale down if too big (Simulates "reading" like a camera, improved performance)
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

                // Draw image (scaled)
                ctx.drawImage(img, 0, 0, width, height)

                // 2. Scan
                const imageData = ctx.getImageData(0, 0, width, height)
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                })

                // 3. Logic
                if (code) {
                    // Logic: Coordinate mapping back to Original Image Size if we scaled?
                    // Actually, let's just crop from the *scaled* canvas. 
                    // It's usually high enough res for a QR code unless user prints it huge.
                    // But for "Payment QR", we want high quality.
                    // Better approach: Calculate relative coordinates, then crop from ORIGINAL image.

                    const loc = code.location
                    const xCoords = [loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomRightCorner.x, loc.bottomLeftCorner.x]
                    const yCoords = [loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomRightCorner.y, loc.bottomLeftCorner.y]

                    const minX = Math.min(...xCoords)
                    const maxX = Math.max(...xCoords)
                    const minY = Math.min(...yCoords)
                    const maxY = Math.max(...yCoords)

                    // Bounding Box on SCALED image
                    const qrW_scaled = maxX - minX
                    const qrH_scaled = maxY - minY

                    // Padding: Tighter (User request "vừa khít")
                    // Use 20px or 5% whatever is larger
                    const padding = Math.max(20, Math.min(qrW_scaled, qrH_scaled) * 0.05)

                    // Relative coordinates (0 to 1)
                    const relX = (minX - padding) / width
                    const relY = (minY - padding) / height
                    const relW = (qrW_scaled + padding * 2) / width
                    const relH = (qrH_scaled + padding * 2) / height

                    // Map to Original Image Coordinates
                    const origX = Math.max(0, Math.floor(relX * img.width))
                    const origY = Math.max(0, Math.floor(relY * img.height))
                    const origW = Math.min(img.width - origX, Math.ceil(relW * img.width))
                    const origH = Math.min(img.height - origY, Math.ceil(relH * img.height))

                    // 4. Crop from ORIGINAL high-res image
                    const cropCanvas = document.createElement('canvas')
                    cropCanvas.width = origW
                    cropCanvas.height = origH
                    const cropCtx = cropCanvas.getContext('2d')

                    if (cropCtx) {
                        // White background for safety
                        cropCtx.fillStyle = '#FFFFFF'
                        cropCtx.fillRect(0, 0, origW, origH)

                        cropCtx.drawImage(
                            img,
                            origX, origY, origW, origH, // Source (Original)
                            0, 0, origW, origH          // Dest
                        )

                        cropCanvas.toBlob((blob) => {
                            if (blob) {
                                const croppedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_cropped.webp", {
                                    type: 'image/webp',
                                    lastModified: Date.now()
                                })
                                resolve(croppedFile)
                            } else {
                                resolve(file)
                            }
                        }, 'image/webp', 0.95)
                    } else {
                        resolve(file)
                    }

                } else {
                    console.log('SmartQR: No QR found, returning original.')
                    resolve(file)
                }
            }
            img.onerror = () => resolve(file)

            if (typeof e.target?.result === 'string') {
                img.src = e.target.result
            } else {
                resolve(file)
            }
        }
        reader.onerror = () => resolve(file)
        reader.readAsDataURL(file)
    })
}
