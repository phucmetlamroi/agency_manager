// [Giải trí] Kiểu chữ phụ đề — dựng lại đúng mặc định của VLC.
//
// Mọi con số dưới đây lấy thẳng từ mã nguồn VLC, không phải ước lượng bằng mắt:
//   modules/text_renderer/freetype/freetype.c
//     freetype-color              0x00FFFFFF  → chữ TRẮNG
//     freetype-opacity            255         → chữ đặc
//     freetype-outline-color      0x00000000  → viền ĐEN
//     freetype-outline-opacity    255         → viền đặc
//     freetype-outline-thickness  4           → "Normal" trong bộ 0/2/4/6
//     freetype-shadow-color       0x00000000  → bóng ĐEN
//     freetype-shadow-opacity     128         → 128/255 ≈ 50%
//     freetype-shadow-angle       -45         → chếch xuống-phải
//     freetype-shadow-distance    0.06        → 0,06 × cỡ chữ
//     freetype-background-opacity 0           → KHÔNG có hộp nền
//   modules/text_renderer/freetype/text_layout.c
//     i_stroker_radius = (metrics.height_px << 6) * (i_outline_thickness / 100.0)
//     ⇒ bán kính viền = 4% cỡ chữ
//   modules/text_renderer/freetype/platform_fonts.h
//     SYSTEM_DEFAULT_FAMILY = "Arial" trên Windows
//
// MỘT CHỖ PHẢI LỆCH khỏi bản gốc, có lý do: VLC vẽ bóng bằng cách chép lại
// glyph ĐÃ CÓ VIỀN rồi dịch đi, nên bóng vẫn thò ra ngoài lớp viền. CSS
// `text-shadow` chỉ chép RIÊNG nét chữ và không có tham số spread — bóng dịch
// 0,042em sẽ bị lớp viền 0,04em che gần hết, coi như biến mất. Nên ở đây dùng
// độ nhoè thay cho phần "viền" mà bóng của VLC mang theo: cùng khoảng dịch,
// cùng độ đen, nhoè ra đủ để đọc ra đúng vệt tối dưới-phải như VLC.

/** freetype-outline-thickness 4 ÷ 100. Bán kính viền, theo em. */
const OUTLINE_RADIUS_EM = 0.04
/** freetype-shadow-distance. Góc −45° ⇒ chia đều cho hai trục. */
const SHADOW_DISTANCE_EM = 0.06
const SHADOW_XY_EM = SHADOW_DISTANCE_EM / Math.SQRT2 // ≈ 0,0424
/**
 * Đứng thay cho phần viền mà bóng của VLC mang theo (xem ghi chú trên).
 * Trị số CHỌN BẰNG MẮT, không suy ra từ công thức: dựng bản thử 56px trên nền
 * xám trung tính rồi so 0,07em / 0,11em / hai lớp cạnh nhau. 0,07em chìm tới
 * mức gần như không phân biệt được với bản KHÔNG có bóng; hai lớp thì đen quá,
 * thành viền đôi. 0,11em ra đúng vệt tối dưới-phải như VLC.
 */
const SHADOW_BLUR_EM = 0.11
/** freetype-shadow-opacity 128/255. */
const SHADOW_ALPHA = 0.5

/**
 * Vòng viền: 12 điểm quanh chu vi thay vì 8. FT_STROKER_LINEJOIN_ROUND của VLC
 * cho nét viền TRÒN; 8 điểm để lộ khấc ở các góc khi chữ phóng to trên TV.
 */
const OUTLINE_RING = Array.from({ length: 12 }, (_v, i) => {
    const a = (i * Math.PI) / 6
    const x = (OUTLINE_RADIUS_EM * Math.cos(a)).toFixed(4)
    const y = (OUTLINE_RADIUS_EM * Math.sin(a)).toFixed(4)
    return `${x}em ${y}em 0 #000`
})

