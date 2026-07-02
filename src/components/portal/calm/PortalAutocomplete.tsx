'use client'

/**
 * [Client Task Submission v2] Portal-native "search → suggest → choose" input.
 *
 * Same logic + prop shape as the admin AutocompleteInput, but styled for the
 * LIGHT "Daylight Atelier" portal skin (paper/ink/terracotta) via the portal
 * CSS tokens — the admin component is hardcoded dark and must not leak in here.
 * Used for every entity picker in the request wizard so long lists stay
 * searchable instead of an unwieldy dropdown.
 */

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

export interface PortalAutocompleteOption {
    id: string
    label: string
    parentLabel?: string
}

export default function PortalAutocomplete({
    selectedId,
    onSelect,
    options,
    placeholder,
    emptyLabel,
}: {
    selectedId: string
    onSelect: (id: string) => void
    options: PortalAutocompleteOption[]
    placeholder: string
    /** Optional clickable "clear" row at the top of the dropdown. */
    emptyLabel?: string
}) {
    const [query, setQuery] = useState('')
    const [isOpen, setIsOpen] = useState(false)
    const [isSearching, setIsSearching] = useState(false)
    const wrapRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const selected = options.find((o) => o.id === selectedId)

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setIsOpen(false); setIsSearching(false); setQuery('')
            }
        }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])

    useEffect(() => {
        if (!selectedId) { setQuery(''); setIsSearching(false) }
    }, [selectedId])

    const filtered = query
        ? options.filter((o) =>
              (o.parentLabel ? `${o.parentLabel} ${o.label}` : o.label)
                  .toLowerCase()
                  .includes(query.toLowerCase()),
          )
        : options

    const display = isSearching
        ? query
        : selected
          ? selected.parentLabel
              ? `${selected.parentLabel} / ${selected.label}`
              : selected.label
          : ''

    const rowBase: React.CSSProperties = {
        display: 'block', width: '100%', textAlign: 'left',
        padding: '10px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
        fontFamily: 'inherit',
    }

    return (
        <div ref={wrapRef} style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)', pointerEvents: 'none' }} />
                <input
                    ref={inputRef}
                    className="pc-input"
                    style={{ paddingLeft: 34, paddingRight: 34 }}
                    placeholder={placeholder}
                    value={display}
                    onChange={(e) => {
                        if (selectedId && !isSearching) onSelect('')
                        setQuery(e.target.value); setIsSearching(true); setIsOpen(true)
                    }}
                    onFocus={() => {
                        setIsOpen(true)
                        if (selectedId) { setIsSearching(true); setQuery('') }
                    }}
                />
                {selectedId && !isSearching && (
                    <button
                        type="button"
                        onClick={() => { onSelect(''); setIsSearching(true); setQuery(''); inputRef.current?.focus() }}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', display: 'inline-flex' }}
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {isOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, width: '100%', zIndex: 90, maxHeight: 220, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 12, boxShadow: 'var(--shadow-2)' }}>
                    {emptyLabel && (
                        <button
                            type="button"
                            className="pc-ac-row"
                            onClick={() => { onSelect(''); setIsOpen(false); setIsSearching(false); setQuery('') }}
                            style={{ ...rowBase, color: 'var(--fg-3)' }}
                        >
                            {emptyLabel}
                        </button>
                    )}
                    {filtered.length > 0 ? (
                        filtered.map((o) => {
                            const on = o.id === selectedId
                            return (
                                <button
                                    key={o.id}
                                    type="button"
                                    className={on ? undefined : 'pc-ac-row'}
                                    onClick={() => { onSelect(o.id); setIsOpen(false); setIsSearching(false); setQuery('') }}
                                    style={{ ...rowBase, ...(on ? { background: 'var(--accent-soft)', color: 'var(--accent-fg)' } : { color: 'var(--fg-1)' }) }}
                                >
                                    {o.parentLabel ? (
                                        <>
                                            <span style={{ color: on ? 'var(--accent-fg)' : 'var(--fg-3)' }}>{o.parentLabel}</span>
                                            <span style={{ color: 'var(--fg-4)', margin: '0 5px' }}>/</span>
                                            <span>{o.label}</span>
                                        </>
                                    ) : (
                                        o.label
                                    )}
                                </button>
                            )
                        })
                    ) : (
                        <div style={{ padding: '11px 14px', fontSize: 13, color: 'var(--fg-3)' }}>No results</div>
                    )}
                </div>
            )}
        </div>
    )
}
