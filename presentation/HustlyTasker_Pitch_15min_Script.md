# HustlyTasker — Pitch Deck Script (15 phút)

> **Mục đích**: Slide-by-slide content cho buổi thuyết trình EXE101 — startup idea pitch.
> **Audience**: Giảng viên + 5-6 nhóm lớp.
> **Time budget**: 15 phút (~1.1 phút/slide × 13 slides + buffer Q&A).
> **Visual style**: Dark glassmorphism — match brand HustlyTasker.

---

## Brand & Style Reference (cho designer team)

### Color palette
- **Background main**: `#0A0A0A` chuyển radial gradient sang `#1a0e3e` ở góc top-right (violet glow)
- **Glass card**: nền `rgba(10,10,10,0.60)` + `backdrop-filter: blur(20px)` + border `1px solid rgba(139,92,246,0.15)`
- **Accent violet**: `#8B5CF6` (primary highlight, key numbers, CTAs)
- **Gradient violet → fuchsia**: `linear-gradient(135deg, #8B5CF6, #d946ef)` cho hero headlines
- **Success emerald**: `#34D399` (positive stats, ✅ checkmarks)
- **Warning amber**: `#F59E0B` (pain points)
- **Danger red**: `#EF4444` (competitor weakness ❌)
- **Text primary**: `#E4E4E7` (zinc-200) — body text
- **Text secondary**: `#A1A1AA` (zinc-400) — captions, labels
- **Text muted**: `#71717A` (zinc-500) — footers, fine print

### Typography
| Use case | Font | Weight | Size |
|---|---|---|---|
| Slide main title (hero) | Plus Jakarta Sans | ExtraBold 800 | 60-72pt |
| Section title | Plus Jakarta Sans | Bold 700 | 36-44pt |
| Body text | Plus Jakarta Sans | Regular 400 | 18-22pt |
| Caption / footer | Plus Jakarta Sans | Medium 500 | 12-14pt |
| Stat numbers (hero) | Plus Jakarta Sans | Black 900 | 80-96pt + violet glow |

### Component library
- **Glass card**: padding 32-48px, border-radius 24px, box-shadow `0 24px 64px rgba(0,0,0,0.5)`
- **Stat hero**: số to ở giữa, có glow `text-shadow: 0 0 32px rgba(139,92,246,0.6)`, label nhỏ phía dưới
- **Icon**: Lucide React style — outline stroke 1.5px, size 24-32px, color match context

---

# SLIDES

---

## 🎬 SLIDE 1 — Cover

### Visual layout
- **Background**: Radial gradient từ `#2d1b5e` (top-right corner) → `#0A0A0A` (bottom-left)
- **Center**: Logo HustlyTasker (256×256px) + pulse glow violet
- **Title (below logo, centered)**: "**HustlyTasker**" — ExtraBold 80pt, gradient text violet → fuchsia
- **Tagline**: *"Nền tảng quản lý công việc dành riêng cho Video Agency"* — Medium 22pt, color zinc-400
- **Footer (bottom centered)**: Tên nhóm · Môn EXE101 · Kỳ X / Năm 20XX — 14pt, zinc-500

### Speaker note (verbal hook)
*"Tưởng tượng — bạn là chủ một agency video editing nhỏ với 5 editor, 10 client quốc tế, làm 20 video/tháng cho mỗi client. Mỗi tháng bạn đang mất bao nhiêu giờ chỉ để admin task, đối chiếu payroll, và trả lời tin nhắn client?"*

*"Hôm nay nhóm chúng tôi muốn giới thiệu HustlyTasker — câu trả lời cho câu hỏi đó."*

---

## 💸 SLIDE 2 — The Hidden Cost of "Just Managing"

### Visual layout
- **Title**: *"3 con số khiến mọi agency video editing đau đầu"* — Bold 36pt, centered
- **3 stat cards** (horizontal row, glass cards):

| Card 1 (left) | Card 2 (center) | Card 3 (right) |
|---|---|---|
| **40+ giờ/tháng** (violet glow) | **2-3 ngày** (amber glow) | **70%** (red glow) |
| Label: *"Admin task thủ công"* | Label: *"Đối chiếu payroll cuối tháng"* | Label: *"Client nhắn tin hỏi tiến độ ≥1 lần/tuần"* |
| Caption: *"Excel + Zalo + Trello"* | Caption: *"USD ↔ VND khớp 95%"* | Caption: *"Multi-language gap"* |

