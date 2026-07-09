'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
    Bookmark,
    BookmarkCheck,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Edit3,
    Eye,
    Flame,
    Gauge,
    GraduationCap,
    Layers,
    ListChecks,
    RefreshCcw,
    RotateCcw,
    Search,
    Shuffle,
    Sparkles,
    Target,
    Trophy,
    X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
    resetStudyPlaceProgressAction,
    reviewStudyPlaceQuestionAction,
    toggleStudyPlaceBookmarkAction,
} from '@/actions/study-place-actions'
import {
    STUDY_PLACE_QUESTIONS,
    STUDY_PLACE_SET_ID,
    isCloseRecallAnswer,
    isStudyPlaceDue,
    type StudyPlaceProgressDTO,
    type StudyPlaceQuestion,
} from '@/lib/study-place'

type StudyMode = 'dashboard' | 'due' | 'flashcards' | 'quiz' | 'write' | 'sprint' | 'bank'
type QueueScope = 'due' | 'all' | 'bookmarked'

type Props = {
    workspaceId: string
    initialProgress: StudyPlaceProgressDTO[]
}

const MODE_META: Array<{ id: StudyMode; label: string; icon: any; desc: string }> = [
    { id: 'due', label: 'Due Review', icon: Clock3, desc: 'Ôn đúng các câu đã tới hạn.' },
    { id: 'flashcards', label: 'Flashcards', icon: Layers, desc: 'Lật thẻ, tự chấm Hard/Good/Easy.' },
    { id: 'quiz', label: 'Multiple Choice', icon: ListChecks, desc: 'Luyện chọn đáp án như đề thi.' },
    { id: 'write', label: 'Write Recall', icon: Edit3, desc: 'Gõ đáp án để nhớ sâu hơn.' },
    { id: 'sprint', label: 'Exam Sprint', icon: Flame, desc: 'Chạy nhanh 20 câu xen kẽ.' },
    { id: 'bank', label: 'Browse Bank', icon: Search, desc: 'Tra cứu, lọc, bookmark câu hỏi.' },
]

function shuffle<T>(items: T[]) {
    return [...items].sort(() => Math.random() - 0.5)
}

function optionHash(seed: string, value: string) {
    let hash = 0
    const text = `${seed}:${value}`
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) >>> 0
    }
    return hash
}

function getOptionOrder(question: StudyPlaceQuestion, mode: StudyMode) {
    if (mode !== 'quiz' && mode !== 'sprint') return question.options
    return [...question.options].sort((a, b) => optionHash(question.id, a) - optionHash(question.id, b))
}

function formatNextReview(progress?: StudyPlaceProgressDTO) {
    if (!progress?.nextReviewAt) return 'New'
    const next = new Date(progress.nextReviewAt).getTime()
    const diff = next - Date.now()
    if (diff <= 0) return 'Due now'
    const minutes = Math.ceil(diff / 60000)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.ceil(minutes / 60)
    if (hours < 48) return `${hours}h`
    return `${Math.ceil(hours / 24)}d`
}

function getProgressMap(progress: StudyPlaceProgressDTO[]) {
    return new Map(progress.map((item) => [item.questionId, item]))
}

function masteryLabel(progress?: StudyPlaceProgressDTO) {
    if (!progress) return 'New'
    if (progress.masteredAt) return 'Mastered'
    if (progress.repetition >= 2) return 'Learning'
    if (progress.attempts > 0) return 'Started'
    return 'New'
}

function qualityFromCorrect(correct: boolean) {
    return correct ? 4 : 1
}

