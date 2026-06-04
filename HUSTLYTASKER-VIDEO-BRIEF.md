# HustlyTasker — Video Hướng Dẫn Tổng Quan (2 phút)
## Brief sản xuất bằng Remotion (AI-driven, 100% prompt-to-render)

> **Hướng dẫn dùng**: Đưa **TOÀN BỘ** file này cho AI code (Cursor, Claude Code, v0, hoặc Remotion AI agent). Mọi giá trị `frame in`, `frame out`, `text Vietnamese`, `color`, `font` đều phải tuân thủ chính xác — KHÔNG cho phép sáng tác thêm scene hoặc đổi text.

---

## 0. METADATA & TECHNICAL SPEC

| Property | Value |
|---|---|
| **Project name** | `hustlytasker-tour-vi` |
| **Tổng độ dài** | **120 giây (2 phút) = 3600 frames** |
| **FPS** | 30 |
| **Resolution** | 1920 × 1080 (Full HD, 16:9 landscape) |
| **Mục đích** | Đăng YouTube + landing page hustlytasker.xyz + demo khách hàng |
| **Ngôn ngữ** | Tiếng Việt (mọi text on-screen + voiceover) |
| **Audio** | Background music nhẹ + voiceover tiếng Việt (TTS OK) |
| **Format export** | MP4 H.264, 8 Mbps, AAC 192kbps |

---

## 1. FONT TIẾNG VIỆT (BẮT BUỘC ĐÚNG)

> **Quy tắc**: Mọi text on-screen phải dùng font có dấu tiếng Việt mượt, không vỡ chữ. Plus Jakarta Sans + Be Vietnam Pro là combo đẹp nhất cho startup pitch tiếng Việt — chính font đã được dùng trong các screenshot mockup section 3.

| Vai trò | Font | Weight | Use case |
|---|---|---|---|
| **Headline lớn** | `Plus Jakarta Sans` | 800 / 900 | Tiêu đề scene, số stats lớn |
| **Sub-headline** | `Plus Jakarta Sans` | 700 | Tiêu đề phụ, tab labels |
| **Body / Caption** | `Be Vietnam Pro` | 500 / 600 | Đoạn mô tả 2-3 dòng (dấu Việt mềm mại nhất) |
| **UI label** | `Plus Jakarta Sans` | 600 | Button text, status badges |
| **Numbers / KPI** | `Plus Jakarta Sans` | 900 (Black) | "18 agency", "34.230.640 đ" |

**Load trong Remotion** (BẮT BUỘC pattern này, KHÔNG dùng `<link rel>`):

```ts
// src/load-fonts.ts
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans"
import { loadFont as loadVietnam } from "@remotion/google-fonts/BeVietnamPro"

export const jakartaFont = loadJakarta("normal", {
    weights: ["500", "600", "700", "800", "900"],
    subsets: ["vietnamese", "latin"],  // BẮT BUỘC subset "vietnamese"
})
export const vietnamFont = loadVietnam("normal", {
    weights: ["400", "500", "600"],
    subsets: ["vietnamese", "latin"],
})
```

---

## 2. COLOR TOKEN (match brand HustlyTasker)

```ts
// src/theme.ts
export const COLORS = {
    bg: '#0A0A0A',
    bgGlass: 'rgba(10, 10, 10, 0.60)',
    bgGradient: 'radial-gradient(circle at 80% 0%, #2d1b5e 0%, #0A0A0A 60%)',
    accent: '#8B5CF6',                       // Violet primary
    accentGlow: 'rgba(139, 92, 246, 0.45)',
    accentLight: '#A78BFA',
    success: '#34D399',                       // Emerald
    warning: '#F59E0B',                       // Amber
    danger: '#EF4444',                        // Red
    textPrimary: '#E4E4E7',
    textSecondary: '#A1A1AA',
    textMuted: '#71717A',
    border: 'rgba(139, 92, 246, 0.18)',
    cardShadow: '0 24px 64px rgba(0, 0, 0, 0.50)',
} as const
```

---

## 3. ASSETS (✅ ĐÃ SẴN SÀNG — COPY VÀO PROJECT REMOTION)

### 3.1 — Screenshot PNG files (1920×1080)

Tất cả screenshots đã được render sẵn tại folder:

```
public/video-assets/screens/
```