- **Background detail**: subtle "calculator + clock" icons mờ phía sau cards

### Speaker note
*"Đây không phải con số chúng tôi tưởng tượng — đây là phỏng vấn 5 agency Việt Nam real. 40 giờ chỉ riêng cho admin việc — đó là 1 tuần làm việc bị đốt mỗi tháng."*

*"Và đó là pain points chúng tôi sẽ đào sâu trong 3 slide tiếp theo."*

---

## 🔥 SLIDE 3 — 3 Pain Points cốt lõi

### Visual layout
- **Title**: *"Vì sao agency video editing đang khổ?"* — Bold 36pt
- **3 columns equal width**, mỗi column glass card:

**Column 1 — Pain 1: Quản lý task rời rạc**
- Icon: 📋⚡ (clipboard + lightning, amber tint)
- Headline: *"Excel + Zalo + Trello — chắp vá"*
- Body: Admin phải hỏi từng editor để biết task đang ở bước nào. Thông tin tản mác ở 3-4 chỗ. Dễ sót task, miss deadline.
- Stat box: **"1.5 giờ/ngày"** *chỉ để track status*

**Column 2 — Pain 2: Tài chính song tiền tệ chaos**
- Icon: 💰❓ (money + question mark, amber tint)
- Headline: *"USD client, VND editor — 2 file Excel khác nhau"*
- Body: Client trả USD, editor lương VND. Tỷ giá thay đổi, profit margin mơ hồ. Đối chiếu mất 2-3 ngày, sai số 5-10%.
- Stat box: **"5-10%"** *sai số payroll mỗi tháng*

**Column 3 — Pain 3: Client không thấy tiến độ**
- Icon: 💬⏳ (speech bubble + hourglass, amber tint)
- Headline: *"Client quốc tế chờ trong vô vọng"*
- Body: Không có nơi tập trung xem progress. Rào cản ngôn ngữ Việt-Anh-Trung. Admin spend hàng giờ reply DM.
- Stat box: **"70%"** *client nhắn ≥1 lần/tuần*

- **Bottom banner**: *"Đây là câu chuyện của hàng ngàn agency video editing Việt Nam"* — italic, centered

### Speaker note
*"Chúng tôi không invent ra problem — chúng tôi nghe thấy từ chính các agency. 3 cái này gộp lại là tại sao họ không scale được. Họ stuck ở 5-10 editor mãi vì admin overhead nuốt mất giờ growth."*

---

## ✨ SLIDE 4 — Solution: HustlyTasker là gì?

### Visual layout
- **Title**: *"HustlyTasker — Nền tảng SaaS chuyên biệt cho Video Agency"* — Bold 36pt
- **Hero positioning** (centered, glass card lớn):
   > *"Như **Asana + Frame.io + QuickBooks** gộp lại, build **riêng cho Talking Head Video Editing**."*

- **3 value props** (3 cards bên dưới):

| Card | Icon | Title | Body |
|---|---|---|---|
| 1 | 🎯 | **Chuyên biệt** | Workflow + pricing logic riêng cho video editing — không phải tool chung chung |
| 2 | 💱 | **Dual-currency native** | Theo dõi USD/VND song song, auto-payroll, profit margin real-time |
| 3 | 🌐 | **Multi-role visibility** | Admin / Editor / Client view khác nhau, đa ngôn ngữ |

- **Footer hint**: nhỏ, italic — *"Khác mọi platform hiện có ở chỗ chúng tôi không serve tất cả — chúng tôi serve sâu cho 1 niche."*

### Speaker note
*"Chúng tôi không build cho mọi agency — chúng tôi build CHO agency dựng video talking head. Niche fit là moat lớn nhất của chúng tôi. Khi Trello cố làm cho 1000 ngành nghề, chúng tôi đi sâu vào 1 ngành."*

---

## 🚀 SLIDE 5 — Điểm khác biệt cốt lõi

### Visual layout
- **Title**: *"4 thứ làm HustlyTasker khác mọi tool hiện có"* — Bold 36pt
- **2×2 grid** (4 glass cards):

