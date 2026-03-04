
const { PrismaClient } = require('@prisma/client')
// Importing the actual extension logic (simulated since I can't easily dynamic import TS here without setup)
// But I can manually walk through the logic.

const prisma = new PrismaClient()

// Simulated getWorkspacePrisma logic for testing
function getExtended(workspaceId) {
    return prisma.$extends({
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    if (['create'].includes(operation)) {
                        args.data = { ...args.data, workspaceId }
                    }
                    return query(args)
                }
            }
        }
    })
}

async function verify() {
    const ext = getExtended("test-workspace-ext")

    console.log("1. Verifying Feedback creation with taskId (Scalar)...")
    try {
        // This simulates task-actions.ts update
        const res = await ext.feedback.create({
            data: {
                content: "Verified Scalar Feedback",
                type: "INTERNAL",
                taskId: "ed1b4ed0-4479-4c53-b96e-d9c56be5bd5e" // Existing Task ID from user screenshot error
            }
        })
        console.log("SUCCESS: Feedback created with scalar taskId.")
    } catch (e) {
        console.error("FAILURE:", e.message)
    }

    await prisma.$disconnect()
}

verify()