| File asset | Đường dẫn đầy đủ | Scene dùng |
|---|---|---|
| **Dashboard admin** | `public/video-assets/screens/01-dashboard.png` | Scene 3 (Dashboard tour) |
| **Task Queue** | `public/video-assets/screens/02-task-queue.png` | Scene 4 (Workflow) |
| **Finance dual-currency** | `public/video-assets/screens/03-finance.png` | Scene 5 (Finance) |
| **Marketplace** | `public/video-assets/screens/04-marketplace.png` | Scene 6 (Marketplace) |
| **Velox Deep Scan v3.1** | `public/video-assets/screens/05-velox-scan.png` | Scene 7 (Velox) |
| **Create Task wizard** | `public/video-assets/screens/06-create-task.png` | Scene 4 (Tạo task) |
| **Client Portal** | `public/video-assets/screens/07-client-portal.png` | Scene 6 (Portal) |

**Source HTML** (nếu cần edit lại): `public/video-assets/mockups/0[1-7]-*.html` — đã match design system, font tiếng Việt đầy đủ.

### 3.2 — Logo

| File | Đường dẫn |
|---|---|
| `logo.svg` | `public/logo.svg` (đã tồn tại trong repo) |

### 3.3 — Audio (CẦN CHUẨN BỊ THÊM)

| File | Path target | Note |
|---|---|---|
| `bgm.mp3` | `public/video-assets/audio/bgm.mp3` | Lo-fi corporate 2 phút, royalty-free |
| `vo-vi.mp3` | `public/video-assets/audio/vo-vi.mp3` | Voiceover tiếng Việt từ script section 4 |
| `sfx-whoosh.mp3` | `public/video-assets/audio/sfx-whoosh.mp3` | Transition giữa scene |
| `sfx-ding.mp3` | `public/video-assets/audio/sfx-ding.mp3` | Khi xuất hiện text quan trọng |

**TTS gợi ý**: ElevenLabs Multilingual v2 (giọng Vietnamese), FPT.AI TTS (`https://fpt.ai/tts`), hoặc Google Cloud TTS giọng `vi-VN-Wavenet-A` (nữ Hà Nội).

---

## 4. VOICEOVER SCRIPT TIẾNG VIỆT (full, đã canh timing 2 phút)

> **Hướng dẫn TTS**: Tốc độ 1.0×, pause 0.5s giữa các đoạn. Tổng dài ~120 giây.

**[0:00 – 0:08]** *(Intro)*
> "HustlyTasker. Nền tảng quản lý công việc chuyên cho agency dựng video Talking Head."

**[0:08 – 0:20]** *(Pain points)*
> "Bốn mươi giờ một tháng cho admin task qua Excel và Zalo. Hai ngày đối chiếu lương đô-Việt. Bảy mươi phần trăm khách hàng nhắn hỏi tiến độ. Đây là cơn ác mộng của agency video editing."

**[0:20 – 0:38]** *(Dashboard)*
> "Đây là dashboard admin của HustlyTasker. Toàn bộ doanh thu, task, leaderboard editor — tất cả trên một màn hình. Workspace Tháng Năm đang track ba mươi tư triệu đồng, sáu mươi tư task hoàn tất."

**[0:38 – 0:58]** *(Tạo task + Workflow)*
> "Tạo task qua wizard năm bước, hoặc dùng Velox để tạo hàng loạt. Mỗi task đi qua mười một trạng thái chuyên biệt: Đang đợi giao, Nhận task, Đang thực hiện, Revision, Hoàn tất. Drag và drop để đổi cột, hệ thống tự clear deadline khi vào Revision."

**[0:58 – 1:15]** *(Finance)*
> "Tài chính song tiền tệ là điểm khác biệt cốt lõi. Mỗi task lưu cả giá client đô-la lẫn lương editor Việt Nam Đồng. Profit tính tự động theo tỷ giá realtime — margin sáu mươi mốt phần trăm cho workspace hiện tại."

**[1:15 – 1:32]** *(Marketplace + Portal)*
> "Marketplace cho phép editor tự nhận task thay vì admin gán cứng. Khách hàng quốc tế xem tiến độ qua portal riêng, hỗ trợ năm ngôn ngữ. Client không bao giờ thấy lương editor — bảo mật tuyệt đối."

