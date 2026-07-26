const APP_VERSION = '5.6';
const AUTO_SYNC_INTERVAL_MS = 20000;
const DB_NAME = 'leefke-v2';
const DB_VERSION = 4;
const stores = ['days', 'fuel', 'maintenance', 'photos', 'checklists', 'route', 'ports', 'settings', 'gpx', 'weather'];
const syncableStores = ['days', 'fuel', 'maintenance', 'checklists', 'route', 'ports', 'settings', 'gpx', 'weather'];
const SETTINGS_FIELD_RECORD_TYPE = 'settings_field';
const systemStores = ['syncMeta', 'syncTombstones'];
const SUPABASE_URL = 'https://fzaxoivuwpubwhgabahz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_VRFnhXCeSrhJ7BsxMNgl6Q_HolDM-yC';

const DEFAULT_SETTINGS = {
  id: 'main',
  boatName: 'LEEFKE',
  homePort: 'Weser Yacht Club Lemwerder',
  boatType: 'Groeneveld Kotter',
  model: 'Finse',
  buildYear: 1996,
  hullMaterial: 'Stahl',
  hullForm: 'Multiknickspant · Spitzgatt',
  callSign: '',
  mmsi: '',
  length: 11.50,
  beam: 3.85,
  draft: 1.15,
  navigationDraft: 1.25,
  airDraft: 3.80,
  displacement: 13,
  engine: 'Perkins M135',
  enginePower: 135,
  engineYear: 2010,
  cruiseSpeed: '6–8 kn',
  tankCapacity: 400,
  currentTankPercent: '',
  currentEngineHours: '',
  equipment: [
    'AIS-Transponder',
    'Radar Raymarine Quantum',
    'Plotter Raymarine Element 9″',
    'NMEA 2000',
    'UKW-Funk',
    'Hydraulische Doppelsteuerung',
    'Hydraulisches Bugstrahlruder',
    'Rettungsinsel',
    'Ankerwinde mit Kette',
    'Papierkarten und Kompass'
  ].join('\n'),
  tripTitle: 'Dänische Südsee 2026',
  tripStart: '2026-08-01',
  tripEnd: '2026-08-16',
  defaultCrew: '',
  boatPhoto: ''
};


const WEATHER_LOCATIONS = {
  lemwerder: { key: 'lemwerder', name: 'Lemwerder', latitude: 53.1668, longitude: 8.6158, zoom: 12, note: 'Unterweser: Wellenwerte sind hier nur eine grobe Modellorientierung.' },
  bremerhaven: { key: 'bremerhaven', name: 'Bremerhaven', latitude: 53.5505, longitude: 8.5795, zoom: 11 },
  cuxhaven: { key: 'cuxhaven', name: 'Cuxhaven', latitude: 53.8688, longitude: 8.7064, zoom: 11 },
  helgoland: { key: 'helgoland', name: 'Helgoland', latitude: 54.1825, longitude: 7.8854, zoom: 11 }
};
const WEATHER_TIMEZONE = 'Europe/Berlin';
const WEATHER_MAX_FORECAST_DAYS = 7;

let db;
let state = {};
let nauticalMap = null;
let nauticalBaseLayer = null;
let seamarkLayer = null;
let portLayer = null;
let activeGpxLayer = null;
let activeRouteBounds = null;
let selectedGpxId = '';
let weatherMap = null;
let weatherMarker = null;
let weatherSelectedLocation = null;
let activeWeatherSnapshot = null;
let activeWeatherHourIndex = 0;
let activeWeatherRouteId = '';
let weatherMapPickMode = false;
let supabaseClient = null;
let currentSession = null;
let syncInProgress = false;
let syncTimer = null;
let autoSyncTimer = null;
let syncRequested = false;
let suppressSyncTracking = false;
let deviceConnectInProgress = false;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const num = value => Number(value || 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const dec = value => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(num(value));
const dec2 = value => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num(value));
const eur = value => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(num(value));
const fmtDate = value => value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '';
const defaultHero = 'leefke-hero.jpg';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      [...stores, ...systemStores].forEach(store => {
        if (!event.target.result.objectStoreNames.contains(store)) {
          event.target.result.createObjectStore(store, { keyPath: 'id' });
        }
      });
    };
    request.onsuccess = event => resolve(event.target.result);
    request.onerror = () => reject(request.error);
  });
}

function all(store) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function getOne(store, id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function rawPut(store, value) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readwrite').objectStore(store).put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function rawDel(store, id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readwrite').objectStore(store).delete(id);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

function rawClear(store) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readwrite').objectStore(store).clear();
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

async function metaGet(id) {
  return getOne('syncMeta', id);
}

async function metaSet(id, value) {
  return rawPut('syncMeta', { id, ...value });
}

async function setDirty(value = true) {
  await metaSet('dirty', { value, changedAt: new Date().toISOString() });
}

async function isLinkedForCurrentUser() {
  if (!currentSession?.user?.id) return false;
  return Boolean(await metaGet(`linked:${currentSession.user.id}`));
}

async function markLinked(strategy) {
  if (!currentSession?.user?.id) return;
  await metaSet(`linked:${currentSession.user.id}`, {
    linked: true,
    strategy,
    linkedAt: new Date().toISOString()
  });
}

async function put(store, value, options = {}) {
  let saved = { ...value };
  if (syncableStores.includes(store) && !suppressSyncTracking && !options.remote) {
    saved._updatedAt = new Date().toISOString();
  }
  if (options.remote && !saved._updatedAt) {
    saved._updatedAt = options.remoteUpdatedAt || new Date().toISOString();
  }
  await rawPut(store, saved);
  if (syncableStores.includes(store) && !options.remote) {
    await rawDel('syncTombstones', `${store}:${saved.id}`);
    await setDirty(true);
    scheduleSync();
  }
  return saved;
}

async function del(store, id, options = {}) {
  await rawDel(store, id);
  if (syncableStores.includes(store) && !options.remote) {
    const updatedAt = new Date().toISOString();
    await rawPut('syncTombstones', {
      id: `${store}:${id}`,
      recordType: store,
      recordId: id,
      updatedAt
    });
    await setDirty(true);
    scheduleSync();
  }
}

async function clear(store, options = {}) {
  if (syncableStores.includes(store) && !options.remote) {
    const existing = await all(store);
    for (const item of existing) {
      await del(store, item.id);
    }
    return;
  }
  await rawClear(store);
}

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 2100);
}


function safeIso(value, fallback = '2000-01-01T00:00:00.000Z') {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
}

function syncTimestamp(item) {
  return Date.parse(item?._updatedAt || item?.updatedAt || '2000-01-01T00:00:00.000Z') || 0;
}

function remoteTimestamp(row) {
  return Date.parse(row?.updated_at || row?.deleted_at || '2000-01-01T00:00:00.000Z') || 0;
}

function appBaseUrl() {
  return `${window.location.origin}${window.location.pathname.replace(/index\.html$/, '')}`;
}

function deviceLabel() {
  const ua = navigator.userAgent || '';
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android-Handy' : 'Android-Tablet';
  if (/Windows/i.test(ua)) return 'Windows-PC';
  if (/Macintosh/i.test(ua)) return 'Mac';
  return 'Dieses Gerät';
}

function cleanPayload(store, item) {
  const payload = typeof structuredClone === 'function' ? structuredClone(item) : JSON.parse(JSON.stringify(item));
  if (store === 'settings') delete payload.boatPhoto;
  return payload;
}

const SETTINGS_META_FIELDS = new Set(['id', '_updatedAt', '_fieldUpdatedAt', 'boatPhoto']);

function settingsFields(...records) {
  const fields = new Set(Object.keys(DEFAULT_SETTINGS));
  for (const record of records) {
    Object.keys(record || {}).forEach(key => {
      if (!SETTINGS_META_FIELDS.has(key)) fields.add(key);
    });
  }
  return [...fields].filter(key => !SETTINGS_META_FIELDS.has(key));
}

function settingsFieldTime(record, field, fallback) {
  return safeIso(record?._fieldUpdatedAt?.[field] || record?._updatedAt || fallback);
}

function normalizeSettingsRecord(record, fallbackTimestamp) {
  const source = { ...DEFAULT_SETTINGS, ...(record || {}), id: 'main' };
  const fallback = safeIso(source._updatedAt || fallbackTimestamp || '2000-01-01T00:00:00.000Z');
  const fieldTimes = { ...(source._fieldUpdatedAt || {}) };
  for (const field of settingsFields(source)) {
    fieldTimes[field] = settingsFieldTime(source, field, fallback);
  }
  return { ...source, _fieldUpdatedAt: fieldTimes, _updatedAt: fallback };
}

function mergeSettingsRecords(localRecord, remoteRecord, remoteUpdatedAt) {
  const local = normalizeSettingsRecord(localRecord, localRecord?._updatedAt);
  const remote = normalizeSettingsRecord(remoteRecord, remoteUpdatedAt);
  const merged = { id: 'main', _fieldUpdatedAt: {} };

  for (const field of settingsFields(local, remote)) {
    const hasLocal = Object.prototype.hasOwnProperty.call(local, field);
    const hasRemote = Object.prototype.hasOwnProperty.call(remoteRecord || {}, field);
    const localTime = settingsFieldTime(local, field, local._updatedAt);
    const remoteTime = settingsFieldTime(remote, field, remoteUpdatedAt);
    const remoteWins = hasRemote && (!hasLocal || Date.parse(remoteTime) > Date.parse(localTime));
    merged[field] = remoteWins ? remote[field] : local[field];
    merged._fieldUpdatedAt[field] = remoteWins ? remoteTime : localTime;
  }

  merged.boatPhoto = localRecord?.boatPhoto || '';
  const timestamps = [local._updatedAt, remoteUpdatedAt, ...Object.values(merged._fieldUpdatedAt)].map(value => Date.parse(value || 0) || 0);
  merged._updatedAt = new Date(Math.max(...timestamps, 0)).toISOString();
  return merged;
}

function comparablePayload(store, payload) {
  const cleaned = cleanPayload(store, payload || {});
  delete cleaned._updatedAt;
  return JSON.stringify(cleaned, Object.keys(cleaned).sort());
}


