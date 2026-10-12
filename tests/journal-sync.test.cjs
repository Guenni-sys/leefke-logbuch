'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { IDBFactory } = require('fake-indexeddb');

globalThis.LEEFKE_RELEASE = { journal: true, candidate: '8.25-home-sync-2' };
globalThis.LeefkeJournal = require('../prototype/journal.js');
globalThis.LeefkeJournalMigration = require('../prototype/journal-migration.js');
require('../app-journal.js');
const J = globalThis.LeefkeJournal, M = globalThis.LeefkeJournalMigration, A = globalThis.LeefkeAppJournal;
const binding = { accountId: 'account1', scope: 'scope1', folderId: 'folder1', sessionId: 'session1' };
const bound = { accountId: binding.accountId, scope: binding.scope, folderId: binding.folderId, actor: 'actor1' };
const appText = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const mutationText = appText.slice(appText.indexOf('async function commitLocalMutation('), appText.indexOf('\nfunction acknowledgeDirtyState('));
function mutation(db, journal = true) {
  return new Function('db', 'LeefkeAppJournal', 'IS_JOURNAL_TEST', 'return (' + mutationText + ');')(db, A, journal);
}
async function openDB(name = 'leefke-journal-v1') {
  const factory = new IDBFactory();
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 7);
    request.onupgradeneeded = () => { for (const store of M.ALL) request.result.createObjectStore(store, { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function setup(t, name) {
  const db = await openDB(name);
  t.after(() => db.close());
  await A.bindTest(db, bound);
  return db;
}
function write(db, contents) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(Object.keys(contents), 'readwrite');
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    for (const [store, rows] of Object.entries(contents)) for (const row of rows) tx.objectStore(store).put(row);
  });
}
function remove(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key);
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
  });
}
function rows(db, name) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name), read = tx.objectStore(name).getAll();
    tx.oncomplete = () => resolve(read.result); tx.onabort = () => reject(tx.error);
  });
}
async function receipt(db) { return (await rows(db, 'syncMeta')).find(row => row.id === 'journal:last-success'); }
async function pending(db) { return (await rows(db, 'syncMeta')).filter(row => row.id.startsWith('journal:op:') && row.pending); }
async function legacyWrite(db, store, record, previous = null, log = null) {
  // Reproduce the durable effects of the old production path, without generating journal operations.
  const content = { syncMeta: [{ id: 'dirty', value: true }], syncTombstones: [], changeLog: log ? [log] : [] };
  if (record) { content[store] = [record]; await write(db, content); await remove(db, 'syncTombstones', store + ':' + record.id); }
  else {
    content.syncTombstones.push({ id: store + ':' + previous.id, recordType: store, recordId: previous.id });
    const tx = db.transaction([store, ...Object.keys(content)], 'readwrite');
    tx.objectStore(store).delete(previous.id);
    for (const [name, values] of Object.entries(content)) for (const value of values) tx.objectStore(name).put(value);
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
  }
}
async function operation(id = 'root1', record = {id:'day1',summary:'Original'}, parents = []) {
  const intent = await A.prepare('days',record.id,record);
  return { schema:1,scope:binding.scope,actor:'remote',id,record:intent.record,parents,kind:'put',
    value:{legacyStore:'days',legacyRecordId:record.id,record} };
}
async function receive(db, operations) {
  const mappings = [...new Map(operations.map(op => [op.record, op.kind === 'delete'
    ? {record:op.record,...op.target}
    : {record:op.record,store:op.value.legacyStore,key:op.value.record.id}])).values()];
  return A.receive(db,binding,operations,mappings,()=>binding);
}
let fileIds = 0;
function drive(remote = new Map()) {
  return {
    ...binding, remote, list: async () => structuredClone([...remote.values()]),
    allocate: async () => 'file_' + (++fileIds),
    create: async (id, op) => {
      if (remote.has(id)) assert.equal(J.canonical(remote.get(id)),J.canonical(op));
      remote.set(id,structuredClone(op));
    }
  };
}
async function exchange(db, transport) { return A.exchange(db,binding,transport,()=>binding,'manual'); }
function snapshot(records = {}) {
  return {format:'leefke-migration-snapshot-v1',appVersion:'8.25',databaseVersion:7,
    stores:Object.fromEntries(M.ALL.map(name=>[name,records[name] || []]))};
}