**[1:32 – 1:52]** *(Velox v3.1)*
> "Velox phiên bản ba chấm một. Paste link Dropbox, hệ thống quét sâu bốn cấp, nhận diện bảy pattern thư mục, tự pair Body với Hooks, tự gán B-Roll, tự tính giá. Mười phút thủ công, giờ chỉ còn ba mươi giây."

**[1:52 – 2:00]** *(Closing)*
> "HustlyTasker chấm xyz. Được xây riêng cho ngành dựng video. Bắt đầu hôm nay."

---

## 5. SCENE-BY-SCENE BREAKDOWN (8 scene, 3600 frames)

> Mọi animation dùng `interpolate()` hoặc `spring()` của Remotion. Easing mặc định `Easing.out(Easing.cubic)`.

### SCENE 01 — Intro / Logo Reveal
- **Time**: 0:00 – 0:08 → frame `0` → `240` (8s)
- **Background**: `bgGradient` (radial từ top-right `#2d1b5e` fade về `#0A0A0A`)
- **Asset dùng**: `public/logo.svg`
- **Elements**:
  - Logo SVG center, size 200×200px
  - Logo scale từ `0.6` → `1.0` qua frame `0-45` với `spring({ damping: 12, stiffness: 100 })`
  - Glow `box-shadow: 0 0 80px rgba(139,92,246,0.6)` từ frame `30`
  - Headline frame `75-240`:
    > **"HustlyTasker"** — `Plus Jakarta Sans 900`, size 84px, `#E4E4E7`, fade-up 40px → 0
    > *"Quản lý chuyên cho Video Agency"* — `Be Vietnam Pro 500`, size 28px, `#A1A1AA`
- **Ambient**: 5 violet "orbs" float chậm (`GlowOrb` blur 80px opacity 0.15)
- **Audio**: BGM fade-in 0 → -20dB qua 45 frames; SFX `whoosh` frame `0`
- **Voiceover**: bắt đầu frame `30`

### SCENE 02 — Pain Points
- **Time**: 0:08 – 0:20 → frame `240` → `600` (12s)
- **Background**: `#0A0A0A` solid + grain mờ
- **Layout**: 3 cards horizontal centered, mỗi card 460×340px, padding 32px, `bgGlass`, border `rgba(139,92,246,0.15)`, border-radius 24px
- **Cards** (stagger 40 frames apart):
  - **Card 1** (frame `255-295` slide từ left -200 → 0):
    - Icon emoji 📋⚡ size 56px
    - Title "Quản lý rời rạc" — `Plus Jakarta Sans 700`, 30px, `#E4E4E7`
    - Body "Excel + Trello + Zalo, không biết task ở đâu" — `Be Vietnam Pro 500`, 18px, `#A1A1AA`
    - Stat "**40+ giờ/tháng**" — `Plus Jakarta Sans 900`, 44px, `#F59E0B`
  - **Card 2** (frame `295-335`):
    - Icon 💰❓ + "Tài chính chaos" + "USD/VND tính tay, sai 5-10%" + "**2-3 ngày** đối chiếu"
  - **Card 3** (frame `335-375`):
    - Icon 💬⏳ + "Client không thấy" + "Nhắn hỏi mỗi tuần" + "**70%** client"
- **Audio**: SFX `ding` khi mỗi card xuất hiện
- **Bottom text** (frame `400-600`):
  > "Đây là cơn ác mộng của agency video editing." — `Be Vietnam Pro 600`, 22px, `#71717A`, fade-up

### SCENE 03 — Dashboard Tour ⭐ (ASSET CHÍNH)
- **Time**: 0:20 – 0:38 → frame `600` → `1140` (18s)
- **Asset dùng**: `public/video-assets/screens/01-dashboard.png`
- **Layout**: Screenshot full-bleed, scale 0.9, center
- **Animation**:
  - Screenshot xuất hiện frame `600-630` fade-in + scale 1.05 → 0.9
  - Ken Burns effect: scale 0.9 → 0.92 từ frame `630-1140` (subtle zoom)
  - 3 callout chips stagger, point vào UI bằng SVG arrow:
    - Frame `720`: chip **"Doanh thu 34M đ"** → arrow trỏ vào "Gross Revenue" card top-left
    - Frame `840`: chip **"Leaderboard editors"** → arrow trỏ podium right
    - Frame `960`: chip **"15 modules đa năng"** → arrow trỏ sidebar
  - Mỗi callout: glass chip + SVG arrow line vẽ animation `strokeDashoffset` (1s reveal)
  - Caption bottom-center (frame `1020-1140`):
    > "Một màn hình — toàn bộ workspace" — `Plus Jakarta Sans 700`, 28px

