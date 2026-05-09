import { ListChecks } from "lucide-react"

interface Props {
    total: number
    progress: number
    completed: number
}

const NP = {
    surface: "#0A0A0A",
    border: "rgba(139,92,246,0.15)",
    accent: "#8B5CF6",
    textPrimary: "#FFFFFF",
    textSecondary: "#A1A1AA",
    textMuted: "#71717A",
}

/**
 * Total Tasks widget — count + status breakdown badges.
 * Figma: 314x156 (stacked bottom-right). Mirrors NetSalary card style.
 */
export default function WidgetTotalTasks({ total, progress, completed }: Props) {
    return (
        <div
            className="relative overflow-hidden rounded-[20px] p-5 flex flex-col justify-between h-full"
            style={{
                background: NP.surface,
                border: `1px solid ${NP.border}`,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
            }}
        >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: NP.textMuted }}>
                        Total Tasks
                    </span>
                    <span className="text-[28px] font-extrabold leading-tight text-white">
                        {total}
                    </span>
                </div>
                <span
                    className="flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{ background: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.2)" }}
                >
                    <ListChecks className="w-4 h-4" style={{ color: NP.accent }} />
                </span>
            </div>

            {/* Status pills */}
            <div className="flex items-center gap-2 flex-wrap mt-2">
                <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{
                        background: "rgba(99,102,241,0.10)",
                        color: "#818CF8",
                        border: "1px solid rgba(99,102,241,0.20)",
                    }}
                >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#818CF8" }} />
                    {progress} Progress
                </span>
                <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{
                        background: "rgba(16,185,129,0.10)",
                        color: "#34D399",
                        border: "1px solid rgba(16,185,129,0.20)",
                    }}
                >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399" }} />
                    {completed} Completed
                </span>
            </div>
        </div>
    )
}
