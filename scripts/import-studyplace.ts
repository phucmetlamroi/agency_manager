import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import OpenAI from 'openai'

type ParsedQuestion = {
    id: string
    question: string
    options: string[]
    correctAnswer: string
    sourceScore: string
    selectedAnswer: string | null
    viTranslation: string
    viExplanation: string
    whyCorrect: string
    keyTerms: Array<{ term: string; meaning: string; note: string }>
    grammarNotes: string[]
    memoryHook: string
    tags: string[]
    checksum: string
}

type RawQuestion = {
    question: string
    options: string[]
    correctAnswer: string | null
    sourceScore: string
    selectedAnswer: string | null
    paragraphStart: number
    paragraphEnd: number
}

const STUDY_SET_ID = 'vietnam-culture-review-2026-07'
const DEFAULT_DOCX_PATH = 'C:\\Users\\Dareu\\Downloads\\bộ câu hỏi và trả lời.docx'
const DATA_PATH = path.join(process.cwd(), 'src', 'lib', 'study-place-data.json')
const REPORT_PATH = path.join(process.cwd(), 'docs', 'studyplace-import-report.md')
const DEFAULT_MODEL = process.env.STUDYPLACE_MODEL || 'gpt-4o-mini'

function loadDotEnv() {
    const envPath = path.join(process.cwd(), '.env')
    if (!fs.existsSync(envPath)) return
    const text = fs.readFileSync(envPath, 'utf8')
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const idx = trimmed.indexOf('=')
        if (idx === -1) continue
        const key = trimmed.slice(0, idx).trim()
        let value = trimmed.slice(idx + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1)
        }
        if (!process.env[key]) process.env[key] = value
    }
}

function crc32(buf: Buffer) {
    let crc = -1
    for (const byte of buf) {
        crc ^= byte
        for (let i = 0; i < 8; i += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
        }
    }
    return (crc ^ -1) >>> 0
}

function readZipEntry(zipPath: string, entryName: string) {
    const buffer = fs.readFileSync(zipPath)
    const eocdSig = 0x06054b50
    let eocd = -1
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 0xffff - 22); i -= 1) {
        if (buffer.readUInt32LE(i) === eocdSig) {
            eocd = i
            break
        }
    }
    if (eocd === -1) throw new Error('Cannot find ZIP central directory.')

    const centralDirSize = buffer.readUInt32LE(eocd + 12)
    const centralDirOffset = buffer.readUInt32LE(eocd + 16)
    const centralDirEnd = centralDirOffset + centralDirSize
    let offset = centralDirOffset

    while (offset < centralDirEnd) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) {
            throw new Error('Invalid ZIP central directory entry.')
        }
        const method = buffer.readUInt16LE(offset + 10)
        const compressedSize = buffer.readUInt32LE(offset + 20)
        const fileNameLength = buffer.readUInt16LE(offset + 28)
        const extraLength = buffer.readUInt16LE(offset + 30)
        const commentLength = buffer.readUInt16LE(offset + 32)
        const localHeaderOffset = buffer.readUInt32LE(offset + 42)
        const fileName = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString('utf8')

        if (fileName === entryName) {
            if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
                throw new Error('Invalid ZIP local header.')
            }
            const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
            const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28)
            const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength
            const compressed = buffer.slice(dataOffset, dataOffset + compressedSize)
            if (method === 0) return compressed.toString('utf8')
            if (method === 8) return zlib.inflateRawSync(compressed).toString('utf8')
            throw new Error(`Unsupported ZIP compression method: ${method}`)
        }

        offset += 46 + fileNameLength + extraLength + commentLength
    }

    throw new Error(`Entry not found in DOCX: ${entryName}`)
}

function decodeXml(value: string) {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
}

function extractParagraphs(documentXml: string) {
    const paragraphs: string[] = []
    const paragraphMatches = documentXml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)
    for (const match of paragraphMatches) {
        const paragraphXml = match[0]
        const textParts = [...paragraphXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => decodeXml(m[1]))
        paragraphs.push(textParts.join('').trim())
    }
    return paragraphs
}

function isScoreLine(value: string) {
    if (!value || !value.includes('/') || value.length > 8) return false
    const [left, right] = value.split('/', 2)
    return right === '1' && (left === '0' || left === '1' || (left.length > 0 && [...left].every((char) => char === '·')))
}

function stripQuestionMarks(value: string) {
    return value.replace(/\*+$/g, '').trim()
}

function isFormMetadata(value: string) {
    return /^VNC\d+\s+Quiz/i.test(value)
        || /^Total points/i.test(value)
        || /^The respondent's email/i.test(value)
        || /^Email$/i.test(value)
}

function findQuestionStart(paragraphs: string[], scoreIndex: number, previousScoreIndex: number) {
    let start = scoreIndex - 1
    if (paragraphs[start] === '*') start -= 1
    while (
        start > previousScoreIndex + 1 &&
        paragraphs[start - 1] !== '' &&
        paragraphs[start - 1] !== 'Correct answer' &&
        !isScoreLine(paragraphs[start - 1])
    ) {
        start -= 1
    }
    return start
}

function parseQuestionsFromDocx(docxPath: string) {
    const xml = readZipEntry(docxPath, 'word/document.xml')
    const paragraphs = extractParagraphs(xml)
    const scoreIndexes = paragraphs
        .map((paragraph, index) => ({ paragraph, index }))
        .filter(({ paragraph }) => isScoreLine(paragraph))
        .map(({ index }) => index)

    const questionStarts = scoreIndexes.map((scoreIndex, idx) => findQuestionStart(paragraphs, scoreIndex, scoreIndexes[idx - 1] ?? -1))
    const raw: RawQuestion[] = []

    for (let idx = 0; idx < scoreIndexes.length; idx += 1) {
        const scoreIndex = scoreIndexes[idx]
        const questionStart = questionStarts[idx]
        const nextQuestionStart = questionStarts[idx + 1] ?? paragraphs.length
        const questionLines = paragraphs
            .slice(questionStart, scoreIndex)
            .filter((line) => line && line !== '*')
            .map(stripQuestionMarks)
        const question = questionLines.join('\n').trim()
        if (!question || /student no\./i.test(question)) continue

        const body = paragraphs.slice(scoreIndex + 1, nextQuestionStart)
        const correctAnswerIndex = body.findIndex((line) => line === 'Correct answer')
        const optionEnd = correctAnswerIndex === -1 ? body.length : correctAnswerIndex
        const metadataIndex = body.slice(0, optionEnd).findIndex((line) => isFormMetadata(line))
        const effectiveOptionEnd = metadataIndex === -1 ? optionEnd : metadataIndex
        const optionSource = body.slice(0, effectiveOptionEnd)
        const options = optionSource.filter((line) => line).map(stripQuestionMarks)
        let selectedAnswer: string | null = null
        for (let bodyIndex = 0; bodyIndex < effectiveOptionEnd; bodyIndex += 1) {
            const line = body[bodyIndex]
            if (!line) continue
            const next = body[bodyIndex + 1]
            if (next === '' && options.includes(stripQuestionMarks(line))) {
                selectedAnswer = stripQuestionMarks(line)
                break
            }
        }

        let correctAnswer: string | null = null
        if (correctAnswerIndex !== -1) {
            const answer = body.slice(correctAnswerIndex + 1).find((line) => line)
            correctAnswer = answer ? stripQuestionMarks(answer) : null
        } else if (paragraphs[scoreIndex] === '1/1') {
            correctAnswer = selectedAnswer
        }

        raw.push({
            question,
            options,
            correctAnswer,
            sourceScore: paragraphs[scoreIndex],
            selectedAnswer,
            paragraphStart: questionStart + 1,
            paragraphEnd: nextQuestionStart,
        })
    }

    return { raw, paragraphs, scoreIndexes }
}

function checksumFor(question: Pick<ParsedQuestion, 'question' | 'options' | 'correctAnswer'>) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify({
            question: question.question,
            options: question.options,
            correctAnswer: question.correctAnswer,
        }))
        .digest('hex')
        .slice(0, 16)
}

function inferTags(question: RawQuestion) {
    const text = `${question.question} ${question.correctAnswer ?? ''}`.toLowerCase()
    const tags = new Set<string>()
    if (/language|alphabet|vietnamese|chu|script|name/.test(text)) tags.add('language')
    if (/dynasty|colonial|french|war|emperor|king|century|revolution/.test(text)) tags.add('history')
    if (/climate|season|river|mountain|territory|delta|geography|region/.test(text)) tags.add('geography')
    if (/buddh|confuc|tao|religion|temple|ancestor|festival|tet|calendar|zodiac/.test(text)) tags.add('culture')
    if (/sport|music|literature|magazine|art|theatre|poet/.test(text)) tags.add('arts')
    if (tags.size === 0) tags.add('general')
    return [...tags]
}

const ANSWER_TRANSLATIONS: Record<string, string> = {
    'All are correct': 'Tất cả các phương án đều đúng',
    'All of the above': 'Tất cả các phương án trên đều đúng',
    'A and B are correct': 'Cả A và B đều đúng',
    'None of the above': 'Không có phương án nào ở trên',
    'None are correct': 'Không có phương án nào đúng',
    'Four': 'Bốn',
    'Three': 'Ba',
    'Two': 'Hai',
    'Spring': 'Mùa xuân',
    'Water': 'Thủy',
    'Metal': 'Kim',
    'Earth': 'Thổ',
    'zodiac animals': 'các con giáp',
    'The Battle of Dien Bien Phu (1954)': 'Trận Điện Biên Phủ năm 1954',
    'The Paris Peace Accords': 'Hiệp định Paris',
    'The Socialist Republic of Vietnam': 'Cộng hòa Xã hội Chủ nghĩa Việt Nam',
    'The Hong Duc Code': 'Bộ luật Hồng Đức',
    'Tropical Monsoon': 'Khí hậu nhiệt đới gió mùa',
    "'gio mua'": 'gió mùa',
    "'Chu Nom'": 'Chữ Nôm',
    "'Collected Poems in the National Language' was written in Vernacular characters.": '“Quốc âm thi tập” được viết bằng chữ Nôm',
    'Written in Chinese characters': 'Viết bằng chữ Hán',
    'Written in Egyptian hieroglyphs': 'Viết bằng chữ tượng hình Ai Cập',
    'The Gia Dinh Newspaper': 'Báo Gia Định',
    'The Tale of Kieu': 'Truyện Kiều',
    'The Law on Marriage and the Family in 1959': 'Luật Hôn nhân và Gia đình năm 1959',
    'International Workers\' Day': 'Ngày Quốc tế Lao động',
}