**Card 1 (top-left) — Specialized Workflow**
- Icon: 📊 (chart up)
- Headline: *"11-stage task lifecycle"*
- Body: Workflow chi tiết riêng cho video editing — không phải 3-4 cột chung. Auto-detect quá hạn, status history đầy đủ.
- Tag: *"Built-in"*

**Card 2 (top-right) — Task Marketplace**
- Icon: 🏪 (storefront)
- Headline: *"Editor tự nhận task"*
- Body: Pattern UX độc đáo. Admin bật chế độ Marketplace → editor pick task ưa thích → tự động assign. Tiết kiệm thời gian admin + công bằng.
- Tag: *"Unique to HustlyTasker"*

**Card 3 (bottom-left) — Smart Automation**
- Icon: ⚡ (lightning)
- Headline: *"AI-driven batch automation"*
- Body: Tạo task hàng loạt qua intelligent automation engine. Tự phân loại Short/Long form, tự tính giá theo rule, tự gán editor. 1 click thay vì N bước manual.
- Tag: *"Differentiated"*

> **⚠️ DESIGNER NOTE**: KHÔNG mention "paste link Dropbox/Google Drive" hay bất kỳ cloud provider. Chỉ "intelligent automation engine".

**Card 4 (bottom-right) — Built-in Finance**
- Icon: 💰 (money bag)
- Headline: *"Native dual-currency + auto-payroll"*
- Body: USD/VND tracking + profit margin per-task + auto-generate invoice. Trello/Asana cần plugin trả phí thêm $20-50/user/tháng.
- Tag: *"Built-in"*

### Speaker note
*"4 cái này — riêng từng cái thì Trello, Asana, Monday, Frame.io đều có vài cái. Nhưng KHÔNG ai có cả 4 cùng lúc và build sâu cho niche video editing. Đây là moat."*

*"Đặc biệt Marketplace concept — chưa tool nào có. Editor tự pick task họ giỏi → quality work tốt hơn, admin tiết kiệm giờ matching manual."*

---

## 📊 SLIDE 6 — Target Market Size

### Visual layout
- **Title**: *"Thị trường lớn cỡ nào?"* — Bold 36pt
- **3 nested circles** (TAM > SAM > SOM):

```
        ╔════════════════════════════════════════╗
        ║   TAM — Global Video Editing Software   ║
        ║              $4.3B USD                   ║
        ║         CAGR 6.2% (2024-2030)            ║
        ║                                          ║
        ║   ╔════════════════════════════════╗    ║
        ║   ║ SAM — Talking head editing     ║    ║
        ║   ║   agencies in SEA: ~$150M       ║    ║
        ║   ║                                  ║    ║
        ║   ║   ╔════════════════════════╗   ║    ║
        ║   ║   ║ SOM — VN agency phục   ║   ║    ║
        ║   ║   ║ vụ client quốc tế:     ║   ║    ║
        ║   ║   ║      ~$15M Year 1       ║   ║    ║
        ║   ║   ╚════════════════════════╝   ║    ║
        ║   ╚════════════════════════════════╝    ║
        ╚════════════════════════════════════════╝
```

- **Source citation** (footer): *"Market data: Grand View Research, Statista 2024 — Video Editing Software Market Report"*
- **Tagline insight**: *"Niche nhưng KHÔNG nhỏ — 1% market share = $1.5M MRR potential"*

### Speaker note
*"Đây là conservative estimate. Riêng VN có ~500-1000 agency video editing nhỏ-vừa. Globally talking head editing đang boom vì YouTube Shorts/TikTok/podcast. Chúng tôi target con cá vừa, không chạy đua cá voi."*

---

## 👥 SLIDE 7 — Target Customer Personas

### Visual layout
- **Title**: *"Chúng tôi serve ai? — 3 personas"* — Bold 36pt
- **3 persona cards** (vertical or horizontal layout):

**Persona 1 — Agency Owner (Admin)**
- Avatar: 🧑‍💼 (round, violet border)
- Name: *"Anh Hùng, 32 tuổi — chủ agency 'Cinematic Studio'"*
- Quote (italic): *"Tôi quản lý 10 editors, 15 clients quốc tế. Hàng tháng mất 40+ giờ vào admin việc thay vì grow business."*
- Jobs-to-be-done:
   - ✅ Quản lý 50+ task/tháng không sót
   - ✅ Tính lương 10 editor không sai
   - ✅ Báo cáo profit margin cho investor
