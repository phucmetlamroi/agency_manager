'use client'

import { useState } from 'react'

export default function DiagnosticPage() {
    const [result, setResult] = useState<string>('Ready')
    const [loading, setLoading] = useState(false)

    const runTest = async () => {
        setLoading(true)
        setResult('Running...')
        try {
            const res = await fetch('/api/diagnostic')
            const data = await res.json()
            setResult(JSON.stringify(data, null, 2))
        } catch (e: any) {
            setResult('Error: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="p-10 bg-slate-900 text-white min-h-screen">
            <h1 className="text-2xl mb-4">DB Diagnostic</h1>
            <button
                onClick={runTest}
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 rounded"
            >
                {loading ? 'Testing...' : 'Test Connection'}
            </button>
            <pre className="mt-10 bg-black p-4 rounded border border-gray-800">
                {result}
            </pre>
        </div>
    )
}
