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
      },
      {
        // [Hosting-portable] Supabase Storage public bucket (Railway / self-host).
        protocol: 'https',
        hostname: '*.supabase.co',
      }
    ],
  },
  // [F6 standalone trace fix] `output: 'standalone'` is required for the
  // Electron desktop wrapper (it packages the .next/standalone tree into the
  // app bundle), but it does NOT belong on Vercel — Vercel handles output file
  // tracing for serverless functions itself, and combining standalone +
  // Turbopack 16 + the next-intl wrapper produced a runtime
  // `Error: Failed to load external "..."` on every route. Only enable
  // standalone in the Electron build.
  ...(process.env.ELECTRON_DESKTOP ? { output: 'standalone' as const } : {}),
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
              // NOTE (review-module): Mux HLS is NOT only stream.mux.com — the signed master
              // playlist returns rendition/segment URLs on the Mux CDN edge hosts
              // (e.g. manifest-*.fastly.mux.com / chunk-*.fastly.mux.com), so connect-src and
              // media-src must allow https://*.mux.com (CSP wildcard covers nested subdomains)
              // or playback silently freezes at frame 0 after the manifest parses.
              ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: *.vercel-storage.com public.blob.vercel-storage.com *.supabase.co images.unsplash.com https://*.mux.com; font-src 'self' data:; connect-src 'self' http://localhost:* *.vercel-storage.com wss://*.livekit.cloud https://*.livekit.cloud https://*.r2.cloudflarestorage.com https://*.mux.com; media-src 'self' blob: https://*.mux.com; frame-src 'self' *.frame.io;"
              : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: *.vercel-storage.com public.blob.vercel-storage.com *.supabase.co images.unsplash.com https://*.mux.com; font-src 'self' data:; connect-src 'self' *.vercel-storage.com wss://*.livekit.cloud https://*.livekit.cloud https://*.r2.cloudflarestorage.com https://*.mux.com; media-src 'self' blob: https://*.mux.com; frame-src 'self' *.frame.io; upgrade-insecure-requests;"
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
      },
      // [The Desk] The client "/share" portal embeds the guest review player
      // (/r/[slug]) as an in-portal "screening room" iframe. X-Frame-Options:DENY
      // (formerly global) forbids ALL framing — even same-origin — so it is scoped
      // OFF /r/ here (kept as DENY for every other route below) and /r/ instead gets
      // SAMEORIGIN + `frame-ancestors 'self'`: ONLY our own same-origin portal may
      // frame the review page; external sites still cannot (clickjacking stays
      // blocked). /r/ keeps the global CSP (Mux/playback) from the '/(.*)' rule; this
      // adds only the ancestor restriction. reviewUrl is same-origin (guestAppBaseUrl
      // === portal origin in prod), so the rv_guest_/rv_unlock_ SameSite=Lax cookies
      // keep flowing inside the frame.
      {
        source: '/((?!r/).*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          }
        ]
      },
      {
        source: '/r/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self';"
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
// [Hosting-portable] BotId relies on Vercel Edge — only wrap when actually ON Vercel
// (process.env.VERCEL is set there). On Railway / self-host / Electron, ship the plain
// config; the signup path's checkBotId() safely returns isBot=false off-Vercel (the
// existing rate-limit + disposable-email guards still apply).
export default (process.env.ELECTRON_DESKTOP || !process.env.VERCEL)
  ? resolvedConfig
  : withBotId(resolvedConfig);
