// [Review module P4.2] Frame-accurate timecode helpers (PRD FR-E02, KIEN-TRUC §4.3).
// SMPTE HH:MM:SS:FF is derived from a FRAME integer + the version's rational fps
// (e.g. 30000/1001 = 29.97) — never from float seconds, so 29.97 non-drop renders
// exactly. `requestVideoFrameCallback().mediaTime` gives the precise presentation
// time of the displayed frame; we map time↔frame with this fps.

export interface Fps {
    num: number
    den: number
}

/** Exact fps as a float (30000/1001 → 29.97002997…). */
export function fpsFloat(fps: Fps): number {
    return fps.num / fps.den
}

/** Nominal integer fps for the SMPTE frame field (29.97 → 30, 23.976 → 24). */
export function nominalFps(fps: Fps): number {
    return Math.max(1, Math.round(fps.num / fps.den))
}

function pad(n: number, width = 2): string {
    return String(Math.max(0, Math.floor(n))).padStart(width, '0')
}

/** Frame integer → SMPTE `HH:MM:SS:FF` (non-drop). */
export function frameToSmpte(frame: number, fps: Fps): string {
    const nominal = nominalFps(fps)
    const f = Math.max(0, Math.floor(frame))
    const ff = f % nominal
    const totalSec = Math.floor(f / nominal)
    const ss = totalSec % 60
    const mm = Math.floor(totalSec / 60) % 60
    const hh = Math.floor(totalSec / 3600)
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`
}

/** Plain wall-clock `M:SS` / `H:MM:SS` (images, or a video whose fps is unknown). */
export function formatClock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds))
    const ss = s % 60
    const mm = Math.floor(s / 60) % 60
    const hh = Math.floor(s / 3600)
    return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`
}

/** Presentation time (s) → nearest frame index. */
export function timeToFrame(seconds: number, fps: Fps): number {
    return Math.max(0, Math.round(seconds * fpsFloat(fps)))
}

/** Frame index → a seek target landing MID-frame (avoids boundary rounding to the
 *  previous/next frame — the standard frame-step technique). */
export function frameToSeekTime(frame: number, fps: Fps): number {
    return (Math.max(0, Math.floor(frame)) + 0.5) / fpsFloat(fps)
}

/** Total frame count of a clip from its duration (ms). */
export function frameCount(durationMs: number, fps: Fps): number {
    return Math.max(0, Math.round((durationMs / 1000) * fpsFloat(fps)))
}

/** Milliseconds ↔ frame (comment timecodes are stored in ms; the API speaks frames). */
export function msToFrame(ms: number, fps: Fps): number {
    return Math.max(0, Math.round((ms * fps.num) / (1000 * fps.den)))
}
export function frameToMs(frame: number, fps: Fps): number {
    return Math.round((Math.max(0, Math.floor(frame)) * 1000 * fps.den) / fps.num)
}
