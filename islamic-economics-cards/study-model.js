(() => {
  'use strict';
  const categories = {all:'شامل',enumerations:'تعداد',evidence:'أدلة',definitions:'تعاريف',true_false:'صح وغلط'};
  const categoryNames = {...categories,flashcards:'مراجعة',comparisons:'فروقات'};
  const chapterNames = {1:'الفصل الأول',2:'الفصل الثاني',3:'الفصل الثالث'};
  const text = value => Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : '';
  function create(original, bank = [], presentation = {}, support = {}) {
    const ids = new Set(), rejected = [];
    const cards=original.map(card=>{ids.add(card.id);const view=presentation[card.id];const items=view?.presentationBasis==='existing-card-text'&&Array.isArray(view.answerItems)?view.answerItems.filter(item=>typeof item==='string'&&item.trim()):[];return{...card,category:items.length&&categoryNames[view.category]?view.category:'flashcards',origin:'original',hasAnswer:true,answerItems:items,answerIntro:items.length?text(view.answerIntro):'',answerOutro:items.length?text(view.answerOutro):''}});
    for (const raw of Array.isArray(bank) ? bank : []) {
      const front=text(raw.front||raw.question), answer=text(raw.answer_phrase||raw.answer), sourceKind=raw.sourceKind||'book';
      const sourceHasAnswer=!!answer.trim()&&raw.answerStatus!=='unresolved'&&!raw.sourceConflict;
      const bookAnswer=support[raw.id],hasBookAnswer=bookAnswer?.verificationStatus==='verified'&&bookAnswer.assessmentEligible===true&&Array.isArray(bookAnswer.quoteParts)&&bookAnswer.quoteParts.length>0&&!raw.sourceConflict;
      const hasAnswer=sourceHasAnswer||hasBookAnswer;
      const sourceValid=sourceKind==='book'?!!raw.source?.bookPage:['telegram','ihab'].includes(sourceKind)&&!!raw.source?.title&&!!(raw.source.page||raw.source.file||raw.source.image);
      if (typeof raw.id!=='string'||!raw.id||ids.has(raw.id)||(!chapterNames[raw.chapter]&&!(sourceKind==='ihab'&&raw.chapter===null))||!categoryNames[raw.category]||raw.category==='all'||!front||(!hasAnswer&&raw.answerStatus!=='unresolved'&&!raw.sourceConflict)||!sourceValid||raw.verificationStatus!=='verified') { rejected.push(raw.id||'(missing id)'); continue; }
      ids.add(raw.id);
      cards.push({...raw,front,answer_phrase:answer,explanation:text(raw.explanation),notes:text(raw.notes),
        answerIntro:text(raw.answerIntro),answerOutro:text(raw.answerOutro),sourceAnswerPhrase:text(raw.sourceAnswerPhrase||(raw.sourceConflict?answer:'')),editorialNote:text(raw.editorialNote),
        answerItems:Array.isArray(raw.answerItems)?raw.answerItems.filter(item=>typeof item==='string'&&item.trim()):[],
        questionOptions:Array.isArray(raw.questionOptions)?raw.questionOptions.filter(item=>typeof item==='string'):[],
        source_label:text(raw.source_label)||`${chapterNames[raw.chapter]||'قسم المصدر'} | ص ${raw.source.bookPage||raw.source.page||''}`,
        tags:Array.isArray(raw.tags)?raw.tags.filter(tag=>typeof tag==='string'):['اقتصاد_إسلامي',chapterNames[raw.chapter]||'قسم_المصدر',categoryNames[raw.category]],
        category:raw.category,origin:'bank',sourceKind,hasAnswer,sourceHasAnswer,hasBookAnswer});
    }
    const byId=new Map(cards.map(card=>[card.id,card]));
    const starters=new Set(original.map(card=>card.id));
    for(const chapter of [1,2,3,null])for(const category of Object.keys(categoryNames).filter(c=>c!=='all'))cards.filter(c=>c.origin==='bank'&&c.chapter===chapter&&c.category===category).slice(0,3).forEach(c=>starters.add(c.id));
    function matches(card,selection,ratings={}, {ignoreStatus=false,ignoreTopic=false}={}){
      return(selection.chapter==='all'||String(card.chapter)===selection.chapter)&&(selection.category==='all'||card.category===selection.category)&&(ignoreTopic||selection.topic==='all'||card.tags.includes(selection.topic))&&(ignoreStatus||selection.filter==='all'||ratings[card.id]===selection.filter);
    }
    return{cards,byId,starters,rejected,matches};
  }
  window.STUDY_MODEL={create,categories,categoryNames,chapterNames};
})();
