const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../service-book.js');
test('calendar month end, leap year, invalid dates and optional hours',()=>{
 assert.equal(B.addMonths('2024-01-31',1),'2024-02-29');
 assert.equal(B.addMonths('2024-02-29',12),'2025-02-28');
 assert.equal(B.addDays('2026-03-28',2),'2026-03-30');
 assert.equal(B.date('2026-02-30'),null);assert.equal(B.number('  '),null);assert.equal(B.number(0),0);
});
test('calendar traffic light boundaries and unknown hours never falsely green',()=>{
 for(const [days,severity] of [[-1,4],[0,4],[1,3],[7,3],[8,2],[30,2],[31,1]])assert.equal(B.status({dueDate:B.addDays('2026-10-11',days)},'2026-10-11','').severity,severity);
 assert.equal(B.status({dueDate:'2027-10-11',hours:400},'2026-10-11','').severity,0);
 assert.equal(B.status({dueDate:'2026-10-12',hours:400},'2026-10-11','').severity,3);
 assert.equal(B.status({dueHours:400,hours:400},'2026-10-11',321).severity,2);
 assert.equal(B.status({dueHours:400,hours:400},'2026-10-11',360).severity,3);
 assert.equal(B.status({dueHours:400,hours:400},'2026-10-11',400).severity,4);
});
test('unfinished inspections and mere checks cannot reset replacement dates',()=>{
 const r=B.newInspection('one','2026-10-11');r.items.forEach(x=>x.status='ok');
 assert.throws(()=>B.validate(r,true));assert.equal(B.dueItems([], [r],r.date,'').find(t=>t.id==='service:annual').dueDate,'');
 r.items.forEach(x=>x.status='done');assert.doesNotThrow(()=>B.validate(r,true));r.closedAt='now';
 const tasks=B.dueItems([], [r],r.date,'');assert.equal(tasks.find(t=>t.id==='service:annual').dueDate,'2027-10-11');
 assert.equal(tasks.find(t=>t.id==='service:engine-oil').dueDate,'2027-10-11');
 assert.equal(tasks.find(t=>t.id==='service:engine-oil').dueHours,'');
 r.items[0].status='na';r.items[0].note='skip';assert.throws(()=>B.validate(r,true));
 r.items[0].status='defect';assert.doesNotThrow(()=>B.validate(r,true));
 assert.equal(B.dueItems([], [r],r.date,'').find(t=>t.id==='service:engine-oil').dueDate,'');
 assert.equal(B.dueItems([], [r],r.date,'').filter(t=>t.defect).length,1);
 const repair={id:'repair',kind:'service',done:true,resolvesDefect:'defect:one:service:engine-oil'};
 assert.equal(B.dueItems([], [r,repair],r.date,'').filter(t=>t.defect).length,0);
});
test('explicit dates apply to current service only; future service advances schedule',()=>{
 const safety=[{id:'override',serviceDefinitionId:'service:engine-oil',name:'Öl',intervalMonths:12,clock:'date',overrideEventId:'event',manualDueDate:'2027-08-01'}];
 const events=[{id:'event',serviceTask:'service:engine-oil',date:'2026-10-11',engineHours:0}];
 const find=()=>B.dueItems(safety,events,'2026-10-11','').find(x=>x.id==='service:engine-oil');
 assert.equal(find().dueDate,'2027-08-01');assert.equal(find().lastHours,0);
 events.push({id:'next',serviceTask:'service:engine-oil',date:'2027-07-01'});
 assert.equal(find().dueDate,'2028-07-01');
});
test('date-only safety items ignore engine hours and historical entries remain untouched',()=>{
 const safety=[{id:'fire',name:'Feuerlöscher',clock:'date',intervalMonths:24,lastCheck:'2025-10-01',intervalHours:500,dueHours:1}];
 const events=[{id:'old',title:'Altbestand',dueDate:'2026-10-10'}];const before=JSON.stringify({safety,events});
 const tasks=B.dueItems(safety,events,'2026-10-11',9999);
 assert.equal(tasks.find(t=>t.id==='fire').status.severity,1);
 assert.equal(tasks.find(t=>t.id==='legacy:old').status.severity,4);
 assert.equal(JSON.stringify({safety,events}),before);
});
test('a known replacement remains red until work is documented; defect repair advances its task',()=>{
 const definitions=[{id:'fire',name:'Feuerlöscher',status:'replace',clock:'date',intervalMonths:24,lastCheck:'2026-10-01'}];
 assert.equal(B.dueItems(definitions,[],'2026-10-11','').find(t=>t.id==='fire').status.severity,4);
 assert.equal(B.dueItems(definitions,[{id:'fixed',serviceTask:'fire',date:'2026-10-11',done:true}],'2026-10-11','').find(t=>t.id==='fire').status.severity,1);
 const r=B.newInspection('inspection','2026-10-11');r.items.forEach(x=>x.status='done');r.items[0].status='defect';r.items[0].note='Ölwechsel noch offen';r.closedAt='2026-10-11';
 const defect=B.dueItems([], [r],r.date,'').find(x=>x.defect);
 const repair={id:'repair',kind:'service',serviceTask:defect.serviceTask,resolvesDefect:defect.id,date:'2026-10-12',done:true};
 const tasks=B.dueItems([], [r,repair],'2026-10-12','');assert.equal(tasks.filter(x=>x.defect).length,0);assert.equal(tasks.find(x=>x.id==='service:engine-oil').dueDate,'2027-10-12');
});
