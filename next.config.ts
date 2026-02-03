import type { NextConfig } from "next";

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
};

export default nextConfig;
