"use client"

import { useState, useRef, useEffect } from "react"
import { LayoutGrid, ChevronDown, Check, Plus, Briefcase, Video, Share2, Banknote } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

const WORKSPACES = [
  { name: "Main Workspace", desc: "Production team", icon: Briefcase },
  { name: "Video Editing", desc: "Post-production", icon: Video },
  { name: "Social Media", desc: "Content & scheduling", icon: Share2 },
  { name: "Finance Ops", desc: "Invoicing & payroll", icon: Banknote },
]

interface DashboardActionBarProps {
  workspaceId: string
  onAddTask: () => void
}

export default function DashboardActionBar({ workspaceId, onAddTask }: DashboardActionBarProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Click-outside detection
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  const activeWorkspace = WORKSPACES[activeIndex]

  return (
    <div className="flex flex-row items-center justify-between">
      {/* LEFT: Workspace Switcher */}
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.04]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
            <LayoutGrid className="h-4 w-4 text-indigo-400" />
          </div>
          <span className="text-sm font-semibold text-zinc-100">
            {activeWorkspace.name}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="absolute left-0 top-full z-50 mt-2 w-[260px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[rgba(24,24,27,0.95)] shadow-[0_16px_48px_rgba(0,0,0,0.50)] backdrop-blur-[20px]"
            >
              <div className="p-2">
                <p className="px-2.5 pb-2 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-600">
                  Workspaces
                </p>

                {WORKSPACES.map((ws, i) => {
                  const Icon = ws.icon
                  const isActive = i === activeIndex
                  return (
                    <button
                      key={ws.name}
                      type="button"
                      onClick={() => {
                        setActiveIndex(i)
                        setOpen(false)
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${
                        isActive
                          ? "bg-indigo-500/[0.12]"
                          : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20">
                        <Icon className="h-4 w-4 text-indigo-400" />
                      </div>
                      <div className="flex flex-col items-start text-left">
                        <span className="text-[13px] font-semibold text-zinc-100">
                          {ws.name}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {ws.desc}
                        </span>
                      </div>
                      {isActive && (
                        <Check className="ml-auto h-4 w-4 shrink-0 text-indigo-400" />
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="border-t border-white/[0.06] p-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-zinc-700">
                    <Plus className="h-4 w-4 text-zinc-500" />
                  </div>
                  <span className="text-[13px] font-semibold text-zinc-400">
                    Create Workspace
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* RIGHT: Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded-full border border-white/[0.08] px-4 py-2 text-xs font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-300"
        >
          Manage widgets
        </button>

        <button
          type="button"
          onClick={onAddTask}
          className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-[0_8px_20px_rgba(79,70,229,0.35)] transition-all hover:bg-indigo-500 hover:shadow-[0_8px_24px_rgba(79,70,229,0.45)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add new task
        </button>
      </div>
    </div>
  )
}
