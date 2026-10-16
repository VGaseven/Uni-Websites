/* Load the two small teaching modules only when a supported summary is opened. */
(function(root){'use strict';let loading=null;
function script(src){return new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=src;tag.onload=resolve;tag.onerror=()=>reject(new Error('Unable to load visual explanation'));document.head.append(tag)})}
function mount(panel,courseId){if(!['econometrics','math-econ'].includes(courseId))return;panel.dataset.visualCourse=courseId;if(!loading){const css=document.createElement('link');css.rel='stylesheet';css.href='/visual-learning.css';document.head.append(css);loading=script('/visual-model.js').then(()=>script('/visual-content.js')).then(()=>script('/visual-learning.js')).catch(error=>{loading=null;throw error})}loading.then(()=>{if(panel.dataset.visualCourse===courseId)root.STUDY_VISUALS?.mount(panel,courseId)}).catch(()=>{if(panel.dataset.visualCourse!==courseId)return;const note=document.createElement('p');note.className='storage-note';note.textContent='تعذّر تحميل الشرح التفاعلي. يبقى الملخص النصي متاحًا؛ أعد فتح الصفحة للمحاولة.';panel.append(note)})}
root.STUDY_VISUAL_LOADER=Object.freeze({mount});
})(window);