export default function StudyPlaceBoard({ workspaceId, initialProgress }: Props) {
    const [mode, setMode] = useState<StudyMode>('dashboard')
    const [queueScope, setQueueScope] = useState<QueueScope>('due')
    const [progressMap, setProgressMap] = useState(() => getProgressMap(initialProgress))
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        setProgressMap(getProgressMap(initialProgress))
    }, [initialProgress])

    const stats = useMemo(() => {
        const progress = [...progressMap.values()]
        const due = STUDY_PLACE_QUESTIONS.filter((question) => isStudyPlaceDue(progressMap.get(question.id))).length
        const mastered = progress.filter((item) => item.masteredAt).length
        const attempted = progress.filter((item) => item.attempts > 0).length
        const bookmarked = progress.filter((item) => item.bookmarked).length
        const attempts = progress.reduce((sum, item) => sum + item.attempts, 0)
        const correct = progress.reduce((sum, item) => sum + item.correctAttempts, 0)
        const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0
        return { due, mastered, attempted, bookmarked, attempts, accuracy }
    }, [progressMap])

    const questionPool = useMemo(() => {
        if (queueScope === 'all') return STUDY_PLACE_QUESTIONS
        if (queueScope === 'bookmarked') {
            return STUDY_PLACE_QUESTIONS.filter((question) => progressMap.get(question.id)?.bookmarked)
        }
        return STUDY_PLACE_QUESTIONS.filter((question) => isStudyPlaceDue(progressMap.get(question.id)))
    }, [progressMap, queueScope])

    function mergeProgress(progress: StudyPlaceProgressDTO) {
        setProgressMap((current) => {
            const next = new Map(current)
            next.set(progress.questionId, progress)
            return next
        })
    }

    function rateQuestion(questionId: string, quality: number, isCorrect?: boolean, after?: () => void) {
        startTransition(async () => {
            const result = await reviewStudyPlaceQuestionAction({
                workspaceId,
                studySetId: STUDY_PLACE_SET_ID,
                questionId,
                quality,
                isCorrect,
            })
            if ('error' in result) {
                toast.error(result.error)
                return
            }
            mergeProgress(result.progress)
            after?.()
        })
    }

    function toggleBookmark(question: StudyPlaceQuestion) {
        const current = progressMap.get(question.id)
        const nextBookmarked = !current?.bookmarked
        startTransition(async () => {
            const result = await toggleStudyPlaceBookmarkAction({
                workspaceId,
                studySetId: STUDY_PLACE_SET_ID,
                questionId: question.id,
                bookmarked: nextBookmarked,
            })
            if ('error' in result) {
                toast.error(result.error)
                return
            }
            mergeProgress(result.progress)
        })
    }

    function resetProgress() {
        if (!confirm('Reset toàn bộ tiến độ StudyPlace của riêng bạn trong workspace này?')) return
        startTransition(async () => {
            const result = await resetStudyPlaceProgressAction({ workspaceId, studySetId: STUDY_PLACE_SET_ID })
            if ('error' in result) {
                toast.error(result.error)
                return
            }
            setProgressMap(new Map())
            toast.success('Đã reset tiến độ StudyPlace.')
        })
    }

    if (mode !== 'dashboard') {
        return (
            <StudySession
                mode={mode}
                queue={questionPool}
                queueScope={queueScope}
                setQueueScope={setQueueScope}
                progressMap={progressMap}
                onBack={() => setMode('dashboard')}
                onRate={rateQuestion}
                onBookmark={toggleBookmark}
                isPending={isPending}
            />
        )
    }

    const progressPercent = Math.round((stats.mastered / STUDY_PLACE_QUESTIONS.length) * 100)

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 shadow-xl">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-violet-300">
                            <GraduationCap className="h-4 w-4" />
                            Active recall · Spaced repetition · Self-explanation
                        </div>
                        <h3 className="text-2xl font-bold text-zinc-50">StudyPlace</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                            Bộ câu hỏi tiếng Anh được giữ nguyên văn. Phần tiếng Việt nằm trong lớp giải nghĩa để bạn vừa ôn đáp án, vừa học cách đọc đề và nhớ từ khóa.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setQueueScope('due')
                                setMode('due')
                            }}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
                            disabled={isPending}
                        >
                            <Clock3 className="h-4 w-4" />
                            Review due
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setQueueScope('all')
                                setMode('quiz')
                            }}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/10"
                        >
                            <Shuffle className="h-4 w-4" />
                            Review all
                        </button>
                        <button
                            type="button"
                            onClick={resetProgress}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/15"
                        >
                            <RefreshCcw className="h-4 w-4" />
                            Reset
                        </button>
                    </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-5">
                    <StatTile icon={Clock3} label="Due now" value={stats.due} tone="amber" />
                    <StatTile icon={Trophy} label="Mastered" value={`${stats.mastered}/${STUDY_PLACE_QUESTIONS.length}`} tone="emerald" />
                    <StatTile icon={Target} label="Started" value={stats.attempted} tone="blue" />
                    <StatTile icon={BookmarkCheck} label="Bookmarked" value={stats.bookmarked} tone="violet" />
                    <StatTile icon={Gauge} label="Accuracy" value={`${stats.accuracy}%`} tone="zinc" />
                </div>

                <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
                        <span>Total mastery</span>
                        <span>{progressPercent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                        <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progressPercent}%` }} />
                    </div>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {MODE_META.map((item) => {
                    const Icon = item.icon
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                                setQueueScope(item.id === 'bank' ? 'all' : 'due')
                                setMode(item.id)
                            }}
                            className="group min-h-[118px] rounded-2xl border border-white/10 bg-zinc-950/50 p-4 text-left transition-colors hover:border-violet-500/40 hover:bg-violet-500/10"
                        >
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-violet-200">
                                    <Icon className="h-5 w-5" />
                                </span>
                                <ChevronRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-300" />
                            </div>
                            <div className="text-sm font-semibold text-zinc-100">{item.label}</div>
                            <p className="mt-1 text-xs leading-5 text-zinc-400">{item.desc}</p>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

function StatTile({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string | number; tone: 'amber' | 'emerald' | 'blue' | 'violet' | 'zinc' }) {
    const toneClass = {
        amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
        emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
        blue: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
        violet: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
        zinc: 'bg-zinc-900 text-zinc-300 border-white/10',
    }[tone]

    return (
        <div className={`rounded-xl border p-3 ${toneClass}`}>
            <Icon className="mb-3 h-4 w-4" />
            <div className="text-xl font-bold text-zinc-50">{value}</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-75">{label}</div>
        </div>
    )
}

function StudySession({
    mode,
    queue,
    queueScope,
    setQueueScope,
    progressMap,
    onBack,
    onRate,
    onBookmark,
    isPending,
}: {
    mode: StudyMode
    queue: StudyPlaceQuestion[]
    queueScope: QueueScope
    setQueueScope: (scope: QueueScope) => void
    progressMap: Map<string, StudyPlaceProgressDTO>
    onBack: () => void
    onRate: (questionId: string, quality: number, isCorrect?: boolean, after?: () => void) => void
    onBookmark: (question: StudyPlaceQuestion) => void
    isPending: boolean
}) {
    const [index, setIndex] = useState(0)
    const [revealed, setRevealed] = useState(false)
    const [selected, setSelected] = useState<string | null>(null)
    const [typed, setTyped] = useState('')
    const [checked, setChecked] = useState(false)
    const [bankQuery, setBankQuery] = useState('')
    const [bankTag, setBankTag] = useState('all')

    const [sessionQueue, setSessionQueue] = useState<StudyPlaceQuestion[]>([])

    const current = sessionQueue[index] ?? null
    const currentProgress = current ? progressMap.get(current.id) : undefined
    const allTags = useMemo(() => {
        const tags = new Set<string>()
        STUDY_PLACE_QUESTIONS.forEach((question) => question.tags?.forEach((tag) => tags.add(tag)))
        return ['all', ...[...tags].sort()]
    }, [])

    useEffect(() => {
        setSessionQueue(mode === 'sprint' ? shuffle(queue).slice(0, 20) : queue)
        setIndex(0)
        setRevealed(false)
        setSelected(null)
        setTyped('')
        setChecked(false)
        // Keep the queue stable after rating a card; reset only when the user
        // changes mode/scope or starts a new session.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, queueScope])

    function advance() {
        setRevealed(false)
        setSelected(null)
        setTyped('')
        setChecked(false)
        setIndex((value) => Math.min(value + 1, Math.max(0, sessionQueue.length - 1)))
    }

    function previous() {
        setRevealed(false)
        setSelected(null)
        setTyped('')
        setChecked(false)
        setIndex((value) => Math.max(0, value - 1))
    }

    const headerLabel = MODE_META.find((item) => item.id === mode)?.label ?? 'StudyPlace'

    if (mode === 'bank') {
        const filtered = STUDY_PLACE_QUESTIONS.filter((question) => {
            const matchesQuery = !bankQuery.trim()
                || `${question.question} ${question.correctAnswer} ${question.viTranslation}`.toLowerCase().includes(bankQuery.toLowerCase())
            const matchesTag = bankTag === 'all' || question.tags?.includes(bankTag)
            return matchesQuery && matchesTag
        })

        return (
            <SessionShell title="Browse Bank" onBack={onBack} queueScope={queueScope} setQueueScope={setQueueScope}>
                <div className="space-y-4">
                    <div className="flex flex-col gap-2 md:flex-row">
                        <label className="relative flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                            <input
                                value={bankQuery}
                                onChange={(event) => setBankQuery(event.target.value)}
                                placeholder="Search questions, answers, Vietnamese notes..."
                                className="h-11 w-full rounded-xl border border-white/10 bg-zinc-950/70 pl-9 pr-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500/50"
                            />
                        </label>
                        <select
                            value={bankTag}
                            onChange={(event) => setBankTag(event.target.value)}
                            className="h-11 rounded-xl border border-white/10 bg-zinc-950/70 px-3 text-sm text-zinc-100 outline-none focus:border-violet-500/50"
                        >
                            {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                        </select>
                    </div>
                    <div className="space-y-3">
                        {filtered.map((question) => (
                            <QuestionDetail
                                key={question.id}
                                question={question}
                                progress={progressMap.get(question.id)}
                                onBookmark={() => onBookmark(question)}
                                compact
                            />
                        ))}
                    </div>
                </div>
            </SessionShell>
        )
    }

    if (sessionQueue.length === 0 || !current) {
        return (
            <SessionShell title={headerLabel} onBack={onBack} queueScope={queueScope} setQueueScope={setQueueScope}>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-8 text-center">
                    <Check className="mx-auto mb-4 h-10 w-10 text-emerald-300" />
                    <h3 className="text-lg font-bold text-zinc-100">Không còn câu trong hàng đợi này.</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
                        Chuyển sang Review all hoặc Browse Bank nếu bạn muốn làm lại toàn bộ bộ câu hỏi ngay bây giờ.
                    </p>
                    <button
                        type="button"
                        onClick={() => setQueueScope('all')}
                        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
                    >
                        <Shuffle className="h-4 w-4" />
                        Review all
                    </button>
                </div>
            </SessionShell>
        )
    }

    const optionOrder = getOptionOrder(current, mode)
    const selectedCorrect = selected === current.correctAnswer
    const writeCorrect = isCloseRecallAnswer(typed, current.correctAnswer)

    return (
        <SessionShell title={headerLabel} onBack={onBack} queueScope={queueScope} setQueueScope={setQueueScope}>
            <div className="mb-4 flex items-center justify-between gap-3 text-xs text-zinc-400">
                <span>Question {index + 1} / {sessionQueue.length}</span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={previous}
                        disabled={index === 0}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-300 disabled:opacity-40"
                        aria-label="Previous question"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={advance}
                        disabled={index >= sessionQueue.length - 1}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-300 disabled:opacity-40"
                        aria-label="Next question"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <QuestionCard
                question={current}
                progress={currentProgress}
                revealed={revealed || !!selected || checked}
                onReveal={() => setRevealed(true)}
                onBookmark={() => onBookmark(current)}
            />

            {(mode === 'due' || mode === 'flashcards') && (
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                    {!revealed ? (
                        <button
                            type="button"
                            onClick={() => setRevealed(true)}
                            className="md:col-span-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
                        >
                            <Eye className="h-4 w-4" />
                            Reveal answer
                        </button>
                    ) : (
                        <>
                            <RateButton label="Hard" hint="Review soon" icon={X} disabled={isPending} onClick={() => onRate(current.id, 1, false, advance)} tone="red" />
                            <RateButton label="Good" hint="Had to think" icon={RotateCcw} disabled={isPending} onClick={() => onRate(current.id, 3, true, advance)} tone="amber" />
                            <RateButton label="Easy" hint="Instant recall" icon={Sparkles} disabled={isPending} onClick={() => onRate(current.id, 5, true, advance)} tone="emerald" />
                        </>
                    )}
                </div>
            )}

            {(mode === 'quiz' || mode === 'sprint') && (
                <div className="mt-4 space-y-2">
                    {optionOrder.map((option) => {
                        const isSelected = selected === option
                        const isCorrect = option === current.correctAnswer
                        const answered = !!selected
                        const tone = answered && isCorrect
                            ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100'
                            : answered && isSelected
                                ? 'border-red-500/60 bg-red-500/10 text-red-100'
                                : 'border-white/10 bg-zinc-950/60 text-zinc-100 hover:border-violet-500/40'
                        return (
                            <button
                                key={option}
                                type="button"
                                disabled={answered || isPending}
                                onClick={() => {
                                    const correct = option === current.correctAnswer
                                    setSelected(option)
                                    onRate(current.id, qualityFromCorrect(correct), correct)
                                }}
                                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${tone}`}
                            >
                                <span>{option}</span>
                                {answered && isCorrect && <Check className="h-4 w-4 shrink-0" />}
                                {answered && isSelected && !isCorrect && <X className="h-4 w-4 shrink-0" />}
                            </button>
                        )
                    })}
                    {selected && (
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={advance}
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
                            >
                                {selectedCorrect ? 'Next' : 'Learn and continue'}
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {mode === 'write' && (
                <div className="mt-4 space-y-3">
                    <textarea
                        value={typed}
                        onChange={(event) => setTyped(event.target.value)}
                        placeholder="Type the exact answer or the main keywords you remember..."
                        className="min-h-[112px] w-full rounded-xl border border-white/10 bg-zinc-950/70 p-4 text-base text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-500/50"
                    />
                    {!checked ? (
                        <button
                            type="button"
                            onClick={() => {
                                setChecked(true)
                                onRate(current.id, qualityFromCorrect(writeCorrect), writeCorrect)
                            }}
                            disabled={!typed.trim() || isPending}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                        >
                            <Check className="h-4 w-4" />
                            Check recall
                        </button>
                    ) : (
                        <div className={`rounded-xl border p-4 text-sm ${writeCorrect ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/30 bg-amber-500/10 text-amber-100'}`}>
                            <div className="font-semibold">{writeCorrect ? 'Close enough.' : 'Not close yet.'}</div>
                            <div className="mt-1 text-zinc-200">Correct answer: {current.correctAnswer}</div>
                            <button
                                type="button"
                                onClick={advance}
                                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-white/10 px-3 py-2 font-semibold text-white hover:bg-white/15"
                            >
                                Continue
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="mt-4">
                <QuestionDetail question={current} progress={currentProgress} onBookmark={() => onBookmark(current)} compact={false} />
            </div>
        </SessionShell>
    )
}

function SessionShell({ title, onBack, queueScope, setQueueScope, children }: {
    title: string
    onBack: () => void
    queueScope: QueueScope
    setQueueScope: (scope: QueueScope) => void
    children: React.ReactNode
}) {
    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/10"
                >
                    <ChevronLeft className="h-4 w-4" />
                    StudyPlace
                </button>
                <div className="min-w-0 flex-1 text-left md:text-center">
                    <h3 className="text-xl font-bold text-zinc-50">{title}</h3>
                </div>
                <div className="inline-flex w-fit rounded-xl border border-white/10 bg-zinc-950/70 p-1">
                    {(['due', 'all', 'bookmarked'] as QueueScope[]).map((scope) => (
                        <button
                            key={scope}
                            type="button"
                            onClick={() => setQueueScope(scope)}
                            className={`min-h-9 rounded-lg px-3 text-xs font-semibold capitalize transition-colors ${queueScope === scope ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-100'}`}
                        >
                            {scope}
                        </button>
                    ))}
                </div>
            </div>
            {children}
        </div>
    )
}

function QuestionCard({ question, progress, revealed, onReveal, onBookmark }: {
    question: StudyPlaceQuestion
    progress?: StudyPlaceProgressDTO
    revealed: boolean
    onReveal: () => void
    onBookmark: () => void
}) {
    return (
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold">#{question.id}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{masteryLabel(progress)}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{formatNextReview(progress)}</span>
                </div>
                <button
                    type="button"
                    onClick={onBookmark}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-zinc-300 hover:bg-white/10"
                    aria-label="Toggle bookmark"
                >
                    {progress?.bookmarked ? <BookmarkCheck className="h-4 w-4 text-violet-300" /> : <Bookmark className="h-4 w-4" />}
                </button>
            </div>
            <div className="whitespace-pre-wrap text-lg font-semibold leading-8 text-zinc-50">{question.question}</div>
            {!revealed ? (
                <button
                    type="button"
                    onClick={onReveal}
                    className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/10"
                >
                    <Eye className="h-4 w-4" />
                    Peek answer
                </button>
            ) : (
                <div className="mt-5 rounded-xl border border-violet-500/20 bg-violet-500/10 p-4">
                    <div className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-violet-300">Answer</div>
                    <div className="text-base font-bold text-white">{question.correctAnswer}</div>
                </div>
            )}
        </div>
    )
}

function QuestionDetail({ question, progress, onBookmark, compact }: {
    question: StudyPlaceQuestion
    progress?: StudyPlaceProgressDTO
    onBookmark: () => void
    compact: boolean
}) {
    return (
        <details className="rounded-2xl border border-white/10 bg-zinc-950/50 p-4" open={!compact}>
            <summary className="cursor-pointer list-none">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                            <span>#{question.id}</span>
                            <span>{masteryLabel(progress)}</span>
                            {question.tags?.map((tag) => <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5 text-zinc-400">{tag}</span>)}
                        </div>
                        <div className={`${compact ? 'line-clamp-2' : ''} whitespace-pre-wrap text-sm font-semibold leading-6 text-zinc-100`}>
                            {question.question}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.preventDefault()
                            onBookmark()
                        }}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-zinc-300 hover:bg-white/10"
                    >
                        {progress?.bookmarked ? <BookmarkCheck className="h-4 w-4 text-violet-300" /> : <Bookmark className="h-4 w-4" />}
                    </button>
                </div>
            </summary>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
                <div className="space-y-3">
                    <InfoBlock title="Correct answer">{question.correctAnswer}</InfoBlock>
                    <InfoBlock title="Vietnamese meaning">{question.viTranslation}</InfoBlock>
                    {question.viExplanation && <InfoBlock title="Explanation">{question.viExplanation}</InfoBlock>}
                    {question.whyCorrect && <InfoBlock title="Why this is correct">{question.whyCorrect}</InfoBlock>}
                </div>
                <div className="space-y-3">
                    {question.keyTerms && question.keyTerms.length > 0 && (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">Key terms</div>
                            <div className="space-y-2">
                                {question.keyTerms.map((term, index) => (
                                    <div key={`${term.term}-${index}`} className="rounded-lg bg-black/20 p-3 text-sm">
                                        <div className="font-semibold text-zinc-100">{term.term}</div>
                                        <div className="mt-1 text-zinc-300">{term.meaning}</div>
                                        <div className="mt-1 text-xs leading-5 text-zinc-500">{term.note}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {question.grammarNotes && question.grammarNotes.length > 0 && (
                        <InfoBlock title="Grammar / reading cues">{question.grammarNotes.join('\n')}</InfoBlock>
                    )}
                    {question.memoryHook && <InfoBlock title="Memory hook">{question.memoryHook}</InfoBlock>}
                    <InfoBlock title="Progress">
                        {`Attempts: ${progress?.attempts ?? 0}\nCorrect: ${progress?.correctAttempts ?? 0}\nLapses: ${progress?.lapses ?? 0}\nNext review: ${formatNextReview(progress)}`}
                    </InfoBlock>
                </div>
            </div>
        </details>
    )
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">{title}</div>
            <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">{children}</div>
        </div>
    )
}

function RateButton({ label, hint, icon: Icon, disabled, onClick, tone }: {
    label: string
    hint: string
    icon: any
    disabled: boolean
    onClick: () => void
    tone: 'red' | 'amber' | 'emerald'
}) {
    const cls = {
        red: 'border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500/15',
        amber: 'border-amber-500/20 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15',
        emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15',
    }[tone]
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={`min-h-16 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${cls}`}
        >
            <div className="flex items-center gap-2 font-semibold">
                <Icon className="h-4 w-4" />
                {label}
            </div>
            <div className="mt-1 text-xs opacity-75">{hint}</div>
        </button>
    )
}
