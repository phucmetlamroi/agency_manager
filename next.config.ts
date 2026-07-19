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
              //
              // NOTE (R2 images): img-src MUST list *.r2.cloudflarestorage.com. Two distinct sinks
              // need it, so do NOT prune this token as "comment attachments only":
              //   1. Comment attachments are fetched through a SAME-ORIGIN route
              //      (/api/review/comment-attachments/:id/raw) that 302s to a presigned R2 URL.
              //      CSP re-checks the *redirect target's* scheme+host (path matching is dropped
              //      after a redirect, host matching is not), so 'self' alone is NOT enough — the
              //      browser blocks the <img> with an img-src violation even though the upload
              //      succeeded (connect-src already allowed R2). Symptom: the image uploads fine,
              //      then renders as a broken thumbnail and the lightbox is blank.
              //   2. IMAGE assets in the staff player (VideoStage) use a DIRECT cross-origin
              //      presigned R2 URL — same directive, no redirect involved.
              // Scope: this only takes effect on routes that actually receive this policy (staff
              // routes + /share). It is inert on /r/[slug], whose own rule below REPLACES this
              // header rather than adding to it — see the comment on that rule.
              // The host is safe to wildcard because r2.ts pins the endpoint to
              // https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com with no custom-domain/r2.dev
              // escape hatch; revisit both img-src and connect-src if that ever changes.
              ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: *.vercel-storage.com public.blob.vercel-storage.com *.supabase.co images.unsplash.com https://*.mux.com https://*.r2.cloudflarestorage.com; font-src 'self' data:; connect-src 'self' http://localhost:* *.vercel-storage.com wss://*.livekit.cloud https://*.livekit.cloud https://*.r2.cloudflarestorage.com https://*.mux.com; media-src 'self' blob: https://*.mux.com; frame-src 'self' *.frame.io;"
              : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: *.vercel-storage.com public.blob.vercel-storage.com *.supabase.co images.unsplash.com https://*.mux.com https://*.r2.cloudflarestorage.com; font-src 'self' data:; connect-src 'self' *.vercel-storage.com wss://*.livekit.cloud https://*.livekit.cloud https://*.r2.cloudflarestorage.com https://*.mux.com; media-src 'self' blob: https://*.mux.com; frame-src 'self' *.frame.io; upgrade-insecure-requests;"
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