test('production create stages both record and change log before synchronization', async t => {
  const db = await setup(t);
  const record = {id:'new1',summary:'New on Windows'};
  await mutation(db)('days',record.id,null,record,null,{id:'log1',action:'create'},true);
  assert.equal((await pending(db)).length,2);
  const remote = drive();
  const result = await exchange(db,remote);
  assert.equal(result.confirmed,2); assert.equal(result.pending,0); assert.equal(remote.remote.size,2);
  const status = await A.recordSuccess(db,binding,()=>binding);
  assert.equal(status.saved,true); assert.ok(await receipt(db));
  const other = await setup(t);
  await exchange(other,remote);
  assert.deepEqual(await rows(other,'days'),[record]);
});

test('normal production edit and deletion propagate to a second device', async t => {
  const first = await setup(t), second = await setup(t), root = await operation();
  const remote = drive(new Map([['root-file',root]]));
  await exchange(first,remote); await exchange(second,remote);
  const edited = {...root.value.record,summary:'Edited on iPad'};
  await mutation(first)('days','day1',root.value.record,edited,null,null,true);
  await exchange(first,remote); await exchange(second,remote);
  assert.deepEqual(await rows(second,'days'),[edited]);
  const tomb = {id:'days:day1',recordType:'days',recordId:'day1'};
  await mutation(first)('days','day1',edited,null,tomb,null,true);
  await exchange(first,remote); await exchange(second,remote);
  assert.deepEqual(await rows(second,'days'),[]);
  await exchange(first,remote); assert.deepEqual(await rows(first,'days'),[]);
});

test('local record and journal operation roll back together when change-log staging fails', async t => {
  const db = await setup(t);
  await assert.rejects(()=>mutation(db)('days','new1',null,{id:'new1'},null,{id:''},true));
  assert.deepEqual(await rows(db,'days'),[]); assert.equal((await pending(db)).length,0);
});

test('legacy new records including photo bytes are recovered offline and invalidate false success', async t => {
  const db = await setup(t);
  const photo = {id:'photo1',data:'data:image/jpeg;base64,YWJj',caption:'Local photo'};
  await legacyWrite(db,'photos',photo,null,{id:'log1',action:'create'});
  await write(db,{syncMeta:[{id:'journal:last-success',...binding,at:'2026-10-11T10:00:00Z'}]});
  assert.deepEqual(await A.reconcileLocal(db),{recovered:2});
  assert.equal((await pending(db)).length,2); assert.equal(await receipt(db),undefined);
  assert.deepEqual(await rows(db,'photos'),[photo]);
  assert.deepEqual(await A.reconcileLocal(db),{recovered:0});
  const remote = drive(); await exchange(db,remote);
  const other = await setup(t); await exchange(other,remote);
  assert.deepEqual(await rows(other,'photos'),[photo]);
});

test('legacy edit branches from its prior baseline and preserves a concurrent remote edit', async t => {
  const db = await setup(t), root = await operation();
  await receive(db,[root]);
  const local = {...root.value.record,summary:'Untracked local edit'};
  await legacyWrite(db,'days',local,root.value.record);
  const remoteEdit = await operation('remote-edit',{...root.value.record,summary:'Remote edit'},[root.id]);
  const remote = drive(new Map([['root-file',root],['remote-file',remoteEdit]]));
  const result = await exchange(db,remote);
  assert.equal(result.conflicts,1);
  const view = (await rows(db,'syncMeta')).find(row=>row.store==='days').view;
  assert.deepEqual(view.candidates.map(op=>op.value.record.summary).sort(),['Remote edit','Untracked local edit']);
  assert.deepEqual(await rows(db,'days'),[local]);
  assert.equal((await A.recordSuccess(db,binding,()=>binding)).saved,false);
});

test('legacy deletion is recovered only with its persisted tombstone and reaches new devices', async t => {
  const db = await setup(t), root = await operation(); await receive(db,[root]);
  await legacyWrite(db,'days',null,root.value.record);
  assert.deepEqual(await A.reconcileLocal(db),{recovered:1});
  const entry = (await pending(db))[0]; assert.equal(entry.operation.kind,'delete'); assert.deepEqual(entry.operation.parents,[root.id]);
  const remote = drive(new Map([['root-file',root]])); await exchange(db,remote);
  const other = await setup(t); await exchange(other,remote); assert.deepEqual(await rows(other,'days'),[]);
});