const QUESTION_TRANSLATIONS_BY_ID: Record<number, string> = {
    1: 'Điền từ đúng: ... được phát triển bằng cách tiếp thu và biến đổi một số ký hiệu của chữ Hán để ghi lại âm tiếng Việt.',
    2: 'Điền từ đúng: Ba phần tư lãnh thổ Việt Nam được tạo thành bởi ...',
    3: 'Điền từ đúng: ... là tên gọi được quan lại nhà Đường sử dụng khi đô hộ Việt Nam từ thế kỷ VII đến thế kỷ X.',
    4: 'Tiếng Việt có bao nhiêu nguyên âm?',
    5: 'Chọn phát biểu đúng.',
    6: 'Phát biểu nào sau đây về Việt Nam là sai?',
    7: 'Chọn phát biểu sai về tên người Việt Nam.',
    8: 'Họ phổ biến nhất ở Việt Nam là họ nào?',
    9: 'Tên gọi nào chỉ miền Nam và bắt nguồn từ thuật ngữ hành chính Hán-Việt cổ “Giao Chỉ”?',
    10: 'Bảng chữ cái tiếng Việt có bao nhiêu chữ cái?',
    11: 'Trên thế giới có bao nhiêu chủng tộc lớn?',
    12: 'Việt Nam có bao nhiêu mùa?',
    13: 'Việt Nam có kiểu khí hậu nào?',
    14: 'Thời tiết Việt Nam chịu sự chi phối của loại gió mùa được gọi là gì?',
    15: 'Việt Nam có bao nhiêu kilômét đường bờ biển?',
    16: 'Điểm cực Đông của Việt Nam là địa danh nào?',
    17: 'Tên gọi nào chỉ miền Bắc và bắt nguồn từ từ Hán-Việt “Đông Kinh”?',
    18: 'Tên gọi nào chỉ miền Trung Việt Nam và có nghĩa là “phương Nam đã được bình định”?',
    19: 'Dãy núi dài nhất Việt Nam tên là gì?',
    20: 'Chọn phát biểu sai.',
    21: 'Ai là tổ nghề đúc súng thần công ở Việt Nam?',
    22: 'Sự kiện nào đã chấm dứt chế độ thực dân Pháp ở Việt Nam?',
    23: 'Hiệp định nào đã chấm dứt sự can dự của Hoa Kỳ tại Việt Nam?',
    24: 'Hiệp định chấm dứt chiến tranh và lập lại hòa bình ở Việt Nam được ký vào năm nào?',
    25: 'Nhà nước sơ khai đầu tiên của Việt Nam là nhà nước nào?',
    26: 'Phát biểu nào sau đây về nội chiến Trịnh-Nguyễn là sai?',
    27: 'Chiến lược Việt Nam hóa chiến tranh được thực hiện bởi ai?',
    28: 'Chọn phát biểu sai.',
    29: '“Tôi không sợ chiến tranh, chỉ sợ lòng dân không theo ta” là câu nói nổi tiếng của ai?',
    30: 'Phát biểu nào sau đây về nhà Trần là sai?',
    31: 'Sự kiện Vịnh Bắc Bộ xảy ra vào năm nào?',
    32: 'Phát biểu nào sau đây về Việt Nam thời Bắc thuộc là sai?',
    33: 'Từ năm 1976, tên chính thức của Việt Nam là gì?',
    34: 'Bộ luật nào được xem là quan trọng, tiến bộ và trở thành mẫu mực cho sự phát triển pháp luật sau này ở Việt Nam?',
    35: 'Triều Nguyễn có bao nhiêu vị vua?',
    36: 'Điền từ đúng: Quốc Tử Giám được thành lập dưới triều vua ...',
    37: 'Phát biểu nào sau đây về Việt Nam dưới triều Nguyễn là đúng?',
    38: 'Chọn phát biểu sai về thuyết domino.',
    39: 'Ai là người kế nhiệm Hồ Chí Minh đứng đầu Đảng Cộng sản Việt Nam?',
    40: 'Phát biểu nào sau đây về chủ nghĩa dân tộc Việt Nam là sai?',
    41: 'Phát biểu nào sau đây về thời kỳ Bắc thuộc là sai?',
    42: 'Chọn phát biểu sai.',
    43: 'Trận Điện Biên Phủ kéo dài bao lâu?',
    44: 'Điền từ đúng: Đinh Bộ Lĩnh đặt tên nước là ... và đóng đô ở Hoa Lư, nay thuộc Ninh Bình.',
    45: 'Chọn phát biểu sai.',
    46: 'Việt Minh được thành lập vào năm nào?',
    47: 'Công giáo du nhập vào Việt Nam khi nào?',
    48: 'Thời kỳ hoàng kim của Phật giáo ở Việt Nam là giai đoạn nào?',
    49: 'Điều nào không thuộc ba truyền thống Phật giáo cơ bản?',
    50: 'Phát biểu nào sau đây về Công giáo ở Việt Nam là sai?',
    51: 'Ai sáng lập phong trào Hòa Hảo?',
    52: 'Phật giáo lần đầu được du nhập vào Việt Nam từ Trung Quốc vào thời gian nào?',
    53: 'Ba chân lý phổ quát trong Phật giáo bao gồm những điều nào?',
    54: 'Điều nào sai về “vong hồn lang thang” theo quan niệm tín ngưỡng vạn vật hữu linh?',
    55: 'Ai được xem là vị tổ Thiền tông Việt Nam đầu tiên?',
    56: 'Phát biểu nào sau đây về Phật giáo Hòa Hảo là sai?',
    57: 'Điều nào sai về Đạo giáo?',
    58: 'Điều nào không thuộc ba đức tính mà mỗi thành viên và lãnh đạo Gia đình Phật tử Việt Nam được khuyên nên noi theo?',
    59: 'Những quan hệ nào thuộc “Ngũ luân” của Nho giáo?',
    60: 'Đạo Cao Đài chính thức được thành lập khi nào?',
    61: 'Ai là người sáng lập Phật giáo?',
    62: 'Phát biểu nào sau đây về biểu tượng Âm Dương trong Đạo giáo là sai?',
    63: 'Điều nào sai về tín ngưỡng vạn vật hữu linh thời tiền thuộc địa?',
    64: 'Điều nào không nằm trong Bảy Bí tích?',
    65: 'Phát biểu nào sau đây về Nho giáo ở Việt Nam là đúng?',
    66: 'Phát biểu nào sau đây về tín ngưỡng vạn vật hữu linh là sai?',
    67: 'Giáo hội Phật giáo Việt Nam Thống nhất được thành lập vào năm nào?',
    68: 'Những giáo lý cơ bản cốt lõi của Phật giáo là gì?',
    69: 'Điều nào sai về Đạo giáo?',
    70: 'Ai là người sáng lập Đạo giáo?',
    71: 'Phát biểu nào sau đây về tín ngưỡng vạn vật hữu linh là sai?',
    72: 'Phát biểu nào sau đây về tín ngưỡng vạn vật hữu linh là đúng?',
    73: 'Phát biểu nào không đúng về Nho giáo?',
    74: 'Ai tạo lập đạo Cao Đài?',
    75: 'Những điều nào sau đây là niềm tin của Phật giáo?',
    76: 'Điều nào sai về các đạo sĩ Đạo giáo?',
    77: 'Đạo Cao Đài thờ những ai?',
    78: 'Ai không phải là nhà văn hiện thực trong văn học Việt Nam?',
    79: 'Điều nào không thuộc các loại hình văn học Việt Nam?',
    80: 'Tác phẩm nào được xem là tuyên ngôn kêu gọi thanh niên Việt Nam tự hiện đại hóa?',
    81: 'Phát biểu nào sau đây về các tác giả hiện thực là sai?',
    82: 'Văn học Việt Nam có thể được chia thành bao nhiêu loại?',
    83: 'Đại Việt sử ký toàn thư thuộc loại hình văn học nào?',
    84: 'Chọn phát biểu không đúng về truyền thống văn học dân gian.',
    85: 'Khi nào các học giả Việt phát triển hệ chữ viết thứ hai, tức chữ Nôm?',
    86: 'Ai không thuộc “thế hệ thứ nhất” của văn học kháng chiến?',
    87: 'Hội văn học cánh tả nào ở Bắc Kỳ trong thập niên 1930?',
    88: 'Ai là người sáng lập báo Gia Định?',
    89: 'Ai không phải là thành viên của Tự Lực văn đoàn?',
    90: 'Ai thuộc “thế hệ thứ hai” của văn học kháng chiến?',
    91: 'Phát biểu nào sau đây về văn học kháng chiến là đúng?',
    92: 'Thời kỳ hoàng kim của chữ Nôm là khi nào?',
    93: 'Chữ Quốc ngữ được giới thiệu vào khi nào?',
    94: 'Chọn phát biểu sai về văn học Đổi mới.',
    95: 'Điền từ đúng: “Bình Ngô đại cáo”, một kiệt tác của văn học Việt Nam, được viết bằng ...',
    96: 'Ai phát minh/tạo ra chữ Quốc ngữ?',
    97: 'Điều nào không thuộc đặc điểm của văn học Đổi mới?',
    98: 'Ai là người lãnh đạo Tự Lực văn đoàn?',
    99: 'Chữ Nôm được đặt làm hệ chữ viết chính thức vào thời nào?',
    100: 'Phong trào văn học Đổi mới ở Việt Nam bắt đầu khi nào?',
    101: 'Tác phẩm nào không được viết bằng chữ Nôm?',
    102: 'Tờ báo tiếng Việt đầu tiên là tờ nào?',
    103: 'Tác phẩm nổi tiếng nhất đầu thế kỷ XIX và hiện nay được biết đến là viết bằng chữ Nôm là gì?',
    104: 'Ai là giám đốc kiêm chủ bút tạp chí Nam Phong, xuất bản ở Hà Nội từ 1917 đến 1934?',
    105: 'Ai không thuộc “thế hệ thứ ba” của văn học kháng chiến?',
    106: 'Trường Mỹ thuật Đông Dương được mở vào năm nào?',
    107: 'Điều gì làm bút pháp Bát Tràng dễ nhận ra?',
    108: 'Điều nào không thuộc kiến trúc tôn giáo?',
    109: 'Sơn mài bắt đầu sử dụng bảng màu rộng hơn vào khi nào?',
    110: 'Điều nào không đúng về nghệ thuật tiền thuộc địa?',
    111: 'Điền từ đúng: Phần lớn nghệ thuật và kiến trúc tiền thuộc địa của Việt Nam do ... tạo ra.',
    112: 'Chọn phát biểu sai về gốm sứ Việt Nam thời tiền thuộc địa.',
    113: 'Các loại hình kiến trúc Việt bao gồm những gì?',
    114: 'Ai thuộc thế hệ đầu tiên của các họa sĩ hiện đại, tốt nghiệp năm 1930?',
    115: 'Trong tranh khắc gỗ, thứ gì trở thành vật gia truyền và được truyền từ đời này sang đời khác?',
    116: 'Điền từ đúng: Trường phái “...” biệt lập hơn đã hướng nội, trở về với gốc làng quê và văn hóa dân gian cổ.',
    117: 'Sơn mài đen truyền thống ban đầu được tạo ra như thế nào?',
    118: 'Trường Mỹ thuật do Pháp thành lập được đổi tên thành Trường Mỹ thuật Việt Nam vào năm nào?',
    119: 'Chọn phát biểu sai về in mộc bản thời tiền thuộc địa.',
    120: 'Loại gốm nào được ưa chuộng trong thế kỷ XI-XII?',
    121: 'Trường Cao đẳng Mỹ thuật Công nghiệp được mở vào năm nào?',
    122: 'Loại gốm nào được ưa chuộng trong thế kỷ XV?',
    123: 'Chọn phát biểu đúng về hội họa hiện đại.',
    124: 'Vì sao in mộc bản có thể được xem là một loại hình nghệ thuật lớn?',
    125: 'Ai đã đưa chủ nghĩa Lập thể vào Việt Nam? Chọn phát biểu sai.',
    126: 'Chọn phát biểu không đúng về nghệ thuật và kiến trúc tiền thuộc địa.',
    127: 'Chọn phát biểu đúng.',
    128: 'Trường Cao đẳng Mỹ thuật Công nghiệp được mở vào năm nào?',
    129: 'Phát biểu nào sai về in mộc bản thời tiền thuộc địa?',
    130: 'Thành nhà Hồ thuộc loại kiến trúc nào?',
    131: 'Chọn phát biểu sai.',
    132: 'Điền từ đúng: Qua việc chọn chủ đề và kỹ thuật, “...” thể hiện nhận thức rõ hơn về phương Tây và ảnh hưởng của nó từ thập niên 1950 đến 1970.',
    133: 'Ban đầu sơn mài truyền thống được phép dùng bao nhiêu màu?',
    134: 'Điều nào không phải chức năng của đồ sơn mài thời cổ?',
    135: 'Phần lớn sản phẩm nghệ thuật và kiến trúc tiền thuộc địa Việt Nam được làm để phục vụ điều gì?',
    136: 'Vì sao tranh cuộn hoặc tranh tường thời tiền hiện đại không tạo được sự quan tâm tương tự ở giới nho sĩ và nghệ sĩ Việt như ở Trung Quốc?',
    137: 'Nghề làm gốm trên đất Việt có từ thời nào?',
    138: 'Chọn phát biểu sai về kiến trúc Việt Nam.',
    139: 'Nguồn cảm hứng dồi dào cho nghệ nhân nghệ thuật và kiến trúc tiền thuộc địa Việt Nam là gì?',
    140: 'Khi nào Việt Nam chứng kiến sự xuất hiện của hai trường phái nghệ thuật, một ở miền Bắc và một ở miền Nam?',
    141: 'Điều gì buộc tất cả nghệ sĩ rời khỏi thế giới nội tâm để bước vào thế giới chiến tranh hỗn loạn và chết chóc?',
    142: 'Nghề gốm trên đất Việt thật sự phát triển mạnh vào thời nào?',
    143: 'Kiến trúc Việt có thể chia thành bao nhiêu loại?',
    144: 'Chọn phát biểu đúng.',
    145: 'Chọn phát biểu sai về đồ dùng và phép tắc ăn uống Việt Nam thời tiền thuộc địa.',
    146: 'Chọn phát biểu không đúng về bữa ăn hằng ngày ở Việt Nam.',
    147: 'Thứ gì thường được dùng trong súp và làm món chính, thường thay thịt hoặc cá trong ẩm thực chay?',
    148: 'Điền từ đúng: Dưới ảnh hưởng giáo lý Phật giáo về việc tránh sát sinh, nhiều người Việt thời tiền thuộc địa thực hành ... ít nhất trong một phần thời gian.',
    149: 'Định nghĩa về một phụ nữ đẹp ở Việt Nam thế kỷ XVIII là gì?',
    150: 'Điều gì sai về phép tắc ăn uống của người Việt?',
    151: 'Loài côn trùng nào là nguồn đạm động vật nổi tiếng ở miền Bắc Việt Nam?',
    152: 'Thứ gì tượng trưng cho sự chung thủy và hạnh phúc hôn nhân?',
    153: 'Điền từ đúng: ... góp phần khiến người Việt tiếp thu các thực phẩm như xì dầu, đậu phụ, mì, cũng như kỹ thuật xào, chiên bằng chảo và dùng đũa.',
    154: 'Điều gì góp phần tạo nên văn hóa ẩm thực Việt Nam?',
    155: 'Đồ uống chính trong thời tiền thuộc địa là gì?',
    156: 'Khi chưa có tủ lạnh, ... thường được dùng để bảo quản cá cho lần dùng sau.',
    157: 'Loài côn trùng nào là nguồn đạm động vật nổi tiếng ở miền Nam Việt Nam?',
    158: 'Loại nào không nằm trong các loại trà Việt Nam thời tiền thuộc địa?',
    159: 'Thứ gì là sản phẩm được chưng cất, tinh lọc và cũng là lễ vật truyền thống dâng lên thần linh, tổ tiên?',
    160: 'Điều gì bị xem là bất kính trong văn hóa Việt, đặc biệt thời tiền thuộc địa?',
    161: '... cũng có vai trò trong ẩm thực tiền thuộc địa, nhưng là món hiếm, ngay cả trong tầng lớp tinh hoa.',
    162: 'Lý do của tục nhuộm răng đen bằng sơn là gì?',
    163: 'Điền từ đúng: “Tôi chưa từng nhớ ai như nhớ ... Mỗi lần chôn ống điếu xuống, tôi lại phải đào nó lên.”',
    164: 'Điền từ đúng: Chính quyền Pháp thời thuộc địa khuyến khích người Việt dùng ... bằng cách cấp độc quyền bán cho các công ty tư nhân để đổi lấy một phần lợi nhuận.',
    165: 'Chọn phát biểu đúng về đồ dùng và phép tắc ăn uống Việt Nam thời tiền thuộc địa.',
    166: 'Chọn phát biểu sai về văn hóa đồ uống Việt Nam thời tiền thuộc địa.',
    167: 'Theo quan niệm người Việt, vì sao không nên gõ đũa vào bát?',
    168: 'Chọn phát biểu không đúng.',
    169: 'Ở Việt Nam tiền thuộc địa và đặc biệt thời thuộc địa, loại hạt nào là ngũ cốc quan trọng thứ hai trong bữa ăn hằng ngày?',
    170: 'Điều gì không đúng về phép tắc ăn uống của người Việt?',
    171: 'Loại rượu nào được nhập từ Trung Quốc?',
    172: 'Nước mắm chất lượng cao nhất (“thượng hạng”) được nhận biết như thế nào?',
    173: 'Chọn phát biểu sai.',
    174: 'Chính phủ bắt đầu triển khai các chiến dịch kiểm soát sinh sản vào năm nào?',
    175: 'Có bao nhiêu giá trị và phong tục nền tảng ăn sâu trong tinh thần văn hóa Việt?',
    176: 'Ai được xem là trưởng tộc?',
    177: 'Chọn phát biểu đúng về đời sống gia đình ở CHXHCN Việt Nam.',
    178: 'Quy trình hôn nhân thời tiền thuộc địa có bao nhiêu giai đoạn?',
    179: 'Điều gì không nằm trong “tam tòng” mà phụ nữ thời tiền thuộc địa phải tuân theo?',
    180: 'Độ tuổi kết hôn “bình thường” thời tiền thuộc địa là bao nhiêu?',
    181: 'Những từ nào có thể mô tả gia đình Việt Nam ngày nay?',
    182: 'Chọn phát biểu không đúng về hôn nhân Việt Nam thời tiền thuộc địa.',
    183: 'Người Việt thời tiền thuộc địa xác định bản thân dựa trên điều gì?',
    184: 'Điều gì không đúng về hôn nhân Việt Nam thời tiền thuộc địa?',
    185: 'Phát biểu nào sai về trưởng tộc?',
    186: 'Mối quan tâm đầu tiên của thế hệ 2000 là gì?',
    187: 'Thời tiền thuộc địa, người Việt trước hết được xác định bởi điều gì?',
    188: 'Điều gì không đúng về thế hệ 2000?',
    189: 'Yếu tố nào không góp phần làm tăng gia đình hạt nhân hai thế hệ từ sau năm 1975?',
    190: 'Giai đoạn nào sau đây không thuộc quy trình hôn nhân thời tiền thuộc địa?',
    191: 'Mẹ chồng không có quyền hạn nào đối với con dâu thời tiền thuộc địa?',
    192: 'Điều gì được xem là bằng chứng của bất hiếu thời tiền thuộc địa?',
    193: 'Điều gì không thuộc các khuyến khích tích cực dùng để thuyết phục phụ nữ sử dụng biện pháp kiểm soát sinh sản năm 1962?',
    194: 'Chọn phát biểu sai về gia đình Việt Nam thời tiền thuộc địa.',
    195: 'Điều nào không phải lý do cha mẹ đặt cho con các tên xấu như “lợn”, “chó”, hoặc “đần” thời tiền thuộc địa?',
    196: 'Ai có vai trò quan trọng trong việc thông qua Luật Gia đình năm 1958?',
    197: 'Điều gì không đúng về đời sống gia đình ở CHXHCN Việt Nam?',
    198: 'Điều gì không nằm trong chính sách “ba đảm đang” năm 1965?',
    199: 'Chọn phát biểu đúng về gia đình Việt Nam thời tiền thuộc địa.',
    200: 'Phát biểu nào không đúng về người đứng đầu gia đình?',
    201: 'Điều gì không đúng về các chính sách dùng để thuyết phục phụ nữ kiểm soát sinh sản năm 1962?',
    202: 'Hôn nhân sắp đặt và chế độ đa thê bị bãi bỏ bởi văn bản nào?',
    203: '... được thực hiện vào ngày cuối cùng của tháng Chạp.',
    204: 'Lễ hội nào được tổ chức vào ngày rằm tháng Tám âm lịch?',
    205: 'Chu kỳ mười năm dựa trên điều gì?',
    206: 'Người Việt thường làm gì trước Tết?',
    207: 'Chọn phát biểu không đúng.',
    208: 'Lễ hội nào được tổ chức vào ngày rằm tháng Tư âm lịch?',
    209: 'Trong các năm 1994 và 1995, phần ngân sách nhà nước dành cho thể dục thể thao đã như thế nào?',
    210: '... diễn ra vào ngày mồng năm tháng năm âm lịch, gắn với tiết hạ chí.',
    211: 'Cái nôi của văn minh Việt Nam nằm ở đâu?',
    212: 'Chọn phát biểu không đúng.',
    213: 'Con vật nào không thuộc hệ con giáp Việt Nam?',
    214: 'Trong ngũ hành, Giáp-Ất ứng với yếu tố nào?',
    215: 'Trong ngũ hành, Canh-Tân ứng với yếu tố nào?',
    216: 'Chu kỳ mười hai năm dựa trên điều gì?',
    217: 'Một tuần trước năm mới, mỗi gia đình làm lễ gì?',
    218: 'Chọn phát biểu không đúng.',
    219: 'Trong ngũ hành, Nhâm-Quý ứng với yếu tố nào?',
    220: 'Việt Nam bắt đầu dùng đồng thời âm lịch và dương lịch vào năm nào?',
    221: 'Chu kỳ sáu mươi năm dựa trên điều gì?',
    222: 'Các lễ hội được phần lớn những ai thực hiện/duy trì?',
    223: 'Chọn phát biểu đúng về thể thao và giải trí vào giữa thập niên 1990.',
    224: 'Điều nào không thuộc các giá trị và phong tục nền tảng trong tinh thần văn hóa Việt?',
    225: 'Chọn phát biểu không đúng.',
    226: 'Việc tổ chức lễ hội ở Việt Nam tiền thuộc địa được điều chỉnh bởi loại lịch nào?',
    227: 'Lễ hội nào không phải lễ hội chính của người Việt thời tiền thuộc địa?',
    228: 'Điều gì xảy ra trong “thập kỷ đen tối” của thể thao và thể dục ở CHXHCN Việt Nam?',
    229: 'Đơn vị quan trọng trong lịch truyền thống là gì?',
    230: 'Theo quan sát của Phật tử, vào ngày nào linh hồn người chết được giải thoát khỏi đau khổ nơi địa ngục và được trở về trần gian?',
    231: 'Chu kỳ mười năm vận hành theo thứ tự nào?',
    232: 'Đài quan sát ngừng hoạt động khi nào?',
    233: 'Trên thực tế, năm của người Việt bắt đầu vào mùa nào?',
    234: '... được tổ chức vào ngày mồng ba tháng ba âm lịch.',
    235: 'Mục nào là khác nhóm?',
    236: 'Thời kỳ nào là “thập kỷ đen tối” của thể thao và thể dục ở CHXHCN Việt Nam?',
}

