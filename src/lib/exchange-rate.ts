/**
 * Server-side Exchange Rate utility
 * Fetches real-time USD/VND rate from multiple sources with caching
 * Cache TTL: 30 minutes (avoids hitting API limits)
 */

let cachedRate: number | null = null
let cacheTimestamp: number = 0
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

const FALLBACK_RATE = 26300 // Updated fallback to match current market

/**
 * Fetches the current USD to VND exchange rate.
 * Tries multiple API sources for maximum reliability.
 * Results are cached for 30 minutes server-side.
 */
export async function getExchangeRate(): Promise<number> {
    const now = Date.now()

    // Return cached rate if still fresh
    if (cachedRate && (now - cacheTimestamp) < CACHE_TTL) {
        return cachedRate
    }

    // Try multiple sources in order of accuracy
    const sources = [
        fetchFromExchangeRateAPI,
        fetchFromFrankfurter,
        fetchFromOpenERAPI,
    ]

    for (const fetchFn of sources) {
        try {
            const rate = await fetchFn()
            if (rate && rate > 20000 && rate < 40000) { // Sanity check
                cachedRate = Math.round(rate)
                cacheTimestamp = now
                console.log(`[ExchangeRate] Fetched: ${cachedRate} VND/USD`)
                return cachedRate
            }
        } catch (e) {
            // Try next source
        }
    }

    // All sources failed, use fallback
    console.warn(`[ExchangeRate] All sources failed, using fallback: ${FALLBACK_RATE}`)
    return FALLBACK_RATE
}

// Source 1: ExchangeRate-API (free, no key, updates daily)
async function fetchFromExchangeRateAPI(): Promise<number> {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
        next: { revalidate: 1800 } // Next.js cache 30 min
    })
    const data = await res.json()
    return data?.rates?.VND
}

// Source 2: Frankfurter (ECB data, completely free, no key)
async function fetchFromFrankfurter(): Promise<number> {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=VND', {
        next: { revalidate: 1800 }
    })
    const data = await res.json()
    return data?.rates?.VND
}

// Source 3: Open Exchange Rates API (backup)
async function fetchFromOpenERAPI(): Promise<number> {
    const res = await fetch('https://latest.currency-api.pages.dev/v1/currencies/usd.json', {
        next: { revalidate: 1800 }
    })
    const data = await res.json()
    return data?.usd?.vnd
}