- Pricing tier match: **Pro $29/mo**

**Persona 2 — Freelance Editor (User)**
- Avatar: 🎬 (round, indigo border)
- Name: *"Bạn Linh, 24 tuổi — freelance editor 3 năm"*
- Quote: *"Tôi muốn biết task nào ưu tiên, được nhận task mình giỏi nhất, lương ra sao."*
- Jobs-to-be-done:
   - ✅ Xem deadline + priority rõ ràng
   - ✅ Tự nhận task phù hợp năng lực (Marketplace)
   - ✅ Tracking lương real-time
- Pricing tier match: **Included in Pro**

**Persona 3 — Content Creator (Client)**
- Avatar: 🎤 (round, emerald border)
- Name: *"Mark, 28 — YouTuber 500K subs, thuê agency edit"*
- Quote: *"I just want to see progress without sending DMs everyday."*
- Jobs-to-be-done:
   - ✅ Xem tiến độ video tự service
   - ✅ Nhận file hoàn thành đa ngôn ngữ
   - ✅ Trust visibility — không cần spam tin nhắn
- Pricing tier match: **Free via Client Portal**

- **Bottom takeaway**: *"Khác Trello/Asana — chúng tôi serve cả 3 personas cùng lúc trên 1 platform, không phải 1."*

### Speaker note
*"Đây là 3 personas thật chúng tôi đã phỏng vấn. Mỗi người có pain riêng nhưng họ cùng chung 1 ecosystem. Sản phẩm của chúng tôi gắn kết cả 3 — admin tạo task → editor nhận → client review. End-to-end."*

---

## 🌟 SLIDE 8 — Why Us, Why Now?

### Visual layout
- **Title**: *"Tại sao là chúng tôi? Tại sao là LÚC NÀY?"* — Bold 36pt
- **2 columns** (50/50 split):

**Column trái — Why NOW (Market Timing)**
- Headline: *"Thị trường đang chín muồi"*
- 3 bullet points (mỗi cái 1 icon + 1 line):
   - 📈 **YouTube Shorts + TikTok + Reels boom** — demand talking head edit tăng 200% từ 2022
   - 🎙️ **80% top YouTubers/Podcasters** dùng talking head format
   - 🌏 **VN agency tăng nhanh** — phục vụ client US/UK/AU với lợi thế chi phí

**Column phải — Why US (Our Edge)**
- Headline: *"Tại sao chúng tôi build được"*
- 3 bullet points:
   - 👥 **Founder team có lived experience** — background video editing thực tế
   - 🧪 **Validation đã có** — **18 agency** thật đang test MVP với **23+ users**, **35+ workspaces**
   - 🎯 **Niche advantage** — đi sâu 1 ngành, không phân tâm 1000 ngành

- **Bottom big number bar**: 3 stats side-by-side
   - **18 agency** • **23+ users** • **35+ workspaces** — *"Đã có sẵn"*

### Speaker note
*"18 agency real đang test MVP — đây không phải concept slide. Chúng tôi đã build và đã có user. Validation đã có. Slide tiếp theo sẽ nói về revenue model."*

---

## 💵 SLIDE 9 — Revenue Streams (5 nguồn doanh thu)

### Visual layout
- **Title**: *"Doanh thu đến từ đâu? — 5 nguồn doanh thu"* — Bold 36pt
- **5 cards** (3 trên + 2 dưới, mỗi card có % portion estimate):

**Card 1 — SaaS Subscription** *(Core ~60%)*
- Icon: 🔄 (subscription)
- Body: Phí thuê bao theo tháng/năm, scale theo workspace + member count. Recurring revenue chính.
- Mini badge: **"Recurring"**

**Card 2 — Premium Add-ons** *(~20%)*
- Icon: ⭐ (star/premium)
- Body: AI analytics, custom reports, advanced finance forecasting, integration extensions.
- Mini badge: **"Upsell"**

**Card 3 — Marketplace Fee** *(~10%)*
- Icon: 🤝 (handshake)
- Body: Phần trăm nhỏ trên task assigned cross-agency qua Marketplace mở rộng (future).
- Mini badge: **"Transactional"**

**Card 4 — Enterprise / White-label** *(~7%)*
- Icon: 🏢 (building)
- Body: Large agency rebrand HustlyTasker thành tool riêng, dedicated CSM, SLA, custom domain.
- Mini badge: **"Enterprise"**

