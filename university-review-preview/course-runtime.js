(() => {
  'use strict';
  const catalog=window.COURSE_CATALOG, data=window.COURSE_DATA;
  if(!catalog||!data)return;
  const slug=location.pathname.split('/').filter(Boolean)[0]||'islamic-econ';
  const id=slug==='study.html'||slug==='study'||slug==='islamic-economics'?'islamic-econ':slug;
  const course=(catalog.courses||[]).find(c=>(c.id||c.slug)===id);
  if(!course)return;
  const bundle=data[id];if(!bundle?.cards?.length)return;
  window.ACTIVE_COURSE={...course,id,bundle};
  const ar=n=>new Intl.NumberFormat('ar-SA',{useGrouping:false}).format(n),name=course.name||course.title;
  document.title=name+' · بطاقات المراجعة';
  const intro=document.querySelector('.compact-intro');if(id!=='islamic-econ'){const words=name.split(' '),em=document.createElement('em');em.textContent=words.pop();const heading=intro.querySelector('h1');heading.textContent=words.join(' ')+' ';heading.append(em)}
  const chapterIds=[...new Set(bundle.cards.filter(c=>c.studyEligible!==false).map(c=>c.chapter))].filter(Number.isInteger).sort((a,b)=>a-b);
  const chapterNames=Object.fromEntries(chapterIds.map(n=>{const meta=course.chapters?.find(ch=>String(ch.id)===String(n));return[n,meta?.title||meta?.name||window.STUDY_MODEL.chapterNames[n]||'الفصل '+ar(n)]}));
  if(id!=='islamic-econ'){
    window.STUDY_MODEL.chapterNames=chapterNames;
    const tabs=document.querySelector('.chapter-tabs');tabs.replaceChildren();
    const filter=document.getElementById('bank-chapter');filter.replaceChildren();const all=document.createElement('option');all.value='all';all.textContent='الجميع';filter.append(all);
    for(const n of chapterIds){const item=document.createElement('div'),button=document.createElement('button'),menu=document.createElement('div');item.className='chapter-item';button.type='button';button.className='chapter-tab';button.dataset.chapter=String(n);button.textContent=chapterNames[n]+' ⌄';button.setAttribute('aria-pressed','false');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','chapter-menu-'+n);menu.className='chapter-menu';menu.id='chapter-menu-'+n;menu.hidden=true;menu.setAttribute('aria-label','نوع أسئلة '+chapterNames[n]);item.append(button,menu);tabs.append(item);const option=document.createElement('option');option.value=String(n);option.textContent=chapterNames[n];filter.append(option)}
    document.getElementById('download-summary').hidden=true;
    const sourceFilter=document.getElementById('bank-source');sourceFilter.replaceChildren();for(const [value,text] of [['all','كل المصادر'],['original','البطاقات الموثّقة']]){const o=document.createElement('option');o.value=value;o.textContent=text;sourceFilter.append(o)}
    window.FLASHCARD_QURAN_PASSAGES=[];window.FLASHCARD_ORIGINAL_NOTES={};window.FLASHCARD_COMPARISON_NOTES={};window.FLASHCARD_BOOK_SUPPORT={};
    intro.querySelector('.eyebrow').textContent='المحتوى المتاح · '+ar(chapterIds.length)+' أقسام';document.querySelector('.edition-label').textContent='مراجعة المادة';const count=document.getElementById('welcome-count');document.querySelector('.welcome-meta').replaceChildren(count);count.textContent='بطاقات من مصادر موثّقة';
  }
  document.getElementById('welcome-title').textContent=name;if(course.contentNote){const note=document.createElement('p');note.className='storage-note';note.textContent=course.contentNote;intro.append(note)}
  const nav=document.createElement('nav');nav.className='course-links';nav.setAttribute('aria-label','مرجع المادة');for(const [text,href] of [['كل المواد','/'],['الملخص','/'+id+'/summary'],['القاموس','/'+id+'/glossary'],['موعد الاختبار','/'+id+'/cards'],['نقل التقدّم','/?transfer=1']]){const a=document.createElement('a');a.textContent=text;a.href=href;nav.append(a)}intro.after(nav);
})();