const ANSWER_TRANSLATIONS_BY_ID: Record<number, string> = {
    1: 'Chữ Nôm',
    2: 'vùng núi thấp và vùng đồi núi',
    3: 'An Nam',
    4: '9',
    5: 'Tiếng Việt là một ngôn ngữ có thanh điệu',
    6: 'Không có phương án nào ở trên',
    7: 'Không có phương án nào ở trên',
    8: 'Nguyễn',
    9: 'Cochinchine / Nam Kỳ',
    10: '29',
    11: 'Bốn',
    12: 'Cả A và B đều đúng',
    13: 'Khí hậu nhiệt đới gió mùa',
    14: 'gió mùa',
    15: '3.260 km',
    16: 'Mũi Đôi',
    17: 'Tonkin / Bắc Kỳ',
    18: 'Annam / Trung Kỳ',
    19: 'Dãy Trường Sơn',
    20: 'Có hai biến thể vùng miền chính trong phát âm tiếng Việt',
    21: 'Hồ Nguyên Trừng',
    22: 'Trận Điện Biên Phủ năm 1954',
    23: 'Hiệp định Paris',
    24: '1973',
    25: 'Văn Lang',
    26: 'Không có phương án nào ở trên',
    27: 'Nixon',
    28: 'Năm 1789, quân Tây Sơn dưới sự lãnh đạo của Nguyễn Huệ đã đánh tan quân xâm lược của triều Mông Cổ',
    29: 'Hồ Nguyên Trừng',
    30: 'Thiền phái Trúc Lâm là một dòng Thiền Việt Nam hình thành thời Trần, do vua Trần Thánh Tông sáng lập',
    31: '1964',
    32: 'Không có phương án nào ở trên',
    33: 'Cộng hòa Xã hội Chủ nghĩa Việt Nam',
    34: 'Bộ luật Hồng Đức',
    35: '13',
    36: 'Lý Nhân Tông',
    37: 'Làng là đơn vị hành chính và xã hội cơ bản của đời sống nông thôn',
    38: 'Người đầu tiên đề xuất thuyết domino là Tổng thống Kennedy vào thập niên 1940',
    39: 'Lê Duẩn',
    40: 'Phan Bội Châu và phong trào Đông Du (1905-1908) là ví dụ về những người cộng sản theo định hướng phương Tây',
    41: 'Thời kỳ Bắc thuộc lần thứ tư kéo dài từ năm 602 đến 905',
    42: 'Cố đô Hoa Lư chính thức là thành cổ lâu đời nhất và đầu tiên trong lịch sử Việt Nam',
    43: '57 ngày',
    44: 'Đại Cồ Việt',
    45: 'Nguyễn Văn Linh là Tổng Bí thư hiện tại của Đảng Cộng sản Việt Nam',
    46: '1941',
    47: 'Vào thế kỷ XVI',
    48: 'Các triều Đinh, Tiền Lê, Lý, Trần',
    49: 'Không có phương án nào ở trên',
    50: 'Dưới thời vua Minh Mạng, Công giáo phát triển mạnh',
    51: 'Huỳnh Phú Sổ',
    52: 'Vào thế kỷ I sau Công nguyên',
    53: 'Tất cả các phương án đều đúng',
    54: 'Không có phương án nào ở trên',
    55: 'Khương Tăng Hội',
    56: 'Hòa Hảo là một lực lượng độc lập mạnh trong chính trị miền Nam Việt Nam cho đến thắng lợi cuối cùng của phe cộng sản năm 1975',
    57: 'Theo Đạo giáo, con người không phải là một phần của sự hài hòa lớn trong tự nhiên',
    58: 'Không có phương án nào ở trên',
    59: '(1), (2), (3) và (4)',
    60: 'Năm 1926',
    61: 'Tất cả các phương án đều đúng',
    62: 'Dương chỉ các nguyên lý tiêu cực, thụ động và nữ tính trong tự nhiên',
    63: 'Không có phương án nào ở trên',
    64: 'Sự công nhận',
    65: 'Tất cả các phương án đều đúng',
    66: 'Con người được tin là có ba loại linh hồn: hồn, phách và vía',
    67: 'Năm 1964',
    68: 'Tất cả các phương án đều đúng',
    69: '“Vô vi” trong Đạo giáo nghĩa là “không làm gì cả”',
    70: 'Lão Tử',
    71: 'Tín ngưỡng vạn vật hữu linh là tín ngưỡng độc thần',
    72: 'Các linh hồn nhập vào cơ thể khi thụ thai hoặc khi sinh ra',
    73: 'Nho giáo quan tâm đến các vấn đề thần linh, linh hồn và cái chết',
    74: 'Nguyễn Văn Chiêu',
    75: '(1), (2), (3) và (4)',
    76: 'Không có phương án nào ở trên',
    77: 'Tất cả các phương án đều đúng',
    78: 'Nhất Linh',
    79: 'Viết bằng chữ tượng hình Ai Cập',
    80: 'Mười điều tâm niệm',
    81: 'Tập trung vào nhân vật thuộc tầng lớp trung lưu và thượng lưu',
    82: '3',
    83: 'Viết bằng chữ Hán',
    84: 'Văn học dân gian luôn được ghi chép bằng chữ viết và truyền từ thế hệ này sang thế hệ khác',
    85: '“Quốc âm thi tập” được viết bằng chữ Nôm',
    86: 'Nguyễn Văn Bổng',
    87: 'Tự Lực văn đoàn',
    88: 'Trương Vĩnh Ký',
    89: 'Không có phương án nào ở trên',
    90: 'Nguyễn Đình Thi',
    91: 'Tất cả các phương án đều đúng',
    92: 'Thế kỷ XVIII',
    93: 'Thế kỷ XVII',
    94: 'Nguyễn Huy Thiệp và Lê Minh Khuê là hai nhà văn Đổi mới lớn không có nền tảng quân đội',
    95: 'Viết bằng chữ Hán',
    96: 'Các giáo sĩ Công giáo',
    97: 'Cách khai thác quanh co về sự “suy đồi của đạo đức truyền thống”',
    98: 'Nhất Linh',
    99: 'Nhà Hồ',
    100: 'Năm 1986',
    101: '“Chinh phụ ngâm” của Đặng Trần Côn',
    102: 'Báo Gia Định',
    103: 'Truyện Kiều',
    104: 'Phạm Quỳnh',
    105: 'Đào Vũ',
    106: 'Năm 1925',
    107: 'Nét bút nhẹ, tự nhiên, cùng sắc độ mờ và không đều',
    108: 'Không có phương án nào ở trên',
    109: 'Trong thời Pháp thuộc',
    110: 'Phần lớn nghệ thuật và kiến trúc tiền thuộc địa của Việt Nam do nghệ nhân nổi tiếng làm ra và được triều đình lựa chọn',
    111: 'Những nghệ nhân vô danh, không được ghi nhận',
    112: 'Gốm tráng men và không tráng men của Việt Nam không phải cạnh tranh với đồ đá và đồ đất nung của người miền núi hoặc người Chăm, Khmer ở đồng bằng miền Trung và miền Nam',
    113: 'Tất cả các phương án trên đều đúng',
    114: 'Tất cả các phương án đều đúng',
    115: 'Khối mộc bản hoàn thiện với nét chạm khắc chính xác',
    116: 'Trường phái nghệ thuật miền Bắc',
    117: 'Quá trình oxy hóa nhựa sơn',
    118: 'Năm 1949',
    119: 'Chủ đề có thể thay đổi, bắt nguồn từ cảnh quan nông thôn quen thuộc cũng như từ nguồn thần thoại và lịch sử',
    120: 'Gốm men ngọc làm từ đất sét trắng mịn',
    121: 'Năm 1958',
    122: 'Gốm men ngà',
    123: 'Thế giới trước năm 1945 mà thế hệ họa sĩ hiện đại đầu tiên miêu tả là một thế giới trong trẻo, nơi cuộc sống dường như trôi chảy không đổi',
    124: 'Tất cả các phương án đều đúng',
    125: 'Nguyễn Đỗ Cung là một trong những người đã đưa chủ nghĩa Lập thể vào Việt Nam',
    126: 'Tay nghề của nghệ nhân đã rất rõ từ tận thiên niên kỷ I trước Công nguyên',
    127: 'Tất cả các phương án đều đúng',
    128: 'Năm 1958',
    129: 'Người nghèo không đủ tiền mua tranh in mộc bản vì nó đắt',
    130: 'Quân sự',
    131: 'Chùa Việt trông giống chùa Trung Hoa và thường có nhiều tranh vẽ',
    132: 'Trường phái nghệ thuật miền Nam',
    133: '3',
    134: 'Không có phương án nào ở trên',
    135: 'Nhu cầu hằng ngày của nông dân và tiêu dùng xa xỉ của tầng lớp tinh hoa',
    136: 'Không có phương án nào ở trên',
    137: 'Thời đồ đá mới',
    138: 'Giống như các công trình tôn giáo và quân sự, kiến trúc dân dụng Việt Nam thường được xây để bền lâu',
    139: 'Sự hòa trộn giữa yếu tố bên ngoài (Phật giáo, Nho giáo, Đạo giáo) và nguồn gốc bản địa (đời sống nông thôn, tín ngưỡng vạn vật hữu linh)',
    140: 'Năm 1954',
    141: 'Chiến tranh Đông Dương lần thứ nhất',
    142: 'Các vương triều độc lập trong thế kỷ XI và XII',
    143: '3',
    144: 'Nghệ thuật và kiến trúc Việt Nam chịu ảnh hưởng mạnh của thời kỳ thuộc địa',
    145: 'Cơm được đựng trong bát chung đặt giữa bàn trên mâm cao',
    146: 'Lúa mì vẫn là nguyên liệu cơ bản cho mọi bữa ăn ở Việt Nam',
    147: 'Đậu phụ',
    148: 'Ăn chay',
    149: 'Có “má hồng và răng đen”',
    150: 'Bạn không được dùng đũa riêng để gắp thức ăn từ đĩa chung',
    151: 'Châu chấu',
    152: 'Lá trầu và hạt cau',
    153: 'Gần 1000 năm Bắc thuộc',
    154: 'Tất cả các phương án đều đúng',
    155: 'Trà',
    156: 'Phơi nắng',
    157: 'Đuông cọ',
    158: 'Trà sữa',
    159: 'Rượu gạo',
    160: 'Ăn xong cứ rời mâm ngay, không cần để ý đến người khác trong bữa ăn',
    161: 'Thịt chó',
    162: 'Vì nhai trầu làm răng ố không đều, điều này bị xem là kém đẹp',
    163: 'Thuốc lào',
    164: 'Thuốc phiện',
    165: 'Phương pháp nấu gồm nướng, đút lò, luộc và hấp',
    166: 'Giới sành trà tinh hoa Việt đặt mức nhấn mạnh tương tự vào vô số loại trà xa xỉ như giới sành trà ở Trung Quốc',
    167: 'Vì hành động đó như mời ma hoặc vong hồn vào nhà',
    168: 'Thời tiền thuộc địa, “quán kem” trở nên phổ biến, nhất là trong giới thanh niên trung lưu Việt Nam',
    169: 'Ngô',
    170: 'Nếu là khách dự tiệc tối, đi tay không là một ý hay',
    171: 'Rượu Cao Lương',
    172: 'Có màu hổ phách đậm, vị mặn nồng',
    173: 'Phơi khô cũng thường được dùng để bảo quản cua',
    174: 'Năm 1962',
    175: '3',
    176: 'Người nam lớn tuổi nhất trong nhánh lâu đời nhất, có dòng dõi trực tiếp từ tổ tiên sáng lập',
    177: 'Truyền thống nặng nề “làm dâu” không còn được chấp nhận',
    178: '3',
    179: 'vâng lời mẹ trước khi kết hôn',
    180: 'Nữ 16 tuổi, nam 18 tuổi',
    181: 'Tất cả các phương án đều đúng',
    182: 'Người vợ cả không được tham gia chọn vợ thứ',
    183: 'Hai dòng họ: dòng nội của cha và dòng ngoại của mẹ',
    184: 'Người mai mối thường là một phụ nữ trẻ nổi tiếng có quan hệ rộng và nhan sắc',
    185: 'Là người nam trẻ nhất trong nhánh lâu đời nhất, có dòng dõi gián tiếp từ tổ tiên sáng lập',
    186: 'Liên quan đến công việc',
    187: 'Gia đình của họ, vốn về cơ bản mang tính phụ hệ và gia trưởng',
    188: 'Thanh niên Việt Nam chưa tiếp nhận thời trang kiểu phương Tây',
    189: 'Ảnh hưởng gia trưởng truyền thống cùng nhu cầu có con trai nối dõi',
    190: 'Tiệc độc thân',
    191: 'Không có phương án nào ở trên',
    192: 'Sống độc thân, không lập gia đình',
    193: 'Việc loại bỏ các câu trả lời ở trên',
    194: 'Tất cả các phương án đều đúng',
    195: 'Những biệt danh này được xem là tên “hot” và “đẹp” thời đó',
    196: 'Bà Nhu',
    197: 'Cha mẹ, họ hàng và bạn bè vẫn phần nào cố gắng ghép đôi, chẳng hạn cha mẹ chọn tiêu chí dựa trên địa vị xã hội của gia đình đối phương',
    198: 'Giáo dục',
    199: '“Tộc/họ” gồm một số gia đình có liên hệ với nhau qua một tổ tiên nam chung',
    200: 'Người đứng đầu gia đình cai quản mọi thành viên trong một số việc giới hạn, gồm quyền tài sản, giáo dục, hôn nhân, nhưng không gồm nghề nghiệp',
    201: 'Không có phương án nào ở trên',
    202: 'Luật Hôn nhân và Gia đình năm 1959',
    203: 'Lễ Rước Ông Bà',
    204: 'Tết Trung Thu',
    205: 'Sự nhân đôi của ngũ hành',
    206: 'Tất cả các phương án đều đúng',
    207: 'Âm lịch có năm 365 ngày, chia thành mười hai tháng, mỗi tháng ba mươi hoặc ba mươi mốt ngày',
    208: 'Ngày sinh Đức Phật Thích Ca',
    209: 'tăng mạnh',
    210: 'Lễ Đoan Ngọ',
    211: 'Miền Bắc',
    212: 'Sau khi phong trào Đổi mới bắt đầu vào cuối thập niên 1980, nhà nước đã tăng đáng kể hỗ trợ cho hoạt động thể thao ở mọi cấp',
    213: 'Thỏ',
    214: 'Thủy',
    215: 'Kim',
    216: 'các con giáp',
    217: 'Lễ Táo Quân',
    218: 'Chu kỳ mười năm đã được lặp lại năm lần',
    219: 'Thổ',
    220: 'Năm 1967',
    221: 'Sự lặp lại của chu kỳ mười năm và chu kỳ mười hai năm',
    222: 'phần lớn người Việt',
    223: 'CHXHCN Việt Nam ưu tiên các môn thể thao ít tốn kém, cần ít thiết bị và ít cơ sở huấn luyện',
    224: 'Trí thông minh',
    225: 'Dù người Việt tiền thuộc địa có thể tham gia nhiều lễ hội, họ không được phép tham gia bất kỳ hoạt động giải trí nào',
    226: 'âm lịch',
    227: 'Ngày Quốc tế Lao động',
    228: 'Cơ sở vật chất xuống cấp, nhân sự bị cắt giảm, kinh phí huấn luyện và đi lại của vận động viên bị giảm',
    229: 'Chu kỳ sáu mươi năm',
    230: 'Lễ Vu Lan',
    231: 'Nước trong tự nhiên, nước trong sử dụng, lửa, lửa tiềm ẩn, mộc nói chung, mộc dùng để đốt, kim nói chung, kim đã rèn, đất hoang, đất canh tác',
    232: 'Khi Bảo Đại thoái vị năm 1945',
    233: 'Mùa xuân',
    234: 'Lễ Hàn Thực',
    235: 'Vịt',
    236: 'Thập niên 1980 và đầu thập niên 1990',
}