test('untracked tombstone is preserved even if its new record was deleted before recovery', async t => {
  const db = await setup(t);
  await write(db,{syncTombstones:[{id:'days:gone1',recordType:'days',recordId:'gone1'}]});
  assert.deepEqual(await A.reconcileLocal(db),{recovered:1});
  const remote = drive(); await exchange(db,remote);
  const other = await setup(t); await exchange(other,remote);
  assert.equal((await rows(other,'syncMeta')).filter(row=>row.store==='days').length,1);
  assert.deepEqual(await rows(other,'days'),[]);
});

test('missing tracked record without a deletion receipt aborts recovery without guessing a deletion', async t => {
  const db = await setup(t), root = await operation(); await receive(db,[root]);
  await remove(db,'days','day1'); const before = await rows(db,'syncMeta');
  await assert.rejects(()=>A.reconcileLocal(db),/ohne Löschvormerkung/);
  assert.deepEqual(await rows(db,'syncMeta'),before);
});

test('recovery adds a third branch to an existing conflict instead of silently resolving it', async t => {
  const db = await setup(t), root = await operation(); await receive(db,[root]);
  const one = await operation('one',{id:'day1',summary:'One'},[root.id]);
  const two = await operation('two',{id:'day1',summary:'Two'},[root.id]);
  await receive(db,[root,one,two]);
  await legacyWrite(db,'days',{id:'day1',summary:'Local third'},root.value.record);
  await A.reconcileLocal(db);
  const view = (await rows(db,'syncMeta')).find(row=>row.store==='days').view;
  assert.equal(view.conflict,true); assert.equal(view.candidates.length,3);
});

test('recovery refuses a numeric/string key collision and keeps every local record', async t => {
  const db = await setup(t);
  await write(db,{days:[{id:1,summary:'Numeric'},{id:'1',summary:'String'}]});
  const before = await rows(db,'syncMeta');
  await assert.rejects(()=>A.reconcileLocal(db),/Mehrdeutige/);
  assert.deepEqual(await rows(db,'syncMeta'),before); assert.equal((await rows(db,'days')).length,2);
});

test('recovery rechecks the complete snapshot before committing after concurrent local writes', async t => {
  const db = await setup(t); await write(db,{days:[{id:'new1',summary:'Before'}]});
  const original = db.transaction.bind(db); let injected = false;
  db.transaction = (stores, mode, ...args) => {
    if (mode === 'readwrite' && Array.isArray(stores) && stores.includes('days') && !injected) {
      injected = true; original('days','readwrite').objectStore('days').put({id:'new1',summary:'Newer'});
    }
    return original(stores,mode,...args);
  };
  await assert.rejects(()=>A.reconcileLocal(db),/inzwischen geändert/);
  assert.equal((await rows(db,'days'))[0].summary,'Newer'); assert.equal((await pending(db)).length,0);
});

test('empty exchange produces no success receipt and first import remains possible', async t => {
  const db = await setup(t);
  const result = await exchange(db,drive()); assert.equal(result.pending,0);
  const status = await A.recordSuccess(db,binding,()=>binding);
  assert.equal(status.initialized,false); assert.equal(status.saved,false); assert.equal(await receipt(db),undefined);
  const source = snapshot({days:[{id:'legacy1',summary:'Imported'}]});
  const plan = await M.prepare(source,binding.scope);
  await A.importTest(db,binding,source,plan,()=>binding);
  assert.equal((await pending(db)).length,1);
});

test('first import accepts and removes the older erroneous success receipt for the same binding', async t => {
  const db = await setup(t);
  await write(db,{syncMeta:[{id:'journal:last-success',...binding,at:'2026-10-11T10:00:00Z'}]});
  const source = snapshot({days:[{id:'legacy1'}]}); const plan = await M.prepare(source,binding.scope);
  await A.importTest(db,binding,source,plan,()=>binding);
  assert.equal(await receipt(db),undefined); assert.deepEqual(await rows(db,'days'),source.stores.days);
});

test('first import still refuses foreign metadata and existing data', async t => {
  const db = await setup(t);
  await write(db,{syncMeta:[{id:'journal:last-success',...binding,folderId:'another-folder',at:'2026-10-11T10:00:00Z'}]});
  const source = snapshot({days:[{id:'legacy1'}]}); const plan = await M.prepare(source,binding.scope);
  await assert.rejects(()=>A.importTest(db,binding,source,plan,()=>binding),/nicht leer/);
  assert.deepEqual(await rows(db,'days'),[]);
});

