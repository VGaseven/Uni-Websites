(() => {
  'use strict';
  const key='islamic-economics-theme-v1',paletteKey='islamic-economics-palette-v1',root=document.documentElement;
  const system=window.matchMedia('(prefers-color-scheme: dark)'),palettes=['burgundy','gray','green','midnight'];
  let choice=null,palette='burgundy';
  try{const saved=localStorage.getItem(key);if(saved==='dark'||saved==='light')choice=saved;const color=localStorage.getItem(paletteKey);if(palettes.includes(color))palette=color}catch{}
  function current(){return choice||(system.matches?'dark':'light')}
  // Published variants are supplied by a verified build manifest. Without it,
  // the existing PDF link remains usable (including older cached deployments).
  let summaryFallback=null;
  const paletteNames={burgundy:'عنابي وكريمي',gray:'رمادي وأسود',green:'أخضر وكريمي',midnight:'داكن'};
  function validSummary(item,palette,theme){return item&&item.filename==='islamic-economics-summary-'+palette+'-'+theme+'.pdf'&&/^[a-f0-9]{64}$/.test(item.sha256)&&Number.isInteger(item.pages)&&item.pages>0&&item.pages<=15}
  function renderSummary(){
    const link=document.querySelector('#download-summary');if(!link)return;
    summaryFallback??={href:link.getAttribute('href'),download:link.getAttribute('download')};
    const key=palette+'.'+current(),variants=window.STUDY_SUMMARY_DOWNLOADS?.version===1?window.STUDY_SUMMARY_DOWNLOADS.variants||{}:{};
    const matched=validSummary(variants[key],palette,current()),fallback=validSummary(variants['burgundy.light'],'burgundy','light');
    const item=matched?variants[key]:fallback?variants['burgundy.light']:null;
    if(item){
      link.setAttribute('href','./assets/'+item.filename+'?v='+item.sha256.slice(0,12));link.setAttribute('download',item.filename);
      const label='تحميل الملخص PDF، '+(matched?paletteNames[palette]:'عنابي وكريمي')+'، '+(matched&&current()==='dark'?'الوضع الليلي':'الوضع النهاري')+(matched?'':'، النسخة المتاحة حاليًا');link.setAttribute('aria-label',label);link.setAttribute('title',label);link.dataset.summaryVariant=matched?key:'burgundy.light';link.dataset.summaryMatched=String(!!matched);
    }else{
      link.setAttribute('href',summaryFallback.href);link.setAttribute('download',summaryFallback.download);link.setAttribute('aria-label','تحميل الملخص PDF');link.setAttribute('title','تحميل الملخص PDF');link.dataset.summaryVariant='default';link.dataset.summaryMatched='false';
    }
  }
  function render(){
    const dark=current()==='dark';root.dataset.theme=dark?'dark':'light';root.dataset.palette=palette;root.style.colorScheme=dark?'dark':'light';
    const button=document.getElementById('theme-toggle');if(button){const label=dark?'تفعيل الوضع النهاري':'تفعيل الوضع الليلي';button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',label);button.setAttribute('title',label)}
    document.querySelectorAll('[data-palette]').forEach(button=>{if(button.tagName!=='BUTTON')return;button.setAttribute('aria-pressed',String(button.dataset.palette===palette))});
    renderSummary();
  }
  function bind(){render();document.getElementById('theme-toggle')?.addEventListener('click',()=>{choice=current()==='dark'?'light':'dark';render();try{localStorage.setItem(key,choice)}catch{}});document.querySelectorAll('button[data-palette]').forEach(button=>button.addEventListener('click',()=>{palette=button.dataset.palette;render();try{localStorage.setItem(paletteKey,palette)}catch{}}))}
  render();system.addEventListener?.('change',()=>{if(!choice)render()});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
