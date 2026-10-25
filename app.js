'use strict';
const KEY='retskrivningstracker_v1';const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const uid=()=>crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);const today=()=>new Date().toLocaleDateString('sv-SE');const fmt=n=>Number.isFinite(n)?n.toLocaleString('da-DK',{maximumFractionDigits:1}):'—';const pct=n=>Number.isFinite(n)?fmt(n)+' %':'—';
let db=load(),page='overview',selectedSession=db.sessions[0]?.id||'',selectedStudent='',selectedTest='',entryMode='paste',dirty=false,chartVisible={},pendingImport='';
function load(){try{let x=JSON.parse(localStorage.getItem(KEY));if(x&&Array.isArray(x.sessions)&&Array.isArray(x.students)&&Array.isArray(x.tests)&&Array.isArray(x.results))return x}catch{}return {version:1,sessions:[],students:[],tests:[],results:[]}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(db));return true}catch(e){alert('Kunne ikke gemme i browseren. Eksportér en sikkerhedskopi, og kontrollér ledig lagerplads.');return false}}
function toast(s){let el=$('#toast');el.textContent=s;el.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.display='none',3400)}
function session(){return db.sessions.find(s=>s.id===selectedSession)}function students(){return db.students.filter(s=>s.sessionId===selectedSession).sort((a,b)=>a.name.localeCompare(b.name,'da'))}function tests(){return db.tests.filter(t=>t.sessionId===selectedSession).sort((a,b)=>(a.date||'').localeCompare(b.date||''))}function results(){return db.results.filter(r=>r.sessionId===selectedSession)}function testBy(id){return db.tests.find(t=>t.id===id)}function studentBy(id){return db.students.find(s=>s.id===id)}function resultOf(studentId,testId){return db.results.find(r=>r.sessionId===selectedSession&&r.studentId===studentId&&r.testId===testId)}
function grade(t,points){if(!t||!Number.isFinite(points))return null;let b=(t.grades||[]).find(g=>points>=g.min&&points<=g.max);return b?String(b.grade):null}
function computed(r){let t=testBy(r.testId);if(!t||r.status)return null;let max=t.categories.reduce((a,c)=>a+c.max,0);if(!max)return null;let errors=t.categories.reduce((a,c)=>a+(Number(r.errors?.[c.id])||0),0);let correct=max-errors;return {correct,max,errors,percent:correct/max*100,grade:grade(t,correct),numericGrade:Number(grade(t,correct))}}
function median(nums){if(!nums.length)return null;let a=[...nums].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function modalGrade(rs){let nums=rs.map(r=>computed(r)?.numericGrade).filter(Number.isFinite);if(!nums.length)return null;let counts=new Map;nums.forEach(n=>counts.set(n,(counts.get(n)||0)+1));let avg=nums.reduce((a,b)=>a+b,0)/nums.length;return [...counts].sort((a,b)=>b[1]-a[1]||Math.abs(a[0]-avg)-Math.abs(b[0]-avg)||b[0]-a[0])[0][0]}
function classMedian(tid){let vals=results().filter(r=>r.testId===tid).map(r=>computed(r)?.percent).filter(Number.isFinite);return median(vals)}
function opts(arr,chosen,fn=x=>x.name){return arr.map(x=>`<option value="${esc(x.id)}" ${x.id===chosen?'selected':''}>${esc(fn(x))}</option>`).join('')}
function empty(title,body,button='',action=''){return `<div class="empty"><span class="symbol">✦</span><strong>${title}</strong><div>${body}</div>${button?`<button class="btn" style="margin-top:18px" data-action="${action}">${button}</button>`:''}</div>`}
function head(title,sub,action=''){return `<div class="pagehead"><div><h1>${title}</h1><p class="lead">${sub}</p></div>${action}</div>`}
function nav(){document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));let sel=$('#sessionPicker');sel.innerHTML=db.sessions.length?opts(db.sessions,selectedSession,s=>`${s.name} · ${s.year}`):'<option value="">Ingen klasse endnu</option>';sel.value=selectedSession||'';}
function render(){if(!db.sessions.some(s=>s.id===selectedSession))selectedSession=db.sessions[0]?.id||'';nav();let v=$('#view');v.innerHTML=({overview:renderOverview,entry:renderEntry,students:renderStudents,tests:renderTests,classes:renderClasses,backup:renderBackup}[page]||renderOverview)();bind();}
function renderOverview(){let ss=session();if(!ss)return head('Velkommen til Retskrivningstrackeren','Ét sted til prøver, elever og udvikling.')+`<div class="card">${empty('Opret din første klasse','Begynd med din nuværende 7. klasse.','Opret klasse','new-session')}</div>`;let rr=results().filter(r=>computed(r)),cs=rr.map(r=>computed(r).percent),gg=rr.map(r=>computed(r).numericGrade).filter(Number.isFinite),allTests=tests();return head(`Goddag! 👋`,`Overblik for ${esc(ss.name)} · ${esc(ss.year)}. Kun dette skoleårs resultater indgår i statistikken.`,`<button class="btn" data-page="entry">+ Registrér resultat</button>`)+`<div class="grid stats"><div class="card"><div class="stat-label">Elever</div><div class="stat-value">${students().length}</div><div class="stat-foot">I denne klasse</div></div><div class="card"><div class="stat-label">Prøver</div><div class="stat-value">${allTests.length}</div><div class="stat-foot">Oprettet i skoleåret</div></div><div class="card"><div class="stat-label">Registreringer</div><div class="stat-value">${results().length}</div><div class="stat-foot">Inkl. fravær</div></div><div class="card"><div class="stat-label">Gns. rigtighed</div><div class="stat-value">${pct(cs.length?cs.reduce((a,b)=>a+b,0)/cs.length:NaN)}</div><div class="stat-foot">Registrerede prøver</div></div></div><div class="grid two"><section class="card"><div class="cardtop"><h2>Klassens udvikling</h2><span class="pill">Median pr. prøve</span></div>${allTests.length?lineChart(allTests.map(t=>({label:t.date||t.name,value:classMedian(t.id)})),'Klassemedian'):empty('Ingen prøver endnu','Opret en prøve for at komme i gang.')}</section><section class="card"><div class="cardtop"><h2>Seneste prøver</h2><button class="linkbtn" data-page="tests">Se alle →</button></div>${allTests.length?`<div class="tablewrap"><table><thead><tr><th>Prøve</th><th>Dato</th><th class="right">Registreret</th></tr></thead><tbody>${[...allTests].reverse().slice(0,6).map(t=>`<tr><td>${esc(t.name)}</td><td>${esc(t.date||'—')}</td><td class="right">${registrationSummary(t)}</td></tr>`).join('')}</tbody></table></div>`:empty('Klar til første prøve','Du kan kopiere opgavetyper og karaktergrænser fra Alinea.','Opret prøve','new-test')}</section></div>`}
function lineChart(items,label){let data=items.filter(x=>Number.isFinite(x.value));if(!data.length)return `<p class="hint">Der er endnu ingen beregnede resultater.</p>`;let w=600,h=245,left=42,right=15,top=22,bottom=42,iw=w-left-right,ih=h-top-bottom;let x=i=>left+(items.length===1?iw/2:i*iw/(items.length-1)),y=v=>top+ih*(1-v/100);let points=items.map((d,i)=>Number.isFinite(d.value)?[x(i),y(d.value),d]:null);let segments=[],seg=[];points.forEach(p=>{if(p)seg.push(p);else if(seg.length){segments.push(seg);seg=[]}});if(seg.length)segments.push(seg);return `<div class="chartbox"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><g font-size="11" fill="#8793a7">${[0,25,50,75,100].map(v=>`<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}" stroke="#edf0f6"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('')}${items.map((d,i)=>`<text x="${x(i)}" y="${h-12}" text-anchor="middle">${esc((d.label||'').slice(5)||d.label)}</text>`).join('')}</g>${segments.map(s=>`<polyline fill="none" stroke="#5278d7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${s.map(p=>p[0]+','+p[1]).join(' ')}"/>`).join('')}${points.filter(Boolean).map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#5278d7"><title>${esc(p[2].label)}: ${pct(p[2].value)}</title></circle>`).join('')}</svg></div>`}
function renderClasses(){return head('Klasser & skoleår','Hvert skoleår har selvstændige prøver og statistikker.',`<button class="btn" data-action="new-session">+ Ny klasse / skoleår</button>`)+`<div class="card">${db.sessions.length?`<div class="tablewrap"><table><thead><tr><th>Klasse</th><th>Skoleår</th><th>Elever</th><th>Prøver</th><th></th></tr></thead><tbody>${db.sessions.map(s=>`<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.year)}</td><td>${db.students.filter(x=>x.sessionId===s.id).length}</td><td>${db.tests.filter(x=>x.sessionId===s.id).length}</td><td class="right"><button class="btn small soft" data-action="switch-session" data-id="${s.id}">Åbn</button> <button class="btn small outline" data-action="promote" data-id="${s.id}">Nyt skoleår ↗</button></td></tr>`).join('')}</tbody></table></div>`:empty('Ingen klasser endnu','Opret din første klasse.','Opret klasse','new-session')}</div><p class="footerhelp">Ved oprykning kopieres elevlisten til det nye skoleår. Gamle prøver og resultater bliver liggende i det tidligere skoleår.</p>`}
function renderStudents(){if(!session())return renderClasses();let ss=students();if(!ss.length)return head('Elever','Se den enkelte elevs udvikling.',`<button class="btn" data-action="add-students">+ Tilføj elever</button>`)+`<div class="card">${empty('Ingen elever endnu','Tilføj elever for at se deres resultater.','Tilføj elever','add-students')}</div>`;if(!ss.some(x=>x.id===selectedStudent))selectedStudent=ss[0].id;return head('Elevoversigt','Vælg en elev for at se alle prøver i skoleåret.',`<button class="btn" data-action="add-students">+ Tilføj elever</button>`)+`<section class="card student-full"><div class="field" style="max-width:360px"><label for="studentPicker">Elev</label><select id="studentPicker">${opts(ss,selectedStudent)}</select></div><div id="studentDetails">${studentDetails()}</div></section>`}
function studentDetails(){let s=studentBy(selectedStudent)||students()[0];if(!s)return empty('Vælg en elev','Ingen elever endnu.');selectedStudent=s.id;let rs=results().filter(r=>r.studentId===s.id),valid=rs.filter(r=>computed(r)),nums=valid.map(r=>computed(r).numericGrade).filter(Number.isFinite);let avg=nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:NaN;let cats=new Map();valid.forEach(r=>{let t=testBy(r.testId);t.categories.forEach(c=>{let e=r.errors?.[c.id];if(e===undefined||e===null||e===''||!c.max)return;let key=alias(c.name),o=cats.get(key)||{name:c.name,errors:0,max:0,tests:0};o.errors+=Number(e);o.max+=c.max;o.tests++;cats.set(key,o)})});let catRows=[...cats.values()].sort((a,b)=>b.errors/b.max-a.errors/a.max);return `<div class="cardtop"><h2>${esc(s.name)}</h2><span class="pill">${valid.length} gennemførte prøver</span></div><div class="student-kpis"><div class="subtlebox"><div class="hint">Karaktergennemsnit</div><div class="kpi">${Number.isFinite(avg)?fmt(avg):'—'}</div></div><div class="subtlebox"><div class="hint">Gns. rigtighed</div><div class="kpi">${pct(valid.length?valid.reduce((a,r)=>a+computed(r).percent,0)/valid.length:NaN)}</div></div></div><h3>Individuel retskrivningsprøveoversigt</h3><p class="hint">Søjler og kurver viser rigtighed. Det grå trappeområde viser klassens median for hver prøve.</p>${comboChart(s.id)}<div class="divider"></div><h3>Opgavetyper – samlet fejlprocent</h3>${catRows.length?`<div class="tablewrap"><table><thead><tr><th>Opgavetype</th><th>Fejl</th><th class="right">Fejlprocent</th></tr></thead><tbody>${catRows.map(c=>`<tr><td>${esc(c.name)}</td><td>${c.errors}/${c.max}</td><td class="right">${comparisonCell(c.errors/c.max*100, classCategoryErrorRate(c.name), false, true)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="hint">Ingen data endnu.</p>'}<div class="divider"></div><h3>Prøvehistorik</h3><div class="tablewrap"><table><thead><tr><th>Prøve</th><th>Dato</th><th>Rigtighed</th><th>Karakter</th><th>Tidsforbrug</th></tr></thead><tbody>${rs.sort((a,b)=>(testBy(a.testId)?.date||'').localeCompare(testBy(b.testId)?.date||'')).map(r=>`<tr><td>${esc(testBy(r.testId)?.name||'—')}</td><td>${esc(r.takenDate||testBy(r.testId)?.date||'—')}</td><td>${r.status?esc(statusLabel(r.status)):comparisonCell(computed(r)?.percent,classTestAverage(r.testId,'percent'),true,false)}</td><td>${r.status?'—':comparisonCell(computed(r)?.numericGrade,classTestAverage(r.testId,'numericGrade'),false,false,computed(r)?.grade)}</td><td>${esc(historyTimeLabel(r,testBy(r.testId)))}</td></tr>`).join('')}</tbody></table></div>`}
function comboChart(sid){let tt=tests();if(!tt.length)return '<p class="hint">Ingen prøver endnu.</p>';let categories=[...new Map(tt.flatMap(t=>t.categories.map(c=>[alias(c.name),c.name]))).entries()];let visible=categories.filter(([key])=>tt.some(t=>{let c=t.categories.find(c=>alias(c.name)===key),r=resultOf(sid,t.id);return c&&r&&!r.status&&r.errors?.[c.id]!==undefined}));let colors=visible.map(([key])=>categoryColor(key));let w=Math.max(860,tt.length*100),h=440,l=58,rt=65,top=25,bot=78,iw=w-l-rt,ih=h-top-bot,slot=iw/tt.length,x=i=>l+(i+.5)*slot,y=v=>top+ih*(1-Math.max(0,Math.min(100,v))/100),bw=Math.min(62,slot*.65);let med=tt.map(t=>classMedian(t.id));let area='',active=false;for(let i=0;i<med.length;i++){let v=med[i];if(!Number.isFinite(v)){if(active){area+=` L ${l+i*slot} ${y(0)} Z `;active=false}continue}let left=l+i*slot,right=left+slot;if(!active){area+=`M ${left} ${y(0)} L ${left} ${y(v)}`;active=true}else area+=` L ${left} ${y(v)}`;area+=` L ${right} ${y(v)}`;if(i===med.length-1||!Number.isFinite(med[i+1])){area+=` L ${right} ${y(0)} Z `;active=false}}let medianShape=`<path d="${area}" fill="#d3d3d3" fill-opacity=".42" stroke="#bcbcbc" stroke-width="1.6"/>`;let bars=tt.map((t,i)=>{let c=computed(resultOf(sid,t.id)||{});if(!c)return '';let topBar=y(c.percent);return `<rect x="${x(i)-bw/2}" y="${topBar}" width="${bw}" height="${y(0)-topBar}" rx="2" fill="#4386ee"><title>${esc(t.name)} · ${pct(c.percent)} rigtighed&#10;${esc(chartTimeTooltip(resultOf(sid,t.id),t))}</title></rect><text x="${x(i)}" y="${Math.min(y(0)-7,topBar+20)}" font-size="12" font-weight="700" text-anchor="middle" fill="white">${pct(c.percent)}</text>`}).join('');function curve(vals,color,categoryName){let segments=[],segment=[];vals.forEach((v,i)=>{if(Number.isFinite(v))segment.push({x:x(i),y:y(v),v,i});else if(segment.length){segments.push(segment);segment=[]}});if(segment.length)segments.push(segment);return segments.map(seg=>`<polyline points="${seg.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>${seg.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${color}" stroke="white" stroke-width="1.5"><title>${esc(categoryName)}: ${pct(p.v)} · ${esc(tt[p.i].date||tt[p.i].name)}</title></circle>`).join('')}`).join('')};let lines=visible.map(([key],i)=>curve(tt.map(t=>{let c=t.categories.find(c=>alias(c.name)===key),r=resultOf(sid,t.id);if(!c||!r||r.status||!c.max||r.errors?.[c.id]===undefined)return null;return 100*(c.max-Number(r.errors[c.id]))/c.max}),colors[i],visible[i][1])).join('');let axes=[0,25,50,75,100].map(v=>`<line x1="${l}" x2="${w-rt}" y1="${y(v)}" y2="${y(v)}" stroke="#e4e8ef"/><text x="${l-9}" y="${y(v)+4}" text-anchor="end" font-size="12" fill="#657187">${v},00%</text><text x="${w-rt+7}" y="${y(v)+4}" font-size="12" fill="#657187">${v},00%</text>`).join('');let dates=tt.map((t,i)=>{let d=t.date||'';let display=/^\d{4}-\d{2}-\d{2}$/.test(d)?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):d||t.name;return `<text x="${x(i)}" y="${h-44}" text-anchor="middle" font-size="11" fill="#556176">${esc(display)}</text>`}).join('');return `<div class="student-chart-scroll"><svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Søjler for samlet rigtighed, kurver for rigtighed i opgavetyper og gråt trappeområde for klassemedian">${axes}${medianShape}${bars}${lines}${dates}<text x="${w/2}" y="${h-10}" text-anchor="middle" font-size="12" fill="#556176">Prøve</text></svg></div><div class="legend student-legend"><span><i class="dot" style="background:#4386ee"></i>Samlet rigtighed</span>${visible.map(([key,name],i)=>`<span><i class="dot" style="background:${colors[i]}"></i>${esc(name)}</span>`).join('')}<span><i class="dot" style="background:#c8c8c8"></i>Klassemedian (gråt område)</span></div>`}
function renderTests(){if(!session())return renderClasses();return head('Prøvebibliotek','Opret en prøve ved at kopiere opgavetyper og karaktergrænser fra Alinea.',`<button class="btn" data-action="new-test">+ Opret prøve</button>`)+`<div class="card">${tests().length?`<div class="tablewrap"><table><thead><tr><th>Prøve</th><th>Dato</th><th>Opgavetyper</th><th>Point</th><th>Registreret</th><th></th></tr></thead><tbody>${tests().map(t=>`<tr><td><strong>${esc(t.name)}</strong></td><td>${esc(t.date||'—')}</td><td>${t.categories.length}</td><td>${t.categories.every(c=>c.max>0)?t.categories.reduce((a,c)=>a+c.max,0):'<span class="pill">Afventer første elev</span>'}</td><td>${registrationSummary(t)}</td><td><button class="linkbtn" data-action="edit-test" data-id="${t.id}">Rediger</button></td></tr>`).join('')}</tbody></table></div>`:empty('Ingen prøver endnu','Du kan indsætte Alineas opgavetyper og karaktergrænser.','Opret første prøve','new-test')}</div>`}
function renderEntry(){if(!session())return renderClasses();let st=students(),tt=tests();if(!st.length||!tt.length)return head('Registrering','Registrér en elev ad gangen – eller kopier direkte fra Alinea.')+`<div class="card">${empty('Først skal du bruge en elevliste og en prøve',!st.length?'Tilføj elever i klassen.':'Opret den prøve, du vil registrere.',!st.length?'Tilføj elever':'Opret prøve',!st.length?'add-students':'new-test')}</div>`;if(!st.some(s=>s.id===selectedStudent))selectedStudent=st[0].id;if(!tt.some(t=>t.id===selectedTest))selectedTest=tt[tt.length-1].id;let t=testBy(selectedTest),isDraft=!t.categories.length||t.categories.some(c=>!c.max),idx=st.findIndex(s=>s.id===selectedStudent),r=resultOf(selectedStudent,selectedTest),c=r?computed(r):null;return head('Registrering','Indsæt resultatet fra Alinea, eller indtast antallet af fejl manuelt.',`<span class="pill good">${results().filter(r=>r.testId===selectedTest).length} af ${st.length} registreret</span>`)+`<div class="grid entry-layout"><div class="card entry-form"><div class="field"><label>Prøve</label><select id="entryTest">${opts(tt,selectedTest,t=>`${t.name} · ${t.date||'uden dato'}`)}</select></div><div class="field"><label>Elev</label><div class="navstudent"><button class="btn icon outline" id="prevStudent" ${idx===0?'disabled':''} title="Forrige elev">‹</button><select id="entryStudent">${opts(st,selectedStudent)}</select><button class="btn icon outline" id="nextStudent" ${idx===st.length-1?'disabled':''} title="Næste elev">›</button></div><div class="hint right">Elev ${idx+1} af ${st.length}</div></div><div class="formgrid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px"><div class="field"><label>Registrering</label><select id="entryStatus"><option value="">Gennemført prøve</option><option value="FRAVÆR" ${isAbsentStatus(r?.status)?'selected':''}>Fraværende – mangler prøven</option><option value="TEKNISK_FEJL" ${r?.status==='TEKNISK_FEJL'?'selected':''}>Teknisk fejl – resultat gået tabt</option></select></div><div class="field"><label>Elevens prøvedato</label><input type="date" id="entryTakenDate" value="${esc(r?.takenDate||t.date||today())}"><div class="hint">Kun hvis prøven tages en anden dag</div></div></div><div class="tabs"><button class="${entryMode==='paste'?'active':''}" data-mode="paste">Indsæt fra Alinea</button><button class="${entryMode==='manual'?'active':''}" data-mode="manual">Manuel indtastning</button></div><div id="pasteSection" ${entryMode==='manual'?'hidden':''}><div class="field"><label>Kopier opgavetyper og resultater fra Alinea</label><textarea id="resultPaste" placeholder="Indsætningsdiktat&#10;28/44&#10;Komma&#10;3/5"></textarea></div>${isDraft?'<button class="btn" id="confirmFirstImport">Hent og godkend prøveopsætning</button>':''}<div id="parseFeedback" class="hint" style="margin-top:10px"></div></div><div id="manualSection" ${entryMode==='paste'?'hidden':''}><p class="hint">Indtast fejl i de opgavetyper, der indgår i prøven.</p></div><div class="divider"></div>${isDraft?'<div class="notice">Indsæt første elevs resultat ovenfor, og godkend pointfordelingen. Du kan dog registrere fravær eller teknisk fejl allerede nu.</div><div class="actions"><button class="btn" id="saveDraftStatus">Gem fravær / teknisk fejl</button></div>':'<div id="entryInputs">'+entryInputs(t,r)+'</div><div id="entryPreview"></div><div class="actions">'}${idx<st.length-1?'<button class="btn" id="saveNext">Gem og næste elev →</button><button class="btn outline" id="saveEntry">Gem resultat</button>':'<button class="btn" id="saveEntry">Gem resultat</button>'}${r?'<button class="btn danger" id="deleteEntry">Slet registrering</button>':''}</div></div><div class="card"><div class="cardtop"><h2>Prøveoverblik</h2><span class="pill">${t.categories.reduce((a,c)=>a+c.max,0)} point</span></div><p class="hint">${esc(t.name)} · ${esc(t.date||'Ingen dato')}</p><div class="divider"></div>${t.categories.map(cat=>`<div class="row between" style="padding:8px 0"><span>${esc(cat.name)}</span><span class="tag">${cat.max} point</span></div>`).join('')}<div class="divider"></div><h3>Registreringsstatus</h3>${st.map(s=>`<div class="row between" style="padding:6px 0"><span class="mini">${esc(s.name)}</span><span class="tag">${resultOf(s.id,t.id)?.status?esc(statusLabel(resultOf(s.id,t.id).status)):resultOf(s.id,t.id)?'✓ Registreret':'Afventer'}</span></div>`).join('')}</div></div>`}
function entryInputs(t,r){return `<div class="subtlebox"><div class="row between"><strong>Antal fejl</strong><span class="hint">Maks. pr. opgavetype</span></div>${t.categories.map(cat=>`<div class="resultrow"><div>${esc(cat.name)}</div><input type="number" min="0" max="${cat.max}" step="1" inputmode="numeric" data-cat="${cat.id}" value="${r?.errors?.[cat.id]??''}" placeholder="—"><small class="right">/ ${cat.max}</small></div>`).join('')}</div>`}
function parsePairs(text){let rows=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),out=[];for(let i=0;i<rows.length;i++){let same=rows[i].match(/^(.+?)\s+(\d+)\s*\/\s*(\d+)$/);if(same){out.push({name:same[1],correct:+same[2],max:+same[3]});continue}let n=rows[i+1]?.match(/^(\d+)\s*\/\s*(\d+)$/);if(n){out.push({name:rows[i],correct:+n[1],max:+n[2]});i++}}return out}
function norm(s){return String(s||'').toLocaleLowerCase('da').normalize('NFKD').replace(/[^a-z0-9æøå]/g,'').replace(/retteksten|retentekst/g,'rettekst')}
function alias(s){let n=norm(s);return n==='rettekst'?'rettekst':n}
function parseGrades(raw){let rows=String(raw||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),out=[];for(let row of rows){let m=row.match(/^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s+(-3|00|02|4|7|10|12)\s*$/);if(m)out.push({min:+m[1],max:m[2]?+m[2]:+m[1],grade:m[3]})}return out.sort((a,b)=>a.min-b.min)}
function validateGrades(g,max){if(!g.length)return 'Indsæt karaktergrænserne for prøven.';let expected=0;for(let x of g){if(x.min!==expected||x.max<x.min)return `Karaktergrænserne har et hul eller overlap omkring ${expected} point.`;expected=x.max+1}if(expected!==max+1)return `Karaktergrænserne skal dække 0–${max} point (dækker nu 0–${expected-1}).`;return ''}
function renderBackup(){return head('Sikkerhedskopi','Eksportér dine data regelmæssigt – især inden du skifter computer.')+`<div class="grid two"><div class="card"><h2>Download sikkerhedskopi</h2><p class="hint">Gemmer alle klasser, elever, prøver, karaktergrænser og registreringer i én JSON-fil.</p><button class="btn" id="exportBackup">↓ Download JSON</button></div><div class="card"><h2>Gendan sikkerhedskopi</h2><p class="hint">Indlæs en tidligere eksport. Dette erstatter alle nuværende data i denne browser.</p><input type="file" accept=".json,application/json" id="importBackup"></div></div><div class="notice"><strong>Vigtigt om elevdata:</strong> GitHub Pages er en offentlig hjemmeside. Denne version sender ikke elevdata til GitHub; oplysningerne gemmes lokalt i browseren. Brug kun identificerbare elevoplysninger, hvis det er godkendt efter skolens regler. Lokal browserlagring er ikke en sikker, synkroniseret skoleløsning.</div>`}
function bind(){document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{if(!canLeave())return;page=b.dataset.page;render()});document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action,b.dataset.id));if(page==='entry')bindEntry();if(page==='students'){let picker=$('#studentPicker');if(picker)picker.onchange=e=>{selectedStudent=e.target.value;$('#studentDetails').innerHTML=studentDetails()}}if(page==='backup')bindBackup()}
function canLeave(){if(dirty&&!confirm('Der er ændringer, som ikke er gemt. Vil du fortsætte uden at gemme?'))return false;dirty=false;return true}
function action(a,id){if(a==='new-session')return newSession();if(a==='switch-session'){if(!canLeave())return;selectedSession=id;selectedStudent='';selectedTest='';page='overview';render();return}if(a==='promote')return promote(id);if(a==='add-students')return addStudents();if(a==='new-test')return testEditor();if(a==='edit-test')return testEditor(id);}
function modal(title,html,onSave,saveLabel='Gem'){let old=$('#modal');if(old)old.remove();let wrap=document.createElement('div');wrap.id='modal';wrap.style='position:fixed;inset:0;background:#13213a90;display:grid;place-items:center;padding:16px;z-index:20;overflow:auto';wrap.innerHTML=`<section class="card narrow" style="width:min(100%,760px);max-height:92vh;overflow:auto;box-shadow:0 24px 100px #09142d50"><div class="cardtop"><h2>${title}</h2><button class="btn outline small" id="closeModal">Luk ✕</button></div>${html}<div class="actions"><button class="btn" id="modalSave">${saveLabel}</button><button class="btn outline" id="modalCancel">Annuller</button></div></section>`;document.body.appendChild(wrap);$('#closeModal').onclick=$('#modalCancel').onclick=()=>wrap.remove();$('#modalSave').onclick=onSave;wrap.onclick=e=>{if(e.target===wrap)wrap.remove()};}
function newSession(){modal('Ny klasse / skoleår',`<div class="formgrid"><div class="field"><label>Klasse</label><input id="newClass" placeholder="7.B"></div><div class="field"><label>Skoleår</label><input id="newYear" placeholder="2026/27" value="2026/27"></div></div><p class="hint">Klassen får sine egne prøver og sin egen statistik.</p>`,()=>{let name=$('#newClass').value.trim(),year=$('#newYear').value.trim();if(!name||!year)return alert('Udfyld både klasse og skoleår.');let s={id:uid(),name,year};db.sessions.push(s);selectedSession=s.id;selectedStudent='';selectedTest='';save();$('#modal').remove();page='classes';render();toast('Klassen er oprettet')})}
function promote(id){let old=db.sessions.find(s=>s.id===id);if(!old)return;let m=old.year.match(/(\d{4})\s*\/\s*(\d{2,4})/),next=m?`${+m[1]+1}/${String(+m[1]+2).slice(-2)}`:'';let suggested=old.name.replace(/^(\d+)/,n=>String(+n+1));modal('Opret næste skoleår',`<p class="hint">Elevlisten kopieres. Prøver, registreringer og statistik starter forfra i det nye skoleår.</p><div class="formgrid"><div class="field"><label>Nyt klassenavn</label><input id="promoteClass" value="${esc(suggested)}"></div><div class="field"><label>Nyt skoleår</label><input id="promoteYear" value="${esc(next)}"></div></div>`,()=>{let name=$('#promoteClass').value.trim(),year=$('#promoteYear').value.trim();if(!name||!year)return alert('Udfyld klasse og skoleår.');let s={id:uid(),name,year,previousId:old.id};db.sessions.push(s);db.students.filter(x=>x.sessionId===old.id).forEach(x=>db.students.push({id:uid(),name:x.name,sessionId:s.id,previousStudentId:x.id}));selectedSession=s.id;selectedStudent='';selectedTest='';save();$('#modal').remove();render();toast('Nyt skoleår oprettet – tidligere resultater er bevaret')})}
function addStudents(){if(!session())return newSession();modal('Tilføj elever',`<p class="hint">Indsæt én elev pr. linje. Eksisterende navne springes over.</p><div class="field"><label>Elevliste</label><textarea id="names" rows="11" placeholder="Elev 1&#10;Elev 2&#10;Elev 3"></textarea></div>`,()=>{let names=$('#names').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),existing=new Set(students().map(x=>x.name.toLocaleLowerCase('da'))),added=0;for(let name of names){if(!existing.has(name.toLocaleLowerCase('da'))){db.students.push({id:uid(),sessionId:selectedSession,name});existing.add(name.toLocaleLowerCase('da'));added++}}if(!names.length)return alert('Indsæt mindst ét navn.');save();$('#modal').remove();render();toast(`${added} elever tilføjet`)})}
function testEditor(id){if(!session())return newSession();let t=testBy(id),existing=!!t,ready=!!t?.categories?.length&&t.categories.every(c=>c.max>0);let rawCats=t?.categories.map(c=>ready?`${c.name} 0/${c.max}`:c.name).join('\n')||'',rawGrades=t?.grades.map(g=>`${g.min}${g.max!==g.min?' - '+g.max:''}\t${g.grade}`).join('\n')||'';modal(existing?'Rediger prøve':'Opret prøve',`<div class="formgrid"><div class="field"><label>Prøvens navn</label><input id="testName" value="${esc(t?.name||'')}" placeholder="Tandpasta og tandbørster"></div><div class="field"><label>Dato</label><input id="testDate" type="date" value="${esc(t?.date||today())}"></div></div><div class="field"><label>Opgavetyper fra Alinea (valgfrit)</label><textarea id="testCats" rows="7" placeholder="Indsætningsdiktat&#10;Komma&#10;Fra nutid til datid">${esc(rawCats)}</textarea><div class="hint">Indsæt gerne blot navnene fra Alineas oversigt. Pointfordelingen hentes automatisk, når du indsætter den første elevs resultat. Har du allerede en resultatoversigt med 28/44 osv., kan du også indsætte den her.</div></div><div class="field"><label>Karaktergrænser fra Alinea</label><textarea id="testGrades" rows="7" placeholder="0    -3&#10;1 - 22    00&#10;23 - 38    02">${esc(rawGrades)}</textarea><div class="hint">Kan udfyldes nu eller senere, men skal være klar inden første resultat gemmes.</div></div>`,()=>{let name=$('#testName').value.trim(),date=$('#testDate').value,raw=$('#testCats').value,parsed=parsePairs(raw),names=parsed.length?parsed.map(c=>c.name):raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),g=parseGrades($('#testGrades').value);if(!name)return alert('Angiv prøvens navn.');if(new Set(names.map(norm)).size!==names.length)return alert('Der er gentagne opgavetyper.');if($('#testGrades').value.trim()&&!g.length)return alert('Karaktergrænserne blev ikke genkendt.');let cats=names.map((name,i)=>({name,max:parsed.length?parsed[i].max:0})),max=cats.reduce((a,c)=>a+c.max,0);if(max&&g.length){let err=validateGrades(g,max);if(err)return alert(err)}if(existing&&db.results.some(r=>r.testId===id)&&(!ready||!max||max!==t.categories.reduce((a,c)=>a+c.max,0)))return alert('En prøve med registrerede resultater kan ikke ændres til en ufuldstændig pointfordeling.');let prior=t?.categories||[],categories=cats.map(c=>({id:prior.find(p=>alias(p.name)===alias(c.name))?.id||uid(),name:c.name,max:c.max}));if(existing)Object.assign(t,{name,date,categories,grades:g});else{t={id:uid(),sessionId:selectedSession,name,date,categories,grades:g};db.tests.push(t)}selectedTest=t.id;save();$('#modal').remove();page='tests';render();toast(max?'Prøven er gemt':'Prøven er oprettet – pointfordeling afventer første elev')},existing?'Gem ændringer':'Opret prøve')}
function confirmFirstImport(){let t=testBy(selectedTest),raw=$('#resultPaste').value,pairs=parsePairs(raw);if(!pairs.length)return alert('Ingen opgavetyper med point blev genkendt.');let expected=t.categories.map(c=>alias(c.name)),found=pairs.map(c=>alias(c.name));if(new Set(found).size!==found.length)return alert('Samme opgavetype forekommer flere gange.');let missing=expected.filter(n=>!found.includes(n)),extra=found.filter(n=>!expected.includes(n));if(expected.length&&(missing.length||extra.length))return alert('Opgavetyperne passer ikke med prøveopsætningen. Mangler: '+(missing.join(', ')||'ingen')+'. Ukendte: '+(extra.join(', ')||'ingen')+'. Rediger eventuelt prøven først.');if(pairs.some(x=>x.max<=0||x.correct>x.max))return alert('Kontrollér pointene i det indsatte resultat.');let max=pairs.reduce((sum,c)=>sum+c.max,0),err=validateGrades(t.grades||[],max);if(err)return alert(err+' Gå til Prøver → Rediger, og indsæt karaktergrænserne.');let lines=pairs.map(c=>`${c.name}: ${c.max} point`).join('\n');if(!confirm('Bekræft pointfordelingen for '+t.name+':\n\n'+lines+'\n\nI alt: '+max+' point.\n\nEr det korrekt?'))return;if(!t.categories.length){t.categories=pairs.map(c=>({id:uid(),name:c.name,max:c.max}))}else{for(let cat of t.categories){let found=pairs.find(c=>alias(c.name)===alias(cat.name));cat.max=found.max}}pendingImport=raw;save();dirty=false;render();let paste=$('#resultPaste');if(paste){paste.value=pendingImport;interpretPastedResult()}pendingImport='';toast('Pointfordelingen er gemt. Kontrollér elevens resultat og gem.')}
function interpretPastedResult(){let t=testBy(selectedTest),pairs=parsePairs($('#resultPaste').value);if(!pairs.length)return $('#parseFeedback').innerHTML='<span class="warning-text">Ingen resultater genkendt. Kontrollér den kopierede tekst.</span>';let matched=new Set,issues=[];for(let p of pairs){let cat=t.categories.find(c=>alias(c.name)===alias(p.name));if(!cat){issues.push('Ukendt opgavetype: '+p.name);continue}if(matched.has(cat.id)){issues.push('Dublet: '+p.name);continue}if(cat.max!==p.max){issues.push(`Point stemmer ikke for ${p.name}: Alinea ${p.max}, prøve ${cat.max}`);continue}if(p.correct>p.max){issues.push('Ugyldigt pointtal for '+p.name);continue}let input=document.querySelector(`[data-cat="${cat.id}"]`);if(input)input.value=String(p.max-p.correct);matched.add(cat.id)}let missing=t.categories.filter(c=>!matched.has(c.id));if(missing.length)issues.push('Mangler: '+missing.map(c=>c.name).join(', '));$('#parseFeedback').innerHTML=`<span class="${issues.length?'warning-text':''}">${matched.size} af ${t.categories.length} opgavetyper genkendt.${issues.length?'<br>'+issues.map(esc).join('<br>'):' Klar til kontrol og gemning.'}</span>`;dirty=true;previewEntry()}
function bindEntry(){let st=students(),tt=tests();if(!st.length||!tt.length)return;let t0=testBy(selectedTest);if(t0&&(!t0.categories.length||t0.categories.some(c=>!c.max))){document.querySelector('#confirmFirstImport').onclick=confirmFirstImport;$('#entryStatus').onchange=updateEntryStatus;$('#saveDraftStatus').onclick=()=>{let status=$('#entryStatus').value;if(!status)return alert('Vælg Fraværende eller Teknisk fejl.');let record={status,errors:{},blanks:{},duration:'',takenDate:$('#entryTakenDate').value||testBy(selectedTest).date};let old=resultOf(selectedStudent,selectedTest);if(old)Object.assign(old,record);else db.results.push({id:uid(),sessionId:selectedSession,studentId:selectedStudent,testId:selectedTest,...record});if(save()){dirty=false;toast(statusLabel(status)+' registreret');render()}};$('#entryStudent').onchange=e=>{selectedStudent=e.target.value;render()};$('#entryTest').onchange=e=>{selectedTest=e.target.value;render()};$('#prevStudent').onclick=()=>moveStudent(-1);$('#nextStudent').onclick=()=>moveStudent(1);return;}$('#entryStudent').onchange=e=>{if(!canLeave()){e.target.value=selectedStudent;return}selectedStudent=e.target.value;render()};$('#entryTest').onchange=e=>{if(!canLeave()){e.target.value=selectedTest;return}selectedTest=e.target.value;render()};$('#prevStudent').onclick=()=>moveStudent(-1);$('#nextStudent').onclick=()=>moveStudent(1);document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{entryMode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));$('#pasteSection').hidden=entryMode!=='paste';$('#manualSection').hidden=entryMode!=='manual';updateEntryStatus()});document.querySelectorAll('[data-cat]').forEach(x=>x.oninput=()=>{dirty=true;previewEntry()});$('#entryStatus').onchange=()=>{dirty=true;updateEntryStatus();previewEntry()};$('#resultPaste').oninput=()=>{dirty=true;interpretPastedResult()};$('#resultPaste').addEventListener('paste',()=>setTimeout(interpretPastedResult,0));$('#entryTakenDate').onchange=()=>{dirty=true};$('#saveEntry').onclick=()=>saveEntry(false);if($('#saveNext'))$('#saveNext').onclick=()=>saveEntry(true);if($('#deleteEntry'))$('#deleteEntry').onclick=()=>{if(confirm('Slet denne registrering?')){db.results=db.results.filter(r=>!(r.sessionId===selectedSession&&r.studentId===selectedStudent&&r.testId===selectedTest));save();dirty=false;render();toast('Registreringen er slettet')}};updateEntryStatus();previewEntry()}
function updateEntryStatus(){let absent=!!$('#entryStatus')?.value;let paste=$('#pasteSection'),manual=$('#manualSection'),tabs=document.querySelector('.tabs'),inputs=$('#entryInputs'),date=$('#entryTakenDate');if(paste)paste.hidden=absent||entryMode!=='paste';if(manual)manual.hidden=absent||entryMode!=='manual';if(tabs)tabs.hidden=absent;if(inputs)inputs.hidden=absent;if(date)date.disabled=absent;}
function moveStudent(delta){if(!canLeave())return;let st=students(),idx=st.findIndex(s=>s.id===selectedStudent),next=st[idx+delta];if(next){selectedStudent=next.id;render()}}
function readEntry(){let t=testBy(selectedTest),errors={},status=$('#entryStatus').value;for(let cat of t.categories){let val=document.querySelector(`[data-cat="${cat.id}"]`).value.trim();if(!status){if(val==='')return {error:'Udfyld alle opgavetyper, eller vælg en fraværsstatus.'};let n=Number(val);if(!Number.isInteger(n)||n<0||n>cat.max)return {error:`Kontrollér antal fejl i ${cat.name} (0–${cat.max}).`};errors[cat.id]=n}}return {errors,status,takenDate:$('#entryTakenDate').value||testBy(selectedTest).date}}
function previewEntry(){let out=$('#entryPreview'),r=readEntry();if(r.error){out.innerHTML='<p class="hint">Udfyld felterne for at se karakter og rigtighed.</p>';return}if(r.status){out.innerHTML=`<div class="subtlebox">Status: <strong>${esc(statusLabel(r.status))}</strong> · Indgår ikke i statistikken.</div>`;return}let t=testBy(selectedTest),max=t.categories.reduce((a,c)=>a+c.max,0),errors=Object.values(r.errors).reduce((a,b)=>a+b,0),correct=max-errors;out.innerHTML=`<div class="subtlebox"><div class="row between"><div><div class="hint">Rigtighed</div><div class="kpi">${pct(correct/max*100)}</div></div><div><div class="hint">Point</div><strong>${correct}/${max}</strong></div><div><div class="hint">Karakter</div><div class="kpi">${grade(t,correct)??'—'}</div></div></div></div>`}
function saveEntry(next){let r=readEntry();if(r.error)return alert(r.error);let old=resultOf(selectedStudent,selectedTest);if(old){Object.assign(old,r);if(r.status){old.errors={};old.blanks={};old.duration=''}}else db.results.push({id:uid(),sessionId:selectedSession,studentId:selectedStudent,testId:selectedTest,...r});if(!save())return;dirty=false;toast(r.status?statusLabel(r.status)+' registreret':'Resultatet er gemt');if(next){let st=students(),idx=st.findIndex(s=>s.id===selectedStudent);if(st[idx+1])selectedStudent=st[idx+1].id}render();if(next){let target=document.querySelector('#resultPaste')||document.querySelector('#entryStudent');if(target){target.scrollIntoView({behavior:'instant',block:'start'});if(target.id==='resultPaste')target.focus({preventScroll:true})}}}
function bindBackup(){$('#exportBackup').onclick=()=>{let blob=new Blob([JSON.stringify({...db,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='retskrivningstracker-backup-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Sikkerhedskopi downloadet')};$('#importBackup').onchange=async e=>{let f=e.target.files?.[0];if(!f)return;try{let x=JSON.parse(await f.text());if(!x||!['sessions','students','tests','results'].every(k=>Array.isArray(x[k])))throw Error('Ukendt filformat');if(!confirm('Erstat ALLE data i denne browser med sikkerhedskopien?'))return;db={version:1,sessions:x.sessions,students:x.students,tests:x.tests,results:x.results};selectedSession=db.sessions[0]?.id||'';selectedStudent='';selectedTest='';save();render();toast('Sikkerhedskopien er gendannet')}catch(err){alert('Filen kunne ikke indlæses: '+err.message)}}}

// Prøvetracker: fælles elevdata, men adskilte prøvetyper og statistikker.
let activeKind='spelling';
const kindOf=t=>t?.kind==='reading'?'reading':'spelling';
const allTests=tests;
tests=function(){return allTests().filter(t=>kindOf(t)===activeKind)};
const allResults=results;
results=function(){return allResults().filter(r=>kindOf(testBy(r.testId))===activeKind)};
const originalRender=render;
render=function(){
  if(selectedTest&&!tests().some(t=>t.id===selectedTest))selectedTest='';
  originalRender();
  const root=$('#view');
  if(!session())return;
  const selector=document.createElement('div');
  selector.className='kind-selector';
  selector.innerHTML=`<button type="button" data-kind="spelling" class="${activeKind==='spelling'?'chosen':''}">✎ Retskrivning</button><button type="button" data-kind="reading" class="${activeKind==='reading'?'chosen':''}">▤ Læsning</button>`;
  root.prepend(selector);
  selector.querySelectorAll('button').forEach(b=>b.onclick=()=>{
    if(!canLeave())return;
    activeKind=b.dataset.kind;selectedTest='';render();
  });
};
const originalTestEditor=testEditor;
testEditor=function(id){
  if(activeKind==='spelling')return originalTestEditor(id);
  let t=id?testBy(id):null;
  modal(t?'Rediger læseprøve':'Opret læseprøve',`
    <div class="field"><label>Prøvens navn</label><input id="readingName" value="${esc(t?.name||'')}" placeholder="Prøve 1 – 7. klasse"></div>
    <div class="field"><label>Prøvedato</label><input id="readingDate" type="date" value="${esc(t?.date||today())}"></div>
    <div class="field"><label>Karaktergrænser fra Alinea (valgfrit indtil resultater registreres)</label>
    <textarea id="readingGrades" rows="7" placeholder="0 - 10    00&#10;11 - 20    02">${esc((t?.grades||[]).map(g=>`${g.min} - ${g.max}    ${g.grade}`).join('\n'))}</textarea></div>
    <p class="hint">Tekst 1, Tekst 2 osv. samt pointtal hentes automatisk fra den første elevs Alinea-resultat. Ingen faste pointtal.</p>`,()=>{
      let name=$('#readingName').value.trim(),date=$('#readingDate').value,g=parseGrades($('#readingGrades').value);
      if(!name)return alert('Angiv prøvens navn.');
      if($('#readingGrades').value.trim()&&!g.length)return alert('Karaktergrænserne blev ikke genkendt.');
      if(t){Object.assign(t,{name,date,grades:g,kind:'reading'})}
      else {t={id:uid(),sessionId:selectedSession,name,date,kind:'reading',categories:[],grades:g};db.tests.push(t)}
      selectedTest=t.id;save();$('#modal').remove();page='entry';render();toast('Læseprøven er gemt');
  },t?'Gem ændringer':'Opret læseprøve');
};
const originalRenderEntry=renderEntry;
renderEntry=function(){
  if(activeKind!=='reading')return originalRenderEntry();
  if(!session())return renderClasses();
  let ss=students(),tt=tests();
  if(!ss.length||!tt.length)return head('Registrering · læsning','Opret elever og en læseprøve først.')+`<div class="card">${empty('Klar til at komme i gang','Opret elever og en læseprøve.',!ss.length?'Tilføj elever':'Opret læseprøve',!ss.length?'add-students':'new-test')}</div>`;
  if(!ss.some(x=>x.id===selectedStudent))selectedStudent=ss[0].id;
  if(!tt.some(x=>x.id===selectedTest))selectedTest=tt[tt.length-1].id;
  let t=testBy(selectedTest),idx=ss.findIndex(x=>x.id===selectedStudent),r=resultOf(selectedStudent,selectedTest);
  let cats=t.categories||[];
  return head('Registrering · læsning','Kopiér elevens resultatoversigt fra Alinea, kontrollér og gem.',`<span class="pill">${results().filter(x=>x.testId===t.id).length} af ${ss.length} registreret</span>`)+`
  <div class="grid entry-layout"><section class="card entry-form">
    <div class="field"><label>Prøve</label><select id="readingTest">${opts(tt,t.id)}</select></div>
    <div class="field"><label>Elev</label><div class="navstudent"><button class="btn outline" id="readingPrev" ${idx===0?'disabled':''}>‹</button><select id="readingStudent">${opts(ss,selectedStudent)}</select><button class="btn outline" id="readingNext" ${idx===ss.length-1?'disabled':''}>›</button></div><div class="hint right">Elev ${idx+1} af ${ss.length}</div></div>
    <div class="formgrid"><div class="field"><label>Registrering</label><select id="readingStatus"><option value="">Gennemført</option><option value="FRAVÆR" ${isAbsentStatus(r?.status)?'selected':''}>Fraværende – mangler prøven</option><option value="TEKNISK_FEJL" ${r?.status==='TEKNISK_FEJL'?'selected':''}>Teknisk fejl – resultat gået tabt</option></select></div>
    <div class="field"><label>Elevens prøvedato</label><input type="date" id="readingDateTaken" value="${esc(r?.takenDate||t.date||today())}"></div>
    <div class="field"><label>Tidsforbrug (mm:ss)</label><input id="readingDuration" placeholder="26:37" value="${esc(r?.duration||'')}"></div></div>
    <div class="field"><label>Indsæt resultat fra Alinea</label><textarea id="readingPaste" rows="8" placeholder="Unge bruger mobil på cyklen (artikel)    0/10    9/10&#10;Djævelens tre guldhår (eventyr)    0/10    10/10"></textarea>
    <div class="hint">Første pointbrøk = blanke svar, anden = rigtige svar. Rækkefølgen bestemmer Tekst 1, Tekst 2 osv. Titler og genrer bruges ikke til sammenligning.</div></div>
    <div id="readingFeedback" class="hint"></div>
    <div id="readingRows">${cats.map((c,i)=>readingRow(c,i,r)).join('')}</div>
    <div id="readingPreview"></div>
    <div class="actions">${idx<ss.length-1?'<button class="btn" id="readingSaveNext">Gem og næste elev →</button><button class="btn outline" id="readingSave">Gem resultat</button>':'<button class="btn" id="readingSave">Gem resultat</button>'}${r?'<button class="btn danger" id="readingDelete">Slet registrering</button>':''}</div>
  </section><aside class="card entry-overview"><div class="cardtop"><h2>Prøveoverblik</h2><span class="pill">${cats.reduce((sum,c)=>sum+(c.max||0),0)} point</span></div><p class="hint">${esc(t.name)} · ${esc(t.date||'Ingen dato')}</p><div class="divider"></div>${cats.length?cats.map((c,i)=>`<div class="row between" style="padding:8px 0"><span>Tekst ${i+1}</span><span class="tag">${c.max} point</span></div>`).join(''):'<p class="hint">Tekster og point fastlægges ved første gennemførte prøve.</p>'}<div class="divider"></div><h3>Registreringsstatus</h3>${ss.map(student=>{let entry=resultOf(student.id,t.id);return `<div class="row between" style="padding:6px 0"><span class="mini">${esc(student.name)}</span><span class="tag">${entry?.status?esc(statusLabel(entry.status)):entry?'✓ Registreret':'Afventer'}</span></div>`}).join('')}</aside></div>`;
};
function readingRow(c,i,r){
  let max=c.max||0,blank=r?.blanks?.[c.id]??'',right=r&&!r.status&&r.errors?.[c.id]!==undefined?max-r.errors[c.id]:'';
  return `<div class="reading-input-row"><strong>Tekst ${i+1}</strong><label>Blanke <input type="number" min="0" max="${max}" data-blank="${c.id}" value="${blank}"></label><label>Rigtige <input type="number" min="0" max="${max}" data-right="${c.id}" value="${right}"></label><span>af ${max}</span></div>`;
}
function parseReading(raw){
  const lines=raw.replace(/\r/g,'').split('\n').map(x=>x.replace(/\*\*/g,'').replace(/<br\s*\/?>/gi,' ').replace(/\|/g,' ').trim()).filter(Boolean);
  const duration=(raw.match(/\b(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})\b/)||[])[1]||'';
  const out=[];
  const fraction=/(\d+)\s*\/\s*(\d+)/g;
  const ignore=/^(prøve|i alt|total|blanks?|rigtige svar|opgave|tekst \d+|dato|tid|karakter)\b/i;
  function add(name,pairs){
    if(!name||ignore.test(name)||pairs.length!==2)return false;
    const [blank,right]=pairs;
    if(blank.max!==right.max||blank.max<=0||blank.n+right.n>right.max)return false;
    out.push({name,blank:blank.n,right:right.n,max:right.max});return true;
  }
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    const matches=[...line.matchAll(fraction)];
    const pairs=matches.map(m=>({n:+m[1],max:+m[2]}));
    if(matches.length===2){
      const title=line.slice(0,matches[0].index).trim();
      if(add(title,pairs))continue;
    }
    // Alinea kan placere titel og point på hver sin linje.
    // Accepter kun den umiddelbart følgende linje med præcis to pointbrøker.
    if(matches.length===0&&!ignore.test(line)&&i+1<lines.length){
      const next=lines[i+1];
      const nextMatches=[...next.matchAll(fraction)];
      const nextPairs=nextMatches.map(m=>({n:+m[1],max:+m[2]}));
      if(nextMatches.length===2&&next.slice(0,nextMatches[0].index).trim()===''&&add(line,nextPairs))i++;
    }
  }
  return {rows:out,duration};
}
const originalBind=bind;
bind=function(){
  if(page!=='entry'||activeKind!=='reading')return originalBind();
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{if(!canLeave())return;page=b.dataset.page;render()});
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action,b.dataset.id));
  if(!$('#readingStudent'))return;
  $('#readingStudent').onchange=e=>{selectedStudent=e.target.value;render()};
  $('#readingTest').onchange=e=>{selectedTest=e.target.value;render()};
  let ss=students(),idx=ss.findIndex(s=>s.id===selectedStudent);
  $('#readingPrev').onclick=()=>{if(idx>0){selectedStudent=ss[idx-1].id;render()}};
  $('#readingNext').onclick=()=>{if(idx<ss.length-1){selectedStudent=ss[idx+1].id;render()}};
  $('#readingStatus').onchange=updateReadingPreview;
  $('#readingPaste').oninput=()=>{
    let {rows,duration}=parseReading($('#readingPaste').value),t=testBy(selectedTest),feedback=$('#readingFeedback');
    if(!rows.length){feedback.textContent='Ingen læsetekster genkendt endnu. Indsæt både blanke og rigtige svar fra Alinea.';return}
    if(!t.categories.length){
      feedback.textContent=`${rows.length} tekster fundet. Pointfordelingen fastlægges, når du gemmer første resultat.`;
      $('#readingRows').innerHTML=rows.map((x,i)=>readingRow({id:'new-'+i,max:x.max},i)).join('');
    }else if(rows.length!==t.categories.length||rows.some((x,i)=>x.max!==t.categories[i].max)){
      feedback.textContent='Teksternes antal eller pointfordeling passer ikke til denne prøve. Kontrollér den indsatte tekst.';
      $('#readingRows').innerHTML=t.categories.map((c,i)=>readingRow(c,i,resultOf(selectedStudent,selectedTest))).join('');
      $('#readingPaste').dataset.invalid='1';return;
    }else {feedback.textContent=`${rows.length} tekster genkendt. Kontrollér tallene nedenfor.`}
    delete $('#readingPaste').dataset.invalid;
    rows.forEach((x,i)=>{
      let id=t.categories[i]?.id||'new-'+i;
      let b=document.querySelector(`[data-blank="${id}"]`),r=document.querySelector(`[data-right="${id}"]`);
      if(b)b.value=x.blank;if(r)r.value=x.right;
    });
    if(duration&&!($('#resultDuration')||$('#readingDuration')).value)($('#resultDuration')||$('#readingDuration')).value=duration;
    updateReadingPreview();
  };
  $('#readingRows').oninput=updateReadingPreview;
  $('#readingSave').onclick=()=>saveReading(false);
  if($('#readingSaveNext'))$('#readingSaveNext').onclick=()=>saveReading(true);
  if($('#readingDelete'))$('#readingDelete').onclick=()=>{
    if(!confirm('Slet denne registrering?'))return;
    db.results=db.results.filter(r=>!(r.sessionId===selectedSession&&r.studentId===selectedStudent&&r.testId===selectedTest));
    save();render();toast('Registreringen er slettet');
  };
  updateReadingPreview();
};
function readReading(){
  let t=testBy(selectedTest),status=$('#readingStatus').value;
  if(status)return {status,errors:{},blanks:{},duration:'',takenDate:$('#readingDateTaken').value||t.date};
  if($('#readingPaste').dataset.invalid)return {error:'Resultatets pointfordeling passer ikke til prøven.'};
  let parsed=parseReading($('#readingPaste').value).rows,cats=t.categories.length?t.categories:parsed.map((x,i)=>({id:'new-'+i,max:x.max,name:'Tekst '+(i+1)}));
  if(!cats.length)return {error:'Indsæt først et resultat fra Alinea.'};
  let errors={},blanks={};
  for(let c of cats){
    let b=document.querySelector(`[data-blank="${c.id}"]`),r=document.querySelector(`[data-right="${c.id}"]`);
    if(!b||!r||b.value.trim()===''||r.value.trim()==='')return {error:'Udfyld både blanke og rigtige svar for hver tekst.'};
    let blank=Number(b.value),right=Number(r.value);
    if(!Number.isInteger(blank)||!Number.isInteger(right)||blank<0||right<0||blank+right>c.max)return {error:'Kontrollér antallet af blanke og rigtige svar.'};
    blanks[c.id]=blank;errors[c.id]=c.max-right;
  }
  let duration=($('#resultDuration')||$('#readingDuration')).value.trim();
  if(duration&&!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(duration))return {error:'Skriv tidsforbrug som mm:ss, fx 26:37.'};
  return {status:'',errors,blanks,duration,takenDate:$('#readingDateTaken').value||t.date,categories:cats};
}
function updateReadingPreview(){
  let e=$('#readingPreview'),r=readReading();
  if(r.error){e.innerHTML=`<p class="hint">${esc(r.error)}</p>`;return}
  if(r.status){e.innerHTML='<p class="hint">'+esc(statusLabel(r.status))+' registreres uden point eller karakter.</p>';return}
  let max=r.categories.reduce((a,c)=>a+c.max,0),errors=Object.values(r.errors).reduce((a,b)=>a+b,0),blanks=Object.values(r.blanks).reduce((a,b)=>a+b,0),correct=max-errors;
  e.innerHTML=`<div class="subtlebox"><strong>${correct}/${max} rigtige · ${errors-blanks} forkerte · ${blanks} blanke · ${pct(correct/max*100)}</strong></div>`;
}
function saveReading(next){
  let data=readReading();if(data.error)return alert(data.error);
  let t=testBy(selectedTest);
  if(!data.status&&!t.categories.length){
    if(!confirm('Opret denne prøves '+data.categories.length+' tekster med pointfordelingen '+data.categories.map(c=>c.max).join(', ')+'?'))return;
    t.categories=data.categories.map((c,i)=>({id:uid(),name:'Tekst '+(i+1),max:c.max}));
    data.errors=Object.fromEntries(t.categories.map((c,i)=>[c.id,data.errors['new-'+i]]));
    data.blanks=Object.fromEntries(t.categories.map((c,i)=>[c.id,data.blanks['new-'+i]]));
  }
  delete data.categories;
  let old=resultOf(selectedStudent,selectedTest);
  if(old)Object.assign(old,data);else db.results.push({id:uid(),sessionId:selectedSession,studentId:selectedStudent,testId:selectedTest,...data});
  if(!save())return;
  toast('Læseprøven er gemt');
  if(next){let ss=students(),i=ss.findIndex(s=>s.id===selectedStudent);if(ss[i+1])selectedStudent=ss[i+1].id}
  render();if(next)$('#readingPaste')?.focus();
}
const originalStudentDetails=studentDetails;
studentDetails=function(){
  let html=originalStudentDetails(),s=studentBy(selectedStudent);
  if(!s)return html;
  let rr=results().filter(r=>r.studentId===s.id).sort((a,b)=>(testBy(b.testId)?.date||'').localeCompare(testBy(a.testId)?.date||''));
  let cards=rr.map(r=>resultCard(r)).join('');
  // Resultatkortene er den detaljerede prøveoversigt; det samlede diagram står øverst.
  return html+`<div class="divider"></div><h3>Resultatkort – hver prøve</h3>${cards||'<p class="hint">Ingen prøver registreret endnu.</p>'}`;
};
function resultCard(r){
  let t=testBy(r.testId);if(!t)return '';
  if(r.status)return `<details class="result-card"><summary>${esc(t.name)} · ${esc(statusLabel(r.status))}</summary><p>${r.status==='TEKNISK_FEJL'?'Resultatet er gået tabt ved en teknisk fejl. Prøven skal ikke aflægges igen, og registreringen indgår ikke i statistikken.':'Eleven mangler at gennemføre prøven.'}</p></details>`;
  let c=computed(r);if(!c)return '';
  let blank=kindOf(t)==='reading'?Object.values(r.blanks||{}).reduce((a,b)=>a+Number(b||0),0):0;
  let wrong=c.errors-blank,correct=c.correct,max=c.max;
  let segment=(n,color)=>n>0?`<span style="background:${color};flex:${n}"></span>`:'';
  let parts=t.categories.map((cat,i)=>{
    let errors=Number(r.errors?.[cat.id]||0),b=kindOf(t)==='reading'?Number(r.blanks?.[cat.id]||0):0,right=cat.max-errors;
    return `<div class="result-segment-row"><span>${kindOf(t)==='reading'?'Tekst '+(i+1):esc(cat.name)}</span><div class="segbar">${segment(right,'#29956c')}${segment(errors-b,'#db9347')}${segment(b,'#b6becb')}</div><strong>${right}/${cat.max}</strong></div>`;
  }).join('');
  return `<details class="result-card"><summary><strong>${esc(t.name)}</strong> <span>${esc(r.takenDate||t.date||'')} · ${correct}/${max} · ${pct(c.percent)} · Karakter ${esc(c.grade??'—')}</span></summary>
  <div class="result-card-body"><div class="result-metrics"><div><strong>${correct}</strong><small>Rigtige</small></div><div><strong>${wrong}</strong><small>Forkerte</small></div><div><strong>${kindOf(t)==='reading'?blank:pct(c.percent)}</strong><small>${kindOf(t)==='reading'?'Blanke':'Rigtighed'}</small></div></div>
  <div class="segbar mainbar">${segment(correct,'#29956c')}${segment(wrong,'#db9347')}${segment(blank,'#b6becb')}</div>
  ${parts}<div class="result-legend"><span>🟩 Rigtige</span><span>🟧 Forkerte</span>${kindOf(t)==='reading'?'<span>⬜ Blanke</span>':''}</div></div></details>`;
}
const originalRenderOverview=renderOverview;
renderOverview=function(){return originalRenderOverview().replace('Retskrivningstrackeren','Prøvetrackeren')};


