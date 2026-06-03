/* motion.js — Mealzy editorial animations
   ~50 lines, vanilla JS, respects prefers-reduced-motion */
(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Scroll reveal with optional stagger ---- */
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const delay = +(e.target.dataset.delay || 0);
        setTimeout(() => e.target.classList.add('in-view'), delay);
        io.unobserve(e.target);
      });
    }, { threshold: 0.1 });

    /* Static .reveal elements */
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));

    /* Auto-stagger children of [data-stagger] parents */
    document.querySelectorAll('[data-stagger]').forEach(parent => {
      Array.from(parent.children).forEach((child, i) => {
        if (!child.classList.contains('reveal')) {
          child.classList.add('reveal');
          child.dataset.delay = i * 80;
        }
        io.observe(child);
      });
    });
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in-view'));
  }

  /* ---- Hero parallax ---- */
  const heroBg = document.querySelector('.hero__bg');
  if (heroBg && !reduced) {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        heroBg.style.transform = `translateY(${window.scrollY * 0.15}px)`;
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---- Nav scroll state ---- */
  const nav = document.querySelector('.nav');
  if (nav) {
    const tick = () => nav.classList.toggle('scrolled', window.scrollY > 24);
    window.addEventListener('scroll', tick, { passive: true });
    tick();
  }

  /* ---- FAQ accordion ---- */
  document.querySelectorAll('.faq-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });
})();
