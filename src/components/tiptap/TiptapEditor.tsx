'use client'

import { useEditor, EditorContent, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import {
    Bold, Italic, Link as LinkIcon, Unlink, Underline as UnderlineIcon,
    Strikethrough, Heading1, Heading2, ListChecks, List, ListOrdered,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    Undo2, Redo2, MoveVertical,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

interface TiptapEditorProps {
    content: string
    onChange: (html: string) => void
    editable?: boolean
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Custom LineHeight extension                                            */
/*  Tiptap v3 doesn't ship a line-height extension; we add a simple one    */
/*  that injects `style="line-height: X"` on paragraphs + headings.        */
/* ────────────────────────────────────────────────────────────────────── */

const LINE_HEIGHTS = ['1.0', '1.15', '1.5', '2.0', '2.5', '3.0'] as const

const LineHeight = Extension.create({
    name: 'lineHeight',
    addOptions() {
        return { types: ['paragraph', 'heading'] as string[], defaultLineHeight: '' }
    },
    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    lineHeight: {
                        default: this.options.defaultLineHeight,
                        parseHTML: (el: HTMLElement) => el.style.lineHeight || '',
                        renderHTML: (attrs: Record<string, any>) => {
                            if (!attrs.lineHeight) return {}
                            return { style: `line-height: ${attrs.lineHeight}` }
                        },
                    },
                },
            },
        ]
    },
    addCommands() {
        return {
            setLineHeight:
                (value: string) =>
                    ({ commands }: any) => {
                        return this.options.types.every((type: string) =>
                            commands.updateAttributes(type, { lineHeight: value }),
                        )
                    },
            unsetLineHeight:
                () =>
                    ({ commands }: any) => {
                        return this.options.types.every((type: string) =>
                            commands.resetAttributes(type, 'lineHeight'),
                        )
                    },
        } as any
    },
})

/* ────────────────────────────────────────────────────────────────────── */
/*  Main Editor                                                            */
/* ────────────────────────────────────────────────────────────────────── */

