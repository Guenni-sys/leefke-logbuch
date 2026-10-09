/* Read an existing 8.24 source without creating/upgrading/writing that database. */
(function (root) {
  'use strict';
  async function capture(name = 'leefke-v2') {
    if (name !== 'leefke-v2') throw new Error('Unzulässige Quelldatenbank.');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => {
        request.transaction.abort();
        reject(new Error('In diesem Browser ist kein bisheriges Bordbuch vorhanden. Bitte eine vollständige lokale Sicherung auswählen.'));
      };
      request.onerror = () => reject(request.error || new Error('Bisheriges Bordbuch konnte nicht gelesen werden.'));
      request.onsuccess = () => resolve(request.result);
    });
    try { return await root.LeefkeJournalMigration.capture(db, '8.24'); }
    finally { db.close(); }
  }
  root.LeefkeLocalSource = Object.freeze({ capture });
})(globalThis);
