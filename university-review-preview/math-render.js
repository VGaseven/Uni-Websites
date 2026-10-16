/* Shared local KaTeX adapter. Only explicit $...$ / $$...$$ text is interpreted. */
(function (root) {
  'use strict';
  const MAX_FORMULA_LENGTH = 4000;
  // No source requires custom macros. Add only reviewed, source-needed definitions.
  const MACROS = Object.freeze({});
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'PRE', 'CODE', 'MATH', 'SVG']);

  function skipped(element) {
    if (!element || element.nodeType !== 1) return false;
    if (SKIP_TAGS.has(element.tagName) || element.isContentEditable || element.hasAttribute('data-no-math')) return true;
    const classes = String(element.getAttribute('class') || '').split(/\s+/);
    return classes.some(name => name === 'katex' || name === 'study-math' || /^quran(?:-|$)/.test(name));
  }

  function escaped(text, position) {
    let slashes = 0;
    while (position > 0 && text[--position] === '\\') slashes++;
    return slashes % 2 === 1;
  }

  // The exact same tokenizer and limits are used by the source check and the UI.
  // Delimiters never cross DOM nodes, preserving links, Quran spans and emphasis.
  function analyze(value) {
    const text = typeof value === 'string' ? value : '';
    const parts = [], issues = [];
    let plainStart = 0;
    for (let start = 0; start < text.length; start++) {
      if (text[start] !== '$' || escaped(text, start)) continue;
      const display = text[start + 1] === '$';
      const width = display ? 2 : 1;
      let depth = 0, end = -1;
      for (let i = start + width; i < text.length; i++) {
        if (!display && /[\r\n]/.test(text[i])) break;
        if (escaped(text, i)) continue;
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth = Math.max(0, depth - 1);
        else if (text[i] === '$' && depth === 0) {
          if (display && text[i + 1] === '$') { end = i; break; }
          if (!display && text[i + 1] !== '$') { end = i; break; }
        }
      }
      if (end < 0) {
        issues.push({ code: 'unclosed-delimiter', start, end: start + width });
        if (display) start++;
        continue;
      }
      const formula = text.slice(start + width, end);
      if (formula.trim() && formula.length <= MAX_FORMULA_LENGTH) {
        if (start > plainStart) parts.push({ text: text.slice(plainStart, start), start: plainStart, end: start });
        parts.push({ formula, display, raw: text.slice(start, end + width), start, end: end + width });
        plainStart = end + width;
      } else {
        issues.push({ code: formula.trim() ? 'formula-too-long' : 'empty-formula', start, end: end + width });
      }
      start = end + width - 1;
    }
    if (plainStart < text.length) parts.push({ text: text.slice(plainStart), start: plainStart, end: text.length });
    return { parts, issues };
  }

  function containsFormula(text, expression) {
    if (typeof expression !== 'string' || !expression.trim()) return false;
    return analyze(text).parts.some(part => part.formula !== undefined && part.formula.trim() === expression.trim());
  }

  function options(display) {
    return {
      displayMode: display === true,
      output: 'htmlAndMathml',
      throwOnError: true,
      trust: false,
      strict: 'error',
      maxSize: 20,
      maxExpand: 1000,
      globalGroup: false,
      // KaTeX may mutate macros while parsing. Never share this object across formulas.
      macros: { ...MACROS }
    };
  }

  function refreshLayout(element) {
    if (!element) return;
    const spans = Array.from(element.querySelectorAll ? element.querySelectorAll('.study-math') : []);
    if (element.nodeType === 1 && String(element.className).split(/\s+/).includes('study-math')) spans.unshift(element);
    for (const span of spans) {
      // Hidden card faces have no usable width yet; measure again when shown.
      if (span.clientWidth > 0 && span.scrollWidth > span.clientWidth + 1) {
        span.tabIndex = 0;
        span.setAttribute('data-math-scroll', '');
      } else if (span.clientWidth > 0 && span.hasAttribute('data-math-scroll')) {
        if (typeof span.removeAttribute === 'function') {
          span.removeAttribute('tabindex');
          span.removeAttribute('data-math-scroll');
        }
      }
    }
  }

  function render(element) {
    if (!element || !root.katex || typeof root.katex.render !== 'function') return 0;
    const doc = element.ownerDocument || root.document;
    if (!doc || typeof doc.createTextNode !== 'function') return 0;
    for (let ancestor = element.nodeType === 1 ? element : element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (skipped(ancestor)) return 0;
    }
    const textNodes = [];
    function collect(node) {
      if (node.nodeType === 3) { if (node.nodeValue.includes('$')) textNodes.push(node); return; }
      if (skipped(node)) return;
      for (const child of Array.from(node.childNodes || [])) collect(child);
    }
    collect(element);
    let rendered = 0;
    for (const node of textNodes) {
      const parts = analyze(node.nodeValue).parts;
      if (!parts.some(part => part.formula !== undefined)) continue;
      const fragment = doc.createDocumentFragment();
      let replacements = 0;
      for (const part of parts) {
        if (part.formula === undefined) { fragment.appendChild(doc.createTextNode(part.text)); continue; }
        const span = doc.createElement('span');
        span.className = 'study-math' + (part.display ? ' study-math-display' : '');
        span.setAttribute('dir', 'ltr');
        span.style.direction = 'ltr';
        span.style.unicodeBidi = 'isolate';
        span.style.display = part.display ? 'block' : 'inline-block';
        span.style.maxWidth = '100%';
        span.style.overflowX = 'auto';
        span.style.overflowY = 'hidden';
        span.style.verticalAlign = 'middle';
        span.style.whiteSpace = 'nowrap';
        try {
          root.katex.render(part.formula, span, options(part.display));
          // Preserve KaTeX's semantic MathML and aria-hidden visual copy. Do not
          // replace it with a raw-TeX aria-label or mark the entire wrapper hidden.
          fragment.appendChild(span);
          replacements++;
        } catch (_) {
          // Failed syntax remains byte-for-byte source text, never error HTML.
          fragment.appendChild(doc.createTextNode(part.raw));
        }
      }
      if (replacements && node.parentNode) {
        node.parentNode.replaceChild(fragment, node);
        rendered += replacements;
      }
    }
    if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(function () { refreshLayout(element); });
    return rendered;
  }

  const api = Object.freeze({ render, analyze, containsFormula, options, refreshLayout, maxFormulaLength: MAX_FORMULA_LENGTH, macros: MACROS });
  root.STUDY_MATH = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
