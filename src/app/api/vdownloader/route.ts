import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import ytDlp from 'youtube-dl-exec';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { prisma } from '@/lib/db';

const ffmpeg = require('@ffmpeg-installer/ffmpeg');


export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const downloadSchema = z.object({
    url: z.string().url(),
    formatType: z.string().default('best'), // 'best' or 'audio'
});

export async function POST(req: Request) {
    console.log('--- Download API: POST Request Received ---');
    try {
        // 1. Authentication Check
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const workspaceId = session.user.workspaces?.[0]?.workspaceId; // Simplification, get active workspace

        if (!workspaceId) {
            return NextResponse.json({ error: 'No active workspace found.' }, { status: 400 });
        }

        // 2. Validate Input
        const body = await req.json();
        const result = downloadSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: 'Invalid config provided.' }, { status: 400 });
        }

        const { url, formatType } = result.data;

        // 3. Concurrency Lock (Max 2 active processing tasks per user)
        const activeTasks = await prisma.mediaTask.count({
            where: {
                requestedById: userId,
                status: 'PROCESSING'
            }
        });

        if (activeTasks >= 2) {
            return NextResponse.json({ error: 'Rate limit exceeded: You can only download 2 files concurrently. Please wait for one to finish.' }, { status: 429 });
        }

        // 4. Create MediaTask Record (PENDING -> PROCESSING)
        const mediaTask = await prisma.mediaTask.create({
            data: {
                workspaceId,
                requestedById: userId,
                originalUrl: url,
                platform: 'unknown', // Wil be updated
                formatType,
                status: 'PROCESSING'
            }
        });

        // 5. Extract Details for Filename
        let filename = 'downloaded_media';
        let extension = formatType === 'audio' ? '.mp3' : '.mp4';
        try {
            const metadata = await ytDlp(url, {
                dumpJson: true,
                noWarnings: true,
                callHome: false,
                noCheckCertificates: true,
            });
            if (typeof metadata === 'object' && metadata !== null) {
                const meta = metadata as any;
                if (meta.title) {
                    filename = String(meta.title).replace(/[^a-z0-9]/gi, '_').toLowerCase();
                }
                if (meta.extractor) {
                    await prisma.mediaTask.update({
                        where: { id: mediaTask.id },
                        data: { platform: meta.extractor }
                    });
                }
            }
        } catch (e: any) {
            console.warn("Download API: Could not fetch metadata, using default name.");
        }

        const finalFileName = `${filename}${extension}`;

        // 6. Config yt-dlp arguments
        let ytDlpArgs: any = {
            noWarnings: true,
            callHome: false,
            noCheckCertificates: true,
            ffmpegLocation: ffmpeg.path,
            output: '-',
        };

        if (formatType === 'audio') {
            ytDlpArgs = {
                ...ytDlpArgs,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 0,
            }
        } else {
            ytDlpArgs = {
                ...ytDlpArgs,
                format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                mergeOutputFormat: 'mp4',
            }
        }


        console.log(`Download API: Starting high-quality FFmpeg stream for: ${url}`);
        let ytDlpProcess: ChildProcessWithoutNullStreams;
        try {
            ytDlpProcess = ytDlp.exec(url, ytDlpArgs) as ChildProcessWithoutNullStreams;
        } catch (e: any) {
            await prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'FAILED' } });
            return NextResponse.json({ error: `Failed to spawn process: ${e.message}` }, { status: 500 });
        }

        // 7. Stream bridge
        const stream = new ReadableStream({
            start(controller) {
                ytDlpProcess.stdout.on('data', (chunk) => {
                    controller.enqueue(chunk);
                });

                ytDlpProcess.stdout.on('end', async () => {
                    console.log('Download API: Stream ended successfully');
                    controller.close();
                    await prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'COMPLETED' } }).catch(console.error);
                });

                ytDlpProcess.stderr.on('data', (data) => {
                    console.error(`yt-dlp stderr: ${data}`);
                });

                ytDlpProcess.on('error', async (err) => {
                    console.error('Download API: yt-dlp error:', err);
                    await prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'FAILED' } }).catch(console.error);
                    try { controller.error(err); } catch (e) { }
                });
            },
            async cancel() {
                console.log('Download API: Stream cancelled by client');
                ytDlpProcess.kill();
                await prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'FAILED' } }).catch(console.error);
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Disposition': `attachment; filename="${finalFileName}"`,
                'Content-Type': formatType === 'audio' ? 'audio/mpeg' : 'video/mp4',
            }
        });

    } catch (error: any) {
        console.error('Download API: Global Catch:', error);
        return NextResponse.json({ error: `Internal Error: ${error.message}` }, { status: 500 });
    }
}
