/**
 * electron-builder configuration for HustlyTasker Desktop.
 *
 * Usage:
 *   npx electron-builder --config builder.config.js --win
 *
 * NOTE: Static file paths are computed dynamically because Next.js
 * standalone replicates the project's directory tree.  In a git worktree
 * the server.js may be nested (e.g. .claude/worktrees/x/server.js)
 * and .next/static + public must sit alongside it.
 */
const fs = require('fs')
const path = require('path')

/* ------------------------------------------------------------------ */
/* Find server.js inside the standalone output (BFS, max depth 6).    */
/* Returns the relative directory from standalone root, '' if at root. */
/* ------------------------------------------------------------------ */
function findServerJsRelDir(standaloneRoot) {
    if (fs.existsSync(path.join(standaloneRoot, 'server.js'))) return ''

    const queue = [{ dir: standaloneRoot, rel: '' }]
    let depth = 0
    while (queue.length > 0 && depth < 6) {
        const size = queue.length
        for (let i = 0; i < size; i++) {
            const { dir, rel } = queue.shift()
            let entries
            try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
            for (const e of entries) {
                if (e.name === 'node_modules') continue
                const childRel = rel ? `${rel}/${e.name}` : e.name
                if (e.isFile() && e.name === 'server.js') return rel
                if (e.isDirectory()) queue.push({ dir: path.join(dir, e.name), rel: childRel })
            }
        }
        depth++
    }
    return '' // fallback — root
}

const standaloneRoot = path.resolve(__dirname, '..', '.next', 'standalone')
const serverRelDir = findServerJsRelDir(standaloneRoot)

// Build destination paths — static + public must sit next to server.js
const staticDest = serverRelDir
    ? `standalone/${serverRelDir}/.next/static`
    : 'standalone/.next/static'
const publicDest = serverRelDir
    ? `standalone/${serverRelDir}/public`
    : 'standalone/public'

console.log(`[builder.config] server.js relative dir: "${serverRelDir || '(root)'}"`)
console.log(`[builder.config] .next/static → ${staticDest}`)
console.log(`[builder.config] public       → ${publicDest}`)

/** @type {import('electron-builder').Configuration} */
const config = {
    appId: 'com.hustlytasker.desktop',
    productName: 'HustlyTasker',
    copyright: `Copyright ${new Date().getFullYear()} HustlyTasker`,

    directories: {
        output: 'release',
        buildResources: 'assets',
    },

    files: [
        'dist/**/*',
        'assets/**/*',
    ],

    extraResources: [
        {
            from: '../.next/standalone',
            to: 'standalone',
            filter: ['**/*'],
        },
        {
            from: '../.next/static',
            to: staticDest,
            filter: ['**/*'],
        },
        {
            from: '../public',
            to: publicDest,
            filter: ['**/*'],
        },
    ],

    win: {
        target: [
            {
                target: 'nsis',
                arch: ['x64'],
            },
        ],
        icon: 'assets/icon.ico',
        signAndEditExecutable: false,
    },

    forceCodeSigning: false,

    nsis: {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        installerIcon: 'assets/icon.ico',
        uninstallerIcon: 'assets/icon.ico',
        installerHeaderIcon: 'assets/icon.ico',
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'HustlyTasker',
    },
}

module.exports = config