function valueSignature(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function remoteSettingsCandidates(remoteRows, localRecord = null) {
  const candidates = new Map();
  const legacyRows = remoteRows.filter(row => row.record_type === 'settings' && row.record_id === 'main' && !row.deleted_at);
  const legacy = legacyRows.sort((a, b) => remoteTimestamp(b) - remoteTimestamp(a))[0] || null;

  if (legacy) {
    const payload = legacy.payload || {};
    for (const field of settingsFields(localRecord || {}, payload)) {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
      const timestamp = safeIso(payload?._fieldUpdatedAt?.[field] || legacy.updated_at);
      candidates.set(field, { value: payload[field], timestamp, source: 'legacy' });
    }
  }

  for (const row of remoteRows) {
    if (row.record_type !== SETTINGS_FIELD_RECORD_TYPE || row.deleted_at) continue;
    const field = row.record_id;
    if (!field || SETTINGS_META_FIELDS.has(field)) continue;
    const timestamp = safeIso(row.updated_at);
    const existing = candidates.get(field);
    if (!existing || Date.parse(timestamp) >= Date.parse(existing.timestamp)) {
      candidates.set(field, { value: row.payload?.value, timestamp, source: 'field' });
    }
  }

  return { candidates, legacy };
}

async function mergeRemoteSettings(remoteRows) {
  const localRaw = await getOne('settings', 'main');
  const local = normalizeSettingsRecord(localRaw, localRaw?._updatedAt);
  const { candidates, legacy } = remoteSettingsCandidates(remoteRows, local);
  const merged = { ...local, _fieldUpdatedAt: { ...(local._fieldUpdatedAt || {}) } };

  for (const [field, remoteField] of candidates.entries()) {
    const localTime = settingsFieldTime(local, field, local._updatedAt);
    const remoteTime = safeIso(remoteField.timestamp);
    const valuesDiffer = valueSignature(local[field]) !== valueSignature(remoteField.value);
    if (Date.parse(remoteTime) > Date.parse(localTime) || (valuesDiffer && Date.parse(remoteTime) === Date.parse(localTime))) {
      merged[field] = remoteField.value;
      merged._fieldUpdatedAt[field] = remoteTime;
    }
  }

  merged.boatPhoto = localRaw?.boatPhoto || '';
  const allTimes = [merged._updatedAt, ...Object.values(merged._fieldUpdatedAt || {})]
    .map(value => Date.parse(value || 0) || 0);
  merged._updatedAt = new Date(Math.max(...allTimes, 0)).toISOString();
  await rawPut('settings', merged);
  return { merged, candidates, legacy };
}

function settingsCloudRows(settings, userId, candidates = new Map(), legacy = null) {
  const rows = [];
  let changed = false;
  const normalized = normalizeSettingsRecord(settings, settings?._updatedAt);

  for (const field of settingsFields(normalized)) {
    const timestamp = settingsFieldTime(normalized, field, normalized._updatedAt);
    const remoteField = candidates.get(field);
    const localValue = normalized[field];
    const remoteValue = remoteField?.value;
    const localTs = Date.parse(timestamp) || 0;
    const remoteTs = Date.parse(remoteField?.timestamp || 0) || 0;
    const valuesDiffer = valueSignature(localValue) !== valueSignature(remoteValue);

    if (!remoteField || localTs > remoteTs || (localTs === remoteTs && valuesDiffer)) {
      rows.push({
        user_id: userId,
        record_type: SETTINGS_FIELD_RECORD_TYPE,
        record_id: field,
        payload: { value: localValue },
        updated_at: safeIso(timestamp),
        deleted_at: null
      });
      changed = true;
    }
  }

  const legacyPayload = cleanPayload('settings', normalized);
  const legacyUpdatedAt = safeIso(normalized._updatedAt);
  const legacyDiffers = !legacy || comparablePayload('settings', legacyPayload) !== comparablePayload('settings', legacy.payload || {});
  if (changed || legacyDiffers) {
    rows.push({
      user_id: userId,
      record_type: 'settings',
      record_id: 'main',
      payload: legacyPayload,
      updated_at: legacyUpdatedAt,
      deleted_at: null
    });
  }
  return rows;
}

async function migrateLocalTimestamps() {
  for (const store of syncableStores) {
    const items = await all(store);
    for (const item of items) {
      const fallback = item._updatedAt || (item.created ? new Date(Number(item.created)).toISOString() : '2000-01-01T00:00:00.000Z');
      if (store === 'settings') {
        await rawPut(store, normalizeSettingsRecord(item, fallback));
      } else if (!item._updatedAt) {
        await rawPut(store, { ...item, _updatedAt: safeIso(fallback) });
      }
    }
  }
}


const FACTORY_ROUTE_SIGNATURES = new Set([
  '2026-08-01|Bremerhaven|Cuxhaven|59',
  '2026-08-02|Cuxhaven|Brunsbüttel|17',
  '2026-08-03|Brunsbüttel|Rendsburg|0',
  '2026-08-04|Rendsburg|Laboe|16',
  '2026-08-05|Laboe|Marstal|36'
]);

const FACTORY_CHECK_SIGNATURES = new Set([
  'Vor dem Ablegen|Wetter, Wind, Wellen und Sicht geprüft',
  'Vor dem Ablegen|Tiden und Strömung geprüft',
  'Vor dem Ablegen|Motorraum und drei Dieselfilter kontrolliert',
  'Vor dem Ablegen|Bilge und Bilgenpumpen kontrolliert',
  'Vor dem Ablegen|Motoröl, Kühlwasser und Keilriemen geprüft',
  'Vor dem Ablegen|Hydraulik und Bugstrahlruder geprüft',
  'Vor dem Ablegen|Navigation, AIS, Radar und UKW eingeschaltet',
  'Vor dem Ablegen|Leinen, Fender und Anker klar',
  'Nach dem Anlegen|Motorstunden und Tankstand notiert',
  'Nach dem Anlegen|Landstrom angeschlossen und geprüft',
  'Nach dem Anlegen|Leinen und Fender kontrolliert',
  'Nach dem Anlegen|Motorraum auf Leckagen geprüft',
  'Nach dem Anlegen|Logbucheintrag ergänzt',
  'Nach dem Anlegen|Wetter und Tiden für morgen geprüft',
  'Sicherheit|UKW-Funk betriebsbereit',
  'Sicherheit|AIS-Transponder und Radar betriebsbereit',
  'Sicherheit|Papierkarten und Kompass an Bord',
  'Sicherheit|Rettungsinsel und Rettungsmittel kontrolliert',
  'Sicherheit|Ankerwinde und Kette einsatzbereit'
]);

function settingsMatchFactory(record) {
  const ignored = new Set(['id', '_updatedAt', '_fieldUpdatedAt', 'boatPhoto']);
  for (const [field, expected] of Object.entries(DEFAULT_SETTINGS)) {
    if (ignored.has(field)) continue;
    const actual = record?.[field];
    if (Array.isArray(expected)) {
      if (JSON.stringify(actual || []) !== JSON.stringify(expected)) return false;
    } else if (String(actual ?? '') !== String(expected ?? '')) {
      return false;
    }
  }
  return true;
}

function routeMatchesFactory(item) {
  const signature = `${item.date || ''}|${item.from || ''}|${item.to || ''}|${num(item.nm)}`;
  const extraFieldsEmpty = !item.hours && (item.status || 'planned') === 'planned' && !item.departTime &&
    !item.weather && !item.wind && !item.wave && !item.tide && !item.berth && !item.gpxId && !item.note;
  return FACTORY_ROUTE_SIGNATURES.has(signature) && extraFieldsEmpty;
}

function checklistMatchesFactory(item) {
  return !item.done && FACTORY_CHECK_SIGNATURES.has(`${item.group || ''}|${item.item || ''}`);
}

async function localDataIsOnlyFactoryDefaults() {
  for (const store of ['days', 'fuel', 'maintenance', 'ports', 'gpx', 'weather']) {
    if ((await all(store)).length) return false;
  }

  const routes = await all('route');
  if (routes.length && (routes.length !== FACTORY_ROUTE_SIGNATURES.size || routes.some(item => !routeMatchesFactory(item)))) return false;

  const checks = await all('checklists');
  if (checks.length && (checks.length !== FACTORY_CHECK_SIGNATURES.size || checks.some(item => !checklistMatchesFactory(item)))) return false;

  const settings = await getOne('settings', 'main');
  if (settings && !settingsMatchFactory(settings)) return false;

  return true;
}

async function replaceLocalWithRemote(remoteRows) {
  const previousSettings = await getOne('settings', 'main');
  const localBoatPhoto = previousSettings?.boatPhoto || '';
  suppressSyncTracking = true;
  try {
    for (const store of syncableStores) await rawClear(store);
    await rawClear('syncTombstones');

    for (const row of remoteRows) {
      if (row.deleted_at || row.record_type === 'settings' || row.record_type === SETTINGS_FIELD_RECORD_TYPE) continue;
      if (!syncableStores.includes(row.record_type)) continue;
      const payload = { ...(row.payload || {}), id: row.record_id, _updatedAt: row.updated_at };
      await rawPut(row.record_type, payload);
    }

    const blankSettings = normalizeSettingsRecord({ ...DEFAULT_SETTINGS, id: 'main', boatPhoto: localBoatPhoto }, '2000-01-01T00:00:00.000Z');
    await rawPut('settings', blankSettings);
    const { merged } = await mergeRemoteSettings(remoteRows);
    if (localBoatPhoto && !merged.boatPhoto) {
      await rawPut('settings', { ...merged, boatPhoto: localBoatPhoto });
    }
  } finally {
    suppressSyncTracking = false;
  }
}

async function connectDeviceAutomatically(options = {}) {
  if (deviceConnectInProgress || !currentSession?.user?.id) return;
  if (!navigator.onLine) {
    if (!options.silent) setMessage('#syncMessage', 'Dieses Gerät wird verbunden, sobald wieder Internet vorhanden ist.', 'error');
    await updateSyncUI();
    return;
  }

  deviceConnectInProgress = true;
  try {
    syncInProgress = true;
    await updateSyncUI();
    if (!options.silent) setMessage('#syncMessage', 'Datenstände werden automatisch geprüft …');

    const remote = await fetchRemoteRecords();
    const remoteHasData = remote.some(row => syncableStores.includes(row.record_type) || row.record_type === SETTINGS_FIELD_RECORD_TYPE);
    const localIsFactoryOnly = await localDataIsOnlyFactoryDefaults();

    if (remoteHasData && localIsFactoryOnly) {
      await replaceLocalWithRemote(remote);
      await markLinked('automatic-cloud');
      await setDirty(false);
      await metaSet('lastSync', { at: new Date().toISOString() });
      await refresh();
      if (!options.silent) setMessage('#syncMessage', 'Gerät verbunden. Der gemeinsame Cloud-Datenstand wurde geladen.', 'success');
    } else {
      await markLinked(remoteHasData ? 'automatic-merge' : 'automatic-first-device');
      await setDirty(true);
      syncInProgress = false;
      await syncNow({ force: true, silent: options.silent });
      if (!options.silent) setMessage('#syncMessage', remoteHasData
        ? 'Gerät verbunden. Lokale und gemeinsame Daten wurden zusammengeführt.'
        : 'Gerät verbunden. Der erste gemeinsame Datenstand wurde angelegt.', 'success');
    }

    toast('Gerät mit LEEFKE-Cloud verbunden');
    startAutoSync(1200);
  } catch (error) {
    console.error('Automatische Geräteverbindung fehlgeschlagen', error);
    setMessage('#syncMessage', `Verbindung fehlgeschlagen: ${readableAuthError(error)}`, 'error');
  } finally {
    syncInProgress = false;
    deviceConnectInProgress = false;
    await updateSyncUI();
  }
}

function setMessage(target, text, kind = '') {
  const element = typeof target === 'string' ? $(target) : target;
  if (!element) return;
  element.textContent = text || '';
  element.className = `sync-message${kind ? ` ${kind}` : ''}`;
}

function readableAuthError(error) {
  const message = String(error?.message || error || 'Unbekannter Fehler');
  if (/invalid login credentials/i.test(message)) return 'E-Mail-Adresse oder Passwort stimmen nicht.';
  if (/email not confirmed/i.test(message)) return 'Bitte zuerst den Bestätigungslink in der E-Mail öffnen.';
  if (/user already registered/i.test(message)) return 'Für diese E-Mail-Adresse gibt es bereits ein Konto. Bitte anmelden.';
  if (/password should be at least/i.test(message)) return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
  if (/rate limit/i.test(message)) return 'Zu viele Versuche. Bitte einige Minuten warten.';
  return message;
}

async function updateSyncUI() {
  const loggedIn = Boolean(currentSession?.user);
  const linked = loggedIn ? await isLinkedForCurrentUser() : false;
  const dirty = Boolean((await metaGet('dirty'))?.value);
  const lastSync = await metaGet('lastSync');
  const statusButton = $('#syncStatusButton');
  const statusText = $('#syncStatusText');

  if ($('#authLoggedOut')) $('#authLoggedOut').hidden = loggedIn;
  if ($('#authLoggedIn')) $('#authLoggedIn').hidden = !loggedIn;
  if ($('#initialSyncPanel')) $('#initialSyncPanel').hidden = !(loggedIn && !linked);
  if ($('#accountEmail')) $('#accountEmail').textContent = currentSession?.user?.email || '—';
  if ($('#lastSyncText')) $('#lastSyncText').textContent = lastSync?.at ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastSync.at)) : '—';
  if ($('#deviceNameText')) $('#deviceNameText').textContent = deviceLabel();
  if ($('#autoSyncText')) {
    $('#autoSyncText').textContent = loggedIn && linked
      ? (navigator.onLine ? 'Aktiv · alle 20 Sekunden, solange die App geöffnet ist' : 'Wartet auf Internet')
      : 'Noch nicht aktiv';
  }

  let label = 'Nicht angemeldet';
  let detail = 'Cloud-Synchronisierung ist nicht aktiv';
  let className = 'sync-status logged-out';

  if (loggedIn && !navigator.onLine) {
    label = 'Offline · lokal gespeichert';
    detail = dirty ? 'Änderungen warten auf Internet' : 'Offline – letzter Stand bleibt verfügbar';
    className = 'sync-status offline';
  } else if (loggedIn && !linked) {
    label = deviceConnectInProgress ? 'Gerät wird verbunden …' : 'Gerät verbinden';
    detail = deviceConnectInProgress ? 'Datenstände werden automatisch abgeglichen' : 'Einmal verbinden – die App entscheidet automatisch';
    className = 'sync-status attention';
  } else if (syncInProgress) {
    label = 'Synchronisiere …';
    detail = 'Daten werden gerade abgeglichen';
    className = 'sync-status working';
  } else if (loggedIn && dirty) {
    label = 'Änderungen ausstehend';
    detail = 'Lokale Änderungen werden gleich übertragen';
    className = 'sync-status attention';
  } else if (loggedIn) {
    label = 'Synchronisiert';
    detail = 'Alle Geräte können denselben Datenstand laden';
    className = 'sync-status synced';
  }

  if (statusButton) {
    statusButton.textContent = label;
    statusButton.className = `status ${className}`;
  }
  if (statusText) statusText.textContent = detail;
}

async function initializeSupabase() {
  if (!window.supabase?.createClient) {
    setMessage('#authMessage', 'Die Cloud-Bibliothek konnte nicht geladen werden. Die lokale App funktioniert weiterhin.', 'error');
    await updateSyncUI();
    return;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) console.warn('Sitzung konnte nicht gelesen werden.', error);
  currentSession = data?.session || null;

  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentSession = session || null;
    window.setTimeout(async () => {
      await updateSyncUI();
      if (currentSession) {
        if (await isLinkedForCurrentUser()) {
          if (navigator.onLine) scheduleSync(250);
          startAutoSync(1200);
        } else if (navigator.onLine) {
          await connectDeviceAutomatically({ silent: true });
        }
      } else {
        stopAutoSync();
      }
      if (event === 'SIGNED_IN') setMessage('#authMessage', 'Anmeldung erfolgreich. Dieses Gerät wird automatisch abgeglichen.', 'success');
    }, 0);
  });
  await updateSyncUI();
}

async function fetchRemoteRecords() {
  if (!supabaseClient || !currentSession?.user?.id) return [];
  const { data, error } = await supabaseClient
    .from('leefke_records')
    .select('user_id,record_type,record_id,payload,updated_at,deleted_at')
    .eq('user_id', currentSession.user.id);
  if (error) throw error;
  return data || [];
}

async function localRows() {
  const rows = [];
  for (const store of syncableStores) {
    if (store === 'settings') continue;
    for (const item of await all(store)) {
      const updatedAt = safeIso(item._updatedAt || item.created || '2000-01-01T00:00:00.000Z');
      rows.push({
        user_id: currentSession.user.id,
        record_type: store,
        record_id: String(item.id),
        payload: cleanPayload(store, { ...item, _updatedAt: updatedAt }),
        updated_at: updatedAt,
        deleted_at: null
      });
    }
  }
  const settings = await getOne('settings', 'main');
  rows.push(...settingsCloudRows(settings, currentSession.user.id));
  return rows;
}

async function upsertRows(rows) {
  if (!rows.length) return;
  for (let index = 0; index < rows.length; index += 75) {
    const chunk = rows.slice(index, index + 75);
    const { error } = await supabaseClient
      .from('leefke_records')
      .upsert(chunk, { onConflict: 'user_id,record_type,record_id' });
    if (error) throw error;
  }
}

async function uploadLocalAsSource() {
  if (!navigator.onLine) return setMessage('#syncMessage', 'Für die erste Übertragung wird eine Internetverbindung benötigt.', 'error');
  if (!currentSession) return;
  try {
    syncInProgress = true;
    await updateSyncUI();
    setMessage('#syncMessage', 'Prüfe den Cloud-Datenstand …');
    const remote = await fetchRemoteRecords();
    if (remote.length && !confirm('In der Cloud liegen bereits LEEFKE-Daten. Sollen sie durch den Datenstand dieses Geräts ersetzt werden?')) return;
    if (remote.length) {
      const { error } = await supabaseClient.from('leefke_records').delete().eq('user_id', currentSession.user.id);
      if (error) throw error;
    }
    const rows = await localRows();
    await upsertRows(rows);
    await rawClear('syncTombstones');
    await markLinked('upload');
    await setDirty(false);
    await metaSet('lastSync', { at: new Date().toISOString() });
    setMessage('#syncMessage', `${rows.length} Datensätze wurden in die LEEFKE-Cloud übertragen.`, 'success');
    toast('LEEFKE-Daten synchronisiert');
    startAutoSync();
  } catch (error) {
    console.error(error);
    setMessage('#syncMessage', `Übertragung fehlgeschlagen: ${readableAuthError(error)}`, 'error');
  } finally {
    syncInProgress = false;
    await updateSyncUI();
  }
}

