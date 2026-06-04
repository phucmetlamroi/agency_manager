/**
 * Cron scheduler — replicates vercel.json cron jobs for the desktop app.
 *
 * Each job hits the local Next.js API endpoint with the correct
 * Authorization header, exactly as Vercel would in production.
 */
import cron from 'node-cron'
import http from 'http'

interface CronJobDef {
    name: string
    path: string
    schedule: string
}

/**
 * Cron definitions — mirrors vercel.json "crons" array.
 */
const CRON_JOBS: CronJobDef[] = [
    { name: 'send-digest',            path: '/api/cron/send-digest',            schedule: '0 * * * *'    },
    { name: 'check-deadline',         path: '/api/cron/check-deadline',         schedule: '0 * * * *'    },
    { name: 'cleanup-notifications',  path: '/api/cron/cleanup-notifications',  schedule: '0 2 * * *'    },
    { name: 'hard-delete-workspaces', path: '/api/cron/hard-delete-workspaces', schedule: '0 3 * * *'    },
    { name: 'hard-delete-profiles',   path: '/api/cron/hard-delete-profiles',   schedule: '30 3 * * *'   },
    { name: 'auth-cleanup',           path: '/api/cron/auth-cleanup',           schedule: '0 4 * * *'    },
]

const scheduledTasks: cron.ScheduledTask[] = []

/**
 * Fire an HTTP GET to the local Next.js cron endpoint.
 */
function executeCronJob(
    port: number,
    cronSecret: string,
    job: CronJobDef,
): void {
    const url = `http://localhost:${port}${job.path}`
    console.error(`[cron] Running ${job.name} → ${url}`)

    const req = http.get(
        url,
        {
            headers: {
                Authorization: `Bearer ${cronSecret}`,
            },
            timeout: 30_000,
        },
        (res) => {
            let body = ''
            res.on('data', (chunk: Buffer) => { body += chunk.toString() })
            res.on('end', () => {
                console.error(
                    `[cron] ${job.name} completed — status ${res.statusCode}`,
                )
            })
        },
    )

    req.on('error', (err) => {
        console.error(`[cron] ${job.name} failed:`, err.message)
    })

    req.on('timeout', () => {
        req.destroy()
        console.error(`[cron] ${job.name} timed out`)
    })
}

/**
 * Start all cron jobs.
 *
 * @param port        Port the local Next.js server is listening on.
 * @param cronSecret  Bearer token expected by cron API routes.
 */
export function startCronJobs(port: number, cronSecret: string): void {
    console.error(`[cron] Scheduling ${CRON_JOBS.length} jobs ...`)

    for (const job of CRON_JOBS) {
        const task = cron.schedule(job.schedule, () => {
            executeCronJob(port, cronSecret, job)
        })
        scheduledTasks.push(task)
        console.error(`[cron]   ${job.name} → ${job.schedule}`)
    }

    console.error('[cron] All jobs scheduled.')
}

/**
 * Stop all running cron tasks.
 */
export function stopCronJobs(): void {
    console.error(`[cron] Stopping ${scheduledTasks.length} jobs ...`)
    for (const task of scheduledTasks) {
        task.stop()
    }
    scheduledTasks.length = 0
}

/**
 * Get the status of all defined cron jobs (for tray menu display).
 */
export function getCronJobNames(): string[] {
    return CRON_JOBS.map((j) => j.name)
}
