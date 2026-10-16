/* Optional, local-only course progress. No account, analytics, or network calls.
 * Browser: window.UNIVERSAL_PROGRESS. Node: require('./progress-store.js').
 * Storage is origin-bound: a different host/protocol/port requires explicit export/import.
 * v2 is the objective-result schema; schemaVersion:3 is the course-storage envelope.
 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UNIVERSAL_PROGRESS = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const PREFIX = 'university-review:', SUFFIX = ':v3';
  const IMPORT_KEY = PREFIX + 'import-snapshot:v3';
  const LEGACY_KEYS = ['islamic-economics-flashcards-v2', 'islamic-economics-flashcards-v1'];
  const FORMAT = 'university-review-progress', SCHEMA_VERSION = 3;
  const MAX_JSON = 4 * 1024 * 1024, MAX_COURSES = 64, MAX_IDS = 12000, MAX_ID_LENGTH = 256;
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const INTERVALS = Object.freeze([1, 3, 7, 14, 30]);
  const DAY = 86400000;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const clone = value => JSON.parse(JSON.stringify(value));
  function fail(message) { throw new Error(message); }
  function slug(value) {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) || value.length > 64 || BAD_KEYS.has(value) || value === 'import-snapshot') fail('Invalid course ID.');
    return value;
  }
  function identifier(value) {
    if (typeof value !== 'string' || !value || value.length > MAX_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(value) || BAD_KEYS.has(value)) fail('Invalid progress ID.');
    return value;
  }
  function safeTree(value, depth = 0, budget = {nodes: 0}) {
    if (++budget.nodes > 150000 || depth > 16) fail('Progress is too large or deeply nested.');
    if (typeof value === 'string' && value.length > 2048) fail('Progress text is too long.');
    if (typeof value === 'number' && !Number.isFinite(value)) fail('Invalid progress number.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return;
    if (Array.isArray(value)) { if (value.length > MAX_IDS) fail('Too many progress entries.'); for (const item of value) safeTree(item, depth + 1, budget); return; }
    if (!object(value)) fail('Progress must contain JSON values only.');
    const keys = Object.keys(value);
    if (keys.length > MAX_IDS) fail('Too many progress entries.');
    for (const key of keys) { if (BAD_KEYS.has(key)) fail('Unsafe progress key.'); safeTree(value[key], depth + 1, budget); }
  }
  function parse(text) {
    if (typeof text !== 'string' || text.length > MAX_JSON) fail('Progress file is too large or is not JSON text.');
    const value = JSON.parse(text); safeTree(value); rejectDuplicateKeys(text); return value;
  }
  // JSON.parse normally keeps the last duplicate key, which can silently replace a
  // whole course. Reject ambiguous files instead of choosing one of the copies.
  function rejectDuplicateKeys(text) {
    let offset = 0;
    const space = () => { while (/\s/.test(text[offset] || '') && offset < text.length) offset++; };
    function string() {
      const start = offset++;
      while (offset < text.length) {
        const char = text[offset++];
        if (char === '\\') offset++;
        else if (char === '"') break;
      }
      return JSON.parse(text.slice(start,offset));
    }
    function value(depth) {
      if (depth > 16) fail('Progress is too deeply nested.');
      space();
      if (text[offset] === '{') {
        offset++; space(); const seen = new Set();
        while (text[offset] !== '}') {
          space(); const key = string();
          if (seen.has(key)) fail('Duplicate JSON key: ' + key + '.');
          seen.add(key); space(); offset++; value(depth+1); space();
          if (text[offset] !== ',') break; offset++;
        }
        offset++; return;
      }
      if (text[offset] === '[') {
        offset++; space();
        while (text[offset] !== ']') { value(depth+1); space(); if (text[offset] !== ',') break; offset++; }
        offset++; return;
      }
      if (text[offset] === '"') { string(); return; }
      while (offset < text.length && !/[\s,}\]]/.test(text[offset])) offset++;
    }
    value(0);
  }
  function fields(value, allowed, name) {
    if (!object(value)) fail(name + ' must be an object.');
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('Unknown ' + name + ' field: ' + key + '.');
  }
  function integer(value, name, max = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || value < 0 || value > max) fail('Invalid ' + name + '.');
    return value;
  }
  function ids(value, name, allowed) {
    if (!Array.isArray(value) || value.length > MAX_IDS) fail('Invalid ' + name + '.');
    const seen = new Set();
    for (const id of value) { identifier(id); if (seen.has(id)) fail('Duplicate ' + name + ' ID.'); if (allowed && !allowed.has(id)) fail('Unknown ' + name + ' ID: ' + id + '.'); seen.add(id); }
    return [...seen];
  }
  function dictionary(value, name, allowed, transform) {
    if (!object(value) || Object.keys(value).length > MAX_IDS) fail('Invalid ' + name + '.');
    const result = {};
    for (const [id, item] of Object.entries(value)) {
      identifier(id); if (allowed && !allowed.has(id)) fail('Unknown ' + name + ' ID: ' + id + '.');
      result[id] = transform(item);
    }
    return result;
  }
  function getCatalog(catalog) {
    if (!catalog) return null;
    const courses = Array.isArray(catalog) ? catalog : catalog.courses;
    if (!Array.isArray(courses) || courses.length > MAX_COURSES) fail('Invalid course catalog.');
    const result = new Map();
    for (const item of courses) {
      if (!object(item)) fail('Invalid course catalog entry.');
      const id = slug(item.id || item.slug || item.courseId);
      if (result.has(id)) fail('Duplicate course catalog ID.');
      const data = catalog.data?.[id] || catalog.courseData?.[id] || item;
      const cards = Array.isArray(data.cards) ? data.cards : [];
      const rawCards = Array.isArray(data.rawCards) ? data.rawCards : cards;
      const cardIds = item.cardIds || rawCards.map(card => card.id);
      const quizIds = item.quizCardIds || cards.filter(card => card.examEligible === true).map(card => card.id);
      const groups = item.conceptGroups || cards.map(card => card.studyConceptId || card.conceptGroup || card.coverage?.conceptGroup).filter(Boolean);
      const chapters = (item.chapters || []).map(chapter => typeof chapter === 'object' ? String(chapter.id ?? chapter.chapter ?? chapter.number) : String(chapter));
      result.set(id, {metadata:item, cards, ids:new Set(cardIds), quizIds:new Set(quizIds), groups:new Set(groups), chapters:new Set(chapters), byId:new Map(cards.map(card => [card.id,card]))});
    }
    return result;
  }
  function hasCurrentExamKey(card) {
    const exam = card?.exam;
    return Array.isArray(exam?.options) && exam.options.length >= 2 && Number.isInteger(exam.correctIndex) && exam.correctIndex >= 0 && exam.correctIndex < exam.options.length;
  }
  function matchesCurrentExamKey(card, answer) {
    return card?.examEligible === true && hasCurrentExamKey(card) && typeof answer?.correct === 'boolean' && Number.isInteger(answer.selectedIndex) && answer.selectedIndex >= 0 && answer.selectedIndex < card.exam.options.length && answer.correct === (answer.selectedIndex === card.exam.correctIndex);
  }
  const STATE_FIELDS = ['version','schemaVersion','enabled','activeIds','reviewSeen','testUsed','testSeen','examDifficulty','conceptSeen','quizResults','completedQuizzes','selfRatings','schedule','examDate','examChapters'];
  function validateSchedule(value) {
    fields(value, ['box','dueAt','lastReviewedAt','correctStreak','reviews','lastCorrect'], 'schedule');
    const box = integer(value.box, 'Leitner box', 5); if (box < 1) fail('Invalid Leitner box.');
    const result = {box, dueAt:integer(value.dueAt,'due date',8640000000000000), lastReviewedAt:integer(value.lastReviewedAt,'review date',8640000000000000), correctStreak:integer(value.correctStreak,'correct streak'), reviews:integer(value.reviews,'review count')};
    if (result.reviews < 1 || result.correctStreak > result.reviews || typeof value.lastCorrect !== 'boolean' || result.dueAt < result.lastReviewedAt) fail('Invalid Leitner history.');
    result.lastCorrect = value.lastCorrect; return result;
  }
  function validateState(value, catalogEntry) {
    safeTree(value); fields(value, STATE_FIELDS, 'course progress');
    if (value.enabled !== true) fail('Only explicitly enabled progress can be saved or imported.');
    if (value.version !== undefined && value.version !== 2) fail('Unsupported objective-result version.');
    if (value.schemaVersion !== undefined && value.schemaVersion !== SCHEMA_VERSION) fail('Unsupported course-progress version.');
    const known = catalogEntry?.ids, quiz = catalogEntry?.quizIds, groups = catalogEntry?.groups;
    const result = {
      version:2, schemaVersion:SCHEMA_VERSION, enabled:true,
      activeIds:ids(value.activeIds === undefined ? [] : value.activeIds,'active card',known),
      reviewSeen:ids(value.reviewSeen === undefined ? [] : value.reviewSeen,'review concept',groups),
      testUsed:ids(value.testUsed === undefined ? [] : value.testUsed,'quiz card',quiz),
      testSeen:ids(value.testSeen === undefined ? [] : value.testSeen,'seen quiz card',quiz),
      examDifficulty:value.examDifficulty === undefined ? 'all' : value.examDifficulty,
      conceptSeen:dictionary(value.conceptSeen === undefined ? {} : value.conceptSeen,'concept',groups,item => integer(item,'concept count')),
      quizResults:dictionary(value.quizResults === undefined ? {} : value.quizResults,'quiz result',quiz,item => {
        fields(item,['selectedIndex','correct','answeredAt'],'quiz result');
        if (typeof item.correct !== 'boolean') fail('Invalid objective quiz result.');
        const out = {selectedIndex:integer(item.selectedIndex,'selected answer',49), correct:item.correct};
        if (item.answeredAt !== undefined) out.answeredAt = integer(item.answeredAt,'answer date',8640000000000000);
        return out;
      }),
      completedQuizzes:integer(value.completedQuizzes === undefined ? 0 : value.completedQuizzes,'completed quiz count'),
      selfRatings:dictionary(value.selfRatings === undefined ? {} : value.selfRatings,'self-rating',known,item => {
        if (!(typeof item === 'string' && item.length <= 64 || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= 100)) fail('Invalid self-rating.');
        return item;
      }),
      schedule:dictionary(value.schedule === undefined ? {} : value.schedule,'scheduled card',known,validateSchedule),
      examDate:value.examDate === undefined ? '' : value.examDate,
      examChapters:ids(value.examChapters === undefined ? [] : value.examChapters,'exam chapter',catalogEntry?.chapters)
    };
    if (!['all','easy','medium','hard'].includes(result.examDifficulty)) fail('Invalid exam difficulty.');
    if (result.examDate !== '' && (typeof result.examDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(result.examDate) || !Number.isFinite(Date.parse(result.examDate + 'T12:00:00Z')) || new Date(result.examDate + 'T12:00:00Z').toISOString().slice(0,10) !== result.examDate)) fail('Invalid exam date.');
    if (catalogEntry) for (const [id,item] of Object.entries(result.quizResults)) {
      const card = catalogEntry.byId.get(id);
      if (card?.exam?.options && item.selectedIndex >= card.exam.options.length) fail('Selected answer is out of range.');
      if (hasCurrentExamKey(card) && item.correct !== (item.selectedIndex === card.exam.correctIndex)) fail('Quiz result is inconsistent with the current answer key: ' + id + '.');
      // Catalog-free legacy migration retains historical bytes. Imports with a
      // current key reject incompatible grades rather than rewriting them.
    }
    return result;
  }
  function migrateLegacy(v2, v1) {
    // An explicit v2 opt-out must not resurrect older v1 progress.
    if (v2 && v2.enabled !== true) return null;
    const source = v2 || v1;
    if (!object(source) || source.enabled !== true) return null;
    safeTree(source);
    const objective = v2?.version === 2;
    const result = {
      enabled:true, version:2, schemaVersion:3,
      activeIds:source.activeIds || source.activeBookIds || source.revealed || [],
      reviewSeen:source.reviewSeen || [], conceptSeen:source.conceptSeen || {},
      testUsed:objective ? source.testUsed || [] : [],
      testSeen:objective ? source.testSeen || [] : [],
      examDifficulty:objective ? source.examDifficulty || 'all' : 'all',
      quizResults:objective ? source.quizResults || {} : {},
      completedQuizzes:objective ? source.completedQuizzes ?? 0 : 0,
      // Preserve both former formats; newer self-ratings win only on the same card ID.
      selfRatings:{...(v1?.enabled === true ? v1.ratings || v1.selfRatings || {} : {}), ...(source.ratings || {}), ...(source.selfRatings || {})}
    };
    return validateState(result);
  }
  function nextSchedule(previous, objectiveResult, timestamp = Date.now()) {
    if (!object(objectiveResult) || typeof objectiveResult.correct !== 'boolean' || !Number.isInteger(objectiveResult.selectedIndex) || objectiveResult.selectedIndex < 0 || objectiveResult.selectedIndex > 49) fail('An objective quiz result is required for scheduling.');
    const at = integer(timestamp,'review date',8640000000000000);
    const prior = previous ? validateSchedule(previous) : null;
    const correct = objectiveResult.correct;
    const box = correct ? Math.min(5,(prior?.box || 0)+1) : 1;
    const dueAt = at + INTERVALS[box-1] * DAY;
    if (!Number.isSafeInteger(dueAt) || dueAt > 8640000000000000) fail('Review date exceeds the supported range.');
    return {box,dueAt,lastReviewedAt:at,correctStreak:correct ? (prior?.correctStreak || 0)+1 : 0,reviews:(prior?.reviews || 0)+1,lastCorrect:correct};
  }
  function isDue(record, timestamp = Date.now()) { return !record || validateSchedule(record).dueAt <= integer(timestamp,'current date',8640000000000000); }
  function dueCards(state, cards, timestamp = Date.now()) {
    if (!Array.isArray(cards)) fail('Cards must be an array.');
    return cards.filter(card => isDue(state?.schedule?.[typeof card === 'string' ? card : card.id], timestamp));
  }
  function isWeakRating(rating) { return rating === false || rating === 0 || rating === 1 || ['review','again','weak','hard','أراجعها','راجعها'].includes(rating); }
  function create(storage, options = {}) {
    const catalog = options.catalog || null;
    let lastError = null;
    function storageObject() {
      const value = storage === undefined ? root?.localStorage : storage;
      if (!value || typeof value.getItem !== 'function' || typeof value.setItem !== 'function' || typeof value.removeItem !== 'function') fail('Local storage is unavailable.');
      return value;
    }
    function report(error) { lastError = error instanceof Error ? error.message : String(error); return {ok:false,error:lastError}; }
    function snapshot(store) {
      const raw = store.getItem(IMPORT_KEY); if (raw === null) return {version:3,courses:{}};
      const value = parse(raw); fields(value,['version','courses'],'import snapshot');
      if (value.version !== 3 || !object(value.courses) || Object.keys(value.courses).length > MAX_COURSES) fail('Invalid saved import snapshot.');
      for (const [id,state] of Object.entries(value.courses)) { slug(id); if (state !== null) validateState(state); }
      return value;
    }
    function key(id) { return PREFIX + slug(id) + SUFFIX; }
    function readCourse(id) {
      lastError = null;
      try {
        slug(id); const store = storageObject(), overlay = snapshot(store);
        if (own(overlay.courses,id)) return overlay.courses[id] === null ? null : validateState(overlay.courses[id]);
        const raw = store.getItem(key(id));
        if (raw !== null) {
          const value = parse(raw);
          // Do not fall back to legacy after an explicit disabled current state.
          if (value?.enabled === false) return null;
          return validateState(value);
        }
        if (id !== 'islamic-econ') return null;
        const newest = store.getItem(LEGACY_KEYS[0]), oldest = store.getItem(LEGACY_KEYS[1]);
        const v2 = newest === null ? null : parse(newest);
        let v1 = null;
        if (oldest !== null) {
          try { v1 = parse(oldest); } catch (error) { if (!v2) throw error; }
        }
        const migrated = migrateLegacy(v2,v1);
        if (migrated) {
          try { store.setItem(key(id),JSON.stringify(migrated)); } catch (error) { report(error); }
        }
        return migrated;
      } catch (error) { report(error); return null; }
    }
    function writeCourse(id, state) {
      if (state?.enabled === false) return removeCourse(id);
      lastError = null;
      try {
        slug(id); const normalized = validateState(state), store = storageObject(), overlay = snapshot(store);
        if (own(overlay.courses,id)) { overlay.courses[id] = normalized; store.setItem(IMPORT_KEY,JSON.stringify(overlay)); }
        else store.setItem(key(id),JSON.stringify(normalized));
        return {ok:true,saved:true};
      } catch (error) { return report(error); }
    }
    function removeCourse(id) {
      lastError = null;
      try { slug(id); } catch (error) { return report(error); }
      let store; try { store = storageObject(); } catch (error) { return report(error); }
      const errors = [];
      // A tombstone contains no progress. It prevents a failed key deletion or stale
      // legacy key from bringing opted-out progress back on the next read.
      try {
        const overlay = snapshot(store);
        if (own(overlay.courses,id)) { overlay.courses[id] = null; store.setItem(IMPORT_KEY,JSON.stringify(overlay)); }
      } catch (error) { errors.push(error); }
      for (const name of [key(id),...(id === 'islamic-econ' ? LEGACY_KEYS : [])]) {
        try { store.removeItem(name); } catch (error) { errors.push(error); }
      }
      return errors.length ? report(errors[0]) : {ok:true,saved:false};
    }
    function storedCourses(store, overlay) {
      const result = new Set(Object.keys(overlay.courses));
      if (typeof store.length === 'number' && typeof store.key === 'function') {
        for (let index=0; index<store.length; index++) {
          const name = store.key(index);
          if (typeof name === 'string' && name.startsWith(PREFIX) && name.endsWith(SUFFIX) && name !== IMPORT_KEY) {
            const id = name.slice(PREFIX.length,-SUFFIX.length); slug(id); result.add(id);
          }
        }
      }
      const known = getCatalog(catalog); if (known) for (const id of known.keys()) result.add(id);
      result.add('islamic-econ');
      if (result.size > MAX_COURSES) fail('Too many saved courses.');
      return result;
    }
    function exportAll() {
      lastError = null;
      try {
        const store = storageObject(), overlay = snapshot(store), courses = {};
        for (const id of [...storedCourses(store,overlay)].sort()) {
          const state = readCourse(id);
          if (lastError) fail(lastError);
          if (state) courses[id] = state;
        }
        const value = JSON.stringify({format:FORMAT,version:3,exportedAt:new Date(options.now ? options.now() : Date.now()).toISOString(),courses},null,2);
        if (value.length > MAX_JSON) fail('Saved progress exceeds the export limit.');
        return value;
      } catch (error) { report(error); return null; }
    }
    function importAll(json, providedCatalog = catalog) {
      lastError = null;
      try {
        const incoming = parse(json); fields(incoming,['format','version','exportedAt','courses'],'progress file');
        if (incoming.format !== FORMAT || incoming.version !== 3 || !object(incoming.courses) || Object.keys(incoming.courses).length > MAX_COURSES) fail('Unsupported progress-file format.');
        if (incoming.exportedAt !== undefined && (typeof incoming.exportedAt !== 'string' || !Number.isFinite(Date.parse(incoming.exportedAt)))) fail('Invalid export date.');
        const known = getCatalog(providedCatalog), courses = {};
        for (const [id,state] of Object.entries(incoming.courses)) {
          slug(id); if (known && !known.has(id)) fail('Unknown course ID: ' + id + '.');
          courses[id] = validateState(state,known?.get(id));
        }
        const store = storageObject(), overlay = snapshot(store);
        const merged = {...overlay.courses,...courses};
        if (Object.keys(merged).length > MAX_COURSES) fail('Too many saved courses.');
        // One atomic localStorage write is the commit point. No per-course key or
        // legacy key is changed first, even if another course fails validation.
        const serialized = JSON.stringify({version:3,courses:merged});
        if (serialized.length > MAX_JSON) fail('Combined progress exceeds the storage limit.');
        store.setItem(IMPORT_KEY,serialized);
        return {ok:true,count:Object.keys(courses).length};
      } catch (error) { return report(error); }
    }
    function weakCards(providedCatalog = catalog) {
      const known = getCatalog(providedCatalog); if (!known) return [];
      const result = [];
      for (const [courseId,entry] of known) {
        const state = readCourse(courseId); if (!state) continue;
        for (const id of entry.ids) {
          const answer = state.quizResults[id], rating = state.selfRatings[id], card = entry.byId.get(id);
          // An obsolete key, retired quiz, or unverifiable result is not evidence
          // of a current wrong answer. Explicit personal review marks still apply.
          const objectiveWeak = answer?.correct === false && entry.quizIds.has(id) && matchesCurrentExamKey(card,answer);
          const selfWeak = !!card && card.studyEligible !== false && isWeakRating(rating);
          if (!objectiveWeak && !selfWeak) continue;
          result.push({...entry.byId.get(id),id,courseId,courseName:entry.metadata.name || entry.metadata.title || courseId,reason:objectiveWeak?'incorrect':'self-review',signal:objectiveWeak?'objective':'self-reported',rating:selfWeak?rating:undefined});
        }
      }
      return result;
    }
    return {readCourse,writeCourse,removeCourse,exportAll,importAll,weakCards,nextSchedule,isDue,dueCards,
      get lastError() { return lastError; }, keyForCourse:key};
  }
  const api = create();
  return Object.assign(api,{create,migrateLegacy,validateState,nextSchedule,isDue,dueCards,isWeakRating,
    SCHEMA_VERSION,FORMAT,LEGACY_KEYS:Object.freeze([...LEGACY_KEYS]),IMPORT_KEY,
    LEITNER_INTERVAL_DAYS:INTERVALS,MAX_JSON_LENGTH:MAX_JSON,
    storageScope:'same-origin browser storage; transfer to another origin or browser requires explicit export/import'});
});
