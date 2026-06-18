import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { resolveHomeDestination } from "@/lib/post-login";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "HustlyTasker · Trỏ Velox vào folder, có ngay bảng task.",
  description:
    "HustlyTasker là hệ điều hành vận hành cho team làm video ngắn. Velox đọc folder Drive hoặc Dropbox của bạn rồi bày sẵn bảng task đã phân công đủ: đầu việc, vai trò, deadline. Miễn phí để bắt đầu.",
  openGraph: {
    title: "HustlyTasker · Trỏ Velox vào folder, có ngay bảng task.",
    description:
      "Hệ điều hành vận hành cho team video ngắn. Velox đọc folder rồi bày sẵn công việc: bảng task, khâu duyệt, lương, phiên chợ, gọn trong một tab. Miễn phí để bắt đầu.",
    type: "website",
    siteName: "HustlyTasker",
    locale: "vi_VN",
  },
};

export default async function Home() {
  // Logged-in visitors skip the marketing page and go straight into the app.
  const session = await getSession();
  if (session?.user) {
    redirect(await resolveHomeDestination(session.user));
  }

  // Guests see the public landing page.
  return <LandingPage />;
}
