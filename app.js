(() => {
  const KNOW = window.BJT_KNOWLEDGE || [];
  const QUESTIONS = window.BJT_QUESTIONS || [];
  const OPTION_DETAILS = window.BJT_OPTION_DETAILS || {};
  const ARTICLE_DETAILS = window.BJT_ARTICLE_DETAILS || {};
  const BUSINESS_COURSE = window.BJT_BUSINESS_COURSE || {chapters:[]};
  const BUSINESS_QUESTIONS = QUESTIONS.filter(q=>q.course==='practical_business');
  const QMAP = Object.fromEntries(QUESTIONS.map(q=>[q.id,q]));
  const KMAP = Object.fromEntries(KNOW.map(k=>[k.id,k]));
  const STORAGE='bjtDeepStateV1';
  const APP_TIME_ZONE='Asia/Tokyo';
  const today=(d=new Date())=>{
    try{
      const parts=new Intl.DateTimeFormat('en-US',{timeZone:APP_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
      const values=Object.fromEntries(parts.map(x=>[x.type,x.value]));
      return `${values.year}-${values.month}-${values.day}`;
    }catch(e){
      const pad=n=>String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    }
  };
  const defaultState={
    progress:{}, favorites:[], weak:[], notes:{},
    daily:{date:today(),count:0},
    settings:{shuffleOptions:true, extensionSize:30, mixedSize:30, showReadings:true, includeBusinessInMixed:false}
  };
  let state=loadState();
  let session=null;
  let currentPrepared=null;
  let currentAnswered=false;
  let currentSelectedOriginalIndex=null;
  let articleFocusId=null;

  function loadState(){
    try{
      const raw=JSON.parse(localStorage.getItem(STORAGE)||'null');
      const s={...defaultState,...(raw||{})};
      s.settings={...defaultState.settings,...(s.settings||{})};
      s.progress=s.progress||{}; s.favorites=s.favorites||[]; s.weak=s.weak||[]; s.notes=s.notes||{};
      if(!s.daily || s.daily.date!==today()) s.daily={date:today(),count:0};
      return s;
    }catch(e){return structuredClone(defaultState)}
  }
  function ensureDailyCurrent(){
    const key=today();
    if(!state.daily || state.daily.date!==key){state.daily={date:key,count:0};return true}
    return false;
  }
  function saveState(){ ensureDailyCurrent(); localStorage.setItem(STORAGE,JSON.stringify(state)); updateToday(); }
  function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}
  function updateToday(){document.getElementById('todayStat').textContent=`今日 ${state.daily.count||0} 題`}
  function pct(a,b){return b?Math.round(a/b*100):0}
  function progressOf(id){return state.progress[id]||{attempts:0,correct:0,wrong:0,streak:0,lastCorrect:null,lastAt:null,due:0}}
  function businessRoleMeta(q){
    if(!q||q.course!=='practical_business')return null;
    const s=String(q.passage||'');
    let relation='商務情境';
    if(/客先|取引先|顧客|先方|御社|社外/.test(s)) relation='社外：我方 ↔ 對方';
    else if(/社内|同僚|上司|部下|後輩|新人/.test(s)) relation='社內：依上下／同僚關係判斷';
    else if(/電話/.test(s)) relation='電話：先確認我方／對方與下一步責任';
    else if(/会議|意見/.test(s)) relation='會議：追蹤發言者、論點與最後合意';
    return {relation,core:q.coreKnowledge||'場面判断',chapter:q.chapterTitle||''};
  }
  function businessMistakeHint(q,idx){
    if(!q||q.course!=='practical_business'||!Number.isInteger(idx))return '';
    const opt=q.options[idx]||'';
    if(q.chapter===1 && /おっしゃ|いらっしゃ|様|先生/.test(opt)) return '你可能看到職稱或敬稱就直覺使用尊敬語；但社外敬語要先看這個人是我方還是對方，不是職位越高就一定抬高。';
    if(q.chapter===2) return '你可能只抓到電話裡的一個關鍵字，卻沒有確認「現在人在哪裡、誰要回電、要傳什麼」這三件事。';
    if(q.chapter===3) return '你可能只看「事情有沒有說到」，忽略了對象、期限與負擔感；依賴題要同時判斷內容和語氣。';
    if(q.chapter===4) return '你可能只抓到價格或數量其中一項；訂購題通常要把品番、數量、價格、納期、納品先一起核對。';
    if(q.chapter===5) return '你可能把禮貌客套或「再確認」誤當成確定答應；邀請題要分清受諾、拒否、保留與社交性表達。';
    if(q.chapter===6) return '你可能把「請求許可」「請對方做事」和「禁止」混在一起；先看誰要做動作，再判斷句型功能。';
    if(q.chapter===7) return '你可能只看內容是否合理，沒有看建議的強度；商務建議要避免把助言說成命令或人格批評。';
    if(q.chapter===8) return '你可能把傳聞、予定、見込み或未確認資訊當成已確定事實；報告題要特別看資訊確度。';
    if(q.chapter===9) return '你可能被某一句數字或情緒表達吸引；意見題要找最後結論、理由與根據之間的關係。';
    return '你可能只記住某一句「同意／反對」，但會議題要追蹤誰對哪個論點表態，以及最後哪些事項已決定、哪些仍保留。';
  }
  function totalStats(){
    let attempts=0,correct=0,answered=0,mastered=0,wrongSet=0;
    Object.values(state.progress).forEach(p=>{attempts+=p.attempts||0;correct+=p.correct||0;if(p.attempts)answered++;if((p.streak||0)>=3)mastered++;if((p.wrong||0)>0)wrongSet++;});
    return {attempts,correct,answered,mastered,wrongSet,accuracy:pct(correct,attempts)};
  }
  function dueQuestions(){const now=Date.now();return QUESTIONS.filter(q=>{const p=progressOf(q.id);return p.attempts>0 && (p.due||0)<=now;})}
  function weakQuestions(){return QUESTIONS.filter(q=>{const p=progressOf(q.id);return state.weak.includes(q.id)||(p.wrong||0)>(p.correct||0)||(p.lastCorrect===false);})}
  function titleMap(view){return {
    dashboard:['總覽','用原題建立知識網，再用延伸題反覆鞏固。'],
    practice:['刷題','原題、延伸題、錯題與間隔複習。'],
    knowledge:['知識庫','每一道題的相關敬語、文法、詞彙與閱讀策略。'],
    articles:['文章詳解',`集中閱讀 ${Object.keys(ARTICLE_DETAILS).length} 篇文章：假名、翻譯、結構、陷阱與四選項詳解。`],
    business:['實用商務',`10 章 × 20 題：按情境建立真正可用的商務日語。`],
    mistakes:['錯題簿','集中處理答錯、標記不熟與低正確率題目。'],
    settings:['設定 / 備份','學習紀錄只存在這台裝置，可隨時匯出。']
  }[view]}
  function switchView(view){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-'+view).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    const [t,s]=titleMap(view);document.getElementById('pageTitle').textContent=t;document.getElementById('pageSubtitle').textContent=s;
    document.getElementById('sidebar').classList.remove('open');
    if(view==='dashboard')renderDashboard(); if(view==='practice')renderPractice(); if(view==='knowledge')renderKnowledge(); if(view==='articles')renderArticles(); if(view==='business')renderBusiness(); if(view==='mistakes')renderMistakes(); if(view==='settings')renderSettings();
  }

  function renderDashboard(){
    const st=totalStats(); const orig=QUESTIONS.filter(q=>q.source==='原題').length; const business=BUSINESS_QUESTIONS.length; const ext=QUESTIONS.filter(q=>q.source==='延伸').length; const due=dueQuestions().length; const weak=weakQuestions().length;
    document.getElementById('view-dashboard').innerHTML=`
      <div class="grid stats-grid">
        <div class="card stat"><span>題庫總量</span><strong>${QUESTIONS.length}</strong><small>${orig} 原題／原題型 + ${ext} 延伸題 + ${business} 實用商務</small></div>
        <div class="card stat"><span>累積作答</span><strong>${st.attempts}</strong><small>已接觸 ${st.answered} 題</small></div>
        <div class="card stat"><span>正確率</span><strong>${st.accuracy}%</strong><small>${st.correct} 題答對</small></div>
        <div class="card stat"><span>已熟練</span><strong>${st.mastered}</strong><small>連續答對 3 次以上</small></div>
      </div>
      <div class="card hero">
        <h2>不是只背答案，而是把每題拆成可遷移的知識。</h2>
        <p>目前已整理 ${KNOW.length} 個核心知識點。每道原題答完後會連到相關文法、敬語方向、固定搭配、商務詞彙與閱讀策略，再用針對同一考點設計的應用題、近義辨析與情境題反覆抽問。</p>
        <div class="quick-actions">
          <button class="btn primary" data-start="mixed">開始綜合 30 題</button>
          <button class="btn" data-start="original">重刷全部原題</button>
          <button class="btn ${due?'warn':''}" data-start="due">今日到期複習 (${due})</button>
          <button class="btn ${weak?'bad':''}" data-start="weak">弱點題 (${weak})</button>
        </div>
      </div>
      <div class="section-title"><div><h2>練習模式</h2><p>依目的切換，不用每次從頭刷。</p></div></div>
      <div class="grid mode-grid">
        ${modeCard('original','原題重現',`${orig} 題完整跑一輪`,'保留這串對話中的考點與原題型，先確認基本判斷。')}
        ${modeCard('extension','知識點延伸',`${ext} 題中隨機 ${state.settings.extensionSize} 題`,'把原題內的敬語、語彙、文法轉成新問法，防止只記答案位置。')}
        ${modeCard('mixed','綜合混合',`隨機 ${state.settings.mixedSize} 題`,'原題與延伸題混合，適合日常刷題。')}
        ${modeCard('weak','弱點集中',`${weak} 題`,'答錯較多、最近答錯或手動標記不熟的題目。')}
        ${modeCard('due','間隔複習',`${due} 題到期`,'依答題結果安排複習；答錯會更快再次出現。')}
        ${modeCard('knowledge','知識卡模式',`${KNOW.length} 個知識點`,'直接從概念、讀音、例句與易混點建立系統化記憶。')}
        ${modeCard('business','實用商務課程','10 章 × 20 題','按寒暄、電話、依賴、注文、會議等商務情境分章練習。')}
      </div>
      <div class="section-title"><div><h2>目前學習進度</h2><p>熟練標準：同一題連續答對 3 次。</p></div><span class="small">${st.mastered}/${QUESTIONS.length}</span></div>
      <div class="card progress-row"><div class="progress"><i style="width:${pct(st.mastered,QUESTIONS.length)}%"></i></div><b>${pct(st.mastered,QUESTIONS.length)}%</b></div>`;
    bindStartButtons();
  }
  function modeCard(mode,title,meta,desc){return `<button class="mode-card" data-start="${mode}"><h3>${esc(title)}</h3><p>${esc(desc)}</p><div class="meta">${esc(meta)}</div></button>`}
  function bindStartButtons(){document.querySelectorAll('[data-start]').forEach(b=>b.addEventListener('click',()=>{const m=b.dataset.start;if(m==='knowledge'){switchView('knowledge');return}if(m==='business'){switchView('business');return}startSession(m)}))}

  function startSession(mode){
    let list=[];
    if(mode==='original') list=QUESTIONS.filter(q=>q.source==='原題');
    if(mode==='extension') list=shuffle(QUESTIONS.filter(q=>q.source==='延伸')).slice(0,state.settings.extensionSize);
    if(mode==='mixed'){const pool=state.settings.includeBusinessInMixed?QUESTIONS:QUESTIONS.filter(q=>q.course!=='practical_business');list=shuffle(pool).slice(0,state.settings.mixedSize);}
    if(String(mode).startsWith('business-ch')){const ch=Number(String(mode).replace('business-ch',''));list=BUSINESS_QUESTIONS.filter(q=>q.chapter===ch);}
    if(mode==='weak') list=shuffle(weakQuestions());
    if(mode==='due') list=shuffle(dueQuestions());
    if(!list.length){toast(mode==='weak'?'目前沒有弱點題。':'目前沒有到期複習題。');switchView('practice');return}
    if(mode==='original') list=[...list]; else list=shuffle(list);
    session={mode,ids:list.map(q=>q.id),index:0,correct:0,wrong:0}; currentPrepared=null;currentAnswered=false;currentSelectedOriginalIndex=null;
    switchView('practice');
  }
  function prepareQuestion(q){
    const opts=q.options.map((text,i)=>({text,correct:i===q.answer,originalIndex:i}));
    return {...q, preparedOptions:state.settings.shuffleOptions?shuffle(opts):opts};
  }
  function currentQ(){ if(!session) return null; return QMAP[session.ids[session.index]]; }
  function renderPractice(){
    const root=document.getElementById('view-practice');
    if(!session){
      root.innerHTML=`<div class="section-title"><div><h2>選擇刷題方式</h2><p>原題先打底，延伸題負責把知識變成真正會用。</p></div></div><div class="grid mode-grid">
        ${modeCard('original','原題重現','完整題組','本串題目與等價文字版原題型。')}
        ${modeCard('extension','知識點延伸','隨機抽題','既有 BJT 知識點皆有針對性延伸題；干擾選項限定在同一語義／文法範圍。')}
        ${modeCard('mixed','綜合混合','日常模式','原題 + 延伸題混合；可在設定決定是否加入 200 題實用商務。')}
        ${modeCard('weak','弱點集中',`${weakQuestions().length} 題`,'只練最近答錯、錯多於對、或手動標記的題。')}
        ${modeCard('due','間隔複習',`${dueQuestions().length} 題`,'到期題集中複習。')}
        ${modeCard('knowledge','先看知識卡',`${KNOW.length} 張`,'先理解再刷題。')}
      </div>`; bindStartButtons(); return;
    }
    if(session.index>=session.ids.length){renderSessionEnd(root);return}
    const q=currentQ(); if(!currentPrepared||currentPrepared.id!==q.id) currentPrepared=prepareQuestion(q);
    const p=progressOf(q.id); const fav=state.favorites.includes(q.id); const weak=state.weak.includes(q.id);
    const related=(q.tags||[]).map(t=>KMAP[t]).filter(Boolean);
    root.innerHTML=`<div class="practice-layout">
      <div class="card practice-panel">
        <div class="practice-head"><span class="q-number">第 ${session.index+1} / ${session.ids.length} 題 · ${esc(q.category)}</span><span class="q-source">${esc(q.source)}</span></div>
        <div class="progress"><i style="width:${pct(session.index,session.ids.length)}%"></i></div>
        ${q.passage?`<div class="reading-passage ${q.course==='practical_business'?'business-scenario':''}"><div class="reading-passage-head"><span>${q.course==='practical_business'?'情境':'閱讀文章'}</span><small>${q.course==='practical_business'?'先確認人物關係與發話目的':'請先讀完整前文，再回答下方問題'}</small></div><div class="reading-passage-text">${esc(state.settings.showReadings&&q.readingPassage?q.readingPassage:q.passage)}</div></div>`:''}
        ${(q.assets||[]).length?`<div class="question-assets">${q.assets.map((src,i)=>`<figure><img src="${esc(src)}" alt="題目資料 ${i+1}" loading="lazy"><figcaption>題目資料 ${i+1}</figcaption></figure>`).join('')}</div>`:''}
        <div class="stem">${esc(q.stem)}</div>
        <div class="options">${currentPrepared.preparedOptions.map((o,i)=>`<button class="option" data-opt="${i}"><span class="key">${i+1}</span><span>${esc(state.settings.showReadings&&q.readingOptions?q.readingOptions[o.originalIndex]:o.text)}</span></button>`).join('')}</div>
        <div id="feedback"></div>
      </div>
      <aside class="grid">
        <div class="card side-card"><h3>這題的學習狀態</h3><div class="mini-list">
          <div class="mini-item"><b>作答 ${p.attempts} 次</b><small>答對 ${p.correct}／答錯 ${p.wrong}／連續答對 ${p.streak}</small></div>
          <div class="mini-item"><b>關聯知識 ${related.length} 個</b><small>${related.map(k=>k.title).join('、')||'—'}</small></div>
        </div><div class="actions"><button class="btn" id="favBtn">${fav?'★ 已收藏':'☆ 收藏'}</button><button class="btn ${weak?'warn':''}" id="weakBtn">${weak?'已標記不熟':'標記不熟'}</button></div></div>
        ${q.course==='practical_business'&&businessRoleMeta(q)?`<div class="card side-card role-card"><h3>角色／場景圖</h3><div class="role-flow"><span>我方</span><b>⇄</b><span>對方／關係人</span></div><p class="small"><b>${esc(businessRoleMeta(q).relation)}</b><br>核心：${esc(businessRoleMeta(q).core)}</p></div>`:''}<div class="card side-card"><h3>答題原則</h3><p class="small">敬語先看「誰做動作」；閱讀先找「作者真正要你做什麼」；固定搭配不要只靠中文直覺。</p></div>
      </aside>
    </div>`;
    document.querySelectorAll('.option').forEach(b=>b.addEventListener('click',()=>answerQuestion(Number(b.dataset.opt))));
    document.getElementById('favBtn').addEventListener('click',()=>toggleFav(q.id));
    document.getElementById('weakBtn').addEventListener('click',()=>toggleWeak(q.id));
    if(currentAnswered){
      document.querySelectorAll('.option').forEach((b,i)=>{const o=currentPrepared.preparedOptions[i];b.classList.add('disabled');if(o.correct)b.classList.add('correct');if(o.originalIndex===currentSelectedOriginalIndex&&!o.correct)b.classList.add('wrong')});
      showFeedback();
    }
  }
  function answerQuestion(index){
    if(currentAnswered) return;
    const q=currentPrepared, selected=q.preparedOptions[index]; const correct=!!selected.correct; currentAnswered=true; currentSelectedOriginalIndex=selected.originalIndex;
    if(correct) session.correct++; else session.wrong++;
    const p=progressOf(q.id); p.attempts=(p.attempts||0)+1; if(correct){p.correct=(p.correct||0)+1;p.streak=(p.streak||0)+1;}else{p.wrong=(p.wrong||0)+1;p.streak=0;}
    p.lastCorrect=correct; p.lastAt=Date.now(); p.due=Date.now()+(correct?(p.streak>=3?7:p.streak===2?3:1)*86400000:3600000);
    state.progress[q.id]=p; ensureDailyCurrent(); state.daily.count=(state.daily.count||0)+1; saveState();
    document.querySelectorAll('.option').forEach((b,i)=>{const o=q.preparedOptions[i];b.classList.add('disabled');if(o.correct)b.classList.add('correct');if(i===index&&!o.correct)b.classList.add('wrong')});
    showFeedback(correct);
  }
  function optionUsageHint(text=''){
    const t=String(text);
    const rules=[
      [/なにやら/, '「なにやら」＝不知怎麼回事、似乎有什麼，表示情況不明。'],
      [/なにかと/, '「なにかと」＝各方面、諸事，常見「年末はなにかと忙しい」。'],
      [/なにぶん/, '「なにぶん」＝畢竟、由於情況如此，常和「～もので」搭配。'],
      [/何卒|なにとぞ/, '「何卒（なにとぞ）」＝懇請、務必，是正式請求常用副詞。'],
      [/見極/, '「見極める」＝經觀察、分析後判斷本質、能力、適性或時機。'],
      [/見限/, '「見限る」＝徹底失去希望而放棄某人／某方。'],
      [/見切/, '「見切る」＝看穿、判斷到底，也常見「見切りをつける」＝決定放棄。'],
      [/見通/, '「見通し」＝前景、展望；「見通す」＝看透／預見。'],
      [/わりには/, '「～わりには」＝按前項條件來看，後項卻與一般預期不符。'],
      [/からには/, '「～からには」＝既然……就……，後項常是責任、決心或義務。'],
      [/からこそ/, '「～からこそ」＝正因為……才……，強調因果。'],
      [/ことから/, '「～ことから」＝由於……／從……可以判斷，偏客觀原因或依據。'],
      [/断念/, '「断念する」＝因困難等原因放棄原本打算，通常比「見送る」更接近放棄。'],
      [/廃止/, '「廃止する」＝正式取消制度、措施或既有事物。'],
      [/禁止/, '「禁止する」＝明文不准做某行為。'],
      [/ご忠告/, '「ご忠告」＝對方給的忠告、勸告。'],
      [/ご発言/, '「ご発言」＝對方的發言。'],
      [/ご配慮/, '「ご配慮」＝替對方設想、費心安排、關照。'],
      [/ご注意/, '「ご注意」＝提醒、注意。'],
      [/口が重い/, '「口が重い」＝話少、不容易開口。'],
      [/腰が重い/, '「腰が重い」＝遲遲不行動、難以開始。'],
      [/荷が重い/, '「荷が重い」＝責任／任務對自己而言負擔過重。'],
      [/気が重い/, '「気が重い」＝心情沉重、不想面對。'],
      [/すっきり/, '「すっきり」＝清爽、舒暢、俐落。'],
      [/あっさり/, '「あっさり」＝清淡；也可表示輕易、乾脆。'],
      [/きっかり/, '「きっかり」＝正好、精確，常接時間、金額、數量。'],
      [/さっぱり/, '「さっぱり」可表示清爽；和否定／業績狀態搭配時也可表示完全不行、毫無起色。'],
      [/かねがね/, '「かねがね」＝以前から、早就、一直以來。'],
      [/ご苦労様/, '「ご苦労様」＝慰勞對方辛苦，傳統上較常由上位者對下位者使用。'],
      [/お世話様/, '「お世話様」是感謝照顧／辛勞的寒暄，不是原因接續詞。'],
      [/御社/, '「御社（おんしゃ）」＝貴公司，主要用於會話。'],
      [/貴社/, '「貴社（きしゃ）」＝貴公司，主要用於書面。'],
      [/弊社/, '「弊社（へいしゃ）」＝敝公司、我方公司。'],
      [/検品/, '「検品」＝商品到貨後檢查數量、外觀、品質或動作。'],
      [/着荷/, '「着荷」＝貨物抵達目的地。'],
      [/代替|代わりの商品/, '「代替品」＝用來替換損壞／缺貨商品的替代商品。'],
      [/不具合/, '「不具合」＝產品、系統等出現瑕疵、異常、故障。'],
      [/新規/, '「新規」＝新辦、第一次申請／新進入。'],
      [/更新/, '「更新」＝續約、更新既有契約或訂閱。'],
      [/各自負担/, '「各自負担」＝最後由各人自己承擔費用，不會由公司報銷。'],
      [/同等/, '「同等」＝同一程度、相當。'],
      [/銀行並み/, '「～並み」＝和～差不多、達到～的程度。'],
      [/利便性に欠ける/, '「～に欠ける」＝缺乏～；「利便性に欠ける」＝不夠方便。'],
      [/ご覧ください/, '「ご覧ください」＝請您看；是對方「見る」的尊敬表現。'],
      [/ご覧にな/, '「ご覧になる」＝尊敬語「看」，主體應是對方／上位者。'],
      [/拝見/, '「拝見する」＝「見る」的謙讓語，主體是自己／我方。'],
      [/存じておりません/, '「存じておりません」＝「知っていません」的謙讓／鄭重表現。'],
      [/ご存じ/, '「ご存じ」＝「知っている」的尊敬語，用於對方／上位者。'],
      [/おっしゃられる|お集めになられた|くださられた|お読みになられた/, '這類形式把已成立的尊敬語再疊加「れる／られる」，標準敬語題通常視為二重敬語。'],
      [/おっしゃる/, '「おっしゃる」＝「言う」的尊敬語。'],
      [/申し上げ/, '「申し上げる」＝「言う」的謙讓語，通常是我方向尊敬對象說。'],
      [/申し伝え/, '「申し伝える」＝代為轉告，把某人的話傳給另一人。'],
      [/くださ/, '「くださる」＝「くれる」的尊敬語，方向是對方→我方。'],
      [/いただ/, '「いただく」＝「もらう」的謙讓語，方向是我方←對方。'],
      [/差し上げ|さしあげ/, '「差し上げる」＝「あげる」的謙讓語，方向是我方→對方；直接對受惠者說有時會有施恩感。'],
      [/ことにしている/, '「～ことにしている」＝自己決定並持續如此做，常表示個人習慣。'],
      [/ことになっている/, '「～ことになっている」＝制度、規定或既定安排如此。'],
      [/てでも|でも完成|してでも|押し切ってでも/, '「～てでも」＝即使採取那種手段也要達成目的，強調強烈意志。'],
      [/てまで|してまで|押し切ってまで/, '「～てまで」＝甚至做到那種地步，常帶「手段是否過頭」的評價。'],
      [/おかげ/, '「～おかげで」通常把好結果歸因於前項，中文近似「多虧」。'],
      [/せい/, '「～せいで／せいか」多把負面結果歸因於前項；「せいか」帶推測。'],
      [/差し支えなければ/, '「差し支えなければ」＝如果方便／不造成不便，是正式請求前的緩衝語。'],
      [/ご足労/, '「ご足労」＝麻煩對方親自跑一趟。'],
      [/お手数/, '「お手数」＝麻煩對方費工夫做事。'],
      [/お構いなく/, '「お構いなく」＝不用麻煩、不用特別招呼我，常由被招待者說。'],
      [/ご遠慮なく/, '「ご遠慮なく」＝請不要客氣、儘管……，常由招待／提供的一方說。'],
      [/回避/, '「回避」＝避免負面結果發生。'],
      [/忌避/, '「忌避」＝因厭惡、排斥而避開；「リスク忌避」＝風險厭惡。'],
      [/逃避/, '「逃避」＝不願面對而逃開，如「現実逃避」。'],
      [/退避/, '「退避」＝從危險場所撤離到安全處。'],
      [/周知/, '「周知」＝把資訊廣泛通知、讓大家知道。'],
      [/熟知/, '「熟知」＝自己充分理解、非常熟悉。'],
      [/据え置/, '「据え置き」＝不調整、維持現狀（常見價格、利率）。'],
      [/立替/, '「立替払い」＝先自行墊付，之後再精算／報銷；不等於最終自己負擔。'],
      [/前納/, '「前納」＝預先繳納、預付。'],
      [/未納/, '「未納」＝應繳而尚未繳納、欠繳。'],
      [/見送/, '「見送る」＝這次暫不採用／暫緩，通常仍保留未來可能。'],
      [/大盛況/, '「大盛況」＝活動非常熱鬧、成功、參加者很多。'],
      [/とんでもない/, '「とんでもない」可表示荒唐、極其嚴重、超乎常理。'],
      [/わずか/, '「わずか＋數量」＝僅僅只有，和「～にすぎない」很常搭配。'],
      [/兆し/, '「兆し」＝跡象、徵兆；正式書面常說「～の兆しが見られる」。'],
      [/復唱/, '「復唱」＝把剛聽到的內容原樣重複一次確認。'],
      [/折り返し/, '「折り返し電話する」＝回電。'],
      [/にて/, '「にて」是「で」的正式書面用法，可表示手段或場所。'],
      [/および/, '「および」＝以及、及，是正式書面連接語。'],
      [/次第/, '「～次第」＝一……就立刻……，如「入荷次第ご連絡します」。'],
      [/の上/, '「～の上」＝完成前項後再做後項，是正式書面常用接續。'],
    ];
    const hit=rules.find(([re])=>re.test(t));
    return hit?hit[1]:'';
  }
  function inferWrongType(q, text){
    if(q.category==='敬語'||q.category==='授受'||q.category==='接待'||q.category==='接待用語') return '敬語／角色方向不符';
    if(q.category==='固定搭配'||q.category==='慣用語') return '固定搭配／慣用語不符';
    if(q.category==='文法') return '文法功能不符';
    if(q.category==='閱讀'||q.category.startsWith('閱讀')) return '文章資訊／題目焦點不符';
    if(q.category==='近義詞'||q.category==='副詞'||q.category==='語彙'||q.category==='商務詞彙') return '語意或使用情境不符';
    return '不符合本題條件';
  }
  function getChoiceDetail(q, originalIndex){
    const manual=OPTION_DETAILS[q.id];
    const isCorrect=originalIndex===q.answer;
    if(manual && manual[originalIndex]){
      return {type:isCorrect?'正確用法':inferWrongType(q,q.options[originalIndex]),detail:manual[originalIndex],manual:true};
    }
    return {
      type:'資料完整性錯誤',
      detail:'資料完整性錯誤：此題缺少這個選項的獨立詳解。請勿以通用模板代替。',
      manual:false
    };
  }
  function renderAllChoiceDetails(q){
    return q.options.map((text,i)=>{const d=getChoiceDetail(q,i);const ok=i===q.answer;return `<div class="choice-detail ${ok?'is-correct':'is-wrong'}"><div class="choice-detail-head"><span class="choice-no">${i+1}</span><strong>${esc(text)}</strong><span class="choice-badge">${ok?'正解':esc(d.type)}</span></div><p>${esc(d.detail)}</p></div>`}).join('');
  }
  function showFeedback(forceCorrect){
    const q=currentPrepared; const p=progressOf(q.id); const related=(q.tags||[]).map(t=>KMAP[t]).filter(Boolean);
    const correct = typeof forceCorrect==='boolean'?forceCorrect:p.lastCorrect;
    const fb=document.getElementById('feedback'); if(!fb)return;
    const selectedIdx=currentSelectedOriginalIndex;
    const selectedWrong = !correct && Number.isInteger(selectedIdx) ? getChoiceDetail(q,selectedIdx) : null;
    fb.innerHTML=`<div class="explanation"><h3>${correct?'✓ 正確':'✕ 這題要修正'}</h3>
      ${selectedWrong?`<div class="wrong-choice-explain"><div class="wrong-choice-title">你選的「${esc(q.options[selectedIdx])}」為什麼不行？</div><span class="wrong-reason-tag">${esc(selectedWrong.type)}</span><p>${esc(selectedWrong.detail)}</p>${q.course==='practical_business'?`<div class="mistake-why"><b>你可能卡在這裡：</b>${esc(businessMistakeHint(q,selectedIdx))}</div>`:''}</div>`:''}
      <div class="main-explain"><b>本題核心解析</b><p>${esc(q.explanation)}</p></div>
      <div class="actions detail-actions"><button class="btn" id="allDetailsBtn" aria-expanded="false">詳解四個選項</button></div>
      <div id="allChoiceDetails" class="all-choice-details" hidden>${renderAllChoiceDetails(q)}</div>
      ${related.length?`<div class="reading-box"><b>關聯知識與讀音</b>${related.map(k=>`<div><strong>${esc(k.title)}</strong>${state.settings.showReadings&&k.reading?` <span class="small">（${esc(k.reading)}）</span>`:''}<br><span class="small">${esc(k.summary)}</span></div>`).join('<br>')}</div>`:''}
      ${q.passage&&ARTICLE_DETAILS[q.id]?`<div class="article-jump"><b>這是一題文章閱讀題</b><span>文章詳解保留全文假名、中文翻譯、閱讀結構、陷阱與解題策略。</span><button class="btn" id="articleDetailBtn">查看這篇文章的完整詳解</button></div>`:''}
      ${q.course==='practical_business'?`<div class="business-analysis-box"><b>情境解析</b><span>${esc(q.readingPassage||q.passage)}</span><p><strong>核心：</strong>${esc(q.coreKnowledge||'場面判断')}　<strong>本章：</strong>${esc(q.chapterTitle||'')}</p><p>${esc(q.trap||'先判斷人物關係、資訊確定度與說話者真正目的。')}</p></div>`:''}
      <div class="actions"><button class="btn bad" data-rate="again">再學一次</button><button class="btn warn" data-rate="hard">困難</button><button class="btn good" data-rate="good">普通</button><button class="btn primary" data-rate="easy">熟練</button></div>
      <div class="actions"><button class="btn" id="relatedBtn">再出一題關聯題</button><button class="btn primary" id="nextBtn">${session.index+1>=session.ids.length?'看結果':'下一題'}</button></div></div>`;
    document.querySelectorAll('[data-rate]').forEach(b=>b.addEventListener('click',()=>rateCurrent(b.dataset.rate)));
    document.getElementById('nextBtn').addEventListener('click',nextQuestion);
    document.getElementById('relatedBtn').addEventListener('click',injectRelatedQuestion);
    const allBtn=document.getElementById('allDetailsBtn'), allBox=document.getElementById('allChoiceDetails');
    allBtn.addEventListener('click',()=>{const open=allBox.hidden;allBox.hidden=!open;allBtn.setAttribute('aria-expanded',String(open));allBtn.textContent=open?'收起四個選項詳解':'詳解四個選項';});
    const articleBtn=document.getElementById('articleDetailBtn');
    if(articleBtn) articleBtn.addEventListener('click',()=>openArticle(q.id));
  }
  function rateCurrent(rate){
    const q=currentPrepared,p=progressOf(q.id),now=Date.now(); const days={again:0,hard:1,good:3,easy:10}[rate];
    p.due=now+(rate==='again'?10*60*1000:days*86400000); if(rate==='again'){p.streak=0;if(!state.weak.includes(q.id))state.weak.push(q.id)} if(rate==='easy')p.streak=Math.max(3,p.streak||0);state.progress[q.id]=p;saveState();toast({again:'10 分鐘後再複習',hard:'明天再複習',good:'3 天後再複習',easy:'10 天後再複習'}[rate]);
  }
  function nextQuestion(){session.index++;currentPrepared=null;currentAnswered=false;currentSelectedOriginalIndex=null;renderPractice();window.scrollTo({top:0,behavior:'smooth'})}
  function injectRelatedQuestion(){
    const tags=currentPrepared.tags||[]; const candidates=QUESTIONS.filter(x=>x.id!==currentPrepared.id && (x.tags||[]).some(t=>tags.includes(t)) && !session.ids.slice(session.index+1).includes(x.id));
    if(!candidates.length){toast('目前沒有其他關聯題。');return}
    const pick=shuffle(candidates)[0]; session.ids.splice(session.index+1,0,pick.id);toast('已把關聯題加入下一題。')
  }
  function renderSessionEnd(root){
    const total=session.correct+session.wrong; root.innerHTML=`<div class="card hero"><h2>本輪完成</h2><p>答對 ${session.correct}／${total}，正確率 ${pct(session.correct,total)}%。錯題已自動進入弱點追蹤，並依熟練度安排下次複習。</p><div class="quick-actions"><button class="btn primary" id="restartMixed">再刷綜合題</button><button class="btn" id="reviewWrong">立刻刷弱點題</button><button class="btn" id="backDash">回總覽</button></div></div>`;
    document.getElementById('restartMixed').onclick=()=>startSession('mixed');document.getElementById('reviewWrong').onclick=()=>startSession('weak');document.getElementById('backDash').onclick=()=>{session=null;switchView('dashboard')};
  }
  function toggleFav(id){const i=state.favorites.indexOf(id);if(i>=0)state.favorites.splice(i,1);else state.favorites.push(id);saveState();renderPractice()}
  function toggleWeak(id){const i=state.weak.indexOf(id);if(i>=0)state.weak.splice(i,1);else state.weak.push(id);saveState();renderPractice()}

  function renderKnowledge(){
    const cats=[...new Set(KNOW.map(k=>k.category))].sort(); const root=document.getElementById('view-knowledge');
    root.innerHTML=`<div class="toolbar"><input class="input" id="kSearch" placeholder="搜尋：例如 いただく、回避、敬語、報銷…"><select class="select" id="kCat"><option value="">全部分類</option>${cats.map(c=>`<option>${esc(c)}</option>`).join('')}</select></div><div id="kGrid" class="grid knowledge-grid"></div>`;
    const draw=()=>{const kw=document.getElementById('kSearch').value.trim().toLowerCase();const cat=document.getElementById('kCat').value;const list=KNOW.filter(k=>(!cat||k.category===cat)&&(!kw||[k.title,k.reading,k.summary,k.detail,k.example,k.contrast,...k.tags].join(' ').toLowerCase().includes(kw)));document.getElementById('kGrid').innerHTML=list.map(renderKCard).join('')||'<div class="card empty">找不到符合條件的知識點。</div>';bindNotes()};
    document.getElementById('kSearch').addEventListener('input',draw);document.getElementById('kCat').addEventListener('change',draw);draw();
  }
  function renderKCard(k){return `<article class="card knowledge-card"><div class="tag-list"><span class="tag">${esc(k.category)}</span>${(k.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><h3>${esc(k.title)}</h3>${state.settings.showReadings&&k.reading?`<div class="reading">讀音：${esc(k.reading)}</div>`:''}<p><b>${esc(k.summary)}</b></p><p>${esc(k.detail)}</p><div class="example">例：${esc(k.example)}</div>${k.contrast?`<div class="contrast">易混點：${esc(k.contrast)}</div>`:''}<div style="margin-top:14px"><label class="small">我的筆記</label><textarea class="note" data-note="${k.id}" placeholder="寫下你自己的記憶方式、錯因或例句…">${esc(state.notes[k.id]||'')}</textarea></div><div class="actions"><button class="btn" data-practice-tag="${k.id}">只刷這個知識點</button></div></article>`}
  function bindNotes(){document.querySelectorAll('[data-note]').forEach(t=>t.addEventListener('change',()=>{state.notes[t.dataset.note]=t.value;saveState();toast('筆記已保存')}));document.querySelectorAll('[data-practice-tag]').forEach(b=>b.addEventListener('click',()=>startTagSession(b.dataset.practiceTag)))}
  function startTagSession(tag){const list=QUESTIONS.filter(q=>(q.tags||[]).includes(tag));if(!list.length){toast('此知識點暫無題目');return}session={mode:'tag',ids:shuffle(list).map(q=>q.id),index:0,correct:0,wrong:0};currentPrepared=null;currentAnswered=false;currentSelectedOriginalIndex=null;switchView('practice')}

  function articleRecords(){
    return Object.values(ARTICLE_DETAILS).map(a=>({...a,question:QMAP[a.question_id]})).filter(a=>a.question);
  }
  function openArticle(qid){
    if(!ARTICLE_DETAILS[qid]){toast('這題目前沒有文章詳解。');return}
    articleFocusId=qid;
    switchView('articles');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function practiceOne(qid){
    if(!QMAP[qid]){toast('找不到對應題目。');return}
    session={mode:'one',ids:[qid],index:0,correct:0,wrong:0};
    currentPrepared=null;currentAnswered=false;currentSelectedOriginalIndex=null;
    switchView('practice');
  }
  function articleArrayBlock(title,items,cls=''){
    const list=(items||[]).filter(Boolean);
    if(!list.length)return '';
    return `<section class="article-study-block ${cls}"><h3>${esc(title)}</h3><ul>${list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`;
  }
  function renderArticles(){
    const root=document.getElementById('view-articles');
    const records=articleRecords();
    if(articleFocusId && ARTICLE_DETAILS[articleFocusId]){
      const a=ARTICLE_DETAILS[articleFocusId], q=QMAP[articleFocusId];
      if(!q){articleFocusId=null;renderArticles();return}
      const vocab=(a.vocabulary||[]).filter(x=>x&&x.surface&&x.reading);
      root.innerHTML=`
        <div class="article-detail-top"><button class="btn" id="articleBackBtn">← 回文章列表</button><span class="small">${esc(q.source)} · ${esc(q.category)} · ${esc(q.id)}</span></div>
        <article class="card article-detail-card">
          <div class="tag-list"><span class="tag">文章題</span><span class="tag">${esc(q.category)}</span><span class="tag">${esc(q.source)}</span></div>
          <h2>${esc(a.title||q.stem)}</h2>
          <p class="article-help">括號內為讀音輔助。正文之外，下方另整理本文重要漢字／詞彙讀音。</p>
          <section class="article-study-block"><h3>① 原文＋假名</h3><div class="article-annotated">${esc(a.annotated_passage||q.passage)}</div></section>
          <section class="article-study-block article-translation"><h3>② 完整中文翻譯</h3><div>${esc(a.translation_zh_tw||'')}</div></section>
          <div class="article-analysis-grid">
            <section class="article-study-block"><h3>③ 文章目的</h3><p>${esc(a.purpose||'')}</p></section>
            <section class="article-study-block"><h3>④ 文章結構</h3><p>${esc(a.structure||'')}</p></section>
          </div>
          ${articleArrayBlock('⑤ 關鍵判讀',a.key_points,'article-keypoints')}
          ${articleArrayBlock('⑥ 容易誤判的地方',a.traps,'article-traps')}
          <section class="article-study-block article-strategy"><h3>⑦ 解題方式</h3><p>${esc(a.strategy||'')}</p></section>
          <section class="article-study-block"><h3>⑧ 漢字／重要詞彙讀音</h3><div class="vocab-grid">${vocab.map(v=>`<div class="vocab-item"><strong>${esc(v.surface)}</strong><span>（${esc(v.reading)}）</span></div>`).join('')||'<span class="small">—</span>'}</div></section>
          <section class="article-study-block linked-question"><h3>⑨ 對應題目</h3><div class="stem article-stem">${esc(q.stem)}</div><div class="article-answer"><b>正確答案：</b>${q.answer+1}. ${esc(q.options[q.answer])}</div><div class="main-explain"><b>本題核心解析</b><p>${esc(q.explanation)}</p></div><div class="actions"><button class="btn primary" id="articlePracticeBtn">直接練這一題</button></div></section>
          <section class="article-study-block"><h3>⑩ 四個選項完整詳解</h3><div class="all-choice-details article-choice-details">${renderAllChoiceDetails(q)}</div></section>
        </article>`;
      document.getElementById('articleBackBtn').onclick=()=>{articleFocusId=null;renderArticles();window.scrollTo({top:0,behavior:'smooth'})};
      document.getElementById('articlePracticeBtn').onclick=()=>practiceOne(q.id);
      return;
    }
    root.innerHTML=`
      <div class="card article-intro"><h2>文章詳解</h2><p>這裡集中 ${records.length} 題有完整文章的題目。每篇保留原文、讀音、繁體中文翻譯、文章結構、閱讀陷阱、解題策略，以及四個選項的完整解析。</p></div>
      <div class="toolbar article-toolbar"><input class="input" id="articleSearch" placeholder="搜尋文章、題目、詞彙，例如：領収書、提携、研修…"><select class="select" id="articleSource"><option value="">全部來源</option><option value="原題">原題</option><option value="延伸">延伸題</option></select></div>
      <div id="articleList" class="article-list"></div>`;
    const draw=()=>{
      const kw=document.getElementById('articleSearch').value.trim().toLowerCase();
      const source=document.getElementById('articleSource').value;
      const list=records.filter(a=>{
        const q=a.question;
        const hay=[a.title,a.annotated_passage,a.translation_zh_tw,a.purpose,a.structure,a.strategy,...(a.key_points||[]),...(a.traps||[]),...(a.vocabulary||[]).flatMap(v=>[v.surface,v.reading]),q.stem,q.category,q.source].join(' ').toLowerCase();
        return (!source||q.source===source)&&(!kw||hay.includes(kw));
      });
      document.getElementById('articleList').innerHTML=list.map(a=>{
        const q=a.question;
        const excerpt=(a.translation_zh_tw||'').slice(0,145)+(String(a.translation_zh_tw||'').length>145?'…':'');
        return `<article class="card article-list-card"><div class="article-list-meta"><span class="tag">${esc(q.source)}</span><span class="tag">${esc(q.category)}</span><span class="small">${esc(q.id)}</span></div><h3>${esc(a.title||q.stem)}</h3><p>${esc(excerpt)}</p><div class="vocab-preview">${(a.vocabulary||[]).slice(0,5).map(v=>`<span>${esc(v.surface)}（${esc(v.reading)}）</span>`).join('')}</div><div class="actions"><button class="btn primary" data-open-article="${esc(q.id)}">查看文章詳解</button><button class="btn" data-practice-article="${esc(q.id)}">直接練題</button></div></article>`;
      }).join('')||'<div class="card empty">找不到符合條件的文章。</div>';
      document.querySelectorAll('[data-open-article]').forEach(b=>b.onclick=()=>openArticle(b.dataset.openArticle));
      document.querySelectorAll('[data-practice-article]').forEach(b=>b.onclick=()=>practiceOne(b.dataset.practiceArticle));
    };
    document.getElementById('articleSearch').addEventListener('input',draw);
    document.getElementById('articleSource').addEventListener('change',draw);
    draw();
  }


  function businessProgress(ch){
    const list=BUSINESS_QUESTIONS.filter(q=>q.chapter===ch);let attempts=0,correct=0,done=0;
    list.forEach(q=>{const p=progressOf(q.id);attempts+=p.attempts||0;correct+=p.correct||0;if((p.attempts||0)>0)done++;});
    return {total:list.length,done,attempts,correct,accuracy:pct(correct,attempts)};
  }
  function renderBusiness(){
    const root=document.getElementById('view-business');
    const chapters=BUSINESS_COURSE.chapters||[];
    root.innerHTML=`<div class="card business-hero"><div><span class="tag">NEW COURSE</span><h2>實用商務日語｜10 章情境訓練</h2><p>這 200 題獨立保留為課程，不會把原本 BJT 題庫的學習脈絡打散。每章 20 題；答題後可查看四選項本義、錯誤原因、情境解析與相關知識卡。</p></div><div class="business-course-stat"><strong>${BUSINESS_QUESTIONS.length}</strong><span>題</span></div></div>
      <div class="business-chapter-grid">${chapters.map(ch=>{const p=businessProgress(ch.chapter);const cards=(ch.knowledgeCards||[]).map(id=>KMAP[id]).filter(Boolean);return `<article class="card business-chapter-card"><div class="chapter-no">CH ${String(ch.chapter).padStart(2,'0')}</div><h3>${esc(ch.title)}</h3><p>${esc(ch.zh||'')}</p><div class="chapter-progress"><div class="progress"><i style="width:${pct(p.done,p.total)}%"></i></div><span>${p.done}/${p.total} 題 · 正確率 ${p.accuracy}%</span></div><div class="chapter-kps">${cards.map(k=>`<div class="chapter-kp"><strong>${esc(k.title.replace('實用商務｜',''))}</strong><span>${esc(k.summary)}</span></div>`).join('')}</div><div class="actions"><button class="btn primary" data-business-ch="${ch.chapter}">開始本章 20 題</button><button class="btn" data-business-review="${ch.chapter}">查看本章題目</button></div></article>`}).join('')}</div>
      <div id="businessQuestionList"></div>`;
    document.querySelectorAll('[data-business-ch]').forEach(b=>b.onclick=()=>startSession('business-ch'+b.dataset.businessCh));
    document.querySelectorAll('[data-business-review]').forEach(b=>b.onclick=()=>renderBusinessQuestionList(Number(b.dataset.businessReview)));
  }
  function renderBusinessQuestionList(ch){
    const box=document.getElementById('businessQuestionList');if(!box)return;
    const meta=(BUSINESS_COURSE.chapters||[]).find(x=>x.chapter===ch)||{};
    const list=BUSINESS_QUESTIONS.filter(q=>q.chapter===ch);
    box.innerHTML=`<div class="section-title"><div><h2>CH ${String(ch).padStart(2,'0')}｜${esc(meta.title||'')}</h2><p>${esc(meta.zh||'')}：可直接挑題，也可從章首開始完整練習。</p></div><button class="btn primary" data-start-business-list="${ch}">完整練本章</button></div><div class="business-question-list">${list.map((q,i)=>{const p=progressOf(q.id);return `<article class="card business-question-item"><div><span class="small">${i+1}/20 · ${esc(q.coreKnowledge||'')}</span><h3>${esc(state.settings.showReadings&&q.readingPassage?q.readingPassage:q.passage)}</h3><p>${esc(q.stem)}</p><div class="small">作答 ${p.attempts||0} 次 · 正確 ${p.correct||0} · 錯誤 ${p.wrong||0}</div></div><button class="btn" data-business-one="${esc(q.id)}">練這題</button></article>`}).join('')}</div>`;
    box.querySelector('[data-start-business-list]').onclick=()=>startSession('business-ch'+ch);
    box.querySelectorAll('[data-business-one]').forEach(b=>b.onclick=()=>practiceOne(b.dataset.businessOne));
    box.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderMistakes(){
    const list=weakQuestions().sort((a,b)=>{const pa=progressOf(a.id),pb=progressOf(b.id);return (pb.wrong||0)-(pa.wrong||0)});const root=document.getElementById('view-mistakes');
    if(!list.length){root.innerHTML='<div class="card empty">目前沒有錯題或標記不熟的題目。繼續刷題後會自動整理到這裡。</div>';return}
    root.innerHTML=`<div class="card"><div class="section-title" style="margin-top:0"><div><h2>${list.length} 題需要處理</h2><p>依答錯次數排序。</p></div><button class="btn primary" id="startWeakNow">開始刷錯題</button></div><div style="overflow:auto"><table class="table"><thead><tr><th>題目</th><th>分類</th><th>對 / 錯</th><th>操作</th></tr></thead><tbody>${list.map(q=>{const p=progressOf(q.id);return `<tr><td>${esc(q.stem)}</td><td>${esc(q.category)}</td><td>${p.correct||0} / ${p.wrong||0}</td><td><button class="btn" data-one="${q.id}">練這題</button></td></tr>`}).join('')}</tbody></table></div></div>`;
    document.getElementById('startWeakNow').onclick=()=>startSession('weak');document.querySelectorAll('[data-one]').forEach(b=>b.onclick=()=>{session={mode:'one',ids:[b.dataset.one],index:0,correct:0,wrong:0};currentPrepared=null;currentAnswered=false;currentSelectedOriginalIndex=null;switchView('practice')});
  }

  function renderSettings(){const root=document.getElementById('view-settings');root.innerHTML=`<div class="grid settings-grid">
    <div class="card"><h2>刷題設定</h2>
      <div class="setting-row"><div><b>選項隨機</b><div class="small">避免記答案位置。</div></div><input id="shuffleSet" type="checkbox" ${state.settings.shuffleOptions?'checked':''}></div>
      <div class="setting-row"><div><b>顯示平假名讀音</b><div class="small">在知識卡、文章與實用商務情境顯示括號讀音。</div></div><input id="readingSet" type="checkbox" ${state.settings.showReadings?'checked':''}></div>
      <div class="setting-row"><div><b>綜合題包含實用商務</b><div class="small">關閉後，綜合混合只抽原本 BJT 題庫。</div></div><input id="businessMixSet" type="checkbox" ${state.settings.includeBusinessInMixed?'checked':''}></div>
      <div class="setting-row"><div><b>延伸題每輪</b></div><select class="select" id="extSize">${[10,20,30,50,80].map(n=>`<option ${n===state.settings.extensionSize?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="setting-row"><div><b>綜合題每輪</b></div><select class="select" id="mixSize">${[10,20,30,50,80].map(n=>`<option ${n===state.settings.mixedSize?'selected':''}>${n}</option>`).join('')}</select></div>
    </div>
    <div class="card"><h2>備份與還原</h2><p class="small">進度、錯題、收藏與個人筆記都保存在瀏覽器 localStorage。換裝置前建議匯出。</p><div class="actions"><button class="btn primary" id="exportBtn">匯出學習紀錄</button><button class="btn" id="importBtn">匯入紀錄</button></div><hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><button class="btn danger" id="resetBtn">清除全部學習紀錄</button></div>
    <div class="card"><h2>題庫內容</h2><p>知識點：<b>${KNOW.length}</b></p><p>題目：<b>${QUESTIONS.length}</b></p><p>原題／原題型：<b>${QUESTIONS.filter(q=>q.source==='原題').length}</b></p><p>延伸題：<b>${QUESTIONS.filter(q=>q.source==='延伸').length}</b></p><p>實用商務課程：<b>${BUSINESS_QUESTIONS.length}</b></p></div>
    <div class="card"><h2>學習規則</h2><p class="small">答錯：1 小時內再複習；連對 1 次：約 1 天；連對 2 次：約 3 天；連對 3 次以上：約 7 天。你也可以在每題解析後手動評分，重新調整間隔。</p></div>
  </div>`;
    document.getElementById('shuffleSet').onchange=e=>{state.settings.shuffleOptions=e.target.checked;saveState()};document.getElementById('readingSet').onchange=e=>{state.settings.showReadings=e.target.checked;saveState()};document.getElementById('businessMixSet').onchange=e=>{state.settings.includeBusinessInMixed=e.target.checked;saveState()};document.getElementById('extSize').onchange=e=>{state.settings.extensionSize=Number(e.target.value);saveState()};document.getElementById('mixSize').onchange=e=>{state.settings.mixedSize=Number(e.target.value);saveState()};document.getElementById('exportBtn').onclick=exportState;document.getElementById('importBtn').onclick=()=>document.getElementById('importFile').click();document.getElementById('resetBtn').onclick=()=>{if(confirm('確定清除所有作答紀錄、筆記、收藏與錯題標記？')){localStorage.removeItem(STORAGE);state=loadState();session=null;toast('已清除');renderSettings()}};
  }
  function exportState(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`BJT學習紀錄_${today()}.json`;a.click();URL.revokeObjectURL(a.href)}
  function importState(file){const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);state={...defaultState,...d,settings:{...defaultState.settings,...(d.settings||{})}};saveState();toast('匯入完成');renderSettings()}catch(e){alert('檔案格式不正確')}};r.readAsText(file)}

  document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  document.getElementById('menuBtn').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('importFile').addEventListener('change',e=>{if(e.target.files[0])importState(e.target.files[0]);e.target.value=''})
  document.addEventListener('keydown',e=>{if(!document.getElementById('view-practice').classList.contains('active')||!session)return;if(!currentAnswered&&['1','2','3','4'].includes(e.key)){const b=document.querySelector(`.option[data-opt="${Number(e.key)-1}"]`);if(b)b.click()}else if(currentAnswered&&e.key==='Enter'){const b=document.getElementById('nextBtn');if(b)b.click()}})
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  updateToday();renderDashboard();
  setInterval(()=>{if(ensureDailyCurrent()) localStorage.setItem(STORAGE,JSON.stringify(state));updateToday()},60000);
})();
