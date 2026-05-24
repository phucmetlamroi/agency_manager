/**
 * HustlyTasker Pitch Deck Generator — 13 slides for 15-min EXE101 presentation
 *
 * Dark glassmorphism style:
 *   - Background: #0A0A0A
 *   - Glass cards: rgba(255,255,255,0.04) with violet borders
 *   - Accent: #8B5CF6 (violet)
 *   - Typography: Calibri Bold (closest to Plus Jakarta Sans available)
 *
 * Run: node build-pitch-deck.mjs
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// Use global node_modules
process.env.NODE_PATH = 'C:\\Users\\Dareu\\AppData\\Roaming\\npm\\node_modules'
require('module').Module._initPaths()

const pptxgen = require('pptxgenjs')
const React = require('react')
const ReactDOMServer = require('react-dom/server')
const sharp = require('sharp')
const FaIcons = require('react-icons/fa')
const HiIcons = require('react-icons/hi')

/* ════════════════════════════════════════════════════════════════════ */
/*  Color palette + design tokens                                      */
/* ════════════════════════════════════════════════════════════════════ */

const COLORS = {
    bg: '0A0A0A',           // background main
    bgGradient: '1A0E3E',   // top-right glow
    glassCard: '1C1727',    // [BRIGHTER] glass card fill — more contrast vs bg
    glassBorder: '8B5CF6',  // violet border
    violet: '8B5CF6',       // accent primary
    violetLight: 'C4B5FD',  // [BRIGHTER] violet-300 (was A78BFA violet-400)
    fuchsia: 'D946EF',      // gradient end
    emerald: '6EE7B7',      // [BRIGHTER] emerald-300 (was 34D399 emerald-400)
    amber: 'FBBF24',        // [BRIGHTER] amber-400 (was F59E0B amber-500)
    red: 'F87171',          // [BRIGHTER] red-400 (was EF4444 red-500)
    textPrimary: 'F4F4F5',  // [BRIGHTER] zinc-100 (was E4E4E7 zinc-200)
    textSecondary: 'D4D4D8',// [BRIGHTER] zinc-300 (was A1A1AA zinc-400)
    textMuted: 'A1A1AA',    // [BRIGHTER] zinc-400 (was 71717A zinc-500)
    white: 'FFFFFF',
}

const FONT = {
    heading: 'Calibri',  // bold weight makes it close to Plus Jakarta Sans ExtraBold
    body: 'Calibri',
}

/* ════════════════════════════════════════════════════════════════════ */
/*  Icon helper — rasterize react-icons to base64 PNG                  */
/* ════════════════════════════════════════════════════════════════════ */

async function iconPng(IconComponent, color = COLORS.violet, size = 256) {
    const svg = ReactDOMServer.renderToStaticMarkup(
        React.createElement(IconComponent, { color: '#' + color, size: String(size) }),
    )
    const buf = await sharp(Buffer.from(svg)).png().toBuffer()
    return 'image/png;base64,' + buf.toString('base64')
}

/* ════════════════════════════════════════════════════════════════════ */
/*  Reusable layout helpers                                            */
/* ════════════════════════════════════════════════════════════════════ */

const SLIDE_W = 13.3  // LAYOUT_WIDE width in inches
const SLIDE_H = 7.5   // LAYOUT_WIDE height in inches

/** Apply dark background + subtle violet glow to a slide */
function applyDarkBackground(slide) {
    slide.background = { color: COLORS.bg }
    // Top-right violet glow (oval with low opacity)
    slide.addShape('ellipse', {
        x: SLIDE_W - 3.5,
        y: -2,
        w: 6,
        h: 5,
        fill: { color: COLORS.violet, transparency: 88 },
        line: { type: 'none' },
    })
    // Bottom-left subtle dark accent
    slide.addShape('ellipse', {
        x: -2,
        y: SLIDE_H - 2,
        w: 5,
        h: 4,
        fill: { color: COLORS.fuchsia, transparency: 92 },
        line: { type: 'none' },
    })
}

/** Glass card — solid dark fill with violet border (mimics glassmorphism) */
function glassCard(slide, { x, y, w, h, borderColor = COLORS.violet, borderTransparency = 70 }) {
    slide.addShape('roundRect', {
        x, y, w, h,
        fill: { color: COLORS.glassCard, transparency: 30 },
        line: { color: borderColor, width: 0.75, transparency: borderTransparency },
        rectRadius: 0.15,
    })
}

/** Slide title bar at top */
function slideTitle(slide, text, subtitle = null) {
    slide.addText(text, {
        x: 0.5, y: 0.3, w: SLIDE_W - 1, h: 0.75,
        fontFace: FONT.heading, fontSize: 36, bold: true,   // [READABILITY] 30 → 36
        color: COLORS.white, align: 'left', valign: 'middle',
        margin: 0,
    })
    if (subtitle) {
        slide.addText(subtitle, {
            x: 0.5, y: 1.05, w: SLIDE_W - 1, h: 0.45,
            fontFace: FONT.body, fontSize: 17, italic: true,  // [READABILITY] 14 → 17
            color: COLORS.violetLight, align: 'left', valign: 'top',
            margin: 0,
        })
    }
    // Violet accent line under title
    slide.addShape('rect', {
        x: 0.5, y: 1.12, w: 0.8, h: 0.06,
        fill: { color: COLORS.violet },
        line: { type: 'none' },
    })
}

/** Footer with slide number + brand */
function slideFooter(slide, slideNum) {
    slide.addText('HustlyTasker · EXE101', {
        x: 0.5, y: SLIDE_H - 0.4, w: 4, h: 0.3,
        fontFace: FONT.body, fontSize: 12, color: COLORS.textMuted,  // [READABILITY] 10 → 12
        align: 'left', valign: 'middle',
    })
    slide.addText(`${slideNum} / 13`, {
        x: SLIDE_W - 1.5, y: SLIDE_H - 0.4, w: 1, h: 0.3,
        fontFace: FONT.body, fontSize: 12, color: COLORS.textMuted,
        align: 'right', valign: 'middle',
    })
}

/* ════════════════════════════════════════════════════════════════════ */
/*  Main build                                                         */
/* ════════════════════════════════════════════════════════════════════ */

