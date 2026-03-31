import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const STAFF_MAPPING: Record<string, string> = {
    "Em Huy": "Daniel Hee",
    "Trần Khang": "Trần Khang",
    "Khang": "Trần Khang",
    "Khang ": "Trần Khang",
    "Kiệt": "Tuấn Kiệt",
    "Tuấn Kiệt": "Tuấn Kiệt",
    "Kiệt Tuấn": "Tuấn Kiệt",
    "Phúc": "Bảo Phúc",
    "Bảo Phúc": "Bảo Phúc",
    "Đạt": "Tấn Đạt",
    "Tấn Đạt": "Tấn Đạt",
    "Ngữ": "Văn Ngữ",
    "Văn Ngữ": "Văn Ngữ",
    "Ngữ Huỳnh Văn": "Văn Ngữ",
    "Phúc Phạm": "Phúc Phạm"
};

function excelDateToJSDate(excelDate: number) {
    if (!excelDate) return new Date();
    return new Date(Math.round((excelDate - 25569) * 86400 * 1000));
}

export async function GET() {
    try {
        console.log("Starting Import Process via API...");
        const jsonPath = path.join(process.cwd(), 'public', 'temp_data.json');
        
        if (!fs.existsSync(jsonPath)) {
            return NextResponse.json({ error: "temp_data.json not found" }, { status: 404 });
        }
        
        const fileData = fs.readFileSync(jsonPath, 'utf-8');
        const data = JSON.parse(fileData);

        const profiles = await prisma.profile.findMany();
        const profile = profiles.find(p => p.name.includes('Hustly'));
        if (!profile) return NextResponse.json({ error: "Hustly profile not found" });

        const workspaces = await prisma.workspace.findMany({ where: { profileId: profile.id } });
        const workspace = workspaces.find(w => w.name.includes('tháng 1/2026') || (w.name.includes('1') && w.name.includes('2026')));
        if (!workspace) return NextResponse.json({ error: "Workspace tháng 1/2026 not found" });

        const users = await prisma.user.findMany();
        let clientsMap = new Map();
        const existingClients = await prisma.client.findMany({ where: { workspaceId: workspace.id }});
        existingClients.forEach(c => clientsMap.set(c.name.toLowerCase(), c));

        let tasksToInsert = [];
        let clientsCreated = 0;

        for (const row of data as any[]) {
            const clientNameRaw = row["Cột 1"];
            const titleRaw = row["Tên video"];
            const typeRaw = row["Loại"] || "Short form";
            const assigneeRaw = row["Người nhận quà"] || row["__EMPTY"];
            const statusRaw = row["Trạng thái"] || "Hoàn tất";
            const deadlineRaw = row["deadline"];
            const referencesRaw = row["References"] || row["RAW"];
            const priceRaw = row["Giá"]; 
            
            if (!titleRaw) continue; 

            // 1. Resolve Client
            let clientId = null;
            if (clientNameRaw) {
                const cName = String(clientNameRaw).trim();
                const lowerCName = cName.toLowerCase();
                let client = clientsMap.get(lowerCName);
                if (!client) {
                    client = await prisma.client.create({
                        data: {
                            name: cName,
                            workspaceId: workspace.id,
                            profileId: profile.id,
                            aiScore: 0,
                            frictionIndex: 0
                        }
                    });
                    clientsMap.set(lowerCName, client);
                    clientsCreated++;
                }
                clientId = client.id;
            }

            // 2. Resolve Assignee
            let assigneeId = null;
            let notesVi = "";
            let editorName = String(assigneeRaw || "").trim();
            
            if (!editorName || editorName === "undefined") {
                 editorName = String(row["Người nhận quà"] || row["__EMPTY"] || "").trim();
            }

            let cleanEditorName = editorName.replace("Em Huy", "Daniel Hee")
                                            .replace("Trần Khang", "Trần Khang")
                                            .replace("Tuấn Kiệt", "Tuấn Kiệt")
                                            .replace("Kiệt Tuấn", "Tuấn Kiệt")
                                            .replace("Phúc Phạm", "Phúc Phạm");
                                            
            if (editorName === "Khang" || editorName === "Khang ") cleanEditorName = "Trần Khang";
            if (editorName === "Kiệt") cleanEditorName = "Tuấn Kiệt";
            if (editorName === "Phúc") cleanEditorName = "Bảo Phúc";
            if (editorName === "Đạt") cleanEditorName = "Tấn Đạt";
            if (editorName === "Ngữ") cleanEditorName = "Văn Ngữ";

            if (cleanEditorName !== "undefined" && cleanEditorName) {
                const u = users.find(u => {
                    const nickname = u.nickname?.toLowerCase() || '';
                    const username = u.username.toLowerCase();
                    const target = cleanEditorName.toLowerCase();
                    return nickname === target || username === target || nickname.includes(target) || username.includes(target);
                });
                if (u) {
                    assigneeId = u.id;
                } else {
                    notesVi = `[Editor Cũ: ${editorName}]`;
                }
            }

            // 3. Resolve Pricing & Revenue
            const wageVND = priceRaw ? parseFloat(priceRaw) * 1000 : 0;
            const exchangeRate = 25300;
            const estRevenueVND = wageVND > 0 ? (wageVND / 0.65) : 0; // 35% default gross margin
            const jobPriceUSD = estRevenueVND / exchangeRate;
            
            const deadlineDate = (typeof deadlineRaw === 'number') ? excelDateToJSDate(deadlineRaw) : new Date();

            tasksToInsert.push({
                title: String(titleRaw),
                status: "Hoàn tất",
                type: String(typeRaw),
                clientId: clientId,
                assigneeId: assigneeId,
                notes_vi: notesVi,
                wageVND: wageVND,
                jobPriceUSD: jobPriceUSD,
                exchangeRate: exchangeRate,
                deadline: deadlineDate,
                references: referencesRaw ? String(referencesRaw) : null,
                workspaceId: workspace.id,
                profileId: profile.id,
            });
        }

        const result = await prisma.task.createMany({
            data: tasksToInsert
        });

        return NextResponse.json({
            success: true,
            clientsCreated,
            tasksInserted: result.count
        });
        
    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
