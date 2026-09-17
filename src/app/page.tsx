import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Fraunces, Hanken_Grotesk, Space_Mono } from "next/font/google";
import { getSession } from "@/lib/auth";
import { resolveHomeDestination } from "@/lib/post-login";
import LandingPage from "@/components/landing/LandingPage";

/**
 * [Font self-host] Landing fonts are loaded via next/font so Next downloads
 * + serves them same-origin at build (incl. the `vietnamese` subset). This
 * replaces the runtime <link> to fonts.gstatic.com — that CDN is throttled on
 * many Vietnamese networks, which made the heavy Fraunces file fail to load and
 * headings fall back to a serif that detaches the dấu sắc/huyền (ố→ô´, ằ→ă`).
 */
const fraunces = Fraunces({
  subsets: ["latin", "vietnamese"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin", "vietnamese"],
  variable: "--font-hanken",
  display: "swap",
});
const spaceMono = Space_Mono({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});
const landingFontVars = `${fraunces.variable} ${hanken.variable} ${spaceMono.variable}`;

export const metadata: Metadata = {
  title: "HustlyTasker · Trỏ Velox vào folder, có ngay bảng task.",
  description:
    "HustlyTasker là hệ điều hành vận hành cho team làm video ngắn. Velox đọc folder Drive hoặc Dropbox của bạn rồi bày sẵn bảng task đã phân công đủ: đầu việc, vai trò, deadline. Dùng thử 14 ngày, không cần thẻ.",
  openGraph: {
    title: "HustlyTasker · Trỏ Velox vào folder, có ngay bảng task.",
    description:
      "Hệ điều hành vận hành cho team video ngắn. Velox đọc folder rồi bày sẵn công việc: bảng task, khâu duyệt, lương, phiên chợ, gọn trong một tab. Dùng thử 14 ngày, không cần thẻ.",
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
  return <LandingPage fontVars={landingFontVars} />;
}
