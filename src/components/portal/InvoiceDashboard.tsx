'use client'

import { useState } from 'react';
import { Search, Filter, MoreVertical, CreditCard, Download, ExternalLink, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function InvoiceDashboard({
    initialInvoices,
    initialProjects
}: {
    initialInvoices: any[];
    initialProjects: any[];
}) {
    const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
    const [search, setSearch] = useState('');

    const filteredInvoices = initialInvoices.filter(inv =>
        inv.invoiceNumber.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex-1 flex gap-6 min-h-0 relative">

            {/* Left Panel: Project Navigation (Hidden on small screens) */}
            <div className="hidden lg:flex w-64 flex-col gap-4">
                <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800 rounded-xl p-4">
                    <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-4">Collections</h3>
                    <ul className="space-y-2">
                        <li className="text-zinc-200 text-sm py-1 px-2 bg-zinc-800/80 rounded cursor-pointer">All Invoices</li>
                        <li className="text-zinc-500 text-sm py-1 px-2 hover:text-zinc-300 cursor-pointer transition-colors">Pending Payment</li>
                        <li className="text-zinc-500 text-sm py-1 px-2 hover:text-zinc-300 cursor-pointer transition-colors">Paid</li>
                    </ul>
                </div>

                <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800 rounded-xl p-4 flex-1">
                    <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-4">Projects</h3>
                    <ul className="space-y-2">
                        {initialProjects.length === 0 && <li className="text-zinc-500 text-sm py-1 px-2 italic">No projects</li>}
                        {initialProjects.map(proj => (
                            <li key={proj.id} className="text-zinc-500 text-sm py-1 px-2 hover:text-zinc-300 cursor-pointer transition-colors flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> {proj.name}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Center Panel: Grid */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center justify-between mb-4">
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                        <input
                            type="text"
                            placeholder="Search invoices..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-zinc-600"
                        />
                    </div>
                    <button className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 text-sm text-zinc-300 transition-colors">
                        <Filter size={16} /> Filter
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-20 aspect-auto text-left">
                    {filteredInvoices.length === 0 ? (
                        <div className="col-span-full py-20 text-center text-zinc-500">No invoices found.</div>
                    ) : (
                        filteredInvoices.map(inv => (
                            <InvoiceCard
                                key={inv.id}
                                invoice={inv}
                                onClick={() => setSelectedInvoice(inv)}
                                isActive={selectedInvoice?.id === inv.id}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* Right Panel: Asset Details Slider */}
            <AnimatePresence>
                {selectedInvoice && (
                    <motion.div
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="w-80 lg:w-96 bg-zinc-900/90 backdrop-blur-2xl border-l border-zinc-800/50 shadow-2xl absolute right-0 top-0 bottom-0 z-10 flex flex-col"
                    >
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                            <h2 className="text-lg font-medium text-white">{selectedInvoice.invoiceNumber}</h2>
                            <button onClick={() => setSelectedInvoice(null)} className="text-zinc-500 hover:text-white transition-colors p-1 rounded-md hover:bg-zinc-800">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="space-y-1">
                                <p className="text-zinc-500 text-xs uppercase tracking-wider">Total Due</p>
                                <p className="text-3xl font-light text-white">${Number(selectedInvoice.totalDue).toLocaleString()}</p>
                                <div className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${selectedInvoice.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                    selectedInvoice.status === 'OVERDUE' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                        'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    }`}>
                                    {selectedInvoice.status}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-zinc-300 border-b border-zinc-800 pb-2">Quick Actions</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button className="flex flex-col items-center justify-center gap-2 p-3 bg-zinc-950 border border-zinc-800 hover:border-indigo-500 hover:text-indigo-400 text-zinc-400 rounded-xl transition-all group">
                                        <CreditCard size={20} className="group-hover:scale-110 transition-transform" />
                                        <span className="text-xs font-medium">Pay via QR</span>
                                    </button>
                                    <button className="flex flex-col items-center justify-center gap-2 p-3 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 hover:text-white text-zinc-400 rounded-xl transition-all group">
                                        <Download size={20} className="group-hover:scale-110 transition-transform" />
                                        <span className="text-xs font-medium">Download PDF</span>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-zinc-300 border-b border-zinc-800 pb-2">Details</h3>
                                <dl className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <dt className="text-zinc-500">Date Issued</dt>
                                        <dd className="text-zinc-300">{new Date(selectedInvoice.issueDate).toLocaleDateString()}</dd>
                                    </div>
                                    {selectedInvoice.dueDate && (
                                        <div className="flex justify-between">
                                            <dt className="text-zinc-500">Due Date</dt>
                                            <dd className="text-zinc-300">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</dd>
                                        </div>
                                    )}
                                </dl>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function InvoiceCard({ invoice, onClick, isActive }: { invoice: any, onClick: () => void, isActive: boolean }) {
    return (
        <div
            onClick={onClick}
            className={`group relative bg-zinc-900/40 border rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-black/50 ${isActive ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-zinc-800/80 hover:border-zinc-700'
                }`}
            style={{ aspectRatio: '3/4' }}
        >
            {/* Thumbnail Mockup */}
            <div className="absolute inset-0 bg-zinc-950 p-4 pb-24 flex items-center justify-center">
                <div className="w-full h-full border border-zinc-800/50 bg-zinc-900/50 rounded flex flex-col relative overflow-hidden">
                    <div className="h-10 border-b border-zinc-800 flex items-center px-4 bg-zinc-800/30">
                        <div className="w-16 h-2 bg-zinc-700/50 rounded"></div>
                    </div>
                    <div className="flex-1 p-4 flex flex-col gap-2">
                        <div className="w-full h-2 bg-zinc-800/50 rounded"></div>
                        <div className="w-3/4 h-2 bg-zinc-800/50 rounded"></div>
                        <div className="w-full h-2 bg-zinc-800/50 rounded mt-4"></div>
                    </div>
                </div>
            </div>

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent opacity-80 group-hover:opacity-90 transition-opacity"></div>

            {/* Hover Actions Menu */}
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <button className="w-8 h-8 rounded-full bg-zinc-800/80 backdrop-blur flex items-center justify-center text-white hover:bg-zinc-700 transition-colors">
                    <Download size={14} />
                </button>
            </div>

            {/* Metadata Footer */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="flex justify-between items-end">
                    <div>
                        <p className="text-xs text-zinc-400 mb-1">{new Date(invoice.issueDate).toLocaleDateString()}</p>
                        <h4 className="text-white font-medium text-sm truncate w-32">{invoice.invoiceNumber}</h4>
                    </div>
                    <div className="text-right">
                        <p className="text-lg font-light text-white">${Number(invoice.totalDue)}</p>
                        <div className={`mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${invoice.status === 'PAID' ? 'text-emerald-400' :
                            invoice.status === 'OVERDUE' ? 'text-rose-400' :
                                'text-amber-400'
                            }`}>
                            {invoice.status}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
