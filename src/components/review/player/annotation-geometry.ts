// [Review module P4.4] Pure geometry for the annotation overlay (PRD FR-E05,
// DATA-MODEL §6). Annotation coordinates are NORMALIZED 0..1 against the ORIGINAL
// media frame so the same drawing renders correctly at any player size. The tricky
// bit is the CONTENT box: the <video>/<img> is letterboxed (object-fit: contain)
// inside the stage, so the drawable rect is a centred sub-rect of the container —
// never the whole container. Everything here is framework-free + side-effect-free.

/** The letterboxed media rect inside the stage container, in container pixels. */
export interface ContentBox {
    left: number
    top: number
    width: number
    height: number
}

/**
 * object-fit: contain — the largest rect with the media's intrinsic aspect that
 * fits inside (cw × ch), centred. Returns null when any dimension is non-positive
 * (metadata not loaded yet) so callers can skip rendering.
 */
export function containedBox(cw: number, ch: number, iw: number, ih: number): ContentBox | null {
    if (cw <= 0 || ch <= 0 || iw <= 0 || ih <= 0) return null
    const scale = Math.min(cw / iw, ch / ih)
    const width = iw * scale
    const height = ih * scale
    return { left: (cw - width) / 2, top: (ch - height) / 2, width, height }
}

export function clamp01(n: number): number {
    return n < 0 ? 0 : n > 1 ? 1 : n
}

/**
 * The SVG viewBox height for a 1000-unit-wide coordinate space matching the box's
 * aspect. Rendering in this space means `strokeWidth={size}` maps 1:1 to the
 * annotation `size` unit (1/1000-of-width), and normalized points map as
 * x·1000 / y·VBH — see AnnotationCanvas.
 */
export function viewBoxHeight(box: ContentBox): number {
    return box.width > 0 ? (1000 * box.height) / box.width : 1000
}

/**
 * Arrowhead as a filled triangle (3 points in viewBox units) at (x2,y2), pointing
 * away from (x1,y1). `sizeUnits` is the stroke width; the head scales with it but is
 * clamped so tiny strokes still get a visible head and huge strokes don't explode.
 */
export function arrowHeadPoints(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    sizeUnits: number,
): string {
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const head = Math.min(60, Math.max(14, sizeUnits * 4)) // viewBox units
    const wing = head * 0.6
    // base point back along the shaft, then two wings perpendicular
    const bx = x2 - ux * head
    const by = y2 - uy * head
    const px = -uy
    const py = ux
    const p1 = `${x2.toFixed(2)},${y2.toFixed(2)}`
    const p2 = `${(bx + px * wing).toFixed(2)},${(by + py * wing).toFixed(2)}`
    const p3 = `${(bx - px * wing).toFixed(2)},${(by - py * wing).toFixed(2)}`
    return `${p1} ${p2} ${p3}`
}