test('success receipt uses current pending state rather than a stale zero result', async t => {
  const db = await setup(t), root = await operation(); await receive(db,[root]);
  const remote = drive(new Map([['root-file',root]])); await exchange(db,remote);
  await mutation(db)('days','day1',root.value.record,{id:'day1',summary:'Newer'},null,null,true);
  const status = await A.recordSuccess(db,binding,()=>binding);
  assert.equal(status.pending,1); assert.equal(status.saved,false); assert.equal(await receipt(db),undefined);
});

test('success receipt refuses untracked data and a changed live session', async t => {
  const db = await setup(t), root = await operation(); await receive(db,[root]);
  await write(db,{days:[{id:'unknown1',summary:'Outside journal'}]});
  const status = await A.recordSuccess(db,binding,()=>binding);
  assert.equal(status.untracked,true); assert.equal(status.saved,false); assert.equal(await receipt(db),undefined);
  await assert.rejects(()=>A.recordSuccess(db,binding,()=>({...binding,sessionId:'other'})),/Sitzung|Anmeldesitzung/);
});

test('conflict decision converges between production databases', async t => {
  const a = await setup(t), b = await setup(t), root = await operation(); await receive(a,[root]); await receive(b,[root]);
  await mutation(a)('days','day1',root.value.record,{id:'day1',summary:'A'},null,null,true);
  await mutation(b)('days','day1',root.value.record,{id:'day1',summary:'B'},null,null,true);
  const remote = drive(new Map([['root-file',root]]));
  await exchange(a,remote); assert.equal((await exchange(b,remote)).conflicts,1); assert.equal((await exchange(a,remote)).conflicts,1);
  const view = (await rows(a,'syncMeta')).find(row=>row.store==='days').view;
  await A.resolve(a,binding,'days','day1',view.candidates.map(op=>op.id),{id:'day1',summary:'A'},()=>binding);
  await exchange(a,remote); assert.equal((await exchange(b,remote)).conflicts,0);
  assert.deepEqual(await rows(b,'days'),[{id:'day1',summary:'A'}]);
});

test('lost upload response keeps pending state and repeats exactly the reserved file ID', async t => {
  const db = await setup(t); const record = {id:'new1',summary:'Retry'};
  await mutation(db)('days',record.id,null,record,null,null,true);
  const remote = drive(), normal = remote.create; let fail = true;
  remote.create = async (...args) => {await normal(...args);if(fail){fail=false;throw new Error('Lost response');}};
  await assert.rejects(()=>exchange(db,remote),/Lost response/);
  const first = (await pending(db))[0]; assert.ok(first.fileId); assert.equal(remote.remote.size,1);
  await exchange(db,remote);
  const after = (await rows(db,'syncMeta')).find(row=>row.id===first.id);
  assert.equal(after.fileId,first.fileId); assert.equal(after.pending,false); assert.equal(remote.remote.size,1);
});

test('manual synchronization lives in account controls, without a home card', () => {
  const uiText=fs.readFileSync(path.join(__dirname,'../app-journal-ui.js'),'utf8');
  assert.doesNotMatch(uiText,/homeButton.onclick/);assert.match(uiText,/syncButton.onclick/);
});

test('old database storage path remains unchanged outside journal mode', async t => {
  const db = await openDB('leefke-v2'); t.after(()=>db.close());
  await mutation(db,false)('days','legacy1',null,{id:'legacy1'},null,null,true);
  assert.deepEqual(await rows(db,'days'),[{id:'legacy1'}]); assert.equal((await pending(db)).length,0);
});

test('service worker and release configuration use the same build identifier', async () => {
  let root=path.join(__dirname,'..');
  const builder=path.join(root,'tools/build-journal-release.cjs');
  if(fs.existsSync(builder)) {
    const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'leefke-version-'));
    root=await require(builder).build(path.join(temp,'release'));
  }
  const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
  const config=fs.readFileSync(path.join(root,'app-release-config.js'),'utf8');
  const version=/candidate: '([^']+)'/.exec(config)[1];
  assert.ok(worker.includes("'"+version+"'"));assert.equal(version,'8.25-inspection-rc1');
});
