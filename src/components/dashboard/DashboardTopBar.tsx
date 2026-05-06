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
    <div className="flex items-end justify-between gap-6 px-1 pb-2 pt-2">
      {/* ---- Left: Heading & subtitle ---- */}
      <div className="min-w-0">
        <h1
          className="font-extrabold leading-tight tracking-tight text-white"
          style={{
            fontSize: 40,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            letterSpacing: "-0.02em",
          }}
        >
          {displayName}
        </h1>
        <p
          className="mt-1.5"
          style={{
            fontSize: 13,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            color: "#A1A1AA",
          }}
        >
          Welcome back, <span className="text-zinc-300">{displayName}</span>.
          Here&apos;s what&apos;s happening today.
        </p>
      </div>

      {/* ---- Right: Actions row ---- */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Search button */}
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-200"
          style={{
            border: "1px solid rgba(139,92,246,0.15)",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#211B31"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent"
          }}
          aria-label="Search"
        >
          <Search size={18} strokeWidth={2} style={{ color: "#A1A1AA" }} />
        </button>

        {/* Bell / notification button */}
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-200"
          style={{
            border: "1px solid rgba(139,92,246,0.15)",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#211B31"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent"
          }}
          aria-label="Notifications"
        >
          <Bell size={18} strokeWidth={2} style={{ color: "#A1A1AA" }} />
        </button>

        {/* Profile pill + dropdown wrapper */}
        <div className="relative" ref={dropdownRef}>
          {/* Profile pill trigger */}
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex items-center gap-2.5 py-1.5 pl-1.5 pr-3.5 transition-colors duration-200"
            style={{
              borderRadius: 26,
              border: "1px solid rgba(139,92,246,0.15)",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#211B31"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
            }}
          >
            {/* Avatar circle */}
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-bold text-white">
              {initials}
            </span>

            <span
              className="text-sm font-semibold text-zinc-200"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              {displayName}
            </span>

            <ChevronDown
              size={14}
              className={`transition-transform duration-200`}
              style={{
                color: "#A1A1AA",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>

          {/* Dropdown */}
          {open && (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-[260px] p-2"
              style={{
                borderRadius: 16,
                border: "1px solid rgba(139,92,246,0.15)",
                background: "#0A0A0A",
                boxShadow:
                  "0 16px 48px rgba(0,0,0,0.50), 0 0 40px rgba(139,92,246,0.06)",
              }}
            >
              {/* Section label */}
              <p
                className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{
                  color: "#71717A",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
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
                        className="flex w-full items-center gap-2.5 px-2 py-2 text-left transition-colors duration-200"
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
                        {/* Mini avatar */}
                        <span
                          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${profile.gradient} text-[11px] font-bold text-white`}
                        >
                          {profile.initials}
                        </span>

                        {/* Name + desc */}
                        <div className="flex flex-col overflow-hidden">
                          <span
                            className="truncate text-sm font-medium text-zinc-100"
                            style={{
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                            }}
                          >
                            {profile.name}
                          </span>
                          <span
                            className="truncate text-[11px]"
                            style={{ color: "#71717A" }}
                          >
                            {profile.desc}
                          </span>
                        </div>

                        {/* Active check */}
                        {isActive && (
                          <Check
                            size={14}
                            className="ml-auto flex-shrink-0"
                            style={{ color: "#8B5CF6" }}
                          />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>

              {/* Divider */}
              <div
                className="my-1.5"
                style={{ borderTop: "1px solid rgba(139,92,246,0.10)" }}
              />

              {/* Create profile button */}
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-2 text-sm transition-colors duration-200"
                style={{
                  borderRadius: 12,
                  color: "#A1A1AA",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)"
                  e.currentTarget.style.color = "#D4D4D8"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                  e.currentTarget.style.color = "#A1A1AA"
                }}
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
