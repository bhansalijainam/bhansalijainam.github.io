// Page behaviour and motion. The dots themselves live in scene.js, which is
// loaded separately so the page still works if WebGL or that import fails.

const root = document.documentElement;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
const wide = window.matchMedia('(min-width: 900px)');

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
// 0 at a, 1 at b (a may be greater than b)
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const INK = [17, 19, 42];
const PAPER = [237, 236, 231];
const TOTAL = 27000;

// What the dots should be doing. scene.js eases towards these values.
let stage = { formA: 1, formB: 0, formC: 0, build: 0, lock: 0, dust: 0, scroll: 0, loose: 1, ink: INK.slice(), accent: [244, 69, 47] };

/* ---------- text: word reveals and the scrubbed statement ---------- */

function splitWords(el, outer, inner) {
  let i = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(' '); continue; }
          const w = document.createElement('span');
          w.className = outer;
          if (inner) {
            const wi = document.createElement('span');
            wi.className = inner;
            wi.style.setProperty('--i', i);
            wi.textContent = part;
            w.append(wi);
          } else {
            w.textContent = part;
          }
          i += 1;
          frag.append(w);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') {
        walk(child);
      }
    }
  };
  walk(el);
}

$$('[data-words]').forEach((el) => splitWords(el, 'w', 'wi'));

const scrubEl = $('[data-scrub]');
let scrubWords = [];
if (scrubEl) {
  splitWords(scrubEl, 'sw');
  scrubWords = $$('.sw', scrubEl);
}

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.filter((e) => e.isIntersecting).forEach((e, i) => {
      e.target.style.setProperty('--d', `${i * 0.08}s`);
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
  $$('[data-reveal], [data-words]').forEach((el) => io.observe(el));

  // project diagrams animate only while on screen
  const live = new IntersectionObserver((entries) => {
    entries.forEach((e) => e.target.classList.toggle('is-live', e.isIntersecting && !reduce.matches));
  }, { threshold: 0.35 });
  $$('.card').forEach((el) => live.observe(el));
} else {
  $$('[data-reveal], [data-words]').forEach((el) => el.classList.add('is-in'));
}

/* ---------- hero load sequence ---------- */

$$('.hero-title .lni').forEach((el, i) => el.style.setProperty('--d', `${0.25 + i * 0.11}s`));
$$('[data-load]').forEach((el, i) => el.style.setProperty('--d', `${0.75 + i * 0.1}s`));

// "messy problems" arrives scrambled and settles letter by letter
function scramble(el, delay) {
  const final = el.textContent;
  const glyphs = '#%&$@?!<>/[]{}=+*';
  el.style.display = 'inline-block';
  el.style.width = `${el.getBoundingClientRect().width}px`;
  const start = performance.now() + delay;
  const duration = 950;
  let last = 0;
  const step = (now) => {
    const t = clamp((now - start) / duration);
    if (now - last > 55) {
      last = now;
      const settled = Math.floor(t * final.length);
      let out = final.slice(0, settled);
      for (let i = settled; i < final.length; i++) out += glyphs[Math.floor(Math.random() * glyphs.length)];
      el.textContent = out;
    }
    if (t < 1) { requestAnimationFrame(step); return; }
    el.textContent = final;
    el.style.width = '';
    el.style.display = '';
  };
  requestAnimationFrame(step);
}

const startIntro = () => {
  root.classList.add('is-loaded');
  if (!reduce.matches) $$('[data-scramble]').forEach((el, i) => scramble(el, 350 + i * 160));
};
if (document.fonts && document.fonts.ready) {
  // wait for the display face so the title does not reflow mid-animation, but never for long
  Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]).then(() => requestAnimationFrame(startIntro));
} else {
  requestAnimationFrame(startIntro);
}

/* ---------- nav, menu, theme ---------- */

const nav = $('#nav');
const menu = $('#menu');
const toggle = $('.nav-toggle');
const themed = $$('main [data-theme], .footer[data-theme]');
const navLinks = $$('.nav-links a');
const navTargets = navLinks.map((a) => $(a.getAttribute('href')));
let lastY = window.scrollY;

function setMenu(open) {
  if (open) menu.hidden = false;
  // next frame so the transition runs from the hidden state
  requestAnimationFrame(() => menu.classList.toggle('is-open', open));
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Close' : 'Menu';
  document.body.style.overflow = open ? 'hidden' : '';
  if (!open) setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, 400);
}
toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
$$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) setMenu(false); });

