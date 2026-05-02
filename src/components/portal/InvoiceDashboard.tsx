'use client'

import { useMemo, useState } from 'react'
import { Search, Filter, CreditCard, Download, X, Receipt, ArrowUpRight, DollarSign, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/* ── Status config ── */
const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; icon: typeof Clock }> = {
    PAID: { color: 'text-emerald-400', bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-500/20', icon: CheckCircle2 },
    OVERDUE: { color: 'text-rose-400', bg: 'bg-rose-500/[0.08]', border: 'border-rose-500/20', icon: AlertTriangle },
    PENDING: { color: 'text-amber-400', bg: 'bg-amber-500/[0.08]', border: 'border-amber-500/20', icon: Clock },
}
const DEFAULT_STYLE = STATUS_STYLE.PENDING

export default function InvoiceDashboard({
    initialInvoices,
    initialProjects
}: {
    initialInvoices: any[]
    initialProjects: any[]
}) {
    const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
    const [search, setSearch] = useState('')

    const filteredInvoices = initialInvoices.filter(inv =>
        inv.invoiceNumber.toLowerCase().includes(search.toLowerCase())
    )

    const summary = useMemo(() => {
        const totalOutstanding = initialInvoices
            .filter(inv => inv.status !== 'PAID')
            .reduce((acc, inv) => acc + Number(inv.totalDue || 0), 0)
        const pending = initialInvoices.filter(inv => inv.status === 'PENDING').length
        const overdue = initialInvoices.filter(inv => inv.status === 'OVERDUE').length
        const paid = initialInvoices.filter(inv => inv.status === 'PAID').length
        const total = initialInvoices.length
        const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0
        return { totalOutstanding, pending, overdue, paid, total, paidPct }
    }, [initialInvoices])

    const stats = [
        { label: 'Outstanding', value: `$${summary.totalOutstanding.toLocaleString()}`, color: 'text-amber-300', border: 'border-amber-500/15', bg: 'bg-amber-500/[0.06]', icon: DollarSign },
        { label: 'Pending', value: summary.pending, color: 'text-amber-400', border: 'border-amber-500/15', bg: 'bg-amber-500/[0.06]', icon: Clock },
        { label: 'Overdue', value: summary.overdue, color: 'text-rose-400', border: 'border-rose-500/15', bg: 'bg-rose-500/[0.06]', icon: AlertTriangle },
        { label: 'Settled', value: summary.paid, color: 'text-emerald-400', border: 'border-emerald-500/15', bg: 'bg-emerald-500/[0.06]', icon: CheckCircle2 },
    ]

    return (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 relative">

            {/* Left: Sidebar nav */}
            <div className="hidden lg:flex w-60 flex-col gap-3 shrink-0">
                <div className="bg-zinc-950/60 backdrop-blur-2xl border border-white/[0.06] rounded-2xl p-4 shadow-lg shadow-black/30">
                    <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em] mb-3">Invoice Vault</p>
                    <ul className="space-y-1">
                        <li className="text-sm py-2 px-3 bg-white/[0.04] border border-white/[0.06] text-white font-medium rounded-xl cursor-pointer">All Statements</li>
                        <li className="text-sm py-2 px-3 text-zinc-500 hover:text-white hover:bg-white/[0.02] rounded-xl cursor-pointer transition-colors">Pending</li>
                        <li className="text-sm py-2 px-3 text-zinc-500 hover:text-white hover:bg-white/[0.02] rounded-xl cursor-pointer transition-colors">Settled</li>
                    </ul>
                </div>

                <div className="bg-zinc-950/60 backdrop-blur-2xl border border-white/[0.06] rounded-2xl p-4 flex-1 shadow-lg shadow-black/30">
                    <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em] mb-3">Accounts</p>
                    <ul className="space-y-1">
                        {initialProjects.length === 0 && <li className="text-zinc-600 text-xs italic py-2 px-3">No projects</li>}
                        {initialProjects.map(proj => (
                            <li key={proj.id} className="text-sm py-2 px-3 text-zinc-500 hover:text-white rounded-xl cursor-pointer transition-colors flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.4)]" />
                                {proj.name}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Center: Main content */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                {/* 3A: Hero stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    {stats.map((s, i) => {
                        const Icon = s.icon
                        return (
                            <motion.div
                                key={s.label}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.06, duration: 0.25 }}
                                className={`relative rounded-2xl border ${s.border} ${s.bg} p-3.5 overflow-hidden group/stat hover:scale-[1.02] transition-transform duration-200`}
                            >
                                <Icon size={14} className={`${s.color} opacity-40 absolute top-3 right-3`} />
                                <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">{s.label}</p>
                                <p className={`text-xl font-light ${s.color} mt-1`}>{s.value}</p>
                            </motion.div>
                        )
                    })}
                </div>

                {/* Settlement progress bar */}
                {summary.total > 0 && (
                    <div className="mb-5 bg-zinc-950/40 backdrop-blur-xl border border-white/[0.04] rounded-xl p-3.5 flex items-center gap-4">
                        <span className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold shrink-0">Settlement</span>
                        <div className="flex-1 h-2 bg-zinc-900 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${summary.paidPct}%` }}
                                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                                className="h-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-teal-300 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.3)]"
                            />
                        </div>
                        <span className="text-xs text-emerald-400 font-semibold">{summary.paidPct}%</span>
                    </div>
                )}

                {/* Search bar */}
                <div className="flex items-center justify-between mb-4 gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600" size={15} />
                        <input
                            type="text"
                            placeholder="Search statements..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-white/[0.06] rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder:text-zinc-600"
                        />
                    </div>
                    <button className="flex items-center gap-2 px-3.5 py-2.5 bg-zinc-900/50 border border-white/[0.06] rounded-xl hover:bg-zinc-800/60 text-sm text-zinc-400 hover:text-white transition-all">
                        <Filter size={14} /> Refine
                    </button>
                </div>

                {/* 3B: Invoice cards grid */}
                <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto pb-6 content-start text-left custom-scrollbar">
                    {filteredInvoices.length === 0 ? (
                        <div className="col-span-full py-20 text-center">
                            <Receipt size={32} className="mx-auto mb-3 text-zinc-800" />
                            <p className="text-zinc-500 text-sm">No statements found.</p>
                        </div>
                    ) : (
                        filteredInvoices.map((inv, i) => (
                            <motion.div
                                key={inv.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03, duration: 0.2 }}
                            >
                                <InvoiceCard
                                    invoice={inv}
                                    onClick={() => setSelectedInvoice(inv)}
                                    isActive={selectedInvoice?.id === inv.id}
                                />
                            </motion.div>
                        ))
                    )}
                </div>
            </div>

            {/* 3C: Right panel - Invoice detail slider */}
            <AnimatePresence>
                {selectedInvoice && (
                    <motion.div
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                        className="w-80 lg:w-96 bg-zinc-950/90 backdrop-blur-2xl border-l border-white/[0.06] shadow-2xl shadow-black/50 absolute right-0 top-0 bottom-0 z-10 flex flex-col"
                    >
                        {/* Detail header */}
                        <div className="p-5 border-b border-white/[0.04] flex justify-between items-center">
                            <div>
                                <p className="text-[9px] text-zinc-500 uppercase tracking-[0.2em] font-bold">Statement</p>
                                <h2 className="text-lg font-semibold text-white">{selectedInvoice.invoiceNumber}</h2>
                            </div>
                            <button onClick={() => setSelectedInvoice(null)} className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/[0.04]">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                            {/* Amount + status */}
                            <div>
                                <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold mb-1">Total Due</p>
                                <p className="text-4xl font-thin text-white tracking-tight">${Number(selectedInvoice.totalDue).toLocaleString()}</p>
                                {(() => {
                                    const s = STATUS_STYLE[selectedInvoice.status] || DEFAULT_STYLE
                                    const Icon = s.icon
                                    return (
                                        <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full border text-[10px] uppercase font-bold tracking-wider ${s.bg} ${s.border} ${s.color}`}>
                                            <Icon size={11} />
                                            {selectedInvoice.status}
                                        </div>
                                    )
                                })()}
                            </div>

                            {/* Actions */}
                            <div>
                                <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold mb-3">Actions</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button className="flex flex-col items-center justify-center gap-2 p-3.5 bg-zinc-900/40 border border-white/[0.04] hover:border-indigo-500/30 hover:bg-indigo-500/[0.05] text-zinc-400 hover:text-indigo-300 rounded-xl transition-all group">
                                        <CreditCard size={18} className="group-hover:scale-110 transition-transform" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Settle via QR</span>
                                    </button>
                                    <button className="flex flex-col items-center justify-center gap-2 p-3.5 bg-zinc-900/40 border border-white/[0.04] hover:border-white/[0.08] text-zinc-400 hover:text-white rounded-xl transition-all group">
                                        <Download size={18} className="group-hover:scale-110 transition-transform" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Export PDF</span>
                                    </button>
                                </div>
                            </div>

                            {/* Statement details */}
                            <div>
                                <p className="text-[9px] text-zinc-600 uppercase tracking-wider font-bold mb-3">Details</p>
                                <dl className="space-y-3 text-sm">
                                    <div className="flex justify-between items-center py-2 border-b border-white/[0.03]">
                                        <dt className="text-zinc-500">Issued</dt>
                                        <dd className="text-zinc-200 font-medium">{new Date(selectedInvoice.issueDate).toLocaleDateString()}</dd>
                                    </div>
                                    {selectedInvoice.dueDate && (
                                        <div className="flex justify-between items-center py-2 border-b border-white/[0.03]">
                                            <dt className="text-zinc-500">Due</dt>
                                            <dd className="text-zinc-200 font-medium">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</dd>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center py-2">
                                        <dt className="text-zinc-500">Amount</dt>
                                        <dd className="text-zinc-200 font-medium">${Number(selectedInvoice.totalDue).toLocaleString()}</dd>
                                    </div>
                                </dl>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

/* ── 3B: Premium Invoice Card ── */
function InvoiceCard({ invoice, onClick, isActive }: { invoice: any; onClick: () => void; isActive: boolean }) {
    const style = STATUS_STYLE[invoice.status] || DEFAULT_STYLE
    const Icon = style.icon

    return (
        <div
            onClick={onClick}
            className={`group/card relative bg-zinc-900/40 border rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30 ${isActive ? 'border-indigo-500/40 ring-1 ring-indigo-500/20' : 'border-white/[0.06] hover:border-white/[0.1]'}`}
            style={{ aspectRatio: '3/4' }}
        >
            {/* Document preview skeleton */}
            <div className="absolute inset-0 bg-zinc-950 p-4 pb-24 flex items-center justify-center">
                <div className="w-full h-full border border-white/[0.04] bg-zinc-900/30 rounded-lg flex flex-col overflow-hidden">
                    <div className="h-8 border-b border-white/[0.03] flex items-center px-3 bg-zinc-900/50">
                        <div className="w-12 h-1.5 bg-zinc-800/60 rounded" />
                    </div>
                    <div className="flex-1 p-3 flex flex-col gap-2">
                        <div className="w-full h-1.5 bg-zinc-800/40 rounded" />
                        <div className="w-3/4 h-1.5 bg-zinc-800/40 rounded" />
                        <div className="w-full h-1.5 bg-zinc-800/40 rounded mt-3" />
                        <div className="w-1/2 h-1.5 bg-zinc-800/40 rounded" />
                    </div>
                </div>
            </div>

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

            {/* Top-right: status dot */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-80">
                <Icon size={12} className={style.color} />
            </div>

            {/* Hover download button */}
            <div className="absolute top-3 left-3 opacity-0 group-hover/card:opacity-100 transition-opacity">
                <button className="w-7 h-7 rounded-lg bg-zinc-800/80 backdrop-blur flex items-center justify-center text-white hover:bg-zinc-700 transition-colors">
                    <Download size={12} />
                </button>
            </div>

            {/* Bottom metadata */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="text-[10px] text-zinc-500 mb-1">{new Date(invoice.issueDate).toLocaleDateString()}</p>
                <div className="flex justify-between items-end">
                    <h4 className="text-white font-semibold text-sm truncate max-w-[120px] group-hover/card:text-indigo-200 transition-colors">{invoice.invoiceNumber}</h4>
                    <div className="text-right">
                        <p className="text-lg font-light text-white">${Number(invoice.totalDue).toLocaleString()}</p>
                        <span className={`text-[9px] uppercase font-bold tracking-wider ${style.color}`}>
                            {invoice.status}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