async function downloadCloudAsSource() {
  if (!navigator.onLine) return setMessage('#syncMessage', 'Für das Laden der Cloud-Daten wird eine Internetverbindung benötigt.', 'error');
  if (!currentSession) return;
  try {
    syncInProgress = true;
    await updateSyncUI();
    const remote = await fetchRemoteRecords();
    const active = remote.filter(row => !row.deleted_at && (syncableStores.includes(row.record_type) || row.record_type === SETTINGS_FIELD_RECORD_TYPE));
    if (!active.length) {
      setMessage('#syncMessage', 'In der Cloud sind noch keine LEEFKE-Daten vorhanden.', 'error');
      return;
    }
    if (!confirm('Die synchronisierbaren Daten auf diesem Gerät werden durch den Cloud-Datenstand ersetzt. Lokale Fotos bleiben erhalten. Fortfahren?')) return;
    await replaceLocalWithRemote(remote);
    await markLinked('download');
    await setDirty(false);
    await metaSet('lastSync', { at: new Date().toISOString() });
    await refresh();
    setMessage('#syncMessage', `${active.length} Cloud-Datensätze wurden auf dieses Gerät geladen.`, 'success');
    toast('Cloud-Daten geladen');
    startAutoSync();
  } catch (error) {
    suppressSyncTracking = false;
    console.error(error);
    setMessage('#syncMessage', `Laden fehlgeschlagen: ${readableAuthError(error)}`, 'error');
  } finally {
    syncInProgress = false;
    await updateSyncUI();
  }
}

async function mergeInitialData() {
  if (!currentSession) return;
  await markLinked('merge');
  await setDirty(true);
  await syncNow({ force: true });
  startAutoSync();
}

async function syncNow(options = {}) {
  if (syncInProgress) {
    syncRequested = true;
    return;
  }
  if (!supabaseClient || !currentSession?.user?.id || !navigator.onLine) {
    await updateSyncUI();
    return;
  }
  const linked = await isLinkedForCurrentUser();
  if (!linked && !options.force) {
    await connectDeviceAutomatically({ silent: options.silent });
    return;
  }

  syncInProgress = true;
  const dirtyAtStart = await metaGet('dirty');
  await updateSyncUI();
  if (!options.silent) setMessage('#syncMessage', 'LEEFKE-Daten werden abgeglichen …');

  try {
    const userId = currentSession.user.id;
    const remote = await fetchRemoteRecords();
    const remoteMap = new Map(remote.map(row => [`${row.record_type}:${row.record_id}`, row]));
    const tombstones = await all('syncTombstones');
    const tombstoneMap = new Map(tombstones.map(item => [item.id, item]));

    suppressSyncTracking = true;
    for (const row of remote) {
      if (row.record_type === 'settings' || row.record_type === SETTINGS_FIELD_RECORD_TYPE) continue;
      if (!syncableStores.includes(row.record_type)) continue;
      const key = `${row.record_type}:${row.record_id}`;
      const local = await getOne(row.record_type, row.record_id);
      const localTs = syncTimestamp(local);
      const tombTs = Date.parse(tombstoneMap.get(key)?.updatedAt || 0) || 0;
      const remoteTs = remoteTimestamp(row);

      if (row.deleted_at) {
        if (remoteTs >= Math.max(localTs, tombTs)) {
          await rawDel(row.record_type, row.record_id);
          await rawDel('syncTombstones', key);
        }
      } else if (remoteTs > Math.max(localTs, tombTs)) {
        const payload = { ...(row.payload || {}), id: row.record_id, _updatedAt: row.updated_at };
        await rawPut(row.record_type, payload);
        await rawDel('syncTombstones', key);
      }
    }

    const settingsMerge = await mergeRemoteSettings(remote);
    suppressSyncTracking = false;

    const outgoing = [];
    for (const store of syncableStores) {
      if (store === 'settings') continue;
      for (const item of await all(store)) {
        const key = `${store}:${item.id}`;
        const existingRemote = remoteMap.get(key);
        const localTs = syncTimestamp(item);
        if (!existingRemote || localTs > remoteTimestamp(existingRemote)) {
          outgoing.push({
            user_id: userId,
            record_type: store,
            record_id: String(item.id),
            payload: cleanPayload(store, item),
            updated_at: safeIso(item._updatedAt),
            deleted_at: null
          });
        }
      }
    }

    const currentSettings = await getOne('settings', 'main');
    outgoing.push(...settingsCloudRows(currentSettings, userId, settingsMerge.candidates, settingsMerge.legacy));

    const pendingTombstones = await all('syncTombstones');
    for (const tombstone of pendingTombstones) {
      const existingRemote = remoteMap.get(tombstone.id);
      const tombTs = Date.parse(tombstone.updatedAt) || 0;
      if (!existingRemote || tombTs > remoteTimestamp(existingRemote) || !existingRemote.deleted_at) {
        outgoing.push({
          user_id: userId,
          record_type: tombstone.recordType,
          record_id: String(tombstone.recordId),
          payload: {},
          updated_at: safeIso(tombstone.updatedAt),
          deleted_at: safeIso(tombstone.updatedAt)
        });
      }
    }

    await upsertRows(outgoing);
    for (const tombstone of pendingTombstones) await rawDel('syncTombstones', tombstone.id);

    const dirtyNow = await metaGet('dirty');
    if (!dirtyNow?.value || dirtyNow.changedAt === dirtyAtStart?.changedAt) {
      await setDirty(false);
    } else {
      syncRequested = true;
    }

    await metaSet('lastSync', { at: new Date().toISOString() });
    await refresh();
    if (!options.silent) {
      setMessage('#syncMessage', outgoing.length ? `${outgoing.length} Änderung(en) abgeglichen.` : 'Alle LEEFKE-Daten sind auf dem neuesten Stand.', 'success');
    }
  } catch (error) {
    suppressSyncTracking = false;
    console.error('Synchronisierung fehlgeschlagen', error);
    await setDirty(true);
    setMessage('#syncMessage', `Synchronisierung fehlgeschlagen: ${readableAuthError(error)}`, 'error');
  } finally {
    syncInProgress = false;
    await updateSyncUI();
    if (syncRequested) {
      syncRequested = false;
      scheduleSync(250);
    }
  }
}

function scheduleSync(delay = 1400) {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(async () => {
    if (currentSession && navigator.onLine && await isLinkedForCurrentUser()) await syncNow();
    else await updateSyncUI();
  }, delay);
}

function stopAutoSync() {
  window.clearTimeout(autoSyncTimer);
  autoSyncTimer = null;
}

function startAutoSync(delay = AUTO_SYNC_INTERVAL_MS) {
  stopAutoSync();
  if (document.visibilityState !== 'visible') return;
  autoSyncTimer = window.setTimeout(async () => {
    try {
      if (currentSession && navigator.onLine && await isLinkedForCurrentUser()) {
        await syncNow({ silent: true, reason: 'auto' });
      }
    } finally {
      startAutoSync(AUTO_SYNC_INTERVAL_MS);
    }
  }, delay);
}

async function syncOnForeground() {
  if (document.visibilityState !== 'visible') return;
  if (currentSession && navigator.onLine && await isLinkedForCurrentUser()) {
    await syncNow({ silent: true, reason: 'foreground' });
  }
  startAutoSync();
}

function view(id) {
  $$('.view').forEach(section => section.classList.toggle('active', section.id === id));
  $$('nav button').forEach(button => button.classList.toggle('active', button.dataset.view === id));
  $('#nav').classList.remove('open');
  if (id === 'report') buildReport();
  if (id === 'sync') updateSyncUI();
  if (id === 'day') prepareDayForm();
  if (id === 'weather') {
    window.setTimeout(() => {
      prepareWeatherView();
      weatherMap?.invalidateSize();
    }, 80);
  }
  if (id === 'route') {
    window.setTimeout(() => {
      ensureNauticalMap();
      nauticalMap?.invalidateSize();
      drawGpx($('#gpxSelect')?.value || selectedGpxId);
    }, 80);
  }
  window.scrollTo(0, 0);
}

function prepareDayForm() {
  const form = $('#dayForm');
  if (!form.elements.id.value && !form.elements.date.value) {
    form.elements.date.value = new Date().toISOString().slice(0, 10);
    const settings = getSettings();
    if (!form.elements.crew.value) form.elements.crew.value = settings.defaultCrew || '';
  }
}

async function defaults() {
  const checks = await all('checklists');
  if (!checks.length) {
    const groups = {
      'Vor dem Ablegen': [
        'Wetter, Wind, Wellen und Sicht geprüft',
        'Tiden und Strömung geprüft',
        'Motorraum und drei Dieselfilter kontrolliert',
        'Bilge und Bilgenpumpen kontrolliert',
        'Motoröl, Kühlwasser und Keilriemen geprüft',
        'Hydraulik und Bugstrahlruder geprüft',
        'Navigation, AIS, Radar und UKW eingeschaltet',
        'Leinen, Fender und Anker klar'
      ],
      'Nach dem Anlegen': [
        'Motorstunden und Tankstand notiert',
        'Landstrom angeschlossen und geprüft',
        'Leinen und Fender kontrolliert',
        'Motorraum auf Leckagen geprüft',
        'Logbucheintrag ergänzt',
        'Wetter und Tiden für morgen geprüft'
      ],
      'Sicherheit': [
        'UKW-Funk betriebsbereit',
        'AIS-Transponder und Radar betriebsbereit',
        'Papierkarten und Kompass an Bord',
        'Rettungsinsel und Rettungsmittel kontrolliert',
        'Ankerwinde und Kette einsatzbereit'
      ]
    };
    for (const [group, items] of Object.entries(groups)) {
      for (const item of items) await put('checklists', { id: uid(), group, item, done: false });
    }
  }

  const routes = await all('route');
  if (!routes.length) {
    const initialRoutes = [
      ['2026-08-01', 'Bremerhaven', 'Cuxhaven', 59],
      ['2026-08-02', 'Cuxhaven', 'Brunsbüttel', 17],
      ['2026-08-03', 'Brunsbüttel', 'Rendsburg', 0],
      ['2026-08-04', 'Rendsburg', 'Laboe', 16],
      ['2026-08-05', 'Laboe', 'Marstal', 36]
    ];
    for (const route of initialRoutes) {
      await put('route', {
        id: uid(), date: route[0], from: route[1], to: route[2], nm: route[3],
        hours: '', status: 'planned', departTime: '', weather: '', wind: '', wave: '', tide: '', berth: '', gpxId: '', note: ''
      });
    }
  }

  const settingsRows = await all('settings');
  if (!settingsRows.length) {
    const now = new Date().toISOString();
    await put('settings', normalizeSettingsRecord({ ...DEFAULT_SETTINGS, _updatedAt: now }, now));
  } else {
    const existing = settingsRows.find(item => item.id === 'main') || settingsRows[0];
    const migrated = normalizeSettingsRecord({ ...DEFAULT_SETTINGS, ...existing, id: 'main' }, existing._updatedAt);
    if (migrated.homePort === 'Lemwerder') migrated.homePort = 'Weser Yacht Club Lemwerder';
    if (!migrated.model) migrated.model = 'Finse';
    await rawPut('settings', migrated);
  }
}

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(state.settings?.find(item => item.id === 'main') || {}) };
}

async function refresh() {
  for (const store of stores) state[store] = await all(store);
  state.days.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  state.fuel.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  state.maintenance.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  state.ports.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  render();
}

function actionButtons(kind, id) {
  return `<button class="edit" onclick="editItem('${kind}','${id}')">Bearbeiten</button><button class="delete" onclick="removeItem('${kind}','${id}')">Löschen</button>`;
}

function card(item, kind, body, className = '') {
  return `<article class="item ${className}">${actionButtons(kind, item.id)}${body}</article>`;
}

function ratingLabel(value) {
  const rating = clamp(Math.round(num(value)), 0, 5);
  return rating ? `${rating} von 5 Sternen` : 'Noch nicht bewertet';
}

function stars(value, large = false) {
  const rating = clamp(Math.round(num(value)), 0, 5);
  const filled = '<span class="filled">★</span>'.repeat(rating);
  const empty = '<span class="empty">★</span>'.repeat(5 - rating);
  return `<span class="display-stars${large ? ' large' : ''}" aria-label="${ratingLabel(rating)}">${filled}${empty}</span>`;
}

function paintRatingPicker(picker, value, preview = false) {
  const rating = clamp(Math.round(num(value)), 0, 5);
  picker.querySelectorAll('[data-rating]').forEach(button => {
    const active = num(button.dataset.rating) <= rating;
    if (preview) {
      button.classList.toggle('preview', active);
      button.classList.remove('selected');
    } else {
      button.classList.toggle('selected', active);
      button.classList.remove('preview');
      button.setAttribute('aria-checked', String(num(button.dataset.rating) === rating));
    }
  });
  if (!preview) {
    const input = picker.querySelector('input[type="hidden"]');
    if (input) input.value = rating || '';
    const label = picker.querySelector('.rating-value');
    if (label) label.textContent = rating ? `${rating} von 5 Sternen` : (picker.classList.contains('compact') ? 'Nicht bewertet' : 'Noch nicht bewertet');
  }
}

function syncRatingPickers(root = document) {
  root.querySelectorAll('.rating-picker').forEach(picker => {
    const input = picker.querySelector('input[type="hidden"]');
    paintRatingPicker(picker, input?.value || 0);
  });
}

function initRatingPickers() {
  document.querySelectorAll('.rating-picker').forEach(picker => {
    picker.querySelectorAll('[data-rating]').forEach(button => {
      button.addEventListener('click', () => paintRatingPicker(picker, button.dataset.rating));
      button.addEventListener('mouseenter', () => {
        picker.querySelectorAll('[data-rating]').forEach(item => item.classList.remove('preview'));
        paintRatingPicker(picker, button.dataset.rating, true);
      });
    });
    picker.querySelector('.rating-buttons')?.addEventListener('mouseleave', () => {
      picker.querySelectorAll('[data-rating]').forEach(item => item.classList.remove('preview'));
      const input = picker.querySelector('input[type="hidden"]');
      paintRatingPicker(picker, input?.value || 0);
    });
  });
  syncRatingPickers();
}

