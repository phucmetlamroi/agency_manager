import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import ytDlp from 'youtube-dl-exec';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { prisma } from '@/lib/db';
// @ts-ignore
import ffmpeg from '@ffmpeg-installer/ffmpeg';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    const formatType = searchParams.get('formatType') || 'best';
    const workspaceId = searchParams.get('workspaceId') || undefined;
    const isDiagnostic = searchParams.get('diagnostic') === 'true';

    if (isDiagnostic) {
        try {
            const { execSync } = require('child_process');
            return NextResponse.json({
                env: process.env.NODE_ENV,
                ffmpegPath: ffmpeg.path,
                platform: process.platform,
                cwd: process.cwd(),
                nodeVersion: process.version,
                // Check if ffmpeg exists and is executable
                ffmpegCheck: execSync(`${ffmpeg.path} -version`).toString().split('\n')[0],
            });
        } catch (e: any) {
            return NextResponse.json({ error: 'Diagnostic failed', details: e.message });
        }
    }

    if (!url) {
        return NextResponse.json({ active: true, message: "Downloader API is ready. Provide 'url' param to download." });
    }

    try {
        return await handleDownload(url, formatType, workspaceId);
    } catch (e: any) {
        console.error('Download API Critical Error:', e);
        return NextResponse.json({ error: `Internal Server Error: ${e.message}` }, { status: 500 });
    }
}

const downloadSchema = z.object({
    url: z.string().url(),
    formatType: z.string().default('best'), // 'best' or 'audio'
    workspaceId: z.string().optional(),
});

export async function POST(req: Request) {
    console.log('--- Download API: POST Request Received ---');
    try {
        const body = await req.json();
        const result = downloadSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json({ error: 'Invalid config provided.' }, { status: 400 });
        }

        const { url, formatType, workspaceId } = result.data;
        return handleDownload(url, formatType, workspaceId);
    } catch (error: any) {
        console.error('Download API: Global Catch:', error);
        return NextResponse.json({ error: `Internal Error: ${error.message}` }, { status: 500 });
    }
}

