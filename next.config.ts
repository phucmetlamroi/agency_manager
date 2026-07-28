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
              // NOTE (frame-src + R2 — client download): *.r2.cloudflarestorage.com is LOAD-BEARING here,
              // not a copy-paste of the img-src token. The client portal embeds the guest review player
              // in a same-origin iframe (portal/desk/ScreeningRoom.tsx). Its Download button navigates the
              // CURRENT browsing context to a presigned R2 URL whose response carries
              // `Content-Disposition: attachment` — a frame navigation to an attachment downloads the file
              // and leaves the frame untouched, which is exactly the intended in-place behaviour.
              // BUT the CONTAINING document's frame-src governs every navigation of a nested browsing
              // context, and it is checked BEFORE any response — so Content-Disposition never gets a say.
              // Without R2 listed, Chrome refuses the navigation and replaces the whole player with
              // "This content is blocked. Contact the site owner to fix the issue." — the client loses the
              // video AND gets no file (owner's bug video 2026-07-21 @00:34; the reported "we're also not
              // able to download"). It never reproduced on staff pages: there the player is top-level, and
              // frame-src does not apply to top-level navigations.
              // NOTE (Supabase Realtime — audit 2026-07 F-01): connect-src needs BOTH tokens; neither is
              // redundant. `wss://` is required because a scheme-less host-source inherits the document
              // scheme (https), and https does NOT match wss — so the socket in useSupabaseChannel /
              // usePresence is refused outright. `https://` is required because realtime-js falls back to
              // POSTing /realtime/v1/api/broadcast over HTTP whenever the socket is down mid-session
              // (RealtimeChannel.send when !canPush), and that failure is swallowed silently. This was
              // missed once already: *.supabase.co WAS added to img-src below but forgotten here, which
              // blocked every realtime feature on every logged-in page for all 4 roles while leaving the
              // socket retrying in an unbounded loop. The wildcard matches the img-src / remotePatterns
              // stance ([Hosting-portable]) and grants nothing new — img-src already trusts this host,
              // so an injected script could already exfiltrate via <img> to any *.supabase.co.
              ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: *.vercel-storage.com public.blob.vercel-storage.com *.supabase.co images.unsplash.com https://lh3.googleusercontent.com https://avatar.vercel.sh https://*.mux.com https://*.r2.cloudflarestorage.com; font-src 'self' data:; connect-src 'self' http://localhost:* *.vercel-storage.com wss://*.livekit.cloud https://*.livekit.cloud wss://*.supabase.co https://*.supabase.co https://*.r2.cloudflarestorage.com https://*.mux.com; media-src 'self' blob: https://*.mux.com; frame-src 'self' *.frame.io https://*.r2.cloudflarestorage.com;"
              : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: *.vercel-storage.com public.blob.vercel-storage.com *.supabase.co images.unsplash.com https://lh3.googleusercontent.com https://avatar.vercel.sh https://*.mux.com https://*.r2.cloudflarestorage.com; font-src 'self' data:; connect-src 'self' *.vercel-storage.com wss://*.livekit.cloud https://*.livekit.cloud wss://*.supabase.co https://*.supabase.co https://*.r2.cloudflarestorage.com https://*.mux.com; media-src 'self' blob: https://*.mux.com; frame-src 'self' *.frame.io https://*.r2.cloudflarestorage.com; upgrade-insecure-requests;"
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
      // blocked).
      // ⚠️ CORRECTION — this rule REPLACES the global Content-Security-Policy for /r/, it does
      // NOT extend it (Next overwrites same-key headers from a later matching rule; only
      // `set-cookie` accumulates). The /r/ document therefore ships `frame-ancestors 'self'` and
      // nothing else — no default-src, no media-src. Two consequences worth knowing before
      // touching this: (1) guest playback works BECAUSE there is no policy here, so "restoring"
      // the global CSP onto /r/ would newly apply default-src 'self' and kill hls.js's blob:
      // worker; (2) the frame-src governing the screening-room iframe's navigations belongs to
      // the PARENT /share document, which matches '/(.*)' — that is where the R2 download fix
      // lives, and patching this rule instead would do nothing.
      // reviewUrl is same-origin (guestAppBaseUrl
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
