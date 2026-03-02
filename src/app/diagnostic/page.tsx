/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '@/lib/db'
import { env } from '@/lib/env'

export default async function DiagnosticPage() {
    const results = []

    // Test 1: Env Vars
    results.push({
        test: "Environment Variables Detection",
        status: env.DATABASE_URL !== "placeholder_url_replace_me" ? "OK" : "MISSING",
        details: `DATABASE_URL length: ${env.DATABASE_URL?.length || 0}. JWT_SECRET set: ${env.JWT_SECRET !== "temporary-build-secret-key-change-me"}`
    })

    // Test 2: Prisma Connection
    let prismaStatus = "UNKNOWN"
    let prismaDetails = ""
    try {
        const workspaceCount = await prisma.workspace.count()
        prismaStatus = "OK"
        prismaDetails = `Successfully connected to DB. Found ${workspaceCount} workspaces.`
    } catch (e: any) {
        prismaStatus = "FAILED"
        prismaDetails = e.message
    }
    results.push({
        test: "Prisma DB Connection",
        status: prismaStatus,
        details: prismaDetails
    })

    return (
        <div style={{ padding: '40px', background: '#0f172a', color: 'white', minHeight: '100vh', fontFamily: 'monospace' }}>
            <h1 style={{ color: '#6366f1' }}>Diagnostic Dashboard</h1>
            <p>Time: {new Date().toISOString()}</p>
            <hr style={{ opacity: 0.1, margin: '20px 0' }} />

            <div style={{ display: 'grid', gap: '20px' }}>
                {results.map((r, i) => (
                    <div key={i} style={{
                        padding: '20px',
                        background: '#1e293b',
                        borderRadius: '12px',
                        border: `1px solid ${r.status === 'OK' ? '#10b981' : '#f43f5e'}`
                    }}>
                        <h3 style={{ margin: '0 0 10px 0' }}>{r.test}</h3>
                        <div style={{ padding: '8px 12px', background: r.status === 'OK' ? '#064e3b' : '#451225', borderRadius: '4px', display: 'inline-block', marginBottom: '10px' }}>
                            {r.status}
                        </div>
                        <p style={{ margin: 0, opacity: 0.8, wordBreak: 'break-all' }}>{r.details}</p>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '40px' }}>
                <a href="/login" style={{ color: '#6366f1', textDecoration: 'none' }}>← Back to Login</a>
            </div>
        </div>
    )
}
