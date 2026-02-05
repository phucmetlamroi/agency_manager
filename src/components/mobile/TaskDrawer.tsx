"use client"

import { Drawer } from "vaul"
import { TaskWithUser } from "@/types/admin" // Or your type definition
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Calendar, Clock, Link as LinkIcon, Edit, User } from "lucide-react"

interface TaskDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    task: TaskWithUser | null
    isAdmin?: boolean
    onEdit?: () => void
    onClose?: () => void
}

export function TaskDrawer({ open, onOpenChange, task, isAdmin, onEdit }: TaskDrawerProps) {
    if (!task) return null

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" />
                <Drawer.Content className="bg-zinc-950 flex flex-col rounded-t-[10px] h-[96%] mt-24 fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 outline-none">
                    <div className="p-4 bg-zinc-950 rounded-t-[10px] flex-1 overflow-auto">
                        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-700 mb-8" />

                        <div className="max-w-md mx-auto">
                            <Drawer.Title className="font-bold mb-2 text-2xl text-white">
                                {task.title}
                            </Drawer.Title>

                            <div className="flex items-center gap-2 mb-6">
                                <Badge variant="outline">{task.status}</Badge>
                                <Badge variant="secondary">{task.type}</Badge>
                                {task.client && (
                                    <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">{task.client.name}</Badge>
                                )}
                            </div>

                            <Separator className="my-4 bg-zinc-800" />

                            <div className="space-y-6">
                                {/* Details Grid */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
                                        <div className="flex items-center gap-2 text-zinc-400 mb-1">
                                            <Calendar className="w-4 h-4" />
                                            <span className="text-xs">Deadline</span>
                                        </div>
                                        <p className="font-mono text-sm text-zinc-200">
                                            {task.deadline ? new Date(task.deadline).toLocaleDateString('vi-VN') : 'No date'}
                                        </p>
                                    </div>

                                    <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
                                        <div className="flex items-center gap-2 text-zinc-400 mb-1">
                                            <Clock className="w-4 h-4" />
                                            <span className="text-xs">Time</span>
                                        </div>
                                        <p className="font-mono text-sm text-zinc-200">
                                            {Math.floor((task.accumulatedSeconds || 0) / 3600)}h {Math.floor(((task.accumulatedSeconds || 0) % 3600) / 60)}m
                                        </p>
                                    </div>
                                </div>

                                {/* Assignee */}
                                <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50">
                                    <h4 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                                        <User className="w-4 h-4" /> Assignee
                                    </h4>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/30">
                                            {task.assignee?.username?.[0] || '?'}
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">{task.assignee?.username || 'Unassigned'}</p>
                                            <p className="text-xs text-zinc-500">{task.assignee ? 'Staff Member' : 'Tap to assign'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Instructions */}
                                <div>
                                    <h4 className="text-sm font-medium text-zinc-400 mb-2">Instructions</h4>
                                    <p className="text-sm text-zinc-300 leading-relaxed bg-zinc-900 p-4 rounded-lg border border-zinc-800">
                                        {task.notes || "No specific instructions provided."}
                                    </p>
                                </div>

                                {/* Link */}
                                {task.productLink && (
                                    <a
                                        href={task.productLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 w-full p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors"
                                    >
                                        <LinkIcon className="w-4 h-4" />
                                        Open Product Link
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Fixed Footer Actions */}
                    <div className="p-4 bg-zinc-950 border-t border-zinc-800 mt-auto">
                        <div className="max-w-md mx-auto grid grid-cols-2 gap-4">
                            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
                                Close
                            </Button>
                            {isAdmin && (
                                <Button onClick={onEdit} className="w-full bg-white text-black hover:bg-gray-200">
                                    <Edit className="w-4 h-4 mr-2" />
                                    Edit Task
                                </Button>
                            )}
                        </div>
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    )
}
