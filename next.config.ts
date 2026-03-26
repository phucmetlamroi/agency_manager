import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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
  }
};

export default withNextIntl(nextConfig);