function updateNav(y, vh, m) {
  nav.classList.toggle('is-solid', y > 24);
  if (!menu.classList.contains('is-open')) {
    if (y > lastY + 4 && y > 160) nav.classList.add('is-hidden');
    else if (y < lastY - 4 || y < 160) nav.classList.remove('is-hidden');
  }
  lastY = y;

  // theme follows whichever section crosses the middle of the screen
  const mid = vh * 0.55;
  let theme = 'paper';
  for (let i = 0; i < themed.length; i++) {
    if (m.themed[i].top <= mid && m.themed[i].bottom > mid) { theme = themed[i].dataset.theme; break; }
  }
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  stage.ink = theme === 'ink' ? PAPER : INK;

  let active = -1;
  m.nav.forEach((r, i) => { if (r && r.top <= vh * 0.45) active = i; });
  navLinks.forEach((a, i) => a.classList.toggle('is-active', i === active));
}

/* ---------- pinned sections ---------- */

const hero = $('.hero');
const processEl = $('#process');
const steps = $$('.step');
const readCount = $('#read-count');
const scroller = $('#work-scroller');
const track = $('#work-track');
const workBar = $('#work-bar');
const contact = $('#contact');
const fmt = new Intl.NumberFormat('en-US');

let pinOn = false;
let workDist = 0;
let workP = 0;

function layout() {
  pinOn = wide.matches && !reduce.matches;
  root.classList.toggle('pin-on', pinOn);
  if (pinOn) {
    const last = track.lastElementChild;
    const gutter = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    workDist = Math.max(0, last.offsetLeft + last.offsetWidth + gutter - window.innerWidth);
    scroller.style.height = `${window.innerHeight + workDist}px`;
  } else {
    workDist = 0;
    scroller.style.height = '';
    track.style.transform = '';
    steps.forEach((s) => s.classList.remove('is-active', 'is-done'));
  }
}

function updateProcess(vh, r) {
  if (!pinOn) {
    // not pinned (phones, reduced motion): the stack assembles as its slot travels up the screen
    const centre = (r.top + r.height / 2) / vh;
    stage.formB = smooth(1.05, 0.8, r.top / vh) * (1 - smooth(0.45, 0.05, r.bottom / vh));
    stage.build = reduce.matches ? 1 : clamp((0.98 - centre) / 0.62);
    stage.lock = 0;
    return;
  }
  const q = clamp(-r.top / Math.max(1, r.height - vh));
  stage.formB = smooth(0.95, 0.3, r.top / vh) * (1 - smooth(0.72, 0.22, r.bottom / vh));
  stage.build = clamp((q - 0.03) / 0.8);
  stage.lock = smooth(0.87, 0.97, q);

  const idx = Math.min(3, Math.floor(stage.build * 4));
  steps.forEach((s, i) => {
    s.classList.toggle('is-active', i === idx);
    s.classList.toggle('is-done', i < idx);
  });
  // the share of dots that have reached their site (mirrors the timing in scene.js)
  let placed = 0;
  for (let layer = 0; layer < 4; layer++) placed += clamp((stage.build - 0.06 - layer * 0.25) / 0.1);
  const count = fmt.format(Math.round((placed / 4) * TOTAL));
  if (readCount.textContent !== count) readCount.textContent = count;
}

function updateWork(vh, r) {
  if (!pinOn) return;
  const p = clamp(-r.top / Math.max(1, r.height - vh));
  workP += (p - workP) * 0.14;
  if (Math.abs(p - workP) < 0.0004) workP = p;
  track.style.transform = `translate3d(${(-workP * workDist).toFixed(1)}px,0,0)`;
  workBar.style.transform = `scaleX(${workP.toFixed(4)})`;
}

function updateScrub(vh, r) {
  if (!scrubWords.length || reduce.matches) return;
  // fully lit by the time the paragraph reaches the middle of the screen
  const p = clamp((vh * 0.88 - r.top) / (vh * 0.52));
  const head = p * (scrubWords.length + 4);
  scrubWords.forEach((w, i) => {
    const o = clamp(head - i, 0.14, 1).toFixed(2);
    if (w.dataset.o !== o) { w.dataset.o = o; w.style.setProperty('--o', o); }
  });
}

/* ---------- toolkit marquee ---------- */

const marquees = $$('[data-marquee]').map((el) => {
  const inner = $('.mq-in', el);
  const original = [...inner.children];
  // repeat the row so it always overflows the screen; copies are hidden from assistive tech
  for (let k = 0; k < 3; k++) {
    original.forEach((node) => {
      const copy = node.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      inner.append(copy);
    });
  }
  return { inner, dir: Number(el.dataset.marquee), x: 0, span: 0 };
});
const measureMarquees = () => marquees.forEach((m) => { m.span = m.inner.scrollWidth / 4; });

