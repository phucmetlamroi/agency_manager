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
    workspaceId: z.string().optional(),
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
        const body = await req.json();
        const result = downloadSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: 'Invalid config provided.' }, { status: 400 });
        }

        const { url, formatType, workspaceId: bodyWorkspaceId } = result.data;

        // Try to get workspaceId from body, then session (original fallback), then DB if needed
        let workspaceId = bodyWorkspaceId || (session.user as any).workspaces?.[0]?.workspaceId;

        if (!workspaceId) {
            // Last resort: query DB
            const userWorkspace = await prisma.workspaceMember.findFirst({
                where: { userId }
            });
            workspaceId = userWorkspace?.workspaceId;
        }

        if (!workspaceId) {
            return NextResponse.json({ error: 'No active workspace found. Please refresh or provide workspace context.' }, { status: 400 });
        }

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

        // 5. Extract Details for Filename (Non-blocking as much as possible)
        let filename = 'media_file';
        let extension = formatType === 'audio' ? '.mp3' : '.mp4';

        try {
            // Use a short timeout for metadata to avoid hanging
            const metadataPromise = ytDlp(url, {
                dumpJson: true,
                noWarnings: true,
                callHome: false,
                noCheckCertificates: true,
            });

            // Race with a timeout of 5 seconds
            const metadata = await Promise.race([
                metadataPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]) as any;

            if (metadata && typeof metadata === 'object') {
                if (metadata.title) {
                    // Keep Vietnamese characters, just remove illegal file chars
                    filename = String(metadata.title)
                        .replace(/[\\\/\:\*\?\"\<\>\|]/g, '_')
                        .trim();
                }
                if (metadata.extractor) {
                    await prisma.mediaTask.update({
                        where: { id: mediaTask.id },
                        data: { platform: metadata.extractor }
                    }).catch(console.error);
                }
            }
        } catch (e: any) {
            console.warn(`Download API: Metadata extraction failed or timed out: ${e.message}`);
        }

        const finalFileName = encodeURIComponent(`${filename}${extension}`);

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
                audioQuality: '0',
            }
        } else {
            // For stdout streaming, 'best' is safer than merging bestvideo+bestaudio
            // which requires seeking and temporary files.
            ytDlpArgs = {
                ...ytDlpArgs,
                format: 'best[ext=mp4]/best',
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
                let hasSentData = false;

                ytDlpProcess.stdout.on('data', (chunk) => {
                    if (!hasSentData) {
                        console.log(`Download API: First chunk received (${chunk.length} bytes)`);
                        hasSentData = true;
                    }
                    controller.enqueue(chunk);
                });

                ytDlpProcess.stdout.on('end', async () => {
                    console.log('Download API: stdout stream ended');
                    if (!hasSentData) {
                        console.error('Download API: Stream ended without any data!');
                        await prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'FAILED' } }).catch(console.error);
                        controller.error(new Error('No data received from downloader.'));
                    } else {
                        await prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'COMPLETED' } }).catch(console.error);
                        controller.close();
                    }
                });

                ytDlpProcess.stderr.on('data', (data) => {
                    const msg = data.toString();
                    if (msg.includes('ERROR:')) {
                        console.error(`yt-dlp error: ${msg}`);
                    } else {
                        // Log progress or warnings to console for debugging
                        console.log(`yt-dlp info: ${msg.trim()}`);
                    }
                });

                ytDlpProcess.on('error', async (err) => {
                    console.error('Download API: Process error:', err);
                    await prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'FAILED' } }).catch(console.error);
                    try { controller.error(err); } catch (e) { }
                });

                ytDlpProcess.on('exit', (code) => {
                    console.log(`Download API: yt-dlp exited with code ${code}`);
                });
            },
            cancel() {
                console.log('Download API: Stream cancelled by client');
                ytDlpProcess.kill();
                prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'FAILED' } }).catch(console.error);
            }
        });

        const headers = new Headers();
        headers.set('Content-Disposition', `attachment; filename*=UTF-8''${finalFileName}`);
        headers.set('Content-Type', formatType === 'audio' ? 'audio/mpeg' : 'video/mp4');

        return new Response(stream, { headers });

    } catch (error: any) {
        console.error('Download API: Global Catch:', error);
        return NextResponse.json({ error: `Internal Error: ${error.message}` }, { status: 500 });
    }
}
