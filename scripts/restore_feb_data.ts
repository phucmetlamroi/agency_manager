import fs from 'fs'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
    console.log("--- Bắt đầu khôi phục dữ liệu Tháng 2/2026 ---")

    // 1. Tạo Workspace Tháng 2/2026
    const workspaceName = "Tháng 2/2026"
    let workspace = await prisma.workspace.findFirst({
        where: { name: workspaceName }
    })

    if (!workspace) {
        workspace = await prisma.workspace.create({
            data: {
                id: 'legacy-feb-2026',
                name: workspaceName,
                description: 'Dữ liệu được khôi phục từ bản backup cũ'
            }
        })
        console.log(`[TẠO MỚI] Workspace: ${workspace.name}`)
    } else {
        console.log(`[TÌM THẤY] Workspace: ${workspace.name}`)
    }

    const wId = workspace.id

    // 2. Tạo Users (với mật khẩu mặc định 123456)
    const passwordsHash = await bcrypt.hash('123456', 10)
    const usersToCreate = [
        { username: 'Bảo Phúc', role: 'USER' },
        { username: 'Daniel Hee', role: 'USER' },
        { username: 'Phúc Phạm', role: 'USER' },
        { username: 'Văn Ngữ', role: 'USER' },
        { username: 'admin', role: 'ADMIN' } // Admin should already exist, but just in case
    ]

    for (const u of usersToCreate) {
        let userDB = await prisma.user.findUnique({
            where: { username: u.username }
        })

        if (!userDB) {
            userDB = await prisma.user.create({
                data: {
                    username: u.username,
                    password: passwordsHash,
                    role: u.role as any
                }
            })
            console.log(`[TẠO MỚI] User: ${userDB.username}`)
        }

        // Link user to workspace
        const memberRole = u.role === 'ADMIN' ? 'OWNER' : 'MEMBER'
        await prisma.workspaceMember.upsert({
            where: {
                userId_workspaceId: {
                    userId: userDB.id,
                    workspaceId: wId
                }
            },
            update: { role: memberRole },
            create: {
                userId: userDB.id,
                workspaceId: wId,
                role: memberRole
            }
        })
    }

    // 3. Đọc dữ liệu từ pending_tasks_export.md
    try {
        const fileContent = fs.readFileSync('pending_tasks_export.md', 'utf-8')
        const jsonMatch = fileContent.match(/```json\n([\s\S]*?)\n```/)

        if (jsonMatch && jsonMatch[1]) {
            const tasksData = JSON.parse(jsonMatch[1])
            console.log(`\nĐã tải ${tasksData.length} tasks từ file backup. Bắt đầu restore...`)

            for (const t of tasksData) {
                // 3.1 Khôi phục Client / Parent Client
                let clientId = null
                if (t.client) {
                    let parentId = null
                    if (t.client.parent) {
                        const parentName = t.client.parent.name
                        let parentDb = await prisma.client.findFirst({
                            where: { name: parentName, workspaceId: wId, parentId: null }
                        })
                        if (!parentDb) {
                            parentDb = await prisma.client.create({
                                data: { name: parentName, workspaceId: wId }
                            })
                            console.log(`  [TẠO] Parent Client: ${parentName}`)
                        }
                        parentId = parentDb.id
                    }

                    const clientName = t.client.name
                    let clientDb = await prisma.client.findFirst({
                        where: { name: clientName, workspaceId: wId, parentId }
                    })
                    if (!clientDb) {
                        clientDb = await prisma.client.create({
                            data: { name: clientName, workspaceId: wId, parentId }
                        })
                        console.log(`  [TẠO] Client: ${clientName}`)
                    }
                    clientId = clientDb.id
                }

                // 3.2 Khôi phục Task
                const existingTask = await prisma.task.findUnique({
                    where: { id: t.id }
                })

                if (!existingTask) {
                    await prisma.task.create({
                        data: {
                            id: t.id,
                            title: t.title,
                            deadline: t.deadline ? new Date(t.deadline) : null,
                            value: t.value || 0,
                            isPenalized: t.isPenalized || false,
                            status: t.status,
                            type: t.type,
                            references: t.references,
                            resources: t.resources,
                            notes_vi: t.notes_vi || t.notes, // Accommodate both formats for restoration
                            fileLink: t.fileLink,
                            productLink: t.productLink,
                            collectFilesLink: t.collectFilesLink,
                            jobPriceUSD: t.jobPriceUSD || 0,
                            wageVND: t.wageVND || 0,
                            exchangeRate: t.exchangeRate || 0,
                            profitVND: t.profitVND || 0,
                            workspaceId: wId,
                            clientId: clientId,
                            createdAt: t.createdAt ? new Date(t.createdAt) : undefined,
                            updatedAt: t.updatedAt ? new Date(t.updatedAt) : undefined
                        }
                    })
                    console.log(`[RESTORED TASK] ${t.title}`)
                } else {
                    console.log(`[BỎ QUA] Task ${t.title} đã tồn tại.`)
                }
            }
        } else {
            console.log("Không tìm thấy khối JSON trong file pending_tasks_export.md")
        }
    } catch (error) {
        console.error("Lỗi khi đọc hoặc phân tích file backup:", error)
    }

    console.log("--- HOÀN TẤT KHÔI PHỤC ---")
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect()
    })
