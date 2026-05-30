'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useLang } from './i18n'

interface FileRow {
    name: string
    sz: string
    folder?: boolean
    indent?: boolean
}
interface TaskRow {
    title: string
    conf: number
    role: string
    pat: string
    status: { label: string; color: string }
    reasonEn: string
    reasonVi: string
}

const FILES: FileRow[] = [
    { name: 'ClientProjects', sz: '—', folder: true, indent: false },
    { name: 'Acme_Q3_Launch', sz: '6 files', folder: true, indent: true },
    { name: 'Acme_Launch_v3.prproj', sz: '2.4 GB', indent: true },
    { name: 'raw_footage_A001.mp4', sz: '8.1 GB', indent: true },
    { name: 'VO_script_FINAL.docx', sz: '38 KB', indent: true },
    { name: 'color_LUT_pack.cube', sz: '4 MB', indent: true },
    { name: 'thumb_options.psd', sz: '142 MB', indent: true },
]

const TASKS: TaskRow[] = [
    { title: 'Edit · Acme Launch v3', conf: 96, role: 'Editor', pat: 'P3', status: { label: 'Đang thực hiện', color: 'var(--amber)' }, reasonEn: 'Versioned .prproj → active edit', reasonVi: 'File .prproj có version → đang dựng' },
    { title: 'Color grade · Acme reel', conf: 91, role: 'Colorist', pat: 'P5', status: { label: 'Nhận task', color: 'var(--accent)' }, reasonEn: 'LUT pack + raw footage → grade pass', reasonVi: 'Gói LUT + footage thô → cần grade' },
    { title: 'Thumbnail set · Acme', conf: 88, role: 'Designer', pat: 'P2', status: { label: 'Nhận task', color: 'var(--accent)' }, reasonEn: "Layered .psd named 'thumb' → deliverable", reasonVi: "File .psd tên 'thumb' → deliverable" },
]

const FolderIcon = () => (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
)
const FileIcon = () => (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M5 8a2 2 0 0 1 2-2h7l5 5v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
    </svg>
)
const CheckIcon = () => (
    <svg className="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M5 13l4 4L19 7" />
    </svg>
)

function TaskCard({ task, lang, instant }: { task: TaskRow; lang: 'en' | 'vi'; instant: boolean }) {
    const [shown, setShown] = useState(instant)
    const [bar, setBar] = useState(instant ? task.conf : 0)

    useEffect(() => {
        if (instant) return
        const r = requestAnimationFrame(() => {
            setShown(true)
            setBar(task.conf)
        })
        return () => cancelAnimationFrame(r)
    }, [instant, task.conf])

    return (
        <div className={'task-card' + (shown ? ' show' : '')}>
            <div className="tc-top">
                <span className="tc-title">{task.title}</span>
                <span className="tc-conf">
                    {task.conf}%
                    <span className="bar">
                        <i style={{ width: bar + '%' }} />
                    </span>
                </span>
            </div>
            <div className="tc-meta">
                <span className="spill role">
                    <span className="d" style={{ background: task.status.color }} />
                    {task.status.label}
                </span>
                <span className="spill role">{task.role}</span>
                <span className="spill pat">{task.pat}</span>
            </div>
            <div className="tc-reason">{lang === 'vi' ? task.reasonVi : task.reasonEn}</div>
        </div>
    )
}

