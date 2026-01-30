export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

// Standard benchmark in seconds (e.g., 4 hours for Short Form)
const STANDARD_TIME_SECONDS = 4 * 60 * 60

export function calculateRiskLevel(accumulatedSeconds: number, avgCompletionTime?: number): RiskLevel {
    const benchmark = avgCompletionTime && avgCompletionTime > 0 ? avgCompletionTime : STANDARD_TIME_SECONDS

    if (accumulatedSeconds > benchmark * 1.5) {
        return 'HIGH'
    } else if (accumulatedSeconds > benchmark * 1.0) {
        return 'MEDIUM'
    }

    return 'LOW'
}

export function getRiskColor(level: RiskLevel): string {
    switch (level) {
        case 'HIGH':
            return 'text-red-500 bg-red-900/20 border-red-500/30'
        case 'MEDIUM':
            return 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30'
        case 'LOW':
            return 'text-green-400 bg-green-900/20 border-green-500/30'
    }
}

export function getRiskLabel(level: RiskLevel): string {
    switch (level) {
        case 'HIGH': return 'Nguy cơ cao'
        case 'MEDIUM': return 'Cần chú ý'
        case 'LOW': return 'Ổn định'
    }
}
