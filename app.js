/* Technical Builder OS
 * Plain browser implementation to keep the PC localhost and Capacitor Android builds aligned.
 * Supabase is used through its documented HTTPS APIs; only the publishable client key is embedded.
 */
const SUPABASE_URL='https://bztsnkejidzjjlaghtly.supabase.co';
const SUPABASE_KEY='sb_publishable_Cef2U5pCDcDJp9DUpe36KA_8DrAetWc';
const LOCAL_KEY='tbo_local_state_v1';
const AUTH_KEY='tbo_auth_v1';
const CURRICULUM_URL='curriculum.json';

let C=null;
let state=defaultState();
let auth=loadAuth();
let activeSection='dashboard';
let domainFilter='ALL';
let syllabusSearch='';
let expandedModules=new Set();
let currentModal=null;
let syncTimer=null;
let clockTimer=null;
let renderQueued=false;
let derivedCache=null;
let derivedDirty=true;

const SECTIONS=[
 ['dashboard','Dashboard','🏠'],
 ['roadmap','Learning Roadmap','🗺️'],
 ['syllabus','Syllabus','📚'],
 ['courses','Course Roadmap','🎓'],
 ['projects','Projects','🧱'],
 ['ai','AI Lab','🤖'],
 ['security','Security','🛡️'],
 ['research','Research','🔬'],
 ['builder','Builder','🚀'],
 ['earning','Earning','💰'],
 ['frontier','Frontier','🌌'],
 ['mastery','Mastery','🧠'],
 ['resources','Resources','📂'],
 ['portfolio','Portfolio','🏆'],
 ['settings','Settings','⚙️']
];

function defaultState(){
  return {
    version:1,
    settings:{displayName:'',theme:'light',currentSection:'dashboard',compactMode:false},
    topics:{},
    projects:{},
    research:[],
    frontier:{},
    products:[],
    notes:[]
  };
}
function nowIso(){return new Date().toISOString()}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeUrl(v){try{const u=new URL(v); return /^https?:$/.test(u.protocol)?u.href:'#'}catch{return '#'}}
function pct(a,b){return b?Math.round(a*100/b):0}
function topicById(id){return C.topics.find(x=>x.topic_id===id)||null}
function conceptMap(){const m=new Map();for(const t of C.topics)m.set(t.concept_id,t);return m}
function loadLocal(){try{const x=JSON.parse(localStorage.getItem(LOCAL_KEY)||'null'); if(x && x.version===1) state=mergeState(defaultState(),x);}catch(e){console.warn(e)}}
function saveLocal(){localStorage.setItem(LOCAL_KEY,JSON.stringify(state));derivedDirty=true;derivedCache=null}
function loadAuth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}}
function saveAuth(){if(auth)localStorage.setItem(AUTH_KEY,JSON.stringify(auth));else localStorage.removeItem(AUTH_KEY)}
function mergeState(base,incoming){
  const out=JSON.parse(JSON.stringify(base));
  Object.assign(out.settings,incoming.settings||{});
  for(const [k,v] of Object.entries(incoming.topics||{}))out.topics[k]=v;
  for(const [k,v] of Object.entries(incoming.projects||{}))out.projects[k]=v;
  out.research=Array.isArray(incoming.research)?incoming.research:out.research;
  out.frontier=Object.assign(out.frontier,incoming.frontier||{});
  out.products=Array.isArray(incoming.products)?incoming.products:out.products;
  out.notes=Array.isArray(incoming.notes)?incoming.notes:out.notes;
  return out;
}
function touch(obj){obj.client_updated_at=nowIso()}

