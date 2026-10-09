/* Session-bound transport for the isolated journal; never stores credentials. */
(function (root) {
  'use strict';
  const API = 'https://www.googleapis.com/drive/v3';
  const authError = () => Object.assign(new Error('Die Google-Anmeldesitzung ist nicht mehr gültig. Bitte erneut verbinden.'), { code: 'GOOGLE_AUTH_REQUIRED' });
  class GoogleJournalSession {
    #state = null; #ticket = null; #fetch; #now; #timeout;
    constructor({ fetchImpl = (...args) => fetch(...args), now = () => Date.now(), timeoutMs = 30000 } = {}) {
      this.#fetch = fetchImpl; this.#now = now; this.#timeout = timeoutMs;
    }
    begin() { this.logout(); this.#ticket = crypto.randomUUID(); return this.#ticket; }
    cancel(ticket) { if (ticket === this.#ticket) { this.logout(); return true; } return false; }
    logout() {
      const old = this.#state; this.#state = null; this.#ticket = null;
      if (old) for (const controller of old.controllers) controller.abort();
    }
    #assert(state) {
      if (this.#state !== state || state.expiresAt <= this.#now() + 5000) throw authError();
    }
    async accept(ticket, response) {
      if (ticket !== this.#ticket || !ticket || this.#state) throw authError();
      if (response?.error || typeof response?.access_token !== 'string' || !response.access_token || !Number.isFinite(Number(response.expires_in)) || Number(response.expires_in) <= 5) throw authError();
      const state = { token: response.access_token, expiresAt: this.#now() + Number(response.expires_in) * 1000, sessionId: ticket, accountId: null, controllers: new Set() };
      this.#state = state;
      try {
        const about = await (await this.#request(state, API + '/about?fields=user(permissionId)')).json();
        this.#assert(state);
        if (typeof about.user?.permissionId !== 'string' || !about.user.permissionId) throw new Error('Google hat keine eindeutige Konto-ID bestätigt.');
        state.accountId = about.user.permissionId;
        return Object.freeze({ accountId: state.accountId, sessionId: state.sessionId });
      } catch (error) { if (this.#state === state) this.logout(); throw error; }
    }
    async #request(state, url, options = {}) {
      this.#assert(state);
      const address = new URL(url);
      if (address.origin !== 'https://www.googleapis.com' || address.username || address.password || !/^\/(?:upload\/)?drive\/v3\//.test(address.pathname)) throw new Error('Unzulässige Adresse für den Google-Transport.');
      const controller = new AbortController(); state.controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), this.#timeout);
      try {
        const headers = new Headers(options.headers || {}); headers.set('Authorization', 'Bearer ' + state.token);
        // A manual redirect on a read is observable without following it or
        // disclosing credentials to another destination. Writes still fail closed.
        const contentRead = (options.method || 'GET').toUpperCase() === 'GET' && address.searchParams.get('alt') === 'media';
        const response = await this.#fetch(url, { ...options, headers, signal: controller.signal, redirect: contentRead ? 'manual' : 'error', credentials: 'omit', cache: 'no-store' });
        this.#assert(state);
        if (response.type === 'opaqueredirect' || response.status >= 300 && response.status < 400) throw Object.assign(new Error('Google Drive – Dateiinhalt prüfen: Google liefert eine Weiterleitung. Sie wurde nicht verfolgt; die Inhaltsprüfung ist noch offen.'), { code: 'DRIVE_CONTENT_REDIRECT' });
        if (response.status === 401) { this.logout(); throw authError(); }
        if (!response.ok) throw Object.assign(new Error('Google Drive meldet HTTP ' + response.status), { status: response.status });
        // Keep timeout and session checks active while reading the response body.
        const bytes = await response.arrayBuffer(); this.#assert(state);
        return new Response([204, 205].includes(response.status) ? null : bytes, { status: response.status, headers: response.headers });
      } catch (error) {
        if (this.#state !== state) throw authError();
        if (controller.signal.aborted) throw Object.assign(new Error('Die Drive-Anfrage wurde abgebrochen oder hat das Zeitlimit erreicht. Offene Änderungen bleiben erhalten.'), { code: 'DRIVE_REQUEST_TIMEOUT' });
        if (error instanceof TypeError) {
          const step = address.pathname.startsWith('/upload/') ? 'Datei hochladen' : address.pathname.endsWith('/generateIds') ? 'Dateikennung anfordern' : address.searchParams.get('alt') === 'media' ? 'Dateiinhalt prüfen' : 'Dateiinformationen lesen';
          throw Object.assign(new Error(`Google Drive – ${step}: Netzwerkzugriff fehlgeschlagen. Offene Änderungen bleiben erhalten; bitte die Verbindung prüfen und manuell erneut abgleichen.`), { code: 'DRIVE_NETWORK_ERROR' });
        }
        throw error;
      } finally { clearTimeout(timeout); state.controllers.delete(controller); }
    }
    capture() {
      const state = this.#state; if (!state?.accountId) throw authError(); this.#assert(state);
      const manager = this;
      return Object.freeze({
        accountId: state.accountId, sessionId: state.sessionId,
        request: (url, options) => manager.#request(state, url, options),
        currentBinding: (scope, folderId) => {
          try { manager.#assert(state); return { accountId: state.accountId, sessionId: state.sessionId, scope, folderId }; } catch { return null; }
        },
        async workspace(scope, folderId, environment = 'test') {
          if (!['test', 'production'].includes(environment)) throw new Error('Ungültige Bestandsumgebung.');
          if (!/^[A-Za-z0-9_-]{1,160}$/.test(scope) || !/^[A-Za-z0-9_-]{1,160}$/.test(folderId)) throw new Error('Ungültige Bestandszuordnung.');
          const request = (url, options) => manager.#request(state, url, options);
          const folder = await (await request(`${API}/files/${folderId}?fields=id,mimeType,trashed,appProperties`)).json();
          if (folder.id !== folderId || folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' || folder.appProperties?.leefkeJournal !== scope || folder.appProperties?.leefkeEnvironment !== environment) throw new Error('Der Ordner ist kein bestätigter Journal-Testbestand.');
          manager.#assert(state);
          const binding = Object.freeze({ accountId: state.accountId, scope, folderId, sessionId: state.sessionId });
          const drive = new LeefkeJournal.JournalDrive({ request, scope, folderId, environment });
          Object.defineProperties(drive, { accountId: { value: state.accountId }, sessionId: { value: state.sessionId } });
          // Token expiry stops network access, not offline edits in this already
          // opened, confirmed local namespace. Logout/account switch invalidates it.
          const currentSession = () => manager.#state === state ? binding : null;
          return { drive, binding, async open(actor) {
            manager.#assert(state);
            const bytes = new TextEncoder().encode(JSON.stringify([state.accountId, scope, folderId, actor]));
            const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
            manager.#assert(state);
            return LeefkeJournalReplica.open('leefke-journal-test-replica-' + digest, binding, actor, currentSession);
          } };
        }
      });
    }
  }
  if (typeof module === 'object' && module.exports) module.exports = { GoogleJournalSession }; else root.GoogleJournalSession = GoogleJournalSession;
})(globalThis);
