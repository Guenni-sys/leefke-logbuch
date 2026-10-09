/* App database bridge. Production uses a separate DB and requires packaged release configuration. */
(function (root) {
  'use strict';
  const J = root.LeefkeJournal;
  const encode = J.canonical, copy = value => JSON.parse(encode(value));
  const STORES = ['days','fuel','maintenance','photos','checklists','route','ports','settings','trips','gpx','weather','inventory','safety','documents','changeLog','conflicts','devices','routeWeather'];
  const BINDING = 'journal:binding';
  const opKey = id => 'journal:op:' + id;
  const viewKey = record => 'journal:view:' + record;
  function allowed(db) { if (!(db.name.startsWith('leefke-journal-app-test-') || root.LEEFKE_RELEASE?.journal === true && db.name === 'leefke-journal-v1')) throw new Error('Journal-Aktivierung ist bis zur abgeschlossenen Migration auf getrennte Integrationstests begrenzt.'); }
  function guard(tx, reject, fn) { return (...args) => { try { fn(...args); } catch (error) { reject(error); tx.abort(); } }; }
  function transaction(db, stores, work) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([...new Set(stores)], 'readwrite'); let result, error;
      tx.oncomplete = () => resolve(result); tx.onabort = () => reject(error || tx.error || new Error('Journal-Transaktion abgebrochen.')); tx.onerror = () => {};
      const checked = fn => guard(tx, e => { error = e; }, fn);
      checked(() => work(tx, value => { result = value; }, checked, e => { error = e; }))();
    });
  }
  async function prepare(store, key, value, previous = null) {
    if (!STORES.includes(store) || !((typeof key === 'string' && key.length) || (typeof key === 'number' && Number.isSafeInteger(key)))) throw new Error('Ungültige Datensatzzuordnung.');
    const intent = copy({ store, key, value, previous });
    if (value !== null && value.id !== key || previous !== null && previous.id !== key) throw new Error('Nutzdaten und Datensatzkennung widersprechen sich.');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encode([store, String(key)])));
    return { ...intent, record: 'r_' + [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('') };
  }
  function config(rows, db) {
    const binding = rows.find(row => row.id === BINDING);
    if (binding) allowed(db);
    return binding;
  }
  async function bindTest(db, binding) {
    allowed(db); binding = copy(binding);
    if (Object.keys(binding).sort().join() !== 'accountId,actor,folderId,scope' || Object.values(binding).some(v => typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(v))) throw new Error('Unvollständige Journal-Zuordnung.');
    return transaction(db, ['syncMeta'], (tx, done, checked) => {
      const store = tx.objectStore('syncMeta'), request = store.get(BINDING);
      request.onsuccess = checked(() => {
        const next = { id: BINDING, ...binding };
        if (request.result && encode(request.result) !== encode(next)) throw new Error('Diese Datenbank gehört bereits zu einem anderen Journalbestand.');
        store.put(next); done(next);
      });
    });
  }
  // Called INSIDE the app's transaction; done performs the associated app writes.
  function stage(tx, intents, done, failed) {
    const store = tx.objectStore('syncMeta'), request = store.getAll();
    request.onsuccess = guard(tx, failed, () => {
      const rows = request.result, binding = config(rows, tx.db);
      if (!binding) { done(); return; }
      const operations = rows.filter(r => r.id.startsWith('journal:op:')).map(r => r.operation);
      let view = J.materialize(operations, binding.scope);
      for (const intent of intents) {
        const known = rows.find(r => r.id === viewKey(intent.record));
        if (known && (known.store !== intent.store || known.key !== intent.key || encode(known.applied) !== encode(intent.previous))) throw new Error('Journal und App-Datensatz stimmen nicht überein.');
        let heads = view.find(r => r.record === intent.record);
        if (intent.expectedHeads) {
          if (!heads?.conflict || encode(heads.candidates.map(op => op.id).sort()) !== encode([...intent.expectedHeads].sort())) throw new Error('Die Konfliktfassungen haben sich geändert. Bitte erneut prüfen.');
        } else if (heads?.conflict) throw new Error('Für diesen Eintrag liegen mehrere Fassungen vor. Bitte zuerst den Konflikt entscheiden.');
        const envelope = value => value === null ? null : { legacyStore: intent.store, legacyRecordId: String(intent.key), record: value };
        function append(value, parents) {
          const operation = { schema: 1, scope: binding.scope, actor: binding.actor, id: crypto.randomUUID(), record: intent.record, parents, kind: value === null ? 'delete' : 'put', value: envelope(value) };
          if (value === null) operation.target = { store: intent.store, key: intent.key };
          J.validate(operation, binding.scope); operations.push(operation);
          store.add({ id: opKey(operation.id), operation, pending: true, fileId: null });
          return operation;
        }
        // Preserve pre-existing local state as a parent, never silently discard it.
        if (!heads && intent.previous !== null) heads = { candidates: [append(intent.previous, [])] };
        append(intent.value, heads?.candidates.map(op => op.id) || []);
        view = J.materialize(operations, binding.scope);
        store.put({ id: viewKey(intent.record), store: intent.store, key: intent.key, applied: intent.value, view: view.find(r => r.record === intent.record) });
      }
      done();
    });
  }
  async function receive(db, binding, operations, mappings, currentBinding) {
    allowed(db); binding = copy(binding); operations = copy(operations); mappings = copy(mappings);
    const identities = new Map();
    for (const mapping of mappings) {
      const checked = await prepare(mapping.store, mapping.key, null);
      if (checked.record !== mapping.record || identities.has(mapping.record)) throw new Error('Ungültige oder doppelte Datensatzzuordnung.');
      identities.set(mapping.record, mapping);
    }
    const assert = () => { if (encode(currentBinding()) !== encode(binding)) throw new Error('Anmeldesitzung oder Bestand wurde gewechselt.'); };
    assert(); operations.forEach(op => J.validate(op, binding.scope));
    return transaction(db, [...STORES, 'syncMeta'], (tx, done, checked) => {
      const meta = tx.objectStore('syncMeta'), request = meta.getAll();
      request.onsuccess = checked(() => {
        assert(); const rows = request.result, saved = config(rows, db);
        if (!saved || ['accountId','scope','folderId'].some(k => saved[k] !== binding[k])) throw new Error('Download gehört zu anderem Konto oder Bordbuch.');
        const entries = new Map(rows.filter(r => r.id.startsWith('journal:op:')).map(r => [r.operation.id, r]));
        for (const op of operations) {
          const mapping = identities.get(op.record) || rows.find(r => r.id === viewKey(op.record));
          if (!mapping || op.kind === 'put' && (op.value.legacyStore !== mapping.store || op.value.legacyRecordId !== String(mapping.key) || op.value.record?.id !== mapping.key)) throw new Error('Journalinhalt widerspricht seiner Datensatzzuordnung.');
          if (op.target && (op.target.store !== mapping.store || op.target.key !== mapping.key)) throw new Error('Löschzuordnung widerspricht dem Datensatz.');
          if (entries.has(op.id) && encode(entries.get(op.id).operation) !== encode(op)) throw new Error('Bekannte Änderung wurde nachträglich verändert.');
          if (!entries.has(op.id)) entries.set(op.id, { id: opKey(op.id), operation: op, pending: false, fileId: null });
        }
        const views = J.materialize([...entries.values()].map(r => r.operation), binding.scope);
        let remaining = views.length;
        const finish = () => { assert(); for (const entry of entries.values()) meta.put(entry); done(views); };
        if (!remaining) { finish(); return; }
        for (const view of views) {
          const previous = rows.find(r => r.id === viewKey(view.record));
          const mapping = identities.get(view.record) || previous;
          if (!mapping) throw new Error('Zu einem eingehenden Datensatz fehlt die Zuordnung.');
          if (previous && (mapping.store !== previous.store || mapping.key !== previous.key)) throw new Error('Eine bekannte Datensatzzuordnung wurde verändert.');
          for (const op of view.candidates) if (op.kind === 'put' && (op.value.legacyStore !== mapping.store || op.value.legacyRecordId !== String(mapping.key) || op.value.record?.id !== mapping.key)) throw new Error('Journalinhalt widerspricht seiner Datensatzzuordnung.');
          const target = tx.objectStore(mapping.store), read = target.get(mapping.key);
          read.onsuccess = checked(() => {
            assert(); const actual = read.result || null;
            if (encode(actual) !== encode(previous?.applied ?? null)) throw new Error('Lokaler App-Datensatz wurde außerhalb des Journals verändert. Übernahme abgebrochen.');
            let applied = actual;
            if (!view.conflict) {
              const candidate = view.candidates[0]; applied = candidate.kind === 'delete' ? null : candidate.value.record;
              if (applied === null) target.delete(mapping.key); else target.put(applied);
            }
            meta.put({ id: viewKey(view.record), store: mapping.store, key: mapping.key, applied, view });
            if (--remaining === 0) finish();
          });
        }
      });
    });
  }
  async function resolve(db, binding, store, key, heads, value, currentBinding) {
    allowed(db); binding = copy(binding); heads = copy(heads);
    if (!Array.isArray(heads) || heads.length < 2 || new Set(heads).size !== heads.length) throw new Error('Alle Konfliktfassungen müssen angegeben werden.');
    const intent = await prepare(store, key, value);
    const assert = () => { if (encode(currentBinding()) !== encode(binding)) throw new Error('Anmeldesitzung oder Bestand wurde gewechselt.'); };
    assert();
    return transaction(db, [store, 'syncMeta', 'syncTombstones'], (tx, done, checked, failed) => {
      const meta = tx.objectStore('syncMeta'), request = meta.get(BINDING);
      request.onsuccess = checked(() => {
        assert(); if (!request.result || ['accountId','scope','folderId'].some(k => request.result[k] !== binding[k])) throw new Error('Konflikt gehört zu anderem Bestand.');
        const read = tx.objectStore(store).get(key);
        read.onsuccess = checked(() => {
          intent.previous = read.result || null; intent.expectedHeads = heads;
          stage(tx, [intent], () => {
            assert(); if (value === null) tx.objectStore(store).delete(key); else tx.objectStore(store).put(intent.value);
            tx.objectStore('syncTombstones').delete(`${store}:${key}`);
            meta.put({ id: 'dirty', value: true, changedAt: new Date().toISOString(), revision: crypto.randomUUID() });
            done(intent.value);
          }, failed);
        });
      });
    });
  }
  const running = new Set(), started = new WeakSet();
  async function exchange(db, binding, drive, currentBinding, trigger, onProgress = () => {}) {
    allowed(db); binding = copy(binding);
    if (!['startup', 'manual'].includes(trigger)) throw new Error('Abgleich ist nur beim App-Start oder manuell erlaubt.');
    const assert = () => {
      if (!binding.sessionId || encode(currentBinding()) !== encode(binding) || ['accountId','scope','folderId','sessionId'].some(k => drive[k] !== binding[k])) throw new Error('Anmeldesitzung oder Bestand wurde gewechselt.');
    };
    assert();
    if (running.has(db.name)) throw new Error('Ein Abgleich läuft bereits.');
    if (trigger === 'startup' && started.has(db)) throw new Error('Der Startabgleich wurde bereits versucht. Bitte manuell erneut versuchen.');
    if (trigger === 'startup') started.add(db);
    running.add(db.name);
    // Every metadata mutation rechecks both the live session and persisted binding.
    const progress = value => { try { onProgress(value); } catch { /* Observers cannot affect durable acknowledgements. */ } };
    const metadata = (work, keys) => transaction(db, ['syncMeta'], (tx, done, checked) => {
      const meta = tx.objectStore('syncMeta');
      const complete = rows => {
        assert(); const saved = config(rows, db);
        if (!saved || ['accountId','scope','folderId'].some(k => saved[k] !== binding[k])) throw new Error('Abgleich gehört zu anderem Konto oder Bordbuch.');
        work(meta, rows, done);
      };
      if (keys === undefined) {
        const read = meta.getAll(); read.onsuccess = checked(() => complete(read.result));
      } else {
        // Do not copy the full migration archive for every file reservation and ACK.
        const wanted = [...new Set([BINDING, ...keys])], rows = []; let remaining = wanted.length;
        for (const key of wanted) {
          const read = meta.get(key);
          read.onsuccess = checked(() => { if (read.result) rows.push(read.result); if (!--remaining) complete(rows); });
        }
      }
    });
    try {
      await metadata((meta, rows, done) => done(), []); // Reject wrong local binding before network access.
      const cacheUpdates = new Map();
      if (typeof drive.request === 'function') {
        if (!root.LeefkeJournalMedia) throw new Error('Medienübertragung ist nicht geladen.');
        const savedRows = await metadata((meta, rows, done) => done(rows));
        const wire = new Map(savedRows.filter(row => row.id.startsWith('journal:download:')).map(row => [row.id.slice('journal:download:'.length), row]));
        const media = new Map(savedRows.filter(row => row.id.startsWith('journal:media-version:')).map(row => [row.id.slice('journal:media-version:'.length), row.version]));
        const local = new Map(savedRows.filter(row => row.id.startsWith('journal:op:')).map(row => [row.operation.id, row.operation]));
        const cache = {
          wire: { get: id => wire.get(id), set: (id, value) => { const row = { id: 'journal:download:' + id, ...value }; wire.set(id, row); cacheUpdates.set(row.id, row); } },
          mediaVersion: id => media.get(id), localOperation: id => local.get(id),
          saveMediaVersion: (id, version) => { const row = { id: 'journal:media-version:' + id, version }; media.set(id, version); cacheUpdates.set(row.id, row); }
        };
        const reserve = async (operation, descriptor, allocate) => {
          const key = 'journal:media:' + operation.id;
          const existing = await metadata((meta, rows, done) => done(rows.find(row => row.id === key) || null), [key]);
          const candidate = existing?.fileId || await allocate(); assert();
          if (typeof candidate !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(candidate)) throw new Error('Ungültige Medien-Datei-ID.');
          return metadata((meta, rows, done) => {
            const entry = rows.find(row => row.id === opKey(operation.id));
            if (!entry || !entry.pending || encode(entry.operation) !== encode(operation)) throw new Error('Medieninhalt gehört nicht zur offenen Änderung.');
            const saved = rows.find(row => row.id === key);
            if (saved && encode(saved.descriptor) !== encode(descriptor)) throw new Error('Vorgemerkter Medieninhalt wurde verändert.');
            const next = saved || { id: key, descriptor, fileId: candidate };
            meta.put(next); done(next.fileId);
          }, [key, opKey(operation.id)]);
        };
        drive = root.LeefkeJournalMedia.wrap(drive, reserve, assert, cache);
      }
      progress({ phase: 'read' });
      assert(); const incoming = copy(await drive.list()); assert();
      const mappings = new Map();
      for (const op of incoming) {
        J.validate(op, binding.scope);
        if (op.kind === 'delete') {
          if (!op.target) continue; // Older changes still require a known mapping or a put ancestor.
          const checked = await prepare(op.target.store, op.target.key, null); assert();
          if (checked.record !== op.record) throw new Error('Löschzuordnung passt nicht zur Datensatzkennung.');
          const next = { record: op.record, ...op.target };
          if (mappings.has(op.record) && encode(mappings.get(op.record)) !== encode(next)) throw new Error('Widersprüchliche Löschzuordnungen.');
          mappings.set(op.record, next); continue;
        }
        const value = op.value;
        const mapping = await prepare(value.legacyStore, value.record?.id, value.record);
        assert();
        if (mapping.record !== op.record || value.legacyRecordId !== String(mapping.key)) throw new Error('Eingehende Datensatzzuordnung ist ungültig.');
        const next = { record: mapping.record, store: mapping.store, key: mapping.key };
        if (mappings.has(op.record) && encode(mappings.get(op.record)) !== encode(next)) throw new Error('Widersprüchliche Datensatzzuordnungen.');
        mappings.set(op.record, next);
      }
      await receive(db, binding, incoming, [...mappings.values()], currentBinding); assert();
      if (cacheUpdates.size) { await metadata((meta, rows, done) => { for (const row of cacheUpdates.values()) meta.put(row); done(); }, []); cacheUpdates.clear(); }
      const pending = await metadata((meta, rows, done) => done(rows.filter(r => r.id.startsWith('journal:op:') && r.pending)));
      const remaining = new Map(pending.map(entry => [entry.operation.id, entry]));
      const ordered = [];
      while (remaining.size) {
        const ready = [...remaining.values()].filter(entry => entry.operation.parents.every(id => !remaining.has(id)));
        if (!ready.length) throw new Error('Zyklische Versandfolge.');
        for (const entry of ready) { ordered.push(entry); remaining.delete(entry.operation.id); }
      }
      let confirmed = 0;
      progress({ phase: 'send', confirmed, total: ordered.length });
      for (const entry of ordered) {
        assert();
        const candidate = entry.fileId || await drive.allocate(); assert();
        if (typeof candidate !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(candidate)) throw new Error('Ungültige Drive-Datei-ID.');
        const assigned = await metadata((meta, rows, done) => {
          const saved = rows.find(row => row.id === entry.id);
          if (!saved || encode(saved.operation) !== encode(entry.operation)) throw new Error('Vorgemerkte Änderung wurde verändert.');
          if (!saved.pending) { done(null); return; }
          saved.fileId ||= candidate; meta.put(saved); done(saved);
        }, [entry.id]);
        if (!assigned) continue;
        assert(); await drive.create(assigned.fileId, assigned.operation); assert();
        await metadata((meta, rows, done) => {
          const saved = rows.find(row => row.id === entry.id);
          if (!saved || saved.fileId !== assigned.fileId || encode(saved.operation) !== encode(assigned.operation)) throw new Error('Versandbestätigung passt nicht zur vorgemerkten Änderung.');
          saved.pending = false; meta.put(saved); done();
        }, [entry.id]);
        confirmed++;
        progress({ phase: 'send', confirmed, total: ordered.length });
      }
      if (cacheUpdates.size) await metadata((meta, rows, done) => { for (const row of cacheUpdates.values()) meta.put(row); done(); }, []);
      return await metadata((meta, rows, done) => done({
        received: incoming.length, confirmed,
        pending: rows.filter(row => row.id.startsWith('journal:op:') && row.pending).length,
        conflicts: rows.filter(row => row.id.startsWith('journal:view:') && row.view.conflict).length
      }));
    } finally { running.delete(db.name); }
  }
  async function importTest(db, binding, snapshot, plan, currentBinding) {
    allowed(db); binding = copy(binding); snapshot = copy(snapshot); plan = copy(plan);
    const migration = root.LeefkeJournalMigration;
    if (!migration || plan.scope !== binding.scope) throw new Error('Migrationsplan gehört nicht zum Zielbestand.');
    if (db.version !== 7 || [...db.objectStoreNames].sort().join() !== [...migration.ALL].sort().join()) throw new Error('Zieldatenbankschema passt nicht zur Migration.');
    await migration.verify(plan, snapshot);
    const assert = () => { if (!binding.sessionId || encode(currentBinding()) !== encode(binding)) throw new Error('Anmeldesitzung oder Bestand wurde gewechselt.'); };
    assert();
    const mappings = new Map();
    async function map(store, key, value) {
      const mapping = await prepare(store, key, value);
      const prior = mappings.get(mapping.record);
      if (prior && prior.key !== key) throw new Error('Mehrdeutige Datensatzzuordnung bei der Migration.');
      mappings.set(mapping.record, { store, key, applied: value ?? prior?.applied ?? null });
    }
    for (const store of STORES) for (const row of snapshot.stores[store]) await map(store, row.id, row);
    for (const tomb of snapshot.stores.syncTombstones) await map(tomb.recordType, tomb.recordId, null);
    const views = J.materialize(plan.operations, binding.scope);
    assert();
    return transaction(db, migration.ALL, (tx, done, checked) => {
      const contents = {}; let remaining = migration.ALL.length;
      for (const name of migration.ALL) {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = checked(() => {
          assert(); contents[name] = request.result;
          if (--remaining) return;
          const saved = config(contents.syncMeta, db);
          if (!saved || ['accountId','scope','folderId'].some(key => saved[key] !== binding[key])) throw new Error('Zieldatenbank gehört zu einem anderen Bestand.');
          const receipt = contents.syncMeta.find(row => row.id === 'journal:migration');
          if (receipt) {
            if (receipt.planHash !== plan.planHash || receipt.sourceHash !== plan.sourceHash) throw new Error('Ein anderer Ausgangsbestand wurde bereits übernommen.');
            if (encode(receipt.plan) !== encode(plan)) throw new Error('Das gespeicherte Quellarchiv wurde verändert.');
            for (const op of plan.operations) {
              const stored = contents.syncMeta.find(row => row.id === opKey(op.id));
              if (!stored || encode(stored.operation) !== encode(op)) throw new Error('Die gespeicherte Ausgangsübernahme ist unvollständig oder verändert.');
            }
            done({ resumed: true, records: plan.operations.length, activationAllowed: false }); return;
          }
          if (migration.ALL.some(name => contents[name].some(row => name !== 'syncMeta' || row.id !== BINDING))) throw new Error('Die Ziel-Testdatenbank ist nicht leer. Bestehende Daten werden nicht ersetzt.');
          for (const store of STORES) for (const row of snapshot.stores[store]) tx.objectStore(store).add(row);
          for (const name of ['autoBackups', 'syncTombstones']) for (const row of snapshot.stores[name]) tx.objectStore(name).add(row);
          const meta = tx.objectStore('syncMeta');
          for (const operation of plan.operations) meta.add({ id: opKey(operation.id), operation, pending: true, fileId: null });
          for (const view of views) meta.add({ id: viewKey(view.record), ...mappings.get(view.record), view });
          // Preserve the complete source plan, including old metadata, as an archive;
          // never activate the old session/dirty/sync state in the new database.
          meta.add({ id: 'journal:migration', planHash: plan.planHash, sourceHash: plan.sourceHash, plan, activationAllowed: false });
          assert(); done({ resumed: false, records: plan.operations.length, activationAllowed: false });
        });
      }
    });
  }
  async function restoreTest(db, backup, expected = null) {
    allowed(db);
    if (running.has(db.name)) throw new Error('Bitte den laufenden Abgleich abwarten.');
    if (!backup?.stores || Object.keys(backup.stores).sort().join() !== [...STORES].sort().join() || backup.mediaOmitted || backup.note?.includes('ausgelassen')) throw new Error('Für die Wiederherstellung ist eine vollständige Sicherung einschließlich Medien erforderlich.');
    const M = root.LeefkeJournalMigration;
    M.validateSnapshot({ format: 'leefke-migration-snapshot-v1', appVersion: '8.24', databaseVersion: 7, stores: { ...backup.stores, autoBackups: [], syncMeta: [], syncTombstones: [] } });
    const before = await M.capture(db, '8.24'), binding = config(before.stores.syncMeta, db);
    if (!binding) throw new Error('Kein zugeordneter Journalbestand.');
    if (expected && STORES.some(store => encode(expected[store]) !== encode(before.stores[store]))) throw new Error('Daten wurden inzwischen geändert. Bitte erneut prüfen.');
    const intents = [];
    for (const store of STORES) {
      const oldRows = new Map(before.stores[store].map(row => [row.id, row]));
      const newRows = new Map(backup.stores[store].map(row => [row.id, row]));
      for (const key of new Set([...oldRows.keys(), ...newRows.keys()])) {
        const previous = oldRows.get(key) || null, value = newRows.get(key) || null;
        if (encode(previous) === encode(value)) continue;
        if (value && ['photos','documents','settings'].includes(store)) {
          const field = store === 'settings' ? 'boatPhoto' : 'data';
          if (previous?.[field] && !value[field]) throw new Error('Die Sicherung enthält einen vorhandenen Medieninhalt nicht. Wiederherstellung abgebrochen.');
        }
        intents.push(await prepare(store, key, value, previous));
      }
    }
    if (!intents.length) return { changed: 0 };
    const timestamp = new Date().toISOString(), recoveryId = crypto.randomUUID();
    const recovery = { id: recoveryId, createdAt: timestamp, reason: 'Vor Journal-Wiederherstellung', version: '8.24', mediaOmitted: false,
      data: JSON.stringify({ app: 'LEEFKE Bordbuch', version: '8.24', createdAt: timestamp, stores: Object.fromEntries(STORES.map(store => [store, before.stores[store]])) }) };
    recovery.size = recovery.data.length;
    return transaction(db, M.ALL, (tx, done, checked, failed) => {
      let remaining = STORES.length + 1;
      const next = () => {
        if (--remaining) return;
        stage(tx, intents, () => {
          for (const intent of intents) {
            const store = tx.objectStore(intent.store), tombstones = tx.objectStore('syncTombstones');
            if (intent.value === null) {
              store.delete(intent.key); tombstones.put({ id: `${intent.store}:${intent.key}`, recordType: intent.store, recordId: intent.key, updatedAt: timestamp, deviceId: binding.actor });
            } else { store.put(intent.value); tombstones.delete(`${intent.store}:${intent.key}`); }
          }
          tx.objectStore('autoBackups').add(recovery);
          tx.objectStore('syncMeta').put({ id: 'dirty', value: true, changedAt: timestamp });
          done({ changed: intents.length, recoveryId });
        }, failed);
      };
      const readBinding = tx.objectStore('syncMeta').get(BINDING);
      readBinding.onsuccess = checked(() => { if (encode(readBinding.result) !== encode(binding)) throw new Error('Bestandszuordnung wurde gewechselt.'); next(); });
      for (const store of STORES) {
        const read = tx.objectStore(store).getAll();
        read.onsuccess = checked(() => { if (encode(read.result) !== encode(before.stores[store])) throw new Error('Daten wurden inzwischen geändert. Bitte Wiederherstellung erneut prüfen.'); next(); });
      }
    });
  }
  async function transferDigest(snapshot) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encode(snapshot))))].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  async function exportTransfer(db) {
    allowed(db);
    if (running.has(db.name)) throw new Error('Bitte den laufenden Abgleich abwarten.');
    const snapshot = await root.LeefkeJournalMigration.capture(db, '8.24');
    if (!config(snapshot.stores.syncMeta, db)) throw new Error('Kein zugeordneter Testbestand vorhanden.');
    return { format: 'leefke-journal-transfer-v1', snapshot, sha256: await transferDigest(snapshot) };
  }
  async function importTransfer(db, binding, transfer, currentBinding) {
    allowed(db);
    if (db.name !== 'leefke-journal-app-test-handoff') throw new Error('Übergaben sind nur im eigenen Übergabebestand erlaubt.');
    const M = root.LeefkeJournalMigration, snapshot = transfer?.snapshot;
    if (transfer?.format !== 'leefke-journal-transfer-v1') throw new Error('Keine gültige Browser-Übergabe.');
    M.validateSnapshot(snapshot);
    if (transfer.sha256 !== await transferDigest(snapshot)) throw new Error('Die Übergabedatei ist unvollständig oder verändert.');
    const assert = () => { if (!binding.sessionId || encode(currentBinding()) !== encode(binding)) throw new Error('Anmeldesitzung oder Bestand wurde gewechselt.'); };
    assert();
    const metaRows = snapshot.stores.syncMeta, source = config(metaRows, db);
    if (!source || ['accountId','scope','folderId'].some(key => source[key] !== binding[key])) throw new Error('Die Übergabe gehört zu einem anderen Konto oder Testordner.');
    const entries = metaRows.filter(row => row.id.startsWith('journal:op:'));
    for (const row of entries) {
      J.validate(row.operation, binding.scope);
      if (row.id !== opKey(row.operation.id) || typeof row.pending !== 'boolean' || row.fileId !== null && !/^[A-Za-z0-9_-]{1,160}$/.test(row.fileId || '')) throw new Error('Ungültiger gespeicherter Versandstand.');
    }
    const views = J.materialize(entries.map(row => row.operation), binding.scope);
    const savedViews = metaRows.filter(row => row.id.startsWith('journal:view:'));
    if (views.length !== savedViews.length) throw new Error('Unvollständige Datensatzzuordnung.');
    const tracked = new Set();
    for (const view of views) {
      const saved = savedViews.find(row => row.id === viewKey(view.record));
      if (!saved || encode(saved.view) !== encode(view)) throw new Error('Gespeicherte Fassungen widersprechen dem Journal.');
      const mapping = await prepare(saved.store, saved.key, saved.applied);
      if (mapping.record !== view.record) throw new Error('Ungültige Datensatzzuordnung.');
      const actual = snapshot.stores[saved.store].find(row => row.id === saved.key) || null;
      if (encode(actual) !== encode(saved.applied)) throw new Error('Lokaler Inhalt widerspricht dem Journal.');
      if (!view.conflict && encode(saved.applied) !== encode(view.candidates[0].kind === 'delete' ? null : view.candidates[0].value.record)) throw new Error('Lokale Fassung widerspricht dem Journal.');
      tracked.add(encode([saved.store, saved.key]));
    }
    for (const store of STORES) for (const row of snapshot.stores[store]) if (!tracked.has(encode([store, row.id]))) throw new Error('Nicht zugeordnete lokale Daten in der Übergabe.');
    for (const row of metaRows.filter(row => row.id.startsWith('journal:media:'))) {
      const entry = entries.find(entry => row.id === 'journal:media:' + entry.operation.id);
      if (!entry || !/^[A-Za-z0-9_-]{1,160}$/.test(row.fileId || '') || encode((await root.LeefkeJournalMedia.split(entry.operation)).media?.descriptor || null) !== encode(row.descriptor)) throw new Error('Ungültige Medien-Vormerkung.');
    }
    assert();
    return transaction(db, M.ALL, (tx, done, checked) => {
      let remaining = M.ALL.length;
      for (const store of M.ALL) {
        const read = tx.objectStore(store).getAll();
        read.onsuccess = checked(() => {
          assert();
          if (read.result.some(row => store !== 'syncMeta' || row.id !== BINDING)) throw new Error('Der Übergabebestand ist nicht leer. Vorhandene Daten werden nicht ersetzt.');
          if (store === 'syncMeta') {
            const local = config(read.result, db);
            if (!local || ['accountId','scope','folderId'].some(key => local[key] !== binding[key])) throw new Error('Zielbestand wurde gewechselt.');
          }
          if (--remaining) return;
          for (const name of M.ALL) for (const row of snapshot.stores[name]) tx.objectStore(name).put(row);
          done({ records: STORES.reduce((n, store) => n + snapshot.stores[store].length, 0), pending: entries.filter(row => row.pending).length });
        });
      }
    });
  }
  root.LeefkeAppJournal = Object.freeze({ prepare, stage, bindTest, receive, resolve, exchange, importTest, exportTransfer, importTransfer, restoreTest });
})(globalThis);