async function api(path,{method='GET',token=null,body=null,query=''}={}){
  const headers={'apikey':SUPABASE_KEY,'Content-Type':'application/json'};
  if(method==='POST' && path.startsWith('/rest/v1/')){headers.Prefer='resolution=merge-duplicates,return=minimal';}
  if(token)headers.Authorization=`Bearer ${token}`;
  const res=await fetch(`${SUPABASE_URL}${path}${query}`,{method,headers,body:body?JSON.stringify(body):undefined});
  const text=await res.text();
  let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok)throw new Error(data?.message||data?.error_description||data?.error||`${res.status} ${res.statusText}`);
  return data;
}
async function refreshAuth(){
  if(!auth?.refresh_token)return false;
  try{
    const d=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:auth.refresh_token}});
    auth={access_token:d.access_token,refresh_token:d.refresh_token||auth.refresh_token,user:d.user,expires_at:Date.now()+((d.expires_in||3600)*1000)};
    saveAuth();return true;
  }catch{auth=null;saveAuth();return false}
}
async function ensureAuth(){
  if(!auth)return null;
  if(auth.expires_at && Date.now()<auth.expires_at-60000)return auth;
  return (await refreshAuth())?auth:null;
}
async function signIn(email,password){
  const d=await api('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  auth={access_token:d.access_token,refresh_token:d.refresh_token,user:d.user,expires_at:Date.now()+((d.expires_in||3600)*1000)};saveAuth();return auth;
}
async function signUp(email,password){
  const d=await api('/auth/v1/signup',{method:'POST',body:{email,password}});
  if(d.access_token){auth={access_token:d.access_token,refresh_token:d.refresh_token,user:d.user,expires_at:Date.now()+((d.expires_in||3600)*1000)};saveAuth();}
  return d;
}
async function signOut(){try{if(auth?.access_token)await api('/auth/v1/logout',{method:'POST',token:auth.access_token})}catch{}auth=null;saveAuth();}
async function restList(table){return api(`/rest/v1/${table}`,{token:auth.access_token,query:'?select=*'})}
async function restUpsert(table,rows,conflict){
  if(!rows.length)return;
  return api(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`,{method:'POST',token:auth.access_token,body:rows,});
}

function depthRank(v){return ({F:0,S:1,A:2,O:3,X:4}[v]??0)}
function achievedDepthRank(v){return ({FOUNDATION:0,STRONG:1,ADVANCED:2,OVERKILL:3,FRONTIER:4}[v]??0)}
function topicDepthSatisfied(t,p){return achievedDepthRank(p.depth_level)>=depthRank(t.depth)}
function defaultTopicProgress(){return {status:'AVAILABLE',knowledge:false,problems:false,derivation:false,implementation:false,project:false,assessment:false,transfer:false,depth_level:'FOUNDATION',notes:'',client_updated_at:nowIso()}}
function getTopicProgress(t){return state.topics[t.concept_id]||defaultTopicProgress()}
function requiredEvidence(t){
  const req=new Set(t.mastery_requirements||[]);
  const map={explain:'knowledge',solve_basic:'problems',solve_standard:'problems',derive_or_reason:'derivation',implement:'implementation',project:'project',pass_assessment:'assessment',transfer:'transfer'};
  return [...req].map(x=>map[x]).filter(Boolean);
}
function baseEvidenceMastery(t){const p=getTopicProgress(t);const req=requiredEvidence(t);return topicDepthSatisfied(t,p) && (req.length?req.every(k=>!!p[k]):p.status==='MASTERED')}
function buildDerived(){
  if(!derivedDirty && derivedCache)return derivedCache;
  const masteredTopics=new Set();
  let changed=true;
  while(changed){
    changed=false;
    for(const t of C.topics){
      if(masteredTopics.has(t.topic_id) || !baseEvidenceMastery(t)) continue;
      let ok=true;
      for(const id of (t.hard_prerequisite_topic_ids||[])){
        const x=topicById(id);
        if(!x || !masteredTopics.has(x.topic_id)){ok=false;break}
      }
      if(ok) for(const mid of (t.hard_prerequisite_modules||[])){
        const mod=C.modules.find(m=>m.module_id===mid);
        if(!mod){ok=false;break}
        if(mod.topic_ids.some(id=>{const x=topicById(id);return !x || !masteredTopics.has(x.topic_id)})){ok=false;break}
      }
      if(ok){masteredTopics.add(t.topic_id);changed=true}
    }
  }
  const masteredConceptsSet=new Set();
  for(const id of masteredTopics){const t=topicById(id);if(t)masteredConceptsSet.add(t.concept_id)}
  derivedCache={masteredTopics,masteredConcepts:masteredConceptsSet};derivedDirty=false;return derivedCache;
}
function masteredConcepts(){return buildDerived().masteredConcepts}
function masteredTopicIds(){return buildDerived().masteredTopics}
function prereqSatisfied(t){
  const mastered=masteredTopicIds();
  for(const id of (t.hard_prerequisite_topic_ids||[])){const x=topicById(id);if(!x||!mastered.has(x.topic_id))return false}
  for(const mid of (t.hard_prerequisite_modules||[])){const mod=C.modules.find(m=>m.module_id===mid);if(!mod)return false;if(mod.topic_ids.some(id=>{const x=topicById(id);return !x||!mastered.has(x.topic_id)}))return false}
  return true;
}
function isMastered(t,p){return buildDerived().masteredTopics.has(t.topic_id)}
function effectiveStatus(t){const p=getTopicProgress(t); if(isMastered(t,p))return 'MASTERED'; if(!prereqSatisfied(t))return 'LOCKED'; if(p.status==='LOCKED')return 'AVAILABLE'; const evidence=requiredEvidence(t); const done=evidence.filter(k=>p[k]).length; if(p.status==='ASSESSED' && done>=Math.max(1,evidence.length-1))return 'ASSESSED'; if(p.project||p.implementation)return 'BUILDING'; if(p.problems||p.derivation)return 'PRACTICING'; if(p.knowledge)return 'LEARNING'; return 'AVAILABLE';}
function depthLabel(d){return ({F:'Foundation',S:'Strong',A:'Advanced',O:'Overkill',X:'Frontier'}[d]||d)}
function statusLabel(s){return ({LOCKED:'Locked',AVAILABLE:'Available',LEARNING:'Learning',PRACTICING:'Practicing',BUILDING:'Building',ASSESSED:'Assessed',MASTERED:'Mastered'}[s]||s)}
function depthClass(d){return d==='O'?'over':d==='X'?'warn':''}
function allProgressStats(){
  let mastered=0,learning=0,available=0,locked=0,practicing=0,building=0,assessed=0,over=0,frontier=0;
  for(const t of C.topics){const s=effectiveStatus(t); if(s==='MASTERED')mastered++; else if(s==='LEARNING')learning++; else if(s==='PRACTICING')practicing++; else if(s==='BUILDING')building++; else if(s==='ASSESSED')assessed++; else if(s==='LOCKED')locked++; else available++; if(t.depth==='O')over++;if(t.depth==='X')frontier++;}
  return {total:C.topics.length,mastered,learning,available,locked,practicing,building,assessed,over,frontier};
}
function phaseStats(p){const topics=C.topics.filter(t=>t.learning_phase_ids?.includes(p.phase_id));const mastered=masteredTopicIds();let m=0;topics.forEach(t=>{if(mastered.has(t.topic_id))m++});return {total:topics.length,mastered:m,pct:pct(m,topics.length)}}
function domainStats(d){const topics=C.topics.filter(t=>t.domain_id===d.domain_id);const mastered=masteredTopicIds();let m=0;topics.forEach(t=>{if(mastered.has(t.topic_id))m++});return {total:topics.length,mastered:m,pct:pct(m,topics.length)} }
function projectStatus(id){return state.projects[id]?.status||'NOT_STARTED'}
function syncPill(text,kind=''){const e=document.getElementById('sync-pill');if(!e)return;e.className='pill '+kind;e.innerHTML=`<i></i><span>${esc(text)}</span>`}
function toast(msg){const e=document.getElementById('toast');e.textContent=msg;e.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>e.classList.remove('show'),2400)}
function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render()})}
function applyTheme(){const isDark=state.settings.theme==='dark'; if(isDark)document.documentElement.dataset.theme='dark';else document.documentElement.removeAttribute('data-theme'); const meta=document.querySelector('meta[name=theme-color]'); if(meta)meta.content=isDark?'#0f1220':'#4f46e5'}
function updateClock(){const d=new Date();const t=d.toLocaleTimeString('en-IN',{hour12:false});const ds=d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});document.getElementById('live-clock').textContent=t;document.getElementById('live-date').textContent=ds}

function buildNav(){const n=document.getElementById('main-nav');n.innerHTML=SECTIONS.map(([id,label,icon])=>`<button class="${activeSection===id?'on':''}" onclick="go('${id}')">${icon} <span class="nav-label">${label}</span></button>`).join('')}
function go(id){activeSection=id;state.settings.currentSection=id;touch(state.settings);saveLocal();queueRender();queueSync();window.scrollTo({top:0,behavior:'smooth'})}
function render(){applyTheme();buildNav();updateClock();const app=document.getElementById('app');const page={dashboard:renderDashboard,roadmap:renderRoadmap,syllabus:renderSyllabus,courses:renderCourses,projects:renderProjects,ai:renderAI,security:renderSecurity,research:renderResearch,builder:renderBuilder,earning:renderEarning,frontier:renderFrontier,mastery:renderMastery,resources:renderResources,portfolio:renderPortfolio,settings:renderSettings}[activeSection]||renderDashboard;app.innerHTML=page();bindDynamic();}
function bindDynamic(){
  document.querySelectorAll('[data-status-change]').forEach(e=>e.addEventListener('change',()=>{const [kind,id]=e.dataset.statusChange.split('|');if(kind==='topic')setTopicStatus(id,e.value);if(kind==='project')setProjectStatus(id,e.value)}));
  document.querySelectorAll('[data-evidence]').forEach(e=>e.addEventListener('change',()=>toggleEvidence(e.dataset.evidence,e.checked)));
}
function renderDashboard(){
 const s=allProgressStats(), phase=C.learning_phases.find(p=>phaseStats(p).mastered<phaseStats(p).total)||C.learning_phases.at(-1); const ps=phaseStats(phase);
 const next=nextTopic(); const pr=next?getTopicProgress(next):null; const currentProject=next?C.projects.find(p=>p.module_id===next.module_id):null; const projectP=currentProject?projectStatus(currentProject.project_id):null;
 return `<div class="hero card"><div><div class="mu">Current Learning Phase</div><div class="big">${esc(phase.name)}</div><div class="mu">${ps.mastered}/${ps.total} topic placements mastered · ${ps.pct}%</div></div><div class="right"><div class="tag ${ps.pct===100?'ok':'ac'}">${ps.pct===100?'Phase complete':'Active phase'}</div><div style="margin-top:10px;min-width:220px" class="bar"><span style="width:${ps.pct}%"></span></div></div></div>
 <div class="stats"><div class="stat"><b>${s.mastered}</b><span>Mastered</span></div><div class="stat"><b>${s.learning}</b><span>Learning</span></div><div class="stat"><b>${s.practicing}</b><span>Practicing</span></div><div class="stat"><b>${s.building}</b><span>Building</span></div><div class="stat"><b>${s.over}</b><span>Overkill targets</span></div><div class="stat"><b>${s.frontier}</b><span>Frontier topics</span></div></div>
 <div class="two"><div class="card"><div class="section-head"><div><h2>Continue</h2><p>Your next capability action.</p></div></div>${next?`<button class="topic-open" onclick="openTopic('${next.topic_id}')"><div class="row"><div><span class="tag ${depthClass(next.depth)}">${depthLabel(next.depth)}</span></div><div class="t"><strong>${esc(next.canonical_name)}</strong><div class="mu">${esc(domainName(next.domain_id))} · ${esc(moduleName(next.module_id))}</div></div><span class="tag ac">${statusLabel(effectiveStatus(next))}</span></div></button><div class="btns"><button class="btn s" onclick="openTopic('${next.topic_id}')">Open topic</button><button class="btn s g" onclick="markTopicLearning('${next.topic_id}')">Start learning</button></div>`:`<div class="empty">Core roadmap currently complete.</div>`}</div>
 <div class="card"><div class="section-head"><div><h2>Current build</h2><p>Projects demonstrate capability.</p></div><button class="btn s g" onclick="go('projects')">All projects</button></div>${currentProject?`<div class="row"><div class="t"><strong>${esc(currentProject.name)}</strong><div class="mu">${esc(currentProject.type)} · ${projectP.replaceAll('_',' ')}</div></div><span class="tag ${projectP==='SHIPPED'?'ok':''}">${projectP.replaceAll('_',' ')}</span></div><button class="btn s" onclick="setProjectStatus('${currentProject.project_id}','IN_PROGRESS')">Set in progress</button>`:`<div class="empty">No project selected yet.</div>`}</div></div>
 <div class="grid"><div class="card"><div class="section-head"><div><h2>Phase progress</h2><p>Sequence without dates.</p></div><button class="btn s g" onclick="go('roadmap')">Open roadmap</button></div>${C.learning_phases.map(phaseCard).join('')}</div><div class="card"><div class="section-head"><div><h2>Domain pulse</h2><p>Knowledge inventory, not deadlines.</p></div><button class="btn s g" onclick="go('syllabus')">Open syllabus</button></div><div class="kpi-list">${C.domains.map(d=>{const x=domainStats(d);return `<div class="kpi"><b>${x.pct}%</b><span>${esc(d.domain_id)} · ${esc(d.name)}</span></div>`}).join('')}</div></div></div>`;
}
function phaseCard(p){const x=phaseStats(p);return `<div class="phase-card card ${x.pct===0?'locked':''} ${activePhaseId()===p.phase_id?'active':''}"><div class="phase-index">${esc(p.phase_id)}</div><h3>${esc(p.name)}</h3><div class="bar"><span style="width:${x.pct}%"></span></div><div class="phase-meta"><span>${x.mastered}/${x.total}</span><span>${x.pct}%</span></div></div>`}
function activePhaseId(){return (C.learning_phases.find(p=>{const x=phaseStats(p);return x.mastered<x.total})||C.learning_phases.at(-1)).phase_id}
function renderRoadmap(){return `<div class="card"><div class="section-head"><div><h2>Learning Roadmap</h2><p>Capability sequence. No fixed dates. No calendar. Prerequisites unlock the next work.</p></div></div><div class="notice">The roadmap is a progression layer. Courses, projects and topics are separate objects.</div></div><div class="grid">${C.learning_phases.map(p=>phaseCard(p)).join('')}</div>`}
function domainName(id){return C.domains.find(x=>x.domain_id===id)?.name||id}
function moduleName(id){return C.modules.find(x=>x.module_id===id)?.name||id}
function renderSyllabus(){
 const domains=[{domain_id:'ALL',name:'All domains'},...C.domains];
 let mods=C.modules.filter(m=>domainFilter==='ALL'||m.domain_id===domainFilter);
 if(syllabusSearch){const q=syllabusSearch.toLowerCase();mods=mods.filter(m=>m.name.toLowerCase().includes(q)||m.topic_ids.some(id=>(topicById(id)?.canonical_name||'').toLowerCase().includes(q)))}
 return `<div class="card"><div class="section-head"><div><h2>Syllabus</h2><p>Domain → Module → Topic. This is the canonical knowledge inventory.</p></div><div style="min-width:280px"><input id="syllabus-search" placeholder="Search topics or modules…" value="${esc(syllabusSearch)}" oninput="setSyllabusSearch(this.value)"></div></div><div class="chips">${domains.map(d=>`<button class="chip ${domainFilter===d.domain_id?'on':''}" onclick="setDomainFilter('${d.domain_id}')">${esc(d.domain_id)} · ${esc(d.name)}</button>`).join('')}</div></div>${mods.map(renderModule).join('')||'<div class="empty">No syllabus items match.</div>'}`}
function renderModule(m){const open=expandedModules.has(m.module_id);const topics=m.topic_ids.map(topicById).filter(Boolean);const ms=topics.filter(t=>isMastered(t,getTopicProgress(t))).length;return `<details class="module" ${open?'open':''} ontoggle="toggleModule('${m.module_id}',this.open)"><summary><div class="module-title"><strong>${esc(m.module_id)} · ${esc(m.name)}</strong><span class="mu">${ms}/${topics.length} mastered</span></div><span class="tag">${pct(ms,topics.length)}%</span></summary><div class="module-body">${topics.map(renderTopicRow).join('')}</div></details>`}
function renderTopicRow(t){const s=effectiveStatus(t),p=getTopicProgress(t);const done=isMastered(t,p);return `<div class="topic-row"><div class="topic-check"><input type="checkbox" ${done?'checked':''} ${s==='LOCKED'?'disabled':''} onchange="quickMaster('${t.topic_id}',this.checked)" aria-label="Master ${esc(t.canonical_name)}"></div><div class="topic-main"><button class="topic-open" onclick="openTopic('${t.topic_id}')"><strong>${esc(t.topic_id)} · ${esc(t.canonical_name)}</strong><span>${esc(depthLabel(t.depth))} · ${statusLabel(s)}</span></button></div><div class="topic-actions"><span class="tag ${depthClass(t.depth)}">${depthLabel(t.depth)}</span><select data-status-change="topic|${esc(t.topic_id)}"><option value="AVAILABLE" ${s==='AVAILABLE'?'selected':''}>Available</option><option value="LEARNING" ${s==='LEARNING'?'selected':''}>Learning</option><option value="PRACTICING" ${s==='PRACTICING'?'selected':''}>Practicing</option><option value="BUILDING" ${s==='BUILDING'?'selected':''}>Building</option><option value="ASSESSED" ${s==='ASSESSED'?'selected':''}>Assessed</option><option value="MASTERED" ${s==='MASTERED'?'selected':''}>Mastered</option></select></div></div>`}
function setDomainFilter(v){domainFilter=v;expandedModules.clear();queueRender()}
function setSyllabusSearch(v){syllabusSearch=v;queueRender()}
function toggleModule(id,open){if(open)expandedModules.add(id);else expandedModules.delete(id)}

function renderCourses(){return `<div class="card"><div class="section-head"><div><h2>Course Roadmap</h2><p>Courses are learning resources, not the syllabus itself.</p></div><a class="btn s" href="${safeUrl(C.resources[0]?.canonical_url||'#')}" target="_blank" rel="noopener">Open primary resource</a></div><div class="grid">${C.resources.filter(r=>['COURSE','COURSE_SERIES'].includes(r.type)).map(renderResourceCard).join('')}</div></div>`}
function renderResources(){return `<div class="card"><div class="section-head"><div><h2>Resources</h2><p>Free-first learning library with verified access metadata.</p></div></div><div class="grid">${C.resources.map(renderResourceCard).join('')}</div></div>`}
function renderResourceCard(r){return `<div class="card"><div class="pillline"><span class="tag">${esc(r.type.replaceAll('_',' '))}</span><span class="tag ok">${esc(r.access_model.replaceAll('_',' '))}</span></div><h3 style="margin-top:8px">${esc(r.name)}</h3><div class="mu">${esc(r.provider)} · verified ${esc(r.verified||'')}</div><div class="btns" style="margin-top:10px"><a class="btn s" href="${safeUrl(r.canonical_url)}" target="_blank" rel="noopener">Open resourcerce</a></div></div>`}
function renderProjects(){const list=C.projects;return `<div class="card"><div class="section-head"><div><h2>Projects</h2><p>Building is proof. Course completion alone never marks a capability complete.</p></div></div><div class="grid">${list.map(p=>{const st=projectStatus(p.project_id);return `<div class="card"><div class="pillline"><span class="tag">${esc(p.type.replaceAll('_',' '))}</span><span class="tag ${st==='SHIPPED'?'ok':''}">${esc(st.replaceAll('_',' '))}</span></div><h3 style="margin-top:8px">${esc(p.name)}</h3><p class="mu">${esc(p.objective||'Build and document evidence of capability.')}</p><div class="btns"><select data-status-change="project|${esc(p.project_id)}"><option value="NOT_STARTED" ${st==='NOT_STARTED'?'selected':''}>Not started</option><option value="IN_PROGRESS" ${st==='IN_PROGRESS'?'selected':''}>In progress</option><option value="SHIPPED" ${st==='SHIPPED'?'selected':''}>Shipped</option><option value="ABANDONED" ${st==='ABANDONED'?'selected':''}>Archived</option></select><button class="btn s g" onclick="openProject('${p.project_id}')">Details</button></div></div>`}).join('')}</div></div>`}
function renderAI(){return `${renderDomainWorkspace('D08','AI Lab','AI/ML is the central technical specialization, with systems and evaluation alongside it.')}${renderDomainWorkspace('D09','AI Systems','Training, inference, evaluation and infrastructure.')}`}
function renderSecurity(){return `${renderDomainWorkspace('D07','Security','Security is a deep secondary pillar, with AI security as the convergence point.')}`}
function renderDomainWorkspace(domainId,title,desc){const d=C.domains.find(x=>x.domain_id===domainId);const mods=C.modules.filter(x=>x.domain_id===domainId);return `<div class="card"><div class="section-head"><div><div class="domain-code">${esc(domainId)}</div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div><button class="btn s g" onclick="setDomainFilter('${domainId}');go('syllabus')">Open syllabus</button></div><div class="grid">${mods.map(m=>{const topics=m.topic_ids.map(topicById).filter(Boolean);const ms=topics.filter(t=>isMastered(t,getTopicProgress(t))).length;return `<div class="card"><div class="mu">${esc(m.module_id)}</div><h3>${esc(m.name)}</h3><div class="bar" style="margin-top:9px"><span style="width:${pct(ms,topics.length)}%"></span></div><div class="phase-meta"><span>${ms}/${topics.length}</span><span>${pct(ms,topics.length)}%</span></div></div>`}).join('')}</div></div>`}

function renderResearch(){return `<div class="two"><div class="card"><div class="section-head"><div><h2>Research Lab</h2><p>Idea → question → literature → reproduction → novel result.</p></div><button class="btn" onclick="addResearch()">New research item</button></div>${state.research.length?state.research.map(renderResearchItem).join(''):'<div class="empty">No research items yet. Your first reproduction belongs here.</div>'}</div><div class="card"><h2>Research ladder</h2><div class="list">${['IDEA','QUESTION','LITERATURE','REPRODUCTION','BASELINE','EXPERIMENT','EXTENSION','NOVEL_RESULT','WRITEUP','RELEASED'].map((s,i)=>`<div class="row"><span class="tag">${i+1}</span><div class="t"><strong>${s.replaceAll('_',' ')}</strong><div class="mu">${researchStageHint(s)}</div></div></div>`).join('')}</div></div></div>`}
function researchStageHint(s){return ({IDEA:'Potential problem or direction.',QUESTION:'Turn it into a precise question.',LITERATURE:'Find and understand prior work.',REPRODUCTION:'Reproduce a published result.',BASELINE:'Establish a credible baseline.',EXPERIMENT:'Run controlled experiments.',EXTENSION:'Change something meaningful.',NOVEL_RESULT:'Evidence for a new contribution.',WRITEUP:'Document methods, results and limits.',RELEASED:'Paper, code or other public artifact.'}[s]||'')}
function renderResearchItem(r){return `<div class="card"><div class="section-head"><div><h3>${esc(r.title)}</h3><p>${esc(r.stage.replaceAll('_',' '))}</p></div><select onchange="updateResearch('${r.id}','stage',this.value)">${['IDEA','QUESTION','LITERATURE','REPRODUCTION','BASELINE','EXPERIMENT','EXTENSION','NOVEL_RESULT','WRITEUP','RELEASED'].map(s=>`<option ${r.stage===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="f"><label class="w">Question<input value="${esc(r.question||'')}" onchange="updateResearch('${r.id}','question',this.value)"></label><label class="w">Hypothesis<textarea onchange="updateResearch('${r.id}','hypothesis',this.value)">${esc(r.hypothesis||'')}</textarea></label><label class="w">Notes<textarea onchange="updateResearch('${r.id}','notes',this.value)">${esc(r.notes||'')}</textarea></label><label>Artifact URL<input value="${esc(r.artifact_url||'')}" onchange="updateResearch('${r.id}','artifact_url',this.value)"></label></div></div>`}
function renderBuilder(){return `<div class="card"><div class="section-head"><div><h2>Builder</h2><p>Turn capability into things real people can use.</p></div><button class="btn" onclick="addProduct()">New build</button></div>${state.products.length?`<div class="grid">${state.products.map(renderProduct).join('')}</div>`:'<div class="empty">No builds yet. Start with something useful enough to ship.</div>'}</div>`}
function renderEarning(){const revenue=state.products.reduce((a,p)=>a+Number(p.revenue||0),0);return `<div class="card"><div class="hero"><div><h2>Earning</h2><p class="mu">Revenue is evidence of value, not the curriculum itself.</p></div><div class="right"><div class="mu">Recorded product revenue</div><div class="big">₹${revenue.toLocaleString('en-IN')}</div></div></div></div><div class="grid">${state.products.map(renderProduct).join('')||'<div class="empty">Create a product/build to start recording value creation.</div>'}</div>`}
function renderProduct(p){return `<div class="card"><div class="pillline"><span class="tag">${esc(p.stage)}</span><span class="tag">₹${Number(p.revenue||0).toLocaleString('en-IN')}</span></div><h3 style="margin-top:8px">${esc(p.title)}</h3><p class="mu">${esc(p.description||'')}</p><div class="f"><label>Stage<select onchange="updateProduct('${p.id}','stage',this.value)">${['IDEA','EXPERIMENT','MVP','USERS','REVENUE','PRODUCT','OWNERSHIP','SCALE','ARCHIVED'].map(s=>`<option ${p.stage===s?'selected':''}>${s}</option>`).join('')}</select></label><label>Revenue<input type="number" step="0.01" value="${esc(p.revenue||0)}" onchange="updateProduct('${p.id}','revenue',Number(this.value||0))"></label><label class="w">Description<textarea onchange="updateProduct('${p.id}','description',this.value)">${esc(p.description||'')}</textarea></label><label class="w">URL<input value="${esc(p.url||'')}" onchange="updateProduct('${p.id}','url',this.value)"></label></div></div>`}
function renderFrontier(){const items=C.topics.filter(t=>t.frontier_flag||t.depth==='X');return `<div class="card"><div class="section-head"><div><h2>Frontier</h2><p>Watch → explore → deepen → promote or archive.</p></div></div><div class="grid">${items.map(t=>{const f=state.frontier[t.concept_id]||{status:'WATCH',notes:''};return `<div class="card"><div class="pillline"><span class="tag warn">Frontier</span><span class="tag">${esc(domainName(t.domain_id))}</span></div><h3 style="margin-top:8px">${esc(t.canonical_name)}</h3><div class="f"><label>Status<select onchange="updateFrontier('${esc(t.concept_id)}',this.value)">${['WATCH','EXPLORE','DEEPEN','PROMOTE','ARCHIVE'].map(s=>`<option ${f.status===s?'selected':''}>${s}</option>`).join('')}</select></label><label class="w">Notes<textarea onchange="updateFrontier('${esc(t.concept_id)}','notes',this.value)">${esc(f.notes||'')}</textarea></label></div></div>`}).join('')||'<div class="empty">No frontier items are currently seeded.</div>'}</div></div>`}
function renderMastery(){const s=allProgressStats();const domains=C.domains.map(d=>{const x=domainStats(d);return `<div class="card"><div class="section-head"><div><div class="domain-code">${esc(d.domain_id)}</div><h3>${esc(d.name)}</h3></div><strong>${x.pct}%</strong></div><div class="bar"><span style="width:${x.pct}%"></span></div><div class="phase-meta"><span>${x.mastered}/${x.total}</span><span>topic placements</span></div></div>`}).join('');return `<div class="card"><h2>Mastery</h2><p class="mu">Depth and progress are separate. A topic is mastered by evidence, not by finishing a video.</p><div class="stats"><div class="stat"><b>${s.mastered}</b><span>Mastered</span></div><div class="stat"><b>${s.learning}</b><span>Learning</span></div><div class="stat"><b>${s.assessed}</b><span>Assessed</span></div><div class="stat"><b>${s.over}</b><span>Overkill targets</span></div></div></div><div class="domain-grid">${domains}</div>`}
function renderPortfolio(){const shipped=C.projects.filter(p=>projectStatus(p.project_id)==='SHIPPED');const released=state.research.filter(r=>r.stage==='RELEASED');const scaled=state.products.filter(p=>['PRODUCT','OWNERSHIP','SCALE'].includes(p.stage));return `<div class="stats"><div class="stat"><b>${shipped.length}</b><span>Shipped projects</span></div><div class="stat"><b>${released.length}</b><span>Released research</span></div><div class="stat"><b>${scaled.length}</b><span>Serious products</span></div></div><div class="two"><div class="card"><h2>Shipped work</h2>${shipped.map(p=>`<div class="row"><div class="t"><strong>${esc(p.name)}</strong><div class="mu">${esc(p.type)}</div></div><span class="tag ok">Shipped</span></div>`).join('')||'<div class="empty">Nothing shipped yet.</div>'}</div><div class="card"><h2>Research releases</h2>${released.map(r=>`<div class="row"><div class="t"><strong>${esc(r.title)}</strong><div class="mu">${esc(r.artifact_url||'No artifact URL yet')}</div></div><span class="tag ok">Released</span></div>`).join('')||'<div class="empty">No released research yet.</div>'}</div></div>`}
function renderSettings(){const signed=!!auth?.user;return `<div class="two"><div class="card"><div class="section-head"><div><h2>Account & sync</h2><p>${signed?'Cloud sync is enabled for this account.':'The app is local-first. Sign in to sync across PC and Android.'}</p></div></div>${signed?`<div class="auth-state"><span class="tag ok">Signed in</span><span class="mu">${esc(auth.user.email||'')}</span><button class="btn s danger" onclick="logoutUI()">Sign out</button></div>`:`<form onsubmit="loginUI(event)"><div class="f"><label>Email<input id="auth-email" type="email" required autocomplete="email"></label><label>Password<input id="auth-password" type="password" required minlength="6" autocomplete="current-password"></label></div><div class="btns" style="margin-top:10px"><button class="btn" type="submit">Sign in</button><button class="btn g" type="button" onclick="signupUI()">Create account</button></div></form>`}</div><div class="card"><h2>Appearance</h2><div class="f"><label class="toggle"><input type="checkbox" ${state.settings.theme==='dark'?'checked':''} onchange="setSetting('theme',this.checked?'dark':'light')"><span>Dark mode</span></label><label>Display name<input value="${esc(state.settings.displayName)}" onchange="setSetting('displayName',this.value)"></label></div></div></div><div class="card"><h2>Backup & local data</h2><p class="mu">Export your local state before major changes. Import replaces the current local state after validation.</p><div class="btns"><button class="btn" onclick="exportState()">Export backup</button><label class="btn g" for="import-file">Import backup</label><input id="import-file" type="file" accept="application/json" style="display:none" onchange="importState(event)"></div></div><div class="card"><h2>App model</h2><div class="notice">Curriculum is bundled locally from the audited RC-4 source. Supabase stores only your personal progress, projects, research, frontier states, notes and settings.</div><div style="margin-top:10px" class="mu">Supabase: ${esc(SUPABASE_URL)} · Curriculum: ${esc(C.metadata?.version||'')}</div></div>`}

function nextTopic(){
 const ordered=[...C.topics]; const current=ordered.find(t=>{const s=effectiveStatus(t);return ['LEARNING','PRACTICING','BUILDING','ASSESSED'].includes(s)}); if(current)return current;
 return ordered.find(t=>effectiveStatus(t)==='AVAILABLE')||ordered.find(t=>effectiveStatus(t)!=='MASTERED')||null;
}
function openTopic(id){const t=topicById(id);if(!t)return;const p=getTopicProgress(t);currentModal={type:'topic',id};const prereqs=(t.hard_prerequisite_topic_ids||[]).map(topicById).filter(Boolean);const resources=t.primary_resource_ids.map(id=>C.resources.find(r=>r.resource_id===id)).filter(Boolean);const projectIds=t.project_ids||[];document.getElementById('modal-title').innerHTML=`<div><div class="domain-code">${esc(t.topic_id)}</div><h2>${esc(t.canonical_name)}</h2><div class="pillline"><span class="tag ${depthClass(t.depth)}">${depthLabel(t.depth)}</span><span class="tag">${statusLabel(effectiveStatus(t))}</span></div></div>`;document.getElementById('modal-body').innerHTML=`<div class="two"><div><h3>Prerequisites</h3>${prereqs.length?prereqs.map(x=>`<div class="row"><div class="t"><button class="topic-open" onclick="openTopic('${x.topic_id}')"><strong>${esc(x.canonical_name)}</strong></button></div><span class="tag">${statusLabel(effectiveStatus(x))}</span></div>`).join(''):'<div class="mutedbox">No explicit hard topic prerequisites.</div>'}</div><div><h3>Resources</h3>${resources.map(r=>`<div class="row"><div class="t"><strong>${esc(r.name)}</strong><div class="mu">${esc(r.provider)} · ${esc(r.access_model.replaceAll('_',' '))}</div></div><a class="btn s" target="_blank" rel="noopener" href="${safeUrl(r.canonical_url)}">Open</a></div>`).join('')}</div></div><hr style="border:0;border-top:1px solid var(--ln);margin:16px 0"><h3>Mastery evidence</h3><p class="mu">Complete the required evidence below. Depth is separate from current progress.</p><div class="evidence">${[['knowledge','Explain'],['problems','Problems'],['derivation','Derivation/reasoning'],['implementation','Implementation'],['project','Project'],['assessment','Assessment'],['transfer','Transfer']].map(([k,l])=>`<label><input type="checkbox" data-evidence="${t.concept_id}|${k}" ${p[k]?'checked':''}>${l}</label>`).join('')}</div><div style="margin-top:12px"><label>Depth achieved<select onchange="setTopicDepth('${t.concept_id}',this.value)">${['FOUNDATION','STRONG','ADVANCED','OVERKILL','FRONTIER'].map(v=>`<option ${p.depth_level===v?'selected':''}>${v}</option>`).join('')}</select></label></div><div style="margin-top:12px"><label>Notes<textarea id="topic-notes">${esc(p.notes||'')}</textarea></label><div class="btns" style="margin-top:9px"><button class="btn" onclick="saveTopicNotes('${t.concept_id}')">Save notes</button><button class="btn g" onclick="quickMaster('${t.topic_id}',true);closeModal()">Mark required evidence complete</button></div></div><div style="margin-top:12px" class="notice">Required evidence: ${esc((t.mastery_requirements||[]).join(', ')) || 'module-defined'}.</div>`;openModal()}
function openModal(){const e=document.getElementById('modal-wrap');e.classList.add('open');e.setAttribute('aria-hidden','false')}
function closeModal(){const e=document.getElementById('modal-wrap');e.classList.remove('open');e.setAttribute('aria-hidden','true');currentModal=null}
function toggleEvidence(raw,checked){const [concept,k]=raw.split('|');const p=state.topics[concept]||defaultTopicProgress();p[k]=checked;p.client_updated_at=nowIso();state.topics[concept]=p;saveLocal();queueRender();queueSync();if(currentModal?.type==='topic'&&currentModal.id===topicByConcept(concept)?.topic_id)openTopic(currentModal.id)}
function topicByConcept(c){return C.topics.find(t=>t.concept_id===c)||null}
function setTopicDepth(concept,v){const p=state.topics[concept]||defaultTopicProgress();p.depth_level=v;touch(p);state.topics[concept]=p;saveLocal();queueRender();queueSync()}
function saveTopicNotes(concept){const p=state.topics[concept]||defaultTopicProgress();p.notes=document.getElementById('topic-notes')?.value||'';touch(p);state.topics[concept]=p;saveLocal();toast('Notes saved');queueSync()}
function quickMaster(topicId,checked){const t=topicById(topicId);if(!t)return;const p=state.topics[t.concept_id]||defaultTopicProgress();for(const k of requiredEvidence(t))p[k]=checked; if(checked)p.depth_level=({F:'FOUNDATION',S:'STRONG',A:'ADVANCED',O:'OVERKILL',X:'FRONTIER'}[t.depth]||'FOUNDATION'); p.status=checked?'MASTERED':'AVAILABLE';touch(p);state.topics[t.concept_id]=p;saveLocal();queueRender();queueSync();toast(checked?'Evidence marked complete':'Mastery cleared')}
function setTopicStatus(topicId,status){const t=topicById(topicId);if(!t)return;const p=state.topics[t.concept_id]||defaultTopicProgress();if(status==='MASTERED'){for(const k of requiredEvidence(t))p[k]=true;p.depth_level=({F:'FOUNDATION',S:'STRONG',A:'ADVANCED',O:'OVERKILL',X:'FRONTIER'}[t.depth]||'FOUNDATION');}p.status=status;touch(p);state.topics[t.concept_id]=p;saveLocal();queueRender();queueSync()}
function markTopicLearning(topicId){setTopicStatus(topicId,'LEARNING')}
function setProjectStatus(id,status){const p=state.projects[id]||{status:'NOT_STARTED',notes:'',proof_url:''};p.status=status;touch(p);state.projects[id]=p;saveLocal();queueRender();queueSync()}
function openProject(id){const p=C.projects.find(x=>x.project_id===id);if(!p)return;const prog=state.projects[id]||{status:'NOT_STARTED',notes:'',proof_url:''};document.getElementById('modal-title').innerHTML=`<div><div class="domain-code">${esc(p.project_id)}</div><h2>${esc(p.name)}</h2></div>`;document.getElementById('modal-body').innerHTML=`<p>${esc(p.objective||'')}</p><div class="mutedbox">Project type: ${esc(p.type)} · Required: ${p.required_for_module_completion?'Yes':'No'}</div><div style="margin-top:12px" class="f"><label>Status<select onchange="setProjectStatus('${id}',this.value);closeModal()">${['NOT_STARTED','IN_PROGRESS','SHIPPED','ABANDONED'].map(s=>`<option ${prog.status===s?'selected':''}>${s}</option>`).join('')}</select></label><label>Proof URL<input id="proof-url" value="${esc(prog.proof_url||'')}" onchange="saveProjectField('${id}','proof_url',this.value)"></label><label class="w">Notes<textarea onchange="saveProjectField('${id}','notes',this.value)">${esc(prog.notes||'')}</textarea></label></div><div style="margin-top:12px"><strong>Deliverables</strong>${(p.deliverables||[]).map(d=>`<div class="row"><div class="t">${esc(d)}</div></div>`).join('')}</div>`;openModal()}
function saveProjectField(id,k,v){const p=state.projects[id]||{status:'NOT_STARTED'};p[k]=v;touch(p);state.projects[id]=p;saveLocal();queueSync()}
function addResearch(){const r={id:crypto.randomUUID(),title:'New research item',stage:'IDEA',question:'',hypothesis:'',notes:'',artifact_url:'',client_updated_at:nowIso()};state.research.unshift(r);saveLocal();queueRender();queueSync();toast('Research item created')}
function updateResearch(id,key,val){const r=state.research.find(x=>x.id===id);if(!r)return;r[key]=val;touch(r);saveLocal();queueSync()}
function addProduct(){const p={id:crypto.randomUUID(),title:'New build',stage:'IDEA',description:'',url:'',revenue:0,notes:'',client_updated_at:nowIso()};state.products.unshift(p);saveLocal();queueRender();queueSync();toast('Build created')}
function updateProduct(id,key,val){const p=state.products.find(x=>x.id===id);if(!p)return;p[key]=val;touch(p);saveLocal();queueSync();if(activeSection==='earning'||activeSection==='builder')queueRender()}
function updateFrontier(key,key2,val){let f=state.frontier[key]||{status:'WATCH',notes:'',client_updated_at:nowIso()};if(key2==='notes')f.notes=val;else f.status=key2;touch(f);state.frontier[key]=f;saveLocal();queueSync()}
function setSetting(key,val){state.settings[key]=val;touch(state.settings);saveLocal();applyTheme();queueRender();queueSync()}
function exportState(){const blob=new Blob([JSON.stringify({version:1,exported_at:nowIso(),state},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='technical-builder-os-backup.json';a.click();URL.revokeObjectURL(a.href)}
function importState(ev){const f=ev.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);if(!x.state||x.version!==1)throw new Error('Invalid backup');state=mergeState(defaultState(),x.state);saveLocal();queueRender();queueSync();toast('Backup imported')}catch(e){toast('Import failed: '+e.message)}};r.readAsText(f)}
async function loginUI(ev){ev.preventDefault();try{const email=document.getElementById('auth-email').value.trim();const pw=document.getElementById('auth-password').value;await signIn(email,pw);toast('Signed in');await syncCloud(true);queueRender()}catch(e){toast(e.message)}}
async function signupUI(){const email=prompt('Email address:');if(!email)return;const pw=prompt('Password (6+ characters):');if(!pw)return;try{const d=await signUp(email,pw);toast(d.access_token?'Account created and signed in':'Account created. Check email if confirmation is enabled.');if(d.access_token)await syncCloud(true);queueRender()}catch(e){toast(e.message)}}
async function logoutUI(){await signOut();syncPill('Local','');queueRender();toast('Signed out')}

function recordToTopic(r){return {status:r.status,knowledge:r.knowledge,problems:r.problems,derivation:r.derivation,implementation:r.implementation,project:r.project,assessment:r.assessment,transfer:r.transfer,depth_level:r.depth_level,notes:r.notes,client_updated_at:r.client_updated_at}}
function newer(local,remote){const a=Date.parse(local?.client_updated_at||0),b=Date.parse(remote?.client_updated_at||0);return b>a?remote:local}
async function syncCloud(force=false){
  if(!navigator.onLine||!auth)return;
  const a=await ensureAuth();if(!a){syncPill('Local','');return}
  try{
    syncPill('Syncing','saving');
    const [settings,topics,projects,research,frontier,products,notes]=await Promise.all([
      restList('tbo_user_settings'),restList('tbo_topic_progress'),restList('tbo_project_progress'),restList('tbo_research_items'),restList('tbo_frontier_items'),restList('tbo_product_items'),restList('tbo_notes')
    ]);
    if(settings[0]){
      const remote={displayName:settings[0].display_name||'',theme:settings[0].theme==='dark'?'dark':'light',currentSection:settings[0].current_section||'dashboard',compactMode:!!settings[0].compact_mode,client_updated_at:settings[0].server_updated_at};
      state.settings={...state.settings,...(Date.parse(state.settings.client_updated_at||0)>=Date.parse(remote.client_updated_at||0)?state.settings:remote)};
    }
    for(const r of topics){const current=state.topics[r.concept_id];const next=newer(current,{...recordToTopic(r),client_updated_at:r.client_updated_at});state.topics[r.concept_id]=next}
    for(const r of projects){const current=state.projects[r.project_id];const remote={status:r.status,notes:r.notes||'',proof_url:r.proof_url||'',client_updated_at:r.client_updated_at};state.projects[r.project_id]=newer(current,remote)}
    for(const r of frontier){const current=state.frontier[r.frontier_key];const remote={status:r.status,notes:r.notes||'',client_updated_at:r.client_updated_at};state.frontier[r.frontier_key]=newer(current,remote)}
    state.research=mergeRows(state.research,research);
    state.products=mergeRows(state.products,products);
    state.notes=mergeRows(state.notes,notes);
    saveLocal();
    await pushCloud();
    syncPill('Synced','ok'); if(force)queueRender();
  }catch(e){console.error(e);syncPill('Sync error','off');toast('Sync error: '+e.message)}
}
function mergeRows(local,remote){const map=new Map(local.map(x=>[x.id,x]));for(const r of remote){map.set(r.id,newer(map.get(r.id),r));}return [...map.values()].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''))}
async function pushCloud(){
 if(!auth?.access_token)return;
 const uid=auth.user.id;
 await restUpsert('tbo_user_settings',[{user_id:uid,display_name:state.settings.displayName||'',theme:state.settings.theme==='dark'?'dark':'light',current_section:state.settings.currentSection||'dashboard',compact_mode:!!state.settings.compactMode,server_updated_at:undefined}], 'user_id');
 const topicRows=Object.entries(state.topics).map(([concept_id,p])=>({user_id:uid,concept_id,status:p.status||'AVAILABLE',knowledge:!!p.knowledge,problems:!!p.problems,derivation:!!p.derivation,implementation:!!p.implementation,project:!!p.project,assessment:!!p.assessment,transfer:!!p.transfer,depth_level:p.depth_level||'FOUNDATION',notes:p.notes||'',client_updated_at:p.client_updated_at||nowIso()}));
 const projectRows=Object.entries(state.projects).map(([project_id,p])=>({user_id:uid,project_id,status:p.status||'NOT_STARTED',notes:p.notes||'',proof_url:p.proof_url||'',client_updated_at:p.client_updated_at||nowIso()}));
 const frontierRows=Object.entries(state.frontier).map(([frontier_key,f])=>({user_id:uid,frontier_key,status:f.status||'WATCH',notes:f.notes||'',client_updated_at:f.client_updated_at||nowIso()}));
 const researchRows=state.research.map(r=>({id:r.id,user_id:uid,title:r.title||'Untitled',stage:r.stage||'IDEA',question:r.question||'',hypothesis:r.hypothesis||'',notes:r.notes||'',artifact_url:r.artifact_url||'',client_updated_at:r.client_updated_at||nowIso()}));
 const productRows=state.products.map(p=>({id:p.id,user_id:uid,title:p.title||'Untitled',stage:p.stage||'IDEA',description:p.description||'',url:p.url||'',revenue:Number(p.revenue||0),notes:p.notes||'',client_updated_at:p.client_updated_at||nowIso()}));
 const noteRows=state.notes.map(n=>({id:n.id,user_id:uid,entity_type:n.entity_type||'GENERAL',entity_id:n.entity_id||'',title:n.title||'',content:n.content||'',client_updated_at:n.client_updated_at||nowIso()}));
 await Promise.all([
  restUpsert('tbo_topic_progress',topicRows,'user_id,concept_id'),
  restUpsert('tbo_project_progress',projectRows,'user_id,project_id'),
  restUpsert('tbo_frontier_items',frontierRows,'user_id,frontier_key'),
  restUpsert('tbo_research_items',researchRows,'id'),
  restUpsert('tbo_product_items',productRows,'id'),
  restUpsert('tbo_notes',noteRows,'id')
 ]);
}
function queueSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncCloud(false),900)}
window.addEventListener('online',()=>{syncPill(auth?'Syncing':'Local',auth?'saving':'');if(auth)syncCloud(true)});
window.addEventListener('offline',()=>syncPill('Offline','off'));
window.addEventListener('beforeunload',saveLocal);
document.getElementById?.('modal-wrap')?.addEventListener('click',e=>{if(e.target.id==='modal-wrap')closeModal()});

async function init(){
 try{const res=await fetch(CURRICULUM_URL,{cache:'no-store'});if(!res.ok)throw new Error('Could not load curriculum.json');C=await res.json();loadLocal();activeSection=state.settings.currentSection||'dashboard';await ensureAuth();applyTheme();render();clockTimer=setInterval(updateClock,1000);if(auth&&navigator.onLine)syncCloud(true);else syncPill(navigator.onLine?'Local':'Offline',navigator.onLine?'':'off');}
 catch(e){document.getElementById('app').innerHTML=`<div class="card dangerbox"><h2>App failed to load</h2><p>${esc(e.message)}</p><p class="mu">Start the local server with <span class="mono">start.bat</span> or <span class="mono">node server.js</span>. Do not open index.html directly.</p></div>`;console.error(e)}
}
init();
