'use client'

import { useState, useTransition, useCallback } from 'react'
import {
  Shield,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  RotateCcw,
  User,
  Clock,
  Loader2,
  Eye,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getWorkspaceAuditLogs } from '@/actions/audit-actions'
import type { AuditLogEntry } from '@/actions/audit-actions'

/* ------------------------------------------------------------------ */
/*  Action display name mapping                                       */
/* ------------------------------------------------------------------ */

const ACTION_LABELS: Record<string, string> = {
  'workspace.created': 'Tạo Workspace',
  'workspace.updated': 'Cập nhật Workspace',
  'workspace.soft_deleted': 'Xóa Workspace',
  'workspace.restored': 'Khôi phục Workspace',
  'workspace.hard_deleted': 'Xóa vĩnh viễn',
  'workspace.transferred_ownership': 'Chuyển quyền sở hữu',
  'member.invited': 'Mời thành viên',
  'member.invitation_revoked': 'Hủy lời mời',
  'member.joined': 'Tham gia Workspace',
  'member.removed': 'Xóa thành viên',
  'member.left': 'Rời Workspace',
  'member.role_changed': 'Đổi vai trò',
  'auth.impersonation_started': 'Bắt đầu impersonate',
  'auth.impersonation_ended': 'Kết thúc impersonate',
}

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

/* ------------------------------------------------------------------ */
/*  Action badge color categories                                      */
/* ------------------------------------------------------------------ */

function getActionBadgeClasses(action: string): string {
  if (action.includes('auth.'))
    return 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
  if (action.includes('created') || action.includes('joined') || action.includes('restored'))
    return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
  if (action.includes('deleted') || action.includes('removed') || action.includes('revoked'))
    return 'bg-red-500/15 text-red-400 border border-red-500/20'
  if (action.includes('updated'))
    return 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
  if (action.includes('role_changed') || action.includes('transferred'))
    return 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
  return 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/20'
}

/* ------------------------------------------------------------------ */
/*  Timestamp formatter (Vietnam timezone)                             */
/* ------------------------------------------------------------------ */

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/* ------------------------------------------------------------------ */
/*  Truncate helper                                                    */
/* ------------------------------------------------------------------ */