function lines(value) {
  return String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function setBoatImage(settings) {
  const image = settings.boatPhoto || defaultHero;
  $('#heroBoatImage').src = image;
  $('#boatPhotoPreview').src = image;
}

function render() {
  const settings = getSettings();
  setBoatImage(settings);

  $('#headerBoatName').textContent = settings.boatName || 'LEEFKE';
  $('#headerBoatLine').textContent = `${settings.boatType || 'Groeneveld Kotter'}${settings.model ? ` · ${settings.model}` : ''} · ${settings.homePort || 'Lemwerder'}`;
  $('#tripTitle').textContent = settings.tripTitle || 'Aktueller Törn';
  $('#tripDates').textContent = [fmtDate(settings.tripStart), fmtDate(settings.tripEnd)].filter(Boolean).join(' – ');
  $('#leefkeStory').textContent = `${settings.boatName || 'LEEFKE'} ist unser ${settings.buildYear || 1996} gebauter ${settings.boatType || 'Groeneveld Kotter'}${settings.model ? ` der Baureihe ${settings.model}` : ''}: ein ${dec2(settings.length)} Meter langer Verdränger aus ${settings.hullMaterial || 'Stahl'} mit klassischem Spitzgatt. Der ${settings.engine || 'Perkins M135'} bringt uns mit ruhigen ${settings.cruiseSpeed || '6–8 kn'} vom ${settings.homePort || 'Heimathafen'} hinaus auf Nord- und Ostsee.`;

  $('#vLength').textContent = `${dec2(settings.length)} m`;
  $('#vBeam').textContent = `${dec2(settings.beam)} m`;
  $('#vDraft').textContent = `${dec2(settings.draft)} m`;
  $('#vDisplacement').textContent = `ca. ${dec2(settings.displacement)} t`;
  $('#vEngine').textContent = settings.engine || 'Perkins M135';
  $('#vTank').textContent = `${dec2(settings.tankCapacity)} l`;

  $('#shipCardTitle').textContent = `${settings.boatName} · ${settings.boatType}`;
  $('#fBuildYear').textContent = settings.buildYear || '—';
  $('#fHull').textContent = [settings.hullMaterial, settings.hullForm].filter(Boolean).join(' · ');
  $('#fHomePort').textContent = settings.homePort || '—';
  $('#fCruise').textContent = settings.cruiseSpeed || '—';

  const days = state.days;
  const totalNm = days.reduce((sum, item) => sum + num(item.distance), 0);
  const totalHours = days.reduce((sum, item) => sum + Math.max(0, num(item.engineEnd) - num(item.engineStart)), 0);
  const fuelLiters = state.fuel.reduce((sum, item) => sum + num(item.liters), 0);
  const fuelCost = state.fuel.reduce((sum, item) => sum + num(item.liters) * num(item.price), 0);

  $('#sDays').textContent = days.length;
  $('#sNm').textContent = dec(totalNm);
  $('#sHours').textContent = dec(totalHours);
  $('#sCost').textContent = eur(fuelCost);
  $('#sAvg').textContent = totalHours ? `${dec(fuelLiters / totalHours)} l/h` : '—';

  const latest = days[0];
  $('#latest').innerHTML = latest ? `
    <h3>${esc(latest.title || `${latest.fromPort || ''} → ${latest.toPort || ''}`)}</h3>
    <div class="meta">${fmtDate(latest.date)} · ${dec(latest.distance)} sm · ${esc(latest.wind || 'Wind nicht eingetragen')}</div>
    <p>${esc(latest.summary || '')}</p>` : 'Noch kein Eintrag.';

  const routes = [...state.route].filter(item => item.status !== 'done' && item.status !== 'skip').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const next = routes[0];
  $('#nextRoute').innerHTML = next ? `
    <h3>${esc(next.from)} → ${esc(next.to)}</h3>
    <div class="meta">${fmtDate(next.date)} · ${dec(next.nm)} sm${next.hours ? ` · ${dec(next.hours)} Std.` : ''}</div>
    <p>${esc(next.note || '')}</p>` : 'Noch keine Etappe geplant.';

  const openMaintenance = state.maintenance.filter(item => !item.done);
  $('#openMaint').innerHTML = openMaintenance.length ? openMaintenance.slice(0, 5).map(item => `<div>◆ ${esc(item.title)}${item.dueDate ? ` · fällig ${fmtDate(item.dueDate)}` : ''}</div>`).join('') : 'Keine offenen Punkte.';

  const equipment = lines(settings.equipment).slice(0, 8);
  $('#quickInfo').innerHTML = `<div class="equipment-list">${equipment.map(item => `<div>${esc(item)}</div>`).join('')}</div><div class="meta" style="margin-top:12px">${state.ports.length} Häfen · ${state.photos.length} Fotos · ${state.gpx.length} GPX-Routen</div>`;

  renderTank(settings);
  renderDays();
  renderFuel(totalHours);
  renderMaintenance();
  renderRoute();
  renderPorts();
  renderChecks();
  renderPhotos();
  renderSettings(settings);
  renderGpxSelect();
  renderPortDatalist();
  renderWeatherLocationOptions();
  if (activeWeatherSnapshot?.id) {
    activeWeatherSnapshot = state.weather?.find(item => item.id === activeWeatherSnapshot.id) || activeWeatherSnapshot;
  } else if (state.weather?.length) {
    activeWeatherSnapshot = [...state.weather].sort((a, b) => Date.parse(b.loadedAt || b._updatedAt || 0) - Date.parse(a.loadedAt || a._updatedAt || 0))[0];
  }
  if (activeWeatherSnapshot) renderWeatherSnapshot(activeWeatherSnapshot, activeWeatherHourIndex);
  if (nauticalMap) refreshPortLayer();
}

function renderTank(settings) {
  const fuelLevels = state.fuel.filter(item => item.tankPercent !== '' && item.tankPercent !== undefined && item.tankPercent !== null);
  const latestFuelWithLevel = fuelLevels.sort((a, b) => syncTimestamp(b) - syncTimestamp(a))[0] || null;
  const settingsTime = Date.parse(settings._fieldUpdatedAt?.currentTankPercent || settings._updatedAt || 0) || 0;
  const fuelTime = syncTimestamp(latestFuelWithLevel);
  const settingsHasValue = settings.currentTankPercent !== '' && settings.currentTankPercent !== undefined && settings.currentTankPercent !== null;
  const useFuelLevel = latestFuelWithLevel && (!settingsHasValue || fuelTime > settingsTime);
  const rawPercent = useFuelLevel ? latestFuelWithLevel.tankPercent : settings.currentTankPercent;
  const hasValue = rawPercent !== '' && rawPercent !== undefined && rawPercent !== null;
  const percent = hasValue ? clamp(num(rawPercent), 0, 100) : 0;
  const capacity = num(settings.tankCapacity) || 400;
  const liters = capacity * percent / 100;
  $('#tankFill').style.width = `${percent}%`;
  $('#tankPercent').textContent = hasValue ? `${dec2(percent)} %` : '—';
  $('#tankLiters').textContent = hasValue
    ? `etwa ${dec2(liters)} von ${dec2(capacity)} Litern · ${useFuelLevel ? 'aus dem letzten Tankbucheintrag' : 'aktueller Bordstand'}`
    : `Tankkapazität ${dec2(capacity)} Liter · Stand noch nicht eingetragen`;
}

function renderDays() {
  const query = ($('#daySearch')?.value || '').toLowerCase();
  const filtered = state.days.filter(item => JSON.stringify(item).toLowerCase().includes(query));
  $('#dayList').innerHTML = filtered.map(item => card(item, 'days', `
    <div class="meta">${fmtDate(item.date)}${item.dayNo ? ` · Reisetag ${esc(item.dayNo)}` : ''}</div>
    <h3>${esc(item.title || `${item.fromPort || ''} → ${item.toPort || ''}`)}</h3>
    <div class="meta">${esc(item.depart || '—')} – ${esc(item.arrive || '—')} · ${dec(item.distance)} sm · ${esc(item.wind || 'Wind —')} · ${esc(item.wave || 'Welle —')}</div>
    <p>${esc(item.summary || '').replace(/\n/g, '<br>')}</p>
    ${item.moment ? `<blockquote>„${esc(item.moment)}“</blockquote>` : ''}`)).join('') || '<div class="card muted">Keine passenden Einträge.</div>';
}

function renderFuel(totalHours) {
  const liters = state.fuel.reduce((sum, item) => sum + num(item.liters), 0);
  const cost = state.fuel.reduce((sum, item) => sum + num(item.liters) * num(item.price), 0);
  $('#fuelLiters').textContent = `${dec(liters)} l`;
  $('#fuelCost').textContent = eur(cost);
  $('#fuelPrice').textContent = liters ? `${eur(cost / liters)}/l` : '—';
  $('#fuelPerHour').textContent = totalHours ? `${dec(liters / totalHours)} l/h` : '—';
  $('#fuelList').innerHTML = state.fuel.map(item => card(item, 'fuel', `
    <h3>${esc(item.place || 'Tankvorgang')}</h3>
    <div class="meta">${fmtDate(item.date)} · ${dec(item.liters)} l · ${eur(num(item.price))}/l · ${eur(num(item.liters) * num(item.price))}${item.tankPercent !== '' && item.tankPercent !== undefined ? ` · Tank ${esc(item.tankPercent)} %` : ''}</div>
    <p>${esc(item.note || '')}</p>`)).join('') || '<div class="card muted">Noch keine Tankvorgänge eingetragen.</div>';
}

function renderMaintenance() {
  $('#maintenanceList').innerHTML = state.maintenance.map(item => card(item, 'maintenance', `
    <div class="meta">${fmtDate(item.date)} · ${esc(item.category)} · ${item.done ? 'erledigt' : 'offen'}</div>
    <h3>${esc(item.title)}</h3>
    <div class="meta">${item.dueDate ? `Fällig: ${fmtDate(item.dueDate)}` : ''}${item.dueHours ? ` · bei ${dec(item.dueHours)} h` : ''}${item.cost ? ` · ${eur(item.cost)}` : ''}</div>
    <p>${esc(item.note || '')}</p>`, item.done ? 'done' : '')).join('') || '<div class="card muted">Noch keine Wartungseinträge.</div>';
}

function weatherSymbol(text) {
  const value = String(text || '').toLowerCase();
  if (/gewitter|donner/.test(value)) return '⛈️';
  if (/schauer/.test(value)) return '🌦️';
  if (/regen|nass/.test(value)) return '🌧️';
  if (/nebel|diesig/.test(value)) return '🌫️';
  if (/sonn|klar|heiter/.test(value)) return '☀️';
  if (/wolk|bedeckt/.test(value)) return '☁️';
  return '⚓';
}

function routeStatusText(status) {
  if (status === 'done') return 'gefahren';
  if (status === 'skip') return 'entfällt';
  return 'geplant';
}

function portByName(name) {
  const needle = String(name || '').trim().toLocaleLowerCase('de');
  if (!needle) return null;
  return state.ports.find(port => String(port.name || '').trim().toLocaleLowerCase('de') === needle) || null;
}

function renderRoute() {
  const routes = [...state.route].sort((a, b) => String(a.date).localeCompare(String(b.date)) || num(a.created) - num(b.created));
  const considered = routes.filter(item => item.status !== 'skip');
  const remaining = routes.filter(item => item.status !== 'done' && item.status !== 'skip');
  const nauticalMiles = considered.reduce((sum, item) => sum + num(item.nm), 0);
  const remainingNm = remaining.reduce((sum, item) => sum + num(item.nm), 0);
  const hours = considered.reduce((sum, item) => sum + num(item.hours), 0);
  const remainingHours = remaining.reduce((sum, item) => sum + num(item.hours), 0);
  const ports = new Set(routes.flatMap(item => [item.from, item.to]).map(value => String(value || '').trim()).filter(Boolean));
  const next = remaining[0];
  const settings = getSettings();

  $('#voyageBoardTitle').textContent = settings.tripTitle || 'Etappen der LEEFKE';
  $('#routeSummary').innerHTML = `${routes.length} Etappen · ${dec(nauticalMiles)} sm${hours ? ` · ${dec(hours)} Std. Planzeit` : ''}`;
  $('#tripRemaining').textContent = `${dec(remainingNm)} sm`;
  $('#tripPlanHours').textContent = remainingHours ? `${dec(remainingHours)} Std.` : '—';
  $('#tripPorts').textContent = ports.size;
  $('#tripNext').textContent = next ? `${next.from || '—'} → ${next.to || '—'}` : 'Törn vollständig';
  $('#tripNextMeta').textContent = next ? `${fmtDate(next.date)}${next.departTime ? ` · ${next.departTime} Uhr` : ''}${next.nm ? ` · ${dec(next.nm)} sm` : ''}` : 'Keine offene Etappe';

  $('#routeList').innerHTML = routes.map((item, index) => {
    const linkedGpx = state.gpx.find(route => route.id === item.gpxId);
    const destinationPort = portByName(item.to);
    const conditions = [
      item.weather ? `<span><b>${weatherSymbol(item.weather)}</b>${esc(item.weather)}</span>` : '',
      item.wind ? `<span><b>💨</b>${esc(item.wind)}</span>` : '',
      item.wave ? `<span><b>🌊</b>${esc(item.wave)}</span>` : '',
      item.tide ? `<span><b>↕</b>${esc(item.tide)}</span>` : ''
    ].filter(Boolean).join('');
    return `<article class="voyage-stage ${esc(item.status || 'planned')}">
      <div class="stage-rail"><span>${index + 1}</span></div>
      <div class="stage-content">
        <div class="stage-topline"><span>${fmtDate(item.date) || 'Datum offen'}${item.departTime ? ` · Ablegen ${esc(item.departTime)} Uhr` : ''}</span><span class="status-chip ${esc(item.status || 'planned')}">${routeStatusText(item.status)}</span></div>
        <div class="stage-heading"><div><small>ETAPPE ${index + 1}</small><h3>${esc(item.from || 'Start offen')} <i>→</i> ${esc(item.to || 'Ziel offen')}</h3></div><div class="stage-distance"><strong>${dec(item.nm)} sm</strong>${item.hours ? `<span>${dec(item.hours)} Std.</span>` : ''}</div></div>
        ${conditions ? `<div class="stage-conditions">${conditions}</div>` : '<div class="stage-conditions empty">Wetter, Wind, Welle und Tide noch nicht eingetragen.</div>'}
        ${item.berth ? `<div class="stage-berth"><span>⚓</span><div><small>LIEGEPLATZ / HAFENHINWEIS</small><strong>${esc(item.berth)}</strong></div></div>` : ''}
        ${destinationPort ? `<div class="stage-port"><div><small>IM HAFENBUCH</small><strong>${esc(destinationPort.name)}</strong></div><div>${stars(destinationPort.rating || 0)}<span>${destinationPort.berth ? esc(destinationPort.berth) : 'Hafeneintrag vorhanden'}</span></div></div>` : ''}
        ${item.note ? `<p class="stage-note">${esc(item.note).replace(/\n/g, '<br>')}</p>` : ''}
        <div class="stage-footer">
          <div class="stage-gpx">${linkedGpx ? `<span>⌁ ${esc(linkedGpx.name)} · ${dec(linkedGpx.distanceNm)} sm</span>` : '<span class="muted">Keine GPX-Route zugeordnet</span>'}</div>
          <div class="stage-actions">
            ${linkedGpx ? `<button type="button" onclick="showRouteGpx('${item.id}')">Auf Seekarte</button>` : ''}
            <button type="button" onclick="weatherForRoute('${item.id}')">Wetter & Tide</button>
            <button type="button" onclick="routeToDay('${item.id}')">Ins Tageslog</button>
            <button type="button" onclick="editItem('route','${item.id}')">Bearbeiten</button>
            <button type="button" class="danger-text" onclick="removeItem('route','${item.id}')">Löschen</button>
          </div>
        </div>
      </div>
    </article>`;
  }).join('') || '<div class="card muted">Noch keine Etappen geplant.</div>';
}

function returnLabel(value) {
  if (value === 'no') return ['Eher nicht noch einmal', 'no'];
  if (value === 'maybe') return ['Vielleicht noch einmal', 'maybe'];
  return ['Gerne wieder anlaufen', ''];
}

function renderPorts() {
  const query = ($('#portSearch')?.value || '').toLowerCase();
  const filtered = state.ports.filter(item => JSON.stringify(item).toLowerCase().includes(query));
  $('#portList').innerHTML = filtered.map(item => {
    const [returnText, returnClass] = returnLabel(item.returnVisit || 'yes');
    return card(item, 'ports', `
      <div class="port-head"><div><div class="meta">${fmtDate(item.date)}</div><h3>${esc(item.name)}</h3><div class="port-rating-summary">${stars(item.rating || 0, true)}<strong>${ratingLabel(item.rating || 0)}</strong></div></div></div>
      <div class="meta">Liegeplatz: ${esc(item.berth || '—')} · ${item.cost ? eur(item.cost) : 'Kosten —'}</div>
      <span class="return-badge ${returnClass}">${returnText}</span>
      <div class="port-ratings">
        <div class="port-rating-row"><span>Freundlichkeit</span>${stars(item.ratingFriendly || 0)}</div>
        <div class="port-rating-row"><span>Sanitäranlagen</span>${stars(item.ratingSanitary || 0)}</div>
        <div class="port-rating-row"><span>Versorgung</span>${stars(item.ratingSupply || 0)}</div>
        <div class="port-rating-row"><span>Preis-Leistung</span>${stars(item.ratingValue || 0)}</div>
      </div>
      ${item.contact ? `<p><b>UKW / Telefon:</b> ${esc(item.contact)}</p>` : ''}
      ${item.coords ? `<p><b>Position:</b> ${esc(item.coords)}</p>` : ''}
      ${item.services ? `<p><b>Versorgung:</b> ${esc(item.services)}</p>` : ''}
      ${item.approach ? `<p><b>Ansteuerung:</b> ${esc(item.approach).replace(/\n/g, '<br>')}</p>` : ''}
      ${item.note ? `<p>${esc(item.note).replace(/\n/g, '<br>')}</p>` : ''}`);
  }).join('') || '<div class="card muted">Keine passenden Häfen.</div>';
}

function renderChecks() {
  const groups = {};
  state.checklists.forEach(item => (groups[item.group || 'Eigene Punkte'] ??= []).push(item));
  $('#checks').innerHTML = Object.entries(groups).map(([group, items]) => `<article class="card"><div class="card-kicker">CHECKLISTE</div><h3>${esc(group)}</h3>${items.map(item => `<label class="check"><input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleCheck('${item.id}',this.checked)"><span>${esc(item.item)}</span><button class="mini" onclick="removeItem('checklists','${item.id}');return false" aria-label="Prüfpunkt löschen">×</button></label>`).join('')}</article>`).join('');
}

function renderPhotos() {
  $('#photoGrid').innerHTML = [...state.photos].sort((a, b) => (b.created || 0) - (a.created || 0)).map(item => `<figure class="photo"><button class="delete" onclick="removeItem('photos','${item.id}')" aria-label="Foto löschen">×</button><img src="${item.data}" alt="${esc(item.caption || 'Foto der LEEFKE')}"><figcaption><strong>${esc(item.caption || 'LEEFKE')}</strong><div class="meta">${fmtDate(item.date)}</div></figcaption></figure>`).join('') || '<div class="card muted">Noch keine Fotos in der Galerie.</div>';
}

function renderSettings(settings) {
  const form = $('#settingsForm');
  if (document.activeElement?.closest('#settingsForm')) return;
  Object.entries(settings).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value ?? '';
  });
}

