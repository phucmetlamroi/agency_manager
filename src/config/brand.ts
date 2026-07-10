// src/config/brand.ts — SINGLE SOURCE cho tên app (QĐ-6).
// CẤM viết tên app "HustlyTasker"/"AgencyManager" dạng chuỗi ở nơi khác trong UI.
// ("Velox" là tên tính năng scan nội bộ — giữ nguyên theo quyết định chủ dự án.)
export const BRAND = {
    name: 'HustlyTasker',
    shortName: 'Hustly',
    domain: 'hustlytasker.xyz',
    tagline: 'Quản lý task cho team edit video',
    logo: {
        monogram: 'H',
        // Gradient logo đọc từ token primary — thay 2 gradient lẫn lộn cũ
        // (indigo→purple ở MobileLayoutShell, blue→purple ở UserTopNav).
        gradient: 'linear-gradient(135deg, hsl(var(--primary-accent)), hsl(var(--primary)))',
    },
    themeColor: '#09090b', // khớp --background + viewport themeColor (QĐ-5.1)
} as const
