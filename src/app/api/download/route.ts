import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

import ytDlp from 'youtube-dl-exec';
import { ChildProcessWithoutNullStreams } from 'child_process';

export const maxDuration = 300; // 5 minutes (Vercel Pro limit)

const downloadSchema = z.object({
    url: z.string().url(),
});

export async function POST(req: Request) {
    try {
        // 1. Authentication Check
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Validate Input
        const body = await req.json();
        const result = downloadSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: 'Invalid URL provided.' }, { status: 400 });
        }

        const { url } = result.data;

        // 3. Extract Metadata (to get filename) - Optional, but good for UX
        // We will do a fast dump-json first to get the title
        let filename = 'downloaded_video.mp4';
        try {
            const metadata = await ytDlp(url, {
                dumpJson: true,
                noWarnings: true,
                callHome: false,
                noCheckCertificates: true,
            });
            if (typeof metadata === 'object' && metadata !== null && 'title' in metadata) {
                // Sanitize filename
                const title = String((metadata as any).title).replace(/[^a-z0-9]/gi, '_').toLowerCase();
                filename = `${title}.mp4`;
            }
        } catch (e) {
            console.warn("Could not fetch metadata for filename, using default.", e);
        }

        // 4. Start the actual download stream
        // We use child process directly to pipe stdout
        const ytDlpProcess = ytDlp.exec(url, {
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            mergeOutputFormat: 'mp4',
            noWarnings: true,
            callHome: false,
            noCheckCertificates: true,
            // Pipe output to stdout
            output: '-',
        }) as ChildProcessWithoutNullStreams;

        // Create a ReadableStream from the child process stdout
        const stream = new ReadableStream({
            start(controller) {
                ytDlpProcess.stdout.on('data', (chunk) => {
                    controller.enqueue(chunk);
                });

                ytDlpProcess.stdout.on('end', () => {
                    controller.close();
                });

                ytDlpProcess.on('error', (err) => {
                    console.error('yt-dlp process error:', err);
                    controller.error(err);
                });
            },
            cancel() {
                ytDlpProcess.kill();
            }
        });

        // 5. Return the stream
        return new Response(stream, {
            headers: {
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Type': 'video/mp4',
                // Tricking browser into downloading by not setting exact length if unknown
            }
        });

    } catch (error) {
        console.error('Download API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
