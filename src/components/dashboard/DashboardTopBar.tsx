"use client"

import { useState, useRef, useEffect } from "react"
import { Search, Bell, ChevronDown, Check, Plus } from "lucide-react"

// ---------- Types ----------
interface DashboardTopBarProps {
  displayName: string
  initials: string
  workspaceId: string
}

// ---------- Placeholder profile data ----------
const PROFILES = [
  {
    initials: "F1",
    name: "Folder 1",
    desc: "Description 1",
    gradient: "from-indigo-500 to-violet-500",
  },
  {
    initials: "F2",
    name: "Folder 2",
    desc: "Description 2",
    gradient: "from-emerald-500 to-cyan-500",
  },
  {
    initials: "F3",
    name: "Folder 3",
    desc: "Description 3",
    gradient: "from-amber-500 to-red-500",
  },
]

// ---------- Component ----------
export default function DashboardTopBar({
  displayName,
  initials,
  workspaceId,
}: DashboardTopBarProps) {
  const [open, setOpen] = useState(false)
  const [activeProfile, setActiveProfile] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div
      className="flex h-[72px] items-center justify-between border-b border-white/[0.05] px-7 gap-4 flex-shrink-0"
      style={{
        background: "rgba(10,10,10,0.50)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {/* ---- Left: Title & greeting ---- */}
      <div className="min-w-0">
        <h1
          className="text-zinc-100 font-extrabold leading-tight whitespace-nowrap overflow-hidden text-ellipsis"
          style={{ fontSize: 22, letterSpacing: "-0.02em" }}
        >
          Workspace Dashboard
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Ch&agrave;o mừng trở lại, <strong className="text-zinc-400">{displayName}</strong>. Đ&acirc;y l&agrave; tổng quan h&ocirc;m nay.
        </p>
      </div>
      <div className="flex-1" />

      {/* ---- Right: Actions ---- */}
      <div className="flex items-center gap-2">
        {/* Search button */}
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.04] text-zinc-400 transition-all duration-200 hover:bg-white/[0.08] hover:text-zinc-200"
          aria-label="Search"
        >
          <Search size={16} strokeWidth={2} />
        </button>

        {/* Bell / notification button */}
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.04] text-zinc-400 transition-all duration-200 hover:bg-white/[0.08] hover:text-zinc-200"
          aria-label="Notifications"
        >
          <Bell size={16} strokeWidth={2} />
        </button>

        {/* Profile pill + dropdown wrapper */}
        <div className="relative" ref={dropdownRef}>
          {/* Profile pill trigger */}
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.04] py-1.5 pl-1.5 pr-3 transition-all duration-200 hover:bg-white/[0.08]"
          >
            {/* Avatar circle */}
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[11px] font-bold text-white">
              {initials}
            </span>

            <span className="text-sm font-medium text-zinc-200">
              {displayName}
            </span>

            <ChevronDown
              size={14}
              className={`text-zinc-500 transition-transform duration-200 ${
                open ? "rotate-180" : "rotate-0"
              }`}
            />
          </button>

          {/* Dropdown */}
          {open && (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-[260px] rounded-2xl border border-white/[0.08] p-2"
              style={{
                background: "rgba(24,24,27,0.95)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                boxShadow: "0 16px 48px rgba(0,0,0,0.50)",
              }}
            >
              {/* Section label */}
              <p className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                Profiles
              </p>

              {/* Profile list */}
              <ul className="flex flex-col gap-0.5">
                {PROFILES.map((profile, idx) => {
                  const isActive = idx === activeProfile
                  return (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveProfile(idx)
                          setOpen(false)
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-all duration-200 ${
                          isActive
                            ? "bg-indigo-500/[0.12]"
                            : "hover:bg-white/[0.04]"
                        }`}
                      >
                        {/* Mini avatar */}
                        <span
                          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${profile.gradient} text-[11px] font-bold text-white`}
                        >
                          {profile.initials}
                        </span>

                        {/* Name + desc */}
                        <div className="flex flex-col overflow-hidden">
                          <span className="truncate text-sm font-medium text-zinc-100">
                            {profile.name}
                          </span>
                          <span className="truncate text-[11px] text-zinc-500">
                            {profile.desc}
                          </span>
                        </div>

                        {/* Active check */}
                        {isActive && (
                          <Check
                            size={14}
                            className="ml-auto flex-shrink-0 text-indigo-400"
                          />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>

              {/* Divider */}
              <div className="my-1.5 border-t border-white/[0.06]" />

              {/* Create profile button */}
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-zinc-400 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-200"
              >
                <Plus size={14} strokeWidth={2} />
                Create Profile
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