function renderGpxSelect() {
  const mapSelect = $('#gpxSelect');
  const formSelect = $('#routeGpxSelect');
  const options = state.gpx.map(item => `<option value="${item.id}">${esc(item.name)} (${dec(item.distanceNm)} sm)</option>`).join('');

  if (mapSelect) {
    const current = mapSelect.value || selectedGpxId;
    mapSelect.innerHTML = '<option value="">Keine GPX-Route</option>' + options;
    if (state.gpx.some(item => item.id === current)) mapSelect.value = current;
    else if (state.gpx[0]) mapSelect.value = state.gpx[0].id;
    selectedGpxId = mapSelect.value;
  }

  if (formSelect) {
    const currentFormValue = formSelect.value;
    formSelect.innerHTML = '<option value="">Noch keine GPX-Route zugeordnet</option>' + options;
    if (state.gpx.some(item => item.id === currentFormValue)) formSelect.value = currentFormValue;
  }

  updateMapInfo(state.gpx.find(item => item.id === selectedGpxId));
  if ($('#route')?.classList.contains('active')) drawGpx(selectedGpxId);
}

function renderPortDatalist() {
  const list = $('#portNames');
  if (!list) return;
  const names = new Set();
  state.ports.forEach(item => item.name && names.add(String(item.name).trim()));
  state.route.forEach(item => {
    if (item.from) names.add(String(item.from).trim());
    if (item.to) names.add(String(item.to).trim());
  });
  list.innerHTML = [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, 'de')).map(name => `<option value="${esc(name)}"></option>`).join('');
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

for (const id of ['day', 'fuel', 'maintenance', 'route', 'port']) {
  const form = $(`#${id}Form`);
  form.onsubmit = async event => {
    event.preventDefault();
    const item = formObject(form);
    item.id = item.id || uid();
    item.created = item.created || Date.now();
    if (id === 'maintenance') item.done = item.done === 'true';
    const store = id === 'port' ? 'ports' : id === 'day' ? 'days' : id;
    await put(store, item);
    if (id === 'route' && item.gpxId) selectedGpxId = item.gpxId;
    form.reset();
    syncRatingPickers(form);
    await refresh();
    toast(id === 'port' ? 'Hafen mit Sternen gespeichert' : 'Gespeichert');
  };
}

$('#settingsForm').onsubmit = async event => {
  event.preventDefault();
  const current = normalizeSettingsRecord(getSettings(), getSettings()._updatedAt);
  const formValues = formObject(event.target);
  const now = new Date().toISOString();
  const fieldTimes = { ...(current._fieldUpdatedAt || {}) };
  for (const [field, value] of Object.entries(formValues)) {
    if (String(current[field] ?? '') !== String(value ?? '')) fieldTimes[field] = now;
  }
  const updated = { ...current, ...formValues, id: 'main', _fieldUpdatedAt: fieldTimes };
  await put('settings', updated);
  await refresh();
  toast('Schiffsdaten der LEEFKE gespeichert und zur Synchronisierung vorgemerkt');
};

$('#checkForm').onsubmit = async event => {
  event.preventDefault();
  const item = formObject(event.target);
  await put('checklists', { id: uid(), group: item.group || 'Eigene Punkte', item: item.item, done: false });
  event.target.reset();
  await refresh();
  toast('Prüfpunkt hinzugefügt');
};

$('#resetChecks').onclick = async () => {
  for (const item of state.checklists) {
    item.done = false;
    await put('checklists', item);
  }
  await refresh();
  toast('Checklisten zurückgesetzt');
};

$('#photoForm').onsubmit = event => {
  event.preventDefault();
  const formData = new FormData(event.target);
  const file = formData.get('photo');
  if (!file || !file.size) return;
  if (file.size > 8e6) return alert('Das Foto ist größer als 8 MB. Bitte vorher verkleinern.');
  const reader = new FileReader();
  reader.onload = async () => {
    await put('photos', { id: uid(), date: formData.get('date'), caption: formData.get('caption'), data: reader.result, created: Date.now() });
    event.target.reset();
    await refresh();
    toast('Foto hinzugefügt');
  };
  reader.readAsDataURL(file);
};

$('#boatPhotoInput').onchange = event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 8e6) return alert('Das Startbild ist größer als 8 MB. Bitte vorher verkleinern.');
  const reader = new FileReader();
  reader.onload = async () => {
    const settings = { ...getSettings(), boatPhoto: reader.result, id: 'main' };
    await put('settings', settings);
    await refresh();
    event.target.value = '';
    toast('Neues Startbild gespeichert');
  };
  reader.readAsDataURL(file);
};

$('#boatPhotoReset').onclick = async () => {
  const settings = { ...getSettings(), boatPhoto: '', id: 'main' };
  await put('settings', settings);
  await refresh();
  toast('Mitgeliefertes LEEFKE-Foto wiederhergestellt');
};

async function removeItem(store, id) {
  if (confirm('Eintrag wirklich löschen?')) {
    await del(store, id);
    await refresh();
    toast('Gelöscht');
  }
}

async function toggleCheck(id, done) {
  const item = state.checklists.find(entry => entry.id === id);
  if (!item) return;
  item.done = done;
  await put('checklists', item);
  await refresh();
}

function fillForm(form, item) {
  Object.entries(item).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = typeof value === 'boolean' ? String(value) : value ?? '';
  });
  syncRatingPickers(form);
}

function editItem(kind, id) {
  const item = state[kind].find(entry => entry.id === id);
  const map = { days: 'day', ports: 'port', fuel: 'fuel', maintenance: 'maintenance', route: 'route' };
  if (!item || !map[kind]) return;
  const form = $(`#${map[kind]}Form`);
  fillForm(form, item);
  view(map[kind] === 'port' ? 'ports' : map[kind]);
  form.scrollIntoView({ behavior: 'smooth' });
  toast('Eintrag zum Bearbeiten geöffnet');
}

function showRouteGpx(routeId) {
  const stage = state.route.find(item => item.id === routeId);
  if (!stage?.gpxId) return toast('Dieser Etappe ist noch keine GPX-Route zugeordnet');
  selectedGpxId = stage.gpxId;
  const select = $('#gpxSelect');
  if (select) select.value = stage.gpxId;
  view('route');
  window.setTimeout(() => {
    drawGpx(stage.gpxId);
    $('#routeMap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 120);
}

function routeToDay(routeId) {
  const stage = state.route.find(item => item.id === routeId);
  if (!stage) return;
  const form = $('#dayForm');
  form.reset();
  form.elements.date.value = stage.date || new Date().toISOString().slice(0, 10);
  form.elements.title.value = `${stage.from || ''} → ${stage.to || ''}`;
  form.elements.fromPort.value = stage.from || '';
  form.elements.toPort.value = stage.to || '';
  form.elements.depart.value = stage.departTime || '';
  form.elements.distance.value = stage.nm || '';
  form.elements.weather.value = stage.weather || '';
  form.elements.wind.value = stage.wind || '';
  form.elements.wave.value = stage.wave || '';
  form.elements.tide.value = stage.tide || '';
  form.elements.crew.value = getSettings().defaultCrew || '';
  form.elements.summary.value = [stage.berth ? `Geplanter Liegeplatz: ${stage.berth}` : '', stage.note || ''].filter(Boolean).join('\n\n');
  view('day');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast('Etappe ins Tageslog übernommen');
}

window.showRouteGpx = showRouteGpx;
window.routeToDay = routeToDay;
window.removeItem = removeItem;
window.toggleCheck = toggleCheck;
window.editItem = editItem;

$('#daySearch').oninput = renderDays;
$('#portSearch').oninput = renderPorts;

function haversine(a, b) {
  const radius = 3440.065;
  const radians = Math.PI / 180;
  const dLat = (b[0] - a[0]) * radians;
  const dLon = (b[1] - a[1]) * radians;
  const calc = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(calc));
}

$('#gpxImport').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const xml = new DOMParser().parseFromString(await file.text(), 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('Ungültige XML-Datei');
    const points = [...xml.querySelectorAll('trkpt,rtept')]
      .map(point => [num(point.getAttribute('lat')), num(point.getAttribute('lon'))])
      .filter(point => point.every(Number.isFinite));
    if (points.length < 2) throw new Error('Keine Route');
    const distance = points.slice(1).reduce((sum, point, index) => sum + haversine(points[index], point), 0);
    const embeddedName = xml.querySelector('metadata > name, trk > name, rte > name')?.textContent?.trim();
    const route = {
      id: uid(),
      name: embeddedName || file.name.replace(/\.gpx$/i, ''),
      points,
      distanceNm: distance,
      created: Date.now()
    };
    await put('gpx', route);
    selectedGpxId = route.id;
    await refresh();
    $('#gpxSelect').value = route.id;
    $('#gpxInfo').textContent = `${points.length} Punkte · ${dec(distance)} sm importiert`;
    drawGpx(route.id);
    toast('GPX-Route auf Seekarte importiert');
  } catch (error) {
    console.error(error);
    alert('Die GPX-Datei konnte nicht gelesen werden. Sie muss mindestens zwei Track- oder Routenpunkte enthalten.');
  } finally {
    event.target.value = '';
  }
};

$('#gpxSelect').onchange = event => {
  selectedGpxId = event.target.value;
  drawGpx(selectedGpxId);
};

$('#fitRoute').onclick = () => {
  if (!activeRouteBounds || !nauticalMap) {
    toast('Bitte zuerst eine GPX-Route auswählen');
    return;
  }
  nauticalMap.fitBounds(activeRouteBounds, { padding: [36, 36], maxZoom: 14 });
};

function ensureNauticalMap() {
  const mapElement = $('#routeMap');
  if (!mapElement || nauticalMap) return nauticalMap;
  if (!window.L) {
    mapElement.innerHTML = '<div class="map-placeholder"><strong>Seekarte konnte nicht geladen werden</strong><span>Für die erste Kartenanzeige wird eine Internetverbindung benötigt. Bitte die Seite neu laden.</span></div>';
    return null;
  }

  mapElement.innerHTML = '';
  nauticalMap = L.map(mapElement, {
    zoomControl: true,
    preferCanvas: true,
    minZoom: 3,
    maxZoom: 18
  }).setView([53.72, 8.55], 8);

  nauticalBaseLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap-Mitwirkende'
  }).addTo(nauticalMap);

  seamarkLayer = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
    maxZoom: 18,
    opacity: 1,
    attribution: 'Seezeichen &copy; OpenSeaMap'
  }).addTo(nauticalMap);

  portLayer = L.layerGroup().addTo(nauticalMap);

  L.control.layers(
    { 'Kartenhintergrund': nauticalBaseLayer },
    { 'Tonnen & Seezeichen': seamarkLayer, 'Gespeicherte Häfen': portLayer },
    { collapsed: true, position: 'topright' }
  ).addTo(nauticalMap);
  L.control.scale({ metric: true, imperial: false, maxWidth: 160 }).addTo(nauticalMap);
  refreshPortLayer();

  nauticalMap.on('baselayerchange overlayadd overlayremove', () => {
    window.setTimeout(() => nauticalMap.invalidateSize(), 20);
  });
  return nauticalMap;
}

function parseCoordinates(value) {
  const matches = String(value || '').match(/-?\d+(?:[.,]\d+)?/g);
  if (!matches || matches.length < 2) return null;
  const point = matches.slice(0, 2).map(part => Number(part.replace(',', '.')));
  if (!point.every(Number.isFinite) || Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) return null;
  return point;
}

