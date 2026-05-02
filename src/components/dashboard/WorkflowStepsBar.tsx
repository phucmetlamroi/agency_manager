"use client"

import { motion } from "framer-motion"
import { CheckCircle2 } from "lucide-react"

const STEPS = [
    { key: "assignee", label: "Assignee", desc: "Giao việc" },
    { key: "progress", label: "In Progress", desc: "Đang làm" },
    { key: "revise",   label: "Revise",     desc: "Chỉnh sửa" },
    { key: "complete", label: "Complete",   desc: "Hoàn tất" },
]

interface Props {
    counts: {
        assignee: number
        progress: number
        revise: number
        complete: number
    }
}

const STEP_COLORS = [
    "from-indigo-500 to-violet-500",
    "from-amber-500 to-orange-500",
    "from-cyan-500 to-teal-500",
    "from-emerald-500 to-green-500",
]

const STEP_BG = [
    "bg-indigo-500/10 border-indigo-500/20",
    "bg-amber-500/10 border-amber-500/20",
    "bg-cyan-500/10 border-cyan-500/20",
    "bg-emerald-500/10 border-emerald-500/20",
]

const STEP_TEXT = [
    "text-indigo-400",
    "text-amber-400",
    "text-cyan-400",
    "text-emerald-400",
]

export function WorkflowStepsBar({ counts }: Props) {
    const vals = [counts.assignee, counts.progress, counts.revise, counts.complete]
    const total = vals.reduce((a, b) => a + b, 0) || 1

    return (
        <div className="rounded-2xl border border-white/8 bg-zinc-950/60 backdrop-blur-md p-4 flex items-stretch gap-0">
            {STEPS.map((step, i) => {
                const count = vals[i]
                const width = Math.round((count / total) * 100)
                const isLast = i === STEPS.length - 1

                return (
                    <motion.div
                        key={step.key}
                        initial={{ opacity: 0, scaleX: 0.8 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className={`flex-1 flex flex-col items-center gap-2 py-2 px-4 ${!isLast ? "border-r border-white/5" : ""}`}
                    >
                        <div className={`rounded-full w-8 h-8 flex items-center justify-center bg-gradient-to-br ${STEP_COLORS[i]} shadow-sm`}>
                            <CheckCircle2 className="w-4 h-4 text-white" />
                        </div>
                        <div className="text-center">
                            <p className={`text-sm font-bold ${STEP_TEXT[i]}`}>{count}</p>
                            <p className="text-[11px] text-zinc-400">{step.label}</p>
                        </div>
                        {/* Mini progress bar */}
                        <div className="w-full h-1 rounded-full bg-zinc-800/80 overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${width}%` }}
                                transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
                                className={`h-full rounded-full bg-gradient-to-r ${STEP_COLORS[i]}`}
                            />
                        </div>
                        <p className="text-[10px] text-zinc-600">{width}%</p>
                    </motion.div>
                )
            })}
        </div>
    )
}
