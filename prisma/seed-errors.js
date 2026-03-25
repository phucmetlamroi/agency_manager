const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const ERROR_DICTIONARY = [
  { code: 'ERR_DEADLINE_BREACH', description: 'Giao nộp sản phẩm trễ so với thời hạn (Deadline) quy định', severity: 1, penalty: 10 },
  { code: 'ERR_BRIEF_DEVIATION', description: 'Không tuân thủ hoặc làm sai lệch nội dung Brief do Manager soạn thảo', severity: 1, penalty: 7 },
  { code: 'ERR_AUDIO_MONO_BUG', description: 'Lỗi xuất âm thanh kỹ thuật (chỉ nghe được một bên tai)', severity: 1, penalty: 7 },
  { code: 'ERR_ASPECT_RATIO', description: 'Thiết lập sai tỷ lệ khung hình (Aspect ratio) của dự án', severity: 1, penalty: 7 },
  { code: 'ERR_SPAWN_NEW_BUGS', description: 'Quá trình chỉnh sửa đẻ thêm các lỗi mới không có trong bản gốc', severity: 1, penalty: 7 },
  { code: 'ERR_REPEAT_FEEDBACK', description: 'Cố tình lặp lại các lỗi kỹ thuật đã được Manager feedback trước đó', severity: 1, penalty: 7 },
  { code: 'ERR_PRESET_MISMATCH', description: 'Sử dụng sai bộ cấu hình xuất tệp (Preset) yêu cầu', severity: 2, penalty: 3 },
  { code: 'ERR_TEXT_JUMP_BUG', description: 'Lỗi phụ đề bị tràn sang cảnh sau hoặc xuất hiện sớm ở cảnh trước do không khớp với điểm cắt, đồng thời nội dung chữ bị lệch nhịp, hiển thị trước hoặc sau so với giọng nói thực tế trong video.', severity: 2, penalty: 3 },
  { code: 'ERR_SCRIPT_TYPO', description: 'Sai lỗi chính tả hoặc văn phạm trong script', severity: 3, penalty: 1 },
  { code: 'ERR_BLACK_FRAME', description: 'Bỏ sót khung hình đen (Black frame) trong dải băng hình', severity: 3, penalty: 1 },
  { code: 'ERR_NAMING_CONV', description: 'Đặt sai định dạng tên tệp tin video đầu ra', severity: 3, penalty: 1 },
  { code: 'ERR_VERSION_CONTROL', description: 'Không kéo video đã sửa vào thành các bản v2, v3 để Manager đối soát', severity: 3, penalty: 1 },
]

async function main() {
  console.log(`Bắt đầu seed dữ liệu ErrorDictionary...`)
  
  for (const item of ERROR_DICTIONARY) {
    const error = await prisma.errorDictionary.upsert({
      where: { code: item.code },
      update: {},
      create: {
        code: item.code,
        description: item.description,
        severity: item.severity,
        penalty: item.penalty,
        isActive: true,
      },
    })
    console.log(`Đã seed lỗi: ${error.code} - ${error.penalty} điểm`)
  }
  
  console.log(`Hoàn tất nạp dữ liệu từ điển lỗi.`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