function portMarkerIcon() {
  return L.divIcon({
    className: 'leefke-port-marker',
    html: '<span>⚓</span>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16]
  });
}

function refreshPortLayer() {
  if (!portLayer || !window.L) return;
  portLayer.clearLayers();
  state.ports.forEach(port => {
    const point = parseCoordinates(port.coords);
    if (!point) return;
    const rating = clamp(Math.round(num(port.rating)), 0, 5);
    const marker = L.marker(point, { icon: portMarkerIcon(), title: port.name || 'Hafen' });
    marker.bindPopup(`<div class="port-map-popup"><strong>${esc(port.name || 'Hafen')}</strong><div>${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</div>${port.berth ? `<span>Liegeplatz: ${esc(port.berth)}</span>` : ''}${port.services ? `<span>${esc(port.services)}</span>` : ''}</div>`);
    portLayer.addLayer(marker);
  });
}

function routeMarker(type, label) {
  const symbol = type === 'start' ? '⚓' : '◆';
  return L.divIcon({
    className: `leefke-route-marker ${type}`,
    html: `<span>${symbol}</span><b>${esc(label)}</b>`,
    iconSize: [76, 42],
    iconAnchor: [20, 21],
    popupAnchor: [0, -20]
  });
}

function coordinateText(point) {
  if (!point) return '';
  return `${point[0].toFixed(5)}° N · ${point[1].toFixed(5)}° E`;
}

function updateMapInfo(route) {
  const info = $('#mapInfo');
  if (!info) return;
  if (!route) {
    info.innerHTML = '<strong>Noch keine GPX-Route ausgewählt.</strong><span>Importiere eine Route vom Plotter oder Planungsprogramm.</span>';
    return;
  }
  const start = route.points?.[0];
  const end = route.points?.at(-1);
  info.innerHTML = `<strong>${esc(route.name)}</strong><span>${dec(route.distanceNm)} sm · ${route.points?.length || 0} Punkte</span><small>Start ${coordinateText(start)} · Ziel ${coordinateText(end)}</small>`;
}

function clearActiveRoute() {
  if (activeGpxLayer && nauticalMap) nauticalMap.removeLayer(activeGpxLayer);
  activeGpxLayer = null;
  activeRouteBounds = null;
}

function drawGpx(id) {
  selectedGpxId = id || '';
  const route = state.gpx?.find(item => item.id === selectedGpxId);
  updateMapInfo(route);
  if (!$('#route')?.classList.contains('active')) return;

  const map = ensureNauticalMap();
  if (!map) return;
  map.invalidateSize();
  clearActiveRoute();

  if (!route?.points?.length) {
    map.setView([53.72, 8.55], 8);
    return;
  }

  const latLngs = route.points.map(point => L.latLng(point[0], point[1]));
  const start = latLngs[0];
  const finish = latLngs.at(-1);
  const halo = L.polyline(latLngs, {
    color: '#08283b',
    weight: 9,
    opacity: 0.72,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
    smoothFactor: 1.2
  });
  const course = L.polyline(latLngs, {
    color: '#f2bd2e',
    weight: 5,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
    smoothFactor: 1.2
  }).bindPopup(`<strong>${esc(route.name)}</strong><br>${dec(route.distanceNm)} sm · ${route.points.length} Punkte`);

  const startMarker = L.marker(start, { icon: routeMarker('start', 'Start') })
    .bindPopup(`<strong>Start</strong><br>${coordinateText(route.points[0])}`);
  const finishMarker = L.marker(finish, { icon: routeMarker('finish', 'Ziel') })
    .bindPopup(`<strong>Ziel</strong><br>${coordinateText(route.points.at(-1))}`);

  activeGpxLayer = L.layerGroup([halo, course, startMarker, finishMarker]).addTo(map);
  activeRouteBounds = L.latLngBounds(latLngs);
  map.fitBounds(activeRouteBounds, { padding: [36, 36], maxZoom: 14 });
}



function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(num(value) * factor) / factor;
}

function dateInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateInputValue(date);
}

function parseCoordinateString(value) {
  const text = String(value || '').trim();
  let match = text.match(/(-?\d+(?:[.,]\d+)?)\s*[;/]\s*(-?\d+(?:[.,]\d+)?)/);
  if (!match) match = text.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) match = text.match(/(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const latitude = Number(match[1].replace(',', '.'));
  const longitude = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function coordinateLabel(latitude, longitude) {
  const lat = Math.abs(latitude).toFixed(4).replace('.', ',');
  const lon = Math.abs(longitude).toFixed(4).replace('.', ',');
  return `${lat}° ${latitude >= 0 ? 'N' : 'S'} · ${lon}° ${longitude >= 0 ? 'E' : 'W'}`;
}

function normalizePlaceName(value) {
  return String(value || '').toLocaleLowerCase('de').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
}

function fixedLocationByName(name) {
  const normalized = normalizePlaceName(name);
  return Object.values(WEATHER_LOCATIONS).find(item => normalizePlaceName(item.name) === normalized) || null;
}

function routeEndpointLocation(route, side) {
  if (!route) return null;
  const placeName = side === 'from' ? route.from : route.to;
  const fixed = fixedLocationByName(placeName);
  if (fixed) return { ...fixed, source: 'route', routeId: route.id, routeSide: side };
  const port = portByName(placeName);
  const coords = parseCoordinateString(port?.coords);
  if (coords) return { name: placeName || port.name, ...coords, source: 'route', routeId: route.id, routeSide: side, zoom: 11 };
  const gpx = state.gpx?.find(item => item.id === route.gpxId);
  const point = side === 'from' ? gpx?.points?.[0] : gpx?.points?.at(-1);
  if (point) return { name: placeName || `${side === 'from' ? 'Start' : 'Ziel'} der Etappe`, latitude: num(point[0]), longitude: num(point[1]), source: 'route', routeId: route.id, routeSide: side, zoom: 11 };
  return { name: placeName || 'Etappenpunkt', source: 'route', routeId: route.id, routeSide: side, unresolved: true };
}

async function geocodeWeatherLocation(location) {
  if (!location?.unresolved || !location.name || !navigator.onLine) return location;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location.name)}&count=5&language=de&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Der Etappenort konnte nicht gefunden werden. Bitte Koordinaten im Hafenbuch hinterlegen oder den Punkt auf der Seekarte wählen.');
  const data = await response.json();
  const result = (data.results || []).find(item => ['DE', 'DK', 'NL'].includes(item.country_code)) || data.results?.[0];
  if (!result) throw new Error('Der Etappenort konnte nicht gefunden werden. Bitte den Punkt auf der Seekarte wählen.');
  return { ...location, latitude: result.latitude, longitude: result.longitude, unresolved: false, geocoded: true, name: location.name || result.name };
}

function renderWeatherLocationOptions() {
  const select = $('#weatherLocation');
  if (!select) return;
  const current = select.value || 'fixed:lemwerder';
  const fixedOptions = Object.values(WEATHER_LOCATIONS).map(item => `<option value="fixed:${item.key}">${esc(item.name)}</option>`).join('');
  const routeOptions = [...state.route].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((route, index) => {
    const date = fmtDate(route.date);
    return `<option value="route:${route.id}:from">Etappe ${index + 1}${date ? ` · ${date}` : ''} · Start: ${esc(route.from || 'offen')}</option><option value="route:${route.id}:to">Etappe ${index + 1}${date ? ` · ${date}` : ''} · Ziel: ${esc(route.to || 'offen')}</option>`;
  }).join('');
  select.innerHTML = `<optgroup label="Feste Orte">${fixedOptions}</optgroup>${routeOptions ? `<optgroup label="Ort aus geplanter Etappe">${routeOptions}</optgroup>` : ''}<optgroup label="Freier Punkt"><option value="map:custom">Punkt direkt auf der Seekarte</option></optgroup>`;
  if ([...select.options].some(option => option.value === current)) select.value = current;
  else select.value = 'fixed:lemwerder';
}

function weatherMarkerIcon() {
  return L.divIcon({ className: 'weather-pick-marker', html: '<span><b>⚓</b></span>', iconSize: [34, 34], iconAnchor: [10, 31] });
}

