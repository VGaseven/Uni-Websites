(() => {
  'use strict';
  const buckets=['true_false','evidence','enumerations','definitions','other'];
  const bucket=card=>buckets.includes(card.category)?card.category:'other';
  const hash=(value,seed=0)=>{let n=2166136261^seed;for(const ch of value){n^=ch.codePointAt(0);n=Math.imul(n,16777619)}return(n>>>0)/4294967296};
  function create(cards,metadata={}){
    const byId=new Map(cards.map(card=>[card.id,card]));
    const mappedChapters=[...new Set(cards.map(card=>card.chapter).filter(ch=>Number.isInteger(ch)&&ch>0))].sort((a,b)=>a-b);
    const entries=metadata.cards||metadata.entries||metadata;
    const meta=card=>entries[typeof card==='string'?card:card.id]||{};
    const concept=card=>{const item=typeof card==='string'?byId.get(card):card,target=byId.get(item?.studyConceptAlias)||item;return item?.studyConceptId||target?.studyConceptId||meta(target||card).conceptGroup||meta(target||card).conceptKey||'unmapped:'+item.id};
    const variantKey=card=>concept(card)+'|'+String(card.front).normalize('NFKD').replace(/\p{M}/gu,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}]/gu,'');
    const lesson=card=>meta(card).topicId||meta(card).lessonId||'unmapped';
    const groups=new Map();for(const card of cards){const key=concept(card);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(card)}
    const complete=cards.every(card=>typeof meta(card).conceptGroup==='string'&&typeof meta(card).difficulty==='string');
    function canonical(key,activeIds,chapter='all'){
      const members=(groups.get(key)||[]).filter(card=>activeIds.has(card.id)&&(chapter==='all'||String(card.chapter)===String(chapter)));
      const rank=card=>{const preferred=meta(card).preferredCanonicalId||metadata.canonicalIds?.[key];return(card.id===preferred?10:0)+(card.origin==='original'?300:card.sourceKind==='book'?100:200)+(card.hasAnswer?1000:0)};
      return members.sort((a,b)=>rank(b)-rank(a)||a.id.localeCompare(b.id))[0];
    }
    // Chapter review follows explicit, source-checked book/topic ordering.
    // A missing order fails closed rather than guessing an ID or source order.
    const validStudyOrder=card=>{const order=card.studyOrder;return !!order&&String(order.chapter)===String(card.chapter)&&['topicOrder','groupOrder','itemOrder'].every(key=>Number.isFinite(order[key]))&&typeof order.groupId==='string'&&!!order.groupId};
    const compareStudyOrder=(a,b)=>a.studyOrder.topicOrder-b.studyOrder.topicOrder||a.studyOrder.groupOrder-b.studyOrder.groupOrder||a.studyOrder.itemOrder-b.studyOrder.itemOrder||a.id.localeCompare(b.id);
    function buildOrdered({chapter,difficulty='all',size=30,activeIds=new Set(cards.map(card=>card.id)),excludeIds=new Set()}={}){
      const available=cards.filter(card=>activeIds.has(card.id)&&!excludeIds.has(card.id)&&card.hasAnswer&&String(card.chapter)===String(chapter)&&(difficulty==='all'||meta(card).difficulty===difficulty));
      const availableIds=new Set(available.map(card=>card.id)),concepts=[...new Set(available.map(concept))];
      const canonicalCards=concepts.map(group=>canonical(group,availableIds,chapter)).filter(Boolean);
      const missingOrderIds=canonicalCards.filter(card=>!validStudyOrder(card)).map(card=>card.id);
      if(missingOrderIds.length)return{ids:[],target:size,ordered:true,missingOrderIds,availableConcepts:concepts.length,conceptCount:0};
      const selected=canonicalCards.sort(compareStudyOrder).slice(0,size);
      return{ids:selected.map(card=>card.id),target:size,ordered:true,missingOrderIds:[],availableConcepts:concepts.length,conceptCount:selected.length};
    }
    function build({chapter='all',difficulty='all',size=20,activeIds=new Set(cards.map(c=>c.id)),excludeIds=new Set(),conceptSeen={},seed=1,eligibleOnly=true,coverageFirst=true}={}){
      let candidates=cards.filter(card=>activeIds.has(card.id)&&!excludeIds.has(card.id)&&(!eligibleOnly||card.hasAnswer)&&(chapter==='all'||String(card.chapter)===String(chapter))&&(difficulty==='all'||meta(card).difficulty===difficulty));
      const availableConcepts=new Set(candidates.map(concept)),target=Math.min(size,availableConcepts.size),selected=[],selectedConcepts=new Set(),typeCounts={},topicCounts={},lessonCounts={},relatedCounts={},chapterCounts={},sourceCounts={};
      const topics=[...new Set(candidates.map(lesson))],chapterTargets={};
      const mapped=candidates.filter(card=>mappedChapters.includes(card.chapter)),mappedConcepts=new Set(mapped.map(concept));
      const chapterAvailable=Object.fromEntries(mappedChapters.map(ch=>[ch,new Set(mapped.filter(card=>card.chapter===ch).map(concept)).size]));
      const lessonMin=Object.fromEntries(mappedChapters.map(ch=>[ch,new Set(mapped.filter(card=>card.chapter===ch).map(card=>meta(card).lessonId||lesson(card))).size]));
      const quotaEnabled=chapter==='all'&&mappedConcepts.size>=target;
      if(quotaEnabled){
        const allLessons=Object.values(lessonMin).reduce((sum,n)=>sum+n,0);
        for(const ch of mappedChapters)chapterTargets[ch]=allLessons<=target?lessonMin[ch]:0;
        let remaining=target-Object.values(chapterTargets).reduce((sum,n)=>sum+n,0);
        while(remaining>0){const available=mappedChapters.filter(ch=>chapterTargets[ch]<chapterAvailable[ch]).sort((a,b)=>chapterTargets[a]-chapterTargets[b]||hash(String(a),seed)-hash(String(b),seed));if(!available.length)break;chapterTargets[available[0]]++;remaining--}
      }
      while(selected.length<target){
        let best=null,bestScore=-Infinity;
        const enforceQuota=quotaEnabled&&candidates.some(card=>!selectedConcepts.has(concept(card))&&(chapterCounts[card.chapter]||0)<(chapterTargets[card.chapter]||0));
        const coverageKey=card=>chapter==='all'?(meta(card).lessonId||lesson(card)):lesson(card),coverageCounts=chapter==='all'?lessonCounts:topicCounts;
        const forceCoverage=coverageFirst&&candidates.some(card=>!selectedConcepts.has(concept(card))&&!coverageCounts[coverageKey(card)]&&(!enforceQuota||(chapterCounts[card.chapter]||0)<(chapterTargets[card.chapter]||0)));
        for(const card of candidates){const group=concept(card);if(forceCoverage&&coverageCounts[coverageKey(card)]||selectedConcepts.has(group)||enforceQuota&&(chapterCounts[card.chapter]||0)>=(chapterTargets[card.chapter]||0))continue;const m=meta(card),type=bucket(card),topic=lesson(card),related=m.relatedGroups?.length?m.relatedGroups:[m.relatedGroup||group],kind=card.sourceKind||'original';
          const unseenTopic=!(topicCounts[topic]>0),firstPass=coverageFirst&&chapter!=='all'&&selected.length<Math.min(topics.length,target);
          const typeDeficit=target/buckets.length-(typeCounts[type]||0),lessonId=m.lessonId||topic;
          let score=(mappedChapters.includes(card.chapter)&&!(lessonCounts[lessonId]>0)?(chapter==='all'?650:300):0)+typeDeficit*120+(firstPass&&unseenTopic?1000:0)+(unseenTopic?70:0)-(topicCounts[topic]||0)*35-related.reduce((sum,key)=>sum+(relatedCounts[key]||0),0)*22;
          if(chapter==='all')score+=((chapterTargets[card.chapter]||0)-(chapterCounts[card.chapter]||0))*75;
          score-=Math.min(8,conceptSeen[group]||0)*18;
          score+=(kind==='original'?28:kind==='book'?8:14)-(sourceCounts[kind]||0)*4+hash(card.id,seed)*10;
          if(score>bestScore){best=card;bestScore=score}
        }
        if(!best)break;selected.push(best);const m=meta(best),group=concept(best),topic=lesson(best),type=bucket(best),related=m.relatedGroups?.length?m.relatedGroups:[m.relatedGroup||group],kind=best.sourceKind||'original';selectedConcepts.add(group);typeCounts[type]=(typeCounts[type]||0)+1;topicCounts[topic]=(topicCounts[topic]||0)+1;lessonCounts[m.lessonId||topic]=(lessonCounts[m.lessonId||topic]||0)+1;for(const key of related)relatedCounts[key]=(relatedCounts[key]||0)+1;chapterCounts[best.chapter]=(chapterCounts[best.chapter]||0)+1;sourceCounts[kind]=(sourceCounts[kind]||0)+1;
      }
      // Repair feasible type deficits without sacrificing concept, chapter or coverage constraints.
      if(target%buckets.length===0){const desired=target/buckets.length;
        for(let pass=0;pass<target;pass++){
          const counts=Object.fromEntries(buckets.map(key=>[key,selected.filter(card=>bucket(card)===key).length]));
          const under=buckets.filter(key=>counts[key]<desired),over=buckets.filter(key=>counts[key]>desired);if(!under.length||!over.length)break;
          let replacement=null;
          for(let i=0;i<selected.length&&!replacement;i++){
            const old=selected[i];if(!over.includes(bucket(old)))continue;const others=selected.filter((_,index)=>index!==i),used=new Set(others.map(concept));
            for(const card of candidates){if(!under.includes(bucket(card))||used.has(concept(card))||card.chapter!==old.chapter)continue;
              const coverageKey=chapter==='all'?(meta(old).lessonId||lesson(old)):lesson(old),newKey=chapter==='all'?(meta(card).lessonId||lesson(card)):lesson(card);
              if(newKey!==coverageKey&&!others.some(item=>(chapter==='all'?(meta(item).lessonId||lesson(item)):lesson(item))===coverageKey))continue;
              replacement={index:i,card};break;
            }
          }
          if(!replacement)break;selected[replacement.index]=replacement.card;
        }
      }
      for(const object of [typeCounts,topicCounts,lessonCounts,chapterCounts,sourceCounts])for(const key of Object.keys(object))delete object[key];selectedConcepts.clear();
      for(const card of selected){const m=meta(card),type=bucket(card),topic=lesson(card),kind=card.sourceKind||'original';selectedConcepts.add(concept(card));typeCounts[type]=(typeCounts[type]||0)+1;topicCounts[topic]=(topicCounts[topic]||0)+1;lessonCounts[m.lessonId||topic]=(lessonCounts[m.lessonId||topic]||0)+1;chapterCounts[card.chapter]=(chapterCounts[card.chapter]||0)+1;sourceCounts[kind]=(sourceCounts[kind]||0)+1}
      return{ids:selected.map(card=>card.id),target:size,availableConcepts:availableConcepts.size,conceptCount:selectedConcepts.size,topicCount:Object.keys(topicCounts).length,lessonCount:Object.keys(lessonCounts).length,typeCounts,chapterCounts,sourceCounts};
    }
    return{meta,concept,variantKey,lesson,groups,canonical,build,buildOrdered,validStudyOrder,compareStudyOrder,complete,bucket};
  }
  window.STUDY_SAMPLER={create,buckets};
})();
