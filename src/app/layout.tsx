import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import "./globals.css";
import { Toaster } from 'sonner';
import { ConfirmProvider } from '@/components/ui/ConfirmModal';
import { RadialNavProvider } from '@/components/radial-nav/RadialNavProvider';

const cormorant = Cormorant_Garamond({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const montserrat = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: 'Agency Manager',
  description: 'Task & Payroll Management',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AgencyManager',
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
    <html lang="en" suppressHydrationWarning>
      <body className={`${montserrat.variable} ${cormorant.variable} font-sans antialiased`} suppressHydrationWarning>
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
