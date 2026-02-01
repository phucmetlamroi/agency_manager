import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek } from "date-fns";
import ScheduleGrid from "@/components/schedule/ScheduleGrid";

export default async function SchedulePage() {
    const session = await getSession();
    if (!session) redirect("/login");

    const userId = session.user.id;

    // Initial Load: Get Current Week Schedule
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const schedules = await prisma.userSchedule.findMany({
        where: {
            userId,
            startTime: { gte: weekStart },
            endTime: { lte: weekEnd }
        }
    });

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Quản lý Lịch Trình 📅</h1>
                <p className="text-gray-400">
                    Hãy cập nhật thời gian rảnh/bận của bạn để Admin giao việc hợp lý nhất.
                    <br />
                    Kéo chuột trên lưới để chọn giờ.
                </p>
            </div>

            <ScheduleGrid
                userId={userId}
                initialSchedule={schedules as any} // Cast safely as dates match
            />
        </div>
    )
}
