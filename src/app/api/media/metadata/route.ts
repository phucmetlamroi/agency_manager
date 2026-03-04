import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import ytDlp from 'youtube-dl-exec';

export const maxDuration = 10; // Metadata extraction should be fast
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const metadataSchema = z.object({
    url: z.string().url(),
});

// Simple in-memory global cache for metadata to prevent IP Banning
const globalCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function POST(req: Request) {
    console.log('--- Media Engine: Metadata Extraction Request ---');
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const result = metadataSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: 'Invalid URL provided.' }, { status: 400 });
        }

        const { url } = result.data;

        // 1. Check Cache
        const cached = globalCache.get(url);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            console.log(`Metadata Cache Hit for: ${url}`);
            return NextResponse.json(cached.data);
        }

        console.log(`Extracting metadata for: ${url}`);
        const metadata = await ytDlp(url, {
            dumpJson: true,
            noWarnings: true,
            callHome: false,
            noPlaylist: true,
            noCheckCertificates: true,
        });

        if (typeof metadata === 'object' && metadata !== null) {
            const meta = metadata as any;

            // Format extraction for basic options (simplified for UI)
            const availableFormats = [];
            if (meta.formats) {
                // Just detect if video and audio extraction is generally possible
                availableFormats.push({ id: 'best', label: 'Video (Best Quality)' });
                availableFormats.push({ id: 'audio', label: 'Audio Only (MP3)' });
            }

            const responseData = {
                title: meta.title || "Video không xác định",
                thumbnail: meta.thumbnail || null,
                duration: meta.duration || 0,
                platform: meta.extractor || 'unknown',
                availableFormats
            };

            // Save to cache
            globalCache.set(url, { data: responseData, timestamp: Date.now() });

            return NextResponse.json(responseData);
        }

        return NextResponse.json({ error: 'Failed to extract metadata' }, { status: 500 });
    } catch (error: any) {
        console.error('Metadata API Error:', error);
        return NextResponse.json({ error: `Internal Error: ${error.message}` }, { status: 500 });
    }
}
