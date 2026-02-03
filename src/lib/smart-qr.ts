import jsQR from 'jsqr'

export async function smartCropQr(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            const img = new Image()
            img.onload = () => {
                // 1. Create Canvas & Draw Image
                const canvas = document.createElement('canvas')
                const ctx = canvas.getContext('2d')
                if (!ctx) {
                    resolve(file) // Fallback
                    return
                }

                canvas.width = img.width
                canvas.height = img.height
                ctx.drawImage(img, 0, 0)

                // 2. Scan for QR
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                })

                // 3. Logic: Hit or Miss
                if (code) {
                    // Found QR! Calculate Bounding Box
                    const loc = code.location

                    // Get extrema
                    const xCoords = [loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomRightCorner.x, loc.bottomLeftCorner.x]
                    const yCoords = [loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomRightCorner.y, loc.bottomLeftCorner.y]

                    const minX = Math.min(...xCoords)
                    const maxX = Math.max(...xCoords)
                    const minY = Math.min(...yCoords)
                    const maxY = Math.max(...yCoords)

                    // Add Padding (Quiet Zone) - ~10% of QR size or min 30px
                    const qrWidth = maxX - minX
                    const qrHeight = maxY - minY
                    const padding = Math.max(30, Math.min(qrWidth, qrHeight) * 0.15)

                    // Calculate Crop Region (Clamped to image bounds)
                    const cropX = Math.max(0, Math.floor(minX - padding))
                    const cropY = Math.max(0, Math.floor(minY - padding))
                    const cropW = Math.min(canvas.width - cropX, Math.ceil(qrWidth + padding * 2))
                    const cropH = Math.min(canvas.height - cropY, Math.ceil(qrHeight + padding * 2))

                    // 4. Crop
                    const cropCanvas = document.createElement('canvas')
                    cropCanvas.width = cropW
                    cropCanvas.height = cropH
                    const cropCtx = cropCanvas.getContext('2d')

                    if (cropCtx) {
                        cropCtx.fillStyle = '#FFFFFF' // White background rule
                        cropCtx.fillRect(0, 0, cropW, cropH)
                        cropCtx.drawImage(
                            canvas,
                            cropX, cropY, cropW, cropH, // Source
                            0, 0, cropW, cropH          // Destination
                        )

                        // 5. Convert back to File
                        cropCanvas.toBlob((blob) => {
                            if (blob) {
                                const croppedFile = new File([blob], file.name, {
                                    type: 'image/webp', // Optimize format
                                    lastModified: Date.now()
                                })
                                resolve(croppedFile)
                            } else {
                                resolve(file) // Fallback
                            }
                        }, 'image/webp', 0.95)
                    } else {
                        resolve(file)
                    }

                } else {
                    // No QR found, return original
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
