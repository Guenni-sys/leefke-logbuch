/* Read-only migration preparation. Never uploads, deletes or activates a plan. */
(function (root) {
  'use strict';
  const Journal = typeof module === 'object' && module.exports ? require('./journal') : root.LeefkeJournal;
  const SYNC = Object.freeze(['days', 'fuel', 'maintenance', 'photos', 'checklists', 'route', 'ports', 'settings', 'trips', 'gpx', 'weather', 'inventory', 'safety', 'documents', 'changeLog', 'conflicts', 'devices', 'routeWeather']);
  const LOCAL = Object.freeze(['autoBackups', 'syncMeta', 'syncTombstones']);
  const ALL = Object.freeze([...SYNC, ...LOCAL]);
  const encode = Journal.canonical;
  const copy = value => JSON.parse(encode(value));
  const fail = text => { throw new Error(text); };
  const recordId = value => {
    if ((typeof value !== 'string' || !value) && (typeof value !== 'number' || !Number.isSafeInteger(value))) fail('Ungültige Altdatensatz-ID.');
    return String(value);
  };
  async function hash(value) {
    const bytes = new TextEncoder().encode(encode(value));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
  }
  function validateSnapshot(snapshot) {
    if (snapshot?.format !== 'leefke-migration-snapshot-v1' || !['8.24', '8.25'].includes(snapshot.appVersion) || snapshot.databaseVersion !== 7) fail('Nur vollständige lokale Snapshots aus LEEFKE 8.24 oder 8.25 / Datenbank 7 werden unterstützt.');
    if (!snapshot.stores || Object.keys(snapshot.stores).sort().join() !== [...ALL].sort().join()) fail('Tabellen fehlen oder sind unbekannt. Kein stillschweigender Teilimport.');
    for (const store of ALL) {
      if (!Array.isArray(snapshot.stores[store])) fail('Ungültige Tabelle: ' + store);
      const seen = new Set();
      for (const row of snapshot.stores[store]) {
        if (!row || Array.isArray(row) || typeof row !== 'object') fail('Ungültiger Datensatz in ' + store);
        const id = recordId(row.id); if (seen.has(id)) fail('Mehrdeutige Datensatz-ID in ' + store); seen.add(id);
      }
    }
    for (const tomb of snapshot.stores.syncTombstones) {
      if (!SYNC.includes(tomb.recordType) || tomb.id !== `${tomb.recordType}:${recordId(tomb.recordId)}` || typeof tomb.updatedAt !== 'string' || !Number.isFinite(Date.parse(tomb.updatedAt))) fail('Ungültige Löschvormerkung.');
    }
    encode(snapshot); // Reject non-JSON values instead of silently dropping them.
  }
  async function prepare(snapshot, scope) {
    if (typeof scope !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(scope)) fail('Ungültige Zielbestandskennung.');
    validateSnapshot(snapshot);
    const source = copy(snapshot); const sourceHash = await hash(source);
    const operations = []; const records = new Map(); const media = []; const blockers = new Set(['CLOUD_BASELINE_NOT_RECONCILED']);
    const counts = Object.fromEntries(ALL.map(store => [store, source.stores[store].length]));
    async function key(store, id) {
      const logical = [store, recordId(id)]; const record = 'r_' + await hash(logical);
      if (records.has(record) && encode(records.get(record)) !== encode(logical)) fail('Kollision bei der Datensatzzuordnung.');
      records.set(record, logical); return record;
    }
    for (const store of SYNC) for (const record of source.stores[store]) {
      const value = { legacyStore: store, legacyRecordId: recordId(record.id), record };
      const operation = { schema: 1, scope, actor: 'migration-v1', id: 'm_' + await hash([scope, store, record]), record: await key(store, record.id), parents: [], kind: 'put', value };
      Journal.validate(operation, scope); operations.push(operation);
      if (new Blob([encode(operation)]).size > 1_000_000) blockers.add('OPERATION_EXCEEDS_PROTOTYPE_LIMIT');
      const path = store === 'settings' ? record.boatPhotoStoragePath : record.storagePath;
      const data = store === 'settings' ? record.boatPhoto : ['photos', 'documents'].includes(store) ? record.data : null;
      if (path || data) {
        media.push({ store, recordId: recordId(record.id), storagePath: path || null, localContentPresent: Boolean(data) });
        blockers.add('MEDIA_CONTENT_AND_REFERENCES_REQUIRE_RECONCILIATION');
        if (path && (typeof path !== 'string' || !path.startsWith('gdrive:'))) blockers.add('LEGACY_MEDIA_PATH');
      }
    }
    for (const tomb of source.stores.syncTombstones) {
      const operation = { schema: 1, scope, actor: 'migration-v1', id: 'd_' + await hash(['delete-target-v1', scope, tomb]), record: await key(tomb.recordType, tomb.recordId), parents: [], kind: 'delete', value: null, target: { store: tomb.recordType, key: tomb.recordId } };
      Journal.validate(operation, scope); operations.push(operation);
      if (tomb.storagePath) { media.push({ store: tomb.recordType, recordId: recordId(tomb.recordId), storagePath: tomb.storagePath, deletionPending: true }); blockers.add('MEDIA_DELETION_PENDING'); }
    }
    if (Journal.materialize(operations, scope).some(row => row.conflict)) blockers.add('LOCAL_RECORD_AND_TOMBSTONE_CONFLICT');
    if (counts.conflicts) blockers.add('LEGACY_CONFLICT_RECORDS_REQUIRE_REVIEW');
    const plan = {
      format: 'leefke-migration-plan-v1', scope, sourceHash, sourceVersion: '8.24', databaseVersion: 7,
      activationAllowed: false, blockers: [...blockers].sort(), counts, operations,
      recordMap: [...records].map(([record, [store, id]]) => ({ record, store, id })).sort((a, b) => a.record.localeCompare(b.record)),
      localArchive: Object.fromEntries(LOCAL.map(store => [store, source.stores[store]])),
      media, sourceEnvelope: Object.fromEntries(Object.entries(source).filter(([name]) => name !== 'stores'))
    };
    plan.planHash = await hash(plan); return plan;
  }
  async function verify(plan, snapshot) {
    const expected = await prepare(snapshot, plan.scope);
    if (encode(plan) !== encode(expected)) fail('Migrationsplan oder Quellsnapshot wurde verändert. Neu vorbereiten.');
    return true;
  }
  async function restoreSource(plan) {
    if (plan?.format !== 'leefke-migration-plan-v1') fail('Unbekannter Migrationsplan.');
    const { planHash, ...body } = plan;
    if (await hash(body) !== planHash) fail('Prüfsumme des Migrationsplans stimmt nicht.');
    const stores = Object.fromEntries(SYNC.map(store => [store, []]));
    for (const store of LOCAL) stores[store] = copy(plan.localArchive[store]);
    for (const op of plan.operations) if (op.kind === 'put') {
      Journal.validate(op, plan.scope);
      if (!SYNC.includes(op.value.legacyStore)) fail('Unbekannte Zieltabelle.');
      stores[op.value.legacyStore].push(copy(op.value.record));
    }
    const restored = { ...copy(plan.sourceEnvelope), stores };
    validateSnapshot(restored);
    if (await hash(restored) !== plan.sourceHash) fail('Der ursprüngliche Snapshot lässt sich nicht vollständig rekonstruieren.');
    return restored;
  }
  function capture(db, appVersion) {
    if (db.version !== 7 || !['8.24', '8.25'].includes(appVersion) || [...db.objectStoreNames].sort().join() !== [...ALL].sort().join()) return Promise.reject(new Error('Datenbankschema passt nicht zu LEEFKE 8.24.'));
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ALL, 'readonly'); const stores = {};
      for (const store of ALL) { const request = tx.objectStore(store).getAll(); request.onsuccess = () => { stores[store] = request.result; }; }
      tx.oncomplete = () => {
        try { const snapshot = { format: 'leefke-migration-snapshot-v1', appVersion, databaseVersion: db.version, stores }; validateSnapshot(snapshot); resolve(snapshot); } catch (error) { reject(error); }
      };
      tx.onabort = () => reject(tx.error || new Error('Snapshot konnte nicht vollständig gelesen werden.'));
      tx.onerror = () => {};
    });
  }
  const api = { SYNC, LOCAL, ALL, prepare, verify, restoreSource, capture, validateSnapshot };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LeefkeJournalMigration = api;
})(globalThis);