function ensureWeatherMap() {
  const element = $('#weatherMap');
  if (!element || typeof L === 'undefined') return null;
  if (weatherMap) return weatherMap;
  weatherMap = L.map(element, { zoomControl: true, attributionControl: true }).setView([53.72, 8.55], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(weatherMap);
  L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', { maxZoom: 18, opacity: .95, attribution: 'OpenSeaMap' }).addTo(weatherMap);
  weatherMap.on('click', event => {
    const location = { name: 'Punkt auf der Seekarte', latitude: event.latlng.lat, longitude: event.latlng.lng, source: 'map', zoom: weatherMap.getZoom() };
    setWeatherLocation(location, { pan: false });
    $('#weatherLocation').value = 'map:custom';
    weatherMapPickMode = false;
    $('#weatherMapPickButton').textContent = 'Punkt auf Seekarte wählen';
    toast('Wetterpunkt auf der Seekarte gewählt');
  });
  return weatherMap;
}

function setWeatherLocation(location, options = {}) {
  if (!location || !Number.isFinite(num(location.latitude)) || !Number.isFinite(num(location.longitude))) return;
  weatherSelectedLocation = { ...location, latitude: num(location.latitude), longitude: num(location.longitude) };
  const map = ensureWeatherMap();
  if (map) {
    if (weatherMarker) weatherMarker.setLatLng([weatherSelectedLocation.latitude, weatherSelectedLocation.longitude]);
    else weatherMarker = L.marker([weatherSelectedLocation.latitude, weatherSelectedLocation.longitude], { icon: weatherMarkerIcon() }).addTo(map);
    if (options.pan !== false) map.setView([weatherSelectedLocation.latitude, weatherSelectedLocation.longitude], weatherSelectedLocation.zoom || 11);
  }
  $('#weatherMapCoordinate').textContent = coordinateLabel(weatherSelectedLocation.latitude, weatherSelectedLocation.longitude);
  const extra = weatherSelectedLocation.note ? ` · ${weatherSelectedLocation.note}` : '';
  $('#weatherSelectionInfo').textContent = `${weatherSelectedLocation.name} · ${coordinateLabel(weatherSelectedLocation.latitude, weatherSelectedLocation.longitude)}${extra}`;
  activeWeatherRouteId = weatherSelectedLocation.routeId || '';
  $('#weatherApplyRouteButton').hidden = !activeWeatherRouteId;
}

async function weatherLocationFromSelection(value = $('#weatherLocation')?.value) {
  if (value?.startsWith('fixed:')) return { ...WEATHER_LOCATIONS[value.split(':')[1]], source: 'fixed' };
  if (value?.startsWith('route:')) {
    const [, id, side] = value.split(':');
    return geocodeWeatherLocation(routeEndpointLocation(state.route.find(item => item.id === id), side));
  }
  if (value === 'map:custom' && weatherSelectedLocation?.source === 'map') return weatherSelectedLocation;
  return weatherSelectedLocation || { ...WEATHER_LOCATIONS.lemwerder, source: 'fixed' };
}

async function updateWeatherSelection() {
  try {
    const location = await weatherLocationFromSelection();
    if (location?.unresolved) throw new Error('Für diesen Etappenort fehlen Koordinaten. Bitte im Hafenbuch hinterlegen oder auf der Seekarte wählen.');
    setWeatherLocation(location);
  } catch (error) {
    setWeatherMessage(error.message, 'error');
  }
}

function prepareWeatherView() {
  const today = dateInputValue();
  const date = $('#weatherDate');
  if (date && !date.value) date.value = today;
  if (date) {
    date.min = today;
    date.max = addDays(today, WEATHER_MAX_FORECAST_DAYS);
  }
  renderWeatherLocationOptions();
  ensureWeatherMap();
  if (!weatherSelectedLocation) updateWeatherSelection();
  else setWeatherLocation(weatherSelectedLocation, { pan: false });
}

function setWeatherMessage(text = '', type = '') {
  const element = $('#weatherLoadState');
  if (!element) return;
  element.textContent = text;
  element.className = `sync-message${type ? ` ${type}` : ''}`;
}

function windDirectionText(degrees) {
  if (degrees === null || degrees === undefined || Number.isNaN(Number(degrees))) return '—';
  const labels = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return labels[Math.round((Number(degrees) % 360) / 22.5) % 16];
}

function beaufortFromKnots(knots) {
  const thresholds = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
  const value = num(knots);
  for (let i = 0; i < thresholds.length; i += 1) if (value < thresholds[i]) return i;
  return 12;
}

function weatherCodeInfo(code) {
  const lookup = {
    0: ['☀️', 'klar'], 1: ['🌤️', 'überwiegend klar'], 2: ['⛅', 'teilweise bewölkt'], 3: ['☁️', 'bedeckt'],
    45: ['🌫️', 'Nebel'], 48: ['🌫️', 'Reifnebel'], 51: ['🌦️', 'leichter Nieselregen'], 53: ['🌦️', 'Nieselregen'], 55: ['🌧️', 'starker Nieselregen'],
    61: ['🌦️', 'leichter Regen'], 63: ['🌧️', 'Regen'], 65: ['🌧️', 'starker Regen'], 66: ['🌧️', 'gefrierender Regen'], 67: ['🌧️', 'starker gefrierender Regen'],
    71: ['🌨️', 'leichter Schneefall'], 73: ['🌨️', 'Schneefall'], 75: ['🌨️', 'starker Schneefall'], 77: ['🌨️', 'Schneegriesel'],
    80: ['🌦️', 'leichte Schauer'], 81: ['🌧️', 'Schauer'], 82: ['⛈️', 'starke Schauer'], 85: ['🌨️', 'Schneeschauer'], 86: ['🌨️', 'starke Schneeschauer'],
    95: ['⛈️', 'Gewitter'], 96: ['⛈️', 'Gewitter mit Hagel'], 99: ['⛈️', 'starkes Gewitter mit Hagel']
  };
  return lookup[Number(code)] || ['⚓', 'Wetterlage'];
}

function finiteOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeForecastHours(weather, marine, date) {
  const map = new Map();
  const weatherHourly = weather?.hourly || {};
  (weatherHourly.time || []).forEach((time, index) => {
    if (!String(time).startsWith(date)) return;
    map.set(time, {
      time,
      temperature: finiteOrNull(weatherHourly.temperature_2m?.[index]),
      apparentTemperature: finiteOrNull(weatherHourly.apparent_temperature?.[index]),
      precipitationProbability: finiteOrNull(weatherHourly.precipitation_probability?.[index]),
      weatherCode: finiteOrNull(weatherHourly.weather_code?.[index]),
      visibility: finiteOrNull(weatherHourly.visibility?.[index]),
      windSpeed: finiteOrNull(weatherHourly.wind_speed_10m?.[index]),
      windDirection: finiteOrNull(weatherHourly.wind_direction_10m?.[index]),
      windGust: finiteOrNull(weatherHourly.wind_gusts_10m?.[index])
    });
  });
  const marineHourly = marine?.hourly || {};
  (marineHourly.time || []).forEach((time, index) => {
    if (!String(time).startsWith(date)) return;
    const entry = map.get(time) || { time };
    Object.assign(entry, {
      waveHeight: finiteOrNull(marineHourly.wave_height?.[index]),
      waveDirection: finiteOrNull(marineHourly.wave_direction?.[index]),
      wavePeriod: finiteOrNull(marineHourly.wave_period?.[index]),
      wavePeakPeriod: finiteOrNull(marineHourly.wave_peak_period?.[index]),
      windWaveHeight: finiteOrNull(marineHourly.wind_wave_height?.[index]),
      windWaveDirection: finiteOrNull(marineHourly.wind_wave_direction?.[index]),
      windWavePeriod: finiteOrNull(marineHourly.wind_wave_period?.[index]),
      swellHeight: finiteOrNull(marineHourly.swell_wave_height?.[index]),
      swellDirection: finiteOrNull(marineHourly.swell_wave_direction?.[index]),
      swellPeriod: finiteOrNull(marineHourly.swell_wave_period?.[index]),
      seaLevel: finiteOrNull(marineHourly.sea_level_height_msl?.[index]),
      currentVelocityKmh: finiteOrNull(marineHourly.ocean_current_velocity?.[index]),
      currentDirection: finiteOrNull(marineHourly.ocean_current_direction?.[index])
    });
    map.set(time, entry);
  });
  return [...map.values()].sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

function currentKnots(hour) {
  return hour.currentVelocityKmh === null || hour.currentVelocityKmh === undefined ? null : hour.currentVelocityKmh / 1.852;
}

function chooseWeatherHour(hours, date) {
  if (!hours.length) return 0;
  const today = dateInputValue();
  const targetHour = date === today ? new Date().getHours() : 12;
  return hours.reduce((best, hour, index) => {
    const hourValue = Number(String(hour.time).slice(11, 13));
    const bestValue = Number(String(hours[best].time).slice(11, 13));
    return Math.abs(hourValue - targetHour) < Math.abs(bestValue - targetHour) ? index : best;
  }, 0);
}

function tideExtrema(hours) {
  const valid = hours.map((hour, index) => ({ index, time: hour.time, value: finiteOrNull(hour.seaLevel) })).filter(item => item.value !== null);
  const events = [];
  for (let i = 1; i < valid.length - 1; i += 1) {
    const previous = valid[i - 1];
    const current = valid[i];
    const next = valid[i + 1];
    if (current.value > previous.value && current.value >= next.value) events.push({ ...current, type: 'HW' });
    if (current.value < previous.value && current.value <= next.value) events.push({ ...current, type: 'NW' });
  }
  return events;
}

function tideStateAt(hours, index) {
  const current = hours[index];
  if (current?.seaLevel === null || current?.seaLevel === undefined) return { state: 'nicht verfügbar', next: null };
  const nextHour = hours[Math.min(index + 1, hours.length - 1)];
  const delta = finiteOrNull(nextHour?.seaLevel) === null ? 0 : nextHour.seaLevel - current.seaLevel;
  const state = delta > .015 ? 'steigend' : delta < -.015 ? 'fallend' : 'nahe Scheitelpunkt';
  const currentTime = new Date(current.time).getTime();
  const next = tideExtrema(hours).find(event => new Date(event.time).getTime() >= currentTime) || null;
  return { state, next };
}

function formatTime(time) {
  return time ? String(time).slice(11, 16) : '—';
}

function valueText(value, unit, digits = 1) {
  return value === null || value === undefined ? '—' : `${Number(value).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`;
}

function renderTideChart(hours, events) {
  const container = $('#tideChart');
  const points = hours.map((hour, index) => ({ index, time: hour.time, value: finiteOrNull(hour.seaLevel) })).filter(point => point.value !== null);
  if (points.length < 2) {
    container.innerHTML = '<div class="map-placeholder"><strong>Keine Tidekurve verfügbar</strong><span>Für diesen Modellpunkt wurden keine Wasserstandsdaten geliefert.</span></div>';
    return;
  }
  const width = 760, height = 230, left = 42, right = 18, top = 22, bottom = 34;
  const min = Math.min(...points.map(point => point.value));
  const max = Math.max(...points.map(point => point.value));
  const range = Math.max(.05, max - min);
  const x = index => left + (index / Math.max(1, hours.length - 1)) * (width - left - right);
  const y = value => top + (max - value) / range * (height - top - bottom);
  const line = points.map(point => `${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const area = `${left},${height - bottom} ${line} ${x(points.at(-1).index)},${height - bottom}`;
  const grid = [0, 6, 12, 18, 23].map(hour => `<line class="tide-axis" x1="${x(hour)}" x2="${x(hour)}" y1="${top}" y2="${height-bottom}"/><text class="tide-time-label" x="${x(hour)}" y="${height-12}" text-anchor="middle">${String(hour).padStart(2,'0')}:00</text>`).join('');
  const markers = events.map(event => `<circle class="${event.type === 'HW' ? 'tide-point-high' : 'tide-point-low'}" cx="${x(event.index)}" cy="${y(event.value)}" r="6"/><text class="tide-label" x="${x(event.index)}" y="${y(event.value) - 11}" text-anchor="middle">${event.type} ${formatTime(event.time)}</text>`).join('');
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Modellierte Tidekurve"><defs><linearGradient id="tideGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ca7bb"/><stop offset="1" stop-color="#e8f3f7"/></linearGradient></defs>${grid}<polygon class="tide-area" points="${area}"/><polyline class="tide-line" points="${line}"/>${markers}<text class="tide-time-label" x="8" y="${top+5}">${max.toFixed(2).replace('.',',')} m</text><text class="tide-time-label" x="8" y="${height-bottom}">${min.toFixed(2).replace('.',',')} m</text></svg>`;
}

function renderPegel(pegel) {
  const title = $('#pegelTitle');
  const current = $('#pegelCurrent');
  const meta = $('#pegelMeta');
  if (!pegel?.measurement) {
    title.textContent = 'Kein Messpegel gefunden';
    current.innerHTML = '<strong>—</strong><span>Für diesen Punkt ist kein naher PEGELONLINE-Wasserstand verfügbar.</span>';
    meta.textContent = '';
    return;
  }
  const measurement = pegel.measurement;
  title.textContent = pegel.stationName || 'PEGELONLINE';
  current.innerHTML = `<strong>${valueText(measurement.value, measurement.unit || 'cm', 0)}</strong><span>${pegel.trend || 'Trend nicht bestimmt'}</span>`;
  meta.textContent = `Messzeit ${measurement.timestamp ? new Date(measurement.timestamp).toLocaleString('de-DE') : '—'} · Entfernung zum gewählten Punkt ca. ${round(pegel.distanceKm, 1).toLocaleString('de-DE')} km`;
}

function renderWeatherSnapshot(snapshot, requestedIndex = null) {
  if (!snapshot) return;
  activeWeatherSnapshot = snapshot;
  const hours = snapshot.hours || mergeForecastHours(snapshot.weather, snapshot.marine, snapshot.date);
  if (!hours.length) return;
  const index = requestedIndex === null || requestedIndex === undefined ? chooseWeatherHour(hours, snapshot.date) : clamp(Number(requestedIndex), 0, hours.length - 1);
  activeWeatherHourIndex = index;
  const hour = hours[index];
  const condition = weatherCodeInfo(hour.weatherCode);
  const bft = beaufortFromKnots(hour.windSpeed);
  const current = currentKnots(hour);
  const tide = tideStateAt(hours, index);
  const events = tideExtrema(hours);
  const offline = snapshot.offline ? '<span class="weather-offline-badge">offline gespeichert</span>' : '';

  $('#weatherResults').hidden = false;
  $('#weatherHeadline').innerHTML = `${esc(snapshot.locationName)} · ${fmtDate(snapshot.date)}${offline}`;
  $('#weatherSubline').textContent = `Bezugszeit ${formatTime(hour.time)} Uhr · geladen ${snapshot.loadedAt ? new Date(snapshot.loadedAt).toLocaleString('de-DE') : '—'} · ${coordinateLabel(snapshot.latitude, snapshot.longitude)}`;
  $('#wxWind').textContent = valueText(hour.windSpeed, 'kn', 1);
  $('#wxWindDir').textContent = `${windDirectionText(hour.windDirection)} · ${hour.windDirection === null ? '—' : `${Math.round(hour.windDirection)}°`}`;
  $('#wxGust').textContent = valueText(hour.windGust, 'kn', 1);
  $('#wxBeaufort').textContent = `${bft} Bft mittlerer Wind`;
  $('#wxWave').textContent = valueText(hour.waveHeight, 'm', 1);
  $('#wxWaveDir').textContent = hour.waveHeight === null ? 'am Modellpunkt nicht verfügbar' : `${windDirectionText(hour.waveDirection)} · aus ${hour.waveDirection === null ? '—' : `${Math.round(hour.waveDirection)}°`}`;
  $('#wxPeriod').textContent = valueText(hour.wavePeriod, 's', 1);
  $('#wxFrequency').textContent = hour.wavePeriod ? `etwa ${(60 / hour.wavePeriod).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Wellen/min` : 'Wellenfolge nicht verfügbar';
  $('#wxSwell').textContent = valueText(hour.swellHeight, 'm', 1);
  $('#wxSwellDir').textContent = hour.swellHeight === null ? 'nicht getrennt verfügbar' : `${windDirectionText(hour.swellDirection)} · ${valueText(hour.swellPeriod, 's', 1)}`;
  $('#wxCurrent').textContent = current === null ? '—' : `${current.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kn`;
  $('#wxCurrentDir').textContent = current === null ? 'am Modellpunkt nicht verfügbar' : `setzt nach ${windDirectionText(hour.currentDirection)} · ${Math.round(hour.currentDirection)}°`;
  $('#wxTemperature').textContent = valueText(hour.temperature, '°C', 1);
  $('#wxCondition').textContent = `${condition[0]} ${condition[1]}${hour.precipitationProbability !== null ? ` · Regen ${Math.round(hour.precipitationProbability)} %` : ''}`;
  $('#wxTideState').textContent = tide.state;
  $('#wxNextTide').textContent = tide.next ? `${tide.next.type} ca. ${formatTime(tide.next.time)} Uhr` : 'kein weiterer Scheitel im Zeitraum';

  renderTideChart(hours, events);
  $('#tideEvents').innerHTML = events.length ? events.map(event => `<div class="tide-event"><span>${event.type === 'HW' ? '↑' : '↓'}</span><div><small>${event.type === 'HW' ? 'HOCHWASSER' : 'NIEDRIGWASSER'} · MODELL</small><strong>ca. ${formatTime(event.time)} Uhr · ${valueText(event.value, 'm', 2)}</strong></div></div>`).join('') : '<div class="muted">Für diesen Punkt wurden keine eindeutigen Scheitelpunkte im gewählten Tagesfenster erkannt.</div>';
  renderPegel(snapshot.pegel);

  $('#weatherHourly').innerHTML = hours.map((item, itemIndex) => {
    const info = weatherCodeInfo(item.weatherCode);
    const itemCurrent = currentKnots(item);
    return `<tr data-weather-index="${itemIndex}" class="${itemIndex === index ? 'active' : ''}"><td><strong>${formatTime(item.time)}</strong></td><td><div class="weather-condition-cell"><span>${info[0]}</span><div><strong>${valueText(item.temperature, '°C', 1)}</strong><small>${info[1]}</small></div></div></td><td><strong>${windDirectionText(item.windDirection)} ${valueText(item.windSpeed, 'kn', 1)}</strong><small>${beaufortFromKnots(item.windSpeed)} Bft</small></td><td>${valueText(item.windGust, 'kn', 1)}</td><td><strong>${valueText(item.waveHeight, 'm', 1)}</strong><small>${windDirectionText(item.waveDirection)}</small></td><td><strong>${valueText(item.wavePeriod, 's', 1)}</strong><small>${item.wavePeriod ? `${(60/item.wavePeriod).toFixed(1).replace('.',',')}/min` : '—'}</small></td><td><strong>${valueText(item.swellHeight, 'm', 1)}</strong><small>${windDirectionText(item.swellDirection)}</small></td><td><strong>${itemCurrent === null ? '—' : `${itemCurrent.toFixed(1).replace('.',',')} kn`}</strong><small>${itemCurrent === null ? '—' : `nach ${windDirectionText(item.currentDirection)}`}</small></td><td><strong>${valueText(item.seaLevel, 'm', 2)}</strong><small>${tideStateAt(hours, itemIndex).state}</small></td></tr>`;
  }).join('');
  setWeatherLocation({ name: snapshot.locationName, latitude: snapshot.latitude, longitude: snapshot.longitude, source: snapshot.source, routeId: snapshot.routeId, routeSide: snapshot.routeSide, zoom: 11 }, { pan: false });
}

function haversineKm(a, b) {
  const radius = 6371;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const value = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

function waterTimeseries(station) {
  return (station?.timeseries || []).find(series => series.shortname === 'W' || series.unit === 'cm' || /Wasserstand/i.test(series.longname || '')) || null;
}

async function loadPegelData(location) {
  try {
    const stationUrl = `https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json?latitude=${location.latitude}&longitude=${location.longitude}&radius=35&includeTimeseries=true&includeCurrentMeasurement=true`;
    const response = await fetch(stationUrl);
    if (!response.ok) return null;
    const stations = await response.json();
    const candidates = (stations || []).map(station => {
      const series = waterTimeseries(station);
      const measurement = series?.currentMeasurement || station.currentMeasurement || null;
      return { station, series, measurement, distanceKm: haversineKm(location, { latitude: num(station.latitude), longitude: num(station.longitude) }) };
    }).filter(item => item.measurement).sort((a, b) => a.distanceKm - b.distanceKm);
    const selected = candidates[0];
    if (!selected || selected.distanceKm > 35) return null;
    let trend = 'Trend nicht bestimmt';
    try {
      const historyResponse = await fetch(`https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/${selected.station.uuid}/W/measurements.json?start=P6H`);
      if (historyResponse.ok) {
        const history = await historyResponse.json();
        if (history.length >= 2) {
          const delta = num(history.at(-1).value) - num(history[Math.max(0, history.length - 3)].value);
          trend = delta > 2 ? 'Wasserstand steigt' : delta < -2 ? 'Wasserstand fällt' : 'Wasserstand nahezu gleichbleibend';
        }
      }
    } catch {}
    return {
      stationName: selected.station.longname || selected.station.shortname,
      stationUuid: selected.station.uuid,
      distanceKm: selected.distanceKm,
      trend,
      measurement: {
        value: selected.measurement.value,
        timestamp: selected.measurement.timestamp,
        unit: selected.series?.unit || 'cm'
      }
    };
  } catch {
    return null;
  }
}

function weatherSnapshotId(location, date) {
  return `forecast:${date}:${num(location.latitude).toFixed(4)}:${num(location.longitude).toFixed(4)}`;
}

function cachedWeatherSnapshot(location, date) {
  const exactId = weatherSnapshotId(location, date);
  return state.weather?.find(item => item.id === exactId) || [...(state.weather || [])].filter(item => item.date === date).sort((a, b) => haversineKm(location, a) - haversineKm(location, b))[0] || null;
}

async function fetchWeatherData(location, date) {
  const weatherVariables = 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
  const marineVariables = 'wave_height,wave_direction,wave_period,wind_wave_height,wind_wave_direction,wind_wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_level_height_msl,ocean_current_velocity,ocean_current_direction';
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&hourly=${weatherVariables}&timezone=${encodeURIComponent(WEATHER_TIMEZONE)}&wind_speed_unit=kn&start_date=${date}&end_date=${date}`;
  const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${location.latitude}&longitude=${location.longitude}&hourly=${marineVariables}&timezone=${encodeURIComponent(WEATHER_TIMEZONE)}&start_date=${date}&end_date=${date}&cell_selection=sea`;
  const [weatherResult, marineResult, pegel] = await Promise.allSettled([
    fetch(weatherUrl).then(response => { if (!response.ok) throw new Error('Wetterdaten konnten nicht geladen werden.'); return response.json(); }),
    fetch(marineUrl).then(response => { if (!response.ok) throw new Error('Seegangsdaten konnten nicht geladen werden.'); return response.json(); }),
    loadPegelData(location)
  ]);
  if (weatherResult.status === 'rejected' && marineResult.status === 'rejected') throw new Error('Wetter- und Seegangsdaten konnten nicht geladen werden. Bitte Internetverbindung und Datum prüfen.');
  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const marine = marineResult.status === 'fulfilled' ? marineResult.value : null;
  const snapshot = {
    id: weatherSnapshotId(location, date),
    locationName: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    source: location.source || 'fixed',
    routeId: location.routeId || '',
    routeSide: location.routeSide || '',
    date,
    loadedAt: new Date().toISOString(),
    weather,
    marine,
    pegel: pegel.status === 'fulfilled' ? pegel.value : null
  };
  snapshot.hours = mergeForecastHours(weather, marine, date);
  return snapshot;
}

async function loadWeatherForecast(options = {}) {
  prepareWeatherView();
  let location;
  try {
    location = await weatherLocationFromSelection();
    if (!location || location.unresolved || !Number.isFinite(num(location.latitude))) throw new Error('Bitte zuerst einen gültigen Ort oder Kartenpunkt auswählen.');
  } catch (error) {
    setWeatherMessage(error.message, 'error');
    return;
  }
  const date = $('#weatherDate').value;
  const today = dateInputValue();
  if (!date || date < today || date > addDays(today, WEATHER_MAX_FORECAST_DAYS)) {
    setWeatherMessage(`Bitte ein Datum zwischen heute und ${fmtDate(addDays(today, WEATHER_MAX_FORECAST_DAYS))} wählen.`, 'error');
    return;
  }
  setWeatherLocation(location);
  setWeatherMessage('Wetter, Seegang und Pegel werden geladen …');
  try {
    if (!navigator.onLine) throw new Error('offline');
    const snapshot = await fetchWeatherData(location, date);
    if (!snapshot.hours.length) throw new Error('Für den gewählten Punkt wurden keine stündlichen Daten geliefert.');
    await put('weather', snapshot);
    await refresh();
    activeWeatherSnapshot = snapshot;
    activeWeatherHourIndex = chooseWeatherHour(snapshot.hours, date);
    renderWeatherSnapshot(snapshot, activeWeatherHourIndex);
    setWeatherMessage('Aktuelle Vorhersage geladen und für die Offline-Nutzung gespeichert.', 'success');
  } catch (error) {
    const cached = cachedWeatherSnapshot(location, date);
    if (cached) {
      activeWeatherSnapshot = { ...cached, offline: true };
      renderWeatherSnapshot(activeWeatherSnapshot, chooseWeatherHour(activeWeatherSnapshot.hours || [], date));
      setWeatherMessage('Keine aktuelle Verbindung – zuletzt gespeicherte Vorhersage wird angezeigt.', 'success');
    } else {
      setWeatherMessage(error.message === 'offline' ? 'Keine Internetverbindung und noch keine gespeicherte Vorhersage für diesen Ort und Tag.' : error.message, 'error');
    }
  }
}

window.weatherForRoute = async id => {
  const route = state.route.find(item => item.id === id);
  if (!route) return;
  view('weather');
  window.setTimeout(async () => {
    renderWeatherLocationOptions();
    const select = $('#weatherLocation');
    select.value = `route:${id}:to`;
    $('#weatherDate').value = route.date && route.date >= dateInputValue() ? route.date : dateInputValue();
    await updateWeatherSelection();
    loadWeatherForecast();
  }, 120);
};

async function applyWeatherToRoute() {
  const route = state.route.find(item => item.id === activeWeatherRouteId);
  const snapshot = activeWeatherSnapshot;
  const hour = snapshot?.hours?.[activeWeatherHourIndex];
  if (!route || !hour) return toast('Keine Etappe zur Übernahme ausgewählt');
  const condition = weatherCodeInfo(hour.weatherCode)[1];
  const events = tideExtrema(snapshot.hours || []);
  const tideText = events.map(event => `${event.type} ca. ${formatTime(event.time)}`).join(' · ');
  await put('route', {
    ...route,
    weather: `${condition}${hour.temperature !== null ? `, ${round(hour.temperature, 1).toLocaleString('de-DE')} °C` : ''}`,
    wind: `${windDirectionText(hour.windDirection)} ${round(hour.windSpeed, 1).toLocaleString('de-DE')} kn (${beaufortFromKnots(hour.windSpeed)} Bft)${hour.windGust !== null ? ` · Böen ${round(hour.windGust, 1).toLocaleString('de-DE')} kn` : ''}`,
    wave: hour.waveHeight === null ? route.wave : `${round(hour.waveHeight, 1).toLocaleString('de-DE')} m aus ${windDirectionText(hour.waveDirection)} · ${round(hour.wavePeriod, 1).toLocaleString('de-DE')} s`,
    tide: tideText || route.tide
  });
  await refresh();
  toast('Wetter und Tide in die Etappe übernommen');
}

function buildReport() {
  const settings = getSettings();
  const days = [...state.days].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const photos = [...state.photos];
  const totalNm = days.reduce((sum, item) => sum + num(item.distance), 0);
  const hours = days.reduce((sum, item) => sum + Math.max(0, num(item.engineEnd) - num(item.engineStart)), 0);
  const cover = settings.boatPhoto || defaultHero;

  $('#reportContent').innerHTML = `
    <div class="report-cover"><img src="${cover}" alt="${esc(settings.boatName)}"><div><h1>${esc(settings.tripTitle || 'Reisebericht')}</h1><p>${esc(settings.boatName)} · ${esc(settings.boatType)} · ${fmtDate(settings.tripStart)} bis ${fmtDate(settings.tripEnd)}</p></div></div>
    <p><b>${days.length} Reisetage · ${dec(totalNm)} sm · ${dec(hours)} Motorstunden</b></p>
    <p class="meta">${esc(settings.boatName)} · Baujahr ${esc(settings.buildYear)} · ${dec2(settings.length)} × ${dec2(settings.beam)} m · ${esc(settings.engine)} · Heimathafen ${esc(settings.homePort)}</p>
    ${state.route.length ? `<section class="report-plan"><h2>Törnplan</h2>${[...state.route].sort((a,b) => String(a.date).localeCompare(String(b.date))).map((stage,index) => `<div><b>${index + 1}. ${fmtDate(stage.date)} · ${esc(stage.from || '—')} → ${esc(stage.to || '—')}</b><span>${dec(stage.nm)} sm${stage.departTime ? ` · Ablegen ${esc(stage.departTime)} Uhr` : ''}${stage.wind ? ` · ${esc(stage.wind)}` : ''}${stage.wave ? ` · Welle ${esc(stage.wave)}` : ''}${stage.tide ? ` · ${esc(stage.tide)}` : ''}</span></div>`).join('')}</section>` : ''}
    ${days.map(day => {
      const dayPhotos = photos.filter(photo => photo.date === day.date);
      return `<section class="report-day"><h2>${fmtDate(day.date)} · ${esc(day.title || `${day.fromPort || ''} → ${day.toPort || ''}`)}</h2><p class="meta">${esc(day.fromPort || '')} → ${esc(day.toPort || '')} · ${dec(day.distance)} sm · ${esc(day.wind || '')} · ${esc(day.wave || '')}</p><p>${esc(day.summary || '').replace(/\n/g, '<br>')}</p>${day.moment ? `<blockquote>„${esc(day.moment)}“</blockquote>` : ''}${dayPhotos.map(photo => `<figure><img class="report-photo" src="${photo.data}" alt="${esc(photo.caption || '')}"><figcaption>${esc(photo.caption || '')}</figcaption></figure>`).join('')}</section>`;
    }).join('') || '<p>Noch keine Tagesberichte vorhanden.</p>'}`;
}


$('#weatherForm').onsubmit = event => { event.preventDefault(); loadWeatherForecast(); };
$('#weatherLocation').onchange = () => updateWeatherSelection();
$('#weatherMapPickButton').onclick = () => {
  view('weather');
  prepareWeatherView();
  $('#weatherLocation').value = 'map:custom';
  weatherMapPickMode = true;
  $('#weatherMapPickButton').textContent = 'Jetzt in die Karte tippen …';
  setWeatherMessage('Tippe oder klicke jetzt auf den gewünschten Punkt in der Seekarte.');
  $('#weatherMap').scrollIntoView({ behavior: 'smooth', block: 'center' });
};
$('#weatherReloadButton').onclick = () => loadWeatherForecast({ force: true });
$('#weatherApplyRouteButton').onclick = applyWeatherToRoute;
$('#weatherHourly').onclick = event => {
  const row = event.target.closest('[data-weather-index]');
  if (!row || !activeWeatherSnapshot) return;
  renderWeatherSnapshot(activeWeatherSnapshot, Number(row.dataset.weatherIndex));
};

$('#buildReport').onclick = buildReport;
$('#printReport').onclick = () => { buildReport(); window.print(); };

$('#export').onclick = async () => {
  const backup = { app: 'LEEFKE Bordbuch', version: APP_VERSION, exported: new Date().toISOString() };
  for (const store of stores) backup[store] = await all(store);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  link.download = `LEEFKE_Sicherung_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
};

$('#import').onchange = async event => {
  const file = event.target.files[0];
  if (!file || !confirm('Vorhandene Daten auf diesem Gerät ersetzen?')) return;
  try {
    const backup = JSON.parse(await file.text());
    for (const store of stores) {
      await clear(store);
      for (const item of backup[store] || []) await put(store, item);
    }
    await defaults();
    await refresh();
    toast('Sicherung geladen');
  } catch (error) {
    alert('Die Sicherungsdatei ist ungültig.');
  }
};

initRatingPickers();
$('#portForm').addEventListener('reset', () => window.setTimeout(() => syncRatingPickers($('#portForm')), 0));

$('#menu').onclick = () => $('#nav').classList.toggle('open');
$$('nav button').forEach(button => button.onclick = () => view(button.dataset.view));
$$('[data-open]').forEach(button => button.onclick = () => view(button.dataset.open));

$('#authForm').onsubmit = async event => {
  event.preventDefault();
  if (!supabaseClient) return setMessage('#authMessage', 'Cloud-Verbindung ist nicht verfügbar.', 'error');
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  setMessage('#authMessage', 'Anmeldung läuft …');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return setMessage('#authMessage', readableAuthError(error), 'error');
  currentSession = data.session;
  setMessage('#authMessage', 'Anmeldung erfolgreich.', 'success');
  await updateSyncUI();
};

$('#signUpButton').onclick = async () => {
  if (!supabaseClient) return setMessage('#authMessage', 'Cloud-Verbindung ist nicht verfügbar.', 'error');
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  if (!email || password.length < 8) return setMessage('#authMessage', 'Bitte E-Mail-Adresse und ein Passwort mit mindestens 8 Zeichen eingeben.', 'error');
  setMessage('#authMessage', 'Konto wird angelegt …');
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: appBaseUrl() }
  });
  if (error) return setMessage('#authMessage', readableAuthError(error), 'error');
  if (data.session) {
    currentSession = data.session;
    setMessage('#authMessage', 'Konto wurde angelegt und ist angemeldet.', 'success');
    await updateSyncUI();
  } else {
    setMessage('#authMessage', 'Konto angelegt. Bitte jetzt die Bestätigungs-E-Mail öffnen und danach zur LEEFKE-App zurückkehren.', 'success');
  }
};

$('#resetPasswordButton').onclick = async () => {
  if (!supabaseClient) return;
  const email = $('#authEmail').value.trim();
  if (!email) return setMessage('#authMessage', 'Bitte zuerst die E-Mail-Adresse eingeben.', 'error');
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: appBaseUrl() });
  if (error) return setMessage('#authMessage', readableAuthError(error), 'error');
  setMessage('#authMessage', 'E-Mail zum Zurücksetzen des Passworts wurde angefordert.', 'success');
};

$('#signOutButton').onclick = async () => {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  currentSession = null;
  stopAutoSync();
  setMessage('#syncMessage', 'Abgemeldet. Die lokalen Daten bleiben auf diesem Gerät erhalten.');
  await updateSyncUI();
};

$('#syncNowButton').onclick = async () => {
  if (currentSession && !await isLinkedForCurrentUser()) return connectDeviceAutomatically();
  return syncNow();
};
$('#connectDeviceButton').onclick = () => connectDeviceAutomatically();

async function onlineState() {
  await updateSyncUI();
  if (navigator.onLine && currentSession) {
    if (await isLinkedForCurrentUser()) await syncNow({ silent: true, reason: 'online' });
    else await connectDeviceAutomatically({ silent: true });
    startAutoSync();
  } else if (!navigator.onLine) {
    stopAutoSync();
  }
}
window.addEventListener('online', onlineState);
window.addEventListener('offline', onlineState);
window.addEventListener('focus', syncOnForeground);
window.addEventListener('pageshow', syncOnForeground);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncOnForeground();
  else stopAutoSync();
});

(async () => {
  db = await openDB();
  await migrateLocalTimestamps();
  await initializeSupabase();
  if (currentSession && navigator.onLine) {
    if (await isLinkedForCurrentUser()) await syncNow({ silent: true, reason: 'startup' });
    else await connectDeviceAutomatically({ silent: true });
  }
  await defaults();
  await refresh();
  await onlineState();
  startAutoSync();
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('service-worker.js');
      registration.update();
    } catch (error) {
      console.warn('Service Worker konnte nicht registriert werden.', error);
    }
  }
})();
