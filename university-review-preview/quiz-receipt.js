/* A receipt for a completed, objectively graded quiz. No scores or attempts are generated here. */
(() => {
  'use strict';

  // Exact feed positions/times from the approved printer component.
  const FEED_VALUES = [null, -91, -91, -81, -81, -70, -70, -58, -58, -45, -45, -32, -32, -20, -20, -10, -10, -3, -3, 0];
  const FEED_TIMES = [0, .075, .105, .18, .21, .285, .315, .39, .42, .495, .525, .6, .63, .705, .735, .81, .84, .915, .945, 1];
  const FEED_MS = 1750;
  const ZOOM_MS = 620;
  const CLOSE_MS = 450;
  const EASE_OUT = 'cubic-bezier(.23,1,.32,1)';
  const timers = new Set();
  const animations = new Set();
  let generation = 0;
  let nodes = null;
  let phase = 'idle';
  let reduced = false;
  let placeholder = null;
  let restoreFocus = null;
  let modalActive = false;
  let inertSnapshot = [];
  let bodyOverflow = '';
  let zoomAnimation = null;
  let modalGesture = null;
  let lastTouchAt = -Infinity;

  const ar = value => Number(value).toLocaleString('ar-EG');
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function later(callback, delay) {
    const current = generation;
    const id = setTimeout(() => {
      timers.delete(id);
      if (current === generation) callback();
    }, delay);
    timers.add(id);
    return id;
  }
  function clearWork() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const animation of animations) animation.cancel();
    animations.clear();
    zoomAnimation = null;
    modalGesture = null;
    lastTouchAt = -Infinity;
  }
  function animate(node, frames, options) {
    if (typeof node.animate !== 'function') return null;
    try {
      const animation = node.animate(frames, options);
      // Cancellation rejects WAAPI's finished promise, including when a new quiz interrupts it.
      if (animation.finished && typeof animation.finished.catch === 'function') {
        animation.finished.catch(() => {});
      }
      animations.add(animation);
      return animation;
    } catch (_) { return null; }
  }
  function stopAnimation(animation) {
    if (!animation) return;
    animation.cancel();
    animations.delete(animation);
    if (animation === zoomAnimation) zoomAnimation = null;
  }
  function setPhase(value) {
    phase = value;
    if (nodes) nodes.root.dataset.phase = value;
  }
  function zigzag() {
    const points = ['0 0', '100% 0', '100% calc(100% - 4px)'];
    for (let i = 0; i < 80; i++) {
      points.push(`${100 - (i + 1) * 100 / 80}% ${i % 2 === 0 ? '100%' : 'calc(100% - 4px)'}`);
    }
    return `polygon(${points.join(',')})`;
  }
  function readyIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'rp-check');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.4');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M8 12.5l2.7 2.7L16 9.8');
    svg.append(circle, path);
    return svg;
  }
  function stage(name) {
    const ready = name === 'complete';
    nodes.root.dataset.stage = name;
    nodes.label.textContent = ready ? 'النتيجة جاهزة' : name === 'printing' ? 'جاري الطباعة' : 'جاري تجهيز النتيجة';
    nodes.icon.replaceChildren(ready ? readyIcon() : element('span', 'rp-spin'));
    nodes.paper.setAttribute('aria-hidden', ready ? 'false' : 'true');
    nodes.root.classList.toggle('is-complete', ready);
  }
  function init() {
    if (nodes) return;
    const root = element('section', 'rp');
    root.id = 'quiz-receipt';
    root.setAttribute('dir', 'rtl');
    root.setAttribute('aria-label', 'فاتورة نتيجة الاختبار');
    const machine = element('div', 'rp-machine');
    const header = element('div', 'rp-machine-header');
    header.append(element('span', 'rp-machine-name', 'مراجعة ميد ١'));
    const power = element('span', 'rp-power');
    power.setAttribute('aria-hidden', 'true');
    header.append(power);
    const screen = element('div', 'rp-screen');
    const screenTitle = element('div', 'rp-screen-title', 'نتيجة الاختبار');
    const status = element('div', 'rp-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    const icon = element('span', 'rp-icon');
    icon.setAttribute('aria-hidden', 'true');
    const label = element('span', 'rp-label');
    status.append(icon, label);
    const slot = element('div', 'rp-slot');
    slot.setAttribute('aria-hidden', 'true');
    const mask = element('div', 'rp-mask');
    const paper = element('article', 'rp-paper');
    paper.style.clipPath = zigzag();
    paper.setAttribute('aria-labelledby', 'quiz-receipt-title');
    mask.append(paper);
    screen.append(screenTitle, status);
    machine.append(header, screen, slot);
    root.append(machine, mask);

    const modal = element('dialog', 'rp-modal');
    modal.id = 'quiz-receipt-modal';
    modal.setAttribute('dir', 'rtl');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'quiz-receipt-title');
    modal.setAttribute('aria-describedby', 'quiz-receipt-dismiss-hint');
    const backdrop = element('div', 'rp-backdrop');
    backdrop.setAttribute('aria-hidden', 'true');
    const frame = element('div', 'rp-modal-frame');
    const close = element('button', 'rp-close', 'إغلاق ×');
    close.setAttribute('type', 'button');
    close.setAttribute('aria-label', 'إغلاق فاتورة النتيجة');
    const hint = element('p', 'rp-sr-only', 'مرّر لقراءة جميع الأسئلة. اضغط في أي مكان أو مفتاح Escape لإغلاق الفاتورة.');
    hint.id = 'quiz-receipt-dismiss-hint';
    const scroll = element('div', 'rp-modal-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'document');
    scroll.setAttribute('aria-label', 'تفاصيل نتيجة الاختبار');
    frame.append(close, scroll, hint);
    modal.append(backdrop, frame);
    modal.hidden = true;
    root.hidden = true;
    modal.addEventListener('click', onModalClick);
    modal.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
    modal.addEventListener('pointerdown', startModalGesture, {passive: true});
    modal.addEventListener('pointermove', moveModalGesture, {passive: true});
    modal.addEventListener('pointerup', endModalGesture, {passive: true});
    modal.addEventListener('pointercancel', cancelModalGesture, {passive: true});
    scroll.addEventListener('scroll', () => moveModalGesture({}), {passive: true});
    if (!window.PointerEvent) {
      // Older touch browsers can emit compatibility mouse events after a scroll.
      const touchEvent = event => {
        const touch = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]);
        return touch ? {clientX: touch.clientX, clientY: touch.clientY, pointerId: touch.identifier} : {};
      };
      modal.addEventListener('touchstart', event => {
        lastTouchAt = Date.now();
        startModalGesture(touchEvent(event));
        if (event.touches && event.touches.length > 1) cancelModalGesture();
      }, {passive: true});
      modal.addEventListener('touchmove', event => { lastTouchAt = Date.now(); moveModalGesture(touchEvent(event)); }, {passive: true});
      modal.addEventListener('touchend', event => { lastTouchAt = Date.now(); endModalGesture(touchEvent(event)); }, {passive: true});
      modal.addEventListener('touchcancel', () => { lastTouchAt = Date.now(); cancelModalGesture(); }, {passive: true});
      modal.addEventListener('mousedown', event => { if (Date.now() - lastTouchAt > 800) startModalGesture(event); }, {passive: true});
      modal.addEventListener('mousemove', event => { if (Date.now() - lastTouchAt > 800) moveModalGesture(event); }, {passive: true});
      modal.addEventListener('mouseup', event => { if (Date.now() - lastTouchAt > 800) endModalGesture(event); }, {passive: true});
    }
    document.body.append(modal);
    nodes = {root, machine, header, screen, status, icon, label, slot, mask, paper, modal, backdrop, frame, close, scroll};
  }
  function startModalGesture(event) {
    if (!modalActive || event.button > 0) return;
    if (modalGesture && modalGesture.active) { modalGesture.moved = true; return; }
    modalGesture = {x: event.clientX, y: event.clientY, pointerId: event.pointerId, scrollTop: nodes.scroll.scrollTop || 0, moved: false, active: true};
  }
  function moveModalGesture(event) {
    if (!modalGesture) return;
    if (event.pointerId !== undefined && modalGesture.pointerId !== undefined && event.pointerId !== modalGesture.pointerId) return;
    const distance = Math.hypot(event.clientX - modalGesture.x, event.clientY - modalGesture.y);
    if (distance > 10 || Math.abs((nodes.scroll.scrollTop || 0) - modalGesture.scrollTop) > 10) modalGesture.moved = true;
  }
  function endModalGesture(event) {
    moveModalGesture(event);
    if (modalGesture) modalGesture.active = false;
  }
  function cancelModalGesture() {
    if (modalGesture) { modalGesture.moved = true; modalGesture.active = false; }
  }
  function onModalClick(event) {
    // Keyboard/assistive activation has detail 0 and must remain usable after a canceled drag.
    if (event.detail !== 0) {
      moveModalGesture(event);
      if (modalGesture && modalGesture.moved) {
        event.preventDefault();
        event.stopImmediatePropagation();
        modalGesture = null;
        return;
      }
    }
    modalGesture = null;
    dismiss();
  }
  function validResult(input) {
    if (!input || typeof input.setLabel !== 'string' || !input.setLabel.trim()) return null;
    if (!Number.isSafeInteger(input.attemptNumber) || input.attemptNumber < 1) return null;
    if (!Array.isArray(input.items) || !input.items.length) return null;
    if (input.items.some(item => !item || typeof item.question !== 'string' || !item.question.trim() || typeof item.correct !== 'boolean')) return null;
    if (input.startedAt === null || input.startedAt === undefined || input.completedAt === null || input.completedAt === undefined) return null;
    const startedAt = new Date(input.startedAt).getTime();
    const completedAt = new Date(input.completedAt).getTime();
    const measuredElapsed = input.elapsedSeconds !== undefined;
    if (measuredElapsed && (!Number.isFinite(input.elapsedSeconds) || input.elapsedSeconds < 0)) return null;
    if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || (!measuredElapsed && completedAt < startedAt)) return null;
    return {
      setLabel: input.setLabel,
      completedAt,
      // Prefer the quiz's monotonic measurement when available; wall-clock dates remain for display.
      seconds: Math.floor(measuredElapsed ? input.elapsedSeconds : (completedAt - startedAt) / 1000),
      attemptNumber: input.attemptNumber,
      items: input.items.map(item => ({question: item.question, correct: item.correct}))
    };
  }
  function fill(result) {
    const total = result.items.length;
    const correct = result.items.filter(item => item.correct).length;
    const percent = Math.round(correct / total * 100);
    const paper = nodes.paper;
    paper.replaceChildren();
    const title = element('h3', '', 'نتيجة الاختبار');
    title.id = 'quiz-receipt-title';
    const date = new Date(result.completedAt);
    const subtitle = element('div', 'rp-sub', `${result.setLabel} · ${date.toLocaleDateString('ar-EG')} ${date.toLocaleTimeString('ar-EG', {hour: '2-digit', minute: '2-digit'})}`);
    paper.append(title, subtitle);
    const rule = () => paper.append(element('hr', 'rp-hr'));
    function row(label, value, field, extra = '') {
      const wrapper = element('div', `rp-row ${extra}`.trim());
      const content = element('span', '', value);
      content.dataset.field = field;
      wrapper.append(element('span', '', label), content);
      paper.append(wrapper);
    }
    rule();
    row('عدد الأسئلة', ar(total), 'total');
    row('صحيحة', ar(correct), 'correct');
    row('خاطئة', ar(total - correct), 'wrong');
    row('الوقت', `${ar(Math.floor(result.seconds / 60))}:${String(result.seconds % 60).padStart(2, '0').replace(/\d/g, digit => ar(digit))}`, 'elapsed');
    paper.dataset.elapsedSeconds = String(result.seconds);
    paper.dataset.completedAt = String(result.completedAt);
    rule();
    row('النتيجة', `${ar(percent)}٪`, 'percent', 'rp-total');
    rule();
    const list = element('ol', 'rp-items');
    result.items.forEach(item => {
      const entry = element('li', `rp-item ${item.correct ? 'ok' : 'bad'}`);
      const mark = element('b', '', item.correct ? '✓' : '✗');
      mark.setAttribute('aria-hidden', 'true');
      entry.append(mark, element('span', 'rp-sr-only', item.correct ? 'صحيحة: ' : 'خاطئة: '), element('span', 'rp-question', item.question));
      list.append(entry);
    });
    paper.append(list);
    rule();
    const attempt = element('div', 'rp-sub rp-attempt', `المحاولة رقم ${ar(result.attemptNumber)}`);
    attempt.dataset.attemptNumber = String(result.attemptNumber);
    const barcode = element('div', 'rp-bar');
    barcode.setAttribute('aria-hidden', 'true');
    paper.append(attempt, barcode);
  }
  function feed() {
    setPhase('printing');
    stage('printing');
    nodes.paper.style.visibility = 'visible';
    if (reduced) { finishPrinting(); return; }
    const frames = FEED_VALUES.map((value, i) => ({
      transform: value === null ? 'translateY(calc(-100% + 2px))' : `translateY(${value}%)`,
      offset: FEED_TIMES[i]
    }));
    const animation = animate(nodes.paper, frames, {duration: FEED_MS, easing: 'linear', fill: 'forwards'});
    if (!animation) {
      // Match the same movement and pause boundaries without requiring WAAPI.
      frames.slice(1).forEach((frame, index) => {
        if (frame.transform === frames[index].transform) return;
        later(() => {
          const duration = (frame.offset - frames[index].offset) * FEED_MS;
          nodes.paper.style.transition = `transform ${duration.toFixed(2)}ms linear`;
          nodes.paper.style.transform = frame.transform;
        }, frames[index].offset * FEED_MS);
      });
    }
    later(() => { stopAnimation(animation); finishPrinting(); }, FEED_MS);
  }
  function finishPrinting() {
    nodes.paper.style.transition = '';
    nodes.paper.style.transform = 'translateY(0)';
    setPhase('ready');
    stage('complete');
    if (reduced) zoomIn();
    else later(zoomIn, 400);
  }
  function onKey(event) {
    if (!modalActive) return;
    // Do not let the study page's shortcuts handle keys while the receipt is open.
    event.stopImmediatePropagation();
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
    else if (event.key === 'Tab') {
      event.preventDefault();
      const next = document.activeElement === nodes.close ? nodes.scroll : nodes.close;
      next.focus({preventScroll: true});
    }
  }
  function onFocus(event) {
    if (modalActive && !nodes.modal.contains(event.target)) nodes.scroll.focus({preventScroll: true});
  }
  function openModal() {
    restoreFocus = restoreFocus || document.activeElement;
    bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inertSnapshot = Array.from(document.body.children).filter(node => node !== nodes.modal).map(node => ({node, inert: node.inert}));
    inertSnapshot.forEach(({node}) => { node.inert = true; });
    nodes.modal.hidden = false;
    if (typeof nodes.modal.showModal === 'function') nodes.modal.showModal();
    else nodes.modal.setAttribute('open', '');
    modalActive = true;
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus, true);
    window.addEventListener?.('resize', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    nodes.scroll.focus({preventScroll: true});
  }
  function zoomTransform(from, to) {
    const scale = from.width && to.width ? from.width / to.width : 1;
    // Use the visible printer height as the origin; a long receipt never scales down to fit its text.
    const visibleHeight = Math.min(from.height, nodes.mask.getBoundingClientRect().height || from.height);
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + visibleHeight / 2 - (to.top + to.height / 2);
    return `translate(${dx}px,${dy}px) scale(${scale})`;
  }
  function fitModal(paperWidth) {
    const width = paperWidth || Math.max(0, nodes.mask.getBoundingClientRect().width - 48);
    // Leave room for a single 4.5% overshoot; long receipts scroll instead of shrinking.
    nodes.frame.style.width = `${Math.min((window.innerWidth || 1024) * .88, Math.max(320, width * 1.9), 576)}px`;
  }
  function onViewportChange() {
    if (!modalActive) return;
    const wasDismissing = phase === 'dismissing';
    const gesture = modalGesture, touchAt = lastTouchAt;
    generation++;
    clearWork();
    // Mobile viewport changes can occur during a scroll; retain its click-suppression guard.
    if (!wasDismissing) { modalGesture = gesture; lastTouchAt = touchAt; }
    nodes.frame.style.transition = '';
    nodes.frame.style.transform = '';
    if (wasDismissing) { closeModal(true); setPhase('ready'); return; }
    fitModal();
    setPhase('expanded');
  }
  function zoomIn() {
    setPhase('zooming');
    const source = nodes.paper.getBoundingClientRect();
    placeholder = element('div', 'rp-placeholder');
    placeholder.style.height = `${source.height}px`;
    placeholder.setAttribute('aria-hidden', 'true');
    nodes.mask.insertBefore(placeholder, nodes.paper);
    nodes.scroll.append(nodes.paper);
    nodes.scroll.scrollTop = 0;
    nodes.frame.style.transform = '';
    fitModal(source.width);
    openModal();
    const target = nodes.frame.getBoundingClientRect();
    nodes.backdrop.classList.add('on');
    if (reduced) { setPhase('expanded'); return; }
    const initial = `${zoomTransform(source, target)} rotate(-3deg)`;
    zoomAnimation = animate(nodes.frame, [
      {transform: initial, offset: 0},
      {transform: 'translateY(-3px) scale(1.045) rotate(.6deg)', offset: .72},
      {transform: 'scale(.995) rotate(-.15deg)', offset: .9},
      {transform: 'none', offset: 1}
    ], {duration: ZOOM_MS, easing: EASE_OUT, fill: 'forwards'});
    if (!zoomAnimation) {
      nodes.frame.style.transition = 'none';
      nodes.frame.style.transform = initial;
      void nodes.frame.offsetHeight;
      nodes.frame.style.transition = `transform ${ZOOM_MS}ms cubic-bezier(.2,1.2,.3,1)`;
      nodes.frame.style.transform = 'none';
    }
    later(() => {
      stopAnimation(zoomAnimation);
      nodes.frame.style.transition = '';
      nodes.frame.style.transform = '';
      setPhase('expanded');
    }, ZOOM_MS);
  }
  function closeModal(shouldRestoreFocus) {
    if (!nodes) return;
    const wasActive = modalActive;
    modalActive = false;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('focusin', onFocus, true);
    window.removeEventListener?.('resize', onViewportChange);
    window.visualViewport?.removeEventListener('resize', onViewportChange);
    if (nodes.modal.open && typeof nodes.modal.close === 'function') nodes.modal.close();
    else nodes.modal.removeAttribute('open');
    nodes.modal.hidden = true;
    nodes.backdrop.classList.remove('on');
    nodes.frame.style.transition = '';
    nodes.frame.style.transform = '';
    if (placeholder) {
      nodes.mask.insertBefore(nodes.paper, placeholder);
      placeholder.remove();
      placeholder = null;
    }
    if (wasActive) {
      document.body.style.overflow = bodyOverflow;
      inertSnapshot.forEach(({node, inert}) => { node.inert = inert; });
      inertSnapshot = [];
      const target = restoreFocus;
      if (shouldRestoreFocus && target && typeof target.focus === 'function' && document.documentElement.contains(target) && !target.inert) {
        target.focus({preventScroll: true});
      }
    }
  }
  function dismiss() {
    if (!modalActive || phase === 'dismissing') return;
    // Snapshot the interpolated pose before cancellation to avoid a jump on an early tap.
    const currentTransform = window.getComputedStyle?.(nodes.frame).transform || nodes.frame.style.transform || 'none';
    generation++;
    clearWork();
    setPhase('dismissing');
    nodes.backdrop.classList.remove('on');
    const finish = () => { closeModal(true); setPhase('ready'); };
    if (reduced) { finish(); return; }
    // Measure the destination in its untransformed layout, including the CSS-only fallback.
    nodes.frame.style.transition = 'none';
    nodes.frame.style.transform = 'none';
    const target = nodes.frame.getBoundingClientRect();
    const source = placeholder.getBoundingClientRect();
    const finalTransform = zoomTransform(source, target);
    zoomAnimation = animate(nodes.frame, [{transform: currentTransform}, {transform: finalTransform}], {duration: CLOSE_MS, easing: EASE_OUT, fill: 'forwards'});
    if (!zoomAnimation) {
      nodes.frame.style.transition = 'none';
      nodes.frame.style.transform = currentTransform;
      void nodes.frame.offsetHeight;
      nodes.frame.style.transition = `transform ${CLOSE_MS}ms ${EASE_OUT}`;
      nodes.frame.style.transform = finalTransform;
    }
    later(() => { stopAnimation(zoomAnimation); finish(); }, CLOSE_MS);
  }
  function cancel(options = {}) {
    generation++;
    clearWork();
    closeModal(options.restoreFocus !== false);
    restoreFocus = null;
    if (nodes) {
      nodes.root.hidden = true;
      nodes.paper.style.transition = '';
      nodes.paper.style.transform = 'translateY(calc(-100% + 2px))';
      nodes.paper.style.visibility = 'hidden';
      nodes.paper.setAttribute('aria-hidden', 'true');
      nodes.root.classList.remove('is-complete');
    }
    setPhase('idle');
  }
  function show(input, options = {}) {
    cancel();
    const result = validResult(input);
    if (!result || !document.body) return false;
    init();
    const container = options.container || document.querySelector('#receipt-host') || document.querySelector('#results') || document.body;
    container.append(nodes.root);
    restoreFocus = options.returnFocus || null;
    reduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    nodes.root.classList.toggle('rp-reduced-motion', reduced);
    nodes.modal.classList.toggle('rp-reduced-motion', reduced);
    fill(result);
    nodes.root.hidden = false;
    nodes.mask.scrollTop = 0;
    nodes.paper.style.visibility = 'hidden';
    nodes.paper.style.transform = 'translateY(calc(-100% + 2px))';
    setPhase('processing');
    stage('processing');
    if (reduced) feed();
    else later(feed, 800);
    return true;
  }

  window.QuizReceipt = Object.freeze({show, cancel, dismiss});
})();
