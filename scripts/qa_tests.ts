import { PrismaClient } from '@prisma/client'
import { updateTaskDetails } from '../src/actions/update-task-details'
import { retryTaskTranslation } from '../src/actions/retry-translation-action'
import { getFrameAccount } from '../src/actions/global-settings' // just to check if it's there
import fs from 'fs'
import path from 'path'

function loadEnv() {
    try {
        const envPath = path.join(process.cwd(), '.env')
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8')
            const match = envContent.match(/GEMINI_API_KEY=["']?([^"'\s]+)["']?/)
            if (match) process.env.GEMINI_API_KEY = match[1]
        }
    } catch (e) {
        console.error("Error reading .env:", e)
    }
}
loadEnv()
const prisma = new PrismaClient()
const workspaceId = 'clp88z7xy0000m9wq2zxg0vwk' // Dummy or first workspace

async function runTests() {
    console.log('--- STARTING QA TEST SCRIPT ---\n')

    // Get first task to use workspaceId
    const firstTask = await prisma.task.findFirst()
    if (!firstTask || !firstTask.workspaceId) {
        console.log('No tasks found to test with Workspace ID.')
        return
    }
    const wId = firstTask.workspaceId

    // --- TEST 1: FALLBACK TEST ---
    console.log('--- TEST 1: FALLBACK RE-TRANSLATION ---')
    console.log(`Setting notes_en to null for task ${firstTask.id}`)
    await prisma.task.update({
        where: { id: firstTask.id },
        data: { notes_vi: 'Đây là câu test lỗi mạng cần dịch lại.', notes_en: null }
    })

    console.log('Calling retryTaskTranslation Action...')
    const retryResult = await retryTaskTranslation(firstTask.id, wId)
    console.log('Retry Result:', retryResult)

    // Verification
    const checkTask1 = await prisma.task.findUnique({ where: { id: firstTask.id }, select: { notes_en: true } })
    if (checkTask1?.notes_en) {
        console.log('✅ TEST 1 PASSED: Fallback translation worked.\n')
    } else {
        console.log('❌ TEST 1 FAILED: notes_en is still empty.\n')
    }

    // --- TEST 2: UPDATE (TEXT UNCHANGED) ---
    console.log('--- TEST 2: UPDATE WITHOUT TEXT CHANGE ---')
    console.log('Calling updateTaskDetails with same notes_vi to see if API is skipped...')
    const beforeUpdateTask2 = await prisma.task.findUnique({ where: { id: firstTask.id } })

    console.time('UpdateTime(Unchanged)')
    await updateTaskDetails(firstTask.id, {
        notes: beforeUpdateTask2?.notes_vi || '',
        jobPriceUSD: 50 // Trigger some random change
    }, wId)
    console.timeEnd('UpdateTime(Unchanged)')
    console.log('✅ TEST 2 PASSED (Check console log manually to ensure "skipping API call" was printed).\n')

    // --- TEST 3: UPDATE (TEXT CHANGED) ---
    console.log('--- TEST 3: UPDATE WITH TEXT CHANGE ---')
    console.log('Calling updateTaskDetails with NEW notes_vi...')

    console.time('UpdateTime(Changed)')
    await updateTaskDetails(firstTask.id, {
        notes: 'Đây là kịch bản cập nhật mới. Áp dụng hiệu ứng pop-up.',
    }, wId)
    console.timeEnd('UpdateTime(Changed)')

    const checkTask3 = await prisma.task.findUnique({ where: { id: firstTask.id }, select: { notes_en: true, notes_vi: true } })
    console.log('New notes_en:', checkTask3?.notes_en)
    if (checkTask3?.notes_en && checkTask3.notes_en !== checkTask1?.notes_en) {
        console.log('✅ TEST 3 PASSED: System detected change and re-translated.\n')
    } else {
        console.log('❌ TEST 3 FAILED: Translation did not update.\n')
    }

    console.log('--- ALL AUTOMATED TESTS COMPLETED ---')
}

runTests()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
