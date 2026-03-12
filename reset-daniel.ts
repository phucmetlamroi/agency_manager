import { prisma } from './src/lib/db'
import * as bcrypt from 'bcryptjs'

async function resetDaniel() {
    const password = 'Botdinha123/'
    const hashedPassword = await bcrypt.hash(password, 10)
    
    // Daniel Hee
    const user = await prisma.user.findFirst({ where: { username: 'Daniel Hee' } })
    if (user) {
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword, plainPassword: password }
        })
        console.log('Reset Daniel Hee password.')
    } else {
        console.log('Daniel Hee not found.')
    }
}
resetDaniel()
