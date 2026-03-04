import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import ytDlp from 'youtube-dl-exec';
import { ChildProcessWithoutNullStreams } from 'child_process';
const ffmpeg = require('@ffmpeg-installer/ffmpeg');

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const downloadSchema = z.object({
    url: z.string().url(),
});

export async function POST(req: Request) {
    console.log('--- Download API: POST Request Received ---');
    try {
        // 1. Authentication Check
        const session = await getSession();
        if (!session || !session.user) {
            console.error('Download API: Unauthorized');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Validate Input
        const body = await req.json();
        const result = downloadSchema.safeParse(body);

        if (!result.success) {
            console.error('Download API: Invalid URL:', result.error);
            return NextResponse.json({ error: 'Invalid URL provided.' }, { status: 400 });
        }

        const { url } = result.data;

        // 3. Extract Metadata
        let filename = 'downloaded_video.mp4';
        try {
            console.log('Download API: Extracting metadata for:', url);
            const metadata = await ytDlp(url, {
                dumpJson: true,
                noWarnings: true,
                callHome: false,
                noCheckCertificates: true,
                ffmpegLocation: ffmpeg.path,
            });
            if (typeof metadata === 'object' && metadata !== null && 'title' in metadata) {
                const title = String((metadata as any).title).replace(/[^a-z0-9]/gi, '_').toLowerCase();
                filename = `${title}.mp4`;
                console.log('Download API: Filename determined:', filename);
            }
        } catch (e: any) {
            console.warn("Download API: Could not fetch metadata:", e.message);
        }

        // 4. Start the actual download stream
        // Now with high quality merge support thanks to FFmpeg binary
        console.log(`Download API: Starting high-quality download with FFmpeg for: ${url}`);

        let ytDlpProcess: ChildProcessWithoutNullStreams;
        try {
            ytDlpProcess = ytDlp.exec(url, {
                format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                mergeOutputFormat: 'mp4',
                noWarnings: true,
                callHome: false,
                noCheckCertificates: true,
                ffmpegLocation: ffmpeg.path,
                output: '-',
            }) as ChildProcessWithoutNullStreams;
        } catch (e: any) {
            console.error('Download API: Failed to spawn yt-dlp:', e);
            return NextResponse.json({ error: `Failed to start downloader: ${e.message}` }, { status: 500 });
        }

        const stream = new ReadableStream({
            start(controller) {
                ytDlpProcess.stdout.on('data', (chunk) => {
                    controller.enqueue(chunk);
                });

                ytDlpProcess.stdout.on('end', () => {
                    console.log('Download API: Stream ended');
                    controller.close();
                });

                ytDlpProcess.stderr.on('data', (data) => {
                    console.error(`yt-dlp stderr: ${data}`);
                });

                ytDlpProcess.on('error', (err) => {
                    console.error('Download API: yt-dlp error:', err);
                    try { controller.error(err); } catch (e) { }
                });

                ytDlpProcess.on('exit', (code) => {
                    if (code !== 0) {
                        console.error(`Download API: yt-dlp exited with code ${code}`);
                    }
                });
            },
            cancel() {
                console.log('Download API: Stream cancelled');
                ytDlpProcess.kill();
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Type': 'video/mp4',
            }
        });

    } catch (error: any) {
        console.error('Download API: Global Catch:', error);
        return NextResponse.json({ error: `Internal Error: ${error.message}` }, { status: 500 });
    }
}
