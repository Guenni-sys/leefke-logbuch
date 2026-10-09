/* Conditional writes for the shared Drive JSON file. No credentials or UI state
   live here. The caller supplies its authenticated request function. */
(function (root) {
  'use strict';

  function protectionError(message) {
    const error = new Error(message || 'Google Drive bestätigt den sicheren Schreibschutz nicht. Die gemeinsame Datendatei wurde nicht überschrieben.');
    error.code = 'DRIVE_PROTECTION_UNAVAILABLE';
    return error;
  }

  function conflictError() {
    const error = new Error('Der gemeinsame Datenstand wurde zwischenzeitlich geändert. Lokale Änderungen bleiben offen. Bitte erneut manuell abgleichen.');
    error.code = 'DRIVE_CONFLICT';
    return error;
  }

  class ConditionalDriveStore {
    constructor({ request, api, uploadApi }) {
      this.request = request;
      this.api = api;
      this.uploadApi = uploadApi;
      this.checks = new Map();
      this.cleanupFailures = [];
    }

    async metadata(fileId) {
      const response = await this.request(`${this.api}/files/${encodeURIComponent(fileId)}?fields=id,version`);
      const value = await response.json();
      const etag = response.headers.get('ETag');
      // A weak, hidden or missing validator cannot protect a write.
      if (!etag) throw protectionError('Metadatenprüfung: Im Browser ist kein ETag der Drive-Datei verfügbar. Der benötigte Versionsschutz kann damit nicht aufgebaut werden.');
      if (!/^"[^"\r\n]+"$/.test(etag)) throw protectionError('Metadatenprüfung: Drive liefert keinen verwendbaren starken ETag.');
      if (value.id !== fileId) throw protectionError('Metadatenprüfung: Die zurückgegebene Datei-ID stimmt nicht mit der angefragten Testdatei überein.');
      if (!/^\d+$/.test(String(value.version || ''))) throw protectionError('Metadatenprüfung: Die numerische Drive-Dateiversion fehlt oder ist ungültig.');
      return { fileId, etag, version: String(value.version) };
    }

    async read(fileId) {
      const before = await this.metadata(fileId);
      const response = await this.request(`${this.api}/files/${encodeURIComponent(fileId)}?alt=media`);
      const text = await response.text();
      const after = await this.metadata(fileId);
      if (before.etag !== after.etag || before.version !== after.version) throw conflictError();
      return { text, revision: after };
    }

    async startResumable(fileId, blob, revision) {
      const response = await this.request(`${this.uploadApi}/files/${encodeURIComponent(fileId)}?uploadType=resumable&fields=id,version`, {
        method: 'PATCH', headers: {
          'If-Match': revision.etag, 'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': blob.type || 'application/json', 'X-Upload-Content-Length': String(blob.size)
        }, body: '{}'
      });
      const location = response.headers.get('Location');
      if (!location || new URL(location).origin !== new URL(this.uploadApi).origin) throw protectionError('Google Drive hat keine sichere Upload-Adresse zurückgegeben.');
      return location;
    }

    async finishResumable(location, blob, revision) {
      const response = await this.request(location, {
        method: 'PUT', headers: { 'If-Match': revision.etag, 'Content-Type': blob.type || 'application/json' }, body: blob
      });
      return response.json();
    }

    async upload(fileId, blob, revision, mode) {
      if (mode === 'resumable') {
        const location = await this.startResumable(fileId, blob, revision);
        return this.finishResumable(location, blob, revision);
      }
      const response = await this.request(`${this.uploadApi}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,version`, {
        method: 'PATCH', headers: { 'If-Match': revision.etag, 'Content-Type': blob.type || 'application/json' }, body: blob
      });
      return response.json();
    }

    async expectPreconditionFailure(operation) {
      try { await operation(); }
      catch (error) {
        if (error.status === 412) return;
        throw protectionError('Konfliktprüfung: Der veraltete Schreibversuch lieferte ' + (error.status ? 'HTTP ' + error.status : 'einen Netzwerk- oder Browserfehler') + ' statt des erwarteten HTTP 412.');
      }
      throw protectionError('Konfliktprüfung: Drive hat einen Schreibversuch mit veraltetem ETag angenommen. Der benötigte Schutz wurde nicht bestätigt.');
    }

    async verify(mode = 'media') {
      if (!['media', 'resumable'].includes(mode)) throw protectionError();
      if (!this.checks.has(mode)) {
        const pending = this.probe(mode).catch(error => { this.checks.delete(mode); throw error; });
        this.checks.set(mode, pending);
      }
      return this.checks.get(mode);
    }

    async probe(mode) {
      // Only self-created, uniquely identified scratch files are used. An API
      // ignoring If-Match can therefore never damage the user's record file.
      let fileId;
      try {
        const response = await this.request(`${this.api}/files?fields=id`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `LEEFKE_Schreibschutztest_${Date.now()}.json`, mimeType: 'application/json',
            appProperties: { leefkeRole: 'conditional-write-probe-v1', leefkeEnvironment: 'test' } })
        });
        const created = await response.json();
        if (!created.id) throw protectionError('Testdatei anlegen: Drive hat keine Datei-ID zurückgegeben.');
        fileId = created.id;
        const first = await this.metadata(fileId);
        const a = new Blob(['{"probe":"a"}'], { type: 'application/json' });
        const b = new Blob(['{"probe":"b"}'], { type: 'application/json' });
        const c = new Blob(['{"probe":"c"}'], { type: 'application/json' });
        // First require a working conditional update, then reject its stale tag.
        await this.upload(fileId, a, first, 'media');
        await this.expectPreconditionFailure(() => this.upload(fileId, b, first, 'media'));
        if ((await this.read(fileId)).text !== await a.text()) throw protectionError('Inhaltsprüfung: Der Inhalt blieb nach dem abgewiesenen veralteten Schreibversuch nicht erhalten.');
        if (mode === 'resumable') {
          const second = await this.metadata(fileId);
          const location = await this.startResumable(fileId, c, second);
          await this.upload(fileId, b, second, 'media');
          // Checking only the session's initiation would leave a lost-update
          // window. The stale final PUT must also be rejected at commit time.
          await this.expectPreconditionFailure(() => this.finishResumable(location, c, second));
          const current = await this.read(fileId);
          if (current.text !== await b.text()) throw protectionError('Upload-Abschlussprüfung: Der neuere Inhalt blieb nach dem veralteten Upload nicht erhalten.');
          await this.upload(fileId, c, current.revision, 'resumable');
          if ((await this.read(fileId)).text !== await c.text()) throw protectionError('Upload-Inhaltsprüfung: Der gültige fortsetzbare Upload wurde nicht korrekt zurückgelesen.');
        }
        return { verified: true, mode };
      } finally {
        if (fileId) {
          try { await this.request(`${this.api}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }); }
          catch (error) {
            if (error.status !== 404) this.cleanupFailures.push(fileId);
          }
        }
      }
    }

    async write(fileId, blob, revision) {
      if (!revision || revision.fileId !== fileId || !/^"[^"\r\n]+"$/.test(revision.etag || '')) throw protectionError('Der gelesene Versionsstand fehlt. Bitte zuerst erneut abgleichen.');
      const mode = blob.size > 4_500_000 ? 'resumable' : 'media';
      await this.verify(mode);
      try {
        const uploaded = await this.upload(fileId, blob, revision, mode);
        const next = await this.metadata(fileId);
        // Never attach a later writer's tag to our cached content.
        if (uploaded.id !== fileId || !uploaded.version || String(uploaded.version) !== next.version) throw conflictError();
        return { file: uploaded, revision: next };
      } catch (error) {
        if (error.status === 412) throw conflictError();
        throw error;
      }
    }
  }

  const exports = { ConditionalDriveStore, conflictError, protectionError };
  if (typeof module === 'object' && module.exports) module.exports = exports;
  else root.LeefkeDriveConcurrency = exports;
})(globalThis);