### SCENE 04 — Tạo Task + Workflow (DUAL SCREENSHOT)
- **Time**: 0:38 – 0:58 → frame `1140` → `1740` (20s)
- **Assets dùng**:
  - `public/video-assets/screens/06-create-task.png` (frame `1140-1380`)
  - `public/video-assets/screens/02-task-queue.png` (frame `1380-1740`)
- **Phần 1 — Create Task wizard** (8s, frame `1140-1380`):
  - Screenshot create-task center, scale 0.85
  - Highlight pulse trên Step 2/5 indicator
  - Callout chip frame `1200`: **"Wizard 5 bước"** + arrow vào stepper
  - Callout frame `1290`: **"🚀 Velox auto-fill"** + arrow vào field "Tiêu đề task" có badge VELOX
- **Phần 2 — Task Queue 11 statuses** (12s, frame `1380-1740`):
  - Screenshot task-queue scale 0.9
  - 5 status badge labels animated zoom-in từ table:
    - "Đang đợi giao" violet (frame `1410-1470`)
    - "Đang thực hiện" indigo (frame `1470-1530`)
    - "Revision" red (frame `1530-1590`)
    - "Quá hạn" red dark (frame `1590-1650`)
    - "Hoàn tất" emerald (frame `1650-1710`)
  - Mỗi badge fade-in + scale 0.8 → 1.0 + glow pulse 1 lần
  - Bottom caption (frame `1620-1740`):
    > "**11 trạng thái** chuyên cho video editing" — `Plus Jakarta Sans 800`, 32px, `#A78BFA`

### SCENE 05 — Finance Dual Currency
- **Time**: 0:58 – 1:15 → frame `1740` → `2250` (17s)
- **Asset dùng**: `public/video-assets/screens/03-finance.png`
- **Animation**:
  - Screenshot scale 0.85, center, xuất hiện frame `1740-1780` fade + slide-up 30px
  - 3 KPI numbers count-up animation:
    - **34.230.640 đ** count 0 → 34M qua frame `1810-1900` (`#A78BFA`)
    - **13.146.420 đ** count 0 → 13M qua frame `1900-1990` (`#E4E4E7`)
    - **21.084.220 đ** count 0 → 21M qua frame `1990-2080` (`#34D399`)
  - Callout frame `2110`: chip **"Margin 61.6%"** với check icon glow `#34D399`
  - Highlight pulse trên formula box (frame `2160`): formula "Profit = (jobPriceUSD × exchangeRate) − wageVND"
  - Caption bottom (frame `2160-2250`):
    > "Tỷ giá realtime · Profit auto-calc" — `Plus Jakarta Sans 700`, 26px

### SCENE 06 — Marketplace + Client Portal (SPLIT SCREEN)
- **Time**: 1:15 – 1:32 → frame `2250` → `2760` (17s)
- **Assets dùng**:
  - `public/video-assets/screens/04-marketplace.png` (LEFT half)
  - `public/video-assets/screens/07-client-portal.png` (RIGHT half)
- **Animation**:
  - Frame `2250-2280`: cả 2 screenshot slide-in từ ngoài viewport (marketplace từ trái, portal từ phải)
  - Mỗi screenshot scale 0.55, position cho 2 side-by-side
  - Tiêu đề top:
    - LEFT: **"Marketplace"** label + sub "Editor tự nhận task" — `#A78BFA`
    - RIGHT: **"Client Portal"** label + sub "5 ngôn ngữ" — `#34D399`
  - Frame `2400`: 5 flag chips bay từ corner phải xuất hiện over portal screenshot (🇬🇧 🇮🇹 🇷🇺 🇻🇳 🇨🇳), stagger 15 frames each
  - Frame `2580`: callout chip giữa 2 screenshots: **"Editor + Client cách ly tuyệt đối"** với lock icon
  - Caption bottom (frame `2640-2760`):
    > "**Không có ở Trello/Asana**" — `Plus Jakarta Sans 800`, 30px, `#F59E0B`

