/**
 * [Quick Create] Pricing engine — pure function, no DB dependency.
 *
 * Calculates task price (USD) and wage (VND) from a PricingRule config + video duration.
 * Supports 4 rule types: flat, per_minute, tiered_duration, custom.
 *
 * Usage:
 *   const result = calculatePrice(rule, durationSeconds)
 *   // → { priceUSD: 45, wageVND: 450000, ruleApplied: "Dr. Marwan Tiered" }
 */

export interface PricingResult {
  priceUSD: number
  wageVND: number
  ruleApplied: string // rule name for audit trail
}

interface FlatConfig {
  priceUSD: number
  wageVND: number
}

interface PerMinuteConfig {
  ratePerMinuteUSD: number
  wagePerMinuteVND: number
  minimumUSD?: number
  minimumVND?: number
}

interface TieredDurationConfig {
  tiers: Array<{
    maxSeconds: number
    priceUSD: number
    wageVND: number
    extraPerBlock?: number // extra USD per block beyond base
    extraBlockSeconds?: number // block size in seconds
    extraWagePerBlock?: number // extra VND per block
  }>
}

interface CustomConfig {
  formula: string
  variables: Record<string, number>
}

type RuleConfig = FlatConfig | PerMinuteConfig | TieredDurationConfig | CustomConfig

/**
 * Calculate price from a PricingRule config and video duration.
 *
 * @param rule - The pricing rule with ruleType and JSON config
 * @param durationSeconds - Video duration in seconds
 * @returns PricingResult with priceUSD, wageVND, and ruleApplied name
 */
export function calculatePrice(
  rule: { ruleType: string; config: RuleConfig; name: string },
  durationSeconds: number,
): PricingResult {
  const { ruleType, config, name } = rule

  switch (ruleType) {
    case 'flat':
      return calculateFlat(config as FlatConfig, name)

    case 'per_minute':
      return calculatePerMinute(config as PerMinuteConfig, durationSeconds, name)

    case 'tiered_duration':
      return calculateTieredDuration(config as TieredDurationConfig, durationSeconds, name)

    case 'custom':
      return calculateCustom(config as CustomConfig, durationSeconds, name)

    default:
      console.warn(`[pricing-engine] Unknown ruleType "${ruleType}", falling back to 0`)
      return { priceUSD: 0, wageVND: 0, ruleApplied: `${name} (unknown type)` }
  }
}

// ─── Rule type implementations ───────────────────────────────────────────────

/**
 * Flat — fixed price per video regardless of duration.
 * Config: { priceUSD: 25, wageVND: 250000 }
 */
function calculateFlat(config: FlatConfig, name: string): PricingResult {
  return {
    priceUSD: config.priceUSD ?? 0,
    wageVND: config.wageVND ?? 0,
    ruleApplied: name,
  }
}

/**
 * Per-minute — linear pricing based on video duration.
 * Config: { ratePerMinuteUSD: 15, wagePerMinuteVND: 100000, minimumUSD?: 25, minimumVND?: 250000 }
 */
function calculatePerMinute(
  config: PerMinuteConfig,
  durationSeconds: number,
  name: string,
): PricingResult {
  const minutes = Math.ceil(durationSeconds / 60) // round up to nearest minute
  const rawUSD = minutes * (config.ratePerMinuteUSD ?? 0)
  const rawVND = minutes * (config.wagePerMinuteVND ?? 0)

  return {
    priceUSD: Math.max(rawUSD, config.minimumUSD ?? 0),
    wageVND: Math.max(rawVND, config.minimumVND ?? 0),
    ruleApplied: name,
  }
}

/**
 * Tiered duration — bracket-based pricing (like Dr. Marwan's formula).
 * Config: { tiers: [
 *   { maxSeconds: 60, priceUSD: 25, wageVND: 250000 },
 *   { maxSeconds: 120, priceUSD: 25, wageVND: 250000, extraPerBlock: 4, extraBlockSeconds: 10, extraWagePerBlock: 40000 },
 *   { maxSeconds: 300, priceUSD: 50, wageVND: 500000, extraPerBlock: 5, extraBlockSeconds: 10, extraWagePerBlock: 50000 },
 * ]}
 *
 * Logic: find the tier where duration <= maxSeconds.
 * If tier has extraPerBlock: add (duration - previousTier.maxSeconds) / extraBlockSeconds * extraPerBlock.
 */
function calculateTieredDuration(
  config: TieredDurationConfig,
  durationSeconds: number,
  name: string,
): PricingResult {
  const tiers = config.tiers ?? []
  if (tiers.length === 0) {
    return { priceUSD: 0, wageVND: 0, ruleApplied: `${name} (no tiers)` }
  }

  // Sort tiers by maxSeconds ascending to ensure correct bracket matching
  const sorted = [...tiers].sort((a, b) => a.maxSeconds - b.maxSeconds)

  // Find the matching tier (first tier where duration <= maxSeconds)
  let matchedTier = sorted[sorted.length - 1] // default to highest tier
  let previousMax = 0

  for (let i = 0; i < sorted.length; i++) {
    if (durationSeconds <= sorted[i].maxSeconds) {
      matchedTier = sorted[i]
      previousMax = i > 0 ? sorted[i - 1].maxSeconds : 0
      break
    }
    previousMax = sorted[i].maxSeconds
  }

  let priceUSD = matchedTier.priceUSD ?? 0
  let wageVND = matchedTier.wageVND ?? 0

  // Apply extra blocks if configured
  if (matchedTier.extraPerBlock && matchedTier.extraBlockSeconds) {
    const overflowSeconds = Math.max(0, durationSeconds - previousMax)
    const extraBlocks = Math.ceil(overflowSeconds / matchedTier.extraBlockSeconds)
    priceUSD += extraBlocks * matchedTier.extraPerBlock
    wageVND += extraBlocks * (matchedTier.extraWagePerBlock ?? 0)
  }

  return { priceUSD, wageVND, ruleApplied: name }
}