**Card 5 — API / Integration Tier** *(~3%)*
- Icon: 🔌 (plug)
- Body: Cho agency muốn build automation trên platform. Tiered API call pricing.
- Mini badge: **"Developer"**

- **Bottom insight**: *"Recurring revenue (60%) làm core + 4 complementary streams = sustainable cash flow + multiple growth levers"*

### Speaker note
*"Recurring SaaS subscription là backbone — cash flow stable. 4 streams còn lại là upside — khi platform mature, mỗi cái tự nó là 1 line revenue. Đây là playbook của các SaaS company hàng đầu — Notion, Linear đều đi pattern này."*

---

## 💰 SLIDE 10 — Pricing Tiers (Freemium Model)

### Visual layout
- **Title**: *"3 gói pricing — Freemium model"* — Bold 36pt
- **3 pricing cards** side-by-side (middle card "Pro" có highlight ring violet "Most Popular"):

**Card 1 — Free**
- Heading: **"Free"** (zinc-400)
- Price: **"$0"** /tháng
- Subtitle: *"For testing"*
- Features:
   - ✅ 1 workspace
   - ✅ 3 members max
   - ✅ Task management basic
   - ✅ Single-language client portal
   - ❌ Finance + Payroll
   - ❌ Marketplace
- CTA: *"Sign up free"*
- Goal: *"User adoption + viral growth"*

**Card 2 — Pro ⭐ (Recommended)**
- Heading: **"Pro"** với gradient violet → fuchsia
- Price: **"$29"** /tháng — *per agency, unlimited members*
- Subtitle: *"For growing agencies"*
- Features:
   - ✅ **Unlimited** workspaces + members
   - ✅ Full Finance + Payroll
   - ✅ Multi-language client portal (5 langs)
   - ✅ Marketplace + Analytics
   - ✅ Smart Automation
   - ✅ Email + Chat support
- CTA: *"Start 14-day trial"*
- Goal: *"Agency 5-50 editors"*
- Highlight: thick violet glow border + "Most Popular" tag

**Card 3 — Enterprise**
- Heading: **"Enterprise"** (emerald)
- Price: **"Custom"** /tháng
- Subtitle: *"For scale"*
- Features:
   - ✅ Everything in Pro
   - ✅ White-label branding
   - ✅ API + integration tier
   - ✅ Dedicated CSM + SLA 99.9%
   - ✅ Custom onboarding
   - ✅ Priority feature requests
- CTA: *"Contact sales"*
- Goal: *"Agency 50+ editors hoặc holding"*

- **Footer note**: *"Pro $29 = 1 fee cho cả agency (không phải per user). Cạnh tranh trực tiếp với Trello $5×10users + Frame.io $15×10users + Excel = $200/mo."*

### Speaker note
*"Đây là pricing strategy quan trọng. Trello + Asana tính per-user → agency 10 editor trả $50-300/tháng. Chúng tôi flat $29 cho cả agency. CFO loves it."*

*"Free tier là user acquisition funnel — 1000 signup → 10-15% convert Pro = stable growth."*

---

## 📈 SLIDE 11 — Revenue Growth Path (3-year)

### Visual layout
- **Title**: *"Lộ trình doanh thu 3 năm"* — Bold 36pt
- **Horizontal timeline** với 3 milestones:

```
   YEAR 1                YEAR 2                YEAR 3
  ┌────────┐           ┌────────┐           ┌────────┐
  │  $2.9K │           │  $15K  │           │  $50K+ │
  │  MRR   │   ────►   │  MRR   │   ────►   │  MRR   │
  └────────┘           └────────┘           └────────┘
   Free → Pro          Marketplace          API tier +
   conversion          fee activates        Enterprise
   focus               + first Ent          (3-5 deals)
   
   1000 signups        500 active Pro       1500+ Pro
   100 Pro convert     5-10 Ent prospect    10+ Ent active
```

- **3 stat cards bên dưới**: cumulative numbers
   - Year 1 end: **~100 Pro customers** + **3-5 Enterprise lead**
   - Year 2 end: **~500 Pro** + **5-10 Enterprise** + Marketplace launched
   - Year 3 end: **~1500 Pro** + **10+ Enterprise** + API tier live