export function VeloxDemo() {
    const { lang, t } = useLang()
    const reduce = useReducedMotion() ?? false

    const rootRef = useRef<HTMLDivElement>(null)
    const timers = useRef<number[]>([])
    const started = useRef(false)

    const [scanning, setScanning] = useState(!reduce)
    const [badgeDone, setBadgeDone] = useState(reduce)
    const [hit, setHit] = useState<number | null>(null)
    const [done, setDone] = useState<boolean[]>(() => FILES.map((f) => (reduce ? !f.folder : false)))
    const [fileCount, setFileCount] = useState(reduce ? FILES.length : 0)
    const [shownTasks, setShownTasks] = useState(reduce ? TASKS.length : 0)
    const [taskCount, setTaskCount] = useState(reduce ? TASKS.length : 0)

    useEffect(() => {
        if (reduce) return

        const clearTimers = () => {
            timers.current.forEach((id) => clearTimeout(id))
            timers.current = []
        }
        const later = (fn: () => void, ms: number) => {
            timers.current.push(window.setTimeout(fn, ms))
        }

        const runCycle = () => {
            clearTimers()
            // reset
            setScanning(true)
            setBadgeDone(false)
            setHit(null)
            setDone(FILES.map(() => false))
            setFileCount(0)
            setShownTasks(0)
            setTaskCount(0)

            const fileDelay = 280
            FILES.forEach((f, i) => {
                later(() => {
                    setHit(i)
                    setFileCount(i + 1)
                    later(() => {
                        setHit((h) => (h === i ? null : h))
                        if (!f.folder) setDone((d) => {
                            const n = [...d]
                            n[i] = true
                            return n
                        })
                    }, 240)
                }, 500 + i * fileDelay)
            })

            const scanEnd = 500 + FILES.length * fileDelay + 200
            later(() => {
                setScanning(false)
                setBadgeDone(true)
            }, scanEnd)

            for (let i = 0; i < TASKS.length; i++) {
                later(() => {
                    setShownTasks(i + 1)
                    setTaskCount(i + 1)
                }, scanEnd + 400 + i * 520)
            }

            const cycleEnd = scanEnd + 400 + TASKS.length * 520 + 4200
            later(runCycle, cycleEnd)
        }

        const start = () => {
            if (started.current) return
            started.current = true
            runCycle()
        }

        const el = rootRef.current
        let observer: IntersectionObserver | null = null
        if (el && 'IntersectionObserver' in window) {
            observer = new IntersectionObserver(
                (entries) => {
                    if (entries.some((e) => e.isIntersecting)) start()
                },
                { threshold: 0.25 },
            )
            observer.observe(el)
        }
        // fallback: start shortly after mount even if observer never fires
        const fallback = window.setTimeout(start, 1200)

        return () => {
            clearTimers()
            observer?.disconnect()
            clearTimeout(fallback)
        }
    }, [reduce])

    return (
        <div className="velox-demo glass g3" ref={rootRef}>
            <div className="vd-head">
                <div className="vd-traffic">
                    <i />
                    <i />
                    <i />
                </div>
                <div className="vd-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 18a4.6 4.6 0 0 1-.3-9.2 6 6 0 0 1 11.5 1.5A4 4 0 0 1 18 18Z" />
                    </svg>
                    <span className="src">Google Drive</span> · /ClientProjects
                </div>
                <span className="vd-scanbadge">
                    {badgeDone ? (
                        <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 13l4 4L19 7" />
                            </svg>
                            {t.demo.done}
                        </>
                    ) : (
                        <>
                            <span className="spin" />
                            {t.demo.scanning}
                        </>
                    )}
                </span>
            </div>

            <div className="vd-body">
                <div>
                    <div className="vd-col-label">
                        {t.demo.sourceFiles} · <span className="c">{fileCount}</span>
                    </div>
                    <div className={'vd-tree' + (scanning ? ' scanning' : '')}>
                        <div className="scanline" />
                        {FILES.map((f, i) => (
                            <div
                                key={i}
                                className={
                                    'file' +
                                    (f.folder ? ' folder' : '') +
                                    (f.indent ? ' indent' : '') +
                                    (hit === i ? ' hit' : '') +
                                    (done[i] ? ' done' : '')
                                }
                            >
                                {f.folder ? <FolderIcon /> : <FileIcon />}
                                <span className="name">{f.name}</span>
                                <span className="sz">{f.sz}</span>
                                {!f.folder && <CheckIcon />}
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <div className="vd-col-label">
                        {t.demo.generatedTasks} · <span className="c">{taskCount}</span>
                    </div>
                    <div className="vd-tasks">
                        {TASKS.slice(0, shownTasks).map((task, i) => (
                            <TaskCard key={i} task={task} lang={lang} instant={reduce} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
