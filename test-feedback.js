
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function test() {
    console.log("Testing Feedback creation with direct workspaceId...")
    try {
        const feedback = await prisma.feedback.create({
            data: {
                content: "Test feedback",
                type: "INTERNAL",
                workspaceId: "test-workspace"
            }
        })
        console.log("Success with workspaceId:", feedback)
    } catch (e) {
        console.error("Failed with workspaceId:", e.message)
    }

    console.log("\nTesting Feedback creation with workspace connect...")
    try {
        const feedback = await prisma.feedback.create({
            data: {
                content: "Test feedback 2",
                type: "INTERNAL",
                workspace: { connect: { id: "test-workspace" } }
            }
        })
        console.log("Success with workspace connect:", feedback)
    } catch (e) {
        console.error("Failed with workspace connect:", e.message)
    }

    console.log("\nTesting Mixed (Relation + Scalar) [THIS IS WHAT EXTENSION DOES]...")
    try {
        const feedback = await prisma.feedback.create({
            data: {
                content: "Mixed test",
                type: "INTERNAL",
                task: { connect: { id: "ed1b4ed0-4479-4c53-b96e-d9c56be5bd5e" } },
                workspaceId: "test-workspace"
            }
        })
        console.log("Success with mixed:", feedback)
    } catch (e) {
        console.error("Failed with mixed:", e.message)
    }

    console.log("\nTesting Task Mixed (Scalar + Relation)...")
    try {
        const task = await prisma.task.create({
            data: {
                title: "Mixed task test",
                type: "SHORT",
                assigneeId: "some-user-id", // SCALAR
                workspace: { connect: { id: "test-workspace" } } // RELATION
            }
        })
        console.log("Success with task mixed:", task)
    } catch (e) {
        console.error("Failed with task mixed:", e.message)
    }

    await prisma.$disconnect()
}

test()
