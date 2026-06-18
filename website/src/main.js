/* ============================================================
   HustlyTasker — landing interactions
   No scroll-jacking, no perpetual animation loop: lightweight
   IntersectionObserver reveals + a one-shot Velox scan demo that
   settles to a stable final frame. Full reduced-motion fallback.
   ============================================================ */
import './style.css'

const html = document.documentElement
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const supportsIO = 'IntersectionObserver' in window

/* ---- Scroll reveals (once, on enter) ---- */
function initReveals() {
  const targets = document.querySelectorAll('[data-reveal]')
  if (!supportsIO) {
    targets.forEach((el) => el.classList.add('in'))
    return
  }
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
  targets.forEach((el) => io.observe(el))
}

/* ---- The Velox scan demo: folder scan → tasks materialise ---- */
function setVeloxFinal(app) {
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

function runVeloxDemo(app) {
  const tree = app.querySelector('[data-velox-tree]')
  const rows = Array.from(app.querySelectorAll('.vfile'))
  const tasks = Array.from(app.querySelectorAll('[data-vtask]'))
  const fileCountEl = app.querySelector('[data-velox-filecount]')
  const taskCountEl = app.querySelector('[data-velox-taskcount]')
  const badgeText = app.querySelector('[data-velox-badge-text]')
  const timers = []
  const later = (fn, ms) => timers.push(window.setTimeout(fn, ms))

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

function initVeloxDemo() {
  const app = document.querySelector('[data-velox]')
  if (!app) return
  if (prefersReduced || !supportsIO) {
    setVeloxFinal(app)
    return
  }
  let started = false
  const start = () => {
    if (started) return
    started = true
    runVeloxDemo(app)
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
  // The hero demo is meant to play on arrival — fall back to a timer so it
  // always runs even if it loads partly below the fold (narrow viewports).
  window.setTimeout(start, 1100)
}

/* ---- Cinematic backdrop videos: play only when motion is allowed.
   Under reduced-motion they stay paused, so the poster (the still) shows.
   Each plays when it nears the viewport to avoid loading all up front. */
function initBgVideos() {
  if (prefersReduced) return
  const vids = Array.from(document.querySelectorAll('video[data-bgvideo]'))
  if (!vids.length) return
  const play = (v) => {
    try {
      const p = v.play()
      if (p && p.catch) p.catch(() => {})
    } catch (_) {
      /* autoplay may be blocked; poster stays */
    }
  }
  if (!supportsIO) {
    vids.forEach(play)
    return
  }
  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        play(e.target)
        obs.unobserve(e.target)
      })
    },
    { rootMargin: '200px' }
  )
  vids.forEach((v) => io.observe(v))
}

/* ---- Cinematic backdrops drift on scroll (gentle parallax) ----
   rAF-throttled, only runs while scrolling, so the page settles to a
   stable frame when idle. Disabled entirely under reduced-motion. */
function initParallax() {
  if (prefersReduced) return
  const layers = Array.from(document.querySelectorAll('[data-parallax]'))
  if (!layers.length) return
  let ticking = false
  const update = () => {
    const vh = window.innerHeight || 1
    for (const el of layers) {
      const amp = parseFloat(el.getAttribute('data-parallax')) || 26
      const host = el.parentElement
      if (!host) continue
      const rect = host.getBoundingClientRect()
      const offset = (rect.top + rect.height / 2 - vh / 2) / vh
      el.style.transform = 'translate3d(0,' + (-offset * amp).toFixed(1) + 'px,0)'
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
}

/* ---- Header gains a glass backing once you leave the hero ---- */
function initHeaderState() {
  const header = document.getElementById('siteHeader')
  if (!header) return
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 60)
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
}

/* ---- Boot ---- */
try {
  initReveals()
  initVeloxDemo()
  initParallax()
  initBgVideos()
} catch (err) {
  // Never leave content hidden if the animation layer fails
  console.error('[htl] init failed, falling back to static:', err)
  html.classList.add('reveal-fallback')
  const app = document.querySelector('[data-velox]')
  if (app) setVeloxFinal(app)
}

initHeaderState()
