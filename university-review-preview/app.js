(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ar = n => new Intl.NumberFormat('ar-SA', {useGrouping:false}).format(n);
  const activeCourse=window.ACTIVE_COURSE, courseId=activeCourse?.id||'islamic-econ', generic=activeCourse&&courseId!=='islamic-econ';
  const genericCards=generic?activeCourse.bundle.cards.filter(c=>c.studyEligible!==false).map((c,i)=>({...c,front:c.front||c.q,answer_phrase:c.answer_phrase||c.a,category:c.category||'flashcards',tags:c.tags||[],origin:'original',sourceKind:'original',hasAnswer:true,starterEligible:true,studyEligible:true,studyConceptId:c.conceptId||c.studyConceptId||c.conceptGroup||c.id,studyOrder:c.studyOrder||{chapter:c.chapter,topicOrder:0,groupOrder:i,itemOrder:i,groupId:c.id},source_label:c.source_label||(typeof c.source==='string'?c.source:'')})):null;
  const rawModel = generic?{cards:genericCards,byId:new Map(genericCards.map(c=>[c.id,c])),rejected:[]}:window.STUDY_MODEL.create(window.FLASHCARD_DATA.cards, [...(window.FLASHCARD_BANK||[]), ...(window.FLASHCARD_EXTRA_BANK||[])], window.FLASHCARD_ORIGINAL_PRESENTATION, window.FLASHCARD_BOOK_SUPPORT);
  const rawCards = rawModel.cards, rawById = rawModel.byId;
  const display = generic?Object.fromEntries(genericCards.map(c=>[c.id,c])):window.STUDY_DISPLAY?.byId || {};
  const validExam = view => view?.examEligible === true && Array.isArray(view.exam?.options) && view.exam.options.length >= 2 && view.exam.options.every(x => typeof x === 'string' && x.trim()) && Number.isInteger(view.exam.correctIndex) && view.exam.correctIndex >= 0 && view.exam.correctIndex < view.exam.options.length;
  const cards = rawCards.filter(raw => display[raw.id]?.studyEligible === true && display[raw.id].front?.trim() && display[raw.id].answer_phrase?.trim()).map(raw => ({...raw, ...display[raw.id], questionOptions:[], answerItems:[], explanation:'', notes:'', hasAnswer:true, examEligible:validExam(display[raw.id])}));
  const byId = new Map(cards.map(card => [card.id,card]));
  const model = {cards,byId}, coverage = generic?{cards:Object.fromEntries(genericCards.map(c=>[c.id,{conceptGroup:c.studyConceptId,difficulty:c.difficulty||'medium',topicId:c.topic||c.id,lessonId:String(c.chapter)}]))}:window.FLASHCARD_COVERAGE || {};
  const sampler = window.STUDY_SAMPLER.create(cards, coverage), rawSampler = window.STUDY_SAMPLER.create(rawCards, coverage);
  const categories = {all:'شامل',enumerations:'تعداد',evidence:'أدلة',definitions:'تعاريف',true_false:'صح وغلط',comparisons:'فروقات'};
  const categoryNames = {...categories,flashcards:'مراجعة'}, chapters = window.STUDY_MODEL.chapterNames;
  const key = 'islamic-economics-flashcards-v2', legacyKey = 'islamic-economics-flashcards-v1';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)'),mobileNavigation=window.matchMedia('(max-width:740px), (pointer:coarse)');
  const state = {chapter:'all',category:'all',chapterCategories:Object.fromEntries(Object.keys(chapters).map(n=>[n,'all'])),count:'auto',difficulty:'all',examDifficulty:'all',active:new Set(cards.filter(c=>c.starterEligible).map(c=>c.id)),reviewPack:[],reviewIndex:0,visited:new Set(),reviewSeen:new Set(),testUsed:new Set(),testSeen:new Set(),conceptSeen:{},quizResults:{},schedule:{},selfRatings:{},completedQuizzes:0,roundTiming:null,save:false,sound:false,mode:'browse',queue:[],roundIndex:0,answers:{},flipped:false,seed:1};
  const bankFilter = {chapter:'all',category:'all',source:'all',search:''};
  const edgeTutorialKey='islamic-economics-swipe-tutorial-v1';let edgeTutorialStage='center',edgeCenterExpired=false,edgeCenterTimer=null,edgeHintTimer=null;
  let mobileGesture=null,gestureClickUntil=0,faceScrollUntil=0,flipUntil=0,swipeMotion=null,swipeTimer=null,flipTimer=null,instantFlip=true;
  try{if(localStorage.getItem(edgeTutorialKey)==='seen')edgeTutorialStage='done'}catch{}

  let visible = [], announcementTimer, tutorialTimer, audioContext, pointer, suppressClick = false, wheelSum = 0, wheelLocked = false, wheelTimer, menuChapter = null;
  const allMetaValid = cards.length > 0 && sampler.complete && !rawModel.rejected.length;
  const cardCount = n => n===1?'سؤال واحد':n===2?'سؤالان':ar(n)+(n>=3&&n<=10?' أسئلة':' سؤالًا');
  const targetCount = config => config.count==='auto' ? (config.chapter==='all'?20:30) : Number(config.count);
  const currentIndex = () => state.mode==='browse'?state.reviewIndex:state.roundIndex;
  const currentCard = () => visible[currentIndex()];
  const activeMode = () => state.mode==='browse'?'browse':'round';
  function say(text) { clearTimeout(announcementTimer); $('announcement').textContent=''; announcementTimer=setTimeout(()=>$('announcement').textContent=text,30); }
  function storageNote(error=false) { $('storage-note').textContent=error?'تعذّر الحفظ. تقدّمك متاح في هذه الجلسة فقط.':state.save?'محفوظ على هذا المتصفح فقط، دون حساب.':'الحفظ اختياري وعلى هذا المتصفح فقط.'; }
  try {
    const saved=window.UNIVERSAL_PROGRESS?window.UNIVERSAL_PROGRESS.readCourse(courseId):JSON.parse(localStorage.getItem(key)), old=window.UNIVERSAL_PROGRESS?null:saved?null:JSON.parse(localStorage.getItem(legacyKey));
    const source=saved?.enabled===true?saved:old?.enabled===true?old:null;
    if(source){
      state.save=true;state.schedule=source.schedule||{};state.selfRatings=source.selfRatings||{};
      for(const id of source.activeIds||source.activeBookIds||source.revealed||[])if(byId.has(id))state.active.add(id);
      for(const group of source.reviewSeen||[])if(sampler.groups.has(group))state.reviewSeen.add(group);
      for(const [group,count] of Object.entries(source.conceptSeen||{}))if(sampler.groups.has(group)&&Number.isFinite(count)&&count>=0)state.conceptSeen[group]=count;
      // A former self-rating is never imported as an objectively correct answer.
      if(saved?.version===2){
        if(Number.isSafeInteger(saved.completedQuizzes)&&saved.completedQuizzes>=0)state.completedQuizzes=saved.completedQuizzes;
        for(const id of saved.testUsed||[])if(byId.get(id)?.examEligible){state.testUsed.add(id);state.testSeen.add(id)}
        for(const id of saved.testSeen||[])if(byId.get(id)?.examEligible)state.testSeen.add(id);
        if(['all','easy','medium','hard'].includes(saved.examDifficulty))state.examDifficulty=saved.examDifficulty;
        for(const [id,result] of Object.entries(saved.quizResults||{}))if(byId.get(id)?.examEligible&&typeof result.correct==='boolean'&&Number.isInteger(result.selectedIndex)&&result.selectedIndex>=0&&result.selectedIndex<byId.get(id).exam.options.length&&result.correct===(result.selectedIndex===byId.get(id).exam.correctIndex))state.quizResults[id]=result;
      }
    }
  }catch{}
  function persist({remove=false,clearQuiz=false}={}) {
    try {
      const snapshot={version:2,enabled:true,activeIds:[...state.active],reviewSeen:[...state.reviewSeen],testUsed:[...state.testUsed],testSeen:[...state.testSeen],examDifficulty:state.examDifficulty,conceptSeen:state.conceptSeen,quizResults:state.quizResults,schedule:state.schedule,selfRatings:state.selfRatings,completedQuizzes:state.completedQuizzes};
      if(window.UNIVERSAL_PROGRESS){const prior=window.UNIVERSAL_PROGRESS.readCourse(courseId)||{},merged={...prior,...snapshot};
        for(const field of ['activeIds','reviewSeen'])merged[field]=[...new Set([...(prior[field]||[]),...snapshot[field]])];
        merged.conceptSeen={...(prior.conceptSeen||{}),...snapshot.conceptSeen};
        if(!clearQuiz){for(const field of ['testUsed','testSeen'])merged[field]=[...new Set([...(prior[field]||[]),...snapshot[field]])];merged.quizResults={...(prior.quizResults||{}),...snapshot.quizResults};merged.schedule={...(prior.schedule||{}),...snapshot.schedule}}
        const result=state.save?window.UNIVERSAL_PROGRESS.writeCourse(courseId,merged):remove?window.UNIVERSAL_PROGRESS.removeCourse(courseId):{ok:true};if(result?.ok===false)throw Error('storage failed')}
      else if(state.save)localStorage.setItem(key,JSON.stringify(snapshot));
      else {localStorage.removeItem(key);localStorage.removeItem(legacyKey)}
      storageNote();
    }catch{state.save=false;$('save-progress').checked=false;storageNote(true)}
  }
  function matching(card,config) { return(config.chapter==='all'||String(card.chapter)===String(config.chapter))&&(config.category==='all'||card.category===config.category)&&(config.difficulty==='all'||sampler.meta(card).difficulty===config.difficulty); }
  function candidates(config,activeIds=state.active,mode='browse') { return new Set(cards.filter(c=>activeIds.has(c.id)&&matching(c,config)&&(mode!=='round'||c.examEligible)).map(c=>c.id)); }
  function selection(config,mode=activeMode(),{fresh=false,allAvailable=false}={}) {
    if(mode==='browse')config={...config,difficulty:'all'};
    const ordered=mode==='browse'&&config.chapter!=='all';
    const filtered=candidates(config,ordered||allAvailable?new Set(cards.map(c=>c.id)):state.active,mode);
    const seenTestIds=new Set([...state.testUsed,...state.testSeen]);
    const usedForms=new Set([...seenTestIds].map(id=>byId.get(id)).filter(Boolean).map(c=>sampler.variantKey(c)));
    const excluded=fresh?new Set(cards.filter(c=>mode==='round'?(seenTestIds.has(c.id)||usedForms.has(sampler.variantKey(c))):state.reviewSeen.has(sampler.concept(c))).map(c=>c.id)):new Set();
    if(ordered)return sampler.buildOrdered({chapter:config.chapter,size:targetCount(config),activeIds:filtered,excludeIds:excluded});
    const activeIds=mode==='browse'?new Set([...sampler.groups.keys()].map(group=>sampler.canonical(group,filtered,config.chapter)?.id).filter(Boolean)):filtered;
    return sampler.build({chapter:config.chapter,difficulty:config.difficulty,size:targetCount(config),activeIds,excludeIds:excluded,conceptSeen:state.conceptSeen,seed:state.seed,eligibleOnly:true});
  }
  function poolSize(config=state,mode=activeMode()) {
    const normalized=mode==='browse'?{...config,difficulty:'all'}:config;
    const available=cards.filter(card=>matching(card,normalized)&&(mode!=='round'||card.examEligible));
    return new Set(available.map(sampler.concept)).size;
  }
  function broaderChoice() {
    const mode=activeMode(),choices=[];
    if(mode==='round'&&state.difficulty!=='all')choices.push({config:{...state,difficulty:'all'},label:'كل مستويات الاختبار'});
    if(state.category!=='all')choices.push({config:{...state,category:'all',difficulty:mode==='round'?state.difficulty:'all'},label:mode==='round'?'اختبار الفصل كاملًا':'مراجعة الفصل كاملة'});
    if(state.chapter!=='all'||state.category!=='all'||mode==='round'&&state.difficulty!=='all')choices.push({config:{...state,chapter:'all',category:'all',difficulty:'all'},label:mode==='round'?'اختبار شامل':'مراجعة شاملة'});
    return choices.find(choice=>selection(choice.config,mode,{fresh:true,allAvailable:true}).ids.length>0)||null;
  }
  function renderBroader(id) {const choice=broaderChoice();$(id).hidden=!choice;if(choice)$(id).textContent=choice.label}
  function broaden() {
    const choice=broaderChoice();if(!choice)return;const mode=activeMode();
    state.chapter=choice.config.chapter;state.category=choice.config.category;if(state.chapter!=='all')state.chapterCategories[state.chapter]=state.category;
    if(mode==='round'){state.examDifficulty=choice.config.difficulty;state.difficulty=state.examDifficulty;startRound(null,{renew:true})}else makeReviewPack({renew:true});
    $('study-config').close();closeMenus();$('card-area').scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});
  }
  function reserveCandidates(config,mode) { return cards.filter(c=>!state.active.has(c.id)&&matching(c,config)&&(mode!=='round'||c.examEligible)); }
  function unlockBook(config,mode,size=30) {
    const result=sampler.build({chapter:config.chapter,difficulty:config.difficulty,size,activeIds:new Set(reserveCandidates(config,mode).map(c=>c.id)),seed:state.seed,eligibleOnly:true});
    for(const id of result.ids)state.active.add(id);persist();return result.ids.length;
  }
  function buildPack(mode,{renew=false}={}) {
    let next=selection(state,mode,{fresh:renew});
    if(next.ordered){for(const id of next.ids)state.active.add(id);return next.ids}
    if(next.ids.length<targetCount(state)){
      const reserve=selection(state,mode,{fresh:renew,allAvailable:true});
      for(const id of reserve.ids)state.active.add(id);
      next=selection(state,mode,{fresh:renew});
    }
    return next.ids;
  }
  function makeReviewPack({renew=false,ids=null}={}) {
    window.QuizReceipt?.cancel({restoreFocus:false});$('results').classList.remove('receipt-enabled');state.roundTiming=null;resetMobileMotion();state.difficulty='all';
    const next=ids||buildPack('browse',{renew});
    state.reviewPack=next;state.reviewIndex=0;state.visited=new Set();state.flipped=false;state.mode='browse';state.seed++;render();persist();
  }
  function startRound(ids=null,{renew=false}={}) {
    window.QuizReceipt?.cancel({restoreFocus:false});$('results').classList.remove('receipt-enabled');resetMobileMotion();state.difficulty=state.examDifficulty;
    state.queue=ids||buildPack('round',{renew});state.roundIndex=0;state.answers={};state.flipped=false;state.mode='round';state.seed++;closeMenus();render();state.roundTiming=state.queue.length?{startedAt:Date.now(),startedClock:gestureNow(),setLabel:$('pack-label').textContent}:null;persist();if(state.queue.length)$('flashcard').focus({preventScroll:true});
  }
  function resetPack() { if(activeMode()==='round')startRound();else makeReviewPack(); }
  function gestureNow(){return window.performance?.now?.()??Date.now()}
  function blockGestureClick(ms=450){gestureClickUntil=Math.max(gestureClickUntil,gestureNow()+ms)}
  function motionBusy(){return !!swipeMotion||gestureNow()<flipUntil}
  const FACE_FADE_MS=200;
  function mobileFlip(){
    if(state.mode!=='browse'||!currentCard()||motionBusy()||gestureNow()<faceScrollUntil)return;
    flipUntil=gestureNow()+(reduced.matches?0:FACE_FADE_MS);state.flipped=!state.flipped;renderFace();
    if(!reduced.matches){$('flashcard').classList.add('is-flipping');clearTimeout(flipTimer);flipTimer=setTimeout(()=>$('flashcard').classList.remove('is-flipping'),FACE_FADE_MS)}
  }
  function setGestureTransform(x,rotation=0){const card=$('flashcard');card.style.setProperty('--mobile-x',typeof x==='number'?x+'px':x);card.style.setProperty('--mobile-angle',rotation+'deg')}
  function resetMobileMotion(){
    mobileGesture=null;swipeMotion=null;clearTimeout(swipeTimer);clearTimeout(flipTimer);flipUntil=0;faceScrollUntil=0;instantFlip=true;
    $('flashcard').classList.remove('is-mobile-dragging','is-swipe-exit','is-swipe-enter','is-snap-back','is-flipping');setGestureTransform(0);
  }
  function gestureStart(x,y,id,time){
    if(state.mode!=='browse'||!currentCard())return;
    if(motionBusy()){blockGestureClick();return}
    if(mobileNavigation.matches&&(x<24||x>window.innerWidth-24)){blockGestureClick();return}
    const rect=$('flashcard').getBoundingClientRect();
    mobileGesture={x,y,id,t:time,axis:null,moved:false,width:rect.width||rect.right-rect.left,pack:state.reviewPack,index:state.reviewIndex,offset:0};
  }
  function gestureMove(x,y,id,time,event){
    const g=mobileGesture;if(!g||g.id!==id)return;
    const dx=x-g.x,dy=y-g.y;if(Math.hypot(dx,dy)>=10)g.moved=true;
    if(!g.axis&&g.moved)g.axis=Math.abs(dx)>Math.abs(dy)*1.7?'x':'y';
    if(g.axis!=='x')return;
    if(event?.cancelable!==false)event?.preventDefault();
    if(event?.pointerId!==undefined)try{$('flashcard').setPointerCapture(event.pointerId)}catch{}
    const next=state.reviewIndex+(dx>0?1:-1),bounded=next<0||next>=state.reviewPack.length;
    g.offset=bounded?dx*.28:dx;
    if(!reduced.matches){setGestureTransform(g.offset,g.offset*.015);$('flashcard').classList.add('is-mobile-dragging')}
  }
  function snapBack(){
    const card=$('flashcard');card.classList.remove('is-mobile-dragging');setGestureTransform(0);
    if(reduced.matches)return;
    swipeMotion={type:'snap'};card.classList.add('is-snap-back');swipeTimer=setTimeout(()=>{card.classList.remove('is-snap-back');swipeMotion=null},260);
  }
  function gestureCancel(){if(!mobileGesture)return;const horizontal=mobileGesture.axis==='x';blockGestureClick();mobileGesture=null;if(horizontal)snapBack();else setGestureTransform(0)}
  function swipeTo(delta,g={pack:state.reviewPack,index:state.reviewIndex}){
    if(motionBusy())return;
    const next=state.reviewIndex+delta;if(next<0||next>=state.reviewPack.length){snapBack();return}
    finishEdgeTutorial();
    if(reduced.matches){setGestureTransform(0);move(delta);return}
    const card=$('flashcard');swipeMotion={type:'go',pack:g.pack,index:g.index};card.classList.remove('is-mobile-dragging');card.classList.add('is-swipe-exit');setGestureTransform(delta*125+'%',delta*4);
    swipeTimer=setTimeout(()=>{
      if(!swipeMotion||state.mode!=='browse'||state.reviewPack!==g.pack||state.reviewIndex!==g.index){resetMobileMotion();return}
      move(delta);card.classList.remove('is-swipe-exit');card.classList.add('is-mobile-dragging');setGestureTransform(-delta*125+'%');
      swipeTimer=setTimeout(()=>{card.classList.remove('is-mobile-dragging');card.classList.add('is-swipe-enter');setGestureTransform(0);swipeTimer=setTimeout(()=>{card.classList.remove('is-swipe-enter');swipeMotion=null},280)},20);
    },200);
  }
  function gestureEnd(x,y,id,time,event){
    const g=mobileGesture;if(!g||g.id!==id)return;gestureMove(x,y,id,time,event);mobileGesture=null;
    const dt=Math.max(1,time-g.t),distance=Math.hypot(x-g.x,y-g.y);
    if(!g.axis){if(distance<10&&dt<500)mobileFlip();blockGestureClick();return}
    blockGestureClick();if(g.axis!=='x'){setGestureTransform(0);return}
    const dx=g.offset,velocity=Math.abs(dx)/dt,next=state.reviewIndex+(dx>0?1:-1),can=next>=0&&next<state.reviewPack.length;
    if(can&&(Math.abs(dx)>g.width*.3||(velocity>.55&&Math.abs(dx)>40)))swipeTo(dx>0?1:-1,g);else snapBack();
  }
  function flip(){mobileFlip()}
  function move(delta) {
    if(state.mode!=='browse'||!visible.length)return false;
    const next=state.reviewIndex+delta;
    if(next<0||next>=state.reviewPack.length){say(next<0?'هذه أول بطاقة.':'انتهت المجموعة. اختر زيادة لمجموعة أخرى.');return false}
    instantFlip=true;state.reviewIndex=next;state.flipped=false;hideTutorial();render();say(ar(next+1)+' من '+ar(visible.length));return true;
  }
  function closeMenus() {menuChapter=null;document.querySelectorAll('[data-chapter]').forEach(button=>{if(button.dataset.chapter!=='all'){button.setAttribute('aria-expanded','false');$('chapter-menu-'+button.dataset.chapter).hidden=true}})}
  function renderMenus() {
    for(const n of Object.keys(chapters)){
      const container=$('chapter-menu-'+n);container.replaceChildren();
      for(const [value,label] of Object.entries(categories)){
        const button=document.createElement('button');button.type='button';button.dataset.category=value;button.textContent=label;button.setAttribute('aria-pressed',String(state.chapterCategories[n]===value));
        button.addEventListener('click',()=>{state.chapter=n;state.chapterCategories[n]=value;state.category=value;closeMenus();resetPack();document.querySelector('[data-chapter="'+n+'"]').focus({preventScroll:true})});container.append(button);
      }
    }
  }
  function renderFace() {
    const card=currentCard();if(!card)return;
    const flipped=state.mode==='browse'&&state.flipped;
    if(instantFlip)$('flashcard').classList.add('is-instant-flip');
    $('flashcard').classList.toggle('flipped',flipped);$('flashcard').classList.toggle('quiz-card',state.mode==='round');
    $('flashcard').setAttribute('aria-pressed',String(flipped));$('flashcard').setAttribute('aria-disabled',String(state.mode==='round'));
    $('flashcard').setAttribute('aria-label',state.mode==='round'?card.front:flipped?'الإجابة: '+card.answer_phrase+(mobileNavigation.matches?'. اضغط للعودة للسؤال. اسحب يمينًا للتالي ويسارًا للسابق.':'. اضغط للعودة للسؤال.'):card.front+(mobileNavigation.matches?'. اضغط لإظهار الإجابة. اسحب يمينًا للتالي ويسارًا للسابق.':'. اضغط لإظهار الإجابة.'));
    $('flashcard').tabIndex=state.mode==='round'?-1:0;
    $('question-face').setAttribute('aria-hidden',String(flipped));$('question-face').inert=flipped;
    $('answer-face').setAttribute('aria-hidden',String(!flipped));$('answer-face').inert=!flipped;window.STUDY_MATH?.refreshLayout?.($(flipped?'answer-face':'question-face'));
    $('flip-hint').hidden=state.mode!=='browse'||mobileNavigation.matches;$('flip-hint').textContent=flipped?'اضغط للعودة للسؤال':'اضغط البطاقة لإظهار الإجابة';renderNavigation();
    if(instantFlip){void $('flashcard').offsetHeight;$('flashcard').classList.remove('is-instant-flip');instantFlip=false}
  }
  function questionText(card) {
    let text=card.front;
    const references=Array.isArray(card.evidenceReferences)?card.evidenceReferences:[card.evidenceReference].filter(Boolean);
    for(const reference of references){
      const wrapped=['['+reference+']','('+reference+')','（'+reference+'）'];
      for(const value of wrapped)text=text.split(value).join('');
      // Older overlays without structured references may contain one plain label.
      if(!Array.isArray(card.evidenceReferences))text=text.split(reference).join('');
    }
    return text.replace(/[ \t]+([؟?])/g,'$1').replace(/[ \t]+\n/g,'\n').trim();
  }
  function renderCard(card) {
    $('question').scrollTop=0;$('answer').scrollTop=0;
    const front=questionText(card);
    const questionCopy=document.createElement('span'),answerCopy=document.createElement('span');questionCopy.className='card-copy';answerCopy.className='card-copy';questionCopy.textContent=front;answerCopy.textContent=card.answer_phrase;$('question').replaceChildren(questionCopy);$('answer').replaceChildren(answerCopy);
    // Style verified Quran text in place, including source questions that use
    // parentheses or quotation marks rather than decorative Quran brackets.
    const ranges=[...front.matchAll(/﴿[^﴾]+﴾/g)].map(match=>({start:match.index,end:match.index+match[0].length}));
    for(const entry of window.FLASHCARD_QURAN_PASSAGES||[]){
      if(entry.cardId!==card.id||entry.verificationStatus!=='verified')continue;
      for(const text of [entry.uthmaniText,...(entry.segments||[]).map(part=>part.uthmaniText)].filter(Boolean)){
        const start=front.indexOf(text);if(start>=0)ranges.push({start,end:start+text.length});
      }
    }
    const spans=[];for(const range of ranges.sort((a,b)=>a.start-b.start||b.end-a.end)){
      const prior=spans[spans.length-1];if(prior&&range.start<=prior.end)prior.end=Math.max(prior.end,range.end);else spans.push({...range});
    }
    if(spans.length){
      const parts=[];let last=0;
      for(const range of spans){const before=document.createElement('span'),quote=document.createElement('span');before.textContent=front.slice(last,range.start);quote.textContent=front.slice(range.start,range.end);quote.className='quran-inline';parts.push(before,quote);last=range.end}
      const after=document.createElement('span');after.textContent=front.slice(last);parts.push(after);questionCopy.replaceChildren(...parts);
    }
    if(card.formulaLatex&&!(window.STUDY_MATH?.containsFormula?.(card.answer_phrase,card.formulaLatex)??card.answer_phrase.includes('$'+card.formulaLatex+'$'))){const formula=document.createElement('span');formula.className='study-formula';formula.textContent='$$'+card.formulaLatex+'$$';answerCopy.append(formula)}
    if(card.image){const path=typeof card.image==='string'?card.image:card.image.src;if(typeof path==='string'&&/^(?:\.\/|\/)?assets\/[a-zA-Z0-9_./-]+$/.test(path)&&!path.includes('..')){const img=document.createElement('img');img.src='/'+path.replace(/^(?:\.\/|\/)/,'');img.alt=typeof card.image==='object'?card.image.alt||'رسم توضيحي من المصدر':'رسم توضيحي من المصدر';img.className='study-card-image';img.loading='lazy';answerCopy.append(img)}}
    window.STUDY_MATH?.render(questionCopy);window.STUDY_MATH?.render(answerCopy);
    $('question').classList.toggle('has-evidence',!!card.evidenceText);
    $('question-reference').textContent=card.evidenceReferences?.join(' · ')||card.evidenceReference||'';$('question-reference').hidden=!card.evidenceReference;
    $('chapter-label').textContent=chapters[card.chapter]||'';$('card-category').textContent=categoryNames[card.category]||'مراجعة';
    $('card-action-label').textContent=state.mode==='round'?'اختر الإجابة أدناه':'اضغط لإظهار الجواب';renderFace();
  }
  function renderQuiz() {
    const card=currentCard(),answer=state.answers[card.id];$('quiz-options').replaceChildren();
    card.exam.options.forEach((option,index)=>{
      const button=document.createElement('button');button.type='button';button.className='quiz-option';button.dataset.optionIndex=String(index);button.textContent=option;button.disabled=!!answer;
      button.setAttribute('aria-pressed',String(answer?.selectedIndex===index));
      if(answer){button.classList.toggle('is-correct',index===card.exam.correctIndex);button.classList.toggle('is-incorrect',answer.selectedIndex===index&&!answer.correct);if(index===card.exam.correctIndex)button.setAttribute('aria-label',option+'، الإجابة الصحيحة');else if(answer.selectedIndex===index)button.setAttribute('aria-label',option+'، اختيارك غير صحيح')}
      button.addEventListener('click',()=>answerQuestion(index));$('quiz-options').append(button);window.STUDY_MATH?.render(button);
    });
    $('quiz-feedback').hidden=!answer;$('quiz-next').hidden=!answer;
    if(answer){$('quiz-feedback-title').textContent=answer.correct?'إجابة صحيحة ✓':'إجابة غير صحيحة';$('quiz-feedback').classList.toggle('correct',answer.correct);$('quiz-feedback-answer').textContent=card.answer_phrase;window.STUDY_MATH?.render($('quiz-feedback-answer'));$('quiz-next').textContent=state.roundIndex===state.queue.length-1?'عرض النتيجة':'السؤال التالي ←'}
  }
  function answerQuestion(index) {
    const card=currentCard();if(state.mode!=='round'||!card||state.answers[card.id]||!Number.isInteger(index)||index<0||index>=card.exam.options.length)return;
    const result={selectedIndex:index,correct:index===card.exam.correctIndex};state.answers[card.id]=result;state.quizResults[card.id]=result;if(window.UNIVERSAL_PROGRESS)state.schedule[card.id]=window.UNIVERSAL_PROGRESS.nextSchedule(state.schedule[card.id],result);state.testUsed.add(card.id);
    const group=sampler.concept(card);state.conceptSeen[group]=(state.conceptSeen[group]||0)+1;
    renderQuiz();renderProgress();persist();tone();$('quiz-next').focus({preventScroll:true});
  }
  function nextQuestion() {
    if(state.mode!=='round'||!state.answers[currentCard()?.id])return;
    if(state.roundIndex===state.queue.length-1){
      const timing=state.roundTiming,complete=state.queue.length>0&&state.queue.every(id=>typeof state.answers[id]?.correct==='boolean');
      state.mode='results';if(complete)state.completedQuizzes++;render();$('results-title').focus({preventScroll:true});persist();
      if(complete&&timing&&window.QuizReceipt){
        const result={setLabel:timing.setLabel,startedAt:timing.startedAt,completedAt:Date.now(),elapsedSeconds:Math.max(0,(gestureNow()-timing.startedClock)/1000),attemptNumber:state.completedQuizzes,items:state.queue.map(id=>({question:questionText(byId.get(id)),correct:state.answers[id].correct}))};
        try{$('results').classList.toggle('receipt-enabled',window.QuizReceipt.show(result,{container:$('receipt-host'),returnFocus:$('results-title')})===true)}catch{$('results').classList.remove('receipt-enabled')}
      }
      tone(true);return;
    }
    state.roundIndex++;render();$('flashcard').focus({preventScroll:true});
  }
  function renderProgress() {
    const completed=state.mode==='round'?Object.keys(state.answers).length:state.visited.size;
    $('counter').textContent=ar(currentIndex()+1)+' من '+ar(visible.length);
    $('round-status').textContent=state.mode==='round'?ar(completed)+' أُجيبت':ar(completed)+' شوهدت';
    $('progress').setAttribute('aria-valuemax',String(visible.length));$('progress').setAttribute('aria-valuenow',String(completed));$('progress').setAttribute('aria-label',state.mode==='round'?'الأسئلة المجابة':'البطاقات المشاهدة');$('progress-fill').style.width=(completed/visible.length*100)+'%';
  }
  function renderResults() {
    const correct=Object.values(state.answers).filter(a=>a.correct).length;
    $('result-correct').textContent=ar(correct);$('result-incorrect').textContent=ar(state.queue.length-correct);$('result-summary').textContent=ar(correct)+' من '+ar(state.queue.length)+' إجابات صحيحة';$('retry-incorrect').hidden=correct===state.queue.length;
  }
  function renderMore() {
    const done=state.mode==='results'||state.mode==='browse'&&state.reviewPack.length>0&&state.reviewIndex===state.reviewPack.length-1&&state.visited.size===state.reviewPack.length;
    $('more-panel').hidden=!done;if(!done)return;
    const mode=activeMode(),fresh=selection(state,mode,{fresh:true,allAvailable:true}),total=poolSize();
    $('completion-note').textContent=fresh.ids.length?'انتهت هذه المجموعة.':'أنهيت الأسئلة الجديدة المتاحة بهذا الاختيار.';
    $('more-cards').textContent=fresh.ids.length?'زيادة؟':mode==='round'?'إعادة الاختبار':'إعادة المراجعة';
    $('more-note').textContent=fresh.ids.length?'التجديد يعرض '+cardCount(fresh.ids.length)+' لم تظهر لك ضمن اختيارك.':
      'المتاح هنا '+ar(total)+' مفهومًا مختلفًا. الإعادة تستخدم الأسئلة السابقة.'+(broaderChoice()?' يمكنك توسيع الاختيار أدناه.':'');
    renderBroader('broaden-pack');
  }
  function renewSet() {
    if($('study-config').open)state.count=$('config-count').value;
    const mode=activeMode(),fresh=selection(state,mode,{fresh:true,allAvailable:true});
    if(mode==='round')startRound(null,{renew:!!fresh.ids.length});else makeReviewPack({renew:!!fresh.ids.length});
    $('study-config').close();$('card-area').scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});
  }
  function finishEdgeTutorial(){edgeTutorialStage='done';clearTimeout(edgeCenterTimer);clearTimeout(edgeHintTimer);$('navigation-tutorial').hidden=true;$('navigation-tutorial').classList.remove('is-fading');try{localStorage.setItem(edgeTutorialKey,'seen')}catch{}}
  function renderEdgeTutorial(){
    const hint=$('navigation-tutorial');
    if(!mobileNavigation.matches||state.mode!=='browse'||!visible.length||edgeTutorialStage==='done'){hint.hidden=true;return}
    if(edgeTutorialStage==='edges'&&!state.flipped){finishEdgeTutorial();return}
    if(edgeTutorialStage==='center'&&state.flipped){edgeTutorialStage='edges';clearTimeout(edgeCenterTimer);hint.classList.remove('is-fading');edgeHintTimer=setTimeout(()=>{if(reduced.matches){finishEdgeTutorial();return}hint.classList.add('is-fading');edgeHintTimer=setTimeout(finishEdgeTutorial,350)},4500)}
    if(edgeTutorialStage==='center'){
      hint.textContent='اضغط البطاقة لقلبها. اسحب يمينًا للتالي ويسارًا للسابق.';hint.hidden=edgeCenterExpired;
      if(edgeCenterTimer===null)edgeCenterTimer=setTimeout(()=>{edgeCenterExpired=true;hint.hidden=true},8000);
    }else{hint.textContent='اضغط للعودة للسؤال. اسحب يمينًا للتالي ويسارًا للسابق.';hint.hidden=false}
  }
  function renderNavigation(){
    const show=state.mode==='browse'&&mobileNavigation.matches&&visible.length>0;
    document.body.classList.toggle('mobile-review',show);$('card-stage').classList.toggle('has-mobile-navigation',show);
    $('review-prev').hidden=state.mode!=='browse'||!visible.length;$('review-next').hidden=$('review-prev').hidden;
    $('review-prev').disabled=state.reviewIndex===0;$('review-next').disabled=state.reviewIndex>=visible.length-1;
    $('swipe-tutorial').textContent=mobileNavigation.matches?'اضغط البطاقة لقلبها. اسحب يمينًا للتالي ويسارًا للسابق.':'اضغط البطاقة لإظهار الجواب. استخدم ← للتالي، و→ للسابق.';
    $('welcome-instruction').textContent=mobileNavigation.matches?'اضغط البطاقة لقلبها. اسحب يمينًا للسؤال التالي، ويسارًا للسابق. مرّر النص الطويل رأسيًا داخل البطاقة.':'اضغط البطاقة لإظهار الجواب. تنقّل بأسهم لوحة المفاتيح.';renderEdgeTutorial();
  }
  function render() {
    renderMenus();
    visible=(state.mode==='browse'?state.reviewPack:state.queue).map(id=>byId.get(id)).filter(Boolean);
    const review=state.mode==='browse',round=state.mode==='round',results=state.mode==='results';
    renderNavigation();
    $('difficulty-controls').hidden=review;
    $('browse-mode').classList.toggle('active',review);$('browse-mode').setAttribute('aria-pressed',String(review));$('start-round').classList.toggle('active',!review);$('start-round').setAttribute('aria-pressed',String(!review));
    document.querySelectorAll('[data-chapter]').forEach(button=>{const selected=button.dataset.chapter===state.chapter;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});
    document.querySelectorAll('[data-difficulty]').forEach(button=>{const selected=button.dataset.difficulty===state.difficulty;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});
    const level={all:'كل المستويات',easy:'سهل',medium:'متوسط',hard:'صعب'}[state.difficulty];
    $('pack-label').textContent=(state.chapter==='all'?'مراجعة شاملة':chapters[state.chapter])+' · '+categories[state.category]+(review?'':' · '+level);
    $('availability-note').textContent='المتاح ضمن اختيارك: '+ar(poolSize())+' مفهومًا مختلفًا · هذه المجموعة: '+ar(visible.length);
    $('mode-label').textContent=round?'اختر الإجابة لتصحيحها تلقائيًا.':results?'انتهى الاختبار.':cardCount(visible.length)+' في هذه المجموعة';
    $('card-area').hidden=results||!visible.length;$('empty-state').hidden=results||!!visible.length;$('results').hidden=!results;$('quiz-interaction').hidden=!round;
    $('empty-message').textContent=round?'لا تتوفر أسئلة بخيارات موثوقة لهذا الاختيار. جرّب مستوى أو نوعًا آخر، أو راجع بطاقاته.':'جرّب نوعًا آخر أو مراجعة شاملة.';
    renderBroader('broaden-empty');
    if(review&&state.chapter!=='all'&&selection(state,'browse').missingOrderIds?.length)$('empty-message').textContent='تعذّر تحميل ترتيب الفصل. حدّث الصفحة.';
    if(!review)hideTutorial();
    if(results){renderResults();renderMore();return}
    if(!visible.length){renderMore();return}
    const card=currentCard();
    if(review&&!state.visited.has(card.id)){state.visited.add(card.id);state.reviewSeen.add(sampler.concept(card));persist()}
    if(round&&!state.testSeen.has(card.id)){state.testSeen.add(card.id);persist()}
    renderCard(card);if(round)renderQuiz();renderProgress();renderMore();
  }
  function showTutorial(force=false) {
    if(state.mode!=='browse')return;
    if(mobileNavigation.matches){$('swipe-tutorial').hidden=true;if(force){clearTimeout(edgeCenterTimer);clearTimeout(edgeHintTimer);edgeCenterTimer=null;edgeTutorialStage='center';edgeCenterExpired=false;try{localStorage.removeItem(edgeTutorialKey)}catch{}}renderEdgeTutorial();return}
let seen=false;try{seen=sessionStorage.getItem('islamic-study-navigation-hint-v3')==='1'}catch{}
    if(seen&&!force)return;clearTimeout(tutorialTimer);$('swipe-tutorial').hidden=false;$('swipe-tutorial').classList.remove('is-fading');
    tutorialTimer=setTimeout(()=>{$('swipe-tutorial').classList.add('is-fading');setTimeout(()=>$('swipe-tutorial').hidden=true,reduced.matches?0:600);try{sessionStorage.setItem('islamic-study-navigation-hint-v3','1')}catch{}},5500);
  }
  function hideTutorial(){clearTimeout(tutorialTimer);$('swipe-tutorial').hidden=true;try{sessionStorage.setItem('islamic-study-navigation-hint-v3','1')}catch{}}
  function configValues(){return{...state,count:$('config-count').value}}
  function renderConfig(){const mode=activeMode(),n=selection(configValues(),mode,{allAvailable:true}).ids.length,fresh=selection(configValues(),mode,{fresh:true,allAvailable:true});$('config-availability').textContent=cardCount(n)+' في المجموعة، من '+ar(poolSize(configValues(),mode))+' مفهومًا مختلفًا متاحًا.';$('apply-config').disabled=!allMetaValid;$('renew-set').disabled=!fresh.ids.length;$('renew-availability').textContent=fresh.ids.length?'التجديد يفتح '+cardCount(fresh.ids.length)+' لم تظهر لك.':'لا توجد أسئلة جديدة بهذا الاختيار. يمكنك توسيعه أو إعادة '+(mode==='round'?'الاختبار.':'المراجعة.');renderBroader('broaden-config');}
  function openConfig(){closeMenus();$('config-count').value=state.count;renderConfig();$('study-config').showModal();$('config-count').focus({preventScroll:true})}
  function renderSound(){$('sound').setAttribute('aria-pressed',String(state.sound));$('sound-label').textContent=state.sound?'الصوت مفعّل':'الصوت مغلق';$('sound').setAttribute('aria-label',state.sound?'إيقاف الصوت الاختياري':'تشغيل الصوت الاختياري')}
  function tone(complete=false){if(!state.sound)return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error();audioContext??=new Audio();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});(complete?[523,659,784]:[520]).forEach((frequency,i)=>{const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime+i*.12;oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.02,t+.02);gain.gain.exponentialRampToValueAtTime(.0001,t+.18);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(t);oscillator.stop(t+.2)})}catch{state.sound=false;renderSound()}}
  let currentSourceId='';
  const quranPassages=Array.isArray(window.FLASHCARD_QURAN_PASSAGES)?window.FLASHCARD_QURAN_PASSAGES.filter(entry=>entry.verificationStatus==='verified'&&entry.renderSeparately!==false):[];
  const label=tag=>tag.replaceAll('_',' ');
  const originalNote=card=>{const note=window.FLASHCARD_ORIGINAL_NOTES?.[card.id]||window.FLASHCARD_COMPARISON_NOTES?.[card.id];return note?.verificationStatus==='verified'&&(typeof note.quote==='string'||typeof note.note==='string')?note:null};
  const sourceTarget=card=>originalNote(card)?.relatedCardId||bookSupport(card)?.bookCardIds?.[0];
  const evidenceReference=card=>typeof card.printedReference==='string'?card.printedReference:typeof card.evidenceReference==='string'?card.evidenceReference:'';
  const verseUrl=card=>typeof card.fullVerseLink==='string'&&/^https:\/\/quran\.ksu\.edu\.sa\/tafseer\/[a-z]+\/sura\d+-aya\d+\.html$/.test(card.fullVerseLink)?card.fullVerseLink:'';
  const bookSupport=card=>{const support=window.FLASHCARD_BOOK_SUPPORT?.[card.id];return support?.verificationStatus==='verified'?support:null};
  const quranNotes=card=>quranPassages.filter(entry=>entry.cardId===card.id).flatMap(entry=>[entry.gap?.note,entry.referenceNote,entry.correctionNote]).filter(Boolean).join(' ');
  function renderQuran(card,id){
    const container=typeof id==='string'?$(id):id,entries=quranPassages.filter(entry=>entry.cardId===card.id),seen=new Set();container.replaceChildren();let count=0;
    const note=text=>{if(!text)return;const item=document.createElement('span');item.className='quran-note';item.textContent=text;container.append(item)};
    for(const entry of entries){
      const parts=entry.uthmaniText?[{text:entry.uthmaniText,keys:entry.verseKeys}]: (entry.segments||[]).filter(segment=>segment.uthmaniText).map(segment=>({text:segment.uthmaniText,keys:[segment.verseKey],separate:true}));
      parts.forEach((part,index)=>{if(!seen.has(part.text)){seen.add(part.text);count++;const block=document.createElement('span');block.className='quran-entry';const title=document.createElement('b');title.className='quran-label';title.textContent=part.separate?'مقتطف مستقل بالرسم العثماني':entry.displayLabel||'المقطع القرآني بالرسم العثماني';const quote=document.createElement('span');quote.className='quran-quote';quote.setAttribute('dir','rtl');quote.setAttribute('lang','ar');quote.textContent=part.text;const reference=document.createElement('span');reference.className='quran-reference';reference.textContent=(part.keys||[]).map(key=>'سورة '+String(key).replace(':','، آية ')).join(' · ');block.append(title,quote,reference);container.append(block)}if(entry.gap?.afterSegment===index)note(entry.gap.note)});
      note(entry.referenceNote);note(entry.correctionNote);
    }
    container.hidden=!count;
  }
  function renderBookSupport(card,id){
    const support=bookSupport(card),container=$(id);container.replaceChildren();container.hidden=!support;if(!support)return;
    const heading=document.createElement('b');heading.textContent=support.assessmentEligible?'الإجابة من الكتاب؛ لم ترد إجابة بملف إيهاب':support.label||'الإجابة من الكتاب';const provenance=document.createElement('span');provenance.textContent=support.provenanceNote||'مقتطفات من الكتاب؛ ليست إجابة مكتوبة في ملف إيهاب.';container.append(heading,provenance);
    for(const part of support.quoteParts||[]){const block=document.createElement('span');block.className='book-support-part';
      if(part.answerItems?.length){if(part.answerIntro){const intro=document.createElement('span');intro.textContent=part.answerIntro;block.append(intro)}const list=document.createElement('ol');list.className='answer-list';for(const item of part.answerItems){const li=document.createElement('li');li.textContent=item;list.append(li)}block.append(list);if(part.answerOutro){const outro=document.createElement('span');outro.textContent=part.answerOutro;block.append(outro)}}else{const quote=document.createElement('span');quote.textContent=part.text||'';block.append(quote)}
      if(part.explanation){const explanation=document.createElement('span');explanation.textContent=part.explanation;block.append(explanation)}const quran=document.createElement('span');quran.className='quran-passages';renderQuran({id:part.cardId},quran);block.append(quran);const source=document.createElement('small');source.textContent=part.source_label;block.append(source);container.append(block)
    }
  }
  function renderAnswer(card,textId,listId){
    const items=Array.isArray(card.answerItems)?card.answerItems.filter(item=>typeof item==='string'&&item.trim()):[];
    $(textId).textContent=card.hasBookAnswer?'لم ترد إجابة بملف إيهاب. الإجابة الموثقة من الكتاب أدناه.':card.hasAnswer===false?(card.sourceAnswerPhrase||'الجواب غير مرفق في المصدر. لن يدخل هذا السؤال في الاختبار حتى يتوفر جواب موثوق.'):card.answer_phrase;$(textId).hidden=!!items.length;$(listId).hidden=!items.length;$(listId).replaceChildren();
    for(const item of items){const li=document.createElement('li');li.textContent=item;$(listId).append(li)}
    const prefix=textId==='answer'?'answer':'source-dialog-answer';$(prefix+'-source-label').hidden=!card.sourceConflict&&!card.sourceAnswerPhrase;$(prefix+'-source-label').textContent='الجواب كما في المصدر';$(prefix+'-intro').hidden=!items.length||!card.answerIntro;$(prefix+'-intro').textContent=card.answerIntro||'';$(prefix+'-outro').hidden=!items.length||!card.answerOutro;$(prefix+'-outro').textContent=card.answerOutro||'';
  }
  function renderWarning(card,prefix){$(prefix).hidden=!card.sourceConflict&&!card.editorialNote;$(prefix+'-label').textContent=card.sourceConflict?'تنبيه حول جواب المصدر':'ملاحظة توضيحية';$(prefix+'-text').textContent=(card.editorialNote||'جواب المصدر يحتاج إلى مراجعة.')+(card.hasAnswer===false?' هذا السؤال مستبعد من الاختبار.':'')}
  function renderSourceAnnotations(card,prefix){const image=$(prefix+'-note-image'),valid=card.sourceNoteImage==='./assets/ihab-tf36-note.jpg';image.hidden=!valid;if(valid)image.setAttribute('src',card.sourceNoteImage);$(prefix+'-emphasis').hidden=!card.sourceEmphasis?.length;$(prefix+'-emphasis').textContent=card.sourceEmphasis?.length?'تأكيد بخط المصدر: '+card.sourceEmphasis.join(' · '):''}
  function renderOptions(card,id){const options=card.questionOptions||[];$(id).replaceChildren();$(id).hidden=!options.length;for(const option of options){const li=document.createElement('li');li.textContent=option;$(id).append(li)}}
  const explanationLabel=card=>card.sourceKind==='book'?'من شرح الكتاب':'من شرح المصدر';
  const provenance=card=>generic?'بطاقات موثّقة من المصدر':card.origin==='original'?'البطاقات الأصلية':card.sourceKind==='telegram'?'تجميعات تيليجرام':card.sourceKind==='ihab'?'ملف إيهاب':card.answerMode==='exact-quote'?'نص الكتاب':'بنك الكتاب';

  function renderClarification(card,prefix){const note=originalNote(card);$(prefix).hidden=!note;$(prefix+'-label').textContent=note?.label||'';$(prefix+'-note').textContent=note?.note||'';$(prefix+'-note').hidden=!note?.note;$(prefix+'-quote').textContent=note?.quote||'';$(prefix+'-quote').hidden=!note?.quote}

  function openSource(id){
    const card=rawById.get(id);if(!card||display[id]?.studyEligible!==true)return;currentSourceId=id;
    $('source-dialog-question').textContent=card.front;renderOptions(card,'source-dialog-options');renderAnswer(card,'source-dialog-answer','source-dialog-answer-list');$('source-dialog-provenance').textContent=provenance(card);
    $('source-dialog-explanation-label').hidden=!card.explanation;$('source-dialog-explanation-label').textContent=explanationLabel(card);$('source-dialog-explanation').hidden=!card.explanation;$('source-dialog-explanation').textContent=card.explanation;$('source-dialog-attribution').hidden=!card.explanationAttribution;$('source-dialog-attribution').textContent=card.explanationAttribution||'';
    renderQuran(card,'source-dialog-quran');renderBookSupport(card,'source-dialog-book-support');renderWarning(card,'source-dialog-warning');renderSourceAnnotations(card,'source-dialog');renderClarification(card,'source-dialog-clarification');
    $('source-dialog-notes').textContent=card.notes||'';$('source-dialog-notes').hidden=!card.notes;$('source-dialog-notes-label').hidden=!card.notes;$('source-dialog-reference').hidden=!evidenceReference(card);$('source-dialog-reference').textContent=evidenceReference(card);$('source-dialog-source').textContent=card.source_label;$('source-dialog-verse').hidden=!verseUrl(card);$('source-dialog-verse').setAttribute('href',verseUrl(card)||'#');
    const variants=[...(rawSampler.groups.get(rawSampler.concept(card))||[])],related=rawById.get(sourceTarget(card));if(related&&!variants.some(c=>c.id===related.id))variants.push(related);$('source-variant-list').replaceChildren();
    for(const variant of variants.filter(c=>c.id!==id&&display[c.id]?.studyEligible===true)){const button=document.createElement('button');button.type='button';button.dataset.cardId=variant.id;button.className='source-variant-button';button.textContent=provenance(variant)+' · '+variant.front;button.addEventListener('click',()=>openSource(variant.id));$('source-variant-list').append(button)}
    $('source-dialog-variants').hidden=!$('source-variant-list').children.length;window.STUDY_MATH?.render($('source-dialog'));if(!$('source-dialog').open)$('source-dialog').showModal();$('source-dialog-close').focus({preventScroll:true});
  }
  const searchText=value=>String(value||'').normalize('NFKD').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').toLowerCase();
  function renderBank(){
    const query=searchText(bankFilter.search),result=rawCards.filter(card=>display[card.id]?.studyEligible===true&&(bankFilter.chapter==='all'||String(card.chapter)===bankFilter.chapter)&&(bankFilter.category==='all'||card.category===bankFilter.category)&&(bankFilter.source==='all'||(card.sourceKind||'original')===bankFilter.source)&&(!query||searchText([card.id,card.front,card.answer_phrase,card.notes,card.source_label].join(' ')).includes(query)));
    $('bank-results').replaceChildren();for(const card of result){const row=document.createElement('li'),button=document.createElement('button'),question=document.createElement('span'),source=document.createElement('small');button.type='button';button.dataset.cardId=card.id;question.textContent=card.front;source.textContent=card.source_label+(display[card.id]?.studyEligible?'':' · غير محسوم: خارج الدراسة');button.append(question,source);button.addEventListener('click',()=>openSource(card.id));row.append(button);$('bank-results').append(row);window.STUDY_MATH?.render(question)}
    $('bank-results-count').textContent=ar(result.length)+' نصًا موثّقًا متاحًا. تُجمع الصيغ المتشابهة في المراجعة.';$('bank-empty').hidden=!!result.length;
  }
  function openBank(){renderBank();$('bank-dialog').showModal();$('bank-search').focus({preventScroll:true})}
  function closeBank(){if(!$('bank-dialog').open)return;$('bank-dialog').close();$('open-bank').focus({preventScroll:true})}
  const bankDialog=$('bank-dialog');let bankBackdropPress=false;
  const outsideBank=(x,y)=>{const rect=bankDialog.getBoundingClientRect();return Number.isFinite(x)&&Number.isFinite(y)&&(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)};
  bankDialog.addEventListener('pointerdown',event=>{bankBackdropPress=event.target===bankDialog&&outsideBank(event.clientX,event.clientY)});
  if(!('PointerEvent' in window))bankDialog.addEventListener('touchstart',event=>{const touch=event.touches[0];bankBackdropPress=event.target===bankDialog&&event.touches.length===1&&outsideBank(touch?.clientX,touch?.clientY)},{passive:true});
  bankDialog.addEventListener('click',event=>{const dismiss=bankBackdropPress&&event.target===bankDialog&&outsideBank(event.clientX,event.clientY);bankBackdropPress=false;if(dismiss)closeBank()});
  bankDialog.addEventListener('cancel',event=>{event.preventDefault();closeBank()});
  $('open-bank').addEventListener('click',()=>{closeMenus();openBank()});$('close-bank').addEventListener('click',closeBank);$('source-dialog-close').addEventListener('click',()=>$('source-dialog').close());
  for(const[id,field]of [['bank-chapter','chapter'],['bank-category','category'],['bank-source','source']])$(id).addEventListener('change',event=>{bankFilter[field]=event.target.value;renderBank()});$('bank-search').addEventListener('input',event=>{bankFilter.search=event.target.value;renderBank()});
  $('open-config').addEventListener('click',openConfig);$('close-config').addEventListener('click',()=>$('study-config').close());$('config-count').addEventListener('change',renderConfig);$('apply-config').addEventListener('click',()=>{state.count=$('config-count').value;$('study-config').close();resetPack()});
  document.querySelectorAll('[data-chapter]').forEach(button=>button.addEventListener('click',()=>{
    const chapter=button.dataset.chapter,alreadyOpen=menuChapter===chapter;
    closeMenus();
    if(state.chapter!==chapter){state.chapter=chapter;state.category=chapter==='all'?'all':state.chapterCategories[chapter];resetPack()}
    if(chapter!=='all'&&!alreadyOpen){menuChapter=chapter;$('chapter-menu-'+chapter).hidden=false;button.setAttribute('aria-expanded','true')}
  }));
  document.querySelectorAll('[data-difficulty]').forEach(button=>button.addEventListener('click',()=>{if(state.mode==='browse')return;state.examDifficulty=state.examDifficulty===button.dataset.difficulty?'all':button.dataset.difficulty;state.difficulty=state.examDifficulty;closeMenus();resetPack()}));
  document.addEventListener('click',event=>{if(menuChapter&&!event.target.closest('.chapter-item'))closeMenus()});
  $('browse-mode').addEventListener('click',()=>{if(state.mode!=='browse')makeReviewPack()});$('return-review').addEventListener('click',()=>makeReviewPack());
  $('start-round').addEventListener('click',()=>{if(state.mode==='browse'||state.mode==='results')startRound()});
  $('quiz-next').addEventListener('click',nextQuestion);
  $('retry-incorrect').addEventListener('click',()=>makeReviewPack({ids:state.queue.filter(id=>!state.answers[id]?.correct)}));
  $('more-cards').addEventListener('click',renewSet);$('renew-set').addEventListener('click',renewSet);for(const id of ['broaden-pack','broaden-config','broaden-empty'])$(id).addEventListener('click',broaden);
  $('review-prev').addEventListener('click',()=>swipeTo(-1));$('review-next').addEventListener('click',()=>swipeTo(1));
  // Ignore only compatibility clicks after a pointer gesture; genuine taps/keys use the fade lock.
  $('flashcard').addEventListener('click',()=>{if(gestureNow()>=gestureClickUntil)mobileFlip()});
  $('flashcard').addEventListener('contextmenu',event=>event.preventDefault());
  $('flashcard').addEventListener('pointerdown',event=>{
    if(event.isPrimary===false){gestureCancel();return}if(event.button!==undefined&&event.button!==0)return;
    gestureStart(event.clientX,event.clientY,event.pointerId,event.timeStamp??gestureNow());
  });
  $('flashcard').addEventListener('pointermove',event=>gestureMove(event.clientX,event.clientY,event.pointerId,event.timeStamp??gestureNow(),event));
  $('flashcard').addEventListener('pointerup',event=>gestureEnd(event.clientX,event.clientY,event.pointerId,event.timeStamp??gestureNow(),event));
  $('flashcard').addEventListener('pointercancel',gestureCancel);
  $('flashcard').addEventListener('lostpointercapture',event=>{if(event.target!==$('flashcard'))return;if(mobileGesture&&event.pointerId!==mobileGesture.id)return;gestureCancel()});
  if(!('PointerEvent' in window)){
    $('flashcard').addEventListener('touchstart',event=>{const t=event.touches[0];if(event.touches.length===1)gestureStart(t.clientX,t.clientY,'touch',event.timeStamp??gestureNow());else gestureCancel()},{passive:true});
    $('flashcard').addEventListener('touchmove',event=>{const t=event.touches[0];if(event.touches.length===1)gestureMove(t.clientX,t.clientY,'touch',event.timeStamp??gestureNow(),event);else gestureCancel()},{passive:false});
    $('flashcard').addEventListener('touchend',event=>{const t=event.changedTouches[0];if(t)gestureEnd(t.clientX,t.clientY,'touch',event.timeStamp??gestureNow(),event)},{passive:false});
    $('flashcard').addEventListener('touchcancel',gestureCancel,{passive:true});
  }
  for(const id of ['question','answer'])$(id).addEventListener('scroll',()=>{if(mobileNavigation.matches){faceScrollUntil=gestureNow()+180;blockGestureClick(180)}},{passive:true});
  mobileNavigation.addEventListener?.('change',()=>{resetMobileMotion();renderNavigation()});
  reduced.addEventListener?.('change',()=>{if(reduced.matches)resetMobileMotion()});
  // Trackpads emit wheel events, not pointer drags. Lock after one card until
  // the horizontal gesture (including inertia) has become quiet.
  $('card-area').addEventListener('wheel',event=>{
    if(state.mode!=='browse'||mobileNavigation.matches||motionBusy()||event.ctrlKey||event.metaKey)return;
    const scale=event.deltaMode===1?16:event.deltaMode===2?window.innerWidth:1;
    const dx=event.deltaX*scale,dy=event.deltaY*scale;
    if(Math.abs(dx)<3||Math.abs(dx)<=Math.abs(dy)*1.15)return;
    event.preventDefault();clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{wheelSum=0;wheelLocked=false},240);
    if(wheelLocked)return;wheelSum+=dx;
    if(Math.abs(wheelSum)>=38){wheelLocked=true;swipeTo(wheelSum>0?1:-1);wheelSum=0}
  },{passive:false});
  $('save-progress').checked=state.save;$('save-progress').addEventListener('change',event=>{state.save=event.target.checked;persist({remove:!state.save})});
  $('sound').addEventListener('click',()=>{state.sound=!state.sound;renderSound();tone()});
  $('clear-progress').addEventListener('click',()=>{$('clear-confirm').hidden=false;$('cancel-clear').focus({preventScroll:true})});$('cancel-clear').addEventListener('click',()=>$('clear-confirm').hidden=true);$('confirm-clear').addEventListener('click',()=>{state.quizResults={};state.schedule={};state.completedQuizzes=0;state.testUsed=new Set();state.testSeen=new Set();persist({clearQuiz:true});$('clear-confirm').hidden=true;say('مُسحت نتائج الاختبارات المحفوظة.')});
  $('replay-tutorial').addEventListener('click',()=>{$('study-config').close();if(state.mode!=='browse')makeReviewPack();showTutorial(true)});
  document.addEventListener('keydown',event=>{
    if($('source-dialog').open||$('bank-dialog').open||$('study-config').open||$('subjects-dialog').open)return;
    if(event.key==='Escape'&&menuChapter){const chapter=menuChapter;closeMenus();document.querySelector('[data-chapter="'+chapter+'"]').focus({preventScroll:true});return}
    if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.repeat||event.target.matches('input,select,textarea,summary')||event.target.isContentEditable)return;
    if(state.mode==='browse'&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){event.preventDefault();closeMenus();swipeTo(event.key==='ArrowLeft'?1:-1)}
    if(state.mode==='browse'&&(event.key===' '||event.key==='Enter')&&(event.target===document.body||event.target.id==='study'||event.target.id==='flashcard')){event.preventDefault();mobileFlip()}
  });
  window.COURSE_REVIEW={getCurrent:()=>state.mode==='browse'?currentCard():null,mark:value=>{const card=currentCard();if(state.mode!=='browse'||!card)return null;const previous=state.selfRatings[card.id];if(value==='known'||value==='review')state.selfRatings[card.id]=value;else delete state.selfRatings[card.id];persist();return{id:card.id,previous,saved:state.save}},undo:record=>{if(!record||!byId.has(record.id))return;if(record.previous!==undefined)state.selfRatings[record.id]=record.previous;else delete state.selfRatings[record.id];persist()}};
  // Add a subject only when its actual data and route are ready.
  const subjects=window.COURSE_CATALOG?window.COURSE_CATALOG.courses.map(c=>({id:c.id,title:c.name||c.title,href:'/'+c.id,available:true})):[{id:'islamic-economics',title:'الاقتصاد الإسلامي',href:'./',available:true}];
  $('open-subjects').addEventListener('click',()=>{closeMenus();$('subjects-list').replaceChildren();for(const subject of subjects.filter(s=>s.available)){const link=document.createElement('a');link.href=subject.href;link.textContent=subject.title+(subject.id===courseId?' · المادة الحالية':'');if(subject.id===courseId)link.setAttribute('aria-current','page');$('subjects-list').append(link)}$('subjects-dialog').showModal()});$('close-subjects').addEventListener('click',()=>$('subjects-dialog').close());
  $('bank-load-note').hidden=allMetaValid;$('bank-load-note').textContent='تعذّر تحميل بيانات الدراسة. جرّب تحديث الصفحة؛ النصوص الأصلية ما زالت في بنك المصادر.';
  $('welcome-count').textContent=cards.some(c=>c.examEligible)?'مراجعة واختبار':'بطاقات مراجعة';renderMenus();storageNote();renderSound();if(allMetaValid)makeReviewPack();else render();setTimeout(()=>showTutorial(),5000);
})();
