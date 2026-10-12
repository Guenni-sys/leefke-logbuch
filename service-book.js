/* Calendar-first maintenance rules. No storage, network or clock side effects. */
(function(root) {
  'use strict';
  const SOURCE = 'Perkins TPD1369G, Ausgabe 12, S. 20–21; PRM500 Werkstatthandbuch, Abschnitt 7';
  const TASKS = [
    ['engine-oil','Öle und Flüssigkeiten','Motoröl und Ölfilter erneuern',12,400,'replace'],
    ['gear-oil','Öle und Flüssigkeiten','PRM 500D2: Getriebeöl erneuern',12,400,'replace'],
    ['coolant-check','Öle und Flüssigkeiten','Kühlmittelstand, Frostschutz und Zustand prüfen',12,0,'check'],
    ['fuel-filters','Filter und Kraftstoff','Drei Dieselfilter: Einsätze erneuern',12,400,'replace'],
    ['fuel-water','Filter und Kraftstoff','Wasserabscheider und Fördersieb reinigen',12,400,'work'],
    ['air-filter','Filter und Kraftstoff','Luftfilter reinigen',12,400,'work'],
    ['impeller','Kühlung','Seewasserpumpen-Impeller prüfen',12,400,'check'],
    ['strainer','Kühlung','Seewassersieb prüfen und reinigen',12,400,'work'],
    ['exchanger','Kühlung','Wärmetauscher: Dichtheit und Kühlrohre prüfen/reinigen',12,400,'work'],
    ['gear-cooler','Kühlung','Getriebeölkühler und Anschlüsse prüfen/reinigen',12,0,'work'],
    ['belts','Motor und Antrieb','Riemenzustand und Spannung prüfen',12,400,'check'],
    ['hoses','Motor und Antrieb','Schläuche, Schellen und Anschlüsse prüfen',12,400,'check'],
    ['leaks','Motor und Antrieb','Öl-/Kühlmittellecks, Korrosion und Motorlager prüfen',12,0,'check'],
    ['damper','Motor und Antrieb','Kurbelwellendämpfer prüfen',12,400,'check'],
    ['shaft','Motor und Antrieb','Wellenanlage, Ausrichtung und Befestigungen prüfen',12,0,'check'],
    ['shift','Motor und Antrieb','Schaltung und Betätigung prüfen',12,0,'check'],
    ['steering','Hydraulik','Beide Steuerstände und Vetus-Hydraulik prüfen',12,0,'check'],
    ['thruster','Hydraulik','Bugstrahlruder: Ölzustand, Stand und Leitungen prüfen',12,0,'check'],
    ['electric','Elektrik und Probelauf','Batterieanschlüsse, Kabel und Ladung prüfen',12,0,'check'],
    ['alarm','Elektrik und Probelauf','Motorwarnsummer und Anzeigen prüfen',12,400,'check'],
    ['run','Elektrik und Probelauf','Probelauf: Temperatur, Öldruck, Kühlwasser und Dichtheit',12,0,'check']
  ].map(([id,group,name,months,hours,action])=>({id:'service:'+id,group,name,months,hours,action,source:['steering','thruster','electric','run','leaks'].includes(id)?'Jährliche Eignerkontrolle gemäß LEEFKE-Inspektionsplan':SOURCE}));
  const EXTRA = [
    {id:'service:breather',name:'Kurbelgehäuseentlüftung reinigen',hours:800,months:0,action:'work',source:SOURCE},
    {id:'service:valves',name:'Ventilspiel durch Fachbetrieb prüfen/einstellen',hours:2000,months:24,action:'work',source:SOURCE},
    {id:'service:injectors',name:'Einspritzdüsen durch Fachbetrieb prüfen',hours:2000,months:24,action:'check',source:SOURCE},
    {id:'service:coolant-replace',name:'Kühlmittel erneuern – Produktintervall festlegen',hours:0,months:0,action:'replace',source:'Kühlmittelprodukt und letzten Wechsel prüfen; kein pauschales Wechselintervall.'}
  ];
  const LABELS = {open:'Offen',ok:'Geprüft – in Ordnung',done:'Erledigt / erneuert',defect:'Mangel',na:'Nicht zutreffend'};
  const number = v => v == null || String(v).trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  const date = v => { if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return null;const d=new Date(v+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v?d:null; };
  function addMonths(value,months) {const d=date(value);if(!d)return '';const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+Number(months));const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));return d.toISOString().slice(0,10);}
  function addDays(value,days) {const d=date(value);if(!d)return '';d.setUTCDate(d.getUTCDate()+Number(days));return d.toISOString().slice(0,10);}
  function progress(record) {
    const rows=record.items||[];let open=0,defects=0;
    for(const row of rows){const status=row.status||'open';if(status==='defect')defects++;
      if(!LABELS[status]||status==='open'||(status==='na'&&row.action==='replace')||(['na','defect'].includes(status)&&!String(row.note||'').trim())||(row.action!=='check'&&status==='ok'))open++;
    }
    return {total:rows.length,open,defects,complete:rows.length>0&&open===0};
  }
  function status(task,today,currentHours) {
    const dd=date(task.dueDate), now=date(today), due=number(task.dueHours),current=number(currentHours);
    const days=dd&&now?Math.round((dd-now)/86400000):null;
    const hours=due!==null&&current!==null?due-current:null;
    let severity=0; const labels=[];
    if(days!==null){severity=days<=0?4:days<=7?3:days<=30?2:1;labels.push(days<0?`${-days} Tage überfällig`:days===0?'Heute fällig':`In ${days} Tagen`);}
    if(hours!==null){const interval=number(task.hours)||100;severity=Math.max(severity,hours<=0?4:hours<=interval*.1?3:hours<=interval*.2?2:1);labels.push(hours<0?`${Math.round(-hours*10)/10} h überfällig`:`Noch ${Math.round(hours*10)/10} h`);}
    const unknownHours=(number(task.hours)>0||due!==null)&&hours===null;
    const missingDate=number(task.months)>0&&!dd;
    if(unknownHours)labels.push('Stundengrenze nicht geprüft');
    if(missingDate)labels.push('Letzter Termin fehlt');
    if(severity<=1&&(unknownHours||missingDate))severity=0;
    if(task.status==='replace'){severity=4;labels.push('Als zu ersetzen markiert');}
    if(!labels.length)labels.push('Termin / Nachweis fehlt');
    return {severity,days,hours,label:labels.join(' · '),tone:['unknown','green','yellow','orange','red'][severity]};
  }
  function definitions(safety) {
    const base=[{id:'service:annual',name:'Jahresinspektion',months:12,hours:0,action:'inspection',source:'Jährlich gemäß LEEFKE-Inspektionsplan'},...TASKS,...EXTRA];
    for(const item of safety||[]) { const id=item.serviceDefinitionId||item.id; const index=base.findIndex(x=>x.id===id);
      const def={...(index>=0?base[index]:{}),...item,id,name:item.name,months:number(item.intervalMonths)??(index>=0?base[index].months:0),hours:item.clock==='date'?0:(number(item.intervalHours)??(index>=0?base[index].hours:0))};
      if(index>=0)base[index]=def;else base.push(def);
    }
    return base;
  }
  // Due dates are projections of one saved service event. Completion never requires two writes.
  function dueItems(safety,maintenance,today,currentHours) {
    const defs=definitions(safety), events=maintenance||[], results=[];
    for(const def of defs) {
      const performed=events.flatMap(e=>{
        if(e.kind==='inspection'&&e.closedAt) {
          if(def.id==='service:annual')return [{...e,eventDate:e.date}];
          const row=(e.items||[]).find(x=>x.id===def.id);
          if(row&&(row.status==='done'||(def.action==='check'&&row.status==='ok')))return [{...e,eventDate:e.date}];
        }
        if(e.kind!=='inspection'&&e.serviceTask===def.id&&e.done!==false)return [{...e,eventDate:e.date}];
        return [];
      }).filter(e=>date(e.eventDate)).sort((a,b)=>b.eventDate.localeCompare(a.eventDate)||String(b.created||'').localeCompare(String(a.created||'')));
      const latest=performed[0];const last=latest?.eventDate||def.lastCheck||'';
      const hours=number(latest?latest.engineHours:def.lastHours);
      const projected={...def,lastCheck:last,dueDate:latest?(def.months?addMonths(last,def.months):def.intervalDays?addDays(last,def.intervalDays):''):(def.dueDate|| (def.months?addMonths(last,def.months):def.intervalDays?addDays(last,def.intervalDays):'')),dueHours:latest?(def.hours&&hours!==null?hours+def.hours:''):(def.clock==='date'?'':(def.dueHours??(def.hours&&hours!==null?hours+def.hours:'')))};
      // A deliberate override applies to the event it was edited against, until the next service.
      if(def.overrideEventId === (latest?.id || '') && def.manualDueDate)projected.dueDate=def.manualDueDate;
      if(def.overrideEventId === (latest?.id || '') && number(def.manualDueHours)!==null && def.clock!=='date')projected.dueHours=def.manualDueHours;
      projected.latestEventId=latest?.id||'';
      projected.lastHours=hours??'';
      if(latest)projected.status='ok';
      results.push({...projected,status:status(projected,today,currentHours)});
    }
    // Historical entries remain visible; do not guess which free-text items supersede each other.
    for(const e of events)if(!e.kind&&!e.serviceTask&&(e.dueDate||number(e.dueHours)!==null)) {
      const task={...e,id:'legacy:'+e.id,name:e.title,legacyId:e.id,hours:e.intervalHours,source:'Bestehender Wartungseintrag – Zuordnung noch offen'};
      results.push({...task,status:status(task,today,currentHours)});
    }
    for(const e of events.filter(x=>x.kind==='inspection'&&x.closedAt))for(const row of e.items||[])if(row.status==='defect'){
      const key='defect:'+e.id+':'+row.id;
      if(events.some(x=>x.resolvesDefect===key&&x.done!==false))continue;
      results.push({id:key,name:row.name,serviceTask:row.id,defect:true,note:row.note,source:'Mangel aus Inspektion '+e.date,status:{severity:4,tone:'red',label:'Mangel offen'}});
    }
    const order={4:0,3:1,2:2,0:3,1:4};return results.sort((a,b)=>order[a.status.severity]-order[b.status.severity]||String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))||a.name.localeCompare(b.name));
  }
  function newInspection(id,today,boatName='Leefke') {return {id,kind:'inspection',templateVersion:1,date:today,title:'Jahresinspektion',category:'Motor / Boot',boatName,engine:'Perkins Sabre M135',gearbox:'PRM 500D2',engineHours:'',performedBy:'',done:false,created:Date.now(),items:TASKS.map(t=>({...t,status:'open',note:''}))};}
  function validate(record,closing=false) {if(!date(record.date))throw new Error('Bitte ein gültiges Datum angeben.');if(record.engineHours!==''&&record.engineHours!=null&&(number(record.engineHours)===null||number(record.engineHours)<0))throw new Error('Motorstunden müssen leer oder eine positive Zahl sein.');if(closing&&!progress(record).complete)throw new Error('Bitte alle Prüfpunkte bearbeiten. Bei Mängeln und nicht zutreffenden Punkten eine Begründung ergänzen.');return record;}
  const api={TASKS,EXTRA,LABELS,SOURCE,number,date,addMonths,addDays,progress,status,definitions,dueItems,newInspection,validate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LeefkeServiceBook=api;
})(globalThis);