### SCENE 07 — Velox v3.1 Deep Scan ⭐⭐ HIGHLIGHT MẠNH NHẤT
- **Time**: 1:32 – 1:52 → frame `2760` → `3360` (20s)
- **Asset dùng**: `public/video-assets/screens/05-velox-scan.png`
- **Animation**:
  - Frame `2760-2790`: heading "Velox v3.1" — `Plus Jakarta Sans 900`, 120px, gradient text `#8B5CF6 → #d946ef`, scale-in spring
  - Frame `2810-2860`: subtitle "Deep Scan · 4 cấp folder · 7 pattern" — `Be Vietnam Pro 600`, 28px, `#A1A1AA`
  - Frame `2880`: Screenshot velox-scan xuất hiện, scale 0.85, center
  - Highlight pulses sequential (mỗi pulse 1s = 30 frames):
    - Frame `2910`: highlight URL input box ("paste Dropbox link")
    - Frame `2970`: highlight Pattern banner "P4 · Body+Hooks Pair · 92% confidence"
    - Frame `3030`: highlight folder tree pane (depth 4 với tags)
    - Frame `3090`: highlight tasks pane (4 tasks generated)
    - Frame `3150`: highlight "Áp dụng vào form" button (CTA emerald)
  - Bottom counter animation (frame `3180-3300`):
    - Số "10 phút" (red, struck-through) → arrow → **"30 giây"** (emerald, glow)
    - `Plus Jakarta Sans 900`, 56px

### SCENE 08 — Closing + CTA
- **Time**: 1:52 – 2:00 → frame `3360` → `3600` (8s)
- **Background**: `bgGradient` đậm nhất + 8 violet orbs xoay chậm
- **Asset dùng**: `public/logo.svg`
- **Elements**:
  - Frame `3360-3420`: Logo HustlyTasker scale 0 → 1.5, center top, với glow violet 60px
  - Frame `3420-3480`: Headline **"Hệ điều hành cho Video Agency"** — `Plus Jakarta Sans 800`, 56px, `#E4E4E7`, fade-up
  - Frame `3480-3540`: URL chip glow **"hustlytasker.xyz"** — `Plus Jakarta Sans 700`, 42px, `#8B5CF6`, border violet, padding 16px 48px, border-radius 999, pulse animation (scale 1.0 ↔ 1.05 mỗi 60 frames)
  - Frame `3540-3600`: outro micro-text "Built for Talking Head Editors · Powered by Vietnam." — `Be Vietnam Pro 400`, 20px, `#71717A`, fade-in opacity 0 → 1
- **Audio**: BGM fade-out -20dB → silence qua frame `3540-3600`

---

## 6. ANIMATION PATTERNS (BẮT BUỘC tái sử dụng)

### 6.1 — Fade-up reveal
```ts
const opacity = interpolate(frame, [start, start + 30], [0, 1], { extrapolateRight: 'clamp' })
const translateY = interpolate(frame, [start, start + 30], [40, 0], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
```

### 6.2 — Spring scale-in
```ts
const scale = spring({ frame: frame - start, fps, config: { damping: 12, stiffness: 100 } })
```

### 6.3 — Count-up number
```ts
const value = interpolate(frame, [start, start + 90], [0, finalValue], { extrapolateRight: 'clamp' })
return <span>{Math.floor(value).toLocaleString('vi-VN')}</span>
```

### 6.4 — Stagger children
```ts
{items.map((item, i) => (
    <Sequence from={start + i * 30} key={i}><Card {...item} /></Sequence>
))}
```

### 6.5 — Pulse glow (CTA, highlight)
```ts
const pulseScale = 1 + 0.05 * Math.sin((frame / 60) * Math.PI * 2)
const pulseOpacity = 0.5 + 0.3 * Math.sin((frame / 60) * Math.PI * 2)
```

### 6.6 — Ken Burns slow zoom (screenshot)
```ts
const scale = interpolate(frame, [start, end], [0.9, 0.92], { extrapolateRight: 'clamp' })
```

### 6.7 — Callout arrow SVG reveal
```ts
const arrowLength = 200
const dashOffset = interpolate(frame, [start, start + 30], [arrowLength, 0])
<line strokeDasharray={arrowLength} strokeDashoffset={dashOffset} />
```

---

## 7. SCREENSHOT FRAME COMPONENT (browser mockup wrap)

