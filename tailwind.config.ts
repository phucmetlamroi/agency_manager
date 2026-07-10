import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
        // Tremor
        "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            fontFamily: {
                // Single-font system: cả body và heading đều dùng Plus Jakarta Sans.
                // Heading phân biệt bằng weight (font-bold/extrabold/black) thay vì family.
                sans: ['var(--font-sans)', 'sans-serif'],
                heading: ['var(--font-sans)', 'sans-serif'],
            },
            // ── Type scale mobile 5 bậc + eyebrow (QĐ-4) — [size, { lineHeight, letterSpacing }] ──
            fontSize: {
                caption: ["0.75rem", { lineHeight: "1rem" }],            // 12px/16 — timestamp, meta, badge
                "body-sm": ["0.875rem", { lineHeight: "1.375rem" }],    // 14px/22 — text phụ
                body: ["1rem", { lineHeight: "1.5rem" }],               // 16px/24 — body mặc định + MỌI input
                title: ["1.125rem", { lineHeight: "1.5rem" }],         // 18px/24 — card title, section heading
                page: ["1.375rem", { lineHeight: "1.75rem" }],         // 22px/28 — page title mobile (md:text-3xl)
                label: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.06em" }], // 11px — eyebrow UPPERCASE duy nhất
            },
            // ── Touch tokens (mục 6) ──
            spacing: {
                touch: "2.75rem",      // 44px — min target (Apple HIG / WCAG AAA)
                "touch-lg": "3rem",    // 48px — primary target (Material)
            },
            minHeight: {
                touch: "2.75rem",
                "touch-lg": "3rem",
            },
            // ── Z-index tokens — đọc từ CSS var, single source (khai tử 9999) ──
            zIndex: {
                base: "var(--z-base)",       // 0
                raised: "var(--z-raised)",   // 10
                sticky: "var(--z-sticky)",   // 30
                nav: "var(--z-nav)",         // 40
                sheet: "var(--z-sheet)",     // 50
                dialog: "var(--z-dialog)",   // 60
                popover: "var(--z-popover)", // 65
                toast: "var(--z-toast)",     // 70
            },
            transitionTimingFunction: {
                liquid: "cubic-bezier(0.16, 1, 0.3, 1)",
            },
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                    accent: "hsl(var(--primary-accent) / <alpha-value>)",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                // ── Semantic mở rộng (QĐ-4) ──
                success: {
                    DEFAULT: "hsl(var(--success) / <alpha-value>)",
                    foreground: "hsl(var(--success-foreground))",
                },
                info: {
                    DEFAULT: "hsl(var(--info) / <alpha-value>)",
                    foreground: "hsl(var(--info-foreground))",
                },
                warning: {
                    DEFAULT: "hsl(var(--warning) / <alpha-value>)",
                    foreground: "hsl(var(--warning-foreground))",
                },
                surface: {
                    0: "hsl(var(--surface-0) / <alpha-value>)",
                    1: "hsl(var(--surface-1) / <alpha-value>)",
                    2: "hsl(var(--surface-2) / <alpha-value>)",
                    3: "hsl(var(--surface-3) / <alpha-value>)",
                },
                // 1 token status phục vụ đủ 4 slot (bg/bg-alpha/border/text) — Radix scale
                status: {
                    waiting: "hsl(var(--status-waiting) / <alpha-value>)",
                    assigned: "hsl(var(--status-assigned) / <alpha-value>)",
                    doing: "hsl(var(--status-doing) / <alpha-value>)",
                    review: "hsl(var(--status-review) / <alpha-value>)",
                    revision: "hsl(var(--status-revision) / <alpha-value>)",
                    frame: "hsl(var(--status-frame) / <alpha-value>)",
                    paused: "hsl(var(--status-paused) / <alpha-value>)",
                    done: "hsl(var(--status-done) / <alpha-value>)",
                },
                // Tremor Colors
                tremor: {
                    brand: {
                        faint: "#eff6ff",
                        muted: "#bfdbfe",
                        subtle: "#60a5fa",
                        DEFAULT: "#3b82f6",
                        emphasis: "#1d4ed8",
                        inverted: "#ffffff",
                    },
                    background: {
                        muted: "#f9fafb",
                        subtle: "#f3f4f6",
                        DEFAULT: "#ffffff",
                        emphasis: "#374151",
                    },
                    border: {
                        DEFAULT: "#e5e7eb",
                    },
                    ring: {
                        DEFAULT: "#e5e7eb",
                    },
                    content: {
                        subtle: "#9ca3af",
                        DEFAULT: "#6b7280",
                        emphasis: "#374151",
                        strong: "#111827",
                        inverted: "#ffffff",
                    },
                },
                "dark-tremor": {
                    brand: {
                        faint: "#0B1229",
                        muted: "#172554",
                        subtle: "#1e40af",
                        DEFAULT: "#3b82f6",
                        emphasis: "#60a5fa",
                        inverted: "#030712",
                    },
                    background: {
                        muted: "#131A2B",
                        subtle: "#1f2937",
                        DEFAULT: "#111827",
                        emphasis: "#d1d5db",
                    },
                    border: {
                        DEFAULT: "#1f2937",
                    },
                    ring: {
                        DEFAULT: "#1f2937",
                    },
                    content: {
                        subtle: "#4b5563",
                        DEFAULT: "#6b7280",
                        emphasis: "#e5e7eb",
                        strong: "#f9fafb",
                        inverted: "#000000",
                    },
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
                xl: "calc(var(--radius) + 4px)", // radius modal/sheet (glass-3)
                // Tremor
                "tremor-small": "0.375rem",
                "tremor-default": "0.5rem",
                "tremor-full": "9999px",
            },
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
                shimmer: {
                    "0%": { backgroundPosition: "0 0" },
                    "100%": { backgroundPosition: "-200% 0" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
                shimmer: "shimmer 2s linear infinite",
            },
            boxShadow: {
                // light
                "tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
                "tremor-card": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
                "tremor-dropdown": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                // dark
                "dark-tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
                "dark-tremor-card": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
                "dark-tremor-dropdown": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
            },
        },
    },
    // [P0-09] Full-rainbow safelist REMOVED. Its only consumers were the runtime-built
    // colour classes in ConnectorsPanel + PricingRulesPanel, now converted to STATIC
    // literal classes (their local TONE maps) that the JIT scanner emits directly.
    // Dropping the safelist stops shipping ~22 colours × 11 shades × 6 utils of unused CSS.
    plugins: [
        require("tailwindcss-animate"),
        require("@tailwindcss/typography"),
    ],
};

export default config;
