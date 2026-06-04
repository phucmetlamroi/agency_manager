import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withBotId } from "botid/next/config";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      }
    ],
  },
  output: 'standalone',
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "youtube-dl-exec", "@sparticuz/chromium"],
  async redirects() {
    return [
      {
        source: '/workspaces',
        destination: '/workspace',
        permanent: true,
      },
      {
        source: '/profile-selection',
        destination: '/profile',
        permanent: true,
      }
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: process.env.ELECTRON_DESKTOP
              ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: *.vercel-storage.com public.blob.vercel-storage.com images.unsplash.com; font-src 'self' data:; connect-src 'self' http://localhost:* *.vercel-storage.com wss://*.livekit.cloud https://*.livekit.cloud; media-src 'self' blob:; frame-src 'self' *.frame.io;"
              : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: *.vercel-storage.com public.blob.vercel-storage.com images.unsplash.com; font-src 'self' data:; connect-src 'self' *.vercel-storage.com wss://*.livekit.cloud https://*.livekit.cloud; media-src 'self' blob:; frame-src 'self' *.frame.io; upgrade-insecure-requests;"
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=()'
          }
        ]
      }
    ]
  }
};

// withBotId là outermost wrapper per Vercel docs — inject rewrites + bundler
// aliases tại Next config level, cần thấy fully-resolved config (bao gồm
// next-intl webpack alias).
// [Electron] BotId relies on Vercel Edge — disable in desktop builds.
const resolvedConfig = withNextIntl(nextConfig) as NextConfig;
export default process.env.ELECTRON_DESKTOP
  ? resolvedConfig
  : withBotId(resolvedConfig);