async function handleDownload(url: string, formatType: string, workspaceIdParam?: string) {
    try {
        // 1. Authentication Check
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        // Try to get workspaceId from param, then session, then DB
        let workspaceId = workspaceIdParam || (session.user as any).workspaces?.[0]?.workspaceId;

        if (!workspaceId) {
            const userWorkspace = await prisma.workspaceMember.findFirst({
                where: { userId }
            });
            workspaceId = userWorkspace?.workspaceId;
        }

        if (!workspaceId) {
            return NextResponse.json({ error: 'No active workspace found.' }, { status: 400 });
        }

        // 3. Concurrency Lock
        const activeTasks = await prisma.mediaTask.count({
            where: { requestedById: userId, status: 'PROCESSING' }
        });

        if (activeTasks >= 3) { // Increased to 3
            return NextResponse.json({ error: 'Rate limit: You have 3 active downloads. Please wait.' }, { status: 429 });
        }

        // 4. Create MediaTask Record (Early to track attempts)
        const mediaTask = await prisma.mediaTask.create({
            data: {
                workspaceId,
                requestedById: userId,
                originalUrl: url,
                platform: 'unknown',
                formatType,
                status: 'PROCESSING'
            }
        });

        // 5. Metadata Extraction (Faster & More Reliable)
        let filename = 'media_file';
        let extension = formatType === 'audio' ? '.mp3' : '.mp4';

        try {
            console.log(`Download API: Fetching metadata for ${url}...`);
            // Use --get-title and --get-filename for faster metadata if possible
            // but dumpJson is more comprehensive for platform detection
            const metadata = await Promise.race([
                ytDlp(url, {
                    dumpJson: true,
                    noWarnings: true,
                    noCheckCertificates: true,
                    noPlaylist: true,
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Metadata Timeout')), 15000))
            ]) as any;

            if (metadata && typeof metadata === 'object') {
                if (metadata.title) {
                    // Remove characters that are illegal in filenames but keep letters/numbers/spaces
                    filename = String(metadata.title)
                        .replace(/[\\\/\:\*\?\"\<\>\|]/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                }
                if (metadata.extractor) {
                    await prisma.mediaTask.update({
                        where: { id: mediaTask.id },
                        data: { platform: metadata.extractor }
                    }).catch(console.error);
                }
                console.log(`Download API: Extracted title: "${filename}"`);
            }
        } catch (e: any) {
            // Defensive check: Convert potential ErrorEvent or non-standard error objects to strings
            const errorMsg = e instanceof Error ? e.message : (typeof e === 'object' ? JSON.stringify(e) : String(e));
            console.warn(`Download API: Metadata failed (Non-fatal): ${errorMsg}`);
        }

        // Use the sanitized filename for the header
        const finalFileName = encodeURIComponent(`${filename}${extension}`);

        // 6. Config yt-dlp arguments (Optimized for Speed)
        let ytDlpArgs: any = {
            noWarnings: true,
            callHome: false,
            noCheckCertificates: true,
            ffmpegLocation: ffmpeg.path,
            output: '-',
            noPlaylist: true,
            // Optimization flags
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            bufferSize: '1M', // Larger buffer for faster throughput
            format: formatType === 'audio' ? 'bestaudio' : 'best[ext=mp4]/best',
            // YouTube specific optimizations
            forceIpv4: true,
            // Avoid overhead of combining files if possible (only for video)
        };

        if (formatType === 'audio') {
            ytDlpArgs = {
                ...ytDlpArgs,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: '0',
            }
        }

        console.log(`Download API: Initiating optimized stream for: ${url}`);
        let ytDlpProcess: ChildProcessWithoutNullStreams;
        try {
            ytDlpProcess = ytDlp.exec(url, ytDlpArgs) as ChildProcessWithoutNullStreams;
        } catch (e: any) {
            await prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'FAILED' } });
            return NextResponse.json({ error: `Process failed: ${e.message}` }, { status: 500 });
        }

        // 7. Stream bridge
        const stream = new ReadableStream({
            start(controller) {
                let hasSentData = false;
                let lastChunkTime = Date.now();

                ytDlpProcess.stdout.on('data', (chunk) => {
                    if (!hasSentData) {
                        const elapsed = (Date.now() - lastChunkTime) / 1000;
                        console.log(`Download API: First chunk sent after ${elapsed}s (${chunk.length} bytes)`);
                        hasSentData = true;
                    }
                    controller.enqueue(chunk);
                });

                ytDlpProcess.stdout.on('end', async () => {
                    console.log('Download API: Stream closed successfully');
                    if (!hasSentData) {
                        console.error('Download API: Zero bytes produced by yt-dlp');
                        await prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'FAILED' } }).catch(console.error);
                        controller.error(new Error('Empty stream'));
                    } else {
                        await prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'COMPLETED' } }).catch(console.error);
                        controller.close();
                    }
                });

                ytDlpProcess.stderr.on('data', (data) => {
                    const msg = data.toString();
                    if (msg.includes('ERROR:')) {
                        console.error(`yt-dlp [err]: ${msg.trim()}`);
                    } else if (msg.includes('[download]') && msg.includes('%')) {
                        // Log progress occasionally to console
                        if (Math.random() > 0.95) console.log(`yt-dlp [progress]: ${msg.trim()}`);
                    }
                });

                ytDlpProcess.on('error', async (err) => {
                    console.error('Download API: Process pipe error:', err);
                    await prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'FAILED' } }).catch(console.error);
                    try { controller.error(err); } catch (e) { }
                });

                ytDlpProcess.on('exit', (code) => {
                    console.log(`Download API: Process exited with code ${code}`);
                    if (code !== 0 && !hasSentData) {
                        prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'FAILED' } }).catch(console.error);
                        try { controller.error(new Error(`Process error code ${code}`)); } catch (e) { }
                    }
                });
            },
            cancel() {
                console.log('Download API: Client disconnected, killing process');
                ytDlpProcess.kill('SIGTERM');
                prisma.mediaTask.update({ where: { id: mediaTask.id }, data: { status: 'FAILED' } }).catch(console.error);
            }
        });

        const headers = new Headers();
        headers.set('Content-Disposition', `attachment; filename*=UTF-8''${finalFileName}`);
        headers.set('Content-Type', formatType === 'audio' ? 'audio/mpeg' : 'video/mp4');
        // Disable buffering for streaming
        headers.set('X-Content-Type-Options', 'nosniff');

        return new Response(stream, { headers });

    } catch (error: any) {
        console.error('Download API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

