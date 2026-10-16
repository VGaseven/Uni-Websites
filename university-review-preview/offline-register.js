(() => {
  'use strict';
  if(!('serviceWorker' in navigator))return;
  window.addEventListener('load',async()=>{
    let note;
    function status(text){if(!note){note=document.createElement('p');note.className='storage-note';note.setAttribute('role','status');document.querySelector('.page-footer')?.append(note)}note.textContent=text}
    function updateReady(){status('نسخة جديدة جاهزة. أكمل مجموعتك واحفظ تقدّمك، ثم أغلق كل تبويبات الموقع وافتحه مجددًا لتحديثه.')}
    try{
      const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      if(registration.waiting)updateReady();
      registration.addEventListener('updatefound',()=>{const installing=registration.installing;if(!installing)return;installing.addEventListener('statechange',()=>{if(installing.state==='installed'){if(navigator.serviceWorker.controller)updateReady();else status('المحتوى المتاح جاهز للمراجعة دون اتصال بعد اكتمال التنزيل.')}else if(installing.state==='redundant'&&!registration.active)status('لم يكتمل تنزيل المراجعة دون اتصال. افتح الموقع لاحقًا وأنت متصل.')})});
    }catch{status('لم يكتمل تفعيل المراجعة دون اتصال. يمكنك متابعة الدراسة وأنت متصل.')}
  },{once:true});
})();