// Prøvevilkår er daterede elevindstillinger. Resultater gemmer et uforanderligt
// øjebliksbillede af de vilkår, der gjaldt, da resultatet blev registreret.
const allowedMinutes=(kind,special)=>kind==='reading'?(special?45:30):(special?90:60);
function termsOn(student,date){
  let history=(student?.conditionsHistory||[]).filter(h=>/^\d{4}-\d{2}-\d{2}$/.test(h.from)&&h.from<=date).sort((a,b)=>a.from.localeCompare(b.from));
  return history.length?!!history[history.length-1].special:false;
}
function timeSnapshot(sid,tid,date,special){let t=testBy(tid);return {specialConditions:!!special,allowedMinutes:allowedMinutes(kindOf(t),special),conditionsDate:date||t?.date||today()}}
function defaultTimeSnapshot(sid,tid,date){let d=date||testBy(tid)?.date||today();return timeSnapshot(sid,tid,d,termsOn(studentBy(sid),d))}
function snapshotPreviousResults(){
  // Backfill før en elevs historik ændres. Eksisterende prøver må ikke omskrives.
  db.results.forEach(r=>{if(!r.allowedMinutes){let snap=defaultTimeSnapshot(r.studentId,r.testId,r.takenDate||testBy(r.testId)?.date);Object.assign(r,snap)}});
}
function showConditions(){
  let ss=students();if(!ss.length)return alert('Tilføj først elever til klassen.');
  modal('Prøvevilkår for klassen',`<p class="hint">Markér elever med særlige prøvevilkår, og vælg den dato, ændringen gælder fra. Tidligere gemte prøver ændres ikke. Registrér kun vilkår – ikke diagnoser eller begrundelser.</p>
    <div class="field"><label>Ændringen gælder fra</label><input id="termsEffective" type="date" value="${today()}"></div>
    <div class="terms-roster">${ss.map(st=>`<label class="terms-roster-row"><span>${esc(st.name)}</span><input type="checkbox" data-term-student="${st.id}" ${termsOn(st,today())?'checked':''}><span class="hint">Særlige vilkår</span></label>`).join('')}</div>
    <p class="hint">Sæt datoen først. Markeringerne viser vilkårene på den valgte dato. Gem kun de ændringer, du ønsker fra denne dato.</p>`,()=>{
      let date=$('#termsEffective').value;if(!date)return alert('Vælg en ikrafttrædelsesdato.');
      let changes=[];document.querySelectorAll('[data-term-student]').forEach(el=>{
        let st=studentBy(el.dataset.termStudent),newValue=el.checked,oldValue=termsOn(st,date);
        if(newValue!==oldValue)changes.push({st,newValue});
      });
      if(!changes.length){$('#modal').remove();toast('Ingen ændringer i prøvevilkår');return}
      snapshotPreviousResults();
      changes.forEach(({st,newValue})=>{
        st.conditionsHistory=(st.conditionsHistory||[]).filter(h=>h.from!==date);
        st.conditionsHistory.push({from:date,special:newValue});
        st.conditionsHistory.sort((a,b)=>a.from.localeCompare(b.from));
      });
      if(!save())return;$('#modal').remove();render();toast('Prøvevilkårene er opdateret fra '+date);
    },'Gem prøvevilkår');
  const effective=$('#termsEffective');
  effective.onchange=()=>{document.querySelectorAll('[data-term-student]').forEach(el=>{el.checked=termsOn(studentBy(el.dataset.termStudent),effective.value)})};
}
const previousAction=action;
action=function(a,id){if(a==='student-conditions')return showConditions();return previousAction(a,id)};
const previousRenderStudents=renderStudents;
renderStudents=function(){return previousRenderStudents().replace('Vælg en elev for at se alle prøver i skoleåret.','Vælg en elev for at se alle prøver i skoleåret.').replace('id="studentPicker"', 'id="studentPicker"') .replace('<div id="studentDetails">','<div class="terms-action"><button class="btn outline" data-action="student-conditions">⚙ Prøvevilkår for klassen</button></div><div id="studentDetails">')};
const previousRenderClasses=renderClasses;
renderClasses=function(){return previousRenderClasses()+ (students().length?`<div class="card"><h2>Prøvevilkår</h2><p class="hint">Registrér elever med særlige vilkår fra en bestemt dato. Vilkårene bruges automatisk ved nye resultater.</p><button class="btn soft" data-action="student-conditions">Administrer prøvevilkår</button></div>`:'')};
function secondsFromTime(value){
  if(!value)return null;let a=value.trim().split(':');if(a.length<2||a.length>3||a.some(v=>!/^\d+$/.test(v)))return NaN;
  let n=a.map(Number);if(n[n.length-1]>59||(a.length===3&&n[1]>59))return NaN;
  return a.length===2?n[0]*60+n[1]:n[0]*3600+n[1]*60+n[2];
}
function formatSeconds(sec){if(!Number.isFinite(sec))return '—';let h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`}
function currentTimeFields(){
  let t=testBy(selectedTest),r=resultOf(selectedStudent,selectedTest),date=$('#readingDateTaken')?.value||$('#entryTakenDate')?.value||t?.date||today();
  let special=r?.specialConditions!==undefined?!!r.specialConditions:(r?false:termsOn(studentBy(selectedStudent),date));
  let minutes=r?.allowedMinutes||allowedMinutes(kindOf(t),special);
  return {date,special,minutes};
}
function timeFieldsMarkup(){
  let r=resultOf(selectedStudent,selectedTest),info=currentTimeFields(),duration=r?.duration||'';
  return `<div class="time-settings"><h3>Tid og prøvevilkår</h3><div class="formgrid">
    <div class="field"><label>Prøvevilkår</label><select id="resultConditions"><option value="regular" ${!info.special?'selected':''}>Ordinær tid</option><option value="special" ${info.special?'selected':''}>Særlige vilkår</option></select></div>
    <div class="field"><label>Faktisk tidsforbrug (mm:ss eller tt:mm:ss)</label><input id="resultDuration" value="${esc(duration)}" placeholder="26:37"></div>
  </div><div id="timeAllowance" class="hint">Tilladt prøvetid: ${info.minutes} minutter.</div><p class="hint">Prøvevilkårene foreslås automatisk ud fra elevens historik på prøvedatoen. Du kan ændre dem for netop denne prøve.</p></div>`;
}
function appendTimeFields(html){
  if(!selectedStudent||!selectedTest||!testBy(selectedTest))return html;
  // Registreringsformularerne har hver sin struktur, men samme tidsfelter.
  let section=timeFieldsMarkup();
  if(activeKind==='reading'){
    // Reading already has a legacy duration field; replace it with shared fields.
    html=html.replace(/<div class="field"><label>Tidsforbrug \(mm:ss\)<\/label><input id="readingDuration"[^>]*><\/div>/,'');
    return html.replace('<div id="readingFeedback"',section+'<div id="readingFeedback"');
  }
  if(html.includes('id="entryTakenDate"'))return html.replace('<div id="entryPreview"',section+'<div id="entryPreview"');
  return html;
}
const beforeTimeRenderEntry=renderEntry;
renderEntry=function(){return appendTimeFields(beforeTimeRenderEntry())};
function refreshTimeAllowance(){
  let el=$('#timeAllowance');if(!el)return;
  let special=$('#resultConditions').value==='special',kind=kindOf(testBy(selectedTest));
  el.textContent=`Tilladt prøvetid: ${allowedMinutes(kind,special)} minutter.`;
}
function syncTimeOnDate(){
  let el=$('#resultConditions'),r=resultOf(selectedStudent,selectedTest);if(!el||r?.allowedMinutes)return;
  let date=$('#readingDateTaken')?.value||$('#entryTakenDate')?.value||testBy(selectedTest)?.date||today();
  el.value=termsOn(studentBy(selectedStudent),date)?'special':'regular';refreshTimeAllowance();
}
function bindTimeFields(){
  let el=$('#resultConditions');if(!el)return;
  el.onchange=refreshTimeAllowance;
  let date=$('#readingDateTaken')||$('#entryTakenDate');if(date)date.addEventListener('change',syncTimeOnDate);
  let paste=$('#readingPaste');if(paste)paste.addEventListener('input',()=>{
    let duration=parseReading(paste.value).duration;
    if(duration&&$('#resultDuration')&&!$('#resultDuration').value)$('#resultDuration').value=duration;
  });
}
const beforeTimeBind=bind;
bind=function(){beforeTimeBind();if(page==='entry')bindTimeFields()};
function timeData(){
  let special=$('#resultConditions')?.value==='special',duration=$('#resultDuration')?.value.trim()||'';
  let secs=secondsFromTime(duration);
  if(!Number.isFinite(secs)&&duration)return {error:'Kontrollér tidsforbruget. Brug mm:ss eller tt:mm:ss.'};
  let date=$('#readingDateTaken')?.value||$('#entryTakenDate')?.value||testBy(selectedTest)?.date||today();
  return {...timeSnapshot(selectedStudent,selectedTest,date,special),duration};
}
const previousReadEntry=readEntry;
readEntry=function(){let d=previousReadEntry();if(d.error||!$('#resultConditions'))return d;let time=timeData();return time.error?time:{...d,...time}};
const previousReadReading=readReading;
readReading=function(){let d=previousReadReading();if(d.error||!$('#resultConditions'))return d;let time=timeData();return time.error?time:{...d,...time}};
const previousResultCard=resultCard;
resultCard=function(r){
  let html=previousResultCard(r);if(r.status||!computed(r))return html;
  let t=testBy(r.testId),date=r.takenDate||t?.date||today();
  let special=r.specialConditions!==undefined?!!r.specialConditions:false;
  let limit=r.allowedMinutes||allowedMinutes(kindOf(t),special),spent=secondsFromTime(r.duration||'');
  let label=special?'Særlige vilkår':'Ordinær tid';
  let timeInfo=`<div class="time-result"><strong>Tidsforbrug</strong><span>${Number.isFinite(spent)?formatSeconds(spent):'Ikke registreret'} af ${limit}:00 · ${label}</span>`;
  if(Number.isFinite(spent)){
    let fraction=spent/(limit*60),remaining=limit*60-spent;
    timeInfo+=`<div class="time-progress"><span style="width:${Math.min(100,Math.max(0,fraction*100))}%"></span></div><small>${fmt(fraction*100)} % af prøvetiden anvendt · ${remaining>=0?formatSeconds(remaining)+' tilbage':formatSeconds(-remaining)+' over tidsgrænsen'}</small>`;
  }
  timeInfo+='</div>';
  return html.replace('<div class="segbar mainbar">',timeInfo+'<div class="segbar mainbar">');
};
// Nye skoleår arver prøvevilkår, men ikke resultater. Gamle historikdatoer bevares.
const previousPromote=promote;
promote=function(id){
  // Lad den eksisterende oprykningsdialog oprette eleverne; kopiér derefter historikken.
  let old=db.sessions.find(s=>s.id===id);previousPromote(id);
  let saveButton=$('#modalSave');if(!saveButton||!old)return;
  let previousClick=saveButton.onclick;
  saveButton.onclick=()=>{
    let before=new Set(db.sessions.map(s=>s.id));previousClick();
    let newSession=db.sessions.find(s=>!before.has(s.id));if(!newSession)return;
    db.students.filter(s=>s.sessionId===newSession.id).forEach(st=>{
      let original=db.students.find(x=>x.id===st.previousStudentId);
      if(original?.conditionsHistory)st.conditionsHistory=original.conditionsHistory.map(x=>({...x}));
    });save();
  };
};

$('#sessionPicker').onchange=e=>{if(!canLeave()){e.target.value=selectedSession;return}selectedSession=e.target.value;selectedStudent='';selectedTest='';render()};$('#addSessionTop').onclick=newSession;render();

// Fraværshuskeliste: vis kun parentes når samtlige elever er registreret,
// men en eller flere endnu ikke har gennemført prøven.
function registrationSummary(t){
  const rr=results().filter(r=>r.testId===t.id);
  const count=rr.length, total=students().length;
  const missing=students().filter(s=>{
    const r=rr.find(x=>x.studentId===s.id);
    return r && isAbsentStatus(r.status);
  });
  const summary=`${count}/${total}`;
  if(count!==total||!missing.length)return summary;
  return `${summary} <button type="button" class="absent-count" data-absent-test="${esc(t.id)}" title="Se elever, der mangler prøven" aria-label="Vis ${missing.length} fraværende elever">(${missing.length})</button>`;
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-absent-test]');
  if(!b)return;
  const t=testBy(b.dataset.absentTest);
  if(!t)return;
  const missing=students().filter(s=>isAbsentStatus(resultOf(s.id,t.id)?.status));
  if(!missing.length)return;
  alert('Mangler at gennemføre '+t.name+':\n\n'+missing.map(s=>'• '+s.name).join('\n'));
});

function isAbsentStatus(status){return ['FRAVÆR','SYG','EID'].includes(status)}
function statusLabel(status){return status==='TEKNISK_FEJL'?'Teknisk fejl':isAbsentStatus(status)?'Fraværende':status||'Gennemført'}

// Faste, kontrasterende farver på tværs af prøver og elever.
function categoryColor(key){
 const name=String(key||'').toLocaleLowerCase('da').trim();
 const fixed=[
  [/indsæt|indsaet|diktat/,'#DC2626'],
  [/komma|tegnsæt/,'#EAB308'],
  [/rigtig form/,'#16A34A'],
  [/ordklass/,'#9333EA'],
  [/ret tekst/,'#0891B2'],
  [/datid|nutid/,'#EC4899'],
  [/grammatisk/,'#7a55ce'],
  [/ét eller flere|et eller flere|sammensæt/,'#8a5b35']
 ];
 for(const [pattern,color] of fixed)if(pattern.test(name))return color;
 const palette=['#b62b68','#0c7d72','#7552bd','#9c5b12','#477a19','#b04427','#3765b5','#8c377c','#008b93','#805b26'];
 let hash=2166136261;for(const ch of name){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619)}
 return palette[(hash>>>0)%palette.length];
}

// Tidsforbrug i diagrammets blå søjler og elevens prøvehistorik.
// Brug gemt prøvevilkårs-snapshot; ældre resultater uden snapshot får
// ordinær tidsgrænse, men ingen opdigtet faktisk tid.
function timeDetailsForResult(r,t){
  if(!r||r.status||!computed(r))return null;
  const limit=Number(r.allowedMinutes)||allowedMinutes(kindOf(t),!!r.specialConditions);
  const spent=secondsFromTime(r.duration||'');
  return {limit,spent,valid:Number.isFinite(spent)&&spent!==null};
}
function historyTimeLabel(r,t){
  const d=timeDetailsForResult(r,t);
  if(!d)return '—';
  return d.valid?`${formatSeconds(d.spent)} / ${d.limit}:00`:'Tid ikke registreret';
}
function chartTimeTooltip(r,t){
  const d=timeDetailsForResult(r,t);
  if(!d||!d.valid)return 'Tid ikke registreret';
  const remaining=d.limit*60-d.spent;
  return `Tid brugt: ${formatSeconds(d.spent)} · Tid til rådighed: ${d.limit}:00 · ${remaining>=0?'Tid tilbage: '+formatSeconds(remaining):'Over tidsgrænsen: '+formatSeconds(-remaining)} · ${fmt(d.spent/(d.limit*60)*100)} % af prøvetiden brugt`;
}

// Sammenligninger i elevoversigten. Udelad fravær og tekniske fejl.
function classTestAverage(testId,field){
 const values=results().filter(r=>r.testId===testId).map(r=>computed(r)?.[field]).filter(Number.isFinite);
 return values.length?values.reduce((a,b)=>a+b,0)/values.length:NaN;
}
function classCategoryErrorRate(categoryName){
 const key=alias(categoryName);let errors=0,max=0;
 for(const r of results()){
  if(!computed(r))continue;
  const t=testBy(r.testId);if(!t)continue;
  for(const c of t.categories||[]){
   if(alias(c.name)!==key||!c.max)continue;
   const e=r.errors?.[c.id];if(e===undefined||e===null||e==='')continue;
   errors+=Number(e);max+=Number(c.max);
  }
 }
 return max?errors/max*100:NaN;
}
function comparisonCell(value,average,isPercent,isError,display){
 if(!Number.isFinite(value))return '—';
 const diff=value-average;
 const tone=!Number.isFinite(average)||Math.abs(diff)<1e-9?'neutral':((isError?-diff:diff)>0?'better':'worse');
 const own=display!==undefined&&display!==null?String(display):(isPercent||isError?pct(value):String(value));
 const avg=Number.isFinite(average)?` <span class="class-average">(klasse: ${average.toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:2})}${isPercent||isError?' %':''})</span>`:'';
 return `<span class="student-comparison ${tone}">${esc(own)}</span>${avg}`;
}