/**
 * Thứ tự QUAN TRỌNG: bóng đổ nằm CUỐI danh sách. text-shadow vẽ từ cuối lên
 * đầu, nên cái đứng đầu nằm trên cùng — viền phải đè lên bóng, không phải
 * ngược lại.
 */
export const SUBTITLE_TEXT_SHADOW = [
    ...OUTLINE_RING,
    `${SHADOW_XY_EM.toFixed(4)}em ${SHADOW_XY_EM.toFixed(4)}em ${SHADOW_BLUR_EM}em rgba(0,0,0,${SHADOW_ALPHA})`,
].join(', ')

/**
 * Arial trước tiên (đúng mặc định VLC trên Windows, và macOS cũng cài sẵn).
 * Các lớp sau CHỈ chọn phông có đủ dấu tiếng Việt — chữ Việt xếp chồng dấu
 * (ế, ộ, ữ, ằ, ẩ) mà phông thiếu glyph thì trình duyệt tụt xuống phông khác
 * theo TỪNG KÝ TỰ, câu thoại sẽ lẫn hai kiểu chữ trông rất bẩn.
 *   • Liberation Sans / Arimo — cùng số đo với Arial, phủ đủ tiếng Việt (Linux, ChromeOS)
 *   • Roboto — Android
 *   • Noto Sans — lưới cuối, phủ Unicode rộng nhất
 */
export const SUBTITLE_FONT_STACK = [
    'Arial',
    '"Liberation Sans"',
    'Arimo',
    '"Helvetica Neue"',
    'Helvetica',
    'Roboto',
    '"Noto Sans"',
    'sans-serif',
].join(', ')

/**
 * Giãn dòng 1,35 — KHÔNG được nhỏ hơn. Tiếng Việt xếp hai tầng dấu (dấu mũ +
 * dấu thanh: ế, ồ, ữ) nên chiều cao thật của dòng vượt xa tiếng Anh; để 1,2
 * là dấu của dòng dưới chạm chân chữ dòng trên.
 */
export const SUBTITLE_LINE_HEIGHT = 1.35

/**
 * Cỡ chữ tính theo % CHIỀU CAO KHUNG HÌNH, không phải theo px cố định — phóng
 * to cửa sổ hay bật toàn màn hình thì phụ đề phải to theo đúng tỉ lệ.
 *
 * Mặc định "Vừa" = 4,2%: ở 1080p ra ~45px, đúng khoảng của các trang xem phim
 * quen thuộc. VLC mặc định là 1/16 chiều cao ≈ 6,25% — to hơn hẳn, nên mức đó
 * để dành cho nấc "Rất lớn".
 */
export const SUB_SIZE_STEPS = [
    { key: 'xs', label: 'Rất nhỏ', pct: 0.03 },
    { key: 's', label: 'Nhỏ', pct: 0.036 },
    { key: 'm', label: 'Vừa', pct: 0.042 },
    { key: 'l', label: 'Lớn', pct: 0.052 },
    { key: 'xl', label: 'Rất lớn', pct: 0.064 },
] as const

export type SubSizeKey = (typeof SUB_SIZE_STEPS)[number]['key']
export const SUB_SIZE_DEFAULT: SubSizeKey = 'm'
/** Cỡ chữ theo mắt người xem, không theo phim ⇒ lưu chung, không kèm videoId. */
export const SUB_SIZE_STORAGE_KEY = 'ent:subsize'

export function subSizePct(key: SubSizeKey): number {
    return (SUB_SIZE_STEPS.find((s) => s.key === key) ?? SUB_SIZE_STEPS[2]).pct
}

export function readStoredSubSize(): SubSizeKey {
    try {
        const raw = localStorage.getItem(SUB_SIZE_STORAGE_KEY)
        if (raw && SUB_SIZE_STEPS.some((s) => s.key === raw)) return raw as SubSizeKey
    } catch {
        /* localStorage bị chặn */
    }
    return SUB_SIZE_DEFAULT
}