const PHRASE_TRANSLATIONS: Array<[RegExp, string]> = [
    [/Fill in the blank with (?:the )?correct words?:?/gi, 'Điền từ/cụm từ đúng vào chỗ trống'],
    [/Choose the CORRECT statement(?: about)?/gi, 'Chọn phát biểu đúng về'],
    [/Choose the INCORRECT statement(?: about)?/gi, 'Chọn phát biểu sai về'],
    [/Choose the NOT TRUE statement(?: about)?/gi, 'Chọn phát biểu không đúng về'],
    [/Which of the following statements about/gi, 'Phát biểu nào sau đây về'],
    [/Which of following statement about/gi, 'Phát biểu nào sau đây về'],
    [/Which of the following statements is not true about/gi, 'Phát biểu nào sau đây không đúng về'],
    [/Which of the following are beliefs of/gi, 'Những điều nào sau đây là niềm tin của'],
    [/Which is INCORRECT about/gi, 'Điều nào sau đây sai về'],
    [/Which is NOT TRUE about/gi, 'Điều nào sau đây không đúng về'],
    [/Which is an INCORRECT statement about/gi, 'Phát biểu nào là sai về'],
    [/Which does not belong to/gi, 'Điều nào không thuộc về'],
    [/Which was not included in/gi, 'Điều nào không nằm trong'],
    [/Which is not involved in/gi, 'Điều nào không thuộc nhóm'],
    [/Which is not encompassed/gi, 'Điều nào không được bao gồm trong'],
    [/Which is usually used in/gi, 'Thứ nào thường được dùng trong'],
    [/Which refers to/gi, 'Tên nào chỉ'],
    [/Which was considered as/gi, 'Điều nào được xem là'],
    [/Which was the first/gi, 'Đâu là'],
    [/Which was the main/gi, 'Đâu là'],
    [/Which forced/gi, 'Điều gì đã buộc'],
    [/Which contributed to/gi, 'Điều gì góp phần vào'],
    [/Who was not/gi, 'Ai không phải là'],
    [/Who did not belong to/gi, 'Ai không thuộc'],
    [/Who belonged to/gi, 'Ai thuộc'],
    [/Who founded/gi, 'Ai sáng lập'],
    [/Who invented/gi, 'Ai phát minh/tạo ra'],
    [/Who created/gi, 'Ai tạo ra'],
    [/Who is the founder of/gi, 'Ai là người sáng lập'],
    [/Who is regarded as/gi, 'Ai được xem là'],
    [/Who was considered as/gi, 'Ai được xem là'],
    [/Who was instrumental in/gi, 'Ai có vai trò quan trọng trong'],
    [/When did/gi, 'Khi nào'],
    [/When was/gi, 'Khi nào'],
    [/Where is/gi, 'Ở đâu là'],
    [/What kind of/gi, 'Loại'],
    [/What agreement/gi, 'Hiệp định nào'],
    [/What ended/gi, 'Điều gì đã chấm dứt'],
    [/What is NOT TRUE about/gi, 'Điều gì không đúng về'],
    [/What is INCORRECT about/gi, 'Điều gì sai về'],
    [/What authorities did/gi, 'Những quyền hạn nào'],
    [/What do people usually do/gi, 'Mọi người thường làm gì'],
    [/What happened during/gi, 'Điều gì xảy ra trong'],
    [/What was/gi, 'Điều gì/Đâu là'],
    [/How many/gi, 'Có bao nhiêu'],
    [/How long did/gi, 'Kéo dài bao lâu'],
    [/How can it be called/gi, 'Có thể gọi là'],
    [/Why may/gi, 'Vì sao có thể'],
    [/Why didn’t/gi, 'Vì sao'],
    [/Why shouldn't/gi, 'Vì sao không nên'],
    [/Vietnamese/gi, 'Việt Nam/tiếng Việt'],
    [/Viet Nam|Vietnam/gi, 'Việt Nam'],
    [/Vietnam's/gi, 'của Việt Nam'],
    [/Chinese characters/gi, 'chữ Hán'],
    [/Vietnamese-language sounds/gi, 'âm tiếng Việt'],
    [/Classical Chinese/gi, 'Hán văn cổ điển'],
    [/The Latin alphabet/gi, 'bảng chữ cái Latin'],
    [/low mountains and hilly regions/gi, 'vùng núi thấp và đồi núi'],
    [/rivers and floodplains/gi, 'sông ngòi và đồng bằng ngập lũ'],
    [/grassed savanna/gi, 'xavan cỏ'],
    [/low-lying arable land/gi, 'đất canh tác thấp'],
    [/territory/gi, 'lãnh thổ'],
    [/vowels/gi, 'nguyên âm'],
    [/letters/gi, 'chữ cái'],
    [/family name/gi, 'họ'],
    [/major races/gi, 'chủng tộc lớn'],
    [/seasons/gi, 'mùa'],
    [/climate/gi, 'khí hậu'],
    [/coastline/gi, 'đường bờ biển'],
    [/mountain range/gi, 'dãy núi'],
    [/regional variations/gi, 'biến thể vùng miền'],
    [/pronunciation/gi, 'phát âm'],
    [/ancestor/gi, 'tổ nghề/tổ tiên'],
    [/cannon casting/gi, 'đúc súng thần công'],
    [/colonial rule/gi, 'chế độ thực dân'],
    [/Agreement on Ending the War and Restoring Peace/gi, 'Hiệp định chấm dứt chiến tranh và lập lại hòa bình'],
    [/embryonic State/gi, 'nhà nước sơ khai'],
    [/civil war/gi, 'nội chiến'],
    [/Northern Domination/gi, 'thời Bắc thuộc'],
    [/domino theory/gi, 'thuyết domino'],
    [/successor/gi, 'người kế nhiệm'],
    [/Communist Party/gi, 'Đảng Cộng sản'],
    [/Nationalism/gi, 'chủ nghĩa dân tộc'],
    [/Ancient Citadel/gi, 'cố đô/thành cổ'],
    [/Imperial Academy/gi, 'Quốc Tử Giám'],
    [/basic administrative and social unit/gi, 'đơn vị hành chính và xã hội cơ bản'],
    [/rural life/gi, 'đời sống nông thôn'],
    [/Catholicism/gi, 'Công giáo'],
    [/Buddhism/gi, 'Phật giáo'],
    [/Taoism/gi, 'Đạo giáo'],
    [/Confucianism/gi, 'Nho giáo'],
    [/Animism/gi, 'tín ngưỡng vạn vật hữu linh'],
    [/Caodaism/gi, 'đạo Cao Đài'],
    [/Buddhist traditions/gi, 'truyền thống Phật giáo'],
    [/Wandering Souls/gi, 'các vong hồn lang thang'],
    [/patriarch/gi, 'tổ sư'],
    [/Zen Buddhism/gi, 'Thiền tông'],
    [/Yin Yang Symbol/gi, 'biểu tượng Âm Dương'],
    [/Seven Sacraments/gi, 'bảy bí tích'],
    [/Five Relationships/gi, 'ngũ luân'],
    [/eight-fold path/gi, 'Bát chính đạo'],
    [/realist writer/gi, 'nhà văn hiện thực'],
    [/Literature Categories/gi, 'các loại hình văn học'],
    [/The Folk Tradition/gi, 'truyền thống dân gian'],
    [/Vernacular characters/gi, 'chữ Nôm/chữ viết bản ngữ'],
    [/Resistance Literature/gi, 'văn học kháng chiến'],
    [/Self-Reliance Literary Group/gi, 'Tự Lực văn đoàn'],
    [/Renovation Literature/gi, 'văn học Đổi mới'],
    [/manifesto/gi, 'tuyên ngôn'],
    [/modernize themselves/gi, 'tự hiện đại hóa'],
    [/Fine Arts/gi, 'Mỹ thuật'],
    [/brushwork/gi, 'bút pháp'],
    [/religious architecture/gi, 'kiến trúc tôn giáo'],
    [/lacquer work|lacquerware/gi, 'sơn mài'],
    [/pre-colonial art and architecture/gi, 'nghệ thuật và kiến trúc tiền thuộc địa'],
    [/anonymous and unrecognized artisans/gi, 'những nghệ nhân vô danh và không được ghi nhận'],
    [/ceramics/gi, 'gốm sứ'],
    [/architecture/gi, 'kiến trúc'],
    [/wood-block printing|wood-block painting/gi, 'tranh/khắc in mộc bản'],
    [/Northern School of Arts/gi, 'Trường phái nghệ thuật miền Bắc'],
    [/Southern School of Arts/gi, 'Trường phái nghệ thuật miền Nam'],
    [/French colonial period/gi, 'thời Pháp thuộc'],
    [/military/gi, 'quân sự'],
    [/daily needs/gi, 'nhu cầu hằng ngày'],
    [/luxury consumption/gi, 'tiêu dùng xa xỉ'],
    [/elite/gi, 'tầng lớp tinh hoa/quý tộc'],
    [/Utensils and Manners/gi, 'đồ dùng và phép tắc ăn uống'],
    [/Daily Fare/gi, 'bữa ăn hằng ngày'],
    [/vegetarian cuisine/gi, 'ẩm thực chay'],
    [/Vegetarianism/gi, 'ăn chay'],
    [/Table Manners/gi, 'phép tắc trên bàn ăn'],
    [/animal protein/gi, 'nguồn đạm động vật'],
    [/marital fidelity and happiness/gi, 'sự chung thủy và hạnh phúc hôn nhân'],
    [/Chinese domination/gi, 'thời kỳ Bắc thuộc/Trung Hoa đô hộ'],
    [/food culture/gi, 'văn hóa ẩm thực'],
    [/pre-colonial times/gi, 'thời tiền thuộc địa'],
    [/refrigeration/gi, 'tủ lạnh/kỹ thuật làm lạnh'],
    [/preserving fish/gi, 'bảo quản cá'],
    [/distilled, purified product/gi, 'sản phẩm được chưng cất và tinh lọc'],
    [/deities and ancestors/gi, 'thần linh và tổ tiên'],
    [/birth control/gi, 'kiểm soát sinh sản'],
    [/fundamental values and customs/gi, 'giá trị và phong tục nền tảng'],
    [/Vietnamese ethos/gi, 'tinh thần/văn hóa Việt'],
    [/clan leader/gi, 'trưởng tộc'],
    [/Family Life/gi, 'đời sống gia đình'],
    [/marriage/gi, 'hôn nhân'],
    [/three subserviences|tam tong/gi, 'tam tòng'],
    [/lineages/gi, 'dòng họ/huyết hệ'],
    [/go-between/gi, 'người mai mối'],
    [/filial impiety/gi, 'bất hiếu'],
    [/coarse nicknames/gi, 'tên gọi thô/mộc mạc'],
    [/Arranged marriages/gi, 'hôn nhân sắp đặt'],
    [/polygyny/gi, 'đa thê'],
    [/festival/gi, 'lễ hội'],
    [/lunar calendar/gi, 'âm lịch'],
    [/ten-year cycle/gi, 'chu kỳ mười năm'],
    [/twelve-year cycle/gi, 'chu kỳ mười hai năm'],
    [/sixty-year cycle/gi, 'chu kỳ sáu mươi năm'],
    [/five elements/gi, 'ngũ hành'],
    [/physical fitness and sports/gi, 'thể dục thể thao'],
    [/cradle of the Vietnamese civilization/gi, 'cái nôi của văn minh Việt Nam'],
    [/Vietnamese Zodiac animals/gi, 'các con giáp Việt Nam'],
    [/observatory/gi, 'đài quan sát'],
    [/odd one out/gi, 'mục khác nhóm'],
    [/dark decade/gi, 'thập kỷ đen tối'],
]

const TERM_GLOSSARY: Record<string, { meaning: string; note: string }> = {
    'correct': { meaning: 'đúng, chính xác', note: 'Gặp CORRECT thì chọn phát biểu đúng.' },
    'incorrect': { meaning: 'sai, không đúng', note: 'Gặp INCORRECT thì phải tìm phương án sai.' },
    'not true': { meaning: 'không đúng', note: 'Tương đương INCORRECT trong câu hỏi trắc nghiệm.' },
    'fill in the blank': { meaning: 'điền vào chỗ trống', note: 'Đọc phần sau dấu ba chấm để đoán khái niệm cần điền.' },
    'refers to': { meaning: 'chỉ/ám chỉ/được dùng để gọi', note: 'Câu hỏi thường kiểm tra tên gọi hoặc thuật ngữ.' },
    'was established': { meaning: 'được thành lập', note: 'Dấu hiệu hỏi mốc thời gian hoặc triều đại.' },
    'was introduced': { meaning: 'được du nhập/giới thiệu', note: 'Hay dùng với tôn giáo, chữ viết, nghệ thuật.' },
    'pre-colonial': { meaning: 'trước thời thuộc địa', note: 'Trong bộ đề thường chỉ xã hội Việt trước Pháp thuộc.' },
    'colonial era': { meaning: 'thời thuộc địa', note: 'Thường gắn với ảnh hưởng Pháp.' },
    'dynasty': { meaning: 'triều đại', note: 'Gắn đáp án với tên vua/triều để nhớ nhanh.' },
    'ancestor': { meaning: 'tổ nghề/tổ tiên', note: 'Không phải lúc nào cũng là “ancestor” theo nghĩa gia đình.' },
    'literature': { meaning: 'văn học', note: 'Nhớ theo nhóm: dân gian, chữ Hán, chữ Nôm, Quốc ngữ, Đổi mới.' },
    'architecture': { meaning: 'kiến trúc', note: 'Các câu thường phân loại tôn giáo, quân sự, dân dụng.' },
    'lacquer': { meaning: 'sơn mài', note: 'Từ khóa quan trọng trong phần mỹ thuật.' },
    'ceramic': { meaning: 'gốm sứ', note: 'Chú ý mốc thế kỷ và loại men.' },
    'animism': { meaning: 'tín ngưỡng vạn vật hữu linh', note: 'Tin vào linh hồn/thần linh trong tự nhiên.' },
    'confucianism': { meaning: 'Nho giáo', note: 'Gắn với quan hệ xã hội, gia đình, đạo hiếu.' },
    'taoism': { meaning: 'Đạo giáo', note: 'Gắn với tự nhiên, hài hòa, vô vi.' },
    'buddhism': { meaning: 'Phật giáo', note: 'Gắn với khổ, dục vọng, Niết bàn, Bát chính đạo.' },
    'lunar calendar': { meaning: 'âm lịch', note: 'Các lễ hội truyền thống thường dựa trên âm lịch.' },
    'ethos': { meaning: 'tinh thần/hệ giá trị văn hóa', note: 'Trong đề này hiểu gần như nền tảng đạo lý và phong tục.' },
}

const BASIC_TERM_TRANSLATIONS: Record<string, string> = {
    'according': 'theo, dựa theo',
    'accords': 'phù hợp, tương ứng với',
    'adapting': 'biến đổi, điều chỉnh',
    'adopted': 'tiếp nhận',
    'adopting': 'tiếp thu, tiếp nhận',
    'allowed': 'được phép',
    'ancient': 'cổ, cổ xưa',
    'architecture': 'kiến trúc',
    'battle': 'trận đánh',
    'before': 'trước',
    'belong': 'thuộc về',
    'buddhist': 'thuộc Phật giáo',
    'called': 'được gọi là',
    'calendar': 'lịch',
    'categories': 'loại hình, nhóm',
    'category': 'loại, nhóm',
    'celebrated': 'được tổ chức, được kỷ niệm',
    'century': 'thế kỷ',
    'citadel': 'thành, thành cổ',
    'colonial': 'thuộc địa',
    'considered': 'được xem là',
    'country': 'đất nước',
    'customs': 'phong tục',
    'decade': 'thập kỷ',
    'declined': 'suy giảm, xuống cấp',
    'developed': 'được phát triển',
    'doctrine': 'học thuyết',
    'domination': 'sự đô hộ, thống trị',
    'during': 'trong thời gian',
    'element': 'yếu tố, nguyên tố',
    'elements': 'các yếu tố, ngũ hành',
    'established': 'được thành lập',
    'festival': 'lễ hội',
    'fitness': 'thể dục, sức khỏe thể chất',
    'founded': 'được sáng lập',
    'founder': 'người sáng lập',
    'generation': 'thế hệ',
    'golden': 'hoàng kim',
    'important': 'quan trọng',
    'include': 'bao gồm',
    'included': 'được bao gồm',
    'involved': 'liên quan, thuộc về',
    'language': 'ngôn ngữ',
    'leader': 'lãnh đạo',
    'literary': 'thuộc văn học',
    'major': 'chính, lớn',
    'manners': 'phép tắc, cách ứng xử',
    'member': 'thành viên',
    'modern': 'hiện đại',
    'monarchy': 'quân chủ',
    'movement': 'phong trào',
    'mountains': 'núi',
    'newspaper': 'báo, tờ báo',
    'northern': 'phía Bắc',
    'officially': 'chính thức',
    'opened': 'được mở',
    'painting': 'hội họa, tranh vẽ',
    'physical': 'thuộc thể chất',
    'quarters': 'phần tư',
    'recognition': 'sự công nhận',
    'refers': 'chỉ, ám chỉ',
    'regions': 'vùng, khu vực',
    'renovation': 'Đổi mới',
    'resistance': 'kháng chiến',
    'school': 'trường phái, trường học',
    'second': 'thứ hai',
    'self-reliance': 'tự lực',
    'sports': 'thể thao',
    'statements': 'các phát biểu',
    'symbols': 'ký hiệu, biểu tượng',
    'ten-cycle': 'chu kỳ mười năm',
    'ten-year': 'mười năm',
    'territory': 'lãnh thổ',
    'traditional': 'truyền thống',
    'usually': 'thường, thông thường',
    'vowels': 'nguyên âm',
    'written': 'được viết bằng',
}

function cleanEnglish(value: string) {
    return value.replace(/\s+/g, ' ').trim()
}

function translateLoose(value: string) {
    let translated = value
    for (const [pattern, replacement] of PHRASE_TRANSLATIONS) {
        translated = translated.replace(pattern, replacement)
    }
    return translated
        .replace(/\s+\?/g, '?')
        .replace(/\s+\./g, '.')
        .replace(/\s+,/g, ',')
        .replace(/\s+/g, ' ')
        .trim()
}

function translateAnswer(answer: string) {
    return ANSWER_TRANSLATIONS[answer] ?? translateLoose(answer)
}

function getAnswerTranslation(question: RawQuestion, index?: number) {
    const questionNumber = typeof index === 'number' ? index + 1 : 0
    return ANSWER_TRANSLATIONS_BY_ID[questionNumber] ?? translateAnswer(question.correctAnswer ?? '')
}

function translateQuestion(question: string) {
    const lines = question.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length > 1 && /fill in the blank/i.test(lines[0])) {
        return `${translateLoose(lines[0])}:\n${translateLoose(lines.slice(1).join(' '))}`
    }
    return translateLoose(question)
}

function getQuestionIntent(question: RawQuestion) {
    const text = question.question.toLowerCase()
    if (/incorrect|not true/.test(text)) return 'Câu này yêu cầu tìm phát biểu sai/không đúng, nên đừng chọn phương án nghe quen nếu nó không khớp dữ kiện.'
    if (/correct|true/.test(text)) return 'Câu này yêu cầu chọn phát biểu đúng, hãy đối chiếu từng phương án với từ khóa trong đề.'
    if (/how many/.test(text)) return 'Câu này kiểm tra số lượng, nên cần nhớ con số chính xác.'
    if (/when/.test(text)) return 'Câu này kiểm tra mốc thời gian, nên gắn đáp án với sự kiện hoặc triều đại đi kèm.'
    if (/who/.test(text)) return 'Câu này kiểm tra nhân vật, người sáng lập hoặc người gắn với sự kiện.'
    if (/which refers to/.test(text)) return 'Câu này kiểm tra thuật ngữ/tên gọi; hãy nhớ nghĩa gốc hoặc vùng mà thuật ngữ chỉ tới.'
    if (/fill in the blank/.test(text)) return 'Câu này là điền khuyết, hãy đọc cụm sau chỗ trống để xác định khái niệm cần điền.'
    return 'Câu này kiểm tra một dữ kiện cụ thể; hãy nắm từ khóa chính rồi tự nhắc lại bằng tiếng Anh.'
}

function getTopicLabel(question: RawQuestion) {
    const tags = inferTags(question)
    const labelByTag: Record<string, string> = {
        language: 'ngôn ngữ và chữ viết Việt Nam',
        history: 'lịch sử Việt Nam',
        geography: 'địa lý Việt Nam',
        culture: 'văn hóa, tín ngưỡng và đời sống Việt Nam',
        arts: 'văn học, nghệ thuật và mỹ thuật Việt Nam',
        general: 'kiến thức nền về Việt Nam',
    }
    return labelByTag[tags[0]] ?? labelByTag.general
}

function extractKeyTerms(question: RawQuestion, index?: number) {
    const haystack = `${question.question} ${question.correctAnswer ?? ''}`.toLowerCase()
    const terms = Object.entries(TERM_GLOSSARY)
        .filter(([term]) => haystack.includes(term))
        .slice(0, 6)
        .map(([term, meta]) => ({ term, ...meta }))

    if (terms.length >= 3) return terms

    const usedTerms = new Set(terms.map((term) => term.term.toLowerCase()))
    const extra = cleanEnglish(`${question.question} ${question.correctAnswer ?? ''}`)
        .split(/\s+/)
        .map((word) => word.replace(/[^A-Za-z'-]/g, ''))
        .filter((word) => {
            const lower = word.toLowerCase()
            return word.length >= 6
                && !usedTerms.has(lower)
                && !/^(which|choose|correct|incorrect|statement|statements|following|vietnamese|vietnam|about|there|these|those|their|answer|answers)$/i.test(word)
        })
        .slice(0, 6 - terms.length)
        .map((term) => {
            const lower = term.toLowerCase()
            const glossary = TERM_GLOSSARY[lower]
            const basicMeaning = BASIC_TERM_TRANSLATIONS[lower]
            return {
                term,
                meaning: glossary?.meaning ?? basicMeaning ?? translateLoose(term),
                note: glossary?.note ?? (basicMeaning
                    ? 'Từ khóa này giúp hiểu nhanh nội dung câu hỏi.'
                    : 'Từ này nên học theo cụm trong câu hỏi, không học rời từng chữ.'),
            }
        })

    const combined = [...terms, ...extra]
    if (combined.length > 0) return combined

    if (question.correctAnswer) {
        return [{
            term: question.correctAnswer,
            meaning: getAnswerTranslation(question, index),
            note: 'Đáp án này là điểm neo chính để tự kiểm tra lại câu hỏi.',
        }]
    }

    return []
}

function getGrammarNotes(question: RawQuestion) {
    const text = question.question.toLowerCase()
    const notes: string[] = []
    if (/incorrect|not true/.test(text)) notes.push('INCORRECT / NOT TRUE nghĩa là phải chọn phương án sai, đây là bẫy đọc đề rất hay gặp.')
    if (/which of the following/.test(text)) notes.push('Which of the following = “phương án nào sau đây”; cần đọc cả bốn lựa chọn trước khi quyết định.')
    if (/how many/.test(text)) notes.push('How many + danh từ số nhiều dùng để hỏi số lượng.')
    if (/when/.test(text)) notes.push('When did/When was dùng để hỏi mốc thời gian; đáp án thường là năm, thế kỷ hoặc triều đại.')
    if (/who/.test(text)) notes.push('Who hỏi người/nhân vật; chú ý các động từ founded, invented, created, regarded as.')
    if (/fill in the blank/.test(text)) notes.push('Fill in the blank yêu cầu điền khái niệm phù hợp vào dấu “...”.')
    if (notes.length === 0) notes.push('Đọc từ khóa chính trước, sau đó tự diễn đạt lại câu hỏi bằng tiếng Việt rồi mới nhìn đáp án.')
    return notes.slice(0, 3)
}

function getMemoryHook(question: RawQuestion, index?: number) {
    const answer = getAnswerTranslation(question, index)
    const topic = getTopicLabel(question)
    if (/when/i.test(question.question)) return `Mẹo nhớ: gắn “${answer}” với một mốc trong ${topic}, rồi tự đọc lại câu tiếng Anh một lần.`
    if (/how many/i.test(question.question)) return `Mẹo nhớ: biến con số “${answer}” thành điểm neo, sau đó nhắc lại câu hỏi bằng tiếng Anh.`
    if (/incorrect|not true/i.test(question.question)) return `Mẹo nhớ: đánh dấu đây là câu tìm “đáp án sai”; đừng để đáp án quen mắt đánh lừa.`
    return `Mẹo nhớ: nối đáp án “${answer}” với chủ đề ${topic}, rồi tự giải thích bằng một câu ngắn.`
}

function fallbackAnnotation(question: RawQuestion, index?: number) {
    const questionNumber = typeof index === 'number' ? index + 1 : 0
    const viQuestion = QUESTION_TRANSLATIONS_BY_ID[questionNumber] ?? translateQuestion(question.question)
    const viAnswer = getAnswerTranslation(question, index)
    const topic = getTopicLabel(question)
    const intent = getQuestionIntent(question)

    return {
        viTranslation: `Dịch ý câu hỏi: ${viQuestion}\nNghĩa đáp án: ${viAnswer}`,
        viExplanation: `Ý chính: câu này thuộc nhóm ${topic}. ${intent} Đáp án cần nhớ là “${viAnswer}” (${question.correctAnswer}).`,
        whyCorrect: `Trong bộ đề gốc, phương án “${question.correctAnswer}” là đáp án đúng. Khi ôn, hãy tự che đáp án rồi đọc lại từ khóa trong câu hỏi: “${cleanEnglish(question.question).slice(0, 140)}”.`,
        keyTerms: extractKeyTerms(question, index),
        grammarNotes: getGrammarNotes(question),
        memoryHook: getMemoryHook(question, index),
    }
}

function extractJsonArray(text: string) {
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start === -1 || end === -1 || end <= start) throw new Error('Model response did not contain a JSON array.')
    return JSON.parse(text.slice(start, end + 1))
}

async function annotateBatch(client: OpenAI, questions: RawQuestion[]) {
    const response = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: [
                    'You create Vietnamese study annotations for English multiple-choice exam questions.',
                    'Never rewrite, correct, translate, or alter the English question/options/correctAnswer.',
                    'Return strict JSON: {"items":[...]} with one item per input id.',
                    'Vietnamese must be clear, detailed, and useful for Vietnamese learners of English.',
                    'Each item fields: id, viTranslation, viExplanation, whyCorrect, keyTerms, grammarNotes, memoryHook.',
                    'keyTerms is an array of 3-6 objects: {term, meaning, note}. grammarNotes is an array of 1-3 strings.',
                    'Focus on meaning, why the answer is right, important English phrases, grammar cues, and a compact memory hook.',
                ].join('\n'),
            },
            {
                role: 'user',
                content: JSON.stringify({
                    items: questions.map((q, index) => ({
                        id: String(index + 1),
                        question: q.question,
                        options: q.options,
                        correctAnswer: q.correctAnswer,
                    })),
                }),
            },
        ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('Empty annotation response.')
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed.items)) return extractJsonArray(content)
    return parsed.items
}