- **Bottom disclaimer**: *"Conservative projection dựa trên benchmarks SaaS B2B niche (LTV/CAC 5:1+ industry standard). Chưa launch chính thức nên đây là target, không phải actuals."*

### Speaker note
*"Conservative projection. Niche focus + recurring nature → high LTV (estimated 18-24 months retention dựa trên benchmark Notion, Linear, Slite). Nếu execute đúng plan, Y3 có thể $50K MRR = $600K ARR."*

*"Nhưng — đây chỉ là projection. Trọng tâm Y1 của chúng tôi là user adoption + product-market fit, không phải MRR maxout."*

---

## ⚔️ SLIDE 12 — Competitive Landscape

### Visual layout
- **Title**: *"Đã có ai làm chưa? Chúng tôi khác gì?"* — Bold 36pt
- **Comparison table** (compact, 5 columns × 8 rows):

| Tiêu chí | Trello / Asana | Monday.com | Frame.io | **HustlyTasker** |
|---|---|---|---|---|
| Built for video | ❌ Chung chung | ❌ Chung chung | ✅ Review tool | ✅ **Niche talking head** |
| Dual-currency native | ❌ | ❌ | ❌ | ✅ USD/VND |
| Multi-role portal | ⚠️ Basic | ⚠️ Basic | ⚠️ Read-only | ✅ 4-tier RBAC |
| Task Marketplace | ❌ | ❌ | ❌ | ✅ **Unique** |
| Smart automation | ❌ | Add-on (paid) | ⚠️ Limited | ✅ Built-in |
| Multi-language client | ❌ | ⚠️ Setting | ⚠️ Partial | ✅ 5 ngôn ngữ |
| Pricing per agency | $5-30/user | $8-24/user | $15+/user | **$29 unlimited** |
| Workflow phases | 3-4 cột | Custom | Custom review | **11-stage video lifecycle** |

- **Bottom takeaway** (highlight box):
   > *"Trello/Asana = chung chung. Frame.io = chỉ review tool. HustlyTasker = **end-to-end agency operations** cho niche talking head — flat pricing per agency thay vì per-user."*

### Speaker note
*"Đây là câu trả lời 'tại sao agency dùng HustlyTasker thay vì combo Trello + Frame.io + Excel'. Cost saving + integrated experience + niche fit."*

*"Frame.io được Adobe mua $1.275B năm 2021 — chứng minh ngành này có giá trị. Nhưng họ chỉ làm review, chúng tôi làm end-to-end."*

---

## 🎯 SLIDE 13 — Vision + Q&A

### Visual layout
- **Background**: full dark gradient với violet glow centered (như Slide 1)
- **Headline (top)**: *"3-year ambition"* — Bold 36pt
- **Big title (center)**: *"Trở thành OS cho mọi Video Agency Đông Nam Á"* — ExtraBold 60pt, gradient violet → fuchsia
- **3 milestone cards (compact, horizontal)**:
   - **2025 Q4**: Public beta launch — 50 agency, 500 editors active
   - **2026 Q4**: 200 agency, $50K MRR, expand sang Indonesia + Philippines
   - **2027**: SEA leader (5 countries) + Enterprise tier mature

- **Bottom CTA**: *"Câu hỏi & Thảo luận"* — Bold 44pt
- **Footer**: Tên team + email contact + logo HustlyTasker

### Speaker note (closing)
*"Tóm lại — HustlyTasker là SaaS quản lý chuyên biệt cho agency video editing, giải quyết 3 pain rõ ràng, có 5 revenue streams, và market real. Chúng tôi đã có MVP với 18 agency test."*

*"Đây không phải ý tưởng trên giấy. Đây là sản phẩm đã sống. Câu hỏi của chúng ta là — làm thế nào để scale từ 18 lên 1800 agency."*

*"Xin mời câu hỏi từ giảng viên và các bạn."*

---

# 🎤 Q&A Preparation — Top 5 câu có thể bị hỏi

### Q1: *"Đã có ai dùng thật chưa?"*
**A**: "Có. Chúng tôi đã có 18 agency real đang test MVP với 23+ users và 35+ workspaces. Một số agency lớn như Hustly Team, Carpe Diem, Kẻ Cô Độc đang quản lý task tháng qua nền tảng của chúng tôi."

