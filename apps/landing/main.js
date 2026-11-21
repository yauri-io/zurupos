// Phones: show the WhatsApp button at the bottom once the hero button has
// scrolled out of view, and hide it again near the final one.
;(() => {
  const sticky = document.getElementById('sticky-cta')
  const hero = document.getElementById('hero-cta')
  const final = document.querySelector('.final')
  if (!sticky || !hero || !final || !('IntersectionObserver' in window)) return
  let heroVisible = true
  let finalVisible = false
  const update = () => {
    const show = !heroVisible && !finalVisible
    sticky.hidden = !show
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
})()
