'use server'

import { revalidateTag } from "next/cache"

export async function refreshLeaderboardAction() {
    // @ts-ignore
    revalidateTag('leaderboard')
    return { success: true }
}
