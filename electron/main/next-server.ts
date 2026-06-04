/**
 * Next.js standalone server manager.
 *
 * Spawns `node server.js` from the bundled standalone output,
 * picks a dynamic port, and waits until the server is ready.
 */
import { ChildProcess, spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import http from 'http'
import { app } from 'electron'

let serverProcess: ChildProcess | null = null
let serverPort: number | null = null

/**
 * Locate server.js inside the standalone output directory.
 *
 * Next.js standalone replicates the project's directory tree, so in a git
 * worktree the file may be nested (e.g. .claude/worktrees/x/server.js).
 * This performs a BFS up to 6 levels deep.
 */
function findServerJs(root: string): string {
    // Fast path — check root directly
    const direct = path.join(root, 'server.js')
    if (fs.existsSync(direct)) return direct

    // BFS search for server.js (max depth 6)
    const queue: string[] = [root]
    let depth = 0
    while (queue.length > 0 && depth < 6) {
        const size = queue.length
        for (let i = 0; i < size; i++) {
            const dir = queue.shift()!
            let entries: fs.Dirent[]
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true })
            } catch {
                continue
            }
            for (const entry of entries) {
                if (entry.name === 'node_modules') continue // skip
                const full = path.join(dir, entry.name)
                if (entry.isFile() && entry.name === 'server.js') return full
                if (entry.isDirectory()) queue.push(full)
            }
        }
        depth++
    }

    // Fallback — assume root (will fail at spawn time with a clear error)
    console.error(`[next-server] WARNING: server.js not found under ${root}, falling back to root`)
    return direct
}

/**
 * Dynamically import get-port (ESM-only package).
 * Electron main runs CJS, so we use dynamic import.
 */
async function findAvailablePort(): Promise<number> {
    const { default: getPort } = await import('get-port')
    return getPort({ port: [3456, 3457, 3458, 3459, 3460] })
}

/**
 * Poll http://localhost:{port} until it responds (or timeout).
 */
function waitForReady(port: number, timeoutMs = 60_000): Promise<void> {
    const start = Date.now()

    return new Promise((resolve, reject) => {
        const check = () => {
            if (Date.now() - start > timeoutMs) {
                return reject(new Error(`Next.js did not start within ${timeoutMs}ms`))
            }

            const req = http.get(`http://localhost:${port}`, (res) => {
                // Any response means the server is alive
                res.resume()
                resolve()
            })

            req.on('error', () => {
                // Server not ready yet — retry in 500ms
                setTimeout(check, 500)
            })

            req.setTimeout(2000, () => {
                req.destroy()
                setTimeout(check, 500)
            })
        }

        check()
    })
}

/**
 * Start the Next.js standalone server.
 *
 * @param envVars  Key-value environment variables to pass to the subprocess.
 * @returns        The port the server is listening on.
 */
export async function startNextServer(
    envVars: Record<string, string> = {},
): Promise<number> {
    const port = await findAvailablePort()
    serverPort = port

    // In a packaged app the standalone lives under resources/
    const isPackaged = app.isPackaged
    const standaloneRoot = isPackaged
        ? path.join(process.resourcesPath, 'standalone')
        : path.join(__dirname, '..', '..', '.next', 'standalone')

    // Next.js standalone replicates the project's directory structure inside
    // .next/standalone/.  In a normal checkout server.js is at the root;
    // in a git worktree it can be nested (e.g. .claude/worktrees/X/server.js).
    // We search for it so both cases work transparently.
    const serverJs = findServerJs(standaloneRoot)
    const standalonePath = path.dirname(serverJs)

    console.error(`[next-server] Spawning: node ${serverJs} (port ${port})`)

    // Optimise DATABASE_URL for desktop: add connection-pool params if absent
    const rawDbUrl = envVars.DATABASE_URL ?? process.env.DATABASE_URL ?? ''
    let dbUrl = rawDbUrl
    if (rawDbUrl && !rawDbUrl.includes('connection_limit')) {
        const sep = rawDbUrl.includes('?') ? '&' : '?'
        dbUrl = `${rawDbUrl}${sep}connection_limit=5&pool_timeout=20`
    }

    serverProcess = spawn(process.execPath, [serverJs], {
        cwd: standalonePath,
        env: {
            ...process.env,
            ...envVars,
            // Override DATABASE_URL with pooling params
            ...(dbUrl ? { DATABASE_URL: dbUrl } : {}),
            PORT: String(port),
            HOSTNAME: 'localhost',
            ELECTRON_DESKTOP: '1',
            // Force production mode — avoids verbose Prisma query logging
            // and enables all Next.js production optimisations.
            NODE_ENV: 'production',
            // Critical: make Electron binary behave as plain Node.js
            // Without this, process.execPath launches a second Electron
            // instance instead of running server.js as a Node script.
            ELECTRON_RUN_AS_NODE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    })

    // Pipe server output to stderr for debugging
    serverProcess.stdout?.on('data', (data: Buffer) => {
        console.error(`[next-server:stdout] ${data.toString().trim()}`)
    })
    serverProcess.stderr?.on('data', (data: Buffer) => {
        console.error(`[next-server:stderr] ${data.toString().trim()}`)
    })

    serverProcess.on('exit', (code, signal) => {
        console.error(`[next-server] Process exited (code=${code}, signal=${signal})`)
        serverProcess = null
    })

    // Wait until the server is accepting requests
    await waitForReady(port)

    return port
}

/**
 * Gracefully stop the Next.js server.
 */
export async function stopNextServer(): Promise<void> {
    if (!serverProcess) return

    console.error('[next-server] Stopping ...')

    return new Promise((resolve) => {
        if (!serverProcess) return resolve()

        serverProcess.on('exit', () => {
            serverProcess = null
            resolve()
        })

        // Try SIGTERM first, then force-kill after 5s
        serverProcess.kill('SIGTERM')

        setTimeout(() => {
            if (serverProcess) {
                console.error('[next-server] Force-killing after timeout.')
                serverProcess.kill('SIGKILL')
            }
        }, 5000)
    })
}