### Q2: *"Đối thủ trực tiếp là ai?"*
**A**: "Trực tiếp thì chưa có ai làm đúng niche talking head video. Indirect là Trello/Asana (general task management) và Frame.io (chỉ review tool, không quản lý task hay finance). Chúng tôi gộp cả 3 functions + đi sâu cho 1 niche."

### Q3: *"Doanh thu Year 1 dự kiến bao nhiêu?"*
**A**: "Conservative projection $2-3K MRR Y1, ramp lên $15K Y2 và $50K Y3. Nhưng đây là target — Y1 chúng tôi focus user acquisition + product-market fit, không phải maxout MRR. Khi nào churn rate < 5%/tháng thì chúng tôi mới push aggressive pricing."

### Q4: *"Tại sao agency dùng các bạn thay vì Trello + plugin?"*
**A**: "3 lý do: (1) Cost — Trello + Frame.io + Excel + plugins ~$50-80/user/tháng, chúng tôi $29 cho cả agency. (2) Integrated experience — 1 platform thay vì 3-4 tool rời. (3) Dual-currency + niche workflow — chuyên cho video editing, không cần customize."

### Q5: *"Tech stack là gì?"*
**A**: "Modern cloud-native SaaS architecture, deployed trên infrastructure tier-1. Frontend responsive web app + mobile-friendly. Backend secure với encryption-at-rest. (KHÔNG đào sâu thêm — redirect câu hỏi về business value.)"

### ❌ Câu KHÔNG được trả lời chi tiết
- *"Smart automation hoạt động chi tiết như nào?"* → "Đó là know-how proprietary của chúng tôi. Cốt lõi là AI-driven batch creation engine + pricing rule engine — cụ thể implementation tôi không tiện share trong setting này."
- *"Các bạn dùng cloud service nào để store?"* → "Modern cloud architecture với encryption-at-rest. Cụ thể vendor là proprietary."
- *"Có dùng AI/ML model nào không?"* → "Có pipeline automation thông minh nhưng implementation là proprietary."

---

# 📋 Pre-Presentation Checklist

### 1 ngày trước
- [ ] Dry-run toàn slide với timer 15 phút
- [ ] Speaker đọc speaker notes mỗi slide 2-3 lần
- [ ] Chuẩn bị 3-5 screenshot web app làm backup proof (nhưng KHÔNG show Quick Create flow)
- [ ] Test laptop + projector + clicker

### Ngày thuyết trình
- [ ] Mở slide ở chế độ presentation mode, KHÔNG hiện speaker notes cho audience
- [ ] Mang theo backup USB + cloud link
- [ ] Đến sớm 15 phút setup
- [ ] Drink water trước khi lên

### Phân công team (5 người: 3 designer + 2 marketing)
| Slide | Người trình bày | Vai trò |
|---|---|---|
| 1-3 | Designer 1 | Hook + pain points (storytelling) |
| 4-5 | Designer 2 | Solution + differentiators (product) |
| 6-8 | Marketing 1 | Market + customer + validation |
| 9-11 | Marketing 2 | Revenue model + pricing |
| 12-13 | Designer 3 | Competitive + vision + Q&A close |

**Tip**: Mỗi người 3 phút → tổng 15 phút clean. Practice handoff transition giữa speakers cho smooth.

---

# 🔚 Closing notes (cho team)

**Mục tiêu của pitch**:
1. ✅ Thuyết phục giảng viên đây là **ý tưởng có tiềm năng thật** (không phải vaporware)
2. ✅ Show được hiểu biết về **market + customer + business model**
3. ✅ Giữ kín **competitive moat** (Quick Create implementation, cloud integration)
4. ✅ Để lại **memorable hook** — "OS cho Video Agency" + "18 agency đang dùng"

**KHÔNG bao gồm**:
- ❌ Demo live web app (rủi ro bug + lộ feature)
- ❌ Code/tech stack chi tiết
- ❌ Cloud provider names (Dropbox/Google Drive/AWS)
- ❌ OAuth/encryption/database specifics

**Nếu giảng viên đề nghị demo**: Trả lời *"Chúng tôi có MVP live tại hustlytasker.xyz. Sau buổi này nếu thầy/cô muốn xem demo riêng, em sẵn sàng arrange 1 demo 30 phút private."* — KHÔNG demo trước cả lớp.

Good luck team! 🚀
