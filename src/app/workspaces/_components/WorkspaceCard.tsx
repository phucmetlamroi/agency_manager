import { Card, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MoreHorizontal } from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { vi } from "date-fns/locale"

interface WorkspaceCardProps {
    workspace: {
        id: string
        name: string
        description: string | null
        updatedAt: Date
    }
    role: string
}

export function WorkspaceCard({ workspace, role }: WorkspaceCardProps) {
    return (
        <Link href={`/${workspace.id}/dashboard`} className="block group">
            <Card className="relative overflow-hidden bg-slate-900 border-slate-800 transition-all duration-300 group-hover:border-indigo-500/50 group-hover:shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)] cursor-pointer h-64 flex flex-col justify-end p-5 rounded-xl">

                {/* Simulated Image Background */}
                <div className="absolute inset-0 z-0 bg-gradient-to-br from-indigo-900/40 to-slate-900">
                    {/* Pattern Overlay */}
                    <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent" />
                </div>

                <div className="relative z-10 flex flex-col h-full justify-between">
                    <div className="flex justify-end">
                        <Badge variant={role === 'OWNER' ? 'default' : 'secondary'} className={role === 'OWNER' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-800 text-slate-300'}>
                            {role}
                        </Badge>
                    </div>

                    <div>
                        <CardTitle className="text-2xl text-white font-semibold tracking-tight mb-2">
                            {workspace.name}
                        </CardTitle>
                        <CardDescription className="text-slate-400 line-clamp-2 min-h-[2.5rem]">
                            {workspace.description || 'Không gian làm việc'}
                        </CardDescription>

                        <div className="mt-4 flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/50 pt-4">
                            <span>
                                Cập nhật {formatDistanceToNow(new Date(workspace.updatedAt), { addSuffix: true, locale: vi })}
                            </span>
                            <div className="p-1.5 rounded-md hover:bg-slate-800 transition-colors">
                                <MoreHorizontal className="w-4 h-4 text-slate-400" />
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        </Link>
    )
}
