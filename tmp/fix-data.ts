
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- ĐANG QUÉT VÀ SỬA DỮ LIỆU TASK BỊ LỖI ENCODING ---')
  
  // Các mẫu ký tự lạ thường gặp khi bị lỗi encoding của "Đã nhận task"
  const garbledPatterns = [
    'Ä Ã£ nháº\u00adn task',
    'Ä\u0090\u00c3\u00a3 nh\u1eadn task',
    'Ã\u0084\u00c3\u00a3 nh\u1eadn task',
    'Ä[]Ã\u008a nh\u1eadn task'
  ]

  // Tìm các task có status mang ký tự lạ hoặc gần giống
  // Cách an toàn nhất: Tìm các task có status không nằm trong danh mục chuẩn nhưng có chữ "task" cuối
  const tasks = await prisma.task.findMany({
    where: {
      OR: [
        { status: { contains: 'nháº\u00adn task' } },
        { status: { contains: 'nhÃ¡ÂºÂºn task' } },
        { status: { contains: 'Ä' } }, // Tìm các ký tự lạ đặc trưng
        { status: { contains: 'Ã' } }
      ]
    }
  })

  console.log(`Tìm thấy ${tasks.length} task có dấu hiệu lỗi encoding.`)

  let count = 0
  for (const task of tasks) {
    // Nếu status chứa các ký tự lạ đặc trưng của lỗi UTF-8/ISO-8859-1
    if (task.status.includes('Ä') || task.status.includes('Ã') || task.status.includes('nháº')) {
      console.log(`Đang sửa task ID ${task.id}: "${task.status}" -> "Nhận task"`)
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'Nhận task' }
      })
      count++
    }
  }

  // Sửa cả những status "Đang đợi giao" nếu có bị lỗi tương tự
  const pendingTasks = await prisma.task.findMany({
    where: {
      OR: [
        { status: { contains: 'Ä\u0091\u1ee3i giao' } },
        { status: { contains: 'Ä\u0091á\u00bb\u00a3i giao' } }
      ]
    }
  })

  console.log(`Tìm thấy ${pendingTasks.length} task "Đang đợi giao" có dấu hiệu lỗi.`)
  for (const task of pendingTasks) {
    await prisma.task.update({
      where: { id: task.id },
      data: { status: 'Đang đợi giao' }
    })
    count++
  }

  console.log(`--- HOÀN TẤT: ĐÃ SỬA ${count} TASK ---`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
