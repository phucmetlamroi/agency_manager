/**
 * [Quick Create] Parse pasted cloud storage URLs into provider + folder identifiers.
 *
 * Supports:
 *   - Dropbox shared folder links (dropbox.com/scl/fo/..., dropbox.com/sh/...)
 *   - Google Drive folder links (drive.google.com/drive/folders/...)
 *
 * Returns null for unrecognized URLs.
 */

export type CloudLink =
  | { provider: 'dropbox'; folderPath: string; sharedFolderId?: string }
  | { provider: 'google_drive'; folderId: string }

/**
 * Parse a cloud storage folder URL into a structured CloudLink.
 *
 * @param url - The pasted URL string (may include query params, trailing slashes, etc.)
 * @returns CloudLink object with provider + identifier, or null if not recognized
 *
 * @example
 *   parseCloudLink('https://www.dropbox.com/scl/fo/abc123xyz/AAAdefghi?dl=0')
 *   // → { provider: 'dropbox', folderPath: '/abc123xyz', sharedFolderId: 'abc123xyz' }
 *
 *   parseCloudLink('https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ')
 *   // → { provider: 'google_drive', folderId: '1aBcDeFgHiJkLmNoPqRsTuVwXyZ' }
 */
export function parseCloudLink(url: string): CloudLink | null {
  if (!url || typeof url !== 'string') return null

  const trimmed = url.trim()
  if (!trimmed) return null

  // Try parsing as URL — handle cases where user pastes without protocol
  let parsed: URL
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '')

  // ─── Dropbox ───────────────────────────────────────────────────────
  // Patterns:
  //   https://www.dropbox.com/scl/fo/{shared_id}/{hash}?...
  //   https://www.dropbox.com/sh/{path}?...
  //   https://www.dropbox.com/home/{path}
  //   https://www.dropbox.com/scl/fi/{file_id}/... (file — NOT folder, skip)
  if (hostname === 'dropbox.com') {
    const path = parsed.pathname

    // /scl/fo/{sharedFolderId}/{hash} — new-style shared folder link
    const sclFolderMatch = path.match(/^\/scl\/fo\/([^/]+)/)
    if (sclFolderMatch) {
      const sharedFolderId = decodeURIComponent(sclFolderMatch[1])
      return {
        provider: 'dropbox',
        folderPath: '', // root of shared folder — Dropbox API uses '' for root
        sharedFolderId,
      }
    }

    // /sh/{path} — legacy shared folder link
    const shMatch = path.match(/^\/sh\/(.+?)(?:\?|$)/)
    if (shMatch) {
      const folderPath = '/' + decodeURIComponent(shMatch[1]).replace(/\/+$/, '')
      return { provider: 'dropbox', folderPath }
    }

    // /home/{path} — user's own folder link (from web UI address bar)
    const homeMatch = path.match(/^\/home\/(.+?)(?:\?|$)/)
    if (homeMatch) {
      const folderPath = '/' + decodeURIComponent(homeMatch[1]).replace(/\/+$/, '')
      return { provider: 'dropbox', folderPath }
    }

    // Plain /scl/fi/... is a FILE link, not folder — don't match
    return null
  }

  // ─── Google Drive ──────────────────────────────────────────────────
  // Patterns:
  //   https://drive.google.com/drive/folders/{folderId}
  //   https://drive.google.com/drive/folders/{folderId}?...
  //   https://drive.google.com/drive/u/0/folders/{folderId}
  if (hostname === 'drive.google.com') {
    const path = parsed.pathname

    // /drive/folders/{folderId} or /drive/u/{n}/folders/{folderId}
    const folderMatch = path.match(/\/folders\/([A-Za-z0-9_-]+)/)
    if (folderMatch) {
      return {
        provider: 'google_drive',
        folderId: folderMatch[1],
      }
    }

    return null
  }

  return null
}

/**
 * Check if a URL looks like a supported cloud storage link (quick pre-check).
 * Cheaper than full parsing — use for UI validation hints.
 */
export function isCloudStorageUrl(url: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  return lower.includes('dropbox.com') || lower.includes('drive.google.com')
}
