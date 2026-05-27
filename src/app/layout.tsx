import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from 'sonner';
import { ConfirmProvider } from '@/components/ui/ConfirmModal';
import { RadialNavProvider } from '@/components/radial-nav/RadialNavProvider';

// [Single-font system] Plus Jakarta Sans làm font duy nhất cho toàn app —
// body, heading, label, button. Heading dùng weight nặng hơn (700-800) để
// tạo visual hierarchy thay vì đổi family (tránh font lệch tông gây xấu).
// Variable --font-sans + --font-heading đều trỏ đến cùng family qua className.
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: 'HustlyTasker',
  description: 'Quản lý task chuyên biệt cho agency dựng video — task lifecycle, dual-currency payroll, Velox auto-batch.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'HustlyTasker',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={plusJakarta.variable} suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ConfirmProvider>
          <RadialNavProvider>
            {children}
            <Toaster position="top-center" theme="dark" richColors />
          </RadialNavProvider>
        </ConfirmProvider>
      </body>
    </html>
  );
}
