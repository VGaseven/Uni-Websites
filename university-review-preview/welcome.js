(() => {
  'use strict';
  const welcome = document.getElementById('welcome');
  const start = document.getElementById('start-studying');
  const study = document.getElementById('study');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer;
  let fallback;
  let closing = false;
  welcome.hidden = false;

  function finish() {
    clearTimeout(timer);
    clearTimeout(fallback);
    welcome.hidden = true;
    welcome.inert = true;
    welcome.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('focusin', onFocus, true);
  }
  function dismiss(immediate = false) {
    if (closing) { if (immediate) finish(); return; }
    closing = true;
    clearTimeout(timer);
    if (welcome.contains(document.activeElement)) study.focus({preventScroll:true});
    welcome.inert = true;
    welcome.setAttribute('aria-hidden', 'true');
    if (immediate || reducedMotion) { finish(); return; }
    welcome.classList.add('is-leaving');
    fallback = setTimeout(finish, 1250);
  }
  function onKey(event) {
    if (event.key === 'Tab') { dismiss(true); return; }
    if (['Escape', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      dismiss(true);
      study.focus({preventScroll:true});
    }
  }
  function onFocus(event) { if (!welcome.contains(event.target)) dismiss(true); }
  start.addEventListener('click', () => dismiss());
  welcome.addEventListener('transitionend', event => { if (event.target === welcome && event.propertyName === 'opacity') finish(); });
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('focusin', onFocus, true);
  timer = setTimeout(() => dismiss(), 3800);
})();