function truncate(str: string | null | undefined, len: number): string {
  if (!str) return '—'
  return str.length > len ? str.slice(0, len) + '...' : str
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

type Props = {
  workspaceId: string
  initialLogs: AuditLogEntry[]
  initialTotal: number
  initialPage: number
  initialPageSize: number
  initialTotalPages: number
  actionTypes: string[]
  actors: { id: string; name: string }[]
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AuditLogViewer({
  workspaceId,
  initialLogs,
  initialTotal,
  initialPage,
  initialPageSize,
  initialTotalPages,
  actionTypes,
  actors,
}: Props) {
  /* ---- state ---- */
  const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(initialPage)
  const [totalPages, setTotalPages] = useState(initialTotalPages)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  /* filters */
  const [filterAction, setFilterAction] = useState('')
  const [filterActor, setFilterActor] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const [isPending, startTransition] = useTransition()

  /* ---- fetch helper ---- */
  const fetchLogs = useCallback(
    (p: number, action: string, actor: string, from: string, to: string) => {
      startTransition(async () => {
        try {
          const result = await getWorkspaceAuditLogs(
            workspaceId,
            {
              action: action || undefined,
              actorUserId: actor || undefined,
              dateFrom: from || undefined,
              dateTo: to || undefined,
            },
            p,
            initialPageSize,
          )
          setLogs(result.logs)
          setTotal(result.total)
          setPage(result.page)
          setTotalPages(result.totalPages)
        } catch {
          // keep current data on error
        }
      })
    },
    [workspaceId, initialPageSize, startTransition],
  )

  /* ---- filter handlers ---- */
  const applyFilters = useCallback(
    (action: string, actor: string, from: string, to: string) => {
      setExpandedRow(null)
      fetchLogs(1, action, actor, from, to)
    },
    [fetchLogs],
  )

  const handleActionChange = (v: string) => {
    setFilterAction(v)
    applyFilters(v, filterActor, filterFrom, filterTo)
  }
  const handleActorChange = (v: string) => {
    setFilterActor(v)
    applyFilters(filterAction, v, filterFrom, filterTo)
  }
  const handleFromChange = (v: string) => {
    setFilterFrom(v)
    applyFilters(filterAction, filterActor, v, filterTo)
  }
  const handleToChange = (v: string) => {
    setFilterTo(v)
    applyFilters(filterAction, filterActor, filterFrom, v)
  }
  const handleReset = () => {
    setFilterAction('')
    setFilterActor('')
    setFilterFrom('')
    setFilterTo('')
    applyFilters('', '', '', '')
  }

  /* ---- pagination ---- */
  const goPage = (p: number) => {
    if (p < 1 || p > totalPages) return
    setExpandedRow(null)
    fetchLogs(p, filterAction, filterActor, filterFrom, filterTo)
  }

  /* ---- toggle expanded ---- */
  const toggleExpand = (id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id))
  }

  const hasFilters = filterAction || filterActor || filterFrom || filterTo

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">
            Nhật ký hoạt động
          </h2>
          <p className="text-sm text-zinc-400">
            Tổng cộng {total} bản ghi
          </p>
        </div>
        {isPending && (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-zinc-500" />
        )}
      </div>

      {/* ---- Filter bar ---- */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/5 bg-zinc-900/30 p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
          <Filter className="h-3.5 w-3.5" />
          Bộ lọc
        </div>

        {/* Action type */}
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Hành động
          </label>
          <select
            value={filterAction}
            onChange={(e) => handleActionChange(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/25"
          >
            <option value="">Tất cả</option>
            {actionTypes.map((a) => (
              <option key={a} value={a}>
                {getActionLabel(a)}
              </option>
            ))}
          </select>
        </div>

        {/* Actor */}
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Người thực hiện
          </label>
          <select
            value={filterActor}
            onChange={(e) => handleActorChange(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/25"
          >
            <option value="">Tất cả</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date from */}
        <div className="min-w-[150px]">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Từ ngày
          </label>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => handleFromChange(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/25"
          />
        </div>

        {/* Date to */}
        <div className="min-w-[150px]">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Đến ngày
          </label>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => handleToChange(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/25"
          />
        </div>

        {/* Reset */}
        {hasFilters && (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-800/50 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700/50 hover:text-zinc-100"
          >
            <RotateCcw className="h-3 w-3" />
            Xóa bộ lọc
          </button>
        )}
      </div>

      {/* ---- Log list ---- */}
      <div className="space-y-1">
        {logs.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-zinc-900/20 px-6 py-16 text-center">
            <Eye className="mb-3 h-8 w-8 text-zinc-600" />
            <p className="text-sm text-zinc-400">
              Không có bản ghi nào
            </p>
          </div>
        )}

        {logs.map((log) => {
          const isExpanded = expandedRow === log.id
          const hasDetail = log.beforeData || log.afterData

          return (
            <div key={log.id} className="group">
              {/* Main row */}
              <div
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/5 px-4 py-3 transition-colors ${
                  isExpanded
                    ? 'bg-zinc-900/40'
                    : 'bg-zinc-900/20 hover:bg-zinc-900/40'
                } ${hasDetail ? 'cursor-pointer' : ''}`}
                onClick={hasDetail ? () => toggleExpand(log.id) : undefined}
              >
                {/* Timestamp */}
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Clock className="h-3 w-3 flex-shrink-0" />
                  <span className="whitespace-nowrap font-mono">
                    {formatTimestamp(log.createdAt)}
                  </span>
                </div>

                {/* Actor */}
                <div className="flex items-center gap-2">
                  {log.actor ? (
                    <>
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={log.actor.avatarUrl ?? undefined} />
                        <AvatarFallback className="bg-zinc-700 text-[10px] text-zinc-300">
                          {(log.actor.nickname ?? log.actor.username)
                            .charAt(0)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-zinc-200">
                        {log.actor.nickname ?? log.actor.username}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700">
                        <User className="h-3 w-3 text-zinc-400" />
                      </div>
                      <span className="text-sm italic text-zinc-500">
                        Hệ thống
                      </span>
                    </>
                  )}
                </div>

                {/* Action badge */}
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${getActionBadgeClasses(log.action)}`}
                >
                  {getActionLabel(log.action)}
                </span>

                {/* Target */}
                <div className="text-xs text-zinc-500">
                  <span className="font-medium text-zinc-400">
                    {log.targetType}
                  </span>
                  {log.targetId && (
                    <span className="ml-1 font-mono text-zinc-600">
                      {truncate(log.targetId, 12)}
                    </span>
                  )}
                </div>

                {/* Expand indicator */}
                {hasDetail && (
                  <div className="ml-auto flex-shrink-0 text-zinc-600">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && hasDetail && (
                <div className="grid gap-4 border-b border-white/5 bg-zinc-950/60 px-4 py-4 md:grid-cols-2">
                  {log.beforeData && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                        Trước
                      </p>
                      <pre className="overflow-auto rounded-xl bg-zinc-950/80 p-4 font-mono text-xs text-zinc-300">
                        {JSON.stringify(log.beforeData, null, 2)}
                      </pre>
                    </div>
                  )}
                  {log.afterData && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                        Sau
                      </p>
                      <pre className="overflow-auto rounded-xl bg-zinc-950/80 p-4 font-mono text-xs text-zinc-300">
                        {JSON.stringify(log.afterData, null, 2)}
                      </pre>
                    </div>
                  )}
                  {(log.ipAddress || log.userAgent) && (
                    <div className="md:col-span-2">
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                        Metadata
                      </p>
                      <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
                        {log.ipAddress && (
                          <span>
                            IP:{' '}
                            <span className="font-mono text-zinc-400">
                              {log.ipAddress}
                            </span>
                          </span>
                        )}
                        {log.userAgent && (
                          <span>
                            UA:{' '}
                            <span className="font-mono text-zinc-400">
                              {truncate(log.userAgent, 60)}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ---- Pagination ---- */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-white/5 bg-zinc-900/30 p-3">
          <button
            type="button"
            disabled={page <= 1 || isPending}
            onClick={() => goPage(page - 1)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800/50 disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Trước
          </button>

          <span className="text-sm text-zinc-400">
            Trang{' '}
            <span className="font-medium text-zinc-200">{page}</span>
            {' / '}
            <span className="font-medium text-zinc-200">{totalPages}</span>
          </span>

          <button
            type="button"
            disabled={page >= totalPages || isPending}
            onClick={() => goPage(page + 1)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800/50 disabled:pointer-events-none disabled:opacity-40"
          >
            Sau
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