async function annotateQuestions(rawQuestions: RawQuestion[], allowFallback: boolean) {
    if (allowFallback && process.argv.includes('--skip-openai')) {
        return rawQuestions.map((question, index) => fallbackAnnotation(question, index))
    }

    const apiKey = process.env.GPT4_API_KEY
    if (!apiKey) {
        if (!allowFallback) throw new Error('GPT4_API_KEY is missing. Refusing to write placeholder StudyPlace annotations.')
        return rawQuestions.map((question, index) => fallbackAnnotation(question, index))
    }

    const client = new OpenAI({ apiKey })
    const annotations = new Map<number, ReturnType<typeof fallbackAnnotation>>()
    const batchSize = Number(process.env.STUDYPLACE_BATCH_SIZE || 8)

    for (let start = 0; start < rawQuestions.length; start += batchSize) {
        const batch = rawQuestions.slice(start, start + batchSize)
        let attempts = 0
        while (attempts < 3) {
            attempts += 1
            try {
                const items = await annotateBatch(client, batch)
                for (const item of items) {
                    const localIndex = Number(item.id) - 1
                    if (!Number.isFinite(localIndex) || !batch[localIndex]) continue
                    annotations.set(start + localIndex, {
                        viTranslation: String(item.viTranslation || ''),
                        viExplanation: String(item.viExplanation || ''),
                        whyCorrect: String(item.whyCorrect || ''),
                        keyTerms: Array.isArray(item.keyTerms) ? item.keyTerms.slice(0, 8) : [],
                        grammarNotes: Array.isArray(item.grammarNotes) ? item.grammarNotes.map(String) : [],
                        memoryHook: String(item.memoryHook || ''),
                    })
                }
                break
            } catch (error) {
                if (attempts >= 3) {
                    if (!allowFallback) throw error
                    batch.forEach((question, localIndex) => annotations.set(start + localIndex, fallbackAnnotation(question, start + localIndex)))
                } else {
                    await new Promise((resolve) => setTimeout(resolve, 1000 * attempts))
                }
            }
        }
        console.log(`Annotated ${Math.min(start + batch.length, rawQuestions.length)}/${rawQuestions.length}`)
    }

    return rawQuestions.map((question, index) => annotations.get(index) ?? fallbackAnnotation(question, index))
}

