'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const {JSDOM}=require('jsdom');
const {IDBFactory}=require('fake-indexeddb');
globalThis.LEEFKE_RELEASE={journal:true,candidate:'8.25-home-sync-2'};
globalThis.LeefkeJournal=require('../prototype/journal.js');
globalThis.LeefkeJournalMigration=require('../prototype/journal-migration.js');
globalThis.LeefkeJournalMedia=require('../app-journal-media.js');
globalThis.GoogleJournalSession=require('../prototype/google-journal-session.js').GoogleJournalSession;
require('../app-journal.js');
const A=globalThis.LeefkeAppJournal,M=globalThis.LeefkeJournalMigration,J=globalThis.LeefkeJournal;
const binding={accountId:'account1',scope:'scope1',folderId:'folder1',sessionId:'fixture-session'};
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const globals=['window','document','navigator','location','localStorage','NodeFilter','HTMLElement','Element','indexedDB','fetch','google',
  'waitForGoogleIdentity','GOOGLE_DRIVE_CLIENT_ID','GOOGLE_DRIVE_SCOPE','view','refresh','requestAnimationFrame','cancelAnimationFrame','getComputedStyle','Image'];
async function open(factory) {
  return new Promise((resolve,reject)=>{
    const request=factory.open('leefke-journal-v1',7);
    request.onupgradeneeded=()=>{for(const store of M.ALL)request.result.createObjectStore(store,{keyPath:'id'});};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function read(db,name) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(name),request=tx.objectStore(name).getAll();
    tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);
  });
}
async function write(db,contents) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(Object.keys(contents),'readwrite');
    for(const [name,rows]of Object.entries(contents))for(const row of rows)tx.objectStore(name).put(row);
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });
}
function googleFixture() {
  const files=new Map();let ids=0;
  const fixture={files,account:'account1',loginError:null,failList:false,listCalls:0,contentReads:0};
  const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  const folder={id:'folder1',name:'LEEFKE – Bordbuch',mimeType:'application/vnd.google-apps.folder',trashed:false,
    appProperties:{leefkeJournal:'scope1',leefkeEnvironment:'production'}};
  fixture.fetch=async(url,options={})=>{
    const u=new URL(url),method=options.method||'GET';
    assert.equal(u.origin,'https://www.googleapis.com');
    assert.equal(new Headers(options.headers).get('Authorization'),'Bearer fixture-token');
    if(u.pathname.endsWith('/about'))return json({user:{permissionId:fixture.account}});
    if(u.pathname.endsWith('/generateIds'))return json({ids:['generated_'+(++ids)]});
    if(method==='POST'&&u.pathname==='/upload/drive/v3/files'){
      const boundary=new Headers(options.headers).get('Content-Type').split('boundary=')[1];
      const body=Buffer.from(await options.body.arrayBuffer());
      const parts=body.toString('latin1').split('--'+boundary);
      const metadata=JSON.parse(Buffer.from(parts[1].split('\r\n\r\n')[1].slice(0,-2),'latin1').toString('utf8'));
      const bytes=Buffer.from(parts[2].split('\r\n\r\n')[1].slice(0,-2),'latin1');
      if(files.has(metadata.id))return new Response('',{status:409});
      files.set(metadata.id,{metadata:{...metadata,version:'1',size:String(bytes.length),trashed:false},bytes});
      return json({id:metadata.id});
    }
    if(u.pathname==='/drive/v3/files'){
      if(u.searchParams.get('q')?.includes("mimeType = 'application/vnd.google-apps.folder'"))return json({files:[folder]});
      fixture.listCalls++;
      if(fixture.failList)throw new TypeError('Simulated offline connection');
      return json({files:[...files.values()].filter(x=>x.metadata.appProperties.leefkeJournal==='scope1').map(x=>({id:x.metadata.id,version:x.metadata.version}))});
    }
    if(u.pathname==='/drive/v3/files/folder1')return json(folder);
    const id=u.pathname.split('/').pop(),file=files.get(id);
    if(!file)return new Response('',{status:404});
    if(u.searchParams.get('alt')==='media'){fixture.contentReads++;return new Response(file.bytes,{headers:{'Content-Type':file.metadata.mimeType}});}
    return json(file.metadata);
  };
  return fixture;
}
async function environment(t,{db:provided,fullApp=false}={}) {
  const dom=new JSDOM(html,{url:'https://example.test/leefke-logbuch/',pretendToBeVisual:true,runScripts:'outside-only'});
  const originals=new Map(globals.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const fixture=googleFixture(),factory=new IDBFactory();
  const values={
    window:dom.window,document:dom.window.document,navigator:{userAgent:'Mozilla/5.0 Windows Chrome',onLine:true},
    location:dom.window.location,localStorage:dom.window.localStorage,NodeFilter:dom.window.NodeFilter,
    HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Image:dom.window.Image,indexedDB:factory,fetch:fixture.fetch,
    waitForGoogleIdentity:async()=>true,GOOGLE_DRIVE_CLIENT_ID:'fixture-client',GOOGLE_DRIVE_SCOPE:'https://www.googleapis.com/auth/drive.file',
    google:{accounts:{oauth2:{initTokenClient(options){return{requestAccessToken(){
      if(fixture.loginError)options.error_callback({message:fixture.loginError});
      else options.callback({access_token:'fixture-token',expires_in:3600});
    }};}}}},
    view:id=>{for(const section of dom.window.document.querySelectorAll('main .view'))section.classList.toggle('active',section.id===id);},
    refresh:async()=>{},requestAnimationFrame:callback=>dom.window.requestAnimationFrame(callback),
    cancelAnimationFrame:id=>dom.window.cancelAnimationFrame(id),getComputedStyle:element=>dom.window.getComputedStyle(element)
  };
  for(const[name,value]of Object.entries(values))Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  dom.window.scrollTo=()=>{};dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  let db=provided||await open(factory),app;
  delete require.cache[require.resolve('../app-journal-ui.js')];require('../app-journal-ui.js');
  if(fullApp){
    app=new Function(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8')+
      '\nreturn {ready:appReady,put,del,refresh,view, getDatabase:()=>db};')();
    await app.ready;db=app.getDatabase();
    globalThis.refresh=app.refresh;globalThis.view=app.view;
  }else await globalThis.LeefkeJournalUI.start(db);
  t.after(()=>{db.close();dom.window.close();for(const[name,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  return{dom,db,fixture,app,ui:globalThis.LeefkeJournalUI};
}

test('real UI and transport keep an empty DB importable then upload and verify complete photo bytes',async t=>{
  const {db,fixture,ui,dom}=await environment(t);
  await ui.connect();
  const empty=await ui.sync();assert.equal(empty.ok,true);
  assert.equal((await read(db,'syncMeta')).some(row=>row.id==='journal:last-success'),false);
  const stores=Object.fromEntries(M.ALL.map(name=>[name,[]]));
  stores.photos.push({id:'photo1',data:'data:image/jpeg;base64,YWJj',caption:'Recovered photograph'});
  const snapshot={format:'leefke-migration-snapshot-v1',appVersion:'8.25',databaseVersion:7,stores};
  // Use the public import API after the empty UI exchange; no confirmation dialog is needed in this fixture.
  const local=(await read(db,'syncMeta')).find(row=>row.id==='journal:binding');
  const plan=await M.prepare(snapshot,local.scope);
  const sessionBinding={...binding,sessionId:capturedSession};
  await A.importTest(db,sessionBinding,snapshot,plan,()=>sessionBinding);
  await ui.renderStatus();
  assert.match(dom.window.document.querySelector('#accountSyncSummary').textContent,/Änderungen offen/);
  const result=await ui.sync();assert.equal(result.ok,true);assert.equal(result.pending,0);
  assert.equal(fixture.files.size,2);assert.ok(fixture.contentReads>=2);
  assert.match(dom.window.document.querySelector('#accountLastSync').textContent,/Zuletzt synchronisiert/);
  assert.equal(dom.window.document.querySelector('#homeSync'),null);
  assert.equal(dom.window.document.querySelector('#journalSync').disabled,false);
  assert.deepEqual(await read(db,'photos'),stores.photos);
});
// Capture only the test session nonce; Google responses and credentials are fixtures.
let capturedSession;
const originalBegin=globalThis.GoogleJournalSession.prototype.begin;
globalThis.GoogleJournalSession.prototype.begin=function(){capturedSession=originalBegin.call(this);return capturedSession;};

test('home UI preserves account mismatch and restores controls after transport failure',async t=>{
  const {db,fixture,ui,dom}=await environment(t);
  await A.bindTest(db,{accountId:'account1',scope:'scope1',folderId:'folder1',actor:'actor1'});
  fixture.account='account2';
  await dom.window.document.querySelector('#journalConnect').onclick();
  assert.match(dom.window.document.querySelector('#journalTestMessage').textContent,/Google-Konto gehört nicht/);
  assert.equal(dom.window.document.querySelector('#journalConnect').disabled,false);
  fixture.account='account1';await ui.connect();
  fixture.failList=true;const failed=await ui.sync();
  assert.equal(failed.ok,false);
  assert.match(dom.window.document.querySelector('#journalTestMessage').textContent,/Netzwerkzugriff fehlgeschlagen/);
  assert.equal(dom.window.document.querySelector('#journalSync').disabled,false);
  assert.equal(dom.window.document.querySelector('#journalSync').textContent,'Jetzt synchronisieren');
  assert.equal((await read(db,'syncMeta')).some(row=>row.id==='journal:last-success'),false);
});

test('complete app put path and home UI stage, upload, edit and delete production records',async t=>{
  const {db,app,ui,fixture,dom}=await environment(t,{fullApp:true});
  await ui.connect();
  // Mark a complete empty initial migration, as the real import does.
  await write(db,{syncMeta:[{id:'journal:migration',planHash:'fixture',sourceHash:'fixture'}]});
  await app.put('trips',{id:'trip1',title:'Test trip',status:'active'});
  await app.refresh();
  await app.put('days',{id:'day1',tripId:'trip1',date:'2026-10-12',title:'SYNC-TEST-WIN-01',summary:'Original'});
  await app.refresh();
  assert.match(dom.window.document.querySelector('#accountSyncSummary').textContent,/Änderungen offen/);
  assert.equal((await ui.sync()).ok,true);
  let day=(await read(db,'days'))[0];
  await app.put('days',{...day,summary:'Edited on iPad'});await app.refresh();
  assert.equal((await ui.sync()).ok,true);
  assert.equal((await read(db,'days'))[0].summary,'Edited on iPad');
  await app.del('days','day1');await app.refresh();
  assert.equal((await ui.sync()).ok,true);
  assert.deepEqual(await read(db,'days'),[]);
  assert.ok(fixture.files.size>=6);
  assert.equal((await read(db,'syncMeta')).filter(row=>row.id.startsWith('journal:op:')&&row.pending).length,0);
  assert.match(dom.window.document.querySelector('#accountLastSync').textContent,/Zuletzt synchronisiert/);
});
