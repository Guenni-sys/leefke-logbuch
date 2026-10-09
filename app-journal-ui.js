/* Shared journal UI. Working checkout uses test folders; packaged release uses a separate production database and folder. */
(function (root) {
  'use strict';
  let database, panel, message, counter, conflicts, select, connectButton, chooseButton, syncButton, fileInput;
  let workspace = null, capture = null, busy = false, ready = false, hasBinding = false, createButton;
  let conflictSignature = '';
  const handoff = root.LEEFKE_RELEASE?.journal !== true && new URLSearchParams(location.search).get('handoff') === '1';
  let transferButton, sourceButton, migrationNotice;
  const release = root.LEEFKE_RELEASE?.journal === true;
  const environment = release ? 'production' : 'test';
  const session = new GoogleJournalSession();
  const node = (tag, text) => { const element = document.createElement(tag); if (text) element.textContent = wording(text); return element; };
  const bindingNow = () => workspace && capture?.currentBinding(workspace.binding.scope, workspace.binding.folderId);
  function connected() { try { return Boolean(bindingNow()); } catch { return false; } }
  function keepScreenAwake(report) {
    let active = true, lock = null, requesting = false;
    const show = value => { if (active) report(value); };
    const releaseLock = value => { try { Promise.resolve(value.release()).catch(() => {}); } catch {} };
    async function acquire() {
      if (!active || requesting || lock) return;
      if (document.visibilityState !== 'visible') { show('hidden'); return; }
      if (!navigator.wakeLock?.request) { show('unavailable'); return; }
      requesting = true;
      try {
        const value = await navigator.wakeLock.request('screen');
        if (!active || document.visibilityState !== 'visible') { releaseLock(value); return; }
        if (value.released) { show('unavailable'); return; }
        lock = value; show('held');
        value.addEventListener('release', () => {
          if (lock === value) { lock = null; show(document.visibilityState === 'visible' ? 'unavailable' : 'hidden'); }
        });
      } catch { show('unavailable'); }
      finally { requesting = false; }
    }
    const visibility = () => {
      if (document.visibilityState === 'visible') { void acquire(); }
      else { show('hidden'); if (lock) { const value = lock; lock = null; releaseLock(value); } }
    };
    document.addEventListener('visibilitychange', visibility);
    show('requesting'); void acquire();
    return () => {
      active = false; document.removeEventListener('visibilitychange', visibility);
      if (lock) { const value = lock; lock = null; releaseLock(value); }
    };
  }
  function open(messageText) {
    if (release) view('sync');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (messageText) tell(messageText);
    return { ok: false, reason: 'journal-action-required' };
  }
  const rows = () => new Promise((resolve, reject) => {
    const tx = database.transaction('syncMeta'), r = tx.objectStore('syncMeta').getAll();
    tx.oncomplete = () => resolve(r.result); tx.onabort = () => reject(tx.error);
  });
  const wording = text => release ? text.replaceAll('Testbestände', 'Bordbücher').replaceAll('Testbestand', 'Bordbuch').replaceAll('Testordner', 'Bordbuchordner').replaceAll('Journal-Testordner', 'Bordbuchordner').replaceAll('Testbereich', 'Abgleichbereich') : text;
  const tell = text => { message.textContent = wording(text); };
  function controls() {
    connectButton.disabled = busy; chooseButton.disabled = busy || !capture; select.disabled = busy || !capture;
    syncButton.disabled = busy || !workspace; fileInput.disabled = busy || !workspace || ready;
    createButton.disabled = handoff || busy || !capture || hasBinding;
    if (transferButton) transferButton.disabled = busy || !ready;
    for (const button of conflicts.querySelectorAll('button')) button.disabled = busy;
    if (sourceButton) { sourceButton.disabled = busy || !workspace || ready; sourceButton.hidden = ready; }
    if (migrationNotice) migrationNotice.hidden = ready;
    if (release && fileInput) fileInput.parentElement.hidden = ready;
    if (release) {
      document.querySelector('main').inert = false;
      for (const section of document.querySelectorAll('main .view')) section.inert = section.id !== 'sync' && (!ready || busy);
    } else document.querySelector('main').inert = !ready || busy;
  }
  async function run(work) {
    if (busy) return; busy = true; controls();
    try { return await work(); } catch (error) {
      try { await renderStatus(); } catch { /* Preserve the original failure. */ }
      tell(error.message || String(error)); return { ok: false };
    }
    finally { busy = false; controls(); }
  }
  async function renderStatus() {
    const data = await rows();
    hasBinding = data.some(row => row.id === 'journal:binding');
    ready = Boolean(data.find(row => row.id === 'journal:migration') || data.some(row => row.id.startsWith('journal:view:')));
    const pending = data.filter(row => row.id.startsWith('journal:op:') && row.pending).length;
    const unresolved = data.filter(row => row.id.startsWith('journal:view:') && row.view.conflict);
    const online = connected();
    counter.textContent = `${pending} Änderungen offen · ${unresolved.length} Konflikte · ${online ? 'Google verbunden' : 'lokal verfügbar'}`;
    const guidance = document.getElementById('journalSyncGuidance');
    if (guidance) guidance.textContent = pending ? 'Vor dem Gerätewechsel bitte „Jetzt abgleichen“, damit diese Änderungen auch auf dem anderen Gerät verfügbar sind.'
      : 'Keine lokalen Änderungen zum Hochladen offen. Änderungen anderer Geräte mit „Jetzt abgleichen“ laden.';
    const badge = document.querySelector('#syncStatusButton');
    if (badge) { badge.textContent = unresolved.length ? `${unresolved.length} Konflikte` : pending ? `${pending} Änderungen offen` : online ? 'Google verbunden' : 'Lokal verfügbar'; badge.onclick = () => open(); }
    const photoPending = data.filter(row => row.id.startsWith('journal:op:') && row.pending && (row.operation.value?.legacyStore === 'photos' || row.operation.target?.store === 'photos')).length;
    const photoStatus = document.querySelector('#photoCloudStatus');
    if (photoStatus) photoStatus.textContent = `${photoPending} Fotoänderungen offen. Fotos werden beim bewussten Abgleich zusammen mit dem Bordbuch übertragen.${online ? '' : ' Für den Abgleich bitte Google verbinden.'}`;
    const documentHint = document.querySelector('#documentCloudHint');
    if (documentHint) documentHint.textContent = 'Dokumente bleiben lokal verfügbar. Neue und geänderte Dateien werden beim bewussten Abgleich zusammen mit dem Bordbuch übertragen.';
    const signature = JSON.stringify(unresolved.map(row => [row.id, row.view.candidates.map(op => op.id)]));
    if (signature !== conflictSignature) {
      const opened = new Set([...conflicts.querySelectorAll('details[open]')].map(element => element.dataset.record));
      conflictSignature = signature; conflicts.replaceChildren();
      for (const row of unresolved) {
      const card = node('details'); card.append(node('summary', `${row.store}: ${String(row.key)} – Fassungen vergleichen`));
      card.dataset.record = row.id; card.open = opened.has(row.id);
      const heads = row.view.candidates.map(op => op.id);
      for (const op of row.view.candidates) {
        const version = node('section'); version.append(node('h4', op.kind === 'delete' ? 'Gelöschte Fassung' : 'Gespeicherte Fassung'));
        if (op.kind === 'put') {
          const record = structuredClone(op.value.record);
          for (const field of ['data', 'boatPhoto']) if (record[field]) record[field] = '[Medieninhalt vorhanden]';
          const pre = node('pre', JSON.stringify(record, null, 2)); pre.style.whiteSpace = 'pre-wrap'; version.append(pre);
          const image = op.value.record.data || op.value.record.boatPhoto;
          if (typeof image === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(image)) { const img = node('img'); img.src = image; img.alt = 'Bild dieser Fassung'; img.style.maxWidth = '240px'; version.append(img); }
        }
        const choose = node('button', op.kind === 'delete' ? 'Löschung übernehmen' : 'Diese Fassung übernehmen'); choose.type = 'button';
        choose.onclick = () => run(async () => {
          if (!workspace || !bindingNow()) throw new Error('Bitte diesen Testbestand erneut mit Google verbinden.');
          await LeefkeAppJournal.resolve(database, workspace.binding, row.store, row.key, heads, op.kind === 'delete' ? null : op.value.record, bindingNow);
          await refresh(); await renderStatus(); tell('Entscheidung lokal gespeichert. Übertragung beim nächsten manuellen Abgleich.');
        }); version.append(choose); card.append(version);
      }
      conflicts.append(card);
      }
    }
    controls();
  }
  async function connect() {
    return run(async () => {
      session.logout(); workspace = null; capture = null;
      tell('Google-Anmeldung wird geöffnet …');
      if (!await waitForGoogleIdentity()) throw new Error('Google-Anmeldung konnte nicht geladen werden.');
      const ticket = session.begin();
      const response = await new Promise((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_DRIVE_CLIENT_ID, scope: GOOGLE_DRIVE_SCOPE,
          callback: answer => answer.error ? reject(new Error(answer.error_description || answer.error)) : resolve(answer),
          error_callback: answer => reject(new Error(answer.message || answer.type || 'Anmeldung abgebrochen.')) });
        client.requestAccessToken({ prompt: '' });
      });
      await session.accept(ticket, response); capture = session.capture();
      const local = (await rows()).find(row => row.id === 'journal:binding');
      if (local && local.accountId !== capture.accountId) { session.logout(); capture = null; throw new Error('Dieses Google-Konto gehört nicht zum lokalen Testbestand.'); }
      const params = new URLSearchParams({ q: "trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='leefkeEnvironment' and value='" + environment + "' }", fields: 'files(id,name,appProperties),nextPageToken,incompleteSearch', pageSize: '100' });
      const found = [], pages = new Set();
      while (true) {
        const page = await (await capture.request('https://www.googleapis.com/drive/v3/files?' + params)).json();
        if (page.incompleteSearch || !Array.isArray(page.files)) throw new Error('Testbestände konnten nicht vollständig gesucht werden.');
        found.push(...page.files);
        if (!page.nextPageToken) break;
        if (pages.has(page.nextPageToken)) throw new Error('Wiederholte Suchseite.'); pages.add(page.nextPageToken); params.set('pageToken', page.nextPageToken);
      }
      select.replaceChildren(node('option', 'Testbestand auswählen')); select.firstChild.value = '';
      for (const folder of found) {
        const scope = folder.appProperties?.leefkeJournal;
        if (!scope || local && (folder.id !== local.folderId || scope !== local.scope)) continue;
        const option = node('option', folder.name || 'LEEFKE-Testbestand'); option.value = folder.id; option.dataset.scope = scope; select.append(option);
      }
      tell(select.options.length > 1 ? 'Google bestätigt. Bitte den gewünschten Testbestand auswählen.' : 'Kein passender bestehender Journal-Testordner gefunden. Es wurde kein Ordner angelegt.');
      await renderStatus();
    });
  }
  async function choose() {
    return run(async () => {
      const option = select.selectedOptions[0]; if (!option?.value || !capture) throw new Error('Bitte einen Testbestand auswählen.');
      const selected = await capture.workspace(option.dataset.scope, option.value, environment);
      const existing = (await rows()).find(row => row.id === 'journal:binding');
      await LeefkeAppJournal.bindTest(database, { accountId: selected.binding.accountId, folderId: selected.binding.folderId, scope: selected.binding.scope, actor: existing?.actor || crypto.randomUUID() });
      workspace = selected; await renderStatus(); tell('Testbestand verbunden. Eine lokale Sicherung übernehmen oder den vorhandenen Testbestand manuell laden.');
    });
  }
  async function createTestFolder() {
    return run(async () => {
      if (!capture || hasBinding) throw new Error('Dieser lokale Bestand ist bereits zugeordnet oder Google ist nicht verbunden.');
      const key = (release ? 'leefke-journal-folder:' : 'leefke-integrated-folder:') + capture.accountId;
      let reservation = JSON.parse(localStorage.getItem(key) || 'null');
      if (!reservation) {
        const result = await (await capture.request('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files')).json();
        if (!Array.isArray(result.ids) || result.ids.length !== 1) throw new Error('Keine eindeutige Ordnerkennung erhalten.');
        reservation = { id: result.ids[0], scope: crypto.randomUUID() };
        localStorage.setItem(key, JSON.stringify(reservation));
      }
      if (![reservation.id, reservation.scope].every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value))) throw new Error('Ungültige lokale Testordner-Vormerkung.');
      const metadata = { id: reservation.id, name: release ? 'LEEFKE – Bordbuch' : 'LEEFKE – integrierter App-Test', mimeType: 'application/vnd.google-apps.folder', appProperties: { leefkeEnvironment: environment, leefkeJournal: reservation.scope } };
      tell('Eigener Testordner wird angelegt …');
      try { await capture.request('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) }); }
      catch (error) { if (error.status !== 409) throw error; }
      const selected = await capture.workspace(reservation.scope, reservation.id, environment);
      await LeefkeAppJournal.bindTest(database, { accountId: selected.binding.accountId, scope: selected.binding.scope, folderId: selected.binding.folderId, actor: crypto.randomUUID() });
      workspace = selected; await renderStatus(); tell('Eigener Testbestand verbunden. Die vollständige Sicherung kann jetzt lokal übernommen werden.');
    });
  }
  async function importSnapshot(snapshot) {
    return run(async () => {
      if (!workspace || !bindingNow()) throw new Error('Bitte zuerst den Testbestand verbinden.');
      if (handoff) {
        tell('Browser-Übergabe wird vollständig geprüft …');
        const result = await LeefkeAppJournal.importTransfer(database, workspace.binding, snapshot, bindingNow);
        await refresh(); await renderStatus(); tell(`Übergabe übernommen: ${result.records} Datensätze, ${result.pending} Änderungen offen. Gespeicherte Drive-Dateikennungen erhalten. Jetzt manuell abgleichen.`); return;
      }
      if (release) {
        LeefkeJournalMigration.validateSnapshot(snapshot);
        const count = LeefkeJournalMigration.SYNC.reduce((n, name) => n + snapshot.stores[name].length, 0);
        if (!confirm(`${count} Datensätze einschließlich vorhandener Bilder in den neuen lokalen Bestand übernehmen?\n\nBitte nur fortfahren, wenn dies dein vollständiger aktueller Bordbuchbestand ist. Noch nicht abgeglichene Änderungen anderer Geräte sind darin nicht enthalten. Die bisherige App danach nicht parallel bearbeiten. Die Übertragung in den neuen Drive-Ordner startest du anschließend selbst.`)) return;
      }
      tell('Vollständige Sicherung wird geprüft und lokal übernommen …');
      const plan = await LeefkeJournalMigration.prepare(snapshot, workspace.binding.scope);
      await LeefkeAppJournal.importTest(database, workspace.binding, snapshot, plan, bindingNow);
      await refresh(); await renderStatus(); tell('Sicherung lokal übernommen. Noch nicht an Google Drive übertragen.');
    });
  }
  async function sync(trigger = 'manual') {
    return run(async () => {
      if (!workspace || !bindingNow()) throw new Error('Bitte zuerst den Testbestand mit Google verbinden.');
      tell('Testbestand wird abgeglichen …');
      const wakeHint = document.getElementById('journalWakeHint');
      const stopAwake = keepScreenAwake(status => {
        if (!wakeHint) return;
        wakeHint.hidden = false;
        wakeHint.textContent = status === 'held' ? 'Der Bildschirm wird während des Abgleichs wach gehalten. Bitte in der App bleiben.'
          : status === 'hidden' ? 'Im Hintergrund kann der Abgleich pausieren. Bitte zur App zurückkehren.'
          : 'Bitte die App geöffnet und den Bildschirm eingeschaltet lassen.';
      });
      try {
      const result = await LeefkeAppJournal.exchange(database, workspace.binding, workspace.drive, bindingNow, trigger, progress => {
        if (progress.phase === 'read') {
          tell(progress.section === 'changes' ? `Änderungen aus Google Drive: ${progress.completed} von ${progress.total} gelesen und geprüft.`
            : progress.section === 'media' ? `Bilder und Dateien: ${progress.completed} von ${progress.total} geprüft.`
            : 'Vorhandene Änderungen in Google Drive werden gesucht …');
        } else if (progress.phase === 'apply') tell(`${progress.total} geprüfte Änderungen werden auf diesem Gerät gespeichert …`);
        else tell(`Übertragung: ${progress.confirmed} von ${progress.total} offenen Änderungen bestätigt.`);
      });
      await refresh(); await renderStatus(); tell(`Abgleich beendet: ${result.confirmed} bestätigt, ${result.pending} offen, ${result.conflicts} Konflikte. ${result.received} Änderungen aus Google Drive vollständig gelesen und lokal geprüft.`);
      return { ok: true, ...result };
      } finally { stopAwake(); if (wakeHint) { wakeHint.hidden = true; wakeHint.textContent = ''; } }
    });
  }
  async function start(db) {
    database = db; panel = node('aside'); panel.id = 'journalTestPanel'; panel.className = 'card'; panel.style.margin = '16px';
    panel.append(node('h2', release ? 'Google Drive & Bordbuch' : 'LEEFKE · integrierter App-Test'), node('p', release ? 'Dein Bordbuch bleibt auf diesem Gerät verfügbar. Abgleich mit Google Drive nur beim vollständigen Start mit gültiger Sitzung oder bewusst manuell.' : 'Getrennter lokaler Bestand. Google-Zugriff ausschließlich auf ausdrücklich markierte Testordner. Übertragung nur manuell oder mit gültiger Sitzung beim Start.'));
    if (handoff) panel.append(node('p', 'Browser-Übergabe: eigener lokaler Bestand. Vorhandenen Google-Testordner auswählen und anschließend die Übergabedatei laden. Den ursprünglichen Browserbestand danach nicht parallel bearbeiten.'));
    message = node('p'); message.id = 'journalTestMessage'; message.setAttribute('role', 'status'); counter = node('p'); counter.id = 'journalTestCounter';
    const wakeHint = node('p'); wakeHint.id = 'journalWakeHint'; wakeHint.hidden = true; wakeHint.setAttribute('role', 'status');
    const guidance = node('p'); guidance.id = 'journalSyncGuidance';
    connectButton = node('button', 'Mit Google verbinden'); connectButton.id = 'journalConnect'; connectButton.onclick = connect;
    const disconnect = node('button', 'Verbindung trennen'); disconnect.onclick = async () => { session.logout(); capture = null; workspace = null; await renderStatus(); tell('Google getrennt. Lokale Daten bleiben erhalten.'); };
    select = node('select'); select.id = 'journalFolder'; select.setAttribute('aria-label', 'Google-Testbestand'); select.append(node('option', 'Zuerst Google verbinden'));
    chooseButton = node('button', release ? 'Bordbuch öffnen' : 'Testbestand öffnen'); chooseButton.id = 'journalChoose'; chooseButton.onclick = choose;
    createButton = node('button', release ? 'Neues Bordbuch in Google Drive anlegen' : 'Eigenen Testbestand anlegen'); createButton.id = 'journalCreate'; createButton.onclick = createTestFolder;
    syncButton = node('button', 'Jetzt abgleichen'); syncButton.id = 'journalSync'; syncButton.onclick = () => sync();
    const label = node('label', handoff ? 'Browser-Übergabedatei übernehmen ' : 'Vollständige lokale Sicherung übernehmen '); fileInput = node('input'); fileInput.type = 'file'; fileInput.accept = '.json'; label.append(fileInput);
    fileInput.onchange = async () => { try { if (fileInput.files[0]) await importSnapshot(JSON.parse(await fileInput.files[0].text())); } catch (error) { tell(error.message); } };
    conflicts = node('div'); conflicts.id = 'journalConflicts';
    panel.append(connectButton, disconnect, select, chooseButton, createButton, syncButton, label, message, wakeHint, counter, guidance, conflicts);
    if (release) {
      document.querySelector('#sync').append(panel);
      sourceButton = node('button', 'Bisheriges Bordbuch dieses Browsers übernehmen'); sourceButton.type = 'button';
      sourceButton.onclick = async () => {
        let snapshot;
        const result = await run(async () => { snapshot = await LeefkeLocalSource.capture(); });
        if (result?.ok === false || !snapshot) return;
        await importSnapshot(snapshot);
      };
      panel.insertBefore(sourceButton, label);
      migrationNotice = node('p', 'Einmalige Umstellung: Den bisherigen Bestand zuerst auf allen Geräten abschließend abgleichen. Anschließend hier übernehmen und die bisherige App nicht parallel bearbeiten. Der bisherige lokale Bestand und die alte Drive-Datei bleiben erhalten.');
      panel.insertBefore(migrationNotice, sourceButton);
    } else document.body.prepend(panel);
    transferButton = node('button', 'Übergabe für Chrome sichern'); transferButton.id = 'journalTransferExport';
    transferButton.onclick = () => run(async () => {
      tell('Übergabedatei mit Bildern und Versandstand wird erstellt …');
      const transfer = await LeefkeAppJournal.exportTransfer(database);
      const url = URL.createObjectURL(new Blob([JSON.stringify(transfer)], { type: 'application/json' }));
      const link = node('a'); link.href = url; link.download = 'LEEFKE_Browser_Uebergabe.json'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      tell('Übergabedatei heruntergeladen. Originalbestand bleibt erhalten. Nach Übernahme nur in Chrome weiterarbeiten.');
    }); if (!release) panel.append(transferButton);
    const style = node('style'); style.textContent = '#sync>*{display:none!important} #sync>.journalHint,#sync>#journalTestPanel{display:block!important} #journalTestPanel button,#journalTestPanel select{margin:4px} #journalTestPanel button:disabled{opacity:.45;cursor:not-allowed}'; document.head.append(style);
    const legacy = document.querySelector('#sync'), hint = node('article'); hint.className = 'journalHint card';
    hint.append(node('h2', 'Google Drive & Abgleich'), node('p', 'Lokale Änderungen bleiben auf diesem Gerät gespeichert. Der gemeinsame Abgleich umfasst Bordbuch, Fotos und Dokumente. Widersprüchliche Fassungen werden zur Entscheidung angezeigt.'));
    const access = node('button', 'Google-Verbindung und Konflikte öffnen'); access.type = 'button'; access.onclick = () => open(); hint.append(access); if (!release) legacy.append(hint);
    const photoToggle = document.querySelector('#photoAutoSync');
    if (photoToggle) { photoToggle.disabled = true; photoToggle.closest('label').hidden = true; }
    await renderStatus(); if (ready) await refresh(); tell(ready ? 'Gespeicherter Testbestand lokal geöffnet. Für einen Abgleich Google erneut verbinden.' : 'Zuerst Google verbinden und einen markierten Testbestand auswählen.');
    if (release) {
      const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) walker.currentNode.textContent = wording(walker.currentNode.textContent);
      select.setAttribute('aria-label', 'Google-Bordbuch');
      if (!ready) view('sync');
    }
    if ((release || location.pathname === '/app/') && 'serviceWorker' in navigator) {
      document.querySelector('link[rel="manifest"]').href = 'app-journal.webmanifest';
      const offline = node('p', 'Offline-Start wird vorbereitet …'); offline.id = 'journalOfflineStatus'; offline.setAttribute('role', 'status'); panel.append(offline);
      try {
        const registration = await navigator.serviceWorker.register(release ? 'service-worker.js' : 'app-journal-sw.js', { scope: './', updateViaCache: 'none' });
        if (!registration) throw new Error('Offline-Speicherung ist in diesem Browser nicht verfügbar.');
        const show = () => {
          if (registration.waiting) offline.textContent = release ? 'Neue Fassung vorbereitet. Sie wird nach dem Schließen aller geöffneten Leefke-Seiten aktiv.' : 'Neue Offline-Fassung vorbereitet. Sie wird nach dem Schließen der geöffneten App-Testseiten aktiv.';
          else if (registration.active?.state === 'activated') offline.textContent = 'Offline-Start vorbereitet. Gespeicherte Daten lassen sich auch ohne Internet öffnen.';
        };
        const watch = () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'redundant' && !registration.active) offline.textContent = release ? 'Offline-Start konnte noch nicht vorbereitet werden. Bitte die App mit Internet erneut öffnen.' : 'Offline-Start konnte nicht vollständig vorbereitet werden. Bitte bei erreichbarem Testserver erneut öffnen.';
            show();
          });
        };
        registration.addEventListener('updatefound', watch); watch(); show();
        navigator.serviceWorker.addEventListener('controllerchange', show);
      } catch (error) { offline.textContent = release ? 'Offline-Start noch nicht bereit. Bitte die App bei bestehender Internetverbindung erneut öffnen und die Offline-Speicherung im Browser erlauben.' : 'Offline-Start noch nicht bereit: ' + error.message; }
    }
  }
  root.LeefkeJournalUI = Object.freeze({ start, connect, choose, createTestFolder, importSnapshot, sync, renderStatus, connected, open });
})(globalThis);
