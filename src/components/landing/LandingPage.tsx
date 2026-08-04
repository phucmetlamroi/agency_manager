'use client'

/**
 * HustlyTasker — public marketing landing ("Editorial Atelier").
 *
 * A faithful React port of the standalone Vite microsite: the warm,
 * product-grounded Vietnamese landing (Velox folder scan, the real task
 * board, client review, VND payroll, the Phiên Chợ marketplace).
 *
 * Everything is presentational. All styles are scoped under `.htl`
 * (see landing.css) so they never touch the in-app design system, and the
 * interaction layer is a one-shot, idle-settling effect — no scroll-jacking,
 * no perpetual animation loop. Full reduced-motion fallback.
 */
import { useEffect, useRef } from 'react'
import { PLANS, TRIAL, GB, TB } from '@/lib/billing/plans'
import './landing.css'

/** Custom-property inline styles (TS needs the cast for `--x` keys). */
const cssVars = (vars: Record<string, string>) => vars as React.CSSProperties

/* ---- Bảng giá: đọc thẳng từ plans.ts — nguồn sự thật duy nhất, landing không
   được tự ghi số riêng (v2 2026-08: bỏ hẳn gói Free, trial = mã 14 ngày). ---- */
const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`
const storageLabel = (b: bigint) => (b >= TB ? `${Number(b / TB)} TB` : `${Number(b / GB)} GB`)

const PRICE_TIERS = [
  {
    plan: PLANS.STUDIO,
    tagline: 'Team nhỏ vào guồng chuyên nghiệp',
    featured: false,
    bullets: [
      `${PLANS.STUDIO.limits.seatsIncluded} ghế — thêm được tới ${PLANS.STUDIO.limits.seatCap}`,
      `${storageLabel(PLANS.STUDIO.limits.storageBytes!)} lưu trữ · video 1080p`,
      'Velox + quy trình 11 trạng thái',
      'Cổng khách + link duyệt có mật khẩu',
      'Tính lương VNĐ + hoá đơn cho khách',
      'White-label — không dấu HustlyTasker',
    ],
  },
  {
    plan: PLANS.AGENCY,
    tagline: 'Agency nhiều khách, nhiều guồng',
    featured: true,
    bullets: [
      'Mọi thứ của Studio, cộng thêm:',
      `${PLANS.AGENCY.limits.seatsIncluded} ghế — thêm được tới ${PLANS.AGENCY.limits.seatCap}`,
      `${storageLabel(PLANS.AGENCY.limits.storageBytes!)} lưu trữ · ${PLANS.AGENCY.limits.profiles} tổ chức chung hạn mức`,
      'Bộ tài chính: P&L, sổ thu, xuất lương XLSX',
      'Khách tự gửi yêu cầu qua cổng riêng',
      'KPI, phân tích + máy chủ MCP cho AI',
    ],
  },
  {
    plan: PLANS.SCALE,
    tagline: 'Xưởng lớn chạy hết công suất',
    featured: false,
    bullets: [
      'Mọi thứ của Agency, cộng thêm:',
      `${PLANS.SCALE.limits.seatsIncluded} ghế — thêm được tới ${PLANS.SCALE.limits.seatCap}`,
      `${storageLabel(PLANS.SCALE.limits.storageBytes!)} lưu trữ · ${PLANS.SCALE.limits.profiles} tổ chức`,
      'Video 4K tới độ phân giải gốc',
      `Giữ nhật ký & thùng rác ${PLANS.SCALE.limits.retentionDays} ngày`,
    ],
  },
] as const

/* ---- The Velox scan demo: folder scan → tasks materialise ---- */
function setVeloxFinal(app: HTMLElement) {
  const tree = app.querySelector('[data-velox-tree]')
  if (tree) tree.classList.remove('scanning')
  app.querySelectorAll('[data-vfile]').forEach((f) => f.classList.add('done'))
  app.querySelectorAll('[data-vtask]').forEach((t) => t.classList.add('show'))
  const fc = app.querySelector('[data-velox-filecount]')
  const tc = app.querySelector('[data-velox-taskcount]')
  if (fc) fc.textContent = String(app.querySelectorAll('[data-vfile]').length)
  if (tc) tc.textContent = String(app.querySelectorAll('[data-vtask]').length)
  app.classList.add('is-done')
  const bt = app.querySelector('[data-velox-badge-text]')
  if (bt) bt.textContent = 'Xong'
}

export default function LandingPage({ fontVars = '' }: { fontVars?: string }) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.classList.add('js') // belt-and-suspenders (inline script already added it pre-paint)

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timers: number[] = []
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms))
    const cleanups: Array<() => void> = []

    try {
      /* ---- Scroll reveals (once, on enter) ---- */
      const reveals = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
      if (prefersReduced) {
        reveals.forEach((el) => el.classList.add('in'))
      } else {
        const vh = window.innerHeight || 1
        // Reveal anything already on screen synchronously → no first-frame blink.
        reveals.forEach((el) => {
          const r = el.getBoundingClientRect()
          if (r.top < vh * 0.92 && r.bottom > 0) el.classList.add('in')
        })
        const io = new IntersectionObserver(
          (entries, obs) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return
              entry.target.classList.add('in')
              obs.unobserve(entry.target)
            })
          },
          { threshold: 0.18, rootMargin: '0px 0px -8% 0px' }
        )
        reveals.forEach((el) => {
          if (!el.classList.contains('in')) io.observe(el)
        })
        cleanups.push(() => io.disconnect())
      }

      /* ---- The Velox scan demo ---- */
      const app = root.querySelector<HTMLElement>('[data-velox]')
      if (app) {
        if (prefersReduced) {
          setVeloxFinal(app)
        } else {
          let started = false
          const runVeloxDemo = () => {
            const tree = app.querySelector('[data-velox-tree]')
            const rows = Array.from(app.querySelectorAll<HTMLElement>('.vfile'))
            const tasks = Array.from(app.querySelectorAll<HTMLElement>('[data-vtask]'))
            const fileCountEl = app.querySelector('[data-velox-filecount]')
            const taskCountEl = app.querySelector('[data-velox-taskcount]')
            const badgeText = app.querySelector('[data-velox-badge-text]')
            let files = 0
            let tasksShown = 0
            if (tree) tree.classList.add('scanning')

            const step = 230
            rows.forEach((row, i) => {
              const isFile = row.hasAttribute('data-vfile')
              later(() => {
                row.classList.add('hit')
                later(() => {
                  row.classList.remove('hit')
                  if (isFile) {
                    row.classList.add('done')
                    files += 1
                    if (fileCountEl) fileCountEl.textContent = String(files)
                  }
                }, 200)
              }, 400 + i * step)
            })

            const scanEnd = 400 + rows.length * step + 250
            later(() => {
              if (tree) tree.classList.remove('scanning')
              app.classList.add('is-done')
              if (badgeText) badgeText.textContent = 'Xong'
            }, scanEnd)

            tasks.forEach((task, j) => {
              later(() => {
                task.classList.add('show')
                tasksShown += 1
                if (taskCountEl) taskCountEl.textContent = String(tasksShown)
              }, scanEnd + 350 + j * 420)
            })
          }
          const start = () => {
            if (started) return
            started = true
            runVeloxDemo()
          }
          const io = new IntersectionObserver(
            (entries, obs) => {
              entries.forEach((entry) => {
                if (!entry.isIntersecting) return
                start()
                obs.disconnect()
              })
            },
            { threshold: 0.15 }
          )
          io.observe(app)
          cleanups.push(() => io.disconnect())
          // The hero demo is meant to play on arrival — fall back to a timer.
          later(start, 1100)
        }
      }

      /* ---- Cinematic backdrop videos: play only when motion is allowed ---- */
      if (!prefersReduced) {
        const vids = Array.from(root.querySelectorAll<HTMLVideoElement>('video[data-bgvideo]'))
        if (vids.length) {
          const play = (v: HTMLVideoElement) => {
            try {
              const p = v.play()
              if (p && typeof p.catch === 'function') p.catch(() => {})
            } catch {
              /* autoplay may be blocked; poster stays */
            }
          }
          const io = new IntersectionObserver(
            (entries, obs) => {
              entries.forEach((e) => {
                if (!e.isIntersecting) return
                play(e.target as HTMLVideoElement)
                obs.unobserve(e.target)
              })
            },
            { rootMargin: '200px' }
          )
          vids.forEach((v) => io.observe(v))
          cleanups.push(() => io.disconnect())
        }
      }

      /* ---- Cinematic backdrops drift on scroll (gentle parallax) ---- */
      if (!prefersReduced) {
        const layers = Array.from(root.querySelectorAll<HTMLElement>('[data-parallax]'))
        if (layers.length) {
          let ticking = false
          const update = () => {
            const vh = window.innerHeight || 1
            for (const el of layers) {
              const amp = parseFloat(el.getAttribute('data-parallax') || '') || 26
              const host = el.parentElement
              if (!host) continue
              const rect = host.getBoundingClientRect()
              const offset = (rect.top + rect.height / 2 - vh / 2) / vh
              el.style.transform = `translate3d(0,${(-offset * amp).toFixed(1)}px,0)`
            }
            ticking = false
          }
          const onScroll = () => {
            if (ticking) return
            ticking = true
            requestAnimationFrame(update)
          }
          window.addEventListener('scroll', onScroll, { passive: true })
          window.addEventListener('resize', onScroll, { passive: true })
          update()
          cleanups.push(() => {
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
          })
        }
      }
    } catch (err) {
      // Never leave content hidden if the animation layer fails.
      console.error('[htl] init failed, falling back to static:', err)
      root.classList.add('reveal-fallback')
      const app = root.querySelector<HTMLElement>('[data-velox]')
      if (app) setVeloxFinal(app)
    }

    /* ---- Header gains a glass backing once you leave the hero ---- */
    const header = root.querySelector<HTMLElement>('#siteHeader')
    if (header) {
      const onHeaderScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 60)
      onHeaderScroll()
      window.addEventListener('scroll', onHeaderScroll, { passive: true })
      cleanups.push(() => window.removeEventListener('scroll', onHeaderScroll))
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      cleanups.forEach((fn) => fn())
    }
  }, [])

  return (
    <div className={`htl ${fontVars}`} ref={rootRef} lang="vi" suppressHydrationWarning>
      {/* Add the `js` hook before first paint so reveal targets never flash. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{document.currentScript.parentElement.classList.add('js')}catch(e){}",
        }}
      />
      {/* Fonts are self-hosted via next/font (declared in app/page.tsx) and
          applied through the `fontVars` CSS-variable classes on this root —
          no runtime <link> to fonts.gstatic.com (throttled on many VN nets). */}

      {/* Keyboard users land here first; off-screen until focused */}
      <a className="skip-link" href="#top">
        Tới nội dung
      </a>

      {/* Warm ambient backdrop — pure CSS, no raster media */}
      <div className="ambient" aria-hidden="true" />

      {/* ============================== Header ============================== */}
      <header className="site-header" id="siteHeader">
        <a className="wordmark" href="#top" aria-label="HustlyTasker trang chủ">
          <span className="wordmark__text">
            Hustly<span className="wordmark__dot">·</span>Tasker
          </span>
        </a>
        <nav className="site-nav" aria-label="Điều hướng chính">
          <a href="#velox">Velox</a>
          <a href="#pipeline">Quy trình</a>
          <a href="#review">Duyệt bài</a>
          <a href="#payroll">Lương</a>
          <a href="#pricing">Bảng giá</a>
        </nav>
        <a className="btn btn--cta site-header__cta" href="/signup">
          Dùng thử {TRIAL.days} ngày
        </a>
      </header>

      <main id="top">
        {/* ===================== 1 · HERO ===================== */}
        <section className="section section--hero" id="hero">
          <div className="hero__bg" aria-hidden="true">
            <video
              className="parallax-img"
              data-parallax="34"
              data-bgvideo
              poster="/media/htl-deskhero.webp"
              muted
              loop
              playsInline
              preload="auto"
            >
              <source src="/media/htl-deskhero.mp4" type="video/mp4" />
            </video>
            <div className="hero__scrim" />
            <span className="hero__glow" />
          </div>
          <div className="container hero__grid">
            <div className="hero__copy">
              <p className="eyebrow" data-reveal>
                <span className="eyebrow__dot" aria-hidden="true" />
                Hệ điều hành vận hành cho team video ngắn
              </p>
              <h1 className="display display--xl" data-reveal>
                Trỏ Velox vào một folder.
                <br />
                <span className="display--accent">Có ngay bảng task.</span>
              </h1>
              <p className="lede" data-reveal>
                HustlyTasker gom cả guồng dựng video ngắn, từ talking-head tới faceless, về chung một
                tab. Velox đọc folder Drive hoặc Dropbox, hiểu phần việc bên trong rồi bày sẵn bảng
                task đã phân công đủ: đầu việc, vai trò, deadline.
              </p>
              <div className="hero__actions" data-reveal>
                <a className="btn btn--cta" href="/signup">
                  Dùng thử {TRIAL.days} ngày
                </a>
                <a className="btn btn--ghost" href="#velox">
                  Xem Velox quét
                </a>
              </div>
              <p className="hero__micro" data-reveal>
                {TRIAL.days} ngày đầy đủ tính năng — không cần thẻ.
              </p>
            </div>

            {/* The product, not an abstraction: a live Velox scan window */}
            <div className="hero__demo" data-reveal>
              <div className="velox-app" data-velox aria-label="Velox đang quét folder và tạo task">
                <div className="velox-app__bar">
                  <span className="velox-app__dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="velox-app__title">
                    <svg
                      viewBox="0 0 24 24"
                      width="13"
                      height="13"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M7 18a4.6 4.6 0 0 1-.3-9.2 6 6 0 0 1 11.5 1.5A4 4 0 0 1 18 18Z" />
                    </svg>
                    <span className="velox-app__src">Google Drive</span> · /ClientProjects
                  </span>
                  <span className="velox-app__badge" data-velox-badge>
                    <span className="velox-app__spin" aria-hidden="true" />
                    <span data-velox-badge-text>Đang quét</span>
                  </span>
                </div>

                <div className="velox-app__body">
                  {/* Left: source files */}
                  <div className="velox-col">
                    <p className="velox-col__label">
                      File nguồn · <b data-velox-filecount>0</b>
                    </p>
                    <div className="velox-tree" data-velox-tree>
                      <span className="velox-tree__scan" aria-hidden="true" />
                      <div className="vfile vfile--folder">
                        <svg className="vfile__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                        </svg>
                        <span className="vfile__name">Acme_Q3_Launch</span>
                        <span className="vfile__sz">6 file</span>
                      </div>
                      {[
                        { name: 'Acme_Launch_v3.prproj', sz: '2.4 GB' },
                        { name: 'raw_footage_A001.mp4', sz: '8.1 GB' },
                        { name: 'VO_script_FINAL.docx', sz: '38 KB' },
                        { name: 'color_LUT_pack.cube', sz: '4 MB' },
                        { name: 'thumb_options.psd', sz: '142 MB' },
                      ].map((f) => (
                        <div className="vfile" data-vfile key={f.name}>
                          <svg className="vfile__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                            <path d="M5 8a2 2 0 0 1 2-2h7l5 5v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" />
                          </svg>
                          <span className="vfile__name">{f.name}</span>
                          <span className="vfile__sz">{f.sz}</span>
                          <svg className="vfile__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: generated tasks */}
                  <div className="velox-col">
                    <p className="velox-col__label">
                      Task tự sinh · <b data-velox-taskcount>0</b>
                    </p>
                    <div className="velox-tasks" data-velox-tasks>
                      <article className="vtask" data-vtask>
                        <div className="vtask__top">
                          <span className="vtask__title">Dựng · Acme Launch v3</span>
                          <span className="vtask__conf">
                            96%
                            <span className="vtask__bar">
                              <i style={cssVars({ '--w': '96%' })} />
                            </span>
                          </span>
                        </div>
                        <div className="vtask__meta">
                          <span className="vtask__status">
                            <i className="vtask__dot" style={cssVars({ '--c': 'var(--amber)' })} />
                            Đang thực hiện
                          </span>
                          <span className="vtask__pill">Editor</span>
                          <span className="vtask__pill vtask__pill--code">P3</span>
                        </div>
                        <p className="vtask__reason">File .prproj có đánh version → đang dựng dở</p>
                      </article>
                      <article className="vtask" data-vtask>
                        <div className="vtask__top">
                          <span className="vtask__title">Grade màu · Acme reel</span>
                          <span className="vtask__conf">
                            91%
                            <span className="vtask__bar">
                              <i style={cssVars({ '--w': '91%' })} />
                            </span>
                          </span>
                        </div>
                        <div className="vtask__meta">
                          <span className="vtask__status">
                            <i className="vtask__dot" style={cssVars({ '--c': 'var(--sand)' })} />
                            Nhận task
                          </span>
                          <span className="vtask__pill">Colorist</span>
                          <span className="vtask__pill vtask__pill--code">P5</span>
                        </div>
                        <p className="vtask__reason">Gói LUT kèm footage thô → cần grade màu</p>
                      </article>
                      <article className="vtask" data-vtask>
                        <div className="vtask__top">
                          <span className="vtask__title">Thumbnail · Acme</span>
                          <span className="vtask__conf">
                            88%
                            <span className="vtask__bar">
                              <i style={cssVars({ '--w': '88%' })} />
                            </span>
                          </span>
                        </div>
                        <div className="vtask__meta">
                          <span className="vtask__status">
                            <i className="vtask__dot" style={cssVars({ '--c': 'var(--sand)' })} />
                            Nhận task
                          </span>
                          <span className="vtask__pill">Designer</span>
                          <span className="vtask__pill vtask__pill--code">P2</span>
                        </div>
                        <p className="vtask__reason">File .psd tên &lsquo;thumb&rsquo; → thumbnail cần giao</p>
                      </article>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="scroll-hint" data-reveal aria-hidden="true">
            <span>Cuộn</span>
            <span className="scroll-hint__line" />
          </div>
        </section>

        {/* ===================== 2 · THE PROBLEM ===================== */}
        <section className="section section--problem section--bg" id="problem">
          <div className="section__bg" aria-hidden="true">
            <img
              className="parallax-img"
              data-parallax="26"
              src="/media/htl-accent-desk.webp"
              alt=""
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="container narrow">
            <p className="eyebrow" data-reveal>
              Vấn đề
            </p>
            <h2 className="display display--lg" data-reveal>
              Cả guồng vận hành đang nằm rải rác khắp chục cái tab.
            </h2>
            <p className="body body--lg" data-reveal>
              Bảng việc một nơi. Công cụ duyệt một nẻo. Bảng lương nằm trong file Sheet chẳng mấy ai
              dám tin. Góp ý thì lùi sâu ba tầng tin nhắn. Mỗi lần bàn giao là thêm một dịp để bản cắt
              kẹt lại, còn bạn thì lặng lẽ thành nút thắt cổ chai.
            </p>
            <ul className="stack-list" data-reveal>
              <li>Bảng việc</li>
              <li>Công cụ duyệt</li>
              <li>File lương</li>
              <li>Tin nhắn rải rác</li>
            </ul>
          </div>
        </section>

        {/* ===================== 3 · VELOX — UNDERSTANDS THE WORK ===================== */}
        <section className="section section--velox" id="velox">
          <div className="container split">
            <div className="split__copy">
              <p className="eyebrow eyebrow--amber" data-reveal>
                Velox · Quét sâu
              </p>
              <h2 className="display display--lg" data-reveal>
                Velox không chỉ liệt kê file. Nó hiểu phần việc nằm bên trong từng file.
              </h2>
              <p className="body body--lg" data-reveal>
                Kết nối cloud một lần. Velox nhận ra bảy kiểu cấu trúc dự án, tạo một task cho mỗi
                video, và giải thích vì sao tạo từng task, kèm điểm tin cậy bạn có thể tin được.
              </p>
              <div className="velox-stats" data-reveal>
                <div className="velox-stat">
                  <b>7</b>
                  <span>kiểu cấu trúc khớp</span>
                </div>
                <div className="velox-stat">
                  <b>9</b>
                  <span>cột điền sẵn</span>
                </div>
                <div className="velox-stat">
                  <b>0</b>
                  <span>thao tác tay</span>
                </div>
              </div>
              <p className="callout" data-reveal>
                Velox lo phần sắp xếp, nó không bao giờ động vào phần sáng tạo. Nó bày sẵn bảng việc,
                còn dựng video và viết kịch bản vẫn là của team bạn.
              </p>
            </div>

            {/* "Why these tasks?" — real pattern reasoning */}
            <figure className="split__panel reason-card" data-reveal>
              <figcaption className="reason-card__head">Vì sao lại là những task này?</figcaption>
              <div className="reason-row">
                <span className="reason-row__code">P3</span>
                <div className="reason-row__body">
                  <p className="reason-row__title">File dự án → Task dựng</p>
                  <p className="reason-row__desc">
                    File <b>.prproj</b> có đánh version tức là đang dựng dở. Giao cho Editor.
                  </p>
                </div>
                <span className="reason-row__conf">96%</span>
              </div>
              <div className="reason-row">
                <span className="reason-row__code">P5</span>
                <div className="reason-row__body">
                  <p className="reason-row__title">Phát hiện asset màu</p>
                  <p className="reason-row__desc">
                    Có <b>gói LUT</b> kèm footage thô thì cần một lượt grade màu. Đẩy cho Colorist.
                  </p>
                </div>
                <span className="reason-row__conf">91%</span>
              </div>
              <div className="reason-row">
                <span className="reason-row__code">P2</span>
                <div className="reason-row__body">
                  <p className="reason-row__title">Bắt được file thiết kế</p>
                  <p className="reason-row__desc">
                    File <b>.psd</b> nhiều layer tên ‘thumb’ ứng với một thumbnail cần giao, dành cho
                    Designer.
                  </p>
                </div>
                <span className="reason-row__conf">88%</span>
              </div>
              <div className="reason-row">
                <span className="reason-row__code">P7</span>
                <div className="reason-row__body">
                  <p className="reason-row__title">Suy ra deadline</p>
                  <p className="reason-row__desc">
                    Tên ‘Q3_Launch’ cùng ngày sửa cuối gợi ra <b>hạn dự kiến</b>, bạn chỉnh lại được.
                  </p>
                </div>
                <span className="reason-row__conf">84%</span>
              </div>
            </figure>
          </div>
        </section>

        {/* ===================== 4 · THE PIPELINE / BOARD ===================== */}
        <section className="section section--pipeline section--bg" id="pipeline">
          <div className="section__bg" aria-hidden="true">
            <video
              className="parallax-img"
              data-parallax="26"
              data-bgvideo
              poster="/media/htl-deskboard.webp"
              muted
              loop
              playsInline
              preload="none"
            >
              <source src="/media/htl-deskboard.mp4" type="video/mp4" />
            </video>
          </div>
          <div className="container">
            <div className="section__head" data-reveal>
              <p className="eyebrow eyebrow--amber">Quy trình</p>
              <h2 className="display display--lg">Luôn biết chính xác mỗi bản cắt đang ở đâu.</h2>
              <p className="body body--lg center-block">
                Mười một trạng thái đưa từng video đi từ footage thô tới lúc giao xong. Một bảng việc,
                một trạng thái chung, hết cảnh nhắn nhau “cái này tới đâu rồi?”.
              </p>
            </div>

            {/* A real task board */}
            <div className="board" data-reveal>
              <div className="board__head">
                <span>Đầu việc</span>
                <span>Trạng thái</span>
                <span>Người làm</span>
                <span>Loại</span>
                <span>Hạn</span>
                <span className="board__amount">Lương editor</span>
              </div>
              <div className="board__row" style={cssVars({ '--accent': 'var(--amber)' })}>
                <span className="board__task">
                  <b className="board__client">LGR</b>
                  <span className="board__title">Video 1 · Body + Hooks</span>
                </span>
                <span className="board__status" style={cssVars({ '--c': 'var(--amber)' })}>
                  <i />
                  Đang thực hiện
                </span>
                <span className="board__assignee">
                  <span className="board__avatar">Q</span>Quân
                </span>
                <span className="board__type board__type--short">SHORT</span>
                <span className="board__deadline">18 Th6</span>
                <span className="board__amount">₫450,000</span>
              </div>
              <div className="board__row" style={cssVars({ '--accent': 'var(--sage)' })}>
                <span className="board__task">
                  <b className="board__client">Acme</b>
                  <span className="board__title">Reel ra mắt · bản master</span>
                </span>
                <span className="board__status" style={cssVars({ '--c': 'var(--sage)' })}>
                  <i />
                  Hoàn tất
                </span>
                <span className="board__assignee">
                  <span className="board__avatar">P</span>Phúc
                </span>
                <span className="board__type board__type--long">LONG</span>
                <span className="board__deadline">Đã giao</span>
                <span className="board__amount">₫1,200,000</span>
              </div>
              <div className="board__row" style={cssVars({ '--accent': 'var(--clay)' })}>
                <span className="board__task">
                  <b className="board__client">Jacob</b>
                  <span className="board__title">Tháng 5 · Tập 3</span>
                </span>
                <span className="board__status" style={cssVars({ '--c': 'var(--clay)' })}>
                  <i />
                  Revision
                </span>
                <span className="board__assignee">
                  <span className="board__avatar">L</span>Linh
                </span>
                <span className="board__type board__type--short">SHORT</span>
                <span className="board__deadline board__deadline--soon">19 Th6</span>
                <span className="board__amount">₫450,000</span>
              </div>
              <div className="board__row" style={cssVars({ '--accent': 'var(--sand)' })}>
                <span className="board__task">
                  <b className="board__client">Mira</b>
                  <span className="board__title">Tháng 6 · Tập 1</span>
                </span>
                <span className="board__status" style={cssVars({ '--c': 'var(--sand)' })}>
                  <i />
                  Đang đợi giao
                </span>
                <span className="board__assignee board__assignee--empty">Chưa giao</span>
                <span className="board__type board__type--short">SHORT</span>
                <span className="board__deadline">20 Th6</span>
                <span className="board__amount">₫450,000</span>
              </div>
            </div>

            {/* The 11 real stages */}
            <div className="stages" data-reveal>
              <span className="stages__cap">11 trạng thái · một dòng chảy</span>
              <ul className="stages__list" aria-label="Mười một trạng thái quy trình">
                <li style={cssVars({ '--c': 'var(--sand)' })}>Đang đợi giao</li>
                <li style={cssVars({ '--c': 'var(--ivory)' })}>Nhận task</li>
                <li style={cssVars({ '--c': 'var(--amber)' })}>Đang thực hiện</li>
                <li style={cssVars({ '--c': 'var(--clay)' })}>Gửi lại</li>
                <li style={cssVars({ '--c': 'var(--clay)' })}>Revision</li>
                <li style={cssVars({ '--c': 'var(--clay)' })}>Sửa frame</li>
                <li style={cssVars({ '--c': 'var(--sage)' })}>Hoàn tất</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ===================== 5 · CLIENT REVIEW ===================== */}
        <section className="section section--review" id="review">
          <div className="container split split--reverse">
            <div className="split__copy">
              <p className="eyebrow eyebrow--amber" data-reveal>
                Duyệt bài
              </p>
              <h2 className="display display--lg" data-reveal>
                Góp ý ghim thẳng vào khung hình.
              </h2>
              <p className="body body--lg" data-reveal>
                Khách mở một đường link, không tài khoản, không đăng nhập, xem bản cắt rồi duyệt hoặc
                yêu cầu sửa kèm ghi chú gắn timecode. Yêu cầu chạy thẳng về cho editor.
              </p>
              <p className="spec" data-reveal>
                Link chia sẻ công khai · không cần đăng nhập
              </p>
            </div>

            <figure className="split__panel review-panel" data-reveal>
              <div className="review-panel__head">
                <span className="review-panel__eyebrow">Acme Corp · khách duyệt</span>
                <h3 className="review-panel__title">Reel ra mắt · bản 3</h3>
              </div>
              <button className="review-panel__link" type="button" tabIndex={-1} aria-hidden="true">
                <span className="review-panel__play">▶</span>
                <span className="review-panel__linktext">Mở bản cắt</span>
                <span className="review-panel__time">00:48</span>
              </button>
              <div className="review-panel__note">
                <span className="review-panel__stamp">02:14</span>
                <span className="review-panel__text">“Siết phần mở đầu nhanh hơn nửa nhịp.”</span>
              </div>
              <p className="review-panel__prompt">Bản cắt này đã sẵn sàng để bạn duyệt.</p>
              <div className="review-panel__actions">
                <span className="rbtn rbtn--approve" aria-hidden="true">
                  Duyệt
                </span>
                <span className="rbtn rbtn--changes" aria-hidden="true">
                  Yêu cầu sửa
                </span>
              </div>
              <div className="review-panel__track">
                <span className="rtrack rtrack--done">Chờ duyệt</span>
                <span className="rtrack rtrack--active">Đang sửa</span>
                <span className="rtrack">Hoàn tất</span>
              </div>
            </figure>
          </div>
        </section>

        {/* ===================== 6 · TRANSPARENT PAYROLL ===================== */}
        <section className="section section--payroll" id="payroll">
          <div className="container split">
            <div className="split__copy">
              <p className="eyebrow eyebrow--amber" data-reveal>
                Lương
              </p>
              <h2 className="display display--lg" data-reveal>
                Trả công sòng phẳng, tính ngay khi bài vừa giao.
              </h2>
              <p className="body body--lg" data-reveal>
                Khi một task chuyển sang <b>Hoàn tất</b>, lương editor được cộng tự động bằng VNĐ, kèm
                thưởng Top minh bạch. Ai cũng thấy rõ mình nhận bao nhiêu, đều đặn mỗi kỳ, khỏi ngồi
                tính tay.
              </p>
              <p className="spec" data-reveal>
                Lương editor bằng VNĐ · minh bạch, dễ đoán
              </p>
            </div>

            <figure className="split__panel payroll-card" data-reveal>
              <div className="payroll-card__top">
                <span className="payroll-card__avatar">P</span>
                <div className="payroll-card__who">
                  <span className="payroll-card__name">Phúc</span>
                  <span className="payroll-card__role">Editor · 5 task kỳ này</span>
                </div>
                <span className="payroll-card__rank">🥇 Top 1</span>
              </div>
              <div className="payroll-card__progress" aria-hidden="true">
                <span className="payroll-card__bar">
                  <i style={{ width: '62%' }} />
                </span>
                <span className="payroll-card__legend">3 hoàn tất · 2 đang xử lý</span>
              </div>
              <div className="payroll-card__figures">
                <div className="payroll-card__net">
                  <span className="payroll-card__label">Thực nhận</span>
                  <span className="payroll-card__figure">₫18,500,000</span>
                </div>
                <div className="payroll-card__pending">
                  <span className="payroll-card__label">Dự kiến</span>
                  <span className="payroll-card__sub">₫4,200,000</span>
                </div>
              </div>
              <div className="payroll-card__bonus">🥇 Thưởng Top 1 · 10% × Thực nhận</div>
              <span className="payroll-card__paid">Đã thanh toán</span>
            </figure>
          </div>
        </section>

        {/* ===================== 7 · TASK MARKETPLACE ===================== */}
        <section className="section section--market" id="marketplace">
          <div className="container narrow">
            <p className="eyebrow eyebrow--amber" data-reveal>
              Phiên Chợ
            </p>
            <h2 className="display display--lg" data-reveal>
              Việc còn trống tự tìm được người làm.
            </h2>
            <p className="body body--lg" data-reveal>
              Task chưa giao sẽ rơi vào <b>Kho Task Đợi</b>. Mở Phiên Chợ là editor tự xem và nhận
              phần hợp với mình, công việc chạy mà không cần ai ngồi điều phối.
            </p>
            <div className="market" data-reveal>
              <div className="market__toggle">
                <span className="market__dot" />
                <span className="market__toggle-text">
                  <b>Phiên Chợ</b> đang mở · nhân viên có thể nhận task
                </span>
              </div>
              <div className="market__row">
                <span className="market__task">
                  <b className="board__client">Jacob</b> Tháng 6 · Tập 1
                </span>
                <span className="board__type board__type--short">SHORT</span>
                <span className="market__deadline">20 Th6</span>
                <span className="market__claim" aria-hidden="true">
                  Nhận task
                </span>
              </div>
              <div className="market__row">
                <span className="market__task">
                  <b className="board__client">Acme</b> Cắt gọn B-roll
                </span>
                <span className="board__type board__type--long">LONG</span>
                <span className="market__deadline">21 Th6</span>
                <span className="market__claim" aria-hidden="true">
                  Nhận task
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== 8 · PROOF / TRACTION ===================== */}
        <section className="section section--proof" id="proof">
          <div className="container narrow center">
            <p className="eyebrow eyebrow--amber" data-reveal>
              Thực tế
            </p>
            <h2 className="display display--xl proof__headline" data-reveal>
              3 team đang vận hành thật trên HustlyTasker.
            </h2>
            <p className="body body--lg" data-reveal>
              Không phải danh sách chờ. Không phải slide gọi vốn. Ba team video ngắn đang chạy việc
              hằng ngày trên HustlyTasker, ngay lúc này.
            </p>
          </div>
        </section>

        {/* ===================== 9 · PRICING + FINAL CTA ===================== */}
        <section className="section section--pricing section--bg" id="pricing">
          <div className="section__bg" aria-hidden="true">
            <video
              className="parallax-img"
              data-parallax="26"
              data-bgvideo
              poster="/media/htl-deskcalm.webp"
              muted
              loop
              playsInline
              preload="none"
            >
              <source src="/media/htl-deskcalm.mp4" type="video/mp4" />
            </video>
          </div>
          <div className="container center">
            <p className="eyebrow eyebrow--amber" data-reveal>
              Bảng giá
            </p>
            <h2 className="display display--lg" data-reveal>
              Ba gói, giá VNĐ rõ ràng. Cả team, chung một tab.
            </h2>
            <div className="price-grid">
              {PRICE_TIERS.map(({ plan, tagline, featured, bullets }) => (
                <div
                  key={plan.code}
                  className={`price-card price-card--tier${featured ? ' price-card--featured' : ''}`}
                  data-reveal
                >
                  {featured && <span className="price-card__flag">Phổ biến nhất</span>}
                  <h3 className="price-card__name">{plan.label}</h3>
                  <p className="price-card__desc">{tagline}</p>
                  <div className="price-card__amount">
                    {vnd(plan.pricing.monthlyVND!)}
                    <span className="price-card__period">/tháng</span>
                  </div>
                  <p className="price-card__annual">
                    Trả năm còn {vnd(plan.pricing.annualMonthlyVND!)}/tháng
                  </p>
                  <ul className="price-card__list">
                    {bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <a className="btn btn--cta btn--block" href="/signup">
                    Dùng thử {TRIAL.days} ngày
                  </a>
                </div>
              ))}
            </div>
            <p className="price-card__micro" data-reveal>
              Mọi gói dùng thử {TRIAL.days} ngày đầy đủ tính năng — không cần thẻ. Thanh toán chuyển
              khoản QR ngay trong ứng dụng, kích hoạt tự động.
            </p>
          </div>
        </section>
      </main>

      {/* ============================== Footer ============================== */}
      <footer className="site-footer">
        <div className="container site-footer__inner">
          <a className="wordmark wordmark--footer" href="#top" aria-label="HustlyTasker trang chủ">
            <span className="wordmark__text">
              Hustly<span className="wordmark__dot">·</span>Tasker
            </span>
          </a>
          <p className="site-footer__tagline">Hệ điều hành vận hành cho team video ngắn.</p>
          <nav className="site-footer__nav" aria-label="Chân trang">
            <a href="#velox">Velox</a>
            <a href="#pipeline">Quy trình</a>
            <a href="#review">Duyệt bài</a>
            <a href="#payroll">Lương</a>
            <a href="#pricing">Bảng giá</a>
          </nav>
          <p className="site-footer__copy">© 2026 HustlyTasker</p>
        </div>
      </footer>
    </div>
  )
}