function writeReport(params: {
    docxPath: string
    raw: RawQuestion[]
    parsed: ParsedQuestion[]
    missingCorrect: RawQuestion[]
    anomalies: RawQuestion[]
}) {
    const { docxPath, raw, parsed, missingCorrect, anomalies } = params
    const scoreCounts = raw.reduce<Record<string, number>>((acc, question) => {
        acc[question.sourceScore] = (acc[question.sourceScore] ?? 0) + 1
        return acc
    }, {})
    const optionCounts = parsed.reduce<Record<string, number>>((acc, question) => {
        acc[String(question.options.length)] = (acc[String(question.options.length)] ?? 0) + 1
        return acc
    }, {})

    const lines = [
        '# StudyPlace Import Report',
        '',
        `- Study set: \`${STUDY_SET_ID}\``,
        `- Source DOCX: \`${docxPath}\``,
        `- Imported at: ${new Date().toISOString()}`,
        `- Raw question blocks: ${raw.length}`,
        `- Usable questions written: ${parsed.length}`,
        `- Missing correct answer blocks: ${missingCorrect.length}`,
        `- Option-count anomalies: ${anomalies.length}`,
        `- Score counts: \`${JSON.stringify(scoreCounts)}\``,
        `- Option counts: \`${JSON.stringify(optionCounts)}\``,
        '',
        '## Anomalies',
        '',
        anomalies.length === 0
            ? 'No option-count anomalies.'
            : anomalies
                .slice(0, 40)
                .map((q, index) => `${index + 1}. Paragraph ${q.paragraphStart}-${q.paragraphEnd}, options=${q.options.length}: ${q.question.replace(/\n/g, ' ')}`)
                .join('\n'),
        '',
        '## Missing Correct Answer',
        '',
        missingCorrect.length === 0
            ? 'No missing correct answers.'
            : missingCorrect
                .map((q, index) => `${index + 1}. Paragraph ${q.paragraphStart}-${q.paragraphEnd}: ${q.question.replace(/\n/g, ' ')}`)
                .join('\n'),
        '',
        '## Checksums',
        '',
        ...parsed.map((q) => `- ${q.id}: \`${q.checksum}\` ${q.question.split('\n')[0]}`),
        '',
    ]

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
    fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8')
}

