// Page behaviour. The 3D scene lives in scene.js and is loaded separately so
// the page still works if WebGL or the import fails.

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ---------- hero load sequence ---------- */

document.querySelectorAll('[data-load]').forEach((el, i) => {
  el.style.setProperty('--d', `${0.15 + i * 0.09}s`);
});
requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-loaded')));

/* ---------- reveal on scroll ---------- */

const revealEls = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    // stagger items that enter together
    entries.filter((e) => e.isIntersecting).forEach((e, i) => {
      e.target.style.setProperty('--d', `${i * 0.08}s`);
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('is-in'));
}

/* ---------- active nav link ---------- */

const navLinks = [...document.querySelectorAll('.nav-links a')];
const sections = navLinks.map((a) => document.querySelector(a.getAttribute('href')));

function updateNav() {
  const line = window.innerHeight * 0.4;
  let active = -1;
  sections.forEach((s, i) => {
    if (s && s.getBoundingClientRect().top <= line) active = i;
  });
  navLinks.forEach((a, i) => a.classList.toggle('is-active', i === active));
}

/* ---------- scroll state shared with the scene ---------- */

const pathList = document.getElementById('path-list');
const hero = document.querySelector('.hero');
const contact = document.getElementById('contact');
const nav = document.querySelector('.nav');

export const state = { progress: 0 };

function onScroll() {
  const max = root.scrollHeight - window.innerHeight;
  const y = window.scrollY;
  state.progress = max > 0 ? clamp(y / max) : 0;
  if (state.progress > 0.997) state.progress = 1;
  nav.classList.toggle('is-stuck', y > 8);

  // The landscape is the hero's image; behind long text it dims, then comes
  // back as the optimizer arrives at the minimum.
  const heroOut = smooth(0.25, 0.95, y / Math.max(1, hero.offsetHeight));
  const contactIn = smooth(0.6, 0.0, contact.getBoundingClientRect().top / window.innerHeight);
  root.style.setProperty('--veil', (heroOut * (0.76 - 0.14 * contactIn)).toFixed(3));

  if (pathList) {
    const r = pathList.getBoundingClientRect();
    const fill = clamp((window.innerHeight * 0.6 - r.top) / r.height);
    pathList.style.setProperty('--fill', fill.toFixed(4));
  }

  updateNav();
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
onScroll();

/* ---------- pointer tilt ---------- */

if (finePointer.matches && !reduceMotion.matches) {
  document.querySelectorAll('[data-tilt]').forEach((el) => {
    const isPortrait = el.classList.contains('portrait');
    const target = isPortrait ? el.querySelector('.portrait-frame') : el;
    const strength = isPortrait ? 7 : 14;

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      target.style.setProperty('--ry', `${(x * strength).toFixed(2)}deg`);
      target.style.setProperty('--rx', `${(-y * strength).toFixed(2)}deg`);
      if (isPortrait) target.style.setProperty('--px', `${(-x * 14).toFixed(1)}px`);
    });
    el.addEventListener('pointerleave', () => {
      target.style.setProperty('--ry', '0deg');
      target.style.setProperty('--rx', '0deg');
      if (isPortrait) target.style.setProperty('--px', '0px');
    });
  });
}

/* ---------- readouts ---------- */

const hudStep = document.getElementById('hud-step');
const hudLoss = document.getElementById('hud-loss');
const marker = document.getElementById('colorbar-marker');
const TOTAL_STEPS = 2400;
const START_LOSS = 2.303; // -ln(1/10): chance level on a 10-class problem

export function report(progress, loss) {
  hudStep.textContent = String(Math.round(progress * TOTAL_STEPS)).padStart(4, '0');
  hudLoss.textContent = loss.toFixed(3);
  marker.style.top = `${clamp(1 - loss / START_LOSS) * 100}%`;
}

document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- 3D scene ---------- */

import('./scene.js')
  .then((m) => m.start({
    canvas: document.getElementById('scene'),
    state,
    report,
    startLoss: START_LOSS,
    reduceMotion,
  }))
  .catch((err) => {
    // No WebGL: the CSS background stands in, and the readout follows scroll.
    console.warn('3D scene unavailable:', err);
    const tick = () => report(state.progress, START_LOSS * (1 - state.progress) ** 2);
    window.addEventListener('scroll', tick, { passive: true });
    tick();
  });
