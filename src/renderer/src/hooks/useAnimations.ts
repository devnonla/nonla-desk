import AOS from 'aos'
import 'aos/dist/aos.css'

/**
 * Initialize AOS once at the app root.
 * Call this in main.tsx or App.tsx — runs once.
 */
export function initAOS() {
  AOS.init({
    duration: 400,
    easing: 'ease-out-cubic',
    once: true,
    offset: 20,
  })
}
