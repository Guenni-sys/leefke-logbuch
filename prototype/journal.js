/* Immutable journal transport with explicit test/production folder separation. No clocks decide conflicts. */
(function (root) {
  'use strict';
  const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
  const fail = message => { throw new Error(message); };
  function canonical(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return fail('Nur JSON-Werte sind im Änderungsprotokoll erlaubt.');
  }
  function validate(op, scope) {
    if (!op || op.schema !== 1 || op.scope !== scope || !id(scope) || !id(op.id) || !id(op.record) || !id(op.actor)) fail('Ungültiger oder fremder Änderungseintrag.');
    if (!Array.isArray(op.parents) || !op.parents.every(id) || new Set(op.parents).size !== op.parents.length || op.parents.includes(op.id)) fail('Ungültige Vorgänger.');
    if (!['put', 'delete'].includes(op.kind) || (op.kind === 'delete' && op.value !== null)) fail('Ungültige Änderungsart.');
    if (op.kind === 'put' && (!op.value || Array.isArray(op.value) || typeof op.value !== 'object')) fail('Ein Datensatz muss ein JSON-Objekt sein.');
    if (Object.hasOwn(op, 'target') && (op.kind !== 'delete' || !op.target || Object.keys(op.target).sort().join() !== 'key,store' || typeof op.target.store !== 'string' || !op.target.store || !((typeof op.target.key === 'string' && op.target.key.length) || (typeof op.target.key === 'number' && Number.isSafeInteger(op.target.key))))) fail('Ungültige Löschzuordnung.');
    canonical(op);
    return op;
  }
  function materialize(operations, scope) {
    const byId = new Map();
    for (const raw of operations) {
      const op = validate(raw, scope);
      if (byId.has(op.id) && canonical(byId.get(op.id)) !== canonical(op)) fail('Dieselbe Änderungs-ID enthält unterschiedliche Inhalte.');
      byId.set(op.id, op);
    }
    const children = new Map(); const counts = new Map();
    for (const op of byId.values()) {
      counts.set(op.id, op.parents.length);
      for (const parent of op.parents) {
        if (!byId.has(parent)) fail('Ein Vorgänger fehlt. Der Datenstand ist unvollständig.');
        if (byId.get(parent).record !== op.record) fail('Vorgänger gehört zu einem anderen Datensatz.');
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(op.id);
      }
    }
    const queue = [...counts].filter(([, n]) => n === 0).map(([key]) => key);
    for (let i = 0; i < queue.length; i++) for (const child of children.get(queue[i]) || []) {
      counts.set(child, counts.get(child) - 1); if (counts.get(child) === 0) queue.push(child);
    }
    if (queue.length !== byId.size) fail('Zyklische Vorgänger im Änderungsprotokoll.');
    const records = new Map();
    for (const op of byId.values()) if (!children.has(op.id)) {
      if (!records.has(op.record)) records.set(op.record, []);
      records.get(op.record).push(op);
    }
    return [...records].sort(([a], [b]) => a.localeCompare(b)).map(([record, candidates]) => ({
      record, conflict: candidates.length > 1,
      candidates: candidates.sort((a, b) => a.id.localeCompare(b.id)).map(op => JSON.parse(canonical(op)))
    }));
  }
  class JournalDrive {
    constructor({ request, scope, folderId, environment = 'test', api = 'https://www.googleapis.com/drive/v3', upload = 'https://www.googleapis.com/upload/drive/v3' }) {
      if (!id(scope) || !id(folderId)) fail('Ungültiger Testbestand.');
      if (!['test', 'production'].includes(environment)) fail('Ungültige Bestandsumgebung.');
      Object.assign(this, { request, scope, folderId, environment, api, upload });
    }
    async allocate() {
      const response = await this.request(this.api + '/files/generateIds?count=1&space=drive&type=files');
      const result = await response.json();
      if (!Array.isArray(result.ids) || result.ids.length !== 1 || !id(result.ids[0])) fail('Drive hat keine eindeutige Datei-ID geliefert.');
      return result.ids[0];
    }
    async read(fileId) {
      if (!id(fileId)) fail('Ungültige Datei-ID.');
      const metadata = await (await this.request(`${this.api}/files/${fileId}?fields=id,parents,appProperties,trashed`)).json();
      if (metadata.id !== fileId || metadata.trashed || !metadata.parents?.includes(this.folderId) || metadata.appProperties?.leefkeJournal !== this.scope || (this.environment === 'production' ? metadata.appProperties?.leefkeEnvironment !== 'production' : metadata.appProperties?.leefkeEnvironment === 'production')) fail('Datei gehört nicht zum erwarteten Testbestand.');
      const op = await (await this.request(`${this.api}/files/${fileId}?alt=media`)).json();
      return validate(op, this.scope);
    }
    async create(fileId, operation) {
      if (!id(fileId)) fail('Vor dem Upload muss eine feste Datei-ID lokal gespeichert sein.');
      const text = canonical(validate(operation, this.scope));
      if (new Blob([text]).size > 1_000_000) fail('Prototyp: Änderung größer als 1 MB wird nicht übertragen.');
      const metadata = { id: fileId, name: `LEEFKE_Aenderung_${operation.id}.json`, mimeType: 'application/json', parents: [this.folderId], appProperties: { leefkeJournal: this.scope, leefkeEnvironment: this.environment } };
      const boundary = 'leefke_' + crypto.randomUUID();
      const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify(metadata), `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`, text, `\r\n--${boundary}--\r\n`]);
      try {
        await this.request(this.upload + '/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body });
      } catch (error) { if (error.status !== 409) throw error; }
      // A conflict means only that the ID exists, never that its content is ours.
      if (canonical(await this.read(fileId)) !== text) fail('Vorhandene Datei stimmt nicht mit der vorgemerkten Änderung überein.');
      return fileId;
    }
    async list(cache = null) {
      const params = new URLSearchParams({ q: `'${this.folderId}' in parents and trashed = false and appProperties has { key='leefkeJournal' and value='${this.scope}' }`, fields: 'files(id,version),nextPageToken,incompleteSearch', pageSize: '100' });
      const seen = new Set(); const ids = new Map();
      while (true) {
        const page = await (await this.request(this.api + '/files?' + params)).json();
        if (page.incompleteSearch || (page.files !== undefined && !Array.isArray(page.files))) fail('Unvollständige Drive-Dateisuche.');
        for (const file of page.files || []) {
          if (!id(file.id)) fail('Ungültige Datei in der Suche.');
          if (ids.has(file.id) && ids.get(file.id) !== file.version) fail('Dateiversion wechselte während der Dateisuche.');
          ids.set(file.id, file.version);
        }
        if (!page.nextPageToken) break;
        if (seen.has(page.nextPageToken)) fail('Wiederholte Suchseite.');
        seen.add(page.nextPageToken); params.set('pageToken', page.nextPageToken);
      }
      const operations = [];
      for (const [fileId, version] of ids) {
        const saved = cache?.get(fileId);
        if (typeof version === 'string' && /^\d+$/.test(version) && saved?.version === version) {
          operations.push(JSON.parse(canonical(validate(saved.operation, this.scope))));
        } else {
          const operation = await this.read(fileId); operations.push(operation);
          // The listing version precedes the verified read. A later server
          // version invalidates this cache on the next manual/startup exchange.
          if (typeof version === 'string' && /^\d+$/.test(version)) cache?.set(fileId, { version, operation });
        }
      }
      materialize(operations, this.scope); // Reject incomplete or malformed graphs.
      return operations;
    }
  }
  const exports = { canonical, validate, materialize, JournalDrive };
  if (typeof module === 'object' && module.exports) module.exports = exports; else root.LeefkeJournal = exports;
})(globalThis);
