(() => {
  'use strict';
  if(!window.COURSE_REVIEW)return;
  const api=window.COURSE_REVIEW, host=document.createElement('div');host.className='course-toolbar review-marks';host.setAttribute('aria-label','تقييم شخصي للمراجعة، لا يغيّر درجات الاختبار');
  let previous=null;const status=document.createElement('span');status.className='sr-only';status.setAttribute('role','status');
  const undo=document.createElement('button');undo.type='button';undo.className='text-button';undo.textContent='تراجع';undo.hidden=true;
  for(const [value,text] of [['review','أراجعها لاحقًا'],['known','عرفتها']]){const b=document.createElement('button');b.type='button';b.className='text-button';b.textContent=text;b.addEventListener('click',()=>{previous=api.mark(value);if(previous){undo.hidden=false;status.textContent=(value==='review'?'أُضيفت إلى المراجعة الشخصية.':'سُجّل تقييمك الشخصي. لا يغيّر درجة الاختبار.')+(previous.saved?'':' فعّل الحفظ للاحتفاظ بها بعد مغادرة الصفحة.')}});host.append(b)}
  undo.addEventListener('click',()=>{api.undo(previous);previous=null;undo.hidden=true;status.textContent='تم التراجع عن آخر تقييم.'});host.append(undo,status);document.getElementById('flip-hint').after(host);
  const render=()=>{host.hidden=!api.getCurrent()};new MutationObserver(render).observe(document.getElementById('quiz-interaction'),{attributes:true,attributeFilter:['hidden']});render();
  document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.repeat||e.target.matches('input,select,textarea')||document.querySelector('dialog[open]')||!api.getCurrent())return;if(e.key.toLowerCase()==='r'||e.key.toLowerCase()==='k'){previous=api.mark(e.key.toLowerCase()==='r'?'review':'known');undo.hidden=!previous;status.textContent=previous?.saved?'حُفظ تقييم المراجعة الشخصي.':'سُجّل التقييم لهذه الجلسة؛ فعّل الحفظ للاحتفاظ به.'}});
})();