/**
 * Safe arithmetic evaluator — recursive-descent parser, NO eval()/Function().
 * Grammar: numbers, + - * / %, unary +/-, parentheses, and functions
 * ceil/floor/round/abs (1 arg), min/max (>=2 args). Any other identifier or
 * character throws → caller rejects the formula. Cannot reach globals.
 */
function safeEvalArithmetic(input: string): number {
  const src = input.trim()
  const tokens: string[] = []
  // Sticky tokenizer: number | identifier | single operator/paren/comma, skipping whitespace.
  const re = /\s*([0-9]*\.?[0-9]+|[a-zA-Z_][a-zA-Z0-9_]*|[+\-*/%(),])/y
  let pos = 0
  while (pos < src.length) {
    re.lastIndex = pos
    const m = re.exec(src)
    if (!m) throw new Error(`Unexpected character near "${src.slice(pos, pos + 8)}"`)
    tokens.push(m[1])
    pos = re.lastIndex
  }

  const FN1: Record<string, (x: number) => number> = {
    ceil: Math.ceil, floor: Math.floor, round: Math.round, abs: Math.abs,
  }
  const FN_N: Record<string, (...a: number[]) => number> = { min: Math.min, max: Math.max }

  let i = 0
  const peek = () => tokens[i]
  const eat = () => tokens[i++]
  const expect = (t: string) => { if (eat() !== t) throw new Error(`Expected "${t}"`) }

  function parseExpr(): number {
    let v = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = eat()
      const r = parseTerm()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  function parseTerm(): number {
    let v = parseFactor()
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = eat()
      const r = parseFactor()
      v = op === '*' ? v * r : op === '/' ? v / r : v % r
    }
    return v
  }
  function parseFactor(): number {
    const t = peek()
    if (t === undefined) throw new Error('Unexpected end of formula')
    if (t === '-') { eat(); return -parseFactor() }
    if (t === '+') { eat(); return parseFactor() }
    if (t === '(') { eat(); const v = parseExpr(); expect(')'); return v }
    if (/^[0-9]*\.?[0-9]+$/.test(t)) { eat(); return parseFloat(t) }
    if (/^[a-zA-Z_]/.test(t)) {
      const name = eat()
      expect('(')
      const args: number[] = [parseExpr()]
      while (peek() === ',') { eat(); args.push(parseExpr()) }
      expect(')')
      if (FN1[name]) {
        if (args.length !== 1) throw new Error(`${name}() takes 1 argument`)
        return FN1[name](args[0])
      }
      if (FN_N[name]) return FN_N[name](...args)
      throw new Error(`Unknown function "${name}"`)
    }
    throw new Error(`Unexpected token "${t}"`)
  }

  const result = parseExpr()
  if (i !== tokens.length) throw new Error(`Trailing tokens after "${tokens[i]}"`)
  return result
}

/**
 * Custom — user-defined formula (advanced, future).
 * Config: { formula: "base + ceil(duration/60) * rate", variables: { base: 25, rate: 10 } }
 *
 * SECURITY: Formula evaluation uses safeEvalArithmetic (recursive-descent parser).
 * No eval(), no Function(), no arbitrary code execution.
 */
function calculateCustom(
  config: CustomConfig,
  durationSeconds: number,
  name: string,
): PricingResult {
  try {
    const { formula, variables } = config
    if (!formula || !variables) {
      return { priceUSD: 0, wageVND: 0, ruleApplied: `${name} (invalid custom config)` }
    }

    // Replace variable names with their values
    let expression = formula
    expression = expression.replace(/\bduration\b/g, String(durationSeconds))
    for (const [key, value] of Object.entries(variables)) {
      expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), String(value))
    }

    // Safe evaluation: parse arithmetic ourselves — NO eval()/Function().
    // Only numbers, + - * / %, unary -, parentheses, ceil/floor/round/abs/min/max.
    let numResult: number
    try {
      numResult = safeEvalArithmetic(expression)
    } catch (evalErr) {
      console.warn(`[pricing-engine] Unsafe/invalid custom formula rejected: "${formula}"`, evalErr)
      return { priceUSD: 0, wageVND: 0, ruleApplied: `${name} (unsafe formula)` }
    }
    if (typeof numResult !== 'number' || !isFinite(numResult)) numResult = 0

    return {
      priceUSD: Math.max(0, numResult),
      wageVND: 0, // custom formulas compute USD only; VND requires separate formula or manual entry
      ruleApplied: name,
    }
  } catch (err) {
    console.warn(`[pricing-engine] Custom formula error:`, err)
    return { priceUSD: 0, wageVND: 0, ruleApplied: `${name} (formula error)` }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Classify video as Short form or Long form based on duration.
 * Threshold: 120 seconds (2 minutes) — confirmed by user.
 *
 * @param durationSeconds - Video duration in seconds
 * @returns "Short form" or "Long form"
 */
export function classifyVideoType(durationSeconds: number): 'Short form' | 'Long form' {
  return durationSeconds <= 120 ? 'Short form' : 'Long form'
}

/**
 * Format duration seconds to human-readable string.
 * @param seconds - Duration in seconds
 * @returns Formatted string like "2:30" or "1:05:30"
 */
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${mins}:${String(secs).padStart(2, '0')}`
}