async function main() {
    loadDotEnv()
    const docxArgIndex = process.argv.findIndex((arg) => arg === '--docx')
    const docxPath = docxArgIndex !== -1 ? process.argv[docxArgIndex + 1] : DEFAULT_DOCX_PATH
    const allowFallback = process.argv.includes('--allow-fallback')
    if (!fs.existsSync(docxPath)) throw new Error(`DOCX not found: ${docxPath}`)

    const { raw } = parseQuestionsFromDocx(docxPath)
    const missingCorrect = raw.filter((question) => !question.correctAnswer)
    const usable = raw.filter((question) => question.options.length > 0 && question.correctAnswer)
    const anomalies = usable.filter((question) => question.options.length !== 4)

    if (process.argv.includes('--parse-only')) {
        const scoreCounts = raw.reduce<Record<string, number>>((acc, question) => {
            acc[question.sourceScore] = (acc[question.sourceScore] ?? 0) + 1
            return acc
        }, {})
        const optionCounts = usable.reduce<Record<string, number>>((acc, question) => {
            acc[String(question.options.length)] = (acc[String(question.options.length)] ?? 0) + 1
            return acc
        }, {})
        console.log(JSON.stringify({
            rawBlocks: raw.length,
            usableQuestions: usable.length,
            missingCorrect: missingCorrect.length,
            anomalies: anomalies.length,
            scoreCounts,
            optionCounts,
            firstQuestion: usable[0],
            firstAnomalies: anomalies.slice(0, 5),
        }, null, 2))
        return
    }

    if (missingCorrect.length > 0) {
        console.warn(`Missing correct answers: ${missingCorrect.length}`)
    }

    const annotations = await annotateQuestions(usable, allowFallback)
    const parsed: ParsedQuestion[] = usable.map((question, index) => {
        const annotation = annotations[index]
        const item: ParsedQuestion = {
            id: String(index + 1),
            question: question.question,
            options: question.options,
            correctAnswer: question.correctAnswer!,
            sourceScore: question.sourceScore,
            selectedAnswer: question.selectedAnswer,
            viTranslation: annotation.viTranslation,
            viExplanation: annotation.viExplanation,
            whyCorrect: annotation.whyCorrect,
            keyTerms: annotation.keyTerms,
            grammarNotes: annotation.grammarNotes,
            memoryHook: annotation.memoryHook,
            tags: inferTags(question),
            checksum: '',
        }
        item.checksum = checksumFor(item)
        return item
    })

    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true })
    fs.writeFileSync(DATA_PATH, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
    writeReport({ docxPath, raw, parsed, missingCorrect, anomalies })

    console.log(`Wrote ${parsed.length} questions to ${DATA_PATH}`)
    console.log(`Wrote import report to ${REPORT_PATH}`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