function updateMarquees(dt, velocity) {
  if (reduce.matches) return;
  marquees.forEach((m) => {
    if (!m.span) return;
    m.x += m.dir * (38 * dt + velocity * 0.45);
    m.x = ((m.x % m.span) + m.span) % m.span;
    m.inner.style.transform = `translate3d(${(m.x - m.span).toFixed(1)}px,0,0)`;
  });
}

/* ---------- pointer: magnetic button and the work cursor ---------- */

const cursor = $('#cursor');
const cursorLabel = $('span', cursor);
const mouse = { x: -200, y: -200, cx: -200, cy: -200 };

if (fine.matches) {
  window.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

  $$('[data-cursor]').forEach((el) => {
    el.addEventListener('pointerenter', () => { cursorLabel.textContent = el.dataset.cursor; cursor.classList.add('is-on'); });
    el.addEventListener('pointerleave', () => cursor.classList.remove('is-on'));
  });

  if (!reduce.matches) {
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * 0.28;
        const y = (e.clientY - (r.top + r.height / 2)) * 0.4;
        el.style.transition = 'color 0.35s, transform 0.15s linear';
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      });
      el.addEventListener('pointerleave', () => {
        el.style.transition = 'color 0.35s, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)';
        el.style.transform = '';
      });
    });
  }
}

/* ---------- small things: clock, copy, year ---------- */

const clocks = $$('[data-clock]');
const clockFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' });
const tickClock = () => { const t = clockFmt.format(new Date()); clocks.forEach((c) => { c.textContent = t; }); };
tickClock();
setInterval(tickClock, 20000);

$$('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied';
      btn.classList.add('is-done');
    } catch {
      // clipboard blocked: select the address so it can be copied by hand
      const range = document.createRange();
      range.selectNodeContents($('#mail'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = 'Selected';
    }
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('is-done'); }, 1800);
  });
});

$('#year').textContent = new Date().getFullYear();

/* ---------- main loop ---------- */

const processSlot = $('#slot-stack');
let smoothY = window.scrollY;
let prevT = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - prevT) / 1000);
  prevT = now;
  const y = window.scrollY;
  const vh = window.innerHeight;

  // read everything first, then write, so the browser lays out once per frame
  const m = {
    hero: hero.getBoundingClientRect(),
    process: (pinOn ? processEl : processSlot).getBoundingClientRect(),
    work: scroller.getBoundingClientRect(),
    contact: contact.getBoundingClientRect(),
    scrub: scrubEl ? scrubEl.getBoundingClientRect() : null,
    themed: themed.map((el) => el.getBoundingClientRect()),
    nav: navTargets.map((el) => (el ? el.getBoundingClientRect() : null)),
  };

  const before = smoothY;
  smoothY += (y - smoothY) * (reduce.matches ? 1 : 0.14);
  const velocity = smoothY - before;

  updateNav(y, vh, m);
  updateProcess(vh, m.process);
  updateWork(vh, m.work);
  if (m.scrub) updateScrub(vh, m.scrub);
  updateMarquees(dt, velocity);

  // the portrait holds while the hero is on screen, then lets go
  stage.formA = 1 - smooth(0.18, 0.78, -m.hero.top / Math.max(1, m.hero.height * 0.9));
  // the globe gathers as the contact section arrives
  stage.formC = smooth(0.92, 0.3, m.contact.top / vh);
  stage.scroll = (smoothY / vh) * 0.9;
  // loose dots show only on the dark sections, as a sparse field
  stage.dust = root.dataset.theme === 'ink' ? 0.42 : 0;
  stage.loose = wide.matches ? 1 : 0.5;

  if (fine.matches) {
    mouse.cx += (mouse.x - mouse.cx) * 0.18;
    mouse.cy += (mouse.y - mouse.cy) * 0.18;
    cursor.style.transform = `translate3d(${mouse.cx.toFixed(1)}px, ${mouse.cy.toFixed(1)}px, 0)`;
  }
}

const relayout = () => { layout(); measureMarquees(); };
relayout();
window.addEventListener('resize', relayout);
window.addEventListener('load', relayout);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
wide.addEventListener('change', relayout);
reduce.addEventListener('change', relayout);
requestAnimationFrame(frame);

/* ---------- the dots ---------- */

import('./scene.js')
  .then(({ createScene }) => createScene({
    canvas: $('#scene'),
    slots: { portrait: $('#slot-portrait'), lattice: $('#slot-stack'), globe: $('#slot-globe') },
    reduceMotion: reduce,
  }))
  .then((scene) => {
    Object.assign(scene.stage, stage);
    stage = scene.stage;
  })
  .catch((err) => {
    console.warn('Dots unavailable:', err);
    root.classList.add('no-gl');
  });
