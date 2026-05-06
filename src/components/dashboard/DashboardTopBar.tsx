"use client"

import { useState, useRef, useEffect } from "react"
import { Search, Bell, ChevronDown, Check, Plus, Loader2 } from "lucide-react"

interface ProfileItem {
  id: string
  name: string
  logoUrl: string | null
}

interface DashboardTopBarProps {
  displayName: string
  initials: string
  workspaceId: string
  profiles: ProfileItem[]
  currentProfileId: string
  userRole: string
}

const GRADIENT_POOL = [
  "from-[#8B5CF6] to-[#6366F1]",
  "from-emerald-500 to-cyan-500",
  "from-amber-500 to-red-500",
  "from-pink-500 to-rose-500",
  "from-sky-500 to-indigo-500",
]

export default function DashboardTopBar({
  displayName,
  initials,
  workspaceId,
  profiles,
  currentProfileId,
  userRole,
}: DashboardTopBarProps) {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  const handleProfileSwitch = async (newProfileId: string) => {
    if (newProfileId === currentProfileId || switching) return
    setSwitching(true)
    try {
      await fetch("/api/profile/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: newProfileId }),
      })
      const res = await fetch(`/api/workspace/first?profileId=${newProfileId}`)
      const { workspaceId: newWsId } = await res.json()
      window.location.href = newWsId ? `/${newWsId}/admin` : "/workspace"
    } catch {
      setSwitching(false)
    }
  }

  const currentProfile = profiles.find((p) => p.id === currentProfileId)

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
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            disabled={switching}
            className="flex items-center gap-2.5 py-1.5 pl-1.5 pr-3.5 transition-colors duration-200"
            style={{
              borderRadius: 26,
              border: "1px solid rgba(139,92,246,0.15)",
              background: "transparent",
              opacity: switching ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#211B31"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
            }}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6366F1] text-xs font-bold text-white">
              {switching ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                initials
              )}
            </span>

            <span
              className="text-sm font-semibold text-zinc-200"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              {displayName}
            </span>

            <ChevronDown
              size={14}
              className="transition-transform duration-200"
              style={{
                color: "#A1A1AA",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>

          {/* Dropdown */}
          {open && !switching && (
            <div
              className="absolute right-0 top-full z-50 mt-2 w-[280px] p-2"
              style={{
                borderRadius: 16,
                border: "1px solid rgba(139,92,246,0.15)",
                background: "#0A0A0A",
                boxShadow:
                  "0 16px 48px rgba(0,0,0,0.50), 0 0 40px rgba(139,92,246,0.06)",
              }}
            >
              <p
                className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{
                  color: "#71717A",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Profiles
              </p>

              <ul className="flex flex-col gap-0.5">
                {profiles.map((profile, idx) => {
                  const isActive = profile.id === currentProfileId
                  const gradient =
                    GRADIENT_POOL[idx % GRADIENT_POOL.length]
                  const profileInitials = profile.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)

                  return (
                    <li key={profile.id}>
                      <button
                        type="button"
                        onClick={() => handleProfileSwitch(profile.id)}
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
                        <span
                          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradient} text-[11px] font-bold text-white`}
                        >
                          {profile.logoUrl ? (
                            <img
                              src={profile.logoUrl}
                              alt=""
                              className="h-8 w-8 rounded-lg object-cover"
                            />
                          ) : (
                            profileInitials
                          )}
                        </span>

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
                            {isActive ? "Active" : "Switch to this profile"}
                          </span>
                        </div>

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

              {userRole === "ADMIN" && (
                <>
                  <div
                    className="my-1.5"
                    style={{
                      borderTop: "1px solid rgba(139,92,246,0.10)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/profile"
                    }}
                    className="flex w-full items-center gap-2 px-2 py-2 text-sm transition-colors duration-200"
                    style={{
                      borderRadius: 12,
                      color: "#A1A1AA",
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255,255,255,0.04)"
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
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
