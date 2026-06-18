# HustlyTasker — Product Landing

A standalone marketing microsite for **HustlyTasker** — the operations OS for short-form video
teams, powered by **Velox**. Built as an isolated Vite project; it shares nothing with the main
Next.js app and touches no application logic. Every visual is a faithful mockup of the *real*
product (the Velox folder scan, the task board, client review, VND payroll, the Phiên Chợ
marketplace) rendered in the warm "Editorial Atelier" palette — no abstract stock art, no
generic AI-glass aesthetic.

## Stack

- **Vite** (vanilla JS, ES modules) — no framework, no UI libraries
- **IntersectionObserver** — scroll reveals + a one-shot Velox scan animation (no scroll-jacking,
  no perpetual animation loop, so the page settles to a stable frame)
- **Plain CSS** with custom properties — the "Editorial Atelier" design tokens
- **Google Fonts** — Fraunces (display), Hanken Grotesk (body), Space Mono (specs)

The product mockups (Velox window, task board, review panel, payroll card) are hand-built in
HTML/CSS/SVG. The atmosphere is an **"editor command-workspace"** set — modern desks whose monitors
show a live task-management board / editing timeline (no people, no cameras, no film). Each is a
cinematic, palette-locked Higgsfield still that doubles as the **poster** for a looping **Veo 3.1**
video backdrop:

| Still + video                              | Section       | Theme                                          |
| ------------------------------------------ | ------------- | ---------------------------------------------- |
| `htl-deskhero.webp` / `.mp4`               | Hero          | command desk, monitor = live task board + timeline |
| `htl-accent-desk.webp` (still only)        | The Problem   | scattered drives / cables (the chaos)          |
| `htl-deskboard.webp` / `.mp4`              | Pipeline      | monitor = task cards advancing through stages  |
| `htl-deskcalm.webp` / `.mp4`               | Pricing / CTA | calm desk, tasks ticking complete (green ✓)    |

Stills come from Recraft 4.1 (warm palette locked: espresso/amber/ivory + sage/clay status dots);
the loops from Veo 3.1 image-to-video. Backdrops are `<video muted loop playsinline poster=still>`
played by IntersectionObserver only when motion is allowed — under `prefers-reduced-motion` they
stay paused and the poster (still) shows. Parallax is a rAF-throttled scroll handler (idle = static).
Note: Seedance 2.0 was tried first but its content filter falsely flagged every clip `nsfw`, so Veo
3.1 was used instead.

## The signature technique

The hero is a **live Velox scan window**: a glass app frame (`Google Drive · /ClientProjects`)
whose file tree is scanned top-to-bottom (scanline + per-file ✓), then real task cards
materialise on the right — `Edit · Acme Launch v3 · 96% · Đang thực hiện · Editor · P3`, etc.
It runs once on arrival and freezes on its final frame. `prefers-reduced-motion` shows that final
state immediately and disables all reveals.

## Run

```bash
npm install
npm run dev      # local dev server (port 5179)
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## Sections (9)

1. **Hero** — "Point Velox at a folder. Get a task board." + the live Velox scan window
2. **Problem** — the scattered-tabs status quo
3. **Velox · Deep Scan** — "It understands the work inside them" + the real "Why these tasks?" P-pattern reasoning (P3/P5/P2/P7 with confidence)
4. **Pipeline** — a real task board (real VND amounts) + the 11 Vietnamese pipeline statuses
5. **Review** — the no-login client review panel (Approve / Request changes, time-coded note)
6. **Payroll** — the editor PayrollCard (`Thực nhận ₫`, 🥇 Top-1 bonus) — VND only
7. **Marketplace** — the Phiên Chợ / Kho Task Đợi (claimable tasks, "Nhận task")
8. **Proof** — "3 live teams run HustlyTasker today."
9. **Pricing** — "Free to start" + the single CTA

## Content guardrails (do not break)

- The only proof claim is **"3 live teams run HustlyTasker today."** No fabricated metrics
  (do not import the in-app landing's inflated "320+ agencies / 12k tasks / 98%" numbers).
- **Velox organizes** the work — it does not cut video or write scripts.
- Payroll speaks only to fair, transparent **editor pay in VND** (₫). Agency USD revenue /
  `jobPriceUSD` / margins never appear anywhere.
- One repeated CTA only: **"Start for free."** Free model — no card required. No price figures.
- One accent: **amber**. Functional status colours (sage = done, clay = revision, sand = waiting)
  are allowed inside product mockups; no cold blue / neon / purple as a brand accent.

The product source of truth is the real Next.js app in `../src`; build conventions live in the
`hustlytasker-landing` skill.
