(() => {
  const KNOW = window.BJT_KNOWLEDGE || [];
  const QUESTIONS = window.BJT_QUESTIONS || [];
  const QMAP = Object.fromEntries(QUESTIONS.map(q=>[q.id,q]));
  const KMAP = Object.fromEntries(KNOW.map(k=>[k.id,k]));
  const STORAGE='bjtDeepStateV1';
  const today=()=>new Date().toISOString().slice(0,10);
  const defaultState={
    progress:{}, favorites:[], weak:[], notes:{},
    daily:{date:today(),count:0},
    settings:{shuffleOptions:true, extensionSize:30, mixedSize:30, showReadings:true}
  };
  let state=loadState();
  let session=null;
  let currentPrepared=null;
  let currentAnswered=false;

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
  function saveState(){ localStorage.setItem(STORAGE,JSON.stringify(state)); updateToday(); }
  function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}
  function updateToday(){document.getElementById('todayStat').textContent=`今日 ${state.daily.count||0} 題`}
  function pct(a,b){return b?Math.round(a/b*100):0}
  function progressOf(id){return state.progress[id]||{attempts:0,correct:0,wrong:0,streak:0,lastCorrect:null,lastAt:null,due:0}}
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
    mistakes:['錯題簿','集中處理答錯、標記不熟與低正確率題目。'],
    settings:['設定 / 備份','學習紀錄只存在這台裝置，可隨時匯出。']
  }[view]}
  function switchView(view){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-'+view).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    const [t,s]=titleMap(view);document.getElementById('pageTitle').textContent=t;document.getElementById('pageSubtitle').textContent=s;
    document.getElementById('sidebar').classList.remove('open');
    if(view==='dashboard')renderDashboard(); if(view==='practice')renderPractice(); if(view==='knowledge')renderKnowledge(); if(view==='mistakes')renderMistakes(); if(view==='settings')renderSettings();
  }

  function renderDashboard(){
    const st=totalStats(); const orig=QUESTIONS.filter(q=>q.source==='原題').length; const ext=QUESTIONS.length-orig; const due=dueQuestions().length; const weak=weakQuestions().length;
    document.getElementById('view-dashboard').innerHTML=`
      <div class="grid stats-grid">
        <div class="card stat"><span>題庫總量</span><strong>${QUESTIONS.length}</strong><small>${orig} 原題／原題型 + ${ext} 延伸題</small></div>
        <div class="card stat"><span>累積作答</span><strong>${st.attempts}</strong><small>已接觸 ${st.answered} 題</small></div>
        <div class="card stat"><span>正確率</span><strong>${st.accuracy}%</strong><small>${st.correct} 題答對</small></div>
        <div class="card stat"><span>已熟練</span><strong>${st.mastered}</strong><small>連續答對 3 次以上</small></div>
      </div>
      <div class="card hero">
        <h2>不是只背答案，而是把每題拆成可遷移的知識。</h2>
        <p>目前已整理 ${KNOW.length} 個核心知識點。每道原題答完後會連到相關文法、敬語方向、固定搭配、商務詞彙與閱讀策略，再由系統生成延伸題反覆抽問。</p>
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
      </div>
      <div class="section-title"><div><h2>目前學習進度</h2><p>熟練標準：同一題連續答對 3 次。</p></div><span class="small">${st.mastered}/${QUESTIONS.length}</span></div>
      <div class="card progress-row"><div class="progress"><i style="width:${pct(st.mastered,QUESTIONS.length)}%"></i></div><b>${pct(st.mastered,QUESTIONS.length)}%</b></div>`;
    bindStartButtons();
  }
  function modeCard(mode,title,meta,desc){return `<button class="mode-card" data-start="${mode}"><h3>${esc(title)}</h3><p>${esc(desc)}</p><div class="meta">${esc(meta)}</div></button>`}
  function bindStartButtons(){document.querySelectorAll('[data-start]').forEach(b=>b.addEventListener('click',()=>{const m=b.dataset.start;if(m==='knowledge'){switchView('knowledge');return}startSession(m)}))}

  function startSession(mode){
    let list=[];
    if(mode==='original') list=QUESTIONS.filter(q=>q.source==='原題');
    if(mode==='extension') list=shuffle(QUESTIONS.filter(q=>q.source==='延伸')).slice(0,state.settings.extensionSize);
    if(mode==='mixed') list=shuffle(QUESTIONS).slice(0,state.settings.mixedSize);
    if(mode==='weak') list=shuffle(weakQuestions());
    if(mode==='due') list=shuffle(dueQuestions());
    if(!list.length){toast(mode==='weak'?'目前沒有弱點題。':'目前沒有到期複習題。');switchView('practice');return}
    if(mode==='original') list=[...list]; else list=shuffle(list);
    session={mode,ids:list.map(q=>q.id),index:0,correct:0,wrong:0}; currentPrepared=null;currentAnswered=false;
    switchView('practice');
  }
  function prepareQuestion(q){
    const opts=q.options.map((text,i)=>({text,correct:i===q.answer}));
    return {...q, preparedOptions:state.settings.shuffleOptions?shuffle(opts):opts};
  }
  function currentQ(){ if(!session) return null; return QMAP[session.ids[session.index]]; }
  function renderPractice(){
    const root=document.getElementById('view-practice');
    if(!session){
      root.innerHTML=`<div class="section-title"><div><h2>選擇刷題方式</h2><p>原題先打底，延伸題負責把知識變成真正會用。</p></div></div><div class="grid mode-grid">
        ${modeCard('original','原題重現','完整題組','本串題目與等價文字版原題型。')}
        ${modeCard('extension','知識點延伸','隨機抽題','從 71 個知識點自動衍生意思題與例句題。')}
        ${modeCard('mixed','綜合混合','日常模式','原題 + 延伸題混合。')}
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
        <div class="stem">${esc(q.stem)}</div>
        <div class="options">${currentPrepared.preparedOptions.map((o,i)=>`<button class="option" data-opt="${i}"><span class="key">${i+1}</span><span>${esc(o.text)}</span></button>`).join('')}</div>
        <div id="feedback"></div>
      </div>
      <aside class="grid">
        <div class="card side-card"><h3>這題的學習狀態</h3><div class="mini-list">
          <div class="mini-item"><b>作答 ${p.attempts} 次</b><small>答對 ${p.correct}／答錯 ${p.wrong}／連續答對 ${p.streak}</small></div>
          <div class="mini-item"><b>關聯知識 ${related.length} 個</b><small>${related.map(k=>k.title).join('、')||'—'}</small></div>
        </div><div class="actions"><button class="btn" id="favBtn">${fav?'★ 已收藏':'☆ 收藏'}</button><button class="btn ${weak?'warn':''}" id="weakBtn">${weak?'已標記不熟':'標記不熟'}</button></div></div>
        <div class="card side-card"><h3>答題原則</h3><p class="small">敬語先看「誰做動作」；閱讀先找「作者真正要你做什麼」；固定搭配不要只靠中文直覺。</p></div>
      </aside>
    </div>`;
    document.querySelectorAll('.option').forEach(b=>b.addEventListener('click',()=>answerQuestion(Number(b.dataset.opt))));
    document.getElementById('favBtn').addEventListener('click',()=>toggleFav(q.id));
    document.getElementById('weakBtn').addEventListener('click',()=>toggleWeak(q.id));
    if(currentAnswered) showFeedback();
  }
  function answerQuestion(index){
    if(currentAnswered) return;
    const q=currentPrepared, selected=q.preparedOptions[index]; const correct=!!selected.correct; currentAnswered=true;
    if(correct) session.correct++; else session.wrong++;
    const p=progressOf(q.id); p.attempts=(p.attempts||0)+1; if(correct){p.correct=(p.correct||0)+1;p.streak=(p.streak||0)+1;}else{p.wrong=(p.wrong||0)+1;p.streak=0;}
    p.lastCorrect=correct; p.lastAt=Date.now(); p.due=Date.now()+(correct?(p.streak>=3?7:p.streak===2?3:1)*86400000:3600000);
    state.progress[q.id]=p; state.daily.count=(state.daily.count||0)+1; saveState();
    document.querySelectorAll('.option').forEach((b,i)=>{const o=q.preparedOptions[i];b.classList.add('disabled');if(o.correct)b.classList.add('correct');if(i===index&&!o.correct)b.classList.add('wrong')});
    showFeedback(correct);
  }
  function showFeedback(forceCorrect){
    const q=currentPrepared; const p=progressOf(q.id); const related=(q.tags||[]).map(t=>KMAP[t]).filter(Boolean);
    const correct = typeof forceCorrect==='boolean'?forceCorrect:p.lastCorrect;
    const fb=document.getElementById('feedback'); if(!fb)return;
    fb.innerHTML=`<div class="explanation"><h3>${correct?'✓ 正確':'✕ 這題要修正'}</h3><p>${esc(q.explanation)}</p>
      ${related.length?`<div class="reading-box"><b>關聯知識與讀音</b>${related.map(k=>`<div><strong>${esc(k.title)}</strong>${state.settings.showReadings&&k.reading?` <span class="small">（${esc(k.reading)}）</span>`:''}<br><span class="small">${esc(k.summary)}</span></div>`).join('<br>')}</div>`:''}
      <div class="actions"><button class="btn bad" data-rate="again">再學一次</button><button class="btn warn" data-rate="hard">困難</button><button class="btn good" data-rate="good">普通</button><button class="btn primary" data-rate="easy">熟練</button></div>
      <div class="actions"><button class="btn" id="relatedBtn">再出一題關聯題</button><button class="btn primary" id="nextBtn">${session.index+1>=session.ids.length?'看結果':'下一題'}</button></div></div>`;
    document.querySelectorAll('[data-rate]').forEach(b=>b.addEventListener('click',()=>rateCurrent(b.dataset.rate)));
    document.getElementById('nextBtn').addEventListener('click',nextQuestion);
    document.getElementById('relatedBtn').addEventListener('click',injectRelatedQuestion);
  }
  function rateCurrent(rate){
    const q=currentPrepared,p=progressOf(q.id),now=Date.now(); const days={again:0,hard:1,good:3,easy:10}[rate];
    p.due=now+(rate==='again'?10*60*1000:days*86400000); if(rate==='again'){p.streak=0;if(!state.weak.includes(q.id))state.weak.push(q.id)} if(rate==='easy')p.streak=Math.max(3,p.streak||0);state.progress[q.id]=p;saveState();toast({again:'10 分鐘後再複習',hard:'明天再複習',good:'3 天後再複習',easy:'10 天後再複習'}[rate]);
  }
  function nextQuestion(){session.index++;currentPrepared=null;currentAnswered=false;renderPractice();window.scrollTo({top:0,behavior:'smooth'})}
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
  function startTagSession(tag){const list=QUESTIONS.filter(q=>(q.tags||[]).includes(tag));if(!list.length){toast('此知識點暫無題目');return}session={mode:'tag',ids:shuffle(list).map(q=>q.id),index:0,correct:0,wrong:0};currentPrepared=null;currentAnswered=false;switchView('practice')}

  function renderMistakes(){
    const list=weakQuestions().sort((a,b)=>{const pa=progressOf(a.id),pb=progressOf(b.id);return (pb.wrong||0)-(pa.wrong||0)});const root=document.getElementById('view-mistakes');
    if(!list.length){root.innerHTML='<div class="card empty">目前沒有錯題或標記不熟的題目。繼續刷題後會自動整理到這裡。</div>';return}
    root.innerHTML=`<div class="card"><div class="section-title" style="margin-top:0"><div><h2>${list.length} 題需要處理</h2><p>依答錯次數排序。</p></div><button class="btn primary" id="startWeakNow">開始刷錯題</button></div><div style="overflow:auto"><table class="table"><thead><tr><th>題目</th><th>分類</th><th>對 / 錯</th><th>操作</th></tr></thead><tbody>${list.map(q=>{const p=progressOf(q.id);return `<tr><td>${esc(q.stem)}</td><td>${esc(q.category)}</td><td>${p.correct||0} / ${p.wrong||0}</td><td><button class="btn" data-one="${q.id}">練這題</button></td></tr>`}).join('')}</tbody></table></div></div>`;
    document.getElementById('startWeakNow').onclick=()=>startSession('weak');document.querySelectorAll('[data-one]').forEach(b=>b.onclick=()=>{session={mode:'one',ids:[b.dataset.one],index:0,correct:0,wrong:0};currentPrepared=null;currentAnswered=false;switchView('practice')});
  }

  function renderSettings(){const root=document.getElementById('view-settings');root.innerHTML=`<div class="grid settings-grid">
    <div class="card"><h2>刷題設定</h2>
      <div class="setting-row"><div><b>選項隨機</b><div class="small">避免記答案位置。</div></div><input id="shuffleSet" type="checkbox" ${state.settings.shuffleOptions?'checked':''}></div>
      <div class="setting-row"><div><b>顯示平假名讀音</b><div class="small">在知識卡與答題解析顯示讀音。</div></div><input id="readingSet" type="checkbox" ${state.settings.showReadings?'checked':''}></div>
      <div class="setting-row"><div><b>延伸題每輪</b></div><select class="select" id="extSize">${[10,20,30,50,80].map(n=>`<option ${n===state.settings.extensionSize?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="setting-row"><div><b>綜合題每輪</b></div><select class="select" id="mixSize">${[10,20,30,50,80].map(n=>`<option ${n===state.settings.mixedSize?'selected':''}>${n}</option>`).join('')}</select></div>
    </div>
    <div class="card"><h2>備份與還原</h2><p class="small">進度、錯題、收藏與個人筆記都保存在瀏覽器 localStorage。換裝置前建議匯出。</p><div class="actions"><button class="btn primary" id="exportBtn">匯出學習紀錄</button><button class="btn" id="importBtn">匯入紀錄</button></div><hr style="border:0;border-top:1px solid var(--line);margin:20px 0"><button class="btn danger" id="resetBtn">清除全部學習紀錄</button></div>
    <div class="card"><h2>題庫內容</h2><p>知識點：<b>${KNOW.length}</b></p><p>題目：<b>${QUESTIONS.length}</b></p><p>原題／原題型：<b>${QUESTIONS.filter(q=>q.source==='原題').length}</b></p><p>延伸題：<b>${QUESTIONS.filter(q=>q.source==='延伸').length}</b></p></div>
    <div class="card"><h2>學習規則</h2><p class="small">答錯：1 小時內再複習；連對 1 次：約 1 天；連對 2 次：約 3 天；連對 3 次以上：約 7 天。你也可以在每題解析後手動評分，重新調整間隔。</p></div>
  </div>`;
    document.getElementById('shuffleSet').onchange=e=>{state.settings.shuffleOptions=e.target.checked;saveState()};document.getElementById('readingSet').onchange=e=>{state.settings.showReadings=e.target.checked;saveState()};document.getElementById('extSize').onchange=e=>{state.settings.extensionSize=Number(e.target.value);saveState()};document.getElementById('mixSize').onchange=e=>{state.settings.mixedSize=Number(e.target.value);saveState()};document.getElementById('exportBtn').onclick=exportState;document.getElementById('importBtn').onclick=()=>document.getElementById('importFile').click();document.getElementById('resetBtn').onclick=()=>{if(confirm('確定清除所有作答紀錄、筆記、收藏與錯題標記？')){localStorage.removeItem(STORAGE);state=loadState();session=null;toast('已清除');renderSettings()}};
  }
  function exportState(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`BJT學習紀錄_${today()}.json`;a.click();URL.revokeObjectURL(a.href)}
  function importState(file){const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);state={...defaultState,...d,settings:{...defaultState.settings,...(d.settings||{})}};saveState();toast('匯入完成');renderSettings()}catch(e){alert('檔案格式不正確')}};r.readAsText(file)}

  document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  document.getElementById('menuBtn').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
  document.getElementById('importFile').addEventListener('change',e=>{if(e.target.files[0])importState(e.target.files[0]);e.target.value=''})
  document.addEventListener('keydown',e=>{if(!document.getElementById('view-practice').classList.contains('active')||!session)return;if(!currentAnswered&&['1','2','3','4'].includes(e.key)){const b=document.querySelector(`.option[data-opt="${Number(e.key)-1}"]`);if(b)b.click()}else if(currentAnswered&&e.key==='Enter'){const b=document.getElementById('nextBtn');if(b)b.click()}})
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  updateToday();renderDashboard();
})();
