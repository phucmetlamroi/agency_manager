import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { z } from 'zod';

import ytDlp from 'youtube-dl-exec';
import { ChildProcessWithoutNullStreams } from 'child_process';

export const maxDuration = 300; // 5 minutes (Vercel Pro limit)

const downloadSchema = z.object({
    url: z.string().url(),
});

export async function GET() {
    try {
        const version = await ytDlp('--version', {
            noWarnings: true,
            callHome: false,
            noCheckCertificates: true,
        });
        return NextResponse.json({ status: 'ok', version });
    } catch (error: any) {
        return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
    }
}

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
        // Simplified format to avoid merging (which requires ffmpeg)
        // 'best[ext=mp4]' is usually a single file with both video and audio.
        console.log(`Starting download for: ${url}`);

        let ytDlpProcess: ChildProcessWithoutNullStreams;
        try {
            ytDlpProcess = ytDlp.exec(url, {
                format: 'best[ext=mp4]/best',
                noWarnings: true,
                callHome: false,
                noCheckCertificates: true,
                output: '-',
            }) as ChildProcessWithoutNullStreams;
        } catch (e: any) {
            console.error('Failed to spawn yt-dlp:', e);
            return NextResponse.json({ error: `Failed to start downloader: ${e.message}` }, { status: 500 });
        }

        // Create a ReadableStream from the child process stdout
        const stream = new ReadableStream({
            start(controller) {
                ytDlpProcess.stdout.on('data', (chunk) => {
                    controller.enqueue(chunk);
                });

                ytDlpProcess.stdout.on('end', () => {
                    console.log('Download stream ended successfully');
                    controller.close();
                });

                ytDlpProcess.stderr.on('data', (data) => {
                    console.error(`yt-dlp stderr: ${data}`);
                });

                ytDlpProcess.on('error', (err) => {
                    console.error('yt-dlp process error:', err);
                    try { controller.error(err); } catch (e) { }
                });

                ytDlpProcess.on('exit', (code) => {
                    if (code !== 0) {
                        console.error(`yt-dlp exited with code ${code}`);
                        // Note: we can't easily send an error to the client after headers are sent
                    }
                });
            },
            cancel() {
                console.log('Download stream cancelled by client');
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