export default function TiptapEditor({ content, onChange, editable = true }: TiptapEditorProps) {
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
    const [linkUrl, setLinkUrl] = useState('')
    const [linkText, setLinkText] = useState('')
    const [lhMenuOpen, setLhMenuOpen] = useState(false)
    const lhRef = useRef<HTMLDivElement>(null)

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2] },
            }),
            Underline,
            Link.configure({
                openOnClick: false,
                autolink: true,
                linkOnPaste: true,
                defaultProtocol: 'https',
                HTMLAttributes: {
                    class: 'text-blue-500 underline cursor-pointer hover:text-blue-700',
                },
            }),
            TaskList,
            TaskItem.configure({ nested: true }),
            TextAlign.configure({
                types: ['heading', 'paragraph'],
                alignments: ['left', 'center', 'right', 'justify'],
            }),
            LineHeight,
        ],
        content,
        editable,
        immediatelyRender: false,
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[150px] p-3',
            },
        },
    })

    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            if (editor.isEmpty && content) {
                editor.commands.setContent(content)
            }
        }
    }, [content, editor])

    // Close line-height menu on outside click
    useEffect(() => {
        if (!lhMenuOpen) return
        const handler = (e: MouseEvent) => {
            if (lhRef.current && !lhRef.current.contains(e.target as Node)) {
                setLhMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [lhMenuOpen])

    if (!editor) return null

    const setLink = () => {
        const previousUrl = editor.getAttributes('link').href
        const selectionText = editor.state.doc.textBetween(
            editor.state.selection.from,
            editor.state.selection.to,
            ' ',
        )
        setLinkUrl(previousUrl || '')
        setLinkText(selectionText || '')
        setIsLinkModalOpen(true)
    }

    const saveLink = () => {
        if (linkUrl) {
            if (linkText && editor.state.selection.empty) {
                editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkText}</a>`).run()
            } else if (
                linkText &&
                linkText !== editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ')
            ) {
                editor
                    .chain()
                    .focus()
                    .extendMarkRange('link')
                    .insertContent({
                        type: 'text',
                        text: linkText,
                        marks: [{ type: 'link', attrs: { href: linkUrl } }],
                    })
                    .run()
            } else {
                editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run()
            }
        } else {
            editor.chain().focus().unsetLink().run()
        }
        setIsLinkModalOpen(false)
        setLinkUrl('')
        setLinkText('')
    }

    const removeLink = () => editor.chain().focus().unsetLink().run()

    const setLineHeight = (value: string) => {
        ;(editor.chain().focus() as any).setLineHeight(value).run()
        setLhMenuOpen(false)
    }

    /* ── Toolbar button helper ── */
    const ToolbarButton = ({
        onClick,
        isActive,
        Icon,
        title,
        disabled = false,
    }: {
        onClick: () => void
        isActive?: boolean
        Icon: React.ComponentType<{ size?: number; className?: string }>
        title: string
        disabled?: boolean
    }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`p-1.5 rounded-md transition-colors flex items-center justify-center
                ${isActive ? 'bg-zinc-200 text-black dark:bg-zinc-700 dark:text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10'}
                disabled:opacity-40 disabled:cursor-not-allowed`}
        >
            <Icon size={16} />
        </button>
    )

    const Sep = () => <div className="w-[1px] h-4 bg-zinc-300/40 mx-1" />

    return (
        <div className="flex flex-col h-full">
            {/* LINK EDIT MODAL */}
            {isLinkModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-zinc-950 border border-white/10 p-4 rounded-lg shadow-xl w-80 flex flex-col gap-3">
                        <h3 className="font-bold text-sm text-zinc-100">Edit Link</h3>
                        <div>
                            <label className="text-xs text-zinc-500 font-bold">Text to display</label>
                            <input
                                value={linkText}
                                onChange={(e) => setLinkText(e.target.value)}
                                placeholder="Text..."
                                className="w-full p-2 border border-white/10 bg-white/5 text-zinc-200 rounded text-sm mt-1 outline-none focus:border-violet-500/50"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-zinc-500 font-bold">URL</label>
                            <input
                                value={linkUrl}
                                onChange={(e) => setLinkUrl(e.target.value)}
                                placeholder="https://..."
                                className="w-full p-2 border border-white/10 bg-white/5 text-zinc-200 rounded text-sm mt-1 outline-none focus:border-violet-500/50"
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setIsLinkModalOpen(false)} className="px-3 py-1 text-xs font-bold text-zinc-400 hover:bg-white/5 rounded">Cancel</button>
                            <button onClick={saveLink} className="px-3 py-1 text-xs font-bold bg-violet-600 text-white rounded hover:bg-violet-500">Save Link</button>
                        </div>
                    </div>
                </div>
            )}

            {/* TOOLBAR — Figma layout: undo/redo | B I link U strike | H1 H2 | task bullet ordered | align(4) | line-height */}
            {editable && (
                <div className="sticky top-0 z-10 border-b border-white/5 bg-white/[0.02] p-1.5 flex flex-wrap gap-0.5 items-center">
                    {/* History */}
                    <ToolbarButton
                        onClick={() => editor.chain().focus().undo().run()}
                        Icon={Undo2}
                        title="Undo"
                        disabled={!editor.can().undo()}
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().redo().run()}
                        Icon={Redo2}
                        title="Redo"
                        disabled={!editor.can().redo()}
                    />
                    <Sep />

                    {/* Inline marks */}
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        isActive={editor.isActive('bold')}
                        Icon={Bold}
                        title="Bold"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        isActive={editor.isActive('italic')}
                        Icon={Italic}
                        title="Italic"
                    />
                    <ToolbarButton
                        onClick={setLink}
                        isActive={editor.isActive('link')}
                        Icon={LinkIcon}
                        title="Link"
                    />
                    {editor.isActive('link') && (
                        <ToolbarButton onClick={removeLink} Icon={Unlink} title="Remove link" />
                    )}
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        isActive={editor.isActive('underline')}
                        Icon={UnderlineIcon}
                        title="Underline"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        isActive={editor.isActive('strike')}
                        Icon={Strikethrough}
                        title="Strikethrough"
                    />
                    <Sep />

                    {/* Headings */}
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        isActive={editor.isActive('heading', { level: 1 })}
                        Icon={Heading1}
                        title="Heading 1"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        isActive={editor.isActive('heading', { level: 2 })}
                        Icon={Heading2}
                        title="Heading 2"
                    />
                    <Sep />

                    {/* Lists */}
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleTaskList().run()}
                        isActive={editor.isActive('taskList')}
                        Icon={ListChecks}
                        title="Task list"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        isActive={editor.isActive('bulletList')}
                        Icon={List}
                        title="Bullet list"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        isActive={editor.isActive('orderedList')}
                        Icon={ListOrdered}
                        title="Ordered list"
                    />
                    <Sep />

                    {/* Text alignment */}
                    <ToolbarButton
                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                        isActive={editor.isActive({ textAlign: 'left' })}
                        Icon={AlignLeft}
                        title="Align left"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                        isActive={editor.isActive({ textAlign: 'center' })}
                        Icon={AlignCenter}
                        title="Align center"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                        isActive={editor.isActive({ textAlign: 'right' })}
                        Icon={AlignRight}
                        title="Align right"
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                        isActive={editor.isActive({ textAlign: 'justify' })}
                        Icon={AlignJustify}
                        title="Justify"
                    />
                    <Sep />

                    {/* Line height (dropdown) */}
                    <div className="relative" ref={lhRef}>
                        <button
                            type="button"
                            onClick={() => setLhMenuOpen((v) => !v)}
                            title="Line height"
                            className={`p-1.5 rounded-md transition-colors flex items-center justify-center ${lhMenuOpen ? 'bg-zinc-200 text-black dark:bg-zinc-700 dark:text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10'}`}
                        >
                            <MoveVertical size={16} />
                        </button>
                        {lhMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 z-50 min-w-[100px] rounded-lg border border-white/10 bg-zinc-950 shadow-xl py-1">
                                {LINE_HEIGHTS.map((lh) => (
                                    <button
                                        key={lh}
                                        type="button"
                                        onClick={() => setLineHeight(lh)}
                                        className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
                                    >
                                        {lh}
                                    </button>
                                ))}
                                <div className="h-px bg-white/5 my-1" />
                                <button
                                    type="button"
                                    onClick={() => {
                                        ;(editor.chain().focus() as any).unsetLineHeight().run()
                                        setLhMenuOpen(false)
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-white/5"
                                >
                                    Default
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* CONTENT — SCROLLABLE */}
            <div className="flex-1 overflow-y-auto min-h-[150px] relative scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <EditorContent editor={editor} className="h-full" />
            </div>
        </div>
    )
}