```tsx
// src/components/ScreenshotFrame.tsx
import { Img, staticFile } from 'remotion'

export const ScreenshotFrame: React.FC<{ src: string; scale?: number }> = ({ src, scale = 1 }) => (
    <div style={{
        transform: `scale(${scale})`,
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid rgba(139, 92, 246, 0.25)',
        boxShadow: '0 40px 100px rgba(0, 0, 0, 0.60)',
    }}>
        <div style={{
            background: '#1a1a1a', padding: '12px 16px',
            display: 'flex', gap: 8, alignItems: 'center',
        }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: '#EF4444' }} />
            <div style={{ width: 12, height: 12, borderRadius: 6, background: '#F59E0B' }} />
            <div style={{ width: 12, height: 12, borderRadius: 6, background: '#34D399' }} />
            <div style={{
                flex: 1, marginLeft: 16, height: 24,
                background: '#0A0A0A', borderRadius: 6,
                display: 'flex', alignItems: 'center', padding: '0 12px',
                color: '#71717A', fontSize: 13, fontFamily: 'Plus Jakarta Sans',
            }}>hustlytasker.xyz</div>
        </div>
        <Img src={staticFile(src)} style={{ display: 'block', width: '100%' }} />
    </div>
)
```

**Cách dùng trong scene**:
```tsx
<ScreenshotFrame src="video-assets/screens/01-dashboard.png" scale={0.9} />
```

---

## 8. CẤU TRÚC REMOTION PROJECT (BẮT BUỘC)

```
hustlytasker-tour-vi/
├── public/
│   ├── logo.svg                    ← copy từ project hiện tại
│   └── video-assets/
│       ├── screens/                ← copy 7 PNG từ section 3.1
│       │   ├── 01-dashboard.png
│       │   ├── 02-task-queue.png
│       │   ├── 03-finance.png
│       │   ├── 04-marketplace.png
│       │   ├── 05-velox-scan.png
│       │   ├── 06-create-task.png
│       │   └── 07-client-portal.png
│       └── audio/                  ← cần tự chuẩn bị
│           ├── bgm.mp3
│           ├── vo-vi.mp3
│           ├── sfx-whoosh.mp3
│           └── sfx-ding.mp3
├── src/
│   ├── Root.tsx
│   ├── Video.tsx
│   ├── load-fonts.ts
│   ├── theme.ts
│   ├── scenes/
│   │   ├── 01-Intro.tsx            (frames 0-240)
│   │   ├── 02-PainPoints.tsx       (frames 240-600)
│   │   ├── 03-Dashboard.tsx        (frames 600-1140)
│   │   ├── 04-CreateAndQueue.tsx   (frames 1140-1740)
│   │   ├── 05-Finance.tsx          (frames 1740-2250)
│   │   ├── 06-MarketplacePortal.tsx (frames 2250-2760)
│   │   ├── 07-VeloxDeepScan.tsx    (frames 2760-3360)
│   │   └── 08-Closing.tsx          (frames 3360-3600)
│   └── components/
│       ├── GlassCard.tsx
│       ├── ScreenshotFrame.tsx
│       ├── AnimatedNumber.tsx
│       ├── CalloutChip.tsx
│       ├── ArrowSVG.tsx
│       ├── KineticText.tsx
│       └── GlowOrb.tsx
├── remotion.config.ts
├── package.json
└── tsconfig.json
```

---

## 9. ROOT COMPOSITION

```tsx
// src/Root.tsx
import { Composition } from 'remotion'
import { Video } from './Video'

export const RemotionRoot: React.FC = () => (
    <Composition
        id="hustlytasker-tour-vi"
        component={Video}
        durationInFrames={3600}     // 2 phút @ 30fps
        fps={30}
        width={1920}
        height={1080}
    />
)
```

