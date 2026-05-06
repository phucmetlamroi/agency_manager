"use client"

import { useState, useRef, useEffect } from "react"
import { LayoutGrid, ChevronDown, Check, Plus, Briefcase, Video, Share2, Banknote, Calendar } from "lucide-react"
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
    <div className="flex flex-row items-center justify-between px-1">
      {/* LEFT: "This month" pill button */}
      <button
        type="button"
        className="flex items-center gap-2 py-2.5 px-4 transition-colors duration-200"
        style={{
          borderRadius: 26,
          border: "1px solid rgba(139,92,246,0.15)",
          background: "transparent",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#211B31"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent"
        }}
      >
        <Calendar size={16} style={{ color: "#8B5CF6" }} />
        <span className="text-sm font-medium" style={{ color: "#A1A1AA" }}>
          This month
        </span>
      </button>

      {/* RIGHT: Action buttons */}
      <div className="flex items-center gap-3">
        {/* Manage widgets pill — wraps workspace dropdown logic */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex items-center gap-2 py-2.5 px-4 transition-colors duration-200"
            style={{
              borderRadius: 26,
              border: "1px solid rgba(139,92,246,0.15)",
              background: "transparent",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#211B31"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
            }}
          >
            <LayoutGrid size={16} style={{ color: "#A1A1AA" }} />
            <span className="text-sm font-medium" style={{ color: "#A1A1AA" }}>
              Manage widgets
            </span>
            <ChevronDown
              size={14}
              className="transition-transform duration-200"
              style={{
                color: "#71717A",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="absolute right-0 top-full z-50 mt-2 w-[260px] overflow-hidden"
                style={{
                  borderRadius: 16,
                  border: "1px solid rgba(139,92,246,0.15)",
                  background: "#0A0A0A",
                  boxShadow:
                    "0 16px 48px rgba(0,0,0,0.50), 0 0 40px rgba(139,92,246,0.06)",
                }}
              >
                <div className="p-2">
                  <p
                    className="px-2.5 pb-2 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                    style={{
                      color: "#71717A",
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
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
                        className="flex w-full items-center gap-3 px-2.5 py-2 transition-colors duration-200"
                        style={{
                          borderRadius: 12,
                          background: isActive
                            ? "rgba(139,92,246,0.12)"
                            : "transparent",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background =
                              "rgba(255,255,255,0.04)"
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.background = "transparent"
                          }
                        }}
                      >
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: "rgba(139,92,246,0.15)" }}
                        >
                          <Icon
                            className="h-4 w-4"
                            style={{ color: "#8B5CF6" }}
                          />
                        </div>
                        <div className="flex flex-col items-start text-left">
                          <span
                            className="text-[13px] font-semibold text-zinc-100"
                            style={{
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                            }}
                          >
                            {ws.name}
                          </span>
                          <span
                            className="text-[11px]"
                            style={{ color: "#71717A" }}
                          >
                            {ws.desc}
                          </span>
                        </div>
                        {isActive && (
                          <Check
                            className="ml-auto h-4 w-4 shrink-0"
                            style={{ color: "#8B5CF6" }}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>

                <div
                  className="p-2"
                  style={{
                    borderTop: "1px solid rgba(139,92,246,0.10)",
                  }}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-2.5 py-2 transition-colors duration-200"
                    style={{
                      borderRadius: 12,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255,255,255,0.04)"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent"
                    }}
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{
                        border: "1px dashed rgba(139,92,246,0.25)",
                      }}
                    >
                      <Plus className="h-4 w-4" style={{ color: "#71717A" }} />
                    </div>
                    <span
                      className="text-[13px] font-semibold"
                      style={{ color: "#A1A1AA" }}
                    >
                      Create Workspace
                    </span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Add new task — filled purple button */}
        <button
          type="button"
          onClick={onAddTask}
          className="flex items-center gap-2 py-2.5 px-5 text-sm font-bold text-white transition-all duration-200"
          style={{
            borderRadius: 26,
            background: "#8B5CF6",
            boxShadow: "0 8px 20px rgba(139,92,246,0.35)",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#9D6FFF"
            e.currentTarget.style.boxShadow =
              "0 8px 24px rgba(139,92,246,0.45)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#8B5CF6"
            e.currentTarget.style.boxShadow =
              "0 8px 20px rgba(139,92,246,0.35)"
          }}
        >
          <Plus className="h-4 w-4" />
          Add new task
        </button>
      </div>
    </div>
  )
}