async function build() {
    const pres = new pptxgen()
    pres.layout = 'LAYOUT_WIDE'  // 13.3" × 7.5"
    pres.author = 'HustlyTasker Team'
    pres.title = 'HustlyTasker — Startup Pitch'
    pres.subject = 'EXE101 Pitch Deck'

    // Pre-render icons we'll need
    const icons = {
        rocket: await iconPng(FaIcons.FaRocket, COLORS.violet),
        clipboard: await iconPng(FaIcons.FaClipboardList, COLORS.amber),
        money: await iconPng(FaIcons.FaMoneyBillWave, COLORS.amber),
        chat: await iconPng(FaIcons.FaCommentDots, COLORS.amber),
        target: await iconPng(FaIcons.FaBullseye, COLORS.violet),
        exchange: await iconPng(FaIcons.FaExchangeAlt, COLORS.violet),
        globe: await iconPng(FaIcons.FaGlobeAsia, COLORS.violet),
        chart: await iconPng(FaIcons.FaChartLine, COLORS.violet),
        store: await iconPng(FaIcons.FaStore, COLORS.violet),
        bolt: await iconPng(FaIcons.FaBolt, COLORS.violet),
        wallet: await iconPng(FaIcons.FaWallet, COLORS.emerald),
        users: await iconPng(FaIcons.FaUsers, COLORS.violet),
        admin: await iconPng(FaIcons.FaUserTie, COLORS.violet),
        editor: await iconPng(FaIcons.FaFilm, COLORS.violetLight),
        creator: await iconPng(FaIcons.FaMicrophone, COLORS.emerald),
        check: await iconPng(FaIcons.FaCheckCircle, COLORS.emerald),
        cross: await iconPng(FaIcons.FaTimesCircle, COLORS.red),
        warning: await iconPng(FaIcons.FaExclamationTriangle, COLORS.amber),
        trending: await iconPng(FaIcons.FaArrowUp, COLORS.emerald),
        sync: await iconPng(FaIcons.FaSyncAlt, COLORS.violet),
        star: await iconPng(FaIcons.FaStar, COLORS.amber),
        handshake: await iconPng(FaIcons.FaHandshake, COLORS.violet),
        building: await iconPng(FaIcons.FaBuilding, COLORS.violetLight),
        plug: await iconPng(FaIcons.FaPlug, COLORS.violetLight),
        crown: await iconPng(FaIcons.FaCrown, COLORS.amber),
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 1 — Cover                                                 */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)

        // Big violet glow background (centered)
        s.addShape('ellipse', {
            x: SLIDE_W/2 - 3, y: SLIDE_H/2 - 3, w: 6, h: 6,
            fill: { color: COLORS.violet, transparency: 85 },
            line: { type: 'none' },
        })

        // Brand "tag" small at top — bigger
        s.addText('HUSTLYTASKER', {
            x: 0.5, y: 0.5, w: SLIDE_W - 1, h: 0.45,
            fontFace: FONT.heading, fontSize: 14, bold: true,  // [READABILITY] 11 → 14
            color: COLORS.violetLight, align: 'left', valign: 'middle',
            charSpacing: 10,
        })

        // Main hero title — bigger
        s.addText('HustlyTasker', {
            x: 0.5, y: 2.3, w: SLIDE_W - 1, h: 1.5,
            fontFace: FONT.heading, fontSize: 96, bold: true,  // [READABILITY] 84 → 96
            color: COLORS.white, align: 'center', valign: 'middle',
        })

        // Tagline — bigger
        s.addText('Nền tảng quản lý công việc dành riêng cho Video Agency', {
            x: 0.5, y: 3.95, w: SLIDE_W - 1, h: 0.65,
            fontFace: FONT.body, fontSize: 26,  // [READABILITY] 22 → 26
            color: COLORS.textPrimary, align: 'center', valign: 'middle',
        })

        // Sub-tagline (italic) — bigger
        s.addText('"Quản lý thông minh — Giao việc nhanh — Thanh toán minh bạch"', {
            x: 0.5, y: 4.7, w: SLIDE_W - 1, h: 0.45,
            fontFace: FONT.body, fontSize: 18, italic: true,  // [READABILITY] 14 → 18
            color: COLORS.violetLight, align: 'center',
        })

        // Footer block — bigger
        s.addText('Nhóm thuyết trình · EXE101 — Khởi nghiệp · 2026', {
            x: 0.5, y: SLIDE_H - 0.8, w: SLIDE_W - 1, h: 0.4,
            fontFace: FONT.body, fontSize: 15,  // [READABILITY] 12 → 15
            color: COLORS.textMuted, align: 'center',
        })
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 2 — The Hidden Cost                                       */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)
        slideTitle(s, '3 con số khiến mọi agency video editing đau đầu')

        const cardW = 3.9
        const cardH = 4.2
        const gap = 0.3
        const startX = (SLIDE_W - (cardW * 3 + gap * 2)) / 2
        const startY = 1.7

        const cards = [
            { num: '40+', unit: 'giờ/tháng', label: 'Admin task thủ công', caption: 'Excel + Zalo + Trello', color: COLORS.violet, icon: icons.clipboard },
            { num: '2-3', unit: 'ngày', label: 'Đối chiếu payroll cuối tháng', caption: 'USD ↔ VND lệch tỷ giá', color: COLORS.amber, icon: icons.money },
            { num: '70%', unit: 'client', label: 'Nhắn tin hỏi tiến độ', caption: '≥1 lần/tuần · Multi-language gap', color: COLORS.red, icon: icons.chat },
        ]

        cards.forEach((c, i) => {
            const x = startX + i * (cardW + gap)
            glassCard(s, { x, y: startY, w: cardW, h: cardH })

            // Icon on top
            s.addImage({ data: c.icon, x: x + cardW/2 - 0.45, y: startY + 0.35, w: 0.9, h: 0.9 })

            // Big number — even bigger for impact
            s.addText(c.num, {
                x: x + 0.2, y: startY + 1.35, w: cardW - 0.4, h: 1.5,
                fontFace: FONT.heading, fontSize: 88, bold: true,  // [READABILITY] 72 → 88
                color: c.color, align: 'center', valign: 'middle',
            })

            // Unit
            s.addText(c.unit, {
                x: x + 0.2, y: startY + 2.8, w: cardW - 0.4, h: 0.4,
                fontFace: FONT.body, fontSize: 18, bold: true,  // [READABILITY] 14 → 18
                color: COLORS.white, align: 'center',
            })

            // Label
            s.addText(c.label, {
                x: x + 0.2, y: startY + 3.25, w: cardW - 0.4, h: 0.45,
                fontFace: FONT.body, fontSize: 16,  // [READABILITY] 13 → 16
                color: COLORS.textPrimary, align: 'center',
            })

            // Caption
            s.addText(c.caption, {
                x: x + 0.2, y: startY + 3.75, w: cardW - 0.4, h: 0.35,
                fontFace: FONT.body, fontSize: 12, italic: true,  // [READABILITY] 10 → 12
                color: COLORS.textMuted, align: 'center',
            })
        })

        // Bottom insight
        s.addText('Phỏng vấn 5 agency Việt Nam — đây không phải con số tưởng tượng.', {
            x: 0.5, y: 6.4, w: SLIDE_W - 1, h: 0.4,
            fontFace: FONT.body, fontSize: 18, italic: true,  // [READABILITY] 14 → 18
            color: COLORS.violetLight, align: 'center',
        })

        slideFooter(s, 2)
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 3 — 3 Pain Points                                         */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)
        slideTitle(s, 'Vì sao agency video editing đang khổ?', '3 pain points cốt lõi')

        const cardW = 3.9
        const cardH = 4.6
        const gap = 0.3
        const startX = (SLIDE_W - (cardW * 3 + gap * 2)) / 2
        const startY = 1.7

        // [READABILITY] Shortened body text for less cramped cards
        const pains = [
            {
                icon: icons.clipboard,
                title: 'Quản lý task rời rạc',
                body: 'Excel + Zalo + Trello chắp vá. Admin phải hỏi từng editor mới biết task đang ở đâu. Dễ sót, miss deadline.',
                stat: '1.5h/ngày',
                statLabel: 'để track status',
            },
            {
                icon: icons.money,
                title: 'Tài chính chaos',
                body: 'Client trả USD, editor lương VND — 2 file Excel. Tỷ giá thay đổi, profit margin mơ hồ.',
                stat: '5-10%',
                statLabel: 'sai số payroll',
            },
            {
                icon: icons.chat,
                title: 'Client không thấy tiến độ',
                body: 'Không có nơi tập trung. Rào cản ngôn ngữ Việt-Anh-Trung. Admin reply DM hàng giờ.',
                stat: '70%',
                statLabel: 'client nhắn ≥1 lần/tuần',
            },
        ]

        pains.forEach((p, i) => {
            const x = startX + i * (cardW + gap)
            glassCard(s, { x, y: startY, w: cardW, h: cardH })

            // Pain # circle — bigger
            s.addShape('ellipse', {
                x: x + 0.3, y: startY + 0.3, w: 0.55, h: 0.55,
                fill: { color: COLORS.amber, transparency: 75 },
                line: { color: COLORS.amber, width: 1.5 },
            })
            s.addText(`${i + 1}`, {
                x: x + 0.3, y: startY + 0.3, w: 0.55, h: 0.55,
                fontFace: FONT.heading, fontSize: 20, bold: true,
                color: COLORS.amber, align: 'center', valign: 'middle',
            })

            // Icon
            s.addImage({ data: p.icon, x: x + cardW - 1.05, y: startY + 0.3, w: 0.6, h: 0.6 })

            // Title — bigger
            s.addText(p.title, {
                x: x + 0.3, y: startY + 1.1, w: cardW - 0.6, h: 0.6,
                fontFace: FONT.heading, fontSize: 22, bold: true,  // [READABILITY] 18 → 22
                color: COLORS.white, valign: 'top',
            })

            // Body — bigger
            s.addText(p.body, {
                x: x + 0.3, y: startY + 1.85, w: cardW - 0.6, h: 1.6,
                fontFace: FONT.body, fontSize: 16,  // [READABILITY] 13 → 16
                color: COLORS.textPrimary, valign: 'top',
            })

            // Stat box — bigger
            s.addShape('roundRect', {
                x: x + 0.3, y: startY + 3.5, w: cardW - 0.6, h: 1.0,
                fill: { color: COLORS.amber, transparency: 86 },
                line: { color: COLORS.amber, width: 1, transparency: 50 },
                rectRadius: 0.08,
            })
            s.addText(p.stat, {
                x: x + 0.3, y: startY + 3.55, w: cardW - 0.6, h: 0.55,
                fontFace: FONT.heading, fontSize: 30, bold: true,  // [READABILITY] 22 → 30
                color: COLORS.amber, align: 'center', valign: 'middle',
            })
            s.addText(p.statLabel, {
                x: x + 0.3, y: startY + 4.05, w: cardW - 0.6, h: 0.4,
                fontFace: FONT.body, fontSize: 14,  // [READABILITY] 11 → 14
                color: COLORS.white, align: 'center', valign: 'middle',
            })
        })

        // Bottom takeaway
        s.addText('Câu chuyện của HÀNG NGÀN agency video editing Việt Nam.', {
            x: 0.5, y: 6.6, w: SLIDE_W - 1, h: 0.4,
            fontFace: FONT.body, fontSize: 17, italic: true, bold: true,  // [READABILITY] 14 → 17
            color: COLORS.violetLight, align: 'center',
        })

        slideFooter(s, 3)
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 4 — Solution                                              */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)
        slideTitle(s, 'HustlyTasker — Nền tảng SaaS chuyên biệt cho Video Agency')

        // Hero positioning quote (big glass card)
        glassCard(s, { x: 1.0, y: 1.8, w: SLIDE_W - 2, h: 1.6 })
        s.addText('"Như Asana + Frame.io + QuickBooks gộp lại,', {
            x: 1.2, y: 1.95, w: SLIDE_W - 2.4, h: 0.6,
            fontFace: FONT.heading, fontSize: 26, italic: true,  // [READABILITY] 22 → 26
            color: COLORS.textPrimary, align: 'center', valign: 'middle',
        })
        s.addText('build riêng cho Talking Head Video Editing."', {
            x: 1.2, y: 2.55, w: SLIDE_W - 2.4, h: 0.6,
            fontFace: FONT.heading, fontSize: 26, italic: true, bold: true,  // [READABILITY] 22 → 26
            color: COLORS.violetLight, align: 'center', valign: 'middle',
        })

        // 3 value props
        const cardW = 3.9
        const cardH = 2.9
        const gap = 0.3
        const startX = (SLIDE_W - (cardW * 3 + gap * 2)) / 2
        const startY = 3.85

        const props = [
            { icon: icons.target, title: 'Chuyên biệt', body: 'Workflow + pricing riêng cho video editing — không phải tool chung chung.' },
            { icon: icons.exchange, title: 'Dual-currency native', body: 'USD/VND song song, auto-payroll, profit margin real-time.' },
            { icon: icons.globe, title: 'Multi-role visibility', body: 'Admin / Editor / Client view khác nhau, đa ngôn ngữ.' },
        ]

        props.forEach((p, i) => {
            const x = startX + i * (cardW + gap)
            glassCard(s, { x, y: startY, w: cardW, h: cardH })
            s.addImage({ data: p.icon, x: x + 0.4, y: startY + 0.35, w: 0.8, h: 0.8 })
            s.addText(p.title, {
                x: x + 0.4, y: startY + 1.25, w: cardW - 0.8, h: 0.55,
                fontFace: FONT.heading, fontSize: 22, bold: true,  // [READABILITY] 18 → 22
                color: COLORS.white,
            })
            s.addText(p.body, {
                x: x + 0.4, y: startY + 1.85, w: cardW - 0.8, h: 0.95,
                fontFace: FONT.body, fontSize: 15,  // [READABILITY] 13 → 15
                color: COLORS.textPrimary, valign: 'top',
            })
        })

        // Bottom hint
        s.addText('"Chúng tôi không serve tất cả — chúng tôi serve sâu cho 1 niche."', {
            x: 0.5, y: 6.95, w: SLIDE_W - 1, h: 0.35,
            fontFace: FONT.body, fontSize: 14, italic: true,  // [READABILITY] 12 → 14
            color: COLORS.violetLight, align: 'center',
        })

        slideFooter(s, 4)
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 5 — 4 Differentiators                                     */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)
        slideTitle(s, '4 thứ làm HustlyTasker khác mọi tool hiện có')

        const cardW = 5.8
        const cardH = 2.4
        const gap = 0.3
        const startX = (SLIDE_W - (cardW * 2 + gap)) / 2
        const startY = 1.7

        // [READABILITY] Shorter body, simpler structure
        const diffs = [
            { icon: icons.chart, title: 'Specialized Workflow', body: '11-stage task lifecycle riêng cho video editing. Auto-detect quá hạn.', tag: 'Built-in' },
            { icon: icons.store, title: 'Task Marketplace', body: 'Editor tự nhận task ưa thích. Tiết kiệm thời gian admin matching manual.', tag: 'Unique' },
            { icon: icons.bolt, title: 'Smart Automation', body: 'AI-driven batch task creation. Tự phân loại, tự tính giá, tự gán editor.', tag: 'Differentiated' },
            { icon: icons.wallet, title: 'Built-in Finance', body: 'Native dual-currency + auto-payroll. Không cần plugin trả phí thêm.', tag: 'Built-in' },
        ]

        diffs.forEach((d, i) => {
            const row = Math.floor(i / 2)
            const col = i % 2
            const x = startX + col * (cardW + gap)
            const y = startY + row * (cardH + 0.25)
            glassCard(s, { x, y, w: cardW, h: cardH })

            // Icon — bigger
            s.addImage({ data: d.icon, x: x + 0.35, y: y + 0.35, w: 0.7, h: 0.7 })

            // Tag (top right) — bigger
            s.addShape('roundRect', {
                x: x + cardW - 1.6, y: y + 0.4, w: 1.4, h: 0.4,
                fill: { color: COLORS.violet, transparency: 75 },
                line: { color: COLORS.violet, width: 0.5, transparency: 40 },
                rectRadius: 0.06,
            })
            s.addText(d.tag, {
                x: x + cardW - 1.6, y: y + 0.4, w: 1.4, h: 0.4,
                fontFace: FONT.body, fontSize: 12, bold: true,  // [READABILITY] 10 → 12
                color: COLORS.white, align: 'center', valign: 'middle',
            })

            // Title — bigger
            s.addText(d.title, {
                x: x + 1.2, y: y + 0.35, w: cardW - 2.95, h: 0.7,
                fontFace: FONT.heading, fontSize: 22, bold: true,  // [READABILITY] 18 → 22
                color: COLORS.white, valign: 'middle',
            })

            // Body — bigger
            s.addText(d.body, {
                x: x + 0.35, y: y + 1.2, w: cardW - 0.7, h: 1.1,
                fontFace: FONT.body, fontSize: 16,  // [READABILITY] 13 → 16
                color: COLORS.textPrimary, valign: 'top',
            })
        })

        // Bottom takeaway — bigger
        s.addText('4 cái này gộp lại + niche focus = MOAT', {
            x: 0.5, y: 6.85, w: SLIDE_W - 1, h: 0.35,
            fontFace: FONT.heading, fontSize: 18, bold: true,  // [READABILITY] 14 → 18
            color: COLORS.violetLight, align: 'center',
        })

        slideFooter(s, 5)
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 6 — Market Size (TAM/SAM/SOM)                             */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)
        slideTitle(s, 'Thị trường lớn cỡ nào?', 'TAM / SAM / SOM analysis')

        // 3 concentric circles
        const cx = 4.5
        const cy = 4.4

        // TAM outer
        s.addShape('ellipse', {
            x: cx - 2.8, y: cy - 2.8, w: 5.6, h: 5.6,
            fill: { color: COLORS.violet, transparency: 88 },
            line: { color: COLORS.violet, width: 1.5, transparency: 40 },
        })
        // SAM middle
        s.addShape('ellipse', {
            x: cx - 1.9, y: cy - 1.9, w: 3.8, h: 3.8,
            fill: { color: COLORS.violet, transparency: 78 },
            line: { color: COLORS.violetLight, width: 1.5, transparency: 30 },
        })
        // SOM inner
        s.addShape('ellipse', {
            x: cx - 1.0, y: cy - 1.0, w: 2, h: 2,
            fill: { color: COLORS.emerald, transparency: 60 },
            line: { color: COLORS.emerald, width: 1.5, transparency: 20 },
        })

        // Labels on circles — bigger
        s.addText('TAM', {
            x: cx - 2.7, y: cy - 2.7, w: 1.5, h: 0.4,
            fontFace: FONT.heading, fontSize: 18, bold: true,  // [READABILITY] 14 → 18
            color: COLORS.violetLight, align: 'left', charSpacing: 4,
        })
        s.addText('SAM', {
            x: cx - 1.8, y: cy - 1.8, w: 1.5, h: 0.4,
            fontFace: FONT.heading, fontSize: 16, bold: true,  // [READABILITY] 13 → 16
            color: COLORS.violetLight, align: 'left', charSpacing: 4,
        })
        s.addText('SOM', {
            x: cx - 0.5, y: cy - 0.4, w: 1, h: 0.4,
            fontFace: FONT.heading, fontSize: 16, bold: true,
            color: COLORS.emerald, align: 'center', charSpacing: 4,
        })
        s.addText('$15M', {
            x: cx - 0.7, y: cy + 0.0, w: 1.4, h: 0.6,
            fontFace: FONT.heading, fontSize: 26, bold: true,  // [READABILITY] 20 → 26
            color: COLORS.white, align: 'center',
        })

        // Right side legend with details
        const legendX = 8.5
        glassCard(s, { x: legendX, y: 1.7, w: 4.3, h: 5.2 })

        const items = [
            { label: 'TAM', value: '$4.3B', sub: 'Global Video Editing Software (2024)', color: COLORS.violetLight },
            { label: 'SAM', value: '$150M', sub: 'Talking head editing agencies in SEA', color: COLORS.violet },
            { label: 'SOM', value: '$15M', sub: 'VN agencies phục vụ client quốc tế (Y1)', color: COLORS.emerald },
        ]

        items.forEach((item, i) => {
            const itemY = 1.9 + i * 1.6

            s.addText(item.label, {
                x: legendX + 0.3, y: itemY, w: 1, h: 0.4,
                fontFace: FONT.heading, fontSize: 16, bold: true,  // [READABILITY] 13 → 16
                color: item.color, charSpacing: 4,
            })

            s.addText(item.value, {
                x: legendX + 0.3, y: itemY + 0.4, w: 3.7, h: 0.7,
                fontFace: FONT.heading, fontSize: 38, bold: true,  // [READABILITY] 32 → 38
                color: COLORS.white,
            })

            s.addText(item.sub, {
                x: legendX + 0.3, y: itemY + 1.05, w: 3.7, h: 0.45,
                fontFace: FONT.body, fontSize: 13,  // [READABILITY] 11 → 13
                color: COLORS.textPrimary, valign: 'top',
            })
        })

        // Insight at bottom
        s.addText('Niche nhưng KHÔNG nhỏ — 1% market share = $1.5M MRR potential', {
            x: 0.5, y: 6.85, w: SLIDE_W - 1, h: 0.35,
            fontFace: FONT.body, fontSize: 15, italic: true, bold: true,  // [READABILITY] 12 → 15
            color: COLORS.violetLight, align: 'center',
        })
        s.addText('Source: Grand View Research, Statista 2024', {
            x: 0.5, y: 7.15, w: SLIDE_W - 1, h: 0.25,
            fontFace: FONT.body, fontSize: 11,  // [READABILITY] 9 → 11
            color: COLORS.textMuted, align: 'center',
        })

        slideFooter(s, 6)
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 7 — Target Personas                                       */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)
        slideTitle(s, 'Chúng tôi serve ai? — 3 personas')

        const cardW = 3.9
        const cardH = 4.6
        const gap = 0.3
        const startX = (SLIDE_W - (cardW * 3 + gap * 2)) / 2
        const startY = 1.7

        // [READABILITY] Shorter quotes + 2 bullets only (was 3) for less density
        const personas = [
            {
                icon: icons.admin,
                name: 'Anh Hùng, 32 tuổi',
                role: 'Chủ agency video editing',
                quote: '"40+ giờ/tháng cho admin việc thay vì grow business."',
                jobs: ['Quản lý 50+ task/tháng', 'Tính lương 10 editor chính xác'],
                tier: 'Pro $29/mo',
                color: COLORS.violet,
            },
            {
                icon: icons.editor,
                name: 'Bạn Linh, 24 tuổi',
                role: 'Freelance editor',
                quote: '"Muốn pick task mình giỏi, lương rõ ràng."',
                jobs: ['Tự nhận task phù hợp', 'Tracking lương real-time'],
                tier: 'Included in Pro',
                color: COLORS.violetLight,
            },
            {
                icon: icons.creator,
                name: 'Mark, 28 tuổi',
                role: 'YouTuber 500K subs',
                quote: '"See progress without sending DMs everyday."',
                jobs: ['Self-service progress view', 'Multi-language portal'],
                tier: 'Free via Portal',
                color: COLORS.emerald,
            },
        ]

        personas.forEach((p, i) => {
            const x = startX + i * (cardW + gap)
            glassCard(s, { x, y: startY, w: cardW, h: cardH, borderColor: p.color })

            // Avatar circle — bigger
            s.addShape('ellipse', {
                x: x + cardW/2 - 0.55, y: startY + 0.3, w: 1.1, h: 1.1,
                fill: { color: p.color, transparency: 70 },
                line: { color: p.color, width: 2.5, transparency: 20 },
            })
            s.addImage({ data: p.icon, x: x + cardW/2 - 0.4, y: startY + 0.45, w: 0.8, h: 0.8 })

            // Name — bigger
            s.addText(p.name, {
                x: x + 0.3, y: startY + 1.55, w: cardW - 0.6, h: 0.45,
                fontFace: FONT.heading, fontSize: 20, bold: true,  // [READABILITY] 16 → 20
                color: COLORS.white, align: 'center',
            })

            // Role — bigger
            s.addText(p.role, {
                x: x + 0.3, y: startY + 2.0, w: cardW - 0.6, h: 0.35,
                fontFace: FONT.body, fontSize: 14, italic: true,  // [READABILITY] 11 → 14
                color: COLORS.textMuted, align: 'center',
            })

            // Quote — bigger
            s.addText(p.quote, {
                x: x + 0.25, y: startY + 2.45, w: cardW - 0.5, h: 0.95,
                fontFace: FONT.body, fontSize: 14, italic: true,  // [READABILITY] 11 → 14
                color: COLORS.violetLight, align: 'center', valign: 'top',
            })

            // Jobs-to-be-done — bigger
            const jobsItems = p.jobs.map((j, idx) => ({
                text: j,
                options: { bullet: true, color: COLORS.textPrimary, breakLine: idx < p.jobs.length - 1 },
            }))
            s.addText(jobsItems, {
                x: x + 0.35, y: startY + 3.55, w: cardW - 0.7, h: 0.7,
                fontFace: FONT.body, fontSize: 13,  // [READABILITY] 10 → 13
                paraSpaceAfter: 4, valign: 'top',
            })

            // Tier badge — bigger
            s.addShape('roundRect', {
                x: x + 0.4, y: startY + cardH - 0.6, w: cardW - 0.8, h: 0.45,
                fill: { color: p.color, transparency: 78 },
                line: { color: p.color, width: 1, transparency: 30 },
                rectRadius: 0.06,
            })
            s.addText(p.tier, {
                x: x + 0.4, y: startY + cardH - 0.6, w: cardW - 0.8, h: 0.45,
                fontFace: FONT.body, fontSize: 14, bold: true,  // [READABILITY] 11 → 14
                color: COLORS.white, align: 'center', valign: 'middle',
            })
        })

        // Bottom takeaway
        s.addText('Khác Trello/Asana — chúng tôi serve cả 3 personas trên 1 platform.', {
            x: 0.5, y: 6.55, w: SLIDE_W - 1, h: 0.4,
            fontFace: FONT.body, fontSize: 17, italic: true, bold: true,  // [READABILITY] 13 → 17
            color: COLORS.violetLight, align: 'center',
        })

        slideFooter(s, 7)
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 8 — Why Us, Why Now                                       */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)
        slideTitle(s, 'Tại sao là chúng tôi? Tại sao là LÚC NÀY?')

        const colW = 5.9
        const colH = 4.3
        const startX = 0.5
        const startY = 1.7
        const gap = 0.3

        // Why NOW (left)
        glassCard(s, { x: startX, y: startY, w: colW, h: colH })
        s.addImage({ data: icons.trending, x: startX + 0.3, y: startY + 0.3, w: 0.6, h: 0.6 })
        s.addText('Why NOW — Market Timing', {
            x: startX + 1.05, y: startY + 0.3, w: colW - 1.3, h: 0.6,
            fontFace: FONT.heading, fontSize: 22, bold: true,  // [READABILITY] 18 → 22
            color: COLORS.emerald, valign: 'middle',
        })
        // [READABILITY] Shorter bullets
        const nowItems = [
            'YouTube Shorts + TikTok boom — demand talking head edit tăng 200% từ 2022',
            '80% top YouTubers/Podcasters dùng talking head format',
            'VN agency phục vụ client US/UK/AU với lợi thế chi phí',
        ]
        s.addText(
            nowItems.map((t, i) => ({
                text: t,
                options: { bullet: true, color: COLORS.textPrimary, breakLine: i < nowItems.length - 1 },
            })),
            {
                x: startX + 0.4, y: startY + 1.15, w: colW - 0.8, h: 3.0,
                fontFace: FONT.body, fontSize: 17,  // [READABILITY] 14 → 17
                paraSpaceAfter: 14, valign: 'top',
            },
        )

        // Why US (right)
        const x2 = startX + colW + gap
        glassCard(s, { x: x2, y: startY, w: colW, h: colH })
        s.addImage({ data: icons.crown, x: x2 + 0.3, y: startY + 0.3, w: 0.6, h: 0.6 })
        s.addText('Why US — Our Edge', {
            x: x2 + 1.05, y: startY + 0.3, w: colW - 1.3, h: 0.6,
            fontFace: FONT.heading, fontSize: 22, bold: true,  // [READABILITY] 18 → 22
            color: COLORS.violetLight, valign: 'middle',
        })
        const usItems = [
            'Founder team có lived experience trong video editing',
            'Validation đã có — MVP đang chạy với agency thật',
            'Niche advantage — đi sâu 1 ngành, không phân tâm',
        ]
        s.addText(
            usItems.map((t, i) => ({
                text: t,
                options: { bullet: true, color: COLORS.textPrimary, breakLine: i < usItems.length - 1 },
            })),
            {
                x: x2 + 0.4, y: startY + 1.15, w: colW - 0.8, h: 3.0,
                fontFace: FONT.body, fontSize: 17,
                paraSpaceAfter: 14, valign: 'top',
            },
        )

        // Bottom big numbers bar — bigger
        const barY = 6.25
        const barH = 1.0
        glassCard(s, { x: 0.5, y: barY, w: SLIDE_W - 1, h: barH, borderColor: COLORS.emerald, borderTransparency: 30 })

        const stats = [
            { num: '18', label: 'agency thực' },
            { num: '23+', label: 'users active' },
            { num: '35+', label: 'workspaces' },
        ]
        const statsW = (SLIDE_W - 1) / 3
        stats.forEach((st, i) => {
            const x = 0.5 + i * statsW
            s.addText(st.num, {
                x, y: barY + 0.05, w: statsW * 0.45, h: barH - 0.1,
                fontFace: FONT.heading, fontSize: 42, bold: true,  // [READABILITY] 32 → 42
                color: COLORS.emerald, align: 'right', valign: 'middle',
            })
            s.addText(st.label, {
                x: x + statsW * 0.48, y: barY + 0.05, w: statsW * 0.5, h: barH - 0.1,
                fontFace: FONT.body, fontSize: 17,  // [READABILITY] 13 → 17
                color: COLORS.white, align: 'left', valign: 'middle',
            })
        })

        slideFooter(s, 8)
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 9 — 5 Revenue Streams                                     */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)
        slideTitle(s, 'Doanh thu đến từ đâu? — 5 nguồn doanh thu')

        // [READABILITY] Shorter body for less density
        const streams = [
            { icon: icons.sync, num: '1', title: 'SaaS Subscription', pct: '~60%', body: 'Phí thuê bao tháng/năm. Recurring revenue chính.', badge: 'Recurring', color: COLORS.violet },
            { icon: icons.star, num: '2', title: 'Premium Add-ons', pct: '~20%', body: 'AI analytics, custom reports, advanced forecasting.', badge: 'Upsell', color: COLORS.amber },
            { icon: icons.handshake, num: '3', title: 'Marketplace Fee', pct: '~10%', body: 'Phần trăm nhỏ trên task cross-agency (future).', badge: 'Transactional', color: COLORS.violetLight },
            { icon: icons.building, num: '4', title: 'Enterprise / White-label', pct: '~7%', body: 'Rebrand HustlyTasker. Dedicated CSM, SLA.', badge: 'Enterprise', color: COLORS.emerald },
            { icon: icons.plug, num: '5', title: 'API / Integration Tier', pct: '~3%', body: 'Build automation trên platform. Tiered pricing.', badge: 'Developer', color: COLORS.fuchsia },
        ]

        // Top row (3 cards) — bigger cards
        const cardW = 3.95
        const cardH = 2.45
        const gap = 0.22
        const startX = (SLIDE_W - (cardW * 3 + gap * 2)) / 2
        const row1Y = 1.6

        // Bottom row (2 cards) — centered
        const startX2 = (SLIDE_W - (cardW * 2 + gap)) / 2
        const row2Y = 4.2

        streams.forEach((st, i) => {
            const isTop = i < 3
            const col = isTop ? i : i - 3
            const x = isTop ? startX + col * (cardW + gap) : startX2 + col * (cardW + gap)
            const y = isTop ? row1Y : row2Y
            glassCard(s, { x, y, w: cardW, h: cardH, borderColor: st.color })

            // Stream number circle — bigger
            s.addShape('ellipse', {
                x: x + 0.25, y: y + 0.25, w: 0.6, h: 0.6,
                fill: { color: st.color, transparency: 70 },
                line: { color: st.color, width: 1.5 },
            })
            s.addText(st.num, {
                x: x + 0.25, y: y + 0.25, w: 0.6, h: 0.6,
                fontFace: FONT.heading, fontSize: 18, bold: true,  // [READABILITY] 14 → 18
                color: COLORS.white, align: 'center', valign: 'middle',
            })

            // Percentage (top right, large) — bigger
            s.addText(st.pct, {
                x: x + cardW - 1.6, y: y + 0.2, w: 1.4, h: 0.65,
                fontFace: FONT.heading, fontSize: 28, bold: true,  // [READABILITY] 22 → 28
                color: st.color, align: 'right', valign: 'top',
            })

            // Title — bigger
            s.addText(st.title, {
                x: x + 1.0, y: y + 0.25, w: cardW - 2.5, h: 0.6,
                fontFace: FONT.heading, fontSize: 16, bold: true,  // [READABILITY] 14 → 16
                color: COLORS.white, valign: 'middle',
            })

            // Body — bigger
            s.addText(st.body, {
                x: x + 0.3, y: y + 1.0, w: cardW - 0.6, h: 1.0,
                fontFace: FONT.body, fontSize: 14,  // [READABILITY] 11 → 14
                color: COLORS.textPrimary, valign: 'top',
            })

            // Badge bottom left — bigger
            s.addShape('roundRect', {
                x: x + 0.3, y: y + cardH - 0.5, w: 1.6, h: 0.36,
                fill: { color: st.color, transparency: 78 },
                line: { color: st.color, width: 0.6, transparency: 40 },
                rectRadius: 0.05,
            })
            s.addText(st.badge, {
                x: x + 0.3, y: y + cardH - 0.5, w: 1.6, h: 0.36,
                fontFace: FONT.body, fontSize: 11, bold: true,  // [READABILITY] 9 → 11
                color: COLORS.white, align: 'center', valign: 'middle',
            })
        })

        // Bottom insight
        s.addText('Recurring (60%) + 4 streams = sustainable + multi-lever growth', {
            x: 0.5, y: 6.95, w: SLIDE_W - 1, h: 0.4,
            fontFace: FONT.body, fontSize: 16, italic: true, bold: true,  // [READABILITY] 13 → 16
            color: COLORS.violetLight, align: 'center',
        })

        slideFooter(s, 9)
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 10 — Pricing Tiers                                        */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)
        slideTitle(s, '3 gói pricing — Freemium model')

        const tiers = [
            {
                name: 'Free', price: '$0', period: '/tháng',
                subtitle: 'For testing',
                features: ['1 workspace', '3 members max', 'Task management basic', 'Single-language portal'],
                cta: 'Sign up free',
                goal: 'User adoption + viral growth',
                color: COLORS.textSecondary,
                featured: false,
            },
            {
                name: 'Pro', price: '$29', period: '/tháng',
                subtitle: 'For growing agencies',
                features: ['Unlimited workspaces + members', 'Full Finance + Payroll', 'Multi-language portal', 'Marketplace + Analytics', 'Smart Automation'],
                cta: 'Start 14-day trial',
                goal: 'Agency 5-50 editors',
                color: COLORS.violet,
                featured: true,
            },
            {
                name: 'Enterprise', price: 'Custom', period: '',
                subtitle: 'For scale',
                features: ['Everything in Pro', 'White-label branding', 'API + integration tier', 'Dedicated CSM + SLA 99.9%', 'Priority feature requests'],
                cta: 'Contact sales',
                goal: 'Agency 50+ editors',
                color: COLORS.emerald,
                featured: false,
            },
        ]

        const cardW = 3.9
        const cardH = 5.0
        const gap = 0.3
        const startX = (SLIDE_W - (cardW * 3 + gap * 2)) / 2
        const startY = 1.55

        tiers.forEach((t, i) => {
            const x = startX + i * (cardW + gap)
            const y = t.featured ? startY - 0.15 : startY
            const h = t.featured ? cardH + 0.3 : cardH

            glassCard(s, {
                x, y, w: cardW, h,
                borderColor: t.color,
                borderTransparency: t.featured ? 20 : 60,
            })

            // "Most Popular" tag (only for featured) — bigger
            if (t.featured) {
                s.addShape('roundRect', {
                    x: x + cardW/2 - 1.2, y: y - 0.25, w: 2.4, h: 0.5,
                    fill: { color: t.color },
                    line: { type: 'none' },
                    rectRadius: 0.25,
                })
                s.addText('★ MOST POPULAR', {
                    x: x + cardW/2 - 1.2, y: y - 0.25, w: 2.4, h: 0.5,
                    fontFace: FONT.heading, fontSize: 13, bold: true,  // [READABILITY] 10 → 13
                    color: COLORS.white, align: 'center', valign: 'middle',
                    charSpacing: 2,
                })
            }

            const innerY = y + (t.featured ? 0.4 : 0.3)

            // Tier name — bigger
            s.addText(t.name, {
                x: x + 0.3, y: innerY, w: cardW - 0.6, h: 0.55,
                fontFace: FONT.heading, fontSize: 28, bold: true,  // [READABILITY] 22 → 28
                color: t.color, align: 'center', valign: 'middle',
            })

            // Subtitle — bigger
            s.addText(t.subtitle, {
                x: x + 0.3, y: innerY + 0.6, w: cardW - 0.6, h: 0.35,
                fontFace: FONT.body, fontSize: 13, italic: true,  // [READABILITY] 11 → 13
                color: COLORS.textMuted, align: 'center',
            })

            // Price — bigger
            s.addText([
                { text: t.price, options: { fontSize: 48, bold: true, color: COLORS.white } },  // [READABILITY] 38 → 48
                { text: t.period, options: { fontSize: 16, color: COLORS.textPrimary } },  // [READABILITY] 14 → 16
            ], {
                x: x + 0.3, y: innerY + 1.0, w: cardW - 0.6, h: 0.95,
                fontFace: FONT.heading, align: 'center', valign: 'middle',
            })

            // Features — bigger
            const featItems = t.features.map((f, idx) => ({
                text: f,
                options: { bullet: true, color: COLORS.textPrimary, breakLine: idx < t.features.length - 1 },
            }))
            s.addText(featItems, {
                x: x + 0.3, y: innerY + 2.0, w: cardW - 0.6, h: 2.0,
                fontFace: FONT.body, fontSize: 13,  // [READABILITY] 11 → 13
                paraSpaceAfter: 5, valign: 'top',
            })

            // CTA button — bigger
            s.addShape('roundRect', {
                x: x + 0.4, y: innerY + (h - 1.15) + (t.featured ? 0.0 : -0.05), w: cardW - 0.8, h: 0.5,
                fill: { color: t.color, transparency: t.featured ? 15 : 65 },
                line: { color: t.color, width: 1, transparency: 20 },
                rectRadius: 0.08,
            })
            s.addText(t.cta, {
                x: x + 0.4, y: innerY + (h - 1.15) + (t.featured ? 0.0 : -0.05), w: cardW - 0.8, h: 0.5,
                fontFace: FONT.body, fontSize: 14, bold: true,  // [READABILITY] 12 → 14
                color: t.featured ? COLORS.white : t.color, align: 'center', valign: 'middle',
            })

            // Goal text — bigger
            s.addText(t.goal, {
                x: x + 0.3, y: innerY + (h - 0.55) + (t.featured ? 0.0 : -0.05), w: cardW - 0.6, h: 0.32,
                fontFace: FONT.body, fontSize: 11, italic: true,  // [READABILITY] 9 → 11
                color: COLORS.textMuted, align: 'center',
            })
        })

        // Bottom comparison hint
        s.addText('Pro flat $29/agency — KHÔNG per-user như Trello/Asana ($5-30/user).', {
            x: 0.5, y: 6.95, w: SLIDE_W - 1, h: 0.4,
            fontFace: FONT.body, fontSize: 16, italic: true, bold: true,  // [READABILITY] 13 → 16
            color: COLORS.violetLight, align: 'center',
        })

        slideFooter(s, 10)
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 11 — Revenue Growth Path                                  */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)
        slideTitle(s, 'Lộ trình doanh thu 3 năm', 'Conservative projection')

        // 3 year cards horizontal timeline
        const cardW = 3.9
        const cardH = 4.2
        const gap = 0.3
        const startX = (SLIDE_W - (cardW * 3 + gap * 2)) / 2
        const startY = 1.7

        const years = [
            {
                year: 'YEAR 1',
                mrr: '$2.9K',
                mrrLabel: 'MRR',
                focus: 'Free → Pro conversion focus',
                metrics: ['1000+ signups', '100 Pro customers', '3-5 Enterprise prospects'],
                color: COLORS.violetLight,
            },
            {
                year: 'YEAR 2',
                mrr: '$15K',
                mrrLabel: 'MRR',
                focus: 'Marketplace fee activates',
                metrics: ['500 active Pro subs', 'First Enterprise deals (5-10)', 'Marketplace launched'],
                color: COLORS.violet,
            },
            {
                year: 'YEAR 3',
                mrr: '$50K+',
                mrrLabel: 'MRR',
                focus: 'API tier + Enterprise mature',
                metrics: ['1500+ Pro customers', '10+ Enterprise active', 'API tier live'],
                color: COLORS.emerald,
            },
        ]

        years.forEach((y, i) => {
            const x = startX + i * (cardW + gap)
            glassCard(s, { x, y: startY, w: cardW, h: cardH, borderColor: y.color, borderTransparency: 30 })

            // Year tag — bigger
            s.addText(y.year, {
                x: x + 0.3, y: startY + 0.3, w: cardW - 0.6, h: 0.45,
                fontFace: FONT.heading, fontSize: 16, bold: true,  // [READABILITY] 12 → 16
                color: y.color, align: 'center', charSpacing: 6,
            })

            // Big MRR number — bigger
            s.addText(y.mrr, {
                x: x + 0.2, y: startY + 0.85, w: cardW - 0.4, h: 1.4,
                fontFace: FONT.heading, fontSize: 68, bold: true,  // [READABILITY] 56 → 68
                color: COLORS.white, align: 'center', valign: 'middle',
            })

            // MRR label — bigger
            s.addText(y.mrrLabel, {
                x: x + 0.2, y: startY + 2.2, w: cardW - 0.4, h: 0.35,
                fontFace: FONT.body, fontSize: 15, bold: true,  // [READABILITY] 12 → 15
                color: y.color, align: 'center',
            })

            // Focus — bigger
            s.addText(y.focus, {
                x: x + 0.3, y: startY + 2.65, w: cardW - 0.6, h: 0.55,
                fontFace: FONT.body, fontSize: 15, italic: true,  // [READABILITY] 13 → 15
                color: COLORS.textPrimary, align: 'center', valign: 'top',
            })

            // Metrics bullets — bigger
            const metricItems = y.metrics.map((m, idx) => ({
                text: m,
                options: { bullet: true, color: COLORS.textPrimary, breakLine: idx < y.metrics.length - 1 },
            }))
            s.addText(metricItems, {
                x: x + 0.4, y: startY + 3.25, w: cardW - 0.8, h: 1.1,
                fontFace: FONT.body, fontSize: 13,  // [READABILITY] 10 → 13
                paraSpaceAfter: 5, valign: 'top',
            })

            // Arrow between cards
            if (i < years.length - 1) {
                s.addShape('rightTriangle', {
                    x: x + cardW + 0.05, y: startY + cardH/2 - 0.18, w: 0.22, h: 0.36,
                    fill: { color: COLORS.violet, transparency: 40 },
                    line: { type: 'none' },
                    rotate: 90,
                })
            }
        })

        // Bottom disclaimer
        s.addText('Conservative projection dựa trên benchmarks SaaS B2B niche (LTV/CAC 5:1 industry standard).', {
            x: 0.5, y: 6.5, w: SLIDE_W - 1, h: 0.35,
            fontFace: FONT.body, fontSize: 13, italic: true,  // [READABILITY] 11 → 13
            color: COLORS.textSecondary, align: 'center',
        })
        s.addText('Chưa launch chính thức — đây là target, không phải actuals.', {
            x: 0.5, y: 6.85, w: SLIDE_W - 1, h: 0.35,
            fontFace: FONT.body, fontSize: 13, italic: true,
            color: COLORS.textSecondary, align: 'center',
        })

        slideFooter(s, 11)
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 12 — Competitive Landscape                                */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)
        slideTitle(s, 'Đã có ai làm chưa? Chúng tôi khác gì?')

        const rows = [
            ['Built for video editing', '❌ Chung chung', '❌ Chung chung', '✅ Review tool', '✅ Niche talking head'],
            ['Dual-currency native', '❌', '❌', '❌', '✅ USD/VND'],
            ['Multi-role portal', '⚠️ Basic', '⚠️ Basic', '⚠️ Read-only', '✅ 4-tier RBAC'],
            ['Task Marketplace', '❌', '❌', '❌', '✅ Unique'],
            ['Smart automation', '❌', 'Add-on (paid)', '⚠️ Limited', '✅ Built-in'],
            ['Multi-language client', '❌', '⚠️ Setting', '⚠️ Partial', '✅ 5 ngôn ngữ'],
            ['Pricing per agency', '$5-30/user', '$8-24/user', '$15+/user', '$29 unlimited'],
        ]

        // Build table data with styling — bigger fonts throughout
        const headerStyle = {
            fill: { color: '1A0E3E' },
            color: COLORS.violetLight,
            bold: true,
            fontFace: FONT.heading,
            fontSize: 15,  // [READABILITY] 12 → 15
            align: 'center',
            valign: 'middle',
        }
        const headerStyleUs = {
            ...headerStyle,
            fill: { color: COLORS.violet },
            color: COLORS.white,
            fontSize: 15,
        }
        const cellStyle = {
            color: COLORS.textPrimary,
            fontFace: FONT.body,
            fontSize: 13,  // [READABILITY] 11 → 13
            align: 'center',
            valign: 'middle',
        }
        const labelStyle = {
            ...cellStyle,
            bold: true,
            align: 'left',
            color: COLORS.white,
            fontSize: 13,
        }
        const ourCellStyle = {
            ...cellStyle,
            fill: { color: '14101F' },
            color: COLORS.emerald,
            bold: true,
            fontSize: 13,
        }

        const tableData = [
            // Header row
            [
                { text: 'Tiêu chí', options: headerStyle },
                { text: 'Trello / Asana', options: headerStyle },
                { text: 'Monday.com', options: headerStyle },
                { text: 'Frame.io', options: headerStyle },
                { text: 'HustlyTasker', options: headerStyleUs },
            ],
            ...rows.map(r => [
                { text: r[0], options: labelStyle },
                { text: r[1], options: cellStyle },
                { text: r[2], options: cellStyle },
                { text: r[3], options: cellStyle },
                { text: r[4], options: ourCellStyle },
            ]),
        ]

        s.addTable(tableData, {
            x: 0.5, y: 1.6, w: SLIDE_W - 1, h: 4.6,  // [READABILITY] 4.4 → 4.6 taller
            colW: [3.0, 2.3, 2.3, 2.3, 2.4],
            rowH: 0.58,  // [READABILITY] 0.55 → 0.58
            border: { type: 'solid', pt: 0.5, color: '2D2A3F' },
        })

        // Bottom takeaway in glass box — bigger text
        glassCard(s, { x: 0.5, y: 6.5, w: SLIDE_W - 1, h: 0.95, borderColor: COLORS.violet, borderTransparency: 30 })
        s.addText('Trello/Asana = chung chung. Frame.io = review tool. HustlyTasker = end-to-end cho niche talking head.', {
            x: 0.7, y: 6.55, w: SLIDE_W - 1.4, h: 0.85,
            fontFace: FONT.body, fontSize: 16, italic: true, bold: true,  // [READABILITY] 13 → 16
            color: COLORS.white, align: 'center', valign: 'middle',
        })

        slideFooter(s, 12)
    }

    /* ──────────────────────────────────────────────────────────────── */
    /*  SLIDE 13 — Vision + Q&A                                         */
    /* ──────────────────────────────────────────────────────────────── */
    {
        const s = pres.addSlide()
        applyDarkBackground(s)

        // Centered violet glow background
        s.addShape('ellipse', {
            x: SLIDE_W/2 - 3.5, y: SLIDE_H/2 - 3.5, w: 7, h: 7,
            fill: { color: COLORS.violet, transparency: 85 },
            line: { type: 'none' },
        })

        // Top tag — bigger
        s.addText('3-YEAR AMBITION', {
            x: 0.5, y: 0.6, w: SLIDE_W - 1, h: 0.45,
            fontFace: FONT.heading, fontSize: 14, bold: true,  // [READABILITY] 11 → 14
            color: COLORS.violetLight, align: 'center', charSpacing: 8,
        })

        // Big vision title — bigger
        s.addText('Trở thành OS cho mọi', {
            x: 0.5, y: 1.3, w: SLIDE_W - 1, h: 0.95,
            fontFace: FONT.heading, fontSize: 52, bold: true,  // [READABILITY] 44 → 52
            color: COLORS.textPrimary, align: 'center',
        })
        s.addText('Video Agency Đông Nam Á', {
            x: 0.5, y: 2.2, w: SLIDE_W - 1, h: 1.05,
            fontFace: FONT.heading, fontSize: 60, bold: true,  // [READABILITY] 54 → 60
            color: COLORS.white, align: 'center',
        })

        // 3 milestone cards horizontal
        const milestones = [
            { year: '2025 Q4', body: 'Public beta launch', detail: '50 agency · 500 editors active' },
            { year: '2026 Q4', body: '$50K MRR', detail: '200 agency · expand SEA' },
            { year: '2027', body: 'SEA leader', detail: '5 countries · Enterprise mature' },
        ]

        const mCardW = 3.9
        const mCardH = 1.75
        const mGap = 0.3
        const mStartX = (SLIDE_W - (mCardW * 3 + mGap * 2)) / 2
        const mStartY = 4.0

        milestones.forEach((m, i) => {
            const x = mStartX + i * (mCardW + mGap)
            glassCard(s, { x, y: mStartY, w: mCardW, h: mCardH, borderColor: COLORS.violet, borderTransparency: 30 })

            s.addText(m.year, {
                x: x + 0.2, y: mStartY + 0.2, w: mCardW - 0.4, h: 0.4,
                fontFace: FONT.heading, fontSize: 15, bold: true,  // [READABILITY] 12 → 15
                color: COLORS.violetLight, align: 'center', charSpacing: 4,
            })
            s.addText(m.body, {
                x: x + 0.2, y: mStartY + 0.6, w: mCardW - 0.4, h: 0.6,
                fontFace: FONT.heading, fontSize: 24, bold: true,  // [READABILITY] 20 → 24
                color: COLORS.white, align: 'center',
            })
            s.addText(m.detail, {
                x: x + 0.2, y: mStartY + 1.2, w: mCardW - 0.4, h: 0.45,
                fontFace: FONT.body, fontSize: 13,  // [READABILITY] 11 → 13
                color: COLORS.textPrimary, align: 'center',
            })
        })

        // Q&A title — bigger
        s.addText('Câu hỏi & Thảo luận', {
            x: 0.5, y: 6.1, w: SLIDE_W - 1, h: 0.75,
            fontFace: FONT.heading, fontSize: 44, bold: true,  // [READABILITY] 36 → 44
            color: COLORS.fuchsia, align: 'center',
        })

        // Footer — bigger
        s.addText('HustlyTasker · contact@hustlytasker.xyz', {
            x: 0.5, y: 7.0, w: SLIDE_W - 1, h: 0.35,
            fontFace: FONT.body, fontSize: 14, italic: true,  // [READABILITY] 12 → 14
            color: COLORS.textSecondary, align: 'center',
        })
    }

    /* ════════════════════════════════════════════════════════════════ */
    /*  Save                                                           */
    /* ════════════════════════════════════════════════════════════════ */

    const outputPath = 'C:/Users/Dareu/.gemini/antigravity/playground/blazing-station/.claude/worktrees/cranky-austin/presentation/HustlyTasker_Pitch_15min_Draft.pptx'
    await pres.writeFile({ fileName: outputPath })
    console.log(`✅ Generated: ${outputPath}`)
}

build().catch((err) => {
    console.error('❌ Build failed:', err)
    process.exit(1)
})