```tsx
// src/Video.tsx
import { AbsoluteFill, Sequence, Audio, staticFile } from 'remotion'
import * as Scenes from './scenes'

export const Video: React.FC = () => (
    <AbsoluteFill style={{ background: '#0A0A0A' }}>
        <Audio src={staticFile('video-assets/audio/bgm.mp3')} volume={0.12} />
        <Audio src={staticFile('video-assets/audio/vo-vi.mp3')} volume={1.0} />

        <Sequence from={0} durationInFrames={240}><Scenes.Intro /></Sequence>
        <Sequence from={240} durationInFrames={360}><Scenes.PainPoints /></Sequence>
        <Sequence from={600} durationInFrames={540}><Scenes.Dashboard /></Sequence>
        <Sequence from={1140} durationInFrames={600}><Scenes.CreateAndQueue /></Sequence>
        <Sequence from={1740} durationInFrames={510}><Scenes.Finance /></Sequence>
        <Sequence from={2250} durationInFrames={510}><Scenes.MarketplacePortal /></Sequence>
        <Sequence from={2760} durationInFrames={600}><Scenes.VeloxDeepScan /></Sequence>
        <Sequence from={3360} durationInFrames={240}><Scenes.Closing /></Sequence>
    </AbsoluteFill>
)
```

---

## 10. RENDER COMMAND

```bash
# Setup
npx create-video@latest --template=blank hustlytasker-tour-vi
cd hustlytasker-tour-vi
npm install @remotion/google-fonts

# Copy assets từ HustlyTasker repo
# cp -r ../path/to/cranky-austin/public/video-assets ./public/
# cp ../path/to/cranky-austin/public/logo.svg ./public/

# Preview interactive
npx remotion preview

# Production render
npx remotion render hustlytasker-tour-vi out/hustlytasker-tour-vi.mp4 \
    --codec=h264 --crf=18 \
    --pixel-format=yuv420p \
    --audio-codec=aac --audio-bitrate=192k \
    --concurrency=4
```

---

## 11. QUALITY CHECKLIST trước khi export

- [ ] 7 PNG screenshot ở `public/video-assets/screens/` đầy đủ
- [ ] Logo `public/logo.svg` load OK (không vỡ icon)
- [ ] Plus Jakarta Sans + Be Vietnam Pro load thành công với `subsets: ["vietnamese"]`
- [ ] Mọi text tiếng Việt hiển thị đúng dấu (kiểm `Tháng`, `Đặng`, `Việt`, `dụng`, `Hoàn tất`, `Đang đợi giao`)
- [ ] Color theme đúng `#8B5CF6` violet, `#34D399` emerald, `#0A0A0A` background
- [ ] Voiceover khớp timing scene (kiểm từng `Sequence from=…`)
- [ ] Tổng duration = 3600 frames = 2:00 chuẩn (không over/under)
- [ ] Audio: BGM `-20dB`, Voiceover `0dB`, SFX `-15dB`
- [ ] Không có flash trắng đột ngột (mọi scene transition smooth)

---

## 12. FALLBACK & EDGE CASES

- **Font không load** → fallback `'Plus Jakarta Sans', 'Inter', 'Segoe UI', sans-serif`. KHÔNG dùng `Arial` (xấu với dấu Việt).
- **PNG bị mờ khi scale** → đã render @ 1.5× device pixel ratio, scale lên đến 1.0 vẫn crisp.
- **Voiceover lag** → tăng `audioBitrate` lên `320k`.
- **Render timeout** → chia 3 chunks (intro / mid / outro), render riêng, concat bằng `ffmpeg -f concat -i list.txt`.
- **Cần edit lại mockup** → sửa file HTML tại `public/video-assets/mockups/*.html`, chạy lại `npx tsx scripts/screenshot-video-mockups.ts` để re-render PNG.

---

## 13. PHIÊN BẢN RÚT GỌN (45 giây cho Reels/Shorts)

Nếu cần version social media, giữ scenes theo thứ tự ưu tiên:
1. ⭐ Scene 01 (8s) — Logo intro
2. ⭐ Scene 07 (15s, cắt từ 20s) — Velox v3.1 highlight
3. ⭐ Scene 03 (8s, cắt từ 18s) — Dashboard tour
4. ⭐ Scene 05 (8s, cắt từ 17s) — Finance dual-currency
5. ⭐ Scene 08 (6s) — Closing + CTA

Total: 45s = 1350 frames. Skip scenes 02, 04, 06.

---

**END OF BRIEF**

> **Quick start cho AI agent**: "Đọc toàn bộ file `HUSTLYTASKER-VIDEO-BRIEF.md`. Tạo Remotion project mới theo cấu trúc section 8. Copy 7 PNG từ `public/video-assets/screens/` vào project. Mọi frame number, color hex, font weight, text Vietnamese phải khớp 100% với spec. Render thành `out/hustlytasker-tour-vi.mp4` bằng command section 10."
