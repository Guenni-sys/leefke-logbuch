/* Immutable, verified media files for the gated app journal exchange. */
(function (root) {
  'use strict';
  const J = typeof module === 'object' && module.exports ? require('./prototype/journal.js') : root.LeefkeJournal;
  const copy = value => JSON.parse(J.canonical(value));
  const LIMIT = 15_000_000, API = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const fail = message => { throw new Error(message); };
  const fieldFor = op => op.kind === 'put' ? ({ photos: 'data', documents: 'data', settings: 'boatPhoto' })[op.value.legacyStore] : null;
  const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  function base64(bytes) {
    let text = ''; for (let offset = 0; offset < bytes.length; offset += 16384) text += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    return btoa(text);
  }
  async function split(operation) {
    const op = copy(operation); J.validate(op, op.scope);
    if (op.kind === 'put' && Object.hasOwn(op.value, 'leefkeMedia')) fail('Reserviertes Medienfeld in lokalen Nutzdaten.');
    const field = fieldFor(op), data = field && op.value.record?.[field];
    if (!data) return { op, media: null };
    if (typeof data !== 'string' || data.length > LIMIT * 4 / 3 + 256) fail('Medieninhalt ist ungültig oder größer als 15 MB.');
    const match = /^(data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,)([A-Za-z0-9+/]*={0,2})$/.exec(data);
    if (!match) fail('Medieninhalt ist keine unterstützte vollständige Base64-Datei.');
    let bytes; try { bytes = Uint8Array.from(atob(match[3]), c => c.charCodeAt(0)); } catch { fail('Ungültige Base64-Datei.'); }
    if (!bytes.length || bytes.length > LIMIT || base64(bytes) !== match[3]) fail('Unvollständige oder übergroße Mediendatei.');
    const descriptor = { schema: 1, field, prefix: match[1], size: bytes.length, sha256: await hash(bytes) };
    delete op.value.record[field];
    return { op, media: { bytes, mime: match[2], descriptor } };
  }
  function validateRef(op) {
    const ref = op.value.leefkeMedia;
    if (!ref || Object.keys(ref).sort().join() !== 'field,fileId,prefix,schema,sha256,size' || ref.schema !== 1 || ref.field !== fieldFor(op) || !ref.field || Object.hasOwn(op.value.record, ref.field) || !/^[A-Za-z0-9_-]{1,160}$/.test(ref.fileId) || !/^data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,$/.test(ref.prefix) || !/^[a-f0-9]{64}$/.test(ref.sha256) || !Number.isSafeInteger(ref.size) || ref.size < 1 || ref.size > LIMIT) fail('Ungültiger Medienverweis im Änderungsprotokoll.');
    return ref;
  }
  function wrap(drive, reserve, assert, cache = null) {
    const request = async (url, options) => { assert(); const response = await drive.request(url, options); assert(); return response; };
    async function read(op, ref) {
      const url = `${API}/files/${ref.fileId}`;
      const metadata = async () => {
        const value = await (await request(url + '?fields=id,parents,appProperties,trashed,size,version,mimeType')).json(); assert();
        const props = value.appProperties || {};
        if (value.id !== ref.fileId || value.trashed || !value.parents?.includes(drive.folderId) || props.leefkeMediaScope !== drive.scope || props.leefkeEnvironment !== (drive.environment || 'test') || props.leefkeOperation !== op.id || props.leefkeRecord !== op.record || props.sha256 !== ref.sha256 || String(ref.size) !== String(value.size) || !value.version || value.mimeType !== ref.prefix.slice(5, -8)) fail('Mediendatei gehört nicht unverändert zu dieser Änderung.');
        return value;
      };
      const before = await metadata();
      const cachedVersion = cache?.mediaVersion(ref.fileId), local = cache?.localOperation(op.id);
      if (cachedVersion === before.version && local) {
        const cached = await split(local); assert();
        if (cached.media && J.canonical({ ...cached.media.descriptor, fileId: ref.fileId }) === J.canonical(ref)) {
          cached.op.value.leefkeMedia = ref;
          if (J.canonical(cached.op) === J.canonical(op)) return cached.media.bytes;
        }
      }
      const readVerified = async () => {
        const bytes = new Uint8Array(await (await request(url + '?alt=media')).arrayBuffer()); assert();
        if (bytes.length !== ref.size || await hash(bytes) !== ref.sha256) fail('Mediendatei ist unvollständig oder verändert.');
        assert(); return bytes;
      };
      let bytes = await readVerified();
      let after = await metadata();
      if (before.version !== after.version) {
        // Drive version includes server-side metadata changes, not only bytes.
        // Re-read once against the immutable journal digest; never accept a
        // different payload, and recheck scope/ownership after this second read.
        bytes = await readVerified(); after = await metadata();
      }
      // Only a stable read receives a reusable version receipt. A metadata
      // change is accepted after byte verification but must be downloaded again.
      if (before.version === after.version) cache?.saveMediaVersion(ref.fileId, after.version);
      assert(); return bytes;
    }
    return {
      accountId: drive.accountId, sessionId: drive.sessionId, scope: drive.scope, folderId: drive.folderId,
      allocate: () => drive.allocate(),
      async create(fileId, operation) {
        const { op, media } = await split(operation); assert();
        if (media) {
          const mediaId = await reserve(operation, media.descriptor, () => drive.allocate()); assert();
          const ref = { ...media.descriptor, fileId: mediaId }; op.value.leefkeMedia = ref; validateRef(op);
          if (new Blob([J.canonical(op)]).size > 1_000_000) fail('Änderungsdaten sind auch ohne Medien größer als 1 MB.');
          const metadata = { id: mediaId, name: `LEEFKE_Medium_${operation.id}`, mimeType: media.mime, parents: [drive.folderId], appProperties: { leefkeMediaScope: drive.scope, leefkeEnvironment: drive.environment || 'test', leefkeOperation: operation.id, leefkeRecord: operation.record, sha256: ref.sha256 } };
          const boundary = 'leefke_media_' + crypto.randomUUID();
          const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify(metadata), `\r\n--${boundary}\r\nContent-Type: ${media.mime}\r\n\r\n`, media.bytes, `\r\n--${boundary}--\r\n`]);
          try { await request(UPLOAD + '/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body }); }
          catch (error) { if (error.status !== 409) throw error; }
          await read(op, ref); // An existing ID is not proof of identical bytes or ownership.
        }
        assert(); await drive.create(fileId, op); assert();
      },
      async list() {
        const operations = copy(await drive.list(cache?.wire)); assert();
        for (const op of operations) {
          J.validate(op, drive.scope);
          if (op.kind !== 'put' || !Object.hasOwn(op.value, 'leefkeMedia')) continue;
          const ref = validateRef(op), bytes = await read(op, ref);
          op.value.record[ref.field] = ref.prefix + base64(bytes); delete op.value.leefkeMedia;
        }
        assert(); return operations;
      }
    };
  }
  const exports = { split, wrap };
  if (typeof module === 'object' && module.exports) module.exports = exports; else root.LeefkeJournalMedia = Object.freeze(exports);
})(globalThis);
