/* Uses the existing IndexedDB/journal write path; never starts synchronization. */
(function(root) {
  'use strict';
  const B=root.LeefkeServiceBook, $=s=>document.querySelector(s);
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>dateInputValue();
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(label,fn)=>{const n=el('button',label);n.type='button';n.onclick=fn;return n;};
  const safeRun=async(fn,out)=>{try{await fn();}catch(error){out.textContent=error.message;out.setAttribute('role','alert');}};
  let mounted=false;
  function modal(title) {
    const d=el('dialog',undefined,'service-dialog');d.setAttribute('aria-label',title);
    const h=el('h2',title),content=el('div'),msg=el('p','','service-message');msg.setAttribute('role','status');
    d.append(h,content,msg);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();return {d,content,msg};
  }
  function field(parent,label,type,value='') {const l=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value??'';if(type==='number'){input.min='0';input.step='any';}l.append(input);parent.append(l);return input;}
  function currentTasks(){return B.dueItems(allState.safety||[],allState.maintenance||[],today(),getSettings().currentEngineHours);}
  function badge(status){return el('span',['Angaben fehlen','In Ordnung','Demnächst','Dringend','Fällig / Mangel'][status.severity],`service-badge ${status.tone}`);}
  function mount(){
    if(mounted)return;mounted=true;
    $('#newInspection').onclick=()=>openInspection();
    $('#serviceNewDeadline').onclick=()=>editDeadline();
    // Preserve the proven legacy single-work form, with explicit task matching.
    const form=$('#maintenanceForm');
    const label=el('label','Zugehöriger Prüfpunkt (optional)','wide');const select=el('select');select.name='serviceTask';label.append(select);form.insertBefore(label,form.firstChild);
    const refreshOptions=()=>{const value=select.value;select.replaceChildren(new Option('Freier Wartungseintrag',''));B.definitions(allState.safety||[]).filter(t=>t.id!=='service:annual').forEach(t=>select.add(new Option(t.name,t.id)));select.value=value;};
    refreshOptions();select.onfocus=refreshOptions;
    form.elements.engineHours.closest('label').firstChild.textContent='Motorstunden (optional)';
    const old=form.onsubmit;
    form.onsubmit=async e=>{if(select.value){form.elements.intervalDays.value='';form.elements.intervalHours.value='';}return old(e);};
    $('#newMaintenanceEntryButton').textContent='Einzelne Wartung eintragen';
  }
  function renderMaintenance(){
    mount();const list=$('#inspectionList');list.replaceChildren();
    const inspections=(state.maintenance||[]).filter(x=>x.kind==='inspection');
    for(const entry of inspections){const p=B.progress(entry),card=el('article',undefined,'card service-history');card.append(el('h3',`Inspektion ${fmtDate(entry.date)}`));card.append(el('p',entry.closedAt?(p.defects?'Prüfung beendet – Mängel dokumentiert':'Abgeschlossen'):`In Bearbeitung · ${p.total-p.open} von ${p.total} Punkten bearbeitet`));if(p.defects)card.append(el('p',`${p.defects} dokumentierte Mängel; aktueller Stand unter Fristen.`,'meta'));card.append(button(entry.closedAt?'Protokoll ansehen':'Fortsetzen',()=>openInspection(entry)),button('Bericht drucken / als PDF speichern',()=>report(entry)));list.append(card);}
    if(!inspections.length)list.append(el('p','Noch keine Jahresinspektion dokumentiert.','muted'));
  }
  function renderDeadlines(){
    const list=$('#serviceDeadlineList');if(!list)return;list.replaceChildren();
    const filter=$('#serviceDeadlineFilter');filter.onchange=renderDeadlines;
    const tasks=currentTasks().filter(t=>filter.value!=='urgent'||t.status.severity>=2);
    const groups=new Map();
    for(const [severity,label] of [[0,'Angaben ergänzen'],[1,'Nicht demnächst fällig']]){const count=tasks.filter(t=>t.status.severity===severity).length;if(count){const details=el('details',undefined,'service-group');details.append(el('summary',label+' ('+count+')'));groups.set(severity,details);}}
    for(const task of tasks){const card=el('article',undefined,'card service-deadline');card.append(badge(task.status),el('h3',task.name),el('p',task.status.label));const details=el('details');details.append(el('summary','Details'));if(task.note)details.append(el('p',task.note));details.append(el('p',task.source||'Eigene Frist','meta'));if(task.lastCheck)details.append(el('p','Zuletzt: '+fmtDate(task.lastCheck)));if(task.dueDate)details.append(el('p','Fällig: '+fmtDate(task.dueDate)));if(task.months||task.hours)details.append(el('p',[task.months?`${task.months} Monate`:'',task.hours?`${task.hours} Motorstunden`:''].filter(Boolean).join(' oder ')+' – zuerst erreichte Grenze'));
      const actions=el('div',undefined,'actions');
      if(task.id==='service:annual')actions.append(button('Inspektion beginnen / fortsetzen',()=>openInspection()));
      else if(task.legacyId)actions.append(button('Alten Eintrag zuordnen',()=>{view('maintenance');editItem('maintenance',task.legacyId);}));
      else actions.append(button(task.defect?'Nacharbeit dokumentieren':'Erledigung erfassen',()=>completeTask(task)));
      if(!task.legacyId&&!task.defect)actions.append(button('Frist bearbeiten',()=>editDeadline(task)));
      details.append(actions);card.append(details);(groups.get(task.status.severity)||list).append(card);
    }
    for(const group of groups.values())list.append(group);
    if(!tasks.length)list.append(el('p','Keine anstehenden Fristen.'));
  }
  function openInspection(existing){
    const pending=(allState.maintenance||[]).find(x=>x.kind==='inspection'&&!x.closedAt);
    const record=JSON.parse(JSON.stringify(existing||pending||B.newInspection(uid(),today(),getSettings().boatName||'Leefke')));
    let baseRecord=existing||pending||null;
    if(!baseRecord){const extra=currentTasks().filter(t=>B.EXTRA.some(e=>e.id===t.id)&&t.status.severity>=2);record.items.push(...extra.map(t=>({...t,group:'Zusätzliche fällige Arbeiten',status:'open',note:''})));}
    const locked=Boolean(record.closedAt),{d,content,msg}=modal(locked?'Inspektionsprotokoll':'Jahresinspektion');
    content.append(el('p',`${record.boatName} · ${record.engine} · ${record.gearbox}`,'meta'));
    const form=el('form',undefined,'service-form');content.append(form);
    const date=field(form,'Datum','date',record.date);date.required=true;
    const hours=field(form,'Motorstunden (optional)','number',record.engineHours);
    const by=field(form,'Ausgeführt durch / Werkstatt (optional)','text',record.performedBy);
    const progress=el('p','','service-progress');form.append(progress);
    const groups=new Map(),rows=[];
    for(const item of record.items){let group=groups.get(item.group);if(!group){group=el('details',undefined,'service-group');group.append(el('summary',item.group));groups.set(item.group,group);form.append(group);}
      const row=el('div',undefined,'service-check');row.append(el('strong',item.name));const select=el('select');select.setAttribute('aria-label',item.name);
      for(const [value,label] of Object.entries(B.LABELS))if((value!=='ok'||item.action==='check')&&(value!=='na'||item.action!=='replace'))select.add(new Option(label,value));select.value=item.status||'open';row.append(select);
      const note=field(row,'Bemerkung / Messwert / Begründung','textarea',item.note);note.rows=2;
      select.onchange=()=>{item.status=select.value;update();};note.oninput=()=>{item.note=note.value;update();};rows.push({select,note});group.append(row);
    }
    function update(){const p=B.progress(record);progress.textContent=`${p.total-p.open} von ${p.total} bearbeitet · ${p.open} offen · ${p.defects} Mängel`;}
    update();
    const extras=el('details');extras.append(el('summary','Notizen, Material, Kosten und Belege (optional)'));
    const note=field(extras,'Zusammenfassung / Material','textarea',record.note);note.rows=3;const cost=field(extras,'Kosten gesamt (€)','number',record.cost);
    const docs=el('div');extras.append(docs);function renderDocs(){docs.replaceChildren();(allState.documents||[]).filter(x=>x.inspectionId===record.id).forEach(x=>docs.append(el('p',x.fileName||x.name||'Beleg')));}renderDocs();
    if(!locked){const file=field(extras,'Foto oder PDF-Beleg hinzufügen','file');file.accept='image/*,application/pdf';file.onchange=async()=>{if(saving)return;saving=true;file.disabled=true;actions.querySelectorAll('button').forEach(b=>b.disabled=true);await safeRun(async()=>{const f=file.files[0];if(!f)return;if(f.size>15e6)throw Error('Bitte eine Datei unter 15 MB wählen.');const data=f.type.startsWith('image/')?await compressImage(f,1600,.8):await blobToDataUrl(f);await persist(false);const attachment={id:uid(),inspectionId:record.id,name:f.name,title:f.name,category:'Inspektion',date:record.date,created:Date.now(),fileName:f.name,mimeType:data.slice(5,data.indexOf(';')),data,size:f.size};await put('documents',attachment);await refresh();renderDocs();file.value='';msg.textContent='Beleg lokal gespeichert.';},msg);saving=false;file.disabled=false;actions.querySelectorAll('button').forEach(b=>b.disabled=false);};}
    form.append(extras);if(locked)form.querySelectorAll('input,textarea,select').forEach(n=>n.disabled=true);
    const actions=el('div',undefined,'actions service-actions');content.append(actions);
    function collect(){Object.assign(record,{date:date.value,engineHours:hours.value===''?'':Number(hours.value),performedBy:by.value,note:note.value,cost:cost.value});return record;}
    let saving=false;
    async function persist(close){
      collect();B.validate(record,close);
      const value=JSON.parse(JSON.stringify({...record,...(close?{closedAt:new Date().toISOString(),done:true,deadlineDefinitions:allState.safety||[]}:{})}));
      const stored=await getOne('maintenance',record.id);
      if(stored&&(stored.closedAt||stored._updatedAt!==baseRecord?._updatedAt))throw Error('Der Eintrag wurde inzwischen geändert. Bitte erneut öffnen.');
      await put('maintenance',value);baseRecord=await getOne('maintenance',record.id);return value;
    }
    async function save(close){if(saving)return;saving=true;actions.querySelectorAll('button').forEach(b=>b.disabled=true);await safeRun(async()=>{if(!form.reportValidity())return;await persist(close);await refresh();d.close();toast(close?'Inspektion abgeschlossen':'Zwischenstand gespeichert');},msg);saving=false;actions.querySelectorAll('button').forEach(b=>b.disabled=false);}
    if(!locked)actions.append(button('Zwischenstand speichern',()=>save(false)),button('Inspektion abschließen',()=>save(true)));
    actions.append(button('Bericht / PDF',()=>{collect();report(record);}),button(locked?'Schließen':'Speichern und schließen',()=>locked?d.close():save(false)));
    if(!locked)d.addEventListener('cancel',e=>{e.preventDefault();save(false);});
    form.onsubmit=e=>{e.preventDefault();save(false);};
  }
  function completeTask(task){
    const {d,content,msg}=modal(task.defect?'Nacharbeit dokumentieren':'Erledigung erfassen'),form=el('form',undefined,'service-form');content.append(el('p',task.name),form);
    const date=field(form,'Durchgeführt am','date',today());date.required=true;
    const hours=task.clock==='date'||(!task.hours&&!task.defect)?null:field(form,'Motorstunden (optional)','number');
    const note=field(form,'Was wurde gemacht?','textarea');if(task.defect)note.required=true;
    const actions=el('div',undefined,'actions');const save=button('Erledigung speichern',()=>form.requestSubmit());actions.append(save,button('Abbrechen',()=>d.close()));content.append(actions);
    form.onsubmit=e=>{e.preventDefault();save.disabled=true;safeRun(async()=>{const record={id:uid(),kind:'service',serviceTask:task.defect?task.serviceTask:task.id,resolvesDefect:task.defect?task.id:'',date:date.value,title:task.name,engineHours:hours?.value||'',category:'Wartung',note:note.value,done:true,created:Date.now()};B.validate(record);await put('maintenance',record);await refresh();d.close();},msg).finally(()=>save.disabled=false);};
  }
  function editDeadline(task){
    const existing=task?(allState.safety||[]).find(x=>(x.serviceDefinitionId||x.id)===task.id):null;
    const {d,content,msg}=modal('Frist bearbeiten'),form=el('form',undefined,'service-form');content.append(form);
    const name=field(form,'Artikel / Prüfung','text',task?.name);name.required=true;
    const clockLabel=el('label','Fristenart'),clock=el('select');clock.add(new Option('Nur Zeitraum / Datum','date'));clock.add(new Option('Zeitraum oder Motorstunden','both'));clock.add(new Option('Nur Motorstunden','hours'));clock.value=task?.hours?(task?.months?'both':'hours'):'date';clockLabel.append(clock);form.append(clockLabel);
    const months=field(form,'Intervall in Kalendermonaten','number',task?.months||'');months.step='1';
    const last=field(form,'Letzte Durchführung','date',task?.lastCheck);
    const due=field(form,'Fester nächster Termin (optional)','date',task?.overrideEventId===task?.latestEventId?(task?.manualDueDate||''):(!task?.latestEventId?existing?.dueDate||'':''));
    const ih=field(form,'Intervall in Motorstunden (optional)','number',task?.hours||'');
    const lh=field(form,'Stunden bei letzter Durchführung (optional)','number',task?.lastHours??'');
    const dh=field(form,'Fällig bei Motorstunden (optional)','number',task?.overrideEventId===task?.latestEventId?(task?.manualDueHours??''):(!task?.latestEventId?existing?.dueHours??'':''));
    if(task?.latestEventId){last.disabled=true;lh.disabled=true;}
    if(task?.dueDate)form.append(el('p','Aktuell fällig: '+fmtDate(task.dueDate)+'. Ein fester Termin überschreibt die Berechnung bis zur nächsten Erledigung.','meta'));
    const note=field(form,'Notiz / Herstellerangabe','textarea',task?.note);
    const intervalDays=existing?.intervalDays; if(intervalDays&&!existing.intervalMonths)form.append(el('p',`Bestehendes Intervall: ${intervalDays} Tage. Es bleibt erhalten, bis ein Monatsintervall eingetragen wird.`,'meta'));
    const toggle=()=>{const onlyHours=clock.value==='hours';[months,last,due].forEach(n=>n.closest('label').hidden=onlyHours);[ih,lh,dh].forEach(n=>n.closest('label').hidden=clock.value==='date');};clock.onchange=toggle;toggle();
    if(task?.id==='service:annual'){clock.value='date';clock.disabled=true;months.value='12';months.disabled=true;toggle();}
    const save=button('Frist speichern',()=>form.requestSubmit());content.append(save,button('Abbrechen',()=>d.close()));
    form.onsubmit=e=>{e.preventDefault();save.disabled=true;safeRun(async()=>{const id=existing?.id||uid();const value={...(existing||{}),id,name:name.value,serviceDefinitionId:task?.id||'',clock:clock.value,intervalMonths:clock.value==='hours'?0:Number(months.value)||0,intervalDays:clock.value==='hours'||months.value?0:intervalDays||0,lastCheck:last.value,lastHours:clock.value==='date'?'':lh.value,intervalHours:clock.value==='date'?0:Number(ih.value)||0,overrideEventId:task?.latestEventId||'',manualDueDate:clock.value==='hours'?'':due.value,manualDueHours:clock.value==='date'?'':dh.value,dueDate:clock.value==='hours'?'':due.value,dueHours:clock.value==='date'?'':dh.value,note:note.value};await put('safety',value);await refresh();d.close();},msg).finally(()=>save.disabled=false);};
  }
  function report(record){
    const {d,content}=modal('Druckvorschau'),photos=field(content,'Fotos im Bericht einschließen','checkbox');photos.checked=false;
    const frame=el('iframe');frame.title='Inspektionsbericht A4';frame.className='service-report-frame';content.append(frame);
    const build=()=>{const p=B.progress(record),complete=Boolean(record.closedAt)&&p.complete;const docs=(allState.documents||[]).filter(x=>x.inspectionId===record.id);const next=B.dueItems(record.deadlineDefinitions||allState.safety||[],[record],record.date,record.engineHours).filter(x=>x.lastCheck===record.date&&x.dueDate);
      const schedules=new Map();for(const t of next){const key=t.dueDate+(t.dueHours!==''&&t.dueHours!=null?' oder '+t.dueHours+' h':'');if(!schedules.has(key))schedules.set(key,[]);schedules.get(key).push(t);}
      const nextText=[...schedules].map(([date,items])=>(items.some(t=>t.id==='service:annual')&&items.length>1?'Jahresinspektion und '+(items.length-1)+' Prüfpunkte':items.map(t=>t.name).join(', '))+': '+date).join('\n');
      frame.srcdoc=`<!doctype html><html lang="de"><meta charset="utf-8"><title>LEEFKE Inspektionsbericht</title><style>@page{size:A4;margin:16mm}body{font:11pt Arial,sans-serif;color:#142e3a;margin:20px}h1{font-size:20pt}h2{font-size:13pt;break-after:avoid}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #bbb;padding:5px;vertical-align:top;text-align:left;overflow-wrap:anywhere}tr,figure{break-inside:avoid}thead{display:table-header-group}th:nth-child(1){width:42%}th:nth-child(2){width:22%}img{max-width:100%;max-height:160mm}p{white-space:pre-wrap;overflow-wrap:anywhere}.status{border:2px solid #333;padding:10px}.sign{margin-top:35px;border-top:1px solid #555;padding-top:8px}@media print{body{margin:0}}</style><h1>Inspektionsbericht · ${escape(record.boatName)}</h1><p>${escape(record.engine)} · ${escape(record.gearbox)}<br>Datum: ${escape(record.date)} · Motorstunden: ${escape(record.engineHours===''||record.engineHours==null?'nicht erfasst':record.engineHours)}<br>Ausgeführt durch: ${escape(record.performedBy||'nicht angegeben')}</p><p class="status">${!complete?'Zwischenstand – Inspektion unvollständig':p.defects?'Prüfung beendet – Mängel dokumentiert':'Abgeschlossen – ohne dokumentierte Mängel'}<br>${p.total-p.open}/${p.total} Punkte bearbeitet · ${p.defects} Mängel</p>${[...new Set(record.items.map(x=>x.group))].map(group=>`<h2>${escape(group)}</h2><table><thead><tr><th>Prüfpunkt</th><th>Ergebnis</th><th>Bemerkung</th></tr></thead><tbody>${record.items.filter(x=>x.group===group).map(x=>`<tr><td>${escape(x.name)}</td><td>${escape(B.LABELS[x.status]||'Offen')}</td><td>${escape(x.note||'—')}</td></tr>`).join('')}</tbody></table>`).join('')}<h2>Bemerkungen / Material / Kosten</h2><p>${escape(record.note||'Keine zusätzlichen Angaben')}<br>Kosten: ${escape(record.cost||'nicht erfasst')}${record.cost?' €':''}</p><h2>Offene Nacharbeiten zum Berichtsstand</h2><p>${escape(record.items.filter(x=>x.status==='defect').map(x=>x.name+': '+x.note).join('\n')||'Keine dokumentiert')}</p>${complete?`<h2>Nächste Termine aus diesem Protokoll</h2><p>${escape(nextText)}</p>${record.engineHours===''?'<p>Stundengrenzen konnten ohne Motorstundenstand nicht berechnet werden.</p>':''}`:''}<h2>Belege</h2><p>${escape(docs.map(x=>x.fileName||x.name).join('\n')||'Keine Belege zugeordnet')}</p>${photos.checked?docs.filter(x=>/^data:image\/(jpeg|png|webp);base64,/.test(x.data||'')).map(x=>`<figure><img src="${escape(x.data)}" alt="${escape(x.name)}"><figcaption>${escape(x.name)}</figcaption></figure>`).join(''):''}<p>Prüfplan ${escape(record.templateVersion)} · ${escape(B.SOURCE)}. Ergänzende Eignerkontrollen laut LEEFKE-Grundlagen. Das Protokoll dokumentiert Angaben; es ersetzt keine fachliche Freigabe.</p><div class="sign">Ort, Datum und Unterschrift</div></html>`;
    };photos.onchange=build;build();content.append(button('Drucken / als PDF speichern',()=>{frame.contentWindow.focus();frame.contentWindow.print();}),button('Schließen',()=>d.close()));
  }
  let reminderDone=false;
  function startupReminder(){
    if(reminderDone)return;const due=currentTasks().filter(t=>t.status.severity>=2);if(!due.length){reminderDone=true;return;}
    if(document.querySelector('dialog[open]')){document.querySelectorAll('dialog[open]').forEach(d=>d.addEventListener('close',startupReminder,{once:true}));return;}
    reminderDone=true;const {d,content}=modal('Anstehende Prüfungen');d.id='serviceReminder';for(const t of due.slice(0,5))content.append(el('p',`${t.name} – ${t.status.label}`));if(due.length>5)content.append(el('p',`Weitere ${due.length-5} Fristen`));content.append(button('Fristen öffnen',()=>{d.close();view('deadlines');}),button('Schließen',()=>d.close()));
  }
  root.LeefkeServiceUI={renderMaintenance,renderDeadlines,openInspection,report,currentTasks,startupReminder};
  appReady.then(()=>{mount();renderMaintenance();renderDeadlines();startupReminder();}).catch(console.error);
})(globalThis);
