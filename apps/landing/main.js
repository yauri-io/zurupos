// Landing page behaviour. The page works without it; the motion parts only run
// when the visitor hasn't asked for reduced motion (styles.css, "Motion").
;(() => {
  const motionOK = window.matchMedia('(prefers-reduced-motion: no-preference)').matches

  // Phones: slide the WhatsApp button in at the bottom once the hero button has
  // scrolled out of view, and away again near the final one.
  const stickyButton = () => {
    const sticky = document.getElementById('sticky-cta')
    const hero = document.getElementById('hero-cta')
    const final = document.querySelector('.final')
    if (!sticky || !hero || !final || !('IntersectionObserver' in window)) return
    sticky.hidden = false
    let heroVisible = true
    let finalVisible = false
    const update = () => {
      const show = !heroVisible && !finalVisible
      sticky.classList.toggle('is-shown', show)
      sticky.inert = !show
      document.body.classList.toggle('has-sticky', show)
    }
    new IntersectionObserver(([e]) => {
      heroVisible = e.isIntersecting
      update()
    }).observe(hero)
    new IntersectionObserver(([e]) => {
      finalVisible = e.isIntersecting
      update()
    }).observe(final)
  }

  // Below the fold, things rise in as they scroll into view. Anything already
  // on screen when this runs is left alone, so nothing blinks out and back.
  const reveals = () => {
    if (!('IntersectionObserver' in window)) return
    const items = document.querySelectorAll(
      [
        '.section h2',
        '.section-lead',
        '.cards > li',
        '.principles > li',
        '.plain-list > li',
        '.check-list > li',
        '.price-main',
        '.story-mark',
        '.story > div',
        '.final-box > *',
      ].join(','),
    )
    const seen = new Map()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('in')
          observer.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.15 },
    )
    for (const el of items) {
      if (el.getBoundingClientRect().top < window.innerHeight) continue
      const i = seen.get(el.parentElement) ?? 0
      seen.set(el.parentElement, i + 1)
      el.style.setProperty('--i', String(Math.min(i, 5)))
      el.classList.add('rv')
      observer.observe(el)
    }
  }

  // On phones the receipt starts below the fold: hold the print until it
  // scrolls into view, so it isn't over before anyone sees it.
  const printWhenSeen = () => {
    const figure = document.querySelector('.receipt-figure')
    if (!figure || !('IntersectionObserver' in window)) return
    if (figure.getBoundingClientRect().top < window.innerHeight * 0.8) return
    figure.classList.add('wait')
    const observer = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        figure.classList.remove('wait')
        observer.disconnect()
      },
      { threshold: 0.25 },
    )
    observer.observe(figure)
  }

  // The receipt's figures count up while it prints. Only if the print hasn't
  // started yet; otherwise the visitor already sees the final figures.
  const countUp = () => {
    const paper = document.querySelector('.receipt-edge')
    const print = paper?.getAnimations?.().find((a) => a.animationName === 'print')
    if (!print || (print.currentTime ?? 0) > 400) return
    const figures = [...document.querySelectorAll('[data-count]')].map((el) => ({
      el,
      target: Number(el.dataset.count),
      prefix: el.dataset.prefix ?? '',
    }))
    const show = (f, n) => {
      f.el.textContent = f.prefix + Math.round(n).toLocaleString('id-ID')
    }
    for (const f of figures) show(f, 0)
    const duration = 1100
    const easeOut = (t) => 1 - (1 - t) ** 3
    paper.addEventListener(
      'animationstart',
      () => {
        const start = performance.now() + 250
        const step = (now) => {
          const t = Math.min(1, Math.max(0, (now - start) / duration))
          for (const f of figures) show(f, f.target * easeOut(t))
          if (t < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      },
      { once: true },
    )
  }

  stickyButton()
  if (motionOK) {
    reveals()
    printWhenSeen()
    countUp()
  }
})()
