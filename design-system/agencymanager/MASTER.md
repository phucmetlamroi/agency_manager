# Design System Master File - AGENCYMANAGER

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** AgencyManager
**Theme:** Glassmorphism (High-End Dark Mode)

---

## Global Rules

### Color Palette

| Role | Hex / Tailwind | CSS Variable |
|------|----------------|--------------|
| Primary Background | `zinc-950` / `slate-950` | `--color-bg-primary` |
| Glass Overlay | `bg-white/5` | `--color-glass` |
| Primary Accent | `indigo-500` | `--color-primary` |
| Success / CTA | `emerald-500` | `--color-cta` |
| Border | `border-white/10` | `--color-border` |
| Text Primary | `zinc-100` | `--color-text` |
| Text Muted | `zinc-400` | `--color-text-muted` |

**Color Notes:** Nền Slate/Zinc, điểm nhấn Emerald (Xanh lục) cho thành công và Indigo cho các tính năng dự báo.

### Typography

- **Heading Font:** Cormorant Garamond (Tiêu đề, tạo nét sang trọng)
- **Body Font:** Montserrat (Nội dung, dễ đọc, hiện đại)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Montserrat:wght@300;400;500;600;700&display=swap');
```
**Tailwind Configuration:**
Cần thêm cấu hình vào `tailwind.config.ts`:
```typescript
theme: {
  fontFamily: {
    heading: ['"Cormorant Garamond"', 'serif'],
    sans: ['Montserrat', 'sans-serif'],
  }
}
```

### Key Effects
- Backdrop blur (`backdrop-blur-md` hoặc `backdrop-blur-lg`) kết hợp với nền trong suốt (`bg-zinc-900/50` hoặc `bg-white/5`).
- Viền mỏng (`border border-white/10`) để tạo cảm giác lớp kính.
- Shadow nhẹ (`shadow-2xl shadow-indigo-500/10`) để tạo Depth.

---

## Component Specs

### Cards (Glassmorphism)
```tsx
className="relative overflow-hidden rounded-2xl bg-zinc-900/40 backdrop-blur-md border border-white/10 shadow-xl transition-all duration-300 hover:shadow-indigo-500/20 hover:border-white/20"
```

### Buttons
```tsx
// Primary CTA (Emerald)
className="px-6 py-2 rounded-lg bg-emerald-500/90 hover:bg-emerald-400 text-white font-medium transition-all duration-300 shadow-lg shadow-emerald-500/20"

// Secondary / Functional (Indigo)
className="px-6 py-2 rounded-lg bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/30 text-indigo-300 transition-all duration-300"
```

---

## Anti-Patterns (Do NOT Use)

- ❌ **Thay đổi logic Server / Schema**: TUYỆT ĐỐI KHÔNG sửa PostgreSQL hay file Prisma.
- ❌ **Bỏ quên Mobile**: Mọi padding/margin phải response tốt (vd: `p-4 md:p-6`).
- ❌ **Màu nền gắt**: Tránh sử dụng màu flat quá tối như `#000000` thuần, ưu tiên gradient nhẹ.
- ❌ **Animation chậm**: Tuân thủ Framer Motion duration `0.2` hoặc tailwind `duration-200` đến `300`.
