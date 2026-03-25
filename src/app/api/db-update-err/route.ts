import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const res = await prisma.errorDictionary.updateMany({
            where: { code: 'ERR_TEXT_JUMP_BUG' },
            data: { description: 'Lỗi phụ đề bị tràn sang cảnh sau hoặc xuất hiện sớm ở cảnh trước do không khớp với điểm cắt, đồng thời nội dung chữ bị lệch nhịp, hiển thị trước hoặc sau so với giọng nói thực tế trong video.' }
        })
        return NextResponse.json({ success: true, count: res.count })
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message })
    }
}
