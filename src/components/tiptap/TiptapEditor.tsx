'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Bold, Italic, Link as LinkIcon, Unlink, CheckSquare, Heading1, Heading2, List, ListOrdered, Strikethrough } from 'lucide-react'
import { useState, useEffect } from 'react'

interface TiptapEditorProps {
    content: string
    onChange: (html: string) => void
    editable?: boolean
}

export default function TiptapEditor({ content, onChange, editable = true }: TiptapEditorProps) {
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
    const [linkUrl, setLinkUrl] = useState('')
    const [linkText, setLinkText] = useState('')

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2],
                },
            }),
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
            TaskItem.configure({
                nested: true,
            }),
        ],
        content: content,
        editable: editable,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML())
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[150px] p-2',
            },
        },
    })

    // Sync content updates from parent (if needed)
    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            if (editor.isEmpty && content) {
                editor.commands.setContent(content)
            }
        }
    }, [content, editor])

    if (!editor) {
        return null
    }

    const setLink = () => {
        const previousUrl = editor.getAttributes('link').href
        const selectionText = editor.state.doc.textBetween(
            editor.state.selection.from,
            editor.state.selection.to,
            ' '
        )

        setLinkUrl(previousUrl || '')
        setLinkText(selectionText || '')
        setIsLinkModalOpen(true)
    }

    const saveLink = () => {
        if (linkUrl) {
            if (linkText && editor.state.selection.empty) {
                editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkText}</a>`).run()
            } else if (linkText && linkText !== editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ')) {
                editor.chain().focus()
                    .extendMarkRange('link')
                    .insertContent({
                        type: 'text',
                        text: linkText,
                        marks: [{ type: 'link', attrs: { href: linkUrl } }]
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

    const removeLink = () => {
        editor.chain().focus().unsetLink().run()
    }

    // Toolbar Component
    const ToolbarButton = ({ onClick, isActive, Icon, colorClass = "text-gray-600" }: any) => (
        <button
            onClick={onClick}
            className={`p-1.5 rounded-md transition-colors ${isActive ? 'bg-gray-200 text-black' : 'hover:bg-gray-100 ' + colorClass}`}
            type="button"
        >
            <Icon size={16} />
        </button>
    )

    return (
        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden flex flex-col">
            {/* LINK EDIT MODAL */}
            {isLinkModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <div className="bg-white p-4 rounded-lg shadow-xl w-80 flex flex-col gap-3 animation-fadeIn">
                        <h3 className="font-bold text-sm">Edit Link</h3>
                        <div>
                            <label className="text-xs text-gray-500 font-bold">Text to display</label>
                            <input
                                value={linkText}
                                onChange={e => setLinkText(e.target.value)}
                                placeholder="Text..."
                                className="w-full p-2 border rounded text-sm mt-1"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 font-bold">URL</label>
                            <input
                                value={linkUrl}
                                onChange={e => setLinkUrl(e.target.value)}
                                placeholder="https://..."
                                className="w-full p-2 border rounded text-sm mt-1"
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setIsLinkModalOpen(false)} className="px-3 py-1 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
                            <button onClick={saveLink} className="px-3 py-1 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700">Save Link</button>
                        </div>
                    </div>
                </div>
            )}

            {/* TOOLBAR */}
            {editable && (
                <div className="border-b border-gray-100 bg-gray-50/50 p-1 flex flex-wrap gap-1 items-center">
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        isActive={editor.isActive('bold')}
                        Icon={Bold}
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        isActive={editor.isActive('italic')}
                        Icon={Italic}
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        isActive={editor.isActive('strike')}
                        Icon={Strikethrough}
                    />
                    <div className="w-[1px] h-4 bg-gray-300 mx-1"></div>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                        isActive={editor.isActive('heading', { level: 1 })}
                        Icon={Heading1}
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        isActive={editor.isActive('heading', { level: 2 })}
                        Icon={Heading2}
                    />
                    <div className="w-[1px] h-4 bg-gray-300 mx-1"></div>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        isActive={editor.isActive('bulletList')}
                        Icon={List}
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        isActive={editor.isActive('orderedList')}
                        Icon={ListOrdered}
                    />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().toggleTaskList().run()}
                        isActive={editor.isActive('taskList')}
                        Icon={CheckSquare}
                    />
                    <div className="w-[1px] h-4 bg-gray-300 mx-1"></div>
                    <ToolbarButton
                        onClick={setLink}
                        isActive={editor.isActive('link')}
                        Icon={LinkIcon}
                        colorClass={editor.isActive('link') ? "text-blue-600" : "text-gray-600"}
                    />
                    {editor.isActive('link') && (
                        <ToolbarButton
                            onClick={removeLink}
                            isActive={false}
                            Icon={Unlink}
                            colorClass="text-red-500 hover:bg-red-50"
                        />
                    )}
                </div>
            )}

            <div className="flex-1 overflow-auto max-h-[400px]">
                <EditorContent editor={editor} />
            </div>
        </div>
    )
}
