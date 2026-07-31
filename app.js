const APP_VERSION = '7.4';
if (/Android/i.test(navigator.userAgent || '')) document.documentElement.classList.add('android-device');
const AUTO_SYNC_INTERVAL_MS = 60000;
const GUEST_MODE_KEY = 'leefke-guest-mode';
const HOLIDAY_MODE_KEY = 'leefke-holiday-mode';
const MODE_QUERY = new URLSearchParams(window.location.search).get('guest');
if (MODE_QUERY === '1') localStorage.setItem(GUEST_MODE_KEY, '1');
if (MODE_QUERY === '0') localStorage.removeItem(GUEST_MODE_KEY);
const IS_GUEST_MODE = localStorage.getItem(GUEST_MODE_KEY) === '1';
const DB_NAME = IS_GUEST_MODE ? 'leefke-v2-guest' : 'leefke-v2';
const DB_VERSION = 7;
const stores = ['days', 'fuel', 'maintenance', 'photos', 'checklists', 'route', 'ports', 'settings', 'trips', 'gpx', 'weather', 'inventory', 'safety', 'documents', 'changeLog', 'conflicts', 'devices', 'routeWeather', 'autoBackups'];
const syncableStores = ['days', 'fuel', 'maintenance', 'photos', 'checklists', 'route', 'ports', 'settings', 'trips', 'gpx', 'weather', 'inventory', 'safety', 'documents', 'changeLog', 'conflicts', 'devices', 'routeWeather'];
const TRIP_SCOPED_STORES = new Set(['days', 'fuel', 'photos', 'route', 'ports', 'gpx', 'weather', 'routeWeather']);
const INITIAL_TRIP_ID = 'trip-daenische-suedsee-2026';
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
  cruiseSpeed: '6,5 kn',
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
  boatPhoto: '',
  boatPhotoStoragePath: '',
  photoAutoSync: true,
  preferredCruiseSpeed: 6.5
};


const WEATHER_LOCATIONS = {
  lemwerder: { key: 'lemwerder', name: 'Lemwerder', latitude: 53.1668, longitude: 8.6158, zoom: 12, note: 'Unterweser: Wellenwerte sind hier nur eine grobe Modellorientierung.' },
  bremerhaven: { key: 'bremerhaven', name: 'Bremerhaven', latitude: 53.5505, longitude: 8.5795, zoom: 11 },
  cuxhaven: { key: 'cuxhaven', name: 'Cuxhaven', latitude: 53.8688, longitude: 8.7064, zoom: 11 },
  helgoland: { key: 'helgoland', name: 'Helgoland', latitude: 54.1825, longitude: 7.8854, zoom: 11 }
};

const REPORT_PLACE_COORDS = {
  lemwerder: [53.1668, 8.6158],
  bremerhaven: [53.5505, 8.5795],
  cuxhaven: [53.8688, 8.7064],
  helgoland: [54.1825, 7.8854],
  brunsbuttel: [53.8954, 9.1386],
  rendsburg: [54.3066, 9.6631],
  kiel: [54.3233, 10.1228],
  kielholtenau: [54.3728, 10.1467],
  laboe: [54.4046, 10.2236],
  marstal: [54.8566, 10.5170],
  aeroskobing: [54.8887, 10.4112],
  aeroeskobing: [54.8887, 10.4112],
  lyo: [55.0373, 10.1636],
  faaborg: [55.0951, 10.2423],
  svendborg: [55.0598, 10.6073],
  bagenkop: [54.7534, 10.6733],
  gluckstadt: [53.7882, 9.4238],
  glueckstadt: [53.7882, 9.4238],
  wangerooge: [53.7900, 7.9000],
  wilhelmshaven: [53.5136, 8.1460],
  norderney: [53.7067, 7.1519],
  langeoog: [53.7465, 7.4826],
  busum: [54.1270, 8.8580]
};

const WEATHER_TIMEZONE = 'Europe/Berlin';
const WEATHER_MAX_FORECAST_DAYS = 7;

let db;
let state = {};
let allState = {};
let activeTripId = '';
let editingDayId = '';
let dayViewRecordId = '';
let nauticalMap = null;
let nauticalBaseLayer = null;
let seamarkLayer = null;
let portLayer = null;
let activeGpxLayer = null;
let activeRouteBounds = null;
let selectedGpxId = '';
let reportRouteMap = null;
let reportMapReadyPromise = Promise.resolve();
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
let syncVisualInProgress = false;
let syncUiRenderToken = 0;
let syncUiTimer = null;

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
  if (TRIP_SCOPED_STORES.has(store) && !saved.tripId && activeTripId && !options.remote) {
    saved.tripId = activeTripId;
  }
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


const NUMERIC_SETTINGS_FIELDS = new Set([
  'buildYear', 'length', 'beam', 'draft', 'navigationDraft', 'airDraft', 'displacement',
  'enginePower', 'engineYear', 'tankCapacity', 'currentTankPercent', 'currentEngineHours',
  'preferredCruiseSpeed'
]);

function normalizeSettingsFormValues(values) {
  const normalized = { ...(values || {}) };
  for (const field of NUMERIC_SETTINGS_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(normalized, field)) continue;
    const raw = String(normalized[field] ?? '').trim();
    normalized[field] = raw === '' ? '' : Number(raw.replace(',', '.'));
  }
  return normalized;
}

function settingsFieldCloudRowsV610(settings, userId) {
  const normalized = normalizeRecord('settings', settings, settings?._updatedAt, settings?._updatedBy || 'legacy');
  const rows = [];
  for (const field of recordFieldNames('settings', normalized)) {
    if (field === 'boatPhoto') continue;
    rows.push({
      user_id: userId,
      record_type: SETTINGS_FIELD_RECORD_TYPE,
      record_id: field,
      payload: {
        value: normalized[field],
        deviceId: fieldDevice(normalized, field, normalized._updatedBy || 'legacy'),
        deviceLabel: normalized._updatedByLabel || ''
      },
      updated_at: fieldTime(normalized, field, normalized._updatedAt),
      deleted_at: null
    });
  }
  return rows;
}

async function repairLeefkeSettingsV610() {
  if (await metaGet('settingsRepairV610')) return;
  const existingRaw = await getOne('settings', 'main');
  if (!existingRaw) {
    await metaSet('settingsRepairV610', { completedAt: new Date().toISOString() });
    return;
  }
  const device = await getDeviceIdentity();
  const now = new Date().toISOString();
  const settings = normalizeRecord('settings', existingRaw, existingRaw._updatedAt, existingRaw._updatedBy || device.id);
  settings._fieldUpdatedAt = { ...(settings._fieldUpdatedAt || {}) };
  settings._fieldUpdatedBy = { ...(settings._fieldUpdatedBy || {}) };

  settings.length = 11.5;
  settings.cruiseSpeed = (!settings.cruiseSpeed || /6\s*[–-]\s*8\s*kn/i.test(String(settings.cruiseSpeed))) ? '6,5 kn' : settings.cruiseSpeed;
  if (!Number.isFinite(Number(settings.preferredCruiseSpeed)) || [7.4, 7.5].includes(Number(settings.preferredCruiseSpeed))) {
    settings.preferredCruiseSpeed = 6.5;
  }

  for (const field of ['length', 'cruiseSpeed', 'preferredCruiseSpeed']) {
    settings._fieldUpdatedAt[field] = now;
    settings._fieldUpdatedBy[field] = device.id;
  }
  settings._updatedAt = now;
  settings._updatedBy = device.id;
  settings._updatedByLabel = device.label;
  await rawPut('settings', settings);
  await setDirty(true);
  await metaSet('settingsRepairV610', { completedAt: now, deviceId: device.id });
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

function stableComparableValue(value) {
  if (Array.isArray(value)) return value.map(stableComparableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableComparableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function comparablePayload(store, payload) {
  const cleaned = cleanPayload(store, payload || {});
  delete cleaned._updatedAt;
  delete cleaned._updatedByLabel;
  delete cleaned._cloudState;
  return JSON.stringify(stableComparableValue(cleaned));
}

function visibleComparablePayload(store, payload) {
  const cleaned = cleanPayload(store, payload || {});
  for (const key of Object.keys(cleaned)) {
    if (key.startsWith('_')) delete cleaned[key];
  }
  return JSON.stringify(stableComparableValue(cleaned));
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

const STANDARD_CHECKLIST_GROUPS = {
  'Vor dem Ablegen': [
    { id: 'check-depart-weather', item: 'Wetter, Sicht und amtliche Warnungen geprüft' },
    { id: 'check-depart-tide', item: 'Tiden, Strömung und Wasserstände geprüft' },
    { id: 'check-depart-route', item: 'Route, Verkehrslage und Ausweichhäfen geprüft' },
    { id: 'check-depart-engine', item: 'Motorraum geprüft: Öl, Kühlwasser, Keilriemen, Filter und Leckagen' },
    { id: 'check-depart-bilge', item: 'Bilge und Bilgenpumpen geprüft' },
    { id: 'check-depart-fuel', item: 'Tankstand und Kraftstoffversorgung geprüft' },
    { id: 'check-depart-steering', item: 'Steuerung, Hydraulik und Bugstrahlruder geprüft' },
    { id: 'check-depart-navigation', item: 'Plotter, AIS, Radar, UKW und Navigationslichter geprüft' },
    { id: 'check-depart-safety', item: 'Rettungsmittel griffbereit und Crew eingewiesen' },
    { id: 'check-depart-deck', item: 'Landstrom getrennt; Leinen, Fender und Anker klar' }
  ],
  'Nach dem Anlegen': [
    { id: 'check-arrive-mooring', item: 'Leinen, Fender und Gangway kontrolliert' },
    { id: 'check-arrive-engine', item: 'Motorraum, Bilge und Leckagen kontrolliert' },
    { id: 'check-arrive-shore', item: 'Landstrom und Wasser sicher angeschlossen' },
    { id: 'check-arrive-log', item: 'Motorstunden, Strecke und Tankstand ins Logbuch übernommen' },
    { id: 'check-arrive-plan', item: 'Wetter, Tiden und Route für den nächsten Fahrtag geprüft' },
    { id: 'check-arrive-secure', item: 'Navigation und Elektrik auf Hafenbetrieb gestellt; Boot gesichert' }
  ],
  'Regelmäßige Sicherheitskontrolle': [
    { id: 'check-safety-rescue', item: 'Rettungswesten, Rettungsring und Rettungsinsel geprüft' },
    { id: 'check-safety-fire', item: 'Feuerlöscher, Löschdecke und Rauch-/CO-Melder geprüft' },
    { id: 'check-safety-firstaid', item: 'Erste-Hilfe-Ausrüstung und Medikamente geprüft' },
    { id: 'check-safety-distress', item: 'Seenotsignalmittel und Notbeleuchtung geprüft' },
    { id: 'check-safety-radio', item: 'UKW-Handfunkgerät, Ersatzakkus und Notrufdaten geprüft' },
    { id: 'check-safety-backup', item: 'Papierkarten, Kompass und Navigations-Backups vollständig' },
    { id: 'check-safety-anchor', item: 'Anker, Kette und Ankerwinde geprüft' }
  ]
};

const STANDARD_CHECKLIST_ITEMS = Object.entries(STANDARD_CHECKLIST_GROUPS)
  .flatMap(([group, items]) => items.map(item => ({ ...item, group })));

const FACTORY_CHECK_SIGNATURES = new Set(
  STANDARD_CHECKLIST_ITEMS.map(item => `${item.group}|${item.item}`)
);

function normalizedChecklistText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/[.;:]+$/g, '')
    .replace(/\s+/g, ' ');
}

function normalizedChecklistKey(group, item) {
  return `${normalizedChecklistText(group)}|${normalizedChecklistText(item)}`;
}

const STANDARD_CHECKLIST_BY_KEY = new Map(
  STANDARD_CHECKLIST_ITEMS.map(item => [normalizedChecklistKey(item.group, item.item), item])
);

const LEGACY_CHECKLIST_TARGETS = new Map();
function registerLegacyChecklist(group, item, targetId) {
  LEGACY_CHECKLIST_TARGETS.set(normalizedChecklistKey(group, item), targetId);
}

[
  ['Vor dem Ablegen', 'Wetter, Wind, Wellen und Sicht geprüft', 'check-depart-weather'],
  ['Vor dem Ablegen', 'Wetter und Sicht geprüft', 'check-depart-weather'],
  ['Vor dem Ablegen', 'Tiden und Strömung geprüft', 'check-depart-tide'],
  ['Vor dem Ablegen', 'Motorraum und drei Dieselfilter kontrolliert', 'check-depart-engine'],
  ['Vor dem Ablegen', 'Motorraum und Dieselfilter kontrolliert', 'check-depart-engine'],
  ['Vor dem Ablegen', 'Motoröl, Kühlwasser und Keilriemen geprüft', 'check-depart-engine'],
  ['Vor dem Ablegen', 'Bilge und Bilgenpumpen kontrolliert', 'check-depart-bilge'],
  ['Vor dem Ablegen', 'Hydraulik und Bugstrahlruder geprüft', 'check-depart-steering'],
  ['Vor dem Ablegen', 'Navigation, AIS, Radar und UKW eingeschaltet', 'check-depart-navigation'],
  ['Vor dem Ablegen', 'Leinen, Fender und Anker klar', 'check-depart-deck'],
  ['Nach dem Anlegen', 'Motorstunden und Tankstand notiert', 'check-arrive-log'],
  ['Nach dem Anlegen', 'Logbucheintrag ergänzt', 'check-arrive-log'],
  ['Nach dem Anlegen', 'Landstrom angeschlossen und geprüft', 'check-arrive-shore'],
  ['Nach dem Anlegen', 'Leinen und Fender kontrolliert', 'check-arrive-mooring'],
  ['Nach dem Anlegen', 'Motorraum auf Leckagen geprüft', 'check-arrive-engine'],
  ['Nach dem Anlegen', 'Wetter und Tiden für morgen geprüft', 'check-arrive-plan'],
  ['Sicherheit', 'UKW-Funk betriebsbereit', 'check-depart-navigation'],
  ['Sicherheit', 'AIS-Transponder und Radar betriebsbereit', 'check-depart-navigation'],
  ['Sicherheit', 'Papierkarten und Kompass an Bord', 'check-safety-backup'],
  ['Sicherheit', 'Rettungsinsel und Rettungsmittel kontrolliert', 'check-safety-rescue'],
  ['Sicherheit', 'Rettungsmittel kontrolliert', 'check-safety-rescue'],
  ['Sicherheit', 'Ankerwinde und Kette einsatzbereit', 'check-safety-anchor']
].forEach(args => registerLegacyChecklist(...args));

const STANDARD_CHECKLIST_BY_ID = new Map(STANDARD_CHECKLIST_ITEMS.map(item => [item.id, item]));

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
  if (IS_GUEST_MODE) {
    supabaseClient = null;
    currentSession = null;
    realtimeState = 'Gastmodus';
    await updateSyncUI();
    return;
  }
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
        startRealtimeSubscription();
        if (await isLinkedForCurrentUser()) {
          registerDeviceHeartbeat().catch(error => console.warn('Gerätestatus konnte nicht übertragen werden.', error));
          if (navigator.onLine) scheduleSync(250);
          startAutoSync(1200);
        } else if (navigator.onLine) {
          await connectDeviceAutomatically({ silent: true });
          registerDeviceHeartbeat().catch(error => console.warn('Gerätestatus konnte nicht übertragen werden.', error));
        }
      } else {
        stopRealtimeSubscription();
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

function scheduleSync(delay = 1400, options = {}) {
  window.clearTimeout(syncTimer);
  const syncOptions = { silent: true, reason: 'scheduled', ...options };
  syncTimer = window.setTimeout(async () => {
    if (currentSession && navigator.onLine && await isLinkedForCurrentUser()) await syncNow(syncOptions);
    else await updateSyncUI();
  }, delay);
}

function queueSyncUIUpdate(delay = 60) {
  window.clearTimeout(syncUiTimer);
  syncUiTimer = window.setTimeout(() => {
    updateSyncUI().catch(error => console.warn('Synchronisierungsanzeige konnte nicht aktualisiert werden.', error));
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

function restoreDocumentScrolling() {
  document.body.classList.remove('mobile-menu-open');
  document.documentElement.classList.remove('mobile-menu-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('touch-action');
  document.documentElement.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('touch-action');
}

function closeMobileMenu() {
  const sideNav = $('#nav');
  const backdrop = $('#navBackdrop');
  sideNav?.classList.remove('open');
  restoreDocumentScrolling();
  if (backdrop) backdrop.hidden = true;
  $('#menu')?.setAttribute('aria-expanded', 'false');
  $('#mobileMoreButton')?.setAttribute('aria-expanded', 'false');
}

function setMobileMenu(open) {
  const sideNav = $('#nav');
  const backdrop = $('#navBackdrop');
  if (!sideNav) return;
  const shouldOpen = Boolean(open && window.innerWidth <= 850);
  sideNav.classList.toggle('open', shouldOpen);
  document.body.classList.toggle('mobile-menu-open', shouldOpen);
  if (!shouldOpen) restoreDocumentScrolling();
  if (backdrop) backdrop.hidden = !shouldOpen;
  $('#menu')?.setAttribute('aria-expanded', String(shouldOpen));
  $('#mobileMoreButton')?.setAttribute('aria-expanded', String(shouldOpen));
}


function holidayModeEnabled() {
  return localStorage.getItem(HOLIDAY_MODE_KEY) !== '0';
}

function applyHolidayMode(enabled = holidayModeEnabled()) {
  const active = Boolean(enabled);
  const changed = document.body.classList.contains('holiday-mode') !== active;
  localStorage.setItem(HOLIDAY_MODE_KEY, active ? '1' : '0');
  document.body.classList.toggle('holiday-mode', active);
  const toggle = $('#holidayModeToggle');
  if (toggle && toggle.checked !== active) toggle.checked = active;
  const label = $('#holidayModeText');
  if (label) label.textContent = active ? 'Aktiv' : 'Aus';
  const group = $('#navMoreGroup');
  if (group && changed) group.open = !active;
}

function updateConnectionBanner() {
  const banner = $('#connectionBanner');
  if (!banner) return;
  banner.hidden = navigator.onLine;
}

async function updateVacationUi(context = {}) {
  const lastSync = context.lastSync || await metaGet('lastSync');
  const lastVacationBackup = await metaGet('lastVacationBackup');
  const autoBackups = (state.autoBackups || []).slice().sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const latestBackupAt = lastVacationBackup?.at || autoBackups[0]?.createdAt || '';
  const dirty = context.dirty ?? Boolean((await metaGet('dirty'))?.value);
  const loggedIn = context.loggedIn ?? Boolean(currentSession?.user);
  let syncText = 'Nur lokal gespeichert';
  if (IS_GUEST_MODE) syncText = 'Gastmodus · nur auf diesem Gerät';
  else if (!navigator.onLine) syncText = dirty ? 'Offline · Änderungen warten' : 'Offline · lokaler Stand verfügbar';
  else if (loggedIn && dirty) syncText = 'Änderungen werden abgeglichen';
  else if (loggedIn && lastSync?.at) syncText = `Synchronisiert · ${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(lastSync.at))}`;
  else if (loggedIn) syncText = 'Cloud verbunden';
  const syncElement = $('#holidaySyncText');
  if (syncElement && syncElement.textContent !== syncText) syncElement.textContent = syncText;
  const backupText = latestBackupAt
    ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(latestBackupAt))
    : 'Noch kein Export';
  for (const selector of ['#holidayBackupText', '#backupPageStatus']) {
    const element = $(selector);
    if (element) element.textContent = selector === '#backupPageStatus' && latestBackupAt ? `Letzte Sicherung: ${backupText}` : backupText;
  }
  applyHolidayMode();
}

const MOBILE_SAVE_TARGETS = {
  day: ['dayForm', 'Tagestour speichern'],
  route: ['routeForm', 'Etappe speichern'],
  ports: ['portForm', 'Hafen speichern'],
  fuel: ['fuelForm', 'Tankvorgang speichern'],
  maintenance: ['maintenanceForm', 'Wartung speichern'],
  photos: ['photoForm', 'Foto hinzufügen'],
  settings: ['settingsForm', 'Schiffsdaten speichern']
};

function updateMobileChrome(id) {
  const directViews = new Set(['home', 'day', 'route', 'weather']);
  $$('[data-mobile-view]').forEach(button => {
    const active = button.dataset.mobileView === id;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const more = $('#mobileMoreButton');
  more?.classList.toggle('active', !directViews.has(id));
  if (!directViews.has(id)) more?.setAttribute('aria-current', 'page');
  else more?.removeAttribute('aria-current');

  const dock = $('#mobileActionDock');
  const saveButton = $('#mobileSaveButton');
  const target = MOBILE_SAVE_TARGETS[id];
  if (!dock || !saveButton) return;
  if (!target) {
    dock.hidden = true;
    saveButton.dataset.form = '';
    return;
  }
  const [formId, label] = target;
  saveButton.dataset.form = formId;
  const text = saveButton.querySelector('strong');
  if (text) text.textContent = label;
  dock.hidden = false;
}

function view(id) {
  $$('.view').forEach(section => section.classList.toggle('active', section.id === id));
  $$('nav button').forEach(button => button.classList.toggle('active', button.dataset.view === id));
  closeMobileMenu();
  updateMobileChrome(id);
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
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

function prepareDayForm() {
  const form = $('#dayForm');
  if (!form) return;
  if (editingDayId && !form.elements.id.value) form.elements.id.value = editingDayId;
  const editing = Boolean(editingDayId || form.elements.id.value);
  if (!editing && !form.elements.date.value) form.elements.date.value = new Date().toISOString().slice(0, 10);
  if (!editing && !form.elements.dayNo.value) {
    const highestDay = Math.max(0, ...(state.days || []).map(item => num(item.dayNo)));
    form.elements.dayNo.value = highestDay + 1;
  }
  const settings = getSettings();
  if (!editing && !form.elements.crew.value) form.elements.crew.value = getActiveTrip()?.crew || settings.defaultCrew || '';
  updateDayFormMode();
}


function tripDateLabel(trip) {
  if (!trip) return '';
  return [fmtDate(trip.startDate), fmtDate(trip.endDate)].filter(Boolean).join(' – ');
}

function tripStatusLabel(status) {
  if (status === 'completed') return 'abgeschlossen';
  if (status === 'planned') return 'geplant';
  return 'aktiv';
}

function getActiveTrip() {
  return state.trips?.find(item => item.id === activeTripId) || allState.trips?.find(item => item.id === activeTripId) || null;
}

async function ensureTripsAndMigrate() {
  const settingsRows = await all('settings');
  const base = { ...DEFAULT_SETTINGS, ...(settingsRows.find(item => item.id === 'main') || settingsRows[0] || {}) };
  let trips = await all('trips');
  if (!trips.length) {
    const now = new Date().toISOString();
    await put('trips', {
      id: INITIAL_TRIP_ID,
      title: base.tripTitle || 'Dänische Südsee 2026',
      startDate: base.tripStart || '2026-08-01',
      endDate: base.tripEnd || '2026-08-16',
      crew: base.defaultCrew || '',
      status: 'active',
      notes: 'Aus dem bisherigen aktuellen Törn übernommen.',
      createdAt: now
    });
    trips = await all('trips');
  }

  const activeMeta = await metaGet('activeTrip');
  const preferred = activeMeta?.tripId;
  const selected = trips.find(item => item.id === preferred)
    || trips.find(item => item.status === 'active')
    || [...trips].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))[0];
  activeTripId = selected?.id || INITIAL_TRIP_ID;
  await metaSet('activeTrip', { tripId: activeTripId, changedAt: new Date().toISOString() });

  // Alle Daten aus älteren Versionen gehören zum bisherigen Törn.
  for (const store of TRIP_SCOPED_STORES) {
    const rows = await all(store);
    for (const row of rows) {
      if (!row.tripId) await put(store, { ...row, tripId: activeTripId });
    }
  }
}

async function setActiveTrip(id, options = {}) {
  const trips = await all('trips');
  const trip = trips.find(item => item.id === id);
  if (!trip) return;
  activeTripId = trip.id;
  selectedGpxId = '';
  activeWeatherSnapshot = null;
  activeWeatherRouteId = '';
  await metaSet('activeTrip', { tripId: activeTripId, changedAt: new Date().toISOString() });
  await refresh();
  if (!options.silent) toast(`Törn geöffnet: ${trip.title}`);
}
window.setActiveTrip = setActiveTrip;

function renderTripManager() {
  const trips = [...(state.trips || [])].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')) || String(a.title || '').localeCompare(String(b.title || ''), 'de'));
  const current = getActiveTrip();
  const select = $('#globalTripSelect');
  if (select) {
    select.innerHTML = trips.map(trip => `<option value="${esc(trip.id)}">${esc(trip.title || 'Unbenannter Törn')}</option>`).join('');
    select.value = activeTripId;
    select.title = current ? `Aktueller Törn: ${current.title}` : 'Törn auswählen';
  }
  const title = $('#tripManagerTitle');
  const meta = $('#tripManagerMeta');
  if (title) title.textContent = current?.title || 'Noch kein Törn ausgewählt';
  if (meta) meta.textContent = current ? `${tripDateLabel(current) || 'Zeitraum noch offen'} · ${tripStatusLabel(current.status)}${current.crew ? ` · Crew: ${current.crew}` : ''}` : '';
  const list = $('#tripList');
  if (list) list.innerHTML = trips.map(trip => {
    const active = trip.id === activeTripId;
    return `<article class="trip-card ${active ? 'active' : ''}">
      <div><small>${tripStatusLabel(trip.status).toUpperCase()}</small><h4>${esc(trip.title || 'Unbenannter Törn')}</h4><p>${tripDateLabel(trip) || 'Zeitraum noch offen'}${trip.crew ? ` · ${esc(trip.crew)}` : ''}</p></div>
      <div class="actions"><button type="button" class="${active ? 'primary' : ''}" onclick="setActiveTrip('${trip.id}')">${active ? 'Geöffnet' : 'Öffnen'}</button><button type="button" onclick="openTripDialog('edit','${trip.id}')">Bearbeiten</button></div>
    </article>`;
  }).join('') || '<div class="muted">Noch kein Törn angelegt.</div>';
}

function openTripDialog(mode = 'new', id = '') {
  const dialog = $('#tripDialog');
  const form = $('#tripForm');
  if (!dialog || !form) return;
  form.reset();
  form.elements.id.value = '';
  if (mode === 'edit') {
    const trip = (state.trips || []).find(item => item.id === id) || getActiveTrip();
    if (!trip) return;
    for (const [key, value] of Object.entries(trip)) if (form.elements[key]) form.elements[key].value = value ?? '';
    $('#tripDialogTitle').textContent = 'Törn bearbeiten';
    $('#tripSubmitButton').textContent = 'Änderungen speichern';
  } else {
    form.elements.startDate.value = dateInputValue();
    form.elements.status.value = 'planned';
    form.elements.crew.value = getActiveTrip()?.crew || getSettings().defaultCrew || '';
    $('#tripDialogTitle').textContent = 'Neuen Törn anlegen';
    $('#tripSubmitButton').textContent = 'Törn anlegen und öffnen';
  }
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
}
window.openTripDialog = openTripDialog;

async function saveTripForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formObject(form);
  const existing = values.id ? await getOne('trips', values.id) : null;
  const trip = {
    ...(existing || {}),
    ...values,
    id: values.id || uid(),
    title: String(values.title || '').trim(),
    status: values.status || 'planned',
    createdAt: existing?.createdAt || new Date().toISOString()
  };
  if (!trip.title) return;
  if (trip.startDate && trip.endDate && trip.endDate < trip.startDate) {
    alert('Das Enddatum darf nicht vor dem Startdatum liegen.');
    return;
  }
  await put('trips', trip);
  await setActiveTrip(trip.id, { silent: true });
  $('#tripDialog')?.close();
  toast(existing ? 'Törn aktualisiert' : 'Neuer Törn angelegt und geöffnet');
}

async function defaults() {
  const checks = await all('checklists');
  if (!checks.length) {
    for (const item of STANDARD_CHECKLIST_ITEMS) {
      await put('checklists', { id: item.id, group: item.group, item: item.item, done: false });
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
  await ensureTripsAndMigrate();
}

function getSettings() {
  const base = { ...DEFAULT_SETTINGS, ...(state.settings?.find(item => item.id === 'main') || allState.settings?.find(item => item.id === 'main') || {}) };
  const trip = getActiveTrip();
  if (!trip) return base;
  return { ...base, tripTitle: trip.title || 'Aktueller Törn', tripStart: trip.startDate || '', tripEnd: trip.endDate || '' };
}

async function refresh() {
  allState = {};
  for (const store of stores) allState[store] = await all(store);
  if (!activeTripId || !(allState.trips || []).some(item => item.id === activeTripId)) {
    const activeMeta = await metaGet('activeTrip');
    const candidate = (allState.trips || []).find(item => item.id === activeMeta?.tripId)
      || (allState.trips || []).find(item => item.status === 'active')
      || (allState.trips || [])[0];
    activeTripId = candidate?.id || '';
    if (activeTripId) await metaSet('activeTrip', { tripId: activeTripId, changedAt: new Date().toISOString() });
  }
  state = {};
  for (const store of stores) {
    const rows = allState[store] || [];
    state[store] = TRIP_SCOPED_STORES.has(store) ? rows.filter(item => item.tripId === activeTripId) : rows;
  }
  state.days.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  state.fuel.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  state.maintenance.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  state.ports.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  render();
  await updateVacationUi();
}

function actionButtons(kind, id) {
  return `<button class="edit" onclick="editItem('${kind}','${id}')">Bearbeiten</button><button class="delete" onclick="removeItem('${kind}','${id}')">Löschen</button>`;
}

function card(item, kind, body, className = '') {
  return `<article class="item ${className}" data-store="${esc(kind)}" data-record-id="${esc(item.id)}">${actionButtons(kind, item.id)}${body}</article>`;
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

function setStableBoatImage(element, source) {
  if (!element || !source) return;
  if (element.dataset.currentSource === source && element.classList.contains('boat-image-ready')) return;
  if (element.dataset.loadingSource === source) return;

  element.dataset.loadingSource = source;
  element.classList.remove('boat-image-ready');
  element.classList.add('boat-image-pending');

  const loader = new Image();
  loader.onload = () => {
    // Nur das zuletzt angeforderte Bild übernehmen.
    if (element.dataset.loadingSource !== source) return;
    element.src = source;
    element.dataset.currentSource = source;
    delete element.dataset.loadingSource;
    requestAnimationFrame(() => {
      element.classList.remove('boat-image-pending');
      element.classList.add('boat-image-ready');
    });
  };
  loader.onerror = () => {
    delete element.dataset.loadingSource;
    if (source !== defaultHero) setStableBoatImage(element, defaultHero);
  };
  loader.src = source;
}

function setBoatImage(settings) {
  const image = settings.boatPhoto || defaultHero;
  setStableBoatImage($('#heroBoatImage'), image);
  setStableBoatImage($('#boatPhotoPreview'), image);
}

function render() {
  const settings = getSettings();
  setBoatImage(settings);

  $('#headerBoatName').textContent = settings.boatName || 'LEEFKE';
  $('#headerBoatLine').textContent = `${settings.boatType || 'Groeneveld Kotter'}${settings.model ? ` · ${settings.model}` : ''} · ${settings.homePort || 'Lemwerder'}`;
  $('#tripTitle').textContent = settings.tripTitle || 'Aktueller Törn';
  $('#tripDates').textContent = [fmtDate(settings.tripStart), fmtDate(settings.tripEnd)].filter(Boolean).join(' – ');
  $('#leefkeStory').textContent = `${settings.boatName || 'LEEFKE'} ist unser ${settings.buildYear || 1996} gebauter ${settings.boatType || 'Groeneveld Kotter'}${settings.model ? ` der Baureihe ${settings.model}` : ''}: ein ${dec2(settings.length)} Meter langer Verdränger aus ${settings.hullMaterial || 'Stahl'} mit klassischem Spitzgatt. Der ${settings.engine || 'Perkins M135'} bringt uns mit ruhigen ${settings.cruiseSpeed || '6,5 kn'} vom ${settings.homePort || 'Heimathafen'} hinaus auf Nord- und Ostsee.`;

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
  renderDayRouteOptions();
  renderWeatherLocationOptions();
  if (activeWeatherSnapshot?.id) {
    activeWeatherSnapshot = state.weather?.find(item => item.id === activeWeatherSnapshot.id) || activeWeatherSnapshot;
  } else if (state.weather?.length) {
    activeWeatherSnapshot = [...state.weather].sort((a, b) => Date.parse(b.loadedAt || b._updatedAt || 0) - Date.parse(a.loadedAt || a._updatedAt || 0))[0];
  }
  if (activeWeatherSnapshot) renderWeatherSnapshot(activeWeatherSnapshot, activeWeatherHourIndex);
  if (nauticalMap) refreshPortLayer();
  renderTripManager();
  renderV6Extras();
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
  const count = $('#dayListCount');
  if (count) count.textContent = query ? `${filtered.length} von ${state.days.length} Einträgen` : `${state.days.length} ${state.days.length === 1 ? 'Eintrag' : 'Einträge'}`;
  $('#dayList').innerHTML = filtered.map(item => {
    const title = item.title || ((item.fromPort || item.toPort) ? `${item.fromPort || 'Start'} → ${item.toPort || 'Ziel'}` : `Tagestour vom ${fmtDate(item.date)}`);
    const summary = String(item.summary || '').trim();
    const summaryPreview = summary.length > 280 ? `${summary.slice(0, 280).trim()} …` : summary;
    return `<article class="item day-entry-card" data-store="days" data-record-id="${esc(item.id)}">
      <div class="day-entry-heading">
        <div>
          <div class="meta">${fmtDate(item.date)}${item.dayNo ? ` · Reisetag ${esc(item.dayNo)}` : ''}</div>
          <h3>${esc(title)}</h3>
        </div>
        ${item.distance ? `<strong class="day-distance">${dec(item.distance)} sm</strong>` : ''}
      </div>
      <div class="day-entry-overview">
        <div><span>Route</span><strong>${esc(item.fromPort || '—')} → ${esc(item.toPort || '—')}</strong></div>
        <div><span>Zeit</span><strong>${esc(item.depart || '—')} – ${esc(item.arrive || '—')}</strong></div>
        <div><span>Wetter</span><strong>${esc(item.weather || '—')}</strong></div>
        <div><span>Wind / Welle</span><strong>${esc(item.wind || '—')}${item.wave ? ` · ${esc(item.wave)}` : ''}</strong></div>
      </div>
      ${item.tide || item.crew ? `<div class="day-facts">${item.tide ? `<span>↕ ${esc(item.tide)}</span>` : ''}${item.crew ? `<span>⚓ ${esc(item.crew)}</span>` : ''}</div>` : ''}
      ${summaryPreview ? `<p class="day-summary-preview">${esc(summaryPreview).replace(/\n/g, '<br>')}</p>` : ''}
      ${item.moment ? `<blockquote>„${esc(item.moment)}“</blockquote>` : ''}
      <div class="day-entry-actions">
        <button class="day-open-button" type="button" onclick="openSavedDay('${item.id}')">Eintrag ansehen</button>
        <button class="edit" type="button" onclick="editDayItem('${item.id}')">Bearbeiten</button>
        <button class="delete" type="button" onclick="removeItem('days','${item.id}')">Löschen</button>
      </div>
    </article>`;
  }).join('') || '<div class="card muted">Keine passenden Tagestouren gefunden.</div>';
}

function formatFuelDecimal(value, digits = 1) {
  if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function renderFuel(totalHours) {
  const liters = state.fuel.reduce((sum, item) => sum + num(item.liters), 0);
  const cost = state.fuel.reduce((sum, item) => sum + num(item.liters) * num(item.price), 0);
  $('#fuelLiters').textContent = `${dec(liters)} l`;
  $('#fuelCost').textContent = eur(cost);
  $('#fuelPrice').textContent = liters ? `${eur(cost / liters)}/l` : '—';
  $('#fuelPerHour').textContent = totalHours ? `${dec(liters / totalHours)} l/h` : '—';
  $('#fuelList').innerHTML = state.fuel.map(item => {
    const itemLiters = num(item.liters);
    const itemPrice = num(item.price);
    const total = itemLiters * itemPrice;
    const when = `${fmtDate(item.date)}${item.time ? ` · ${esc(item.time)} Uhr` : ''}`;
    return `<article class="item fuel-entry" data-store="fuel" data-record-id="${esc(item.id)}">
      <header class="fuel-entry-head">
        <div><span class="fuel-entry-kicker">TANKVORGANG</span><h3>${esc(item.place || 'Ort nicht eingetragen')}</h3><p>${when}</p></div>
        <strong class="fuel-entry-total">${itemLiters && itemPrice ? eur(total) : '—'}</strong>
      </header>
      <div class="fuel-entry-grid">
        <div><span>Getankt</span><strong>${item.liters !== '' && item.liters !== undefined ? `${formatFuelDecimal(item.liters)} l` : '—'}</strong></div>
        <div><span>Preis je Liter</span><strong>${item.price !== '' && item.price !== undefined ? `${formatFuelDecimal(item.price, 3)} €` : '—'}</strong></div>
        <div><span>Motorstunden</span><strong>${item.engineHours !== '' && item.engineHours !== undefined ? `${formatFuelDecimal(item.engineHours)} h` : '—'}</strong></div>
        <div><span>Tankstand danach</span><strong>${item.tankPercent !== '' && item.tankPercent !== undefined ? `${formatFuelDecimal(item.tankPercent)} %` : '—'}</strong></div>
      </div>
      ${item.note ? `<p class="fuel-entry-note">${esc(item.note).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="fuel-entry-actions"><button type="button" onclick="editItem('fuel','${item.id}')">Bearbeiten</button><button class="delete" type="button" onclick="removeItem('fuel','${item.id}')">Löschen</button></div>
    </article>`;
  }).join('') || '<div class="card muted">Noch keine Tankvorgänge eingetragen.</div>';
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

let portGpsCandidates = [];

function parseCoordinateText(value) {
  const match = String(value || '').trim().match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,;/ ]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number(match[1].replace(',', '.'));
  const longitude = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function portGpsType(tags = {}) {
  if (tags.leisure === 'marina') return 'Marina / Yachthafen';
  if (tags['seamark:type'] === 'harbour' || tags.harbour) return 'Hafen';
  if (tags.landuse === 'harbour') return 'Hafengebiet';
  if (tags.club === 'sailing' || tags.sport === 'sailing') return 'Segelverein / Yachtclub';
  if (tags.amenity === 'ferry_terminal') return 'Fährhafen';
  return 'Hafenanlage';
}

function setPortGpsStatus(message = '', kind = 'info') {
  const status = $('#portGpsStatus');
  if (!status) return;
  status.textContent = message;
  status.className = `port-gps-status ${kind}`;
  status.hidden = !message;
}

function resetPortGpsAssistant() {
  portGpsCandidates = [];
  setPortGpsStatus();
  const suggestions = $('#portGpsSuggestions');
  if (suggestions) {
    suggestions.hidden = true;
    suggestions.innerHTML = '';
  }
  const button = $('#portGpsButton');
  if (button) {
    button.disabled = false;
    button.textContent = '📍 Standort verwenden';
  }
}

function storedPortGpsCandidates(location) {
  return (state.ports || []).map(item => {
    const position = parseCoordinateText(item.coords);
    if (!position || !item.name) return null;
    return {
      name: item.name,
      latitude: position.latitude,
      longitude: position.longitude,
      distanceKm: haversineKm(location, position),
      type: 'Bereits im Hafenbuch',
      source: 'LEEFKE'
    };
  }).filter(Boolean).filter(item => item.distanceKm <= 12);
}

function overpassPortQuery(latitude, longitude, radius = 9000) {
  return `[out:json][timeout:18];(
    nwr(around:${radius},${latitude},${longitude})["leisure"="marina"]["name"];
    nwr(around:${radius},${latitude},${longitude})["harbour"]["name"];
    nwr(around:${radius},${latitude},${longitude})["seamark:type"="harbour"];
    nwr(around:${radius},${latitude},${longitude})["landuse"="harbour"]["name"];
    nwr(around:${radius},${latitude},${longitude})["sport"="sailing"]["name"];
    nwr(around:${radius},${latitude},${longitude})["club"="sailing"]["name"];
    nwr(around:${radius},${latitude},${longitude})["amenity"="ferry_terminal"]["name"];
  );out center tags;`;
}

async function fetchNearbyPorts(location) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  const query = overpassPortQuery(location.latitude, location.longitude);
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`
      });
      if (!response.ok) throw new Error(`Kartendienst antwortet mit ${response.status}`);
      const data = await response.json();
      return (data.elements || []).map(element => {
        const latitude = Number(element.lat ?? element.center?.lat);
        const longitude = Number(element.lon ?? element.center?.lon);
        const tags = element.tags || {};
        const name = String(tags.name || tags['seamark:name'] || '').trim();
        if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        return {
          name,
          latitude,
          longitude,
          distanceKm: haversineKm(location, { latitude, longitude }),
          type: portGpsType(tags),
          source: 'OpenStreetMap'
        };
      }).filter(Boolean);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Hafensuche momentan nicht erreichbar');
}

function uniquePortCandidates(items) {
  const seen = new Set();
  return items.sort((a, b) => a.distanceKm - b.distanceKm).filter(item => {
    const key = item.name.toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function renderPortGpsCandidates(items, accuracy) {
  const box = $('#portGpsSuggestions');
  if (!box) return;
  portGpsCandidates = items;
  if (!items.length) {
    box.hidden = false;
    box.innerHTML = `<div class="port-gps-empty"><strong>Kein benannter Hafen in unmittelbarer Nähe gefunden.</strong><span>Die aktuelle GPS-Position wurde bereits in das Koordinatenfeld übernommen. Den Hafennamen kannst du manuell ergänzen.</span></div>`;
    return;
  }
  box.hidden = false;
  box.innerHTML = `<div class="port-gps-result-head"><strong>Welcher Hafen ist es?</strong><span>${items.length} Vorschlag${items.length === 1 ? '' : 'e'}${Number.isFinite(accuracy) ? ` · GPS ± ${Math.round(accuracy)} m` : ''}</span></div>${items.map((item, index) => `<button type="button" class="port-gps-suggestion" data-port-gps-index="${index}"><span class="port-gps-marker">⚓</span><span><strong>${esc(item.name)}</strong><small>${esc(item.type)} · ${item.distanceKm < 1 ? `${Math.round(item.distanceKm * 1000)} m` : `${item.distanceKm.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`} entfernt</small></span><span class="port-gps-choose">Übernehmen</span></button>`).join('')}`;
}

function geolocationErrorText(error) {
  if (error?.code === 1) return 'Standortzugriff wurde nicht erlaubt. Bitte die Standortfreigabe für Safari beziehungsweise den Browser aktivieren und erneut versuchen.';
  if (error?.code === 2) return 'Der Standort konnte momentan nicht bestimmt werden. Bitte unter freiem Himmel oder mit besserem GPS-Empfang erneut versuchen.';
  if (error?.code === 3) return 'Die Standortbestimmung hat zu lange gedauert. Bitte noch einmal versuchen.';
  return 'Der Standort konnte nicht bestimmt werden.';
}

async function suggestPortFromGps() {
  const button = $('#portGpsButton');
  const form = $('#portForm');
  if (!navigator.geolocation) return setPortGpsStatus('Dieses Gerät oder dieser Browser unterstützt keine GPS-Ortung.', 'error');
  button.disabled = true;
  button.textContent = '⌖ Standort wird bestimmt …';
  setPortGpsStatus('Bitte die Standortabfrage des Geräts bestätigen. Die genaue Position kann einige Sekunden dauern.', 'loading');
  $('#portGpsSuggestions').hidden = true;
  try {
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 18000,
      maximumAge: 30000
    }));
    const location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
    form.elements.coords.value = `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
    if (!form.elements.date.value) form.elements.date.value = dateInputValue();
    setPortGpsStatus(`Position gefunden${Number.isFinite(position.coords.accuracy) ? ` (Genauigkeit etwa ± ${Math.round(position.coords.accuracy)} m)` : ''}. Häfen in der Nähe werden gesucht …`, 'loading');

    const localCandidates = storedPortGpsCandidates(location);
    let onlineCandidates = [];
    let onlineError = null;
    if (navigator.onLine) {
      try { onlineCandidates = await fetchNearbyPorts(location); }
      catch (error) { onlineError = error; }
    }
    const candidates = uniquePortCandidates([...localCandidates, ...onlineCandidates]);
    renderPortGpsCandidates(candidates, position.coords.accuracy);
    if (candidates.length) {
      setPortGpsStatus('Standort gefunden. Bitte den passenden Hafen aus den Vorschlägen auswählen; gespeichert wird erst mit „Hafen speichern“.', 'success');
    } else if (!navigator.onLine) {
      setPortGpsStatus('GPS-Position übernommen. Für die automatische Hafensuche ist momentan eine Internetverbindung nötig.', 'warning');
    } else if (onlineError) {
      setPortGpsStatus('GPS-Position übernommen. Der Kartendienst für Hafenvorschläge war gerade nicht erreichbar; der Hafenname kann manuell eingetragen werden.', 'warning');
    } else {
      setPortGpsStatus('GPS-Position übernommen, aber im Umkreis wurde kein benannter Hafen gefunden.', 'warning');
    }
  } catch (error) {
    setPortGpsStatus(geolocationErrorText(error), 'error');
  } finally {
    button.disabled = false;
    button.textContent = '📍 Standort erneut bestimmen';
  }
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

function renderDayRouteOptions() {
  const select = $('#dayRouteSource');
  const button = $('#dayRouteApply');
  if (!select) return;
  const current = select.value;
  const routes = [...(state.route || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  select.innerHTML = '<option value="">Etappe auswählen …</option>' + routes.map((item, index) => `<option value="${esc(item.id)}">${index + 1}. ${fmtDate(item.date) || 'Datum offen'} · ${esc(item.from || 'Start')} → ${esc(item.to || 'Ziel')}</option>`).join('');
  if (routes.some(item => item.id === current)) select.value = current;
  if (button) button.disabled = !routes.length || !select.value;
}

const DAY_FIELD_HELP = {
  date: ['Datum', 'Der Kalendertag, an dem die Fahrt stattgefunden hat. Das Datum ist das einzige Pflichtfeld.', 'Beispiel: 31.07.2026'],
  dayNo: ['Reisetag', 'Die laufende Nummer innerhalb des aktuellen Törns. Die App schlägt automatisch die nächste Nummer vor; du kannst sie ändern.', 'Beispiel: 3 für den dritten Tag des Urlaubs'],
  title: ['Überschrift', 'Eine kurze, persönliche Überschrift. Bleibt das Feld leer, erzeugt die App automatisch eine Überschrift aus Start und Ziel.', 'Beispiel: Ruhige Überfahrt nach Helgoland'],
  fromPort: ['Von', 'Startort oder Hafen der Tagestour. Bereits bekannte Häfen und geplante Etappen werden als Vorschläge angeboten.', 'Beispiel: Bremerhaven'],
  toPort: ['Nach', 'Zielort oder Hafen der Tagestour.', 'Beispiel: Helgoland'],
  depart: ['Ablegen', 'Die tatsächliche Ortszeit, zu der die LEEFKE abgelegt hat.', 'Beispiel: 06:30 Uhr'],
  arrive: ['Anlegen', 'Die tatsächliche Ortszeit, zu der die LEEFKE festgemacht hat.', 'Beispiel: 11:45 Uhr'],
  distance: ['Strecke in Seemeilen', 'Die tatsächlich gefahrene Strecke in Seemeilen. 1 sm entspricht 1,852 km.', 'Beispiel: 42,5 sm'],
  engineStart: ['Motorstunden beim Start', 'Der Stand des Betriebsstundenzählers unmittelbar vor dem Ablegen. Nicht die geplante Fahrtdauer eintragen.', 'Beispiel: 917,4 h'],
  engineEnd: ['Motorstunden beim Ende', 'Der Stand des Betriebsstundenzählers nach dem Anlegen. Daraus berechnet die App die Motorlaufzeit.', 'Beispiel: 923,1 h'],
  weather: ['Wetter', 'Kurze Beschreibung der Wetterlage. Du kannst einen Vorschlag auswählen oder frei schreiben.', 'Beispiel: Heiter, 18 °C, gute Sicht'],
  wind: ['Wind', 'Windrichtung und Stärke, möglichst in Beaufort; Böen können ergänzt werden.', 'Beispiel: NW 3 Bft, Böen 5 Bft'],
  wave: ['Welle', 'Möglichst Wellenhöhe, Richtung und Periode notieren. Die Periode beschreibt den zeitlichen Abstand zwischen den Wellen.', 'Beispiel: 0,7 m aus NW · 4,5 s'],
  tide: ['Tide / Strom', 'Hier kommt die beobachtete oder geplante Tide- und Stromsituation hinein.', 'Beispiel: ablaufend · etwa 1 kn mitlaufender Strom'],
  crew: ['Besatzung', 'Alle Personen an Bord, durch Komma getrennt. Die Standardbesatzung kann im Schiffspass hinterlegt werden.', 'Beispiel: Günni, …'],
  summary: ['Tagesbericht', 'Der eigentliche Logbucheintrag: Verlauf der Fahrt, Verkehr, Manöver, Vorkommnisse, Ansteuerung und Liegeplatz.', 'Beispiel: Um 08:15 Alte Weser passiert, mäßiger Schiffsverkehr …'],
  moment: ['Moment des Tages', 'Der persönliche Höhepunkt oder eine besondere Erinnerung. Dieser Text wird im Reisebericht hervorgehoben.', 'Beispiel: Die ersten Basstölpel kurz vor Helgoland.']
};

function openDayFieldHelp(key) {
  const data = DAY_FIELD_HELP[key];
  const dialog = $('#fieldHelpDialog');
  if (!data || !dialog) return;
  $('#fieldHelpTitle').textContent = data[0];
  $('#fieldHelpText').textContent = data[1];
  const example = $('#fieldHelpExample');
  example.textContent = data[2] || '';
  example.hidden = !data[2];
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else alert(`${data[0]}

${data[1]}${data[2] ? `

${data[2]}` : ''}`);
}

function setDayFormStatus(message = '', kind = 'info') {
  const status = $('#dayFormStatus');
  if (!status) return;
  status.hidden = !message;
  status.className = `wide form-status ${kind}`;
  status.textContent = message;
}

function updateDayFormMode() {
  const form = $('#dayForm');
  const button = $('#daySaveButton');
  const cancelButton = $('#dayCancelEditButton');
  if (!form || !button) return;
  const editing = Boolean(editingDayId || form.elements.id.value);
  button.textContent = editing ? 'Änderungen speichern' : 'Tagestour speichern';
  if (cancelButton) cancelButton.hidden = !editing;
}

function meaningfulDayEntry(item) {
  return ['title', 'fromPort', 'toPort', 'depart', 'arrive', 'distance', 'engineStart', 'engineEnd', 'weather', 'wind', 'wave', 'tide', 'crew', 'summary', 'moment']
    .some(field => String(item[field] ?? '').trim() !== '');
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

const dayForm = $('#dayForm');
if (dayForm) {
  dayForm.onsubmit = async event => {
    event.preventDefault();
    setDayFormStatus();
    const saveButton = $('#daySaveButton');
    try {
      if (!dayForm.reportValidity()) {
        setDayFormStatus('Bitte prüfe die rot markierten Pflichtfelder. Das Datum muss eingetragen sein.', 'error');
        return;
      }
      const item = formObject(dayForm);
      if (!meaningfulDayEntry(item)) {
        setDayFormStatus('Bitte trage außer dem Datum mindestens eine Information zur Tagestour ein, zum Beispiel Start, Ziel oder Tagesbericht.', 'error');
        dayForm.elements.fromPort.focus();
        return;
      }
      if (item.engineStart !== '' && item.engineEnd !== '' && num(item.engineEnd) < num(item.engineStart)) {
        setDayFormStatus('Die Motorstunden am Ende dürfen nicht kleiner sein als beim Start. Bitte prüfe die beiden Zählerstände.', 'error');
        dayForm.elements.engineEnd.focus();
        return;
      }
      saveButton.disabled = true;
      saveButton.textContent = 'Wird gespeichert …';
      const existing = item.id ? await getOne('days', item.id) : null;
      item.id = item.id || uid();
      item.created = existing?.created || Date.now();
      if (!String(item.title || '').trim()) {
        item.title = item.fromPort || item.toPort
          ? `${item.fromPort || 'Start'} → ${item.toPort || 'Ziel'}`
          : `Tagestour vom ${fmtDate(item.date)}`;
      }
      // Beim Bearbeiten den vollständigen vorhandenen Datensatz erhalten.
      // So gehen weder Törnzuordnung noch ältere Zusatzfelder verloren.
      const completeItem = existing
        ? { ...existing, ...item, id: existing.id, tripId: existing.tripId || activeTripId, created: existing.created || item.created }
        : { ...item, tripId: item.tripId || activeTripId };
      const saved = await put('days', completeItem);
      editingDayId = '';
      await refresh();
      dayForm.reset();
      prepareDayForm();
      await new Promise(resolve => window.setTimeout(resolve, 0));
      const cloudNote = currentSession
        ? (navigator.onLine ? 'Cloud-Abgleich läuft automatisch.' : 'Offline gespeichert; der Cloud-Abgleich folgt bei Internetverbindung.')
        : 'Lokal gespeichert; für den Abgleich mit anderen Geräten bitte anmelden.';
      setDayFormStatus(`Tagestour gespeichert. Sie steht unten bei den gespeicherten Tagestouren. ${cloudNote}`, 'success');
      toast('Tagestour gespeichert');
      window.setTimeout(() => {
        const savedCard = document.querySelector(`[data-store="days"][data-record-id="${saved.id}"]`);
        if (!savedCard) return;
        savedCard.classList.add('just-saved');
        savedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => savedCard.classList.remove('just-saved'), 2600);
      }, 180);
    } catch (error) {
      console.error('Tagestour konnte nicht gespeichert werden.', error);
      setDayFormStatus(`Speichern fehlgeschlagen: ${error?.message || 'Unbekannter Fehler'}. Die eingegebenen Daten bleiben im Formular stehen.`, 'error');
      toast('Tagestour konnte nicht gespeichert werden');
    } finally {
      saveButton.disabled = false;
      updateDayFormMode();
    }
  };
  dayForm.addEventListener('reset', () => window.setTimeout(() => {
    editingDayId = '';
    setDayFormStatus();
    prepareDayForm();
  }, 0));
  $('#dayCancelEditButton')?.addEventListener('click', () => {
    editingDayId = '';
    dayForm.reset();
    window.setTimeout(() => {
      setDayFormStatus('Bearbeiten beendet. Der gespeicherte Eintrag wurde nicht verändert.', 'info');
      prepareDayForm();
    }, 0);
  });
}


function parseFuelDecimal(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function setFuelFormStatus(message = '', type = 'info') {
  const box = $('#fuelFormStatus');
  if (!box) return;
  box.hidden = !message;
  box.className = `form-status wide ${type}`;
  box.textContent = message;
}

function updateFuelFormMode(editing = false) {
  const title = $('#fuelFormTitle');
  const save = $('#fuelSaveButton');
  const cancel = $('#fuelCancelEditButton');
  if (title) title.textContent = editing ? 'Tankvorgang bearbeiten' : 'Tanken dokumentieren';
  if (save) save.textContent = editing ? 'Änderungen speichern' : 'Tankvorgang speichern';
  if (cancel) cancel.hidden = !editing;
}

const fuelForm = $('#fuelForm');
if (fuelForm) {
  fuelForm.onsubmit = async event => {
    event.preventDefault();
    setFuelFormStatus();
    const saveButton = $('#fuelSaveButton');
    if (!fuelForm.elements.date.value) {
      setFuelFormStatus('Bitte trage das Datum des Tankvorgangs ein.', 'error');
      fuelForm.elements.date.focus();
      return;
    }
    const raw = formObject(fuelForm);
    const liters = parseFuelDecimal(raw.liters);
    const price = parseFuelDecimal(raw.price);
    const engineHours = parseFuelDecimal(raw.engineHours);
    const tankPercent = parseFuelDecimal(raw.tankPercent);
    if ([liters, price, engineHours, tankPercent].some(value => Number.isNaN(value))) {
      setFuelFormStatus('Eine Zahl konnte nicht gelesen werden. Du kannst Komma oder Punkt verwenden, zum Beispiel 120,5 oder 1,699.', 'error');
      return;
    }
    if (liters !== '' && liters <= 0) {
      setFuelFormStatus('Die getankte Literzahl muss größer als 0 sein.', 'error');
      fuelForm.elements.liters.focus();
      return;
    }
    if (price !== '' && price < 0) {
      setFuelFormStatus('Der Preis je Liter darf nicht negativ sein.', 'error');
      fuelForm.elements.price.focus();
      return;
    }
    if (tankPercent !== '' && (tankPercent < 0 || tankPercent > 100)) {
      setFuelFormStatus('Der Tankstand muss zwischen 0 und 100 Prozent liegen.', 'error');
      fuelForm.elements.tankPercent.focus();
      return;
    }
    saveButton.disabled = true;
    saveButton.textContent = 'Wird gespeichert …';
    try {
      const existing = raw.id ? await getOne('fuel', raw.id) : null;
      const saved = await put('fuel', {
        ...(existing || {}),
        id: raw.id || uid(),
        date: raw.date,
        time: raw.time || '',
        place: String(raw.place || '').trim(),
        liters,
        price,
        engineHours,
        tankPercent,
        note: String(raw.note || '').trim(),
        created: existing?.created || Date.now()
      });
      fuelForm.reset();
      updateFuelFormMode(false);
      await refresh();
      setFuelFormStatus(`Tankvorgang vom ${fmtDate(saved.date)}${saved.time ? ` um ${saved.time} Uhr` : ''} wurde vollständig gespeichert.`, 'success');
      toast('Tankvorgang gespeichert');
      window.setTimeout(() => {
        const card = document.querySelector(`[data-store="fuel"][data-record-id="${saved.id}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card?.classList.add('just-saved');
        window.setTimeout(() => card?.classList.remove('just-saved'), 2500);
      }, 150);
    } catch (error) {
      console.error('Tankvorgang konnte nicht gespeichert werden.', error);
      setFuelFormStatus(`Speichern fehlgeschlagen: ${error?.message || 'Unbekannter Fehler'}. Die Eingaben bleiben erhalten.`, 'error');
      toast('Tankvorgang konnte nicht gespeichert werden');
    } finally {
      saveButton.disabled = false;
      const editing = Boolean(fuelForm.elements.id.value);
      updateFuelFormMode(editing);
    }
  };
  fuelForm.addEventListener('reset', () => window.setTimeout(() => {
    updateFuelFormMode(false);
    setFuelFormStatus();
  }, 0));
  $('#fuelCancelEditButton')?.addEventListener('click', () => {
    fuelForm.reset();
    updateFuelFormMode(false);
    setFuelFormStatus('Bearbeiten beendet. Der gespeicherte Tankvorgang wurde nicht verändert.', 'info');
  });
}

for (const id of ['maintenance', 'route', 'port']) {
  const form = $(`#${id}Form`);
  form.onsubmit = async event => {
    event.preventDefault();
    const item = formObject(form);
    item.id = item.id || uid();
    item.created = item.created || Date.now();
    if (id === 'maintenance') item.done = item.done === 'true';
    const store = id === 'port' ? 'ports' : id;
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
  const formValues = normalizeSettingsFormValues(formObject(event.target));
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

async function editDayItem(id) {
  const item = await getOne('days', id) || state.days.find(entry => entry.id === id);
  if (!item) return toast('Tagestour wurde nicht gefunden');
  editingDayId = id;
  view('day');
  window.requestAnimationFrame(() => {
    const form = $('#dayForm');
    if (!form) return;
    fillForm(form, item);
    form.elements.id.value = item.id;
    updateDayFormMode();
    const label = item.title || `${item.fromPort || 'Start'} → ${item.toPort || 'Ziel'}`;
    setDayFormStatus(`Du bearbeitest „${label}“. Alle gespeicherten Werte wurden ins Formular geladen.`, 'info');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Tagestour vollständig geladen');
  });
}

async function openSavedDay(id) {
  const item = await getOne('days', id) || state.days.find(entry => entry.id === id);
  const dialog = $('#dayViewDialog');
  const content = $('#dayViewContent');
  if (!item || !dialog || !content) return toast('Tagestour wurde nicht gefunden');
  dayViewRecordId = id;
  const title = item.title || `${item.fromPort || 'Start'} → ${item.toPort || 'Ziel'}`;
  const engineHours = (item.engineStart !== '' && item.engineStart !== undefined && item.engineEnd !== '' && item.engineEnd !== undefined)
    ? Math.max(0, num(item.engineEnd) - num(item.engineStart))
    : null;
  content.innerHTML = `
    <header class="day-view-header">
      <div>
        <h3 id="dayViewTitle">${esc(title)}</h3>
        <p class="meta">${fmtDate(item.date)}${item.dayNo ? ` · Reisetag ${esc(item.dayNo)}` : ''}</p>
      </div>
      ${item.distance ? `<strong class="day-view-distance">${dec(item.distance)} sm</strong>` : ''}
    </header>

    <section class="day-view-section">
      <div class="day-view-section-title"><span>↝</span><div><small>FAHRT</small><h4>Route & Zeiten</h4></div></div>
      <div class="day-view-facts day-view-facts-route">
        <div><span>Von</span><strong>${esc(item.fromPort || '—')}</strong></div>
        <div><span>Nach</span><strong>${esc(item.toPort || '—')}</strong></div>
        <div><span>Ablegen</span><strong>${esc(item.depart || '—')}</strong></div>
        <div><span>Anlegen</span><strong>${esc(item.arrive || '—')}</strong></div>
        <div><span>Strecke</span><strong>${item.distance ? `${dec(item.distance)} sm` : '—'}</strong></div>
        <div><span>Reisetag</span><strong>${esc(item.dayNo || '—')}</strong></div>
      </div>
    </section>

    <section class="day-view-section">
      <div class="day-view-section-title"><span>⚙</span><div><small>AN BORD</small><h4>Maschine & Besatzung</h4></div></div>
      <div class="day-view-facts">
        <div><span>Motorstunden Start</span><strong>${esc(item.engineStart ?? '—') || '—'}</strong></div>
        <div><span>Motorstunden Ende</span><strong>${esc(item.engineEnd ?? '—') || '—'}</strong></div>
        <div><span>Fahrzeit Motor</span><strong>${engineHours === null ? '—' : `${dec(engineHours)} h`}</strong></div>
        <div><span>Besatzung</span><strong>${esc(item.crew || '—')}</strong></div>
      </div>
    </section>

    <section class="day-view-section">
      <div class="day-view-section-title"><span>≈</span><div><small>BEDINGUNGEN</small><h4>Wetter, Wind & Wasser</h4></div></div>
      <div class="day-view-facts day-view-facts-weather">
        <div><span>Wetter</span><strong>${esc(item.weather || '—')}</strong></div>
        <div><span>Wind</span><strong>${esc(item.wind || '—')}</strong></div>
        <div><span>Welle</span><strong>${esc(item.wave || '—')}</strong></div>
        <div><span>Tide / Strom</span><strong>${esc(item.tide || '—')}</strong></div>
      </div>
    </section>

    ${item.summary ? `<section class="day-view-text"><h4>Tagesbericht</h4><p>${esc(item.summary).replace(/\n/g, '<br>')}</p></section>` : ''}
    ${item.moment ? `<section class="day-view-text"><h4>Moment des Tages</h4><blockquote>„${esc(item.moment)}“</blockquote></section>` : ''}`;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else alert(content.textContent);
}
async function editItem(kind, id) {
  if (kind === 'days') { editDayItem(id); return; }
  const map = { ports: 'port', fuel: 'fuel', maintenance: 'maintenance', route: 'route' };
  if (!map[kind]) return;
  const item = await getOne(kind, id) || state[kind]?.find(entry => entry.id === id);
  if (!item) return toast('Der Eintrag konnte nicht geladen werden');
  const form = $(`#${map[kind]}Form`);
  view(map[kind] === 'port' ? 'ports' : map[kind]);
  fillForm(form, item);
  if (kind === 'fuel') {
    updateFuelFormMode(true);
    setFuelFormStatus('Der Tankvorgang ist vollständig geladen. Änderungen werden erst mit „Änderungen speichern“ übernommen.', 'info');
  }
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  setDayFormStatus('Die geplante Etappe wurde in das Formular übernommen. Ergänze die tatsächlichen Werte und tippe anschließend auf „Tagestour speichern“.', 'info');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast('Etappe in die Tagestour übernommen');
}

window.showRouteGpx = showRouteGpx;
window.routeToDay = routeToDay;
window.removeItem = removeItem;
window.toggleCheck = toggleCheck;
window.editItem = editItem;
window.editDayItem = editDayItem;
window.openSavedDay = openSavedDay;

$('#daySearch').oninput = renderDays;
$('#showSavedDaysButton')?.addEventListener('click', () => $('#savedDaysSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
$('#dayViewEditButton')?.addEventListener('click', () => {
  const id = dayViewRecordId;
  $('#dayViewDialog')?.close();
  if (id) editDayItem(id);
});
$('#portSearch').oninput = renderPorts;
$$('.field-help').forEach(button => button.addEventListener('click', () => openDayFieldHelp(button.dataset.help)));
$('#dayRouteApply')?.addEventListener('click', () => {
  const routeId = $('#dayRouteSource')?.value;
  if (!routeId) return toast('Bitte zuerst eine geplante Etappe auswählen');
  routeToDay(routeId);
});
$('#dayRouteSource')?.addEventListener('change', event => {
  const button = $('#dayRouteApply');
  if (button) button.disabled = !event.target.value;
});

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
  return String(value || '').toLocaleLowerCase('de').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z0-9]/g, '');
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
$('#printReport').onclick = async () => {
  const mapReady = buildReport();
  try { await mapReady; } catch (error) { console.info('Reisebericht-Seekarte konnte nicht vollständig vorgeladen werden.', error); }
  await new Promise(resolve => window.setTimeout(resolve, 350));
  reportRouteMap?.invalidateSize(false);
  window.print();
};

async function downloadFullBackup({ vacation = false } = {}) {
  const now = new Date();
  const reason = vacation ? 'Urlaubssicherung' : 'Manueller Export';
  await createAutoBackup(reason, true);
  const backup = { app: 'LEEFKE Bordbuch', version: APP_VERSION, exported: now.toISOString(), reason };
  for (const store of stores) backup[store] = await all(store);
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  link.href = url;
  link.download = `${vacation ? 'LEEFKE_Urlaubssicherung' : 'LEEFKE_Sicherung'}_${now.toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  if (vacation) await metaSet('lastVacationBackup', { at: now.toISOString(), version: APP_VERSION });
  await updateVacationUi();
  toast(vacation ? 'Urlaubssicherung erstellt' : 'Sicherung exportiert');
}

$('#export').onclick = () => downloadFullBackup({ vacation: false });

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
$('#portGpsButton')?.addEventListener('click', suggestPortFromGps);
$('#portGpsSuggestions')?.addEventListener('click', event => {
  const button = event.target.closest('[data-port-gps-index]');
  if (!button) return;
  const candidate = portGpsCandidates[Number(button.dataset.portGpsIndex)];
  const form = $('#portForm');
  if (!candidate || !form) return;
  form.elements.name.value = candidate.name;
  form.elements.coords.value = `${candidate.latitude.toFixed(6)}, ${candidate.longitude.toFixed(6)}`;
  setPortGpsStatus(`${candidate.name} wurde als Vorschlag übernommen. Bitte weitere Angaben ergänzen und anschließend „Hafen speichern“ drücken.`, 'success');
  form.elements.name.focus();
});
$('#portForm').addEventListener('reset', () => window.setTimeout(() => {
  syncRatingPickers($('#portForm'));
  resetPortGpsAssistant();
}, 0));

$('#menu').onclick = () => setMobileMenu(!$('#nav').classList.contains('open'));
$$('nav button').forEach(button => button.onclick = () => view(button.dataset.view));
$$('[data-open]').forEach(button => button.onclick = () => view(button.dataset.open));
$$('[data-mobile-view]').forEach(button => button.onclick = () => view(button.dataset.mobileView));
$('#mobileMoreButton')?.addEventListener('click', () => setMobileMenu(!$('#nav').classList.contains('open')));
$('#navBackdrop')?.addEventListener('click', closeMobileMenu);
$('#mobileSaveButton')?.addEventListener('click', () => {
  const formId = $('#mobileSaveButton')?.dataset.form;
  const form = formId ? document.getElementById(formId) : null;
  if (!form) return;
  if (typeof form.requestSubmit === 'function') form.requestSubmit();
  else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 850) closeMobileMenu();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeMobileMenu();
});

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
  stopRealtimeSubscription();
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
  updateConnectionBanner();
  await updateSyncUI();
  await updateVacationUi();
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

/* =========================
   LEEFKE VERSION 7.3
   Feldweise Synchronisierung, Realtime, Medien-Cloud, Sicherungen,
   Konfliktauflösung, Bordbetrieb und Routenwetter
   ========================= */

const MEDIA_BUCKET = 'leefke-media';
const CONFLICT_WINDOW_MS = 5 * 60 * 1000;
const AUTO_BACKUP_LIMIT = 5;
const AUTO_BACKUP_SYNC_GAP_MS = 4 * 60 * 60 * 1000;
const RECORD_META_FIELDS = new Set(['id', '_updatedAt', '_updatedBy', '_updatedByLabel', '_fieldUpdatedAt', '_fieldUpdatedBy', '_mediaUpdatedAt', '_mediaCloudAt', '_cloudState', '_localOnly']);
const LOCAL_MEDIA_FIELDS = new Set(['data', 'signedUrl', 'objectUrl', 'localUrl']);
const NO_CHANGE_LOG_STORES = new Set(['changeLog', 'conflicts', 'devices', 'autoBackups', 'weather', 'routeWeather']);
const NO_CONFLICT_STORES = new Set(['changeLog', 'conflicts', 'devices', 'weather', 'routeWeather', 'gpx']);
const STORE_LABELS = {
  settings: 'Schiffsdaten', days: 'Tageslogbuch', route: 'Törnplanung', ports: 'Hafenbuch',
  fuel: 'Tankbuch', maintenance: 'Wartung', checklists: 'Checklisten', photos: 'Fotos',
  gpx: 'GPX-Routen', weather: 'Wetter', inventory: 'Vorräte', safety: 'Sicherheit',
  documents: 'Dokumente', routeWeather: 'Routenwetter', trips: 'Törne'
};
const FIELD_LABELS = {
  boatName: 'Schiffsname', homePort: 'Heimathafen', boatType: 'Bootstyp', model: 'Baureihe', buildYear: 'Baujahr',
  length: 'Länge', beam: 'Breite', draft: 'Tiefgang', navigationDraft: 'Planungstiefgang', airDraft: 'Durchfahrtshöhe', displacement: 'Verdrängung',
  engine: 'Motor', enginePower: 'Motorleistung', engineYear: 'Motoreinbaujahr', cruiseSpeed: 'Marschfahrt', tankCapacity: 'Tankinhalt', currentTankPercent: 'Tankstand', currentEngineHours: 'Motorstunden',
  tripTitle: 'Törnname', tripStart: 'Törnstart', tripEnd: 'Törnende', defaultCrew: 'Crew', title: 'Titel', startDate: 'Törnstart', endDate: 'Törnende', crew: 'Crew', notes: 'Beschreibung',
  title: 'Titel', date: 'Datum', from: 'Start', to: 'Ziel', fromPort: 'Start', toPort: 'Ziel', nm: 'Seemeilen', distance: 'Strecke',
  wind: 'Wind', wave: 'Welle', tide: 'Tide', weather: 'Wetter', note: 'Notiz', summary: 'Tagesbericht', moment: 'Moment des Tages',
  liters: 'Liter', price: 'Preis', tankPercent: 'Tankstand danach', engineHours: 'Motorstunden', dueDate: 'Fälligkeitsdatum', dueHours: 'Fällig bei Motorstunden',
  tripId: 'Törnzuordnung', rating: 'Gesamtbewertung', ratingFriendly: 'Freundlichkeit', ratingSanitary: 'Sanitär', ratingSupply: 'Versorgung', ratingValue: 'Preis-Leistung',
  quantity: 'Menge', minimum: 'Mindestbestand', status: 'Status', caption: 'Bildunterschrift', featured: 'Titelbild'
};
const BSH_STATIONS = {
  lemwerder: { name: 'Bremen, Oslebshausen (nächstgelegene BSH-Station)', slug: 'bremen_oslebshausen', pdfName: 'Bremen, Oslebshausen' },
  bremerhaven: { name: 'Bremerhaven, Alter Leuchtturm', slug: 'bremerhaven_alter_leuchtturm', pdfName: 'Bremerhaven, Alter Leuchtturm' },
  cuxhaven: { name: 'Cuxhaven, Steubenhöft', slug: 'cuxhaven_steubenhoeft', pdfName: 'Cuxhaven, Steubenhöft' },
  helgoland: { name: 'Helgoland, Binnenhafen', slug: 'helgoland_binnenhafen', pdfName: 'Helgoland, Binnenhafen' }
};

let cachedDeviceIdentity = null;
let realtimeChannel = null;
let realtimeState = 'nicht aktiv';
let pendingServiceWorker = null;
let mediaSyncInProgress = false;
let lastRemoteSummary = null;

function fastHash(input) {
  let hash = 2166136261;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function getDeviceIdentity() {
  if (cachedDeviceIdentity) return cachedDeviceIdentity;
  let row = await metaGet('deviceIdentity');
  if (!row?.deviceId) {
    row = { deviceId: uid(), label: deviceLabel(), createdAt: new Date().toISOString() };
    await metaSet('deviceIdentity', row);
  }
  cachedDeviceIdentity = { id: row.deviceId, label: row.label || deviceLabel() };
  return cachedDeviceIdentity;
}

function localFieldsForStore(store) {
  if (store === 'settings') return new Set(['boatPhoto']);
  if (store === 'photos' || store === 'documents') return LOCAL_MEDIA_FIELDS;
  return new Set();
}

function recordFieldNames(store, ...records) {
  const localOnly = localFieldsForStore(store);
  const fields = new Set();
  for (const record of records) {
    Object.keys(record || {}).forEach(field => {
      if (!RECORD_META_FIELDS.has(field) && !localOnly.has(field)) fields.add(field);
    });
  }
  return [...fields];
}

function fieldTime(record, field, fallback) {
  return safeIso(record?._fieldUpdatedAt?.[field] || record?._updatedAt || fallback);
}

function fieldDevice(record, field, fallback = '') {
  return record?._fieldUpdatedBy?.[field] || record?._updatedBy || fallback;
}

function normalizeRecord(store, record, fallbackTimestamp = '2000-01-01T00:00:00.000Z', fallbackDevice = 'legacy') {
  const source = { ...(record || {}) };
  const timestamp = safeIso(source._updatedAt || fallbackTimestamp);
  const device = source._updatedBy || fallbackDevice;
  const fieldTimes = { ...(source._fieldUpdatedAt || {}) };
  const fieldDevices = { ...(source._fieldUpdatedBy || {}) };
  for (const field of recordFieldNames(store, source)) {
    fieldTimes[field] = fieldTime(source, field, timestamp);
    fieldDevices[field] = fieldDevice(source, field, device);
  }
  return { ...source, _updatedAt: timestamp, _updatedBy: device, _updatedByLabel: source._updatedByLabel || '', _fieldUpdatedAt: fieldTimes, _fieldUpdatedBy: fieldDevices };
}

function logSnapshot(store, record) {
  if (!record) return null;
  const copy = typeof structuredClone === 'function' ? structuredClone(record) : JSON.parse(JSON.stringify(record));
  for (const field of LOCAL_MEDIA_FIELDS) delete copy[field];
  if (store === 'settings') delete copy.boatPhoto;
  if (store === 'weather' || store === 'routeWeather') {
    delete copy.weather; delete copy.marine; delete copy.hours; delete copy.samples;
  }
  return copy;
}

function cleanPayload(store, item) {
  const payload = typeof structuredClone === 'function' ? structuredClone(item || {}) : JSON.parse(JSON.stringify(item || {}));
  for (const field of LOCAL_MEDIA_FIELDS) delete payload[field];
  if (store === 'settings') delete payload.boatPhoto;
  return payload;
}

function changedFieldList(store, before, after) {
  return recordFieldNames(store, before || {}, after || {}).filter(field => valueSignature(before?.[field]) !== valueSignature(after?.[field]));
}

async function appendChangeLog(store, recordId, action, before, after, fields, options = {}) {
  if (NO_CHANGE_LOG_STORES.has(store) || options.skipLog || suppressSyncTracking) return;
  const device = await getDeviceIdentity();
  const now = new Date().toISOString();
  const entry = normalizeRecord('changeLog', {
    id: uid(), store, recordId: String(recordId), action,
    fields: fields || [], before: logSnapshot(store, before), after: logSnapshot(store, after),
    changedAt: now, deviceId: device.id, deviceLabel: device.label, undone: false,
    title: changeEntryTitle(store, before, after)
  }, now, device.id);
  await rawPut('changeLog', entry);
}

function changeEntryTitle(store, before, after) {
  const item = after || before || {};
  if (store === 'settings') return 'Schiffspass der LEEFKE';
  if (store === 'days') return item.title || `${item.fromPort || ''} → ${item.toPort || ''}` || 'Tageslogbuch';
  if (store === 'route') return `${item.from || 'Start'} → ${item.to || 'Ziel'}`;
  if (store === 'ports') return item.name || 'Hafen';
  if (store === 'fuel') return `${item.place || 'Tankvorgang'} · ${item.liters || 0} l`;
  return item.title || item.name || item.item || item.caption || STORE_LABELS[store] || store;
}

async function put(store, value, options = {}) {
  const previous = await getOne(store, value.id);
  let saved = { ...value };
  if (options.remote || suppressSyncTracking || !syncableStores.includes(store)) {
    saved = normalizeRecord(store, saved, options.remoteUpdatedAt || saved._updatedAt || new Date().toISOString(), options.remoteDevice || 'cloud');
    await rawPut(store, saved);
    return saved;
  }

  const device = await getDeviceIdentity();
  const now = new Date().toISOString();
  const previousNormalized = previous ? normalizeRecord(store, previous, previous._updatedAt, previous._updatedBy || 'legacy') : null;
  const base = normalizeRecord(store, { ...(previousNormalized || {}), ...saved }, previousNormalized?._updatedAt || now, device.id);
  const fields = changedFieldList(store, previousNormalized, saved);
  base._fieldUpdatedAt = { ...(previousNormalized?._fieldUpdatedAt || {}), ...(saved._fieldUpdatedAt || {}) };
  base._fieldUpdatedBy = { ...(previousNormalized?._fieldUpdatedBy || {}), ...(saved._fieldUpdatedBy || {}) };
  for (const field of fields) {
    base._fieldUpdatedAt[field] = now;
    base._fieldUpdatedBy[field] = device.id;
  }
  if (!previous || fields.length) {
    base._updatedAt = now;
    base._updatedBy = device.id;
    base._updatedByLabel = device.label;
  }
  await rawPut(store, base);
  await rawDel('syncTombstones', `${store}:${base.id}`);
  if (fields.length || !previous) {
    await appendChangeLog(store, base.id, previous ? 'update' : 'create', previousNormalized, base, fields, options);
    await setDirty(true);
    scheduleSync();
  }
  return base;
}

async function del(store, id, options = {}) {
  const previous = await getOne(store, id);
  await rawDel(store, id);
  if (syncableStores.includes(store) && !options.remote && !suppressSyncTracking) {
    const device = await getDeviceIdentity();
    const updatedAt = new Date().toISOString();
    await rawPut('syncTombstones', {
      id: `${store}:${id}`, recordType: store, recordId: id, updatedAt,
      deviceId: device.id, deviceLabel: device.label, storagePath: previous?.storagePath || ''
    });
    await appendChangeLog(store, id, 'delete', previous, null, recordFieldNames(store, previous || {}), options);
    await setDirty(true);
    scheduleSync();
  }
}


function preferredChecklistRecord(records) {
  return [...records].sort((a, b) => syncTimestamp(b) - syncTimestamp(a))[0] || null;
}

async function cleanupChecklistsV69({ force = false, notify = false } = {}) {
  const marker = await metaGet('checklistCleanupV69');
  if (marker?.completed && !force) return { removed: 0, standardized: 0, customDuplicates: 0 };

  const records = await all('checklists');
  const standardBuckets = new Map(STANDARD_CHECKLIST_ITEMS.map(item => [item.id, []]));
  const customBuckets = new Map();

  for (const record of records) {
    const key = normalizedChecklistKey(record.group, record.item);
    const directStandard = STANDARD_CHECKLIST_BY_KEY.get(key);
    const targetId = directStandard?.id || LEGACY_CHECKLIST_TARGETS.get(key) || (STANDARD_CHECKLIST_BY_ID.has(record.id) ? record.id : '');
    if (targetId && standardBuckets.has(targetId)) {
      standardBuckets.get(targetId).push(record);
      continue;
    }
    const customKey = key || `id:${record.id}`;
    if (!customBuckets.has(customKey)) customBuckets.set(customKey, []);
    customBuckets.get(customKey).push(record);
  }

  let removed = 0;
  let standardized = 0;
  let customDuplicates = 0;

  for (const standard of STANDARD_CHECKLIST_ITEMS) {
    const bucket = standardBuckets.get(standard.id) || [];
    const preferred = preferredChecklistRecord(bucket);
    const done = bucket.some(item => Boolean(item.done));
    const existingCanonical = bucket.find(item => item.id === standard.id);
    const canonical = {
      ...(existingCanonical || preferred || {}),
      id: standard.id,
      group: standard.group,
      item: standard.item,
      done
    };

    const needsPut = !existingCanonical || existingCanonical.group !== standard.group ||
      existingCanonical.item !== standard.item || Boolean(existingCanonical.done) !== done;
    if (needsPut) {
      await put('checklists', canonical, { skipLog: true });
      standardized += 1;
    }

    for (const record of bucket) {
      if (record.id === standard.id) continue;
      await del('checklists', record.id, { skipLog: true });
      removed += 1;
    }
  }

  for (const bucket of customBuckets.values()) {
    if (bucket.length < 2) continue;
    const keep = preferredChecklistRecord(bucket);
    const mergedDone = bucket.some(item => Boolean(item.done));
    if (keep && Boolean(keep.done) !== mergedDone) {
      await put('checklists', { ...keep, done: mergedDone }, { skipLog: true });
    }
    for (const record of bucket) {
      if (!keep || record.id === keep.id) continue;
      await del('checklists', record.id, { skipLog: true });
      removed += 1;
      customDuplicates += 1;
    }
  }

  await metaSet('checklistCleanupV69', {
    completed: true,
    completedAt: new Date().toISOString(),
    removed,
    standardized,
    customDuplicates
  });
  if (notify) {
    const message = removed
      ? `${removed} doppelte oder überholte Prüfpunkt${removed === 1 ? '' : 'e'} entfernt.`
      : 'Die Checklisten sind bereits sauber.';
    toast(message);
  }
  return { removed, standardized, customDuplicates };
}
window.cleanupChecklistsV69 = cleanupChecklistsV69;

async function migrateLocalTimestamps() {
  const device = await getDeviceIdentity();
  for (const store of syncableStores) {
    const items = await all(store);
    for (const item of items) {
      const fallback = item._updatedAt || (item.created ? new Date(Number(item.created)).toISOString() : '2000-01-01T00:00:00.000Z');
      await rawPut(store, normalizeRecord(store, item, fallback, item._updatedBy || device.id));
    }
  }
}

function maxRecordTimestamp(record) {
  const times = [record?._updatedAt, ...Object.values(record?._fieldUpdatedAt || {})].map(value => Date.parse(value || 0) || 0);
  return Math.max(...times, 0);
}

function cloudRowFromRecord(store, item, userId) {
  const normalized = normalizeRecord(store, item, item?._updatedAt, item?._updatedBy || 'legacy');
  return {
    user_id: userId,
    record_type: store,
    record_id: String(normalized.id),
    payload: cleanPayload(store, normalized),
    updated_at: new Date(maxRecordTimestamp(normalized) || Date.now()).toISOString(),
    deleted_at: null
  };
}

function unifiedRemoteRows(remoteRows) {
  const rows = remoteRows.filter(row => row.record_type !== SETTINGS_FIELD_RECORD_TYPE);
  const map = new Map(rows.map(row => [`${row.record_type}:${row.record_id}`, { ...row }]));
  const legacySettings = rows.filter(row => row.record_type === 'settings' && row.record_id === 'main' && !row.deleted_at).sort((a,b) => remoteTimestamp(b)-remoteTimestamp(a))[0] || null;
  let settingsPayload = legacySettings?.payload ? { ...legacySettings.payload } : null;
  let settingsUpdated = legacySettings?.updated_at || '2000-01-01T00:00:00.000Z';
  for (const row of remoteRows) {
    if (row.record_type !== SETTINGS_FIELD_RECORD_TYPE || row.deleted_at) continue;
    settingsPayload ||= { id: 'main', _fieldUpdatedAt: {}, _fieldUpdatedBy: {} };
    settingsPayload._fieldUpdatedAt ||= {};
    settingsPayload._fieldUpdatedBy ||= {};
    const currentTime = Date.parse(settingsPayload._fieldUpdatedAt[row.record_id] || 0) || 0;
    if (remoteTimestamp(row) >= currentTime) {
      settingsPayload[row.record_id] = row.payload?.value;
      settingsPayload._fieldUpdatedAt[row.record_id] = row.updated_at;
      settingsPayload._fieldUpdatedBy[row.record_id] = row.payload?.deviceId || 'legacy-cloud';
      settingsUpdated = new Date(Math.max(Date.parse(settingsUpdated) || 0, remoteTimestamp(row))).toISOString();
    }
  }
  if (settingsPayload) {
    map.set('settings:main', {
      user_id: currentSession?.user?.id,
      record_type: 'settings', record_id: 'main', payload: settingsPayload,
      updated_at: settingsUpdated, deleted_at: null
    });
  }
  return [...map.values()];
}

async function createConflict(store, recordId, field, local, remote, localTime, remoteTime, localDevice, remoteDevice, winner) {
  if (NO_CONFLICT_STORES.has(store)) return;
  const lastSync = await metaGet('lastSync');
  const lastSyncTs = Date.parse(lastSync?.at || 0) || 0;
  if (Date.parse(localTime) <= lastSyncTs || Date.parse(remoteTime) <= lastSyncTs) return;
  if (!localDevice || !remoteDevice || localDevice === remoteDevice) return;
  if (Math.abs(Date.parse(localTime) - Date.parse(remoteTime)) > CONFLICT_WINDOW_MS) return;
  const id = `conflict:${fastHash(`${store}|${recordId}|${field}|${localTime}|${remoteTime}`)}`;
  if (await getOne('conflicts', id)) return;
  const device = await getDeviceIdentity();
  const now = new Date().toISOString();
  await rawPut('conflicts', normalizeRecord('conflicts', {
    id, store, recordId: String(recordId), field, localValue: local, remoteValue: remote,
    localTime, remoteTime, localDevice, remoteDevice, autoWinner: winner,
    status: 'open', createdAt: now
  }, now, device.id));
}

async function mergeRecordFieldwise(store, localRaw, remoteRaw, remoteUpdatedAt) {
  const local = normalizeRecord(store, localRaw, localRaw?._updatedAt, localRaw?._updatedBy || 'local');
  const remote = normalizeRecord(store, remoteRaw, remoteUpdatedAt, remoteRaw?._updatedBy || 'cloud');
  const merged = { ...local, id: local.id || remote.id, _fieldUpdatedAt: { ...local._fieldUpdatedAt }, _fieldUpdatedBy: { ...local._fieldUpdatedBy } };
  const localOnly = localFieldsForStore(store);
  for (const field of recordFieldNames(store, local, remote)) {
    const localHas = Object.prototype.hasOwnProperty.call(local, field);
    const remoteHas = Object.prototype.hasOwnProperty.call(remoteRaw || {}, field);
    if (!remoteHas) continue;
    const lt = fieldTime(local, field, local._updatedAt);
    const rt = fieldTime(remote, field, remoteUpdatedAt);
    const lv = local[field];
    const rv = remote[field];
    const differs = valueSignature(lv) !== valueSignature(rv);
    if (differs) {
      const remoteWins = !localHas || Date.parse(rt) > Date.parse(lt) || (Date.parse(rt) === Date.parse(lt) && String(fieldDevice(remote, field, 'cloud')) > String(fieldDevice(local, field, 'local')));
      await createConflict(store, merged.id, field, lv, rv, lt, rt, fieldDevice(local, field, 'local'), fieldDevice(remote, field, 'cloud'), remoteWins ? 'remote' : 'local');
      if (remoteWins) {
        merged[field] = rv;
        merged._fieldUpdatedAt[field] = rt;
        merged._fieldUpdatedBy[field] = fieldDevice(remote, field, 'cloud');
      }
    } else if (Date.parse(rt) > Date.parse(lt)) {
      merged._fieldUpdatedAt[field] = rt;
      merged._fieldUpdatedBy[field] = fieldDevice(remote, field, 'cloud');
    }
  }
  for (const field of localOnly) if (localRaw?.[field] !== undefined) merged[field] = localRaw[field];
  const latest = Math.max(maxRecordTimestamp(local), maxRecordTimestamp(remote));
  merged._updatedAt = new Date(latest || Date.now()).toISOString();
  const newestField = Object.entries(merged._fieldUpdatedAt || {}).sort((a,b) => Date.parse(b[1])-Date.parse(a[1]))[0]?.[0];
  merged._updatedBy = newestField ? merged._fieldUpdatedBy[newestField] : (local._updatedBy || remote._updatedBy);
  merged._updatedByLabel = local._updatedByLabel || remote._updatedByLabel || '';
  return merged;
}

async function createAutoBackup(reason = 'Automatische Sicherung', force = false) {
  const existing = await all('autoBackups');
  if (!force) {
    const recent = existing.sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
    if (recent && reason === 'Vor Synchronisierung' && Date.now() - Date.parse(recent.createdAt) < AUTO_BACKUP_SYNC_GAP_MS) return recent;
  }
  const backup = { app: 'LEEFKE Bordbuch', version: APP_VERSION, createdAt: new Date().toISOString(), reason, stores: {} };
  for (const store of stores.filter(name => name !== 'autoBackups')) backup.stores[store] = await all(store);
  let json = JSON.stringify(backup);
  let mediaOmitted = false;
  if (json.length > 20_000_000) {
    backup.stores.photos = (backup.stores.photos || []).map(item => ({ ...item, data: undefined }));
    backup.stores.documents = (backup.stores.documents || []).map(item => ({ ...item, data: undefined }));
    backup.note = 'Medieninhalte wegen Größe ausgelassen; Metadaten und Cloud-Pfade sind enthalten.';
    json = JSON.stringify(backup);
    mediaOmitted = true;
  }
  const row = { id: uid(), createdAt: backup.createdAt, reason, version: APP_VERSION, size: json.length, mediaOmitted, data: json };
  await rawPut('autoBackups', row);
  const updated = [...existing, row].sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
  for (const old of updated.slice(AUTO_BACKUP_LIMIT)) await rawDel('autoBackups', old.id);
  return row;
}

async function restoreAutoBackup(id) {
  const row = await getOne('autoBackups', id);
  if (!row || !confirm(`Sicherungspunkt „${row.reason}“ vom ${new Date(row.createdAt).toLocaleString('de-DE')} wiederherstellen?`)) return;
  const backup = JSON.parse(row.data);
  suppressSyncTracking = true;
  try {
    for (const store of stores.filter(name => name !== 'autoBackups')) {
      await rawClear(store);
      for (const item of backup.stores?.[store] || []) await rawPut(store, item);
    }
  } finally { suppressSyncTracking = false; }
  await setDirty(true);
  await refresh();
  scheduleSync(300);
  toast('Sicherungspunkt wiederhergestellt');
}

function downloadAutoBackup(id) {
  getOne('autoBackups', id).then(row => {
    if (!row) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([row.data], { type: 'application/json' }));
    link.download = `LEEFKE_Autosicherung_${row.createdAt.slice(0,10)}_${fastHash(row.id)}.json`;
    link.click(); URL.revokeObjectURL(link.href);
  });
}

async function removeAutoBackup(id) {
  await rawDel('autoBackups', id); await refresh();
}
window.restoreAutoBackup = restoreAutoBackup;
window.downloadAutoBackup = downloadAutoBackup;
window.removeAutoBackup = removeAutoBackup;

function dataUrlToBlob(dataUrl) {
  const [header, data] = String(dataUrl).split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'application/octet-stream';
  const bytes = atob(data || '');
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: mime });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
  });
}

function compressImage(file, maxDimension = 1800, quality = .82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function safeFilename(name) {
  return String(name || 'datei').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-80);
}

async function mediaUploadRecord(store, item) {
  if (!supabaseClient || !currentSession?.user?.id || !item.data) return item;
  const folder = store === 'photos' ? 'photos' : 'documents';
  const extension = item.mimeType?.includes('pdf') ? 'pdf' : item.mimeType?.includes('png') ? 'png' : 'jpg';
  const path = item.storagePath || `${currentSession.user.id}/${folder}/${item.id}-${safeFilename(item.fileName || item.caption || item.title || 'leefke')}.${extension}`;
  const blob = dataUrlToBlob(item.data);
  const { error } = await supabaseClient.storage.from(MEDIA_BUCKET).upload(path, blob, { upsert: true, contentType: item.mimeType || blob.type, cacheControl: '3600' });
  if (error) throw error;
  const updated = { ...item, storagePath: path, _mediaCloudAt: new Date().toISOString(), _cloudState: 'synced' };
  await rawPut(store, updated);
  return updated;
}

async function mediaDownloadRecord(store, item) {
  if (!supabaseClient || !item.storagePath || item.data) return item;
  const { data, error } = await supabaseClient.storage.from(MEDIA_BUCKET).download(item.storagePath);
  if (error) throw error;
  const updated = { ...item, data: await blobToDataUrl(data), _cloudState: 'synced' };
  await rawPut(store, updated);
  return updated;
}

async function syncBoatPhoto() {
  const settings = await getOne('settings', 'main');
  if (!settings || !supabaseClient || !currentSession?.user?.id) return;
  let updated = { ...settings };
  if (settings.boatPhoto && (!settings.boatPhotoStoragePath || Date.parse(settings._mediaUpdatedAt || 0) > Date.parse(settings._mediaCloudAt || 0))) {
    const path = settings.boatPhotoStoragePath || `${currentSession.user.id}/boat/leefke-startbild.jpg`;
    const { error } = await supabaseClient.storage.from(MEDIA_BUCKET).upload(path, dataUrlToBlob(settings.boatPhoto), { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
    if (error) throw error;
    updated = { ...updated, boatPhotoStoragePath: path, _mediaCloudAt: new Date().toISOString() };
    await rawPut('settings', updated);
  } else if (!settings.boatPhoto && settings.boatPhotoStoragePath) {
    const { data, error } = await supabaseClient.storage.from(MEDIA_BUCKET).download(settings.boatPhotoStoragePath);
    if (!error && data) {
      updated.boatPhoto = await blobToDataUrl(data);
      await rawPut('settings', updated);
    }
  }
}

async function processMediaDeletes() {
  const tombstones = await all('syncTombstones');
  const paths = tombstones.filter(item => item.storagePath).map(item => item.storagePath);
  if (paths.length && supabaseClient) {
    const { error } = await supabaseClient.storage.from(MEDIA_BUCKET).remove(paths);
    if (error) console.warn('Medien konnten nicht vollständig gelöscht werden.', error);
  }
}

async function syncMedia(options = {}) {
  if (mediaSyncInProgress || !navigator.onLine || !currentSession || !supabaseClient) return;
  const settings = getSettings();
  if (options.manual !== true && settings.photoAutoSync === false) return;
  mediaSyncInProgress = true;
  try {
    await processMediaDeletes();
    for (const store of ['photos', 'documents']) {
      for (const item of await all(store)) {
        try {
          if (item.data && (!item.storagePath || Date.parse(item._mediaUpdatedAt || item._updatedAt || 0) > Date.parse(item._mediaCloudAt || 0))) await mediaUploadRecord(store, item);
          else if (!item.data && item.storagePath) await mediaDownloadRecord(store, item);
        } catch (error) {
          console.warn(`Medienabgleich ${store}/${item.id} fehlgeschlagen`, error);
          await rawPut(store, { ...item, _cloudState: 'error' });
        }
      }
    }
    await syncBoatPhoto();
  } finally { mediaSyncInProgress = false; }
}

async function localRows() {
  const rows = [];
  for (const store of syncableStores) {
    for (const item of await all(store)) rows.push(cloudRowFromRecord(store, item, currentSession.user.id));
  }
  return rows;
}

async function syncNow(options = {}) {
  if (syncInProgress) { syncRequested = true; return; }
  if (!supabaseClient || !currentSession?.user?.id || !navigator.onLine) { await updateSyncUI(); return; }
  const linked = await isLinkedForCurrentUser();
  if (!linked && !options.force) { await connectDeviceAutomatically({ silent: options.silent }); return; }
  syncInProgress = true;
  syncVisualInProgress = !options.silent;
  const dirtyAtStart = await metaGet('dirty');
  if (syncVisualInProgress) await updateSyncUI();
  if (!options.silent) setMessage('#syncMessage', 'LEEFKE-Daten werden feldweise abgeglichen …');
  let remoteChangedLocal = false;
  try {
    await createAutoBackup('Vor Synchronisierung');
    const userId = currentSession.user.id;
    const fetched = await fetchRemoteRecords();
    const rawRemoteMap = new Map(fetched.map(row => [`${row.record_type}:${row.record_id}`, row]));
    const remote = unifiedRemoteRows(fetched);
    const remoteMap = new Map(remote.map(row => [`${row.record_type}:${row.record_id}`, row]));
    const tombstones = await all('syncTombstones');
    const tombMap = new Map(tombstones.map(item => [item.id, item]));
    suppressSyncTracking = true;
    try {
      for (const row of remote) {
        if (!syncableStores.includes(row.record_type)) continue;
        const key = `${row.record_type}:${row.record_id}`;
        const local = await getOne(row.record_type, row.record_id);
        const localTs = maxRecordTimestamp(local);
        const tombTs = Date.parse(tombMap.get(key)?.updatedAt || 0) || 0;
        const remoteTs = remoteTimestamp(row);
        if (row.deleted_at) {
          if (remoteTs >= Math.max(localTs, tombTs)) {
            if (local) remoteChangedLocal = true;
            await rawDel(row.record_type, row.record_id);
            await rawDel('syncTombstones', key);
          }
          continue;
        }
        const remotePayload = normalizeRecord(row.record_type, { ...(row.payload || {}), id: row.record_id }, row.updated_at, row.payload?._updatedBy || 'cloud');
        if (!local) {
          await rawPut(row.record_type, remotePayload);
          remoteChangedLocal = true;
        } else {
          const merged = await mergeRecordFieldwise(row.record_type, local, remotePayload, row.updated_at);
          const recordChanged = comparablePayload(row.record_type, local) !== comparablePayload(row.record_type, merged);
          const visibleChanged = visibleComparablePayload(row.record_type, local) !== visibleComparablePayload(row.record_type, merged);
          if (recordChanged) await rawPut(row.record_type, merged);
          if (visibleChanged) remoteChangedLocal = true;
        }
        if (remoteTs > tombTs) await rawDel('syncTombstones', key);
      }
    } finally { suppressSyncTracking = false; }

    const outgoing = [];
    for (const store of syncableStores) {
      for (const item of await all(store)) {
        const key = `${store}:${item.id}`;
        const remoteRow = remoteMap.get(key);
        const row = cloudRowFromRecord(store, item, userId);
        const differs = !remoteRow || comparablePayload(store, row.payload) !== comparablePayload(store, remoteRow.payload || {});
        if (differs || Date.parse(row.updated_at) > remoteTimestamp(remoteRow)) outgoing.push(row);
      }
    }

    // Schiffsdaten zusätzlich als einzelne Cloud-Datensätze übertragen.
    // Damit können alte Feld-Datensätze (z. B. für die Bootslänge) keinen
    // neueren Wert aus dem Schiffspass mehr zurücküberschreiben.
    const currentSettingsForFields = await getOne('settings', 'main');
    if (currentSettingsForFields) {
      for (const fieldRow of settingsFieldCloudRowsV610(currentSettingsForFields, userId)) {
        const remoteField = rawRemoteMap.get(`${SETTINGS_FIELD_RECORD_TYPE}:${fieldRow.record_id}`);
        const differs = !remoteField || valueSignature(remoteField.payload?.value) !== valueSignature(fieldRow.payload?.value);
        if (differs || Date.parse(fieldRow.updated_at) > remoteTimestamp(remoteField)) outgoing.push(fieldRow);
      }
    }

    const pendingTombstones = await all('syncTombstones');
    for (const tombstone of pendingTombstones) {
      const remoteRow = remoteMap.get(tombstone.id);
      const tombTs = Date.parse(tombstone.updatedAt) || 0;
      if (!remoteRow || tombTs >= remoteTimestamp(remoteRow) || !remoteRow.deleted_at) {
        outgoing.push({ user_id: userId, record_type: tombstone.recordType, record_id: String(tombstone.recordId), payload: { deviceId: tombstone.deviceId, deviceLabel: tombstone.deviceLabel }, updated_at: safeIso(tombstone.updatedAt), deleted_at: safeIso(tombstone.updatedAt) });
      }
    }
    await upsertRows(outgoing);
    await syncMedia({ manual: false });
    // Medienpfade nach dem Upload noch einmal übertragen.
    const mediaRows = [];
    for (const store of ['photos', 'documents', 'settings']) for (const item of await all(store)) mediaRows.push(cloudRowFromRecord(store, item, userId));
    const settingsAfterMedia = await getOne('settings', 'main');
    if (settingsAfterMedia) mediaRows.push(...settingsFieldCloudRowsV610(settingsAfterMedia, userId));
    await upsertRows(mediaRows);
    for (const tombstone of pendingTombstones) await rawDel('syncTombstones', tombstone.id);
    const dirtyNow = await metaGet('dirty');
    if (!dirtyNow?.value || dirtyNow.changedAt === dirtyAtStart?.changedAt) await setDirty(false); else syncRequested = true;
    const now = new Date().toISOString();
    await metaSet('lastSync', { at: now });
    lastRemoteSummary = { records: remote.length, outgoing: outgoing.length, checkedAt: now };
    await registerDeviceHeartbeat();
    // Ein stiller Hintergrundabgleich rendert die gesamte App nur neu, wenn
    // wirklich Daten von einem anderen Gerät übernommen wurden. Dadurch
    // bleibt die Oberfläche ruhig und flackert nicht im 60-Sekunden-Takt.
    if (!options.silent || remoteChangedLocal) await refresh();
    else await updateSyncUI();
    if (!options.silent) setMessage('#syncMessage', outgoing.length ? `${outgoing.length} Änderung(en) abgeglichen. Alle Felder wurden einzeln geprüft.` : 'Alle LEEFKE-Daten sind auf demselben Stand.', 'success');
  } catch (error) {
    suppressSyncTracking = false;
    console.error('Synchronisierung fehlgeschlagen', error);
    await setDirty(true);
    const storageHint = /bucket|storage|row-level|policy|not found/i.test(String(error?.message || '')) ? ' Bitte die SQL-Datei „SUPABASE_SETUP_V6.sql“ einmal in Supabase ausführen.' : '';
    setMessage('#syncMessage', `Synchronisierung fehlgeschlagen: ${readableAuthError(error)}${storageHint}`, 'error');
  } finally {
    syncInProgress = false;
    syncVisualInProgress = false;
    await updateSyncUI();
    if (syncRequested) { syncRequested = false; scheduleSync(250, { silent: true, reason: 'follow-up' }); }
  }
}

async function registerDeviceHeartbeat() {
  if (!currentSession?.user?.id || !supabaseClient || !navigator.onLine) return;
  if (!await isLinkedForCurrentUser()) return;
  const device = await getDeviceIdentity();
  const existing = await getOne('devices', device.id);
  const lastSeen = Date.parse(existing?.lastSeenAt || 0) || 0;
  if (Date.now() - lastSeen < 5 * 60 * 1000 && existing?.appVersion === APP_VERSION) return;
  const now = new Date().toISOString();
  const record = normalizeRecord('devices', {
    ...(existing || {}), id: device.id, label: device.label,
    lastSeenAt: now, appVersion: APP_VERSION
  }, now, device.id);
  await rawPut('devices', record);
  const { error } = await supabaseClient.from('leefke_records').upsert(
    [cloudRowFromRecord('devices', record, currentSession.user.id)],
    { onConflict: 'user_id,record_type,record_id' }
  );
  if (error) throw error;
}

function stopRealtimeSubscription() {
  if (realtimeChannel && supabaseClient) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = null; realtimeState = 'nicht aktiv';
}

function startRealtimeSubscription() {
  stopRealtimeSubscription();
  if (!supabaseClient || !currentSession?.user?.id || !navigator.onLine) return;
  if (realtimeState !== 'verbindet …') {
    realtimeState = 'verbindet …';
    queueSyncUIUpdate();
  }
  realtimeChannel = supabaseClient.channel(`leefke-records-${currentSession.user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leefke_records', filter: `user_id=eq.${currentSession.user.id}` }, payload => {
      const sourceDevice = payload?.new?.payload?._updatedBy || payload?.old?.payload?._updatedBy;
      getDeviceIdentity().then(device => {
        if (sourceDevice !== device.id) scheduleSync(220, { silent: true, reason: 'realtime' });
      });
    })
    .subscribe(status => {
      const nextState = status === 'SUBSCRIBED' ? 'verbunden' : status === 'CHANNEL_ERROR' ? 'Fehler' : status === 'TIMED_OUT' ? 'Zeitüberschreitung' : String(status || '').toLowerCase();
      if (nextState !== realtimeState) {
        realtimeState = nextState;
        queueSyncUIUpdate();
      }
    });
}

async function verifySyncState() {
  if (!currentSession || !navigator.onLine) return setMessage('#syncMessage', 'Für die Prüfung wird eine Internetverbindung benötigt.', 'error');
  setMessage('#syncMessage', 'Lokalen und gemeinsamen Datenstand prüfen …');
  try {
    const remoteRows = unifiedRemoteRows(await fetchRemoteRecords());
    const remoteMap = new Map(remoteRows.filter(row => !row.deleted_at).map(row => [`${row.record_type}:${row.record_id}`, row]));
    let differences = 0; let localCount = 0;
    for (const store of syncableStores) for (const item of await all(store)) {
      localCount += 1;
      const remote = remoteMap.get(`${store}:${item.id}`);
      if (!remote || comparablePayload(store, cleanPayload(store, item)) !== comparablePayload(store, remote.payload || {})) differences += 1;
    }
    const openConflicts = (await all('conflicts')).filter(item => item.status === 'open').length;
    setMessage('#syncMessage', differences === 0 && openConflicts === 0 ? `Prüfung erfolgreich: ${localCount} Datensätze stimmen mit der Cloud überein.` : `${differences} Datenabweichung(en), ${openConflicts} offener Konflikt(e). Bitte jetzt vollständig abgleichen.`, differences ? 'error' : 'success');
  } catch (error) { setMessage('#syncMessage', `Prüfung fehlgeschlagen: ${readableAuthError(error)}`, 'error'); }
}

async function updateSyncUI() {
  const renderToken = ++syncUiRenderToken;
  applyGuestModeUI();
  if (IS_GUEST_MODE) {
    const setText = (selector, value) => { const element = $(selector); if (element && element.textContent !== String(value)) element.textContent = String(value); };
    const setHidden = (selector, value) => { const element = $(selector); if (element) element.hidden = Boolean(value); };
    setHidden('#authLoggedOut', true);
    setHidden('#authLoggedIn', true);
    setHidden('#guestModePanel', false);
    setHidden('#guestEntryCard', true);
    setHidden('#syncExplainCard', true);
    setHidden('#initialSyncPanel', true);
    setText('#syncStatusButton', 'Gastmodus');
    const statusButton = $('#syncStatusButton');
    if (statusButton) statusButton.className = 'status sync-status guest';
    setText('#syncStatusText', 'Lokale, getrennte Vorführversion');
    return;
  }
  const loggedIn = Boolean(currentSession?.user);
  const linked = loggedIn ? await isLinkedForCurrentUser() : false;
  const dirty = Boolean((await metaGet('dirty'))?.value);
  const lastSync = await metaGet('lastSync');
  const tombstones = await all('syncTombstones');
  const conflicts = (await all('conflicts')).filter(item => item.status === 'open');
  const device = loggedIn ? await getDeviceIdentity() : null;

  // Mehrere Realtime-/Timer-Ereignisse können fast gleichzeitig eintreffen.
  // Nur der jüngste vollständige UI-Lauf darf die Anzeige aktualisieren.
  if (renderToken !== syncUiRenderToken) return;

  const setText = (selector, value) => {
    const element = typeof selector === 'string' ? $(selector) : selector;
    const text = String(value ?? '');
    if (element && element.textContent !== text) element.textContent = text;
  };
  const setHidden = (selector, value) => {
    const element = typeof selector === 'string' ? $(selector) : selector;
    if (element && element.hidden !== Boolean(value)) element.hidden = Boolean(value);
  };
  const setClass = (element, value) => {
    if (element && element.className !== value) element.className = value;
  };

  const statusButton = $('#syncStatusButton');
  const statusText = $('#syncStatusText');
  setHidden('#guestModePanel', true);
  setHidden('#guestEntryCard', false);
  setHidden('#syncExplainCard', false);
  setHidden('#authLoggedOut', loggedIn);
  setHidden('#authLoggedIn', !loggedIn);
  setHidden('#initialSyncPanel', !(loggedIn && !linked));
  setText('#accountEmail', currentSession?.user?.email || '—');
  setText('#lastSyncText', lastSync?.at ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastSync.at)) : '—');
  setText('#deviceNameText', device?.label || 'Dieses Gerät');
  setText('#realtimeStatusText', loggedIn ? realtimeState : 'Nicht angemeldet');
  setText('#pendingChangesText', dirty || tombstones.length ? `${tombstones.length} Löschung(en) / Änderungen warten` : 'Keine');
  setText('#syncConflictText', String(conflicts.length));
  setText('#autoSyncText', loggedIn && linked ? (navigator.onLine ? 'Echtzeit + ruhige Sicherheitsprüfung alle 60 Sekunden' : 'Wartet auf Internet') : 'Noch nicht aktiv');

  let label = 'Nicht angemeldet';
  let detail = 'Cloud-Synchronisierung ist nicht aktiv';
  let className = 'sync-status logged-out';
  if (loggedIn && !navigator.onLine) {
    label = 'Offline';
    detail = dirty ? 'Änderungen warten auf Internet' : 'Offline – letzter Stand bleibt verfügbar';
    className = 'sync-status offline';
  } else if (loggedIn && !linked) {
    label = deviceConnectInProgress ? 'Verbinde Gerät …' : 'Gerät verbinden';
    detail = 'Lokale und gemeinsame Daten werden automatisch zusammengeführt';
    className = 'sync-status attention';
  } else if (syncVisualInProgress) {
    label = 'Abgleich läuft …';
    detail = 'Felder, Löschungen und Medien werden abgeglichen';
    className = 'sync-status working';
  } else if (conflicts.length) {
    label = `${conflicts.length} Konflikt${conflicts.length === 1 ? '' : 'e'}`;
    detail = 'Bitte im Änderungsverlauf entscheiden';
    className = 'sync-status attention';
  } else if (loggedIn && dirty) {
    label = 'Abgleich offen';
    detail = 'Lokale Änderungen werden im Hintergrund übertragen';
    className = 'sync-status attention';
  } else if (loggedIn) {
    const lastSyncClock = lastSync?.at ? new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(lastSync.at)) : '';
    label = `Synchronisiert${lastSyncClock ? ` · ${lastSyncClock}` : ''}`;
    detail = realtimeState === 'verbunden' ? 'Live verbunden · Änderungen anderer Geräte kommen automatisch an' : 'Alle Geräte arbeiten gleichberechtigt';
    className = 'sync-status synced';
  }

  setText(statusButton, label);
  setClass(statusButton, `status ${className}`);
  setText(statusText, detail);
  const badge = $('#conflictNavBadge');
  if (badge) {
    setHidden(badge, conflicts.length === 0);
    setText(badge, String(conflicts.length));
  }
  await updateVacationUi({ loggedIn, linked, dirty, lastSync, conflicts, tombstones });
}

function formatChangeValue(value) {
  if (value === null || value === undefined || value === '') return 'leer';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 140);
  return String(value).slice(0, 180);
}

function renderHistory() {
  const conflicts = [...(state.conflicts || [])].filter(item => item.status === 'open').sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const logs = [...(state.changeLog || [])].sort((a,b) => Date.parse(b.changedAt)-Date.parse(a.changedAt));
  const today = dateInputValue();
  $('#openConflictCount').textContent = conflicts.length;
  $('#changesTodayCount').textContent = logs.filter(item => String(item.changedAt).startsWith(today)).length;
  $('#lastChangeDevice').textContent = logs[0]?.deviceLabel || '—';
  $('#lastChangeTime').textContent = logs[0]?.changedAt ? new Date(logs[0].changedAt).toLocaleString('de-DE') : '—';
  $('#conflictList').innerHTML = conflicts.map(item => `<div class="conflict-entry"><div class="conflict-icon">!</div><div><h4>${esc(STORE_LABELS[item.store] || item.store)} · ${esc(FIELD_LABELS[item.field] || item.field)}</h4><p>${esc(item.recordId)} · automatisch wurde zunächst „${item.autoWinner === 'remote' ? 'Cloud' : 'dieses Gerät'}“ verwendet.</p><div class="conflict-values"><div><small>${esc(item.localDevice || 'Gerät')} · ${new Date(item.localTime).toLocaleString('de-DE')}</small><strong>${esc(formatChangeValue(item.localValue))}</strong></div><div><small>${esc(item.remoteDevice || 'Cloud')} · ${new Date(item.remoteTime).toLocaleString('de-DE')}</small><strong>${esc(formatChangeValue(item.remoteValue))}</strong></div></div></div><div class="actions"><button onclick="resolveConflict('${item.id}','local')">Linken Wert nehmen</button><button class="primary" onclick="resolveConflict('${item.id}','remote')">Rechten Wert nehmen</button></div></div>`).join('') || '<div class="empty-state">Keine offenen Konflikte. Alle Eingaben konnten eindeutig zusammengeführt werden.</div>';
  const filter = $('#historyStoreFilter')?.value || '';
  const filtered = filter ? logs.filter(item => item.store === filter) : logs;
  const historySummary = $('#changeLogSummaryText');
  if (historySummary) historySummary.textContent = filtered.length ? `Änderungsprotokoll anzeigen (${filtered.length} Einträge)` : 'Änderungsprotokoll anzeigen';
  $('#changeLogList').innerHTML = filtered.slice(0, 80).map(item => {
    const fields = (item.fields || []).slice(0, 5).map(field => FIELD_LABELS[field] || field).join(', ');
    const icon = item.action === 'delete' ? '×' : item.action === 'create' ? '+' : '✎';
    return `<div class="change-entry"><div class="change-icon">${icon}</div><div><h4>${esc(item.title || STORE_LABELS[item.store] || item.store)}</h4><p>${esc(STORE_LABELS[item.store] || item.store)} · ${item.action === 'create' ? 'angelegt' : item.action === 'delete' ? 'gelöscht' : 'geändert'}${fields ? `: ${esc(fields)}` : ''}</p><p>${esc(item.deviceLabel || item.deviceId || 'Gerät')} · ${new Date(item.changedAt).toLocaleString('de-DE')}${item.undone ? ' · rückgängig gemacht' : ''}</p></div><div class="actions">${!item.undone ? `<button onclick="undoChange('${item.id}')">Rückgängig</button>` : ''}</div></div>`;
  }).join('') || '<div class="empty-state">Noch keine Änderungen protokolliert.</div>';
}

async function resolveConflict(id, choice) {
  const conflict = await getOne('conflicts', id); if (!conflict) return;
  const record = await getOne(conflict.store, conflict.recordId); if (!record) return;
  const value = choice === 'local' ? conflict.localValue : conflict.remoteValue;
  await put(conflict.store, { ...record, [conflict.field]: value });
  await put('conflicts', { ...conflict, status: 'resolved', resolution: choice, resolvedAt: new Date().toISOString() }, { skipLog: true });
  await refresh(); toast('Konflikt entschieden');
}
window.resolveConflict = resolveConflict;

async function undoChange(id) {
  const entry = await getOne('changeLog', id); if (!entry || entry.undone) return;
  if (!confirm('Diese Änderung rückgängig machen? Die Rücknahme wird selbst wieder synchronisiert.')) return;
  if (entry.action === 'create') await del(entry.store, entry.recordId, { skipLog: true });
  else if (entry.action === 'delete' && entry.before) await put(entry.store, entry.before, { skipLog: true });
  else if (entry.before) await put(entry.store, entry.before, { skipLog: true });
  await rawPut('changeLog', { ...entry, undone: true, undoneAt: new Date().toISOString() });
  await setDirty(true); scheduleSync(300); await refresh(); toast('Änderung rückgängig gemacht');
}
window.undoChange = undoChange;

async function undoLastOwnChange() {
  const device = await getDeviceIdentity();
  const entry = [...(state.changeLog || [])].filter(item => item.deviceId === device.id && !item.undone).sort((a,b) => Date.parse(b.changedAt)-Date.parse(a.changedAt))[0];
  if (!entry) return toast('Keine eigene Änderung zum Rückgängigmachen');
  undoChange(entry.id);
}

function daysUntil(date) { return date ? Math.ceil((new Date(`${date}T12:00:00`) - new Date()) / 86400000) : null; }

function renderOperations() {
  const inventory = [...(state.inventory || [])].sort((a,b) => String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name)));
  const safety = [...(state.safety || [])].sort((a,b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
  const documents = [...(state.documents || [])].sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
  const low = inventory.filter(item => num(item.minimum) > 0 && num(item.quantity) < num(item.minimum));
  const due = safety.filter(item => item.status !== 'ok' || (daysUntil(item.dueDate) !== null && daysUntil(item.dueDate) <= 30));
  $('#inventoryLowCount').textContent = low.length; $('#safetyDueCount').textContent = due.length; $('#documentCount').textContent = documents.length; $('#operationMaintCount').textContent = state.maintenance.filter(item => !item.done).length;
  $('#inventoryList').innerHTML = inventory.map(item => { const isLow = num(item.minimum) > 0 && num(item.quantity) < num(item.minimum); return `<div class="inventory-row ${isLow ? 'low' : ''}"><div><strong>${esc(item.name)}</strong><small>${esc(item.category || '')}${item.location ? ` · ${esc(item.location)}` : ''}${item.note ? ` · ${esc(item.note)}` : ''}</small></div><div><span class="stock-chip ${isLow ? 'low' : 'ok'}">${dec2(item.quantity)} ${esc(item.unit || '')}</span><div class="actions"><button onclick="editOperation('inventory','${item.id}')">Bearbeiten</button><button onclick="removeItem('inventory','${item.id}')">×</button></div></div></div>`; }).join('') || '<div class="empty-state">Noch keine Vorräte eingetragen.</div>';
  $('#safetyList').innerHTML = safety.map(item => { const remaining = daysUntil(item.dueDate); const isDue = item.status !== 'ok' || (remaining !== null && remaining <= 30); const status = item.status === 'replace' ? 'replace' : isDue ? 'due' : 'ok'; return `<div class="safety-row ${isDue ? 'due' : ''}"><div><strong>${esc(item.name)}</strong><small>${item.dueDate ? `Prüfung/Ablauf ${fmtDate(item.dueDate)}${remaining !== null ? ` · ${remaining} Tage` : ''}` : 'Kein Ablaufdatum'}${item.note ? ` · ${esc(item.note)}` : ''}</small></div><div><span class="due-chip ${status}">${status === 'ok' ? 'in Ordnung' : status === 'replace' ? 'ersetzen' : 'fällig'}</span><div class="actions"><button onclick="editOperation('safety','${item.id}')">Bearbeiten</button><button onclick="removeItem('safety','${item.id}')">×</button></div></div></div>`; }).join('') || '<div class="empty-state">Noch keine Sicherheitsprüfungen eingetragen.</div>';
  $('#documentList').innerHTML = documents.map(item => `<div class="document-row"><div class="document-icon">${item.mimeType?.includes('pdf') ? 'PDF' : '▧'}</div><div><strong>${esc(item.title)}</strong><div class="meta">${esc(item.category || '')}${item.date ? ` · ${fmtDate(item.date)}` : ''}${item.fileName ? ` · ${esc(item.fileName)}` : ''}</div>${item.note ? `<div class="meta">${esc(item.note)}</div>` : ''}</div><div class="actions"><span class="cloud-chip ${item.storagePath ? 'synced' : item._cloudState === 'error' ? 'error' : 'pending'}">${item.storagePath ? 'Cloud' : item._cloudState === 'error' ? 'Fehler' : 'lokal'}</span><button onclick="openDocument('${item.id}')">Öffnen</button><button onclick="editOperation('documents','${item.id}')">Bearbeiten</button><button onclick="removeItem('documents','${item.id}')">×</button></div></div>`).join('') || '<div class="empty-state">Noch keine Dokumente abgelegt.</div>';
}

function editOperation(store, id) {
  const item = state[store]?.find(row => row.id === id); if (!item) return;
  const form = $(`#${store === 'documents' ? 'document' : store}Form`); if (!form) return;
  fillForm(form, item); form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.editOperation = editOperation;

async function openDocument(id) {
  let item = await getOne('documents', id); if (!item) return;
  if (!item.data && item.storagePath) { try { item = await mediaDownloadRecord('documents', item); } catch (error) { return alert(`Dokument konnte nicht geladen werden: ${error.message}`); } }
  if (!item.data) return alert('Die Datei ist auf diesem Gerät noch nicht verfügbar. Bitte online synchronisieren.');
  const win = window.open(); if (win) win.location = item.data; else location.href = item.data;
}
window.openDocument = openDocument;

function photoRelationOptions() {
  const select = $('#photoRelatedId'); if (!select) return;
  const type = $('#photoForm')?.elements.relatedType?.value || 'day';
  let items = [];
  if (type === 'day') items = state.days.map(item => ({ id: item.id, label: `${fmtDate(item.date)} · ${item.title || `${item.fromPort || ''} → ${item.toPort || ''}`}` }));
  if (type === 'port') items = state.ports.map(item => ({ id: item.id, label: item.name }));
  select.innerHTML = '<option value="">Automatisch über Datum / ohne festen Bezug</option>' + items.map(item => `<option value="${item.id}">${esc(item.label)}</option>`).join('');
}

function renderPhotos() {
  const photos = [...(state.photos || [])].sort((a,b) => (b.created || 0)-(a.created || 0));
  $('#photoGrid').innerHTML = photos.map(item => `<figure class="photo ${item.featured === true || item.featured === 'true' ? 'featured' : ''}"><div class="photo-badges">${item.featured === true || item.featured === 'true' ? '<span>Titelbild</span>' : ''}<span>${item.storagePath ? '☁ synchronisiert' : item._cloudState === 'error' ? 'Cloud-Fehler' : 'lokal'}</span></div><button class="delete" onclick="removeItem('photos','${item.id}')" aria-label="Foto löschen">×</button><img src="${item.data || defaultHero}" alt="${esc(item.caption || 'Foto der LEEFKE')}"><figcaption><strong>${esc(item.caption || 'LEEFKE')}</strong><div class="meta">${fmtDate(item.date)}</div></figcaption><div class="photo-actions"><button onclick="setFeaturedPhoto('${item.id}')">${item.featured === true || item.featured === 'true' ? 'Titelbild lösen' : 'Als Titelbild'}</button><button onclick="syncPhotosNow()">Cloud abgleichen</button></div></figure>`).join('') || '<div class="card muted">Noch keine Fotos in der Galerie.</div>';
  const pending = photos.filter(item => !item.storagePath || item._cloudState === 'error').length;
  if ($('#photoCloudStatus')) $('#photoCloudStatus').textContent = currentSession ? (pending ? `${pending} Foto(s) warten auf den Cloud-Abgleich.` : 'Alle Fotos sind im privaten LEEFKE-Speicher verfügbar.') : 'Anmelden, um Fotos auf allen Geräten verfügbar zu machen.';
  if ($('#photoAutoSync')) $('#photoAutoSync').checked = getSettings().photoAutoSync !== false;
  photoRelationOptions();
}

async function setFeaturedPhoto(id) {
  const target = await getOne('photos', id); if (!target) return;
  const currently = target.featured === true || target.featured === 'true';
  for (const photo of state.photos.filter(item => item.date === target.date && item.id !== id && (item.featured === true || item.featured === 'true'))) await put('photos', { ...photo, featured: false });
  await put('photos', { ...target, featured: !currently }); await refresh();
}
window.setFeaturedPhoto = setFeaturedPhoto;
async function syncPhotosNow() { await syncMedia({ manual: true }); await syncNow(); await refresh(); toast('Fotos abgeglichen'); }
window.syncPhotosNow = syncPhotosNow;

function renderAutoBackups() {
  const backups = [...(state.autoBackups || [])].sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt));
  $('#autoBackupList').innerHTML = backups.map(item => `<div class="backup-row"><div><strong>${esc(item.reason)}</strong><small>${new Date(item.createdAt).toLocaleString('de-DE')} · Version ${esc(item.version)} · ${(num(item.size)/1024/1024).toLocaleString('de-DE',{maximumFractionDigits:1})} MB${item.mediaOmitted ? ' · Medien ausgelassen' : ''}</small></div><div class="actions"><button onclick="downloadAutoBackup('${item.id}')">Herunterladen</button><button onclick="restoreAutoBackup('${item.id}')">Wiederherstellen</button><button onclick="removeAutoBackup('${item.id}')">×</button></div></div>`).join('') || '<div class="empty-state">Noch kein automatischer Sicherungspunkt.</div>';
}

function maintenanceDueInfo(item) {
  const settings = getSettings();
  const dateDays = daysUntil(item.dueDate);
  const hoursLeft = item.dueHours ? num(item.dueHours) - num(settings.currentEngineHours) : null;
  const due = !item.done && ((dateDays !== null && dateDays <= 30) || (hoursLeft !== null && hoursLeft <= 20));
  return { dateDays, hoursLeft, due };
}

function renderMaintenance() {
  $('#maintenanceList').innerHTML = state.maintenance.map(item => {
    const info = maintenanceDueInfo(item);
    const details = [item.engineHours ? `${dec(item.engineHours)} h` : '', item.cost ? eur(item.cost) : '', item.dueDate ? `fällig ${fmtDate(item.dueDate)}${info.dateDays !== null ? ` (${info.dateDays} Tage)` : ''}` : '', item.dueHours ? `bei ${dec(item.dueHours)} h${info.hoursLeft !== null ? ` (${dec(info.hoursLeft)} h verbleibend)` : ''}` : ''].filter(Boolean).join(' · ');
    return card(item, 'maintenance', `<div class="meta">${fmtDate(item.date)} · ${esc(item.category || '')}</div><h3>${esc(item.title)}</h3><span class="due-chip ${item.done ? 'ok' : info.due ? 'due' : 'ok'}">${item.done ? 'erledigt' : info.due ? 'bald fällig' : 'offen'}</span><p>${esc(item.note || '')}</p><div class="meta">${details}</div>`);
  }).join('') || '<div class="card muted">Noch keine Wartungseinträge.</div>';
}

async function createMaintenanceTemplates() {
  const settings = getSettings(); const now = dateInputValue(); const currentHours = num(settings.currentEngineHours);
  const templates = [
    ['Motor · Perkins M135','Motoröl und Ölfilter',150,12],['Dieselanlage','Drei Dieselfilter kontrollieren / wechseln',150,12],['Motor · Perkins M135','Impeller kontrollieren / wechseln',200,12],['Motor · Perkins M135','Keilriemen kontrollieren',100,6],['Sicherheit','Rettungsinsel Wartung',0,36],['Sicherheit','Feuerlöscher Prüfung',0,24]
  ];
  for (const [category,title,hours,months] of templates) {
    if (state.maintenance.some(item => item.title === title && !item.done)) continue;
    const dueDate = new Date(); dueDate.setMonth(dueDate.getMonth()+months);
    await put('maintenance',{id:uid(),date:now,category,title,engineHours:currentHours||'',done:false,dueDate:dateInputValue(dueDate),dueHours:hours&&currentHours?currentHours+hours:'',cost:'',note:'Automatisch angelegter, frei bearbeitbarer LEEFKE-Wartungspunkt.'});
  }
  await refresh(); toast('LEEFKE-Wartungsplan angelegt');
}

function bearingBetween(a,b) {
  const rad=Math.PI/180, lat1=a[0]*rad, lat2=b[0]*rad, dLon=(b[1]-a[1])*rad;
  const y=Math.sin(dLon)*Math.cos(lat2), x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
  return (Math.atan2(y,x)/rad+360)%360;
}
function angleDifference(a,b){return Math.abs(((a-b+540)%360)-180)}
function relativeSeaLabel(course, sourceDirection) {
  if (sourceDirection === null || sourceDirection === undefined) return 'unbekannt';
  const diff=angleDifference(course,sourceDirection);
  if (diff<35) return 'von vorn'; if(diff<70) return 'schräg von vorn'; if(diff<110) return 'quer'; if(diff<150) return 'schräg von achtern'; return 'von achtern';
}
function routeComfort(hour, course) {
  const wave=num(hour.waveHeight), period=num(hour.wavePeriod), wind=num(hour.windSpeed), rel=angleDifference(course,finiteOrNull(hour.waveDirection)??course);
  let score=0; const reasons=[];
  if(wave>=1.5){score+=4;reasons.push('Welle ab 1,5 m')}else if(wave>=1.0){score+=3;reasons.push('Welle um 1 m')}else if(wave>=.65){score+=2;reasons.push('spürbare Welle')}else if(wave>=.35)score+=1;
  if(period&&period<3.5&&wave>.5){score+=2;reasons.push('kurze Wellenperiode')}else if(period>=6)score-=1;
  if(wind>=25){score+=3;reasons.push('starker Wind')}else if(wind>=18){score+=2;reasons.push('frischer Wind')}else if(wind>=13)score+=1;
  if(rel>70&&rel<110&&wave>.6){score+=1;reasons.push('Welle etwa quer')}
  if(score<=1)return{className:'calm',label:'ruhig bis moderat',reason:reasons.join(', ')||'niedrige Werte'};
  if(score<=3)return{className:'attention',label:'aufmerksam fahren',reason:reasons.join(', ')||'spürbare Bedingungen'};
  if(score<=5)return{className:'uncomfortable',label:'unangenehm möglich',reason:reasons.join(', ')};
  return{className:'critical',label:'kritisch prüfen',reason:reasons.join(', ')};
}
function sampleRoutePoints(gpx,count=7){
  const points=gpx.points||[]; if(points.length<=count)return points.map((point,index)=>({point,index,distance:index?null:0}));
  const cumulative=[0]; for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+haversine(points[i-1],points[i]));
  const total=cumulative.at(-1); const samples=[];
  for(let s=0;s<count;s++){const target=total*s/(count-1);let index=cumulative.findIndex(v=>v>=target);if(index<0)index=points.length-1;samples.push({point:points[index],index,distance:cumulative[index]});}
  return samples;
}
async function fetchRoutePointForecast(point,date,time){
  const weatherVariables='wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,temperature_2m';
  const marineVariables='wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,ocean_current_velocity,ocean_current_direction';
  const w=`https://api.open-meteo.com/v1/forecast?latitude=${point[0]}&longitude=${point[1]}&hourly=${weatherVariables}&timezone=${encodeURIComponent(WEATHER_TIMEZONE)}&wind_speed_unit=kn&start_date=${date}&end_date=${date}`;
  const m=`https://marine-api.open-meteo.com/v1/marine?latitude=${point[0]}&longitude=${point[1]}&hourly=${marineVariables}&timezone=${encodeURIComponent(WEATHER_TIMEZONE)}&start_date=${date}&end_date=${date}&cell_selection=sea`;
  const [wr,mr]=await Promise.allSettled([fetch(w).then(r=>r.ok?r.json():Promise.reject()),fetch(m).then(r=>r.ok?r.json():Promise.reject())]);
  const hours=mergeForecastHours(wr.status==='fulfilled'?wr.value:null,mr.status==='fulfilled'?mr.value:null,date); if(!hours.length)return null;
  const target=new Date(`${date}T${time}:00`).getTime(); return hours.reduce((best,h)=>Math.abs(new Date(h.time).getTime()-target)<Math.abs(new Date(best.time).getTime()-target)?h:best,hours[0]);
}
async function analyzeRouteWeather(event){
  event?.preventDefault(); const gpx=state.gpx.find(item=>item.id===$('#routeWeatherGpx').value); if(!gpx)return setMessage('#routeWeatherState','Bitte eine GPX-Route auswählen.','error');
  const date=$('#routeWeatherDate').value,time=$('#routeWeatherTime').value,speed=num($('#routeWeatherSpeed').value)||7.5;if(!date||!time)return;
  if(!navigator.onLine)return setMessage('#routeWeatherState','Für eine neue Routenauswertung wird Internet benötigt.','error');
  setMessage('#routeWeatherState','Wetter an mehreren Punkten der Route wird geladen …');
  const samples=sampleRoutePoints(gpx,7); const start=new Date(`${date}T${time}:00`); const results=[];
  for(let i=0;i<samples.length;i++){
    const sample=samples[i]; const eta=new Date(start.getTime()+(sample.distance/speed)*3600000); const etaDate=dateInputValue(eta),etaTime=eta.toTimeString().slice(0,5);
    const hour=await fetchRoutePointForecast(sample.point,etaDate,etaTime); const next=samples[Math.min(i+1,samples.length-1)].point; const prev=samples[Math.max(0,i-1)].point; const course=bearingBetween(i===samples.length-1?prev:sample.point,i===samples.length-1?sample.point:next); const comfort=hour?routeComfort(hour,course):{className:'attention',label:'keine Daten',reason:''};
    results.push({index:i,point:sample.point,distance:sample.distance,eta:eta.toISOString(),etaLabel:eta.toLocaleString('de-DE',{weekday:'short',hour:'2-digit',minute:'2-digit'}),course,hour,comfort});
  }
  const record={id:`route-weather:${gpx.id}:${date}:${time}`,gpxId:gpx.id,gpxName:gpx.name,date,departTime:time,speed,createdAt:new Date().toISOString(),samples:results}; await put('routeWeather',record); renderRouteWeather(record); await refresh(); setMessage('#routeWeatherState','Routenwetter geladen und offline gespeichert.','success');
}
function renderRouteWeather(record){
  if(!record)return; const results=record.samples||[]; const worst=results.reduce((best,r)=>['calm','attention','uncomfortable','critical'].indexOf(r.comfort.className)>['calm','attention','uncomfortable','critical'].indexOf(best.comfort.className)?r:best,results[0]||{comfort:{className:'calm'}}); const maxWave=Math.max(...results.map(r=>num(r.hour?.waveHeight)),0); const maxWind=Math.max(...results.map(r=>num(r.hour?.windSpeed)),0); const end=results.at(-1)?.eta;
  $('#routeWeatherSummary').innerHTML=`<div><span>Route</span><strong>${esc(record.gpxName)}</strong></div><div><span>Ankunft etwa</span><strong>${end?new Date(end).toLocaleString('de-DE',{weekday:'short',hour:'2-digit',minute:'2-digit'}):'—'}</strong></div><div><span>Max. Welle</span><strong>${dec2(maxWave)} m</strong></div><div><span>Gesamteindruck</span><strong>${esc(worst?.comfort?.label||'—')}</strong></div>`;
  $('#routeWeatherRows').innerHTML=results.map((r,i)=>{const h=r.hour;return `<tr><td><strong>${i===0?'Start':i===results.length-1?'Ziel':`Punkt ${i+1}`}</strong><small>${esc(r.etaLabel)} · ${dec(r.distance)} sm</small></td><td>${Math.round(r.course)}°<small>${windDirectionText(r.course)}</small></td><td>${h?`${windDirectionText(h.windDirection)} ${dec2(h.windSpeed)} kn`:'—'}<small>${h?`${beaufortFromKnots(h.windSpeed)} Bft · Böen ${dec2(h.windGust)} kn`:''}</small></td><td>${h&&h.waveHeight!==null?`${dec2(h.waveHeight)} m aus ${windDirectionText(h.waveDirection)}`:'—'}<small>${h&&h.swellHeight!==null?`Dünung ${dec2(h.swellHeight)} m`:''}</small></td><td>${h&&h.wavePeriod?`${dec2(h.wavePeriod)} s`:'—'}<small>${h&&h.wavePeriod?`${dec2(60/h.wavePeriod)} Wellen/min`:''}</small></td><td>${h?relativeSeaLabel(r.course,h.waveDirection):'—'}</td><td><span class="route-rating ${r.comfort.className}">${esc(r.comfort.label)}</span><small>${esc(r.comfort.reason||'')}</small></td></tr>`;}).join('');
}

function renderRouteWeatherOptions(){
  const select=$('#routeWeatherGpx'); if(!select)return; const current=select.value; select.innerHTML='<option value="">Route auswählen</option>'+state.gpx.map(item=>`<option value="${item.id}">${esc(item.name)} (${dec(item.distanceNm)} sm)</option>`).join(''); if(state.gpx.some(item=>item.id===current))select.value=current; if(!$('#routeWeatherDate').value)$('#routeWeatherDate').value=dateInputValue(); const latest=[...(state.routeWeather||[])].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0]; if(latest)renderRouteWeather(latest);
}

function selectedBshStation(snapshot){
  const name=normalizePlaceName(snapshot?.locationName||'').toLowerCase();
  if(name.includes('bremerhaven'))return BSH_STATIONS.bremerhaven;if(name.includes('cuxhaven'))return BSH_STATIONS.cuxhaven;if(name.includes('helgoland'))return BSH_STATIONS.helgoland;if(name.includes('lemwerder'))return BSH_STATIONS.lemwerder;return null;
}
async function loadOfficialBsh(snapshot){
  const station=selectedBshStation(snapshot); const status=$('#bshOfficialStatus'),eventsBox=$('#bshOfficialEvents'),link=$('#bshOfficialLink'); if(!status||!link)return;
  if(!station){status.innerHTML='<strong>Kein fester BSH-Ort zugeordnet</strong><span>Für Kartenpunkte oder freie Etappenorte bitte die nächstgelegene Station auf der BSH-Seite wählen.</span>';eventsBox.innerHTML='';link.href='https://wasserstand.bsh.de/';return;}
  link.href=`https://wasserstand.bsh.de/${station.slug}`; status.innerHTML=`<strong>${esc(station.name)}</strong><span>Amtliche BSH-Seite für Wasserstandsvorhersage und Gezeiten. Gewähltes Datum: ${fmtDate(snapshot.date)}.</span>`;
  const modelEvents=tideExtrema(snapshot.hours||[]); eventsBox.innerHTML=modelEvents.slice(0,4).map(event=>`<div><small>MODELLIERTE TIDE</small><strong>${event.type} ca. ${formatTime(event.time)}</strong><span>${valueText(event.value,'m',2)}</span></div>`).join('');
  // Best effort: aktuelle amtliche PDF auslesen. Bei CORS oder Formatänderung bleibt der offizielle Link nutzbar.
  try{
    if(!navigator.onLine)return;
    const pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const pdf=await pdfjs.getDocument({url:'https://wasserstand.bsh.de/data/nordsee/Wasserstandsvorhersage.pdf'}).promise; let text='';
    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){const page=await pdf.getPage(pageNo);const content=await page.getTextContent();text+=' '+content.items.map(item=>item.str).join(' ');}
    const normalized=text.replace(/\s+/g,' ');
    const documentDates=[...new Set([...normalized.matchAll(/\b(\d{2}\.\d{2}\.\d{4})\b/g)].map(match=>match[1]))].slice(0,2);
    const targetDate=String(snapshot.date||'').split('-').reverse().join('.');
    if(!documentDates.includes(targetDate)) {
      status.innerHTML=`<strong>${esc(station.name)}</strong><span>Für ${fmtDate(snapshot.date)} liegt in der aktuellen BSH-Kurzvorhersage kein Datensatz. Die verlinkte Stationsseite zeigt die amtlichen Werte für den gewählten Zeitraum.</span>`;
      return;
    }
    const startIndex=normalized.indexOf(station.pdfName); if(startIndex<0)return;
    const chunk=normalized.slice(startIndex,startIndex+250);
    const times=[...chunk.matchAll(/\b([0-2]\d:[0-5]\d)\b/g)].map(match=>match[1]).slice(0,4); if(!times.length)return;
    const types=['HW','NW','HW','NW'];
    const secondDate=documentDates[1]||documentDates[0];
    const firstHour=Number(times[0].slice(0,2));
    const eventDates=[firstHour<6?secondDate:documentDates[0],secondDate,secondDate,secondDate];
    const assigned=times.map((time,index)=>({time,type:types[index]||'Tide',date:eventDates[index]})).filter(event=>event.date===targetDate);
    if(!assigned.length)return;
    eventsBox.innerHTML=assigned.map(event=>`<div><small>AMTLICHES BSH</small><strong>${event.type} ${event.time}</strong><span>${event.date} · aktuelle BSH-Vorhersage</span></div>`).join('');
    status.innerHTML=`<strong>${esc(station.name)}</strong><span>Amtliche BSH-Zeiten für ${fmtDate(snapshot.date)} wurden aus der aktuellen, manuell geprüften Kurzvorhersage geladen.</span>`;
  }catch(error){console.info('BSH-PDF konnte nicht automatisch ausgewertet werden.',error);}
}

function renderWeatherSnapshot(snapshot, requestedIndex = null) {
  // Originalfunktion wurde weiter oben definiert. Diese v6-Fassung bildet denselben Inhalt ab und ergänzt die BSH-Quelle.
  if (!snapshot) return;
  activeWeatherSnapshot = snapshot;
  const hours = snapshot.hours || mergeForecastHours(snapshot.weather, snapshot.marine, snapshot.date);
  if (!hours.length) return;
  const index = requestedIndex === null || requestedIndex === undefined ? chooseWeatherHour(hours, snapshot.date) : clamp(Number(requestedIndex), 0, hours.length - 1);
  activeWeatherHourIndex = index; const hour = hours[index]; const condition = weatherCodeInfo(hour.weatherCode); const bft = beaufortFromKnots(hour.windSpeed); const current = currentKnots(hour); const tide = tideStateAt(hours,index); const events=tideExtrema(hours); const offline=snapshot.offline?'<span class="weather-offline-badge">offline gespeichert</span>':'';
  $('#weatherResults').hidden=false; $('#weatherHeadline').innerHTML=`${esc(snapshot.locationName)} · ${fmtDate(snapshot.date)}${offline}`; $('#weatherSubline').textContent=`Bezugszeit ${formatTime(hour.time)} Uhr · geladen ${snapshot.loadedAt?new Date(snapshot.loadedAt).toLocaleString('de-DE'):'—'} · ${coordinateLabel(snapshot.latitude,snapshot.longitude)}`;
  $('#wxWind').textContent=valueText(hour.windSpeed,'kn',1); $('#wxWindDir').textContent=`aus ${windDirectionText(hour.windDirection)} · ${Math.round(num(hour.windDirection))}°`; $('#wxGust').textContent=valueText(hour.windGust,'kn',1); $('#wxBeaufort').textContent=`Wind ${bft} Bft`; $('#wxWave').textContent=valueText(hour.waveHeight,'m',1); $('#wxWaveDir').textContent=hour.waveDirection===null?'—':`aus ${windDirectionText(hour.waveDirection)}`; $('#wxPeriod').textContent=valueText(hour.wavePeriod,'s',1); $('#wxFrequency').textContent=hour.wavePeriod?`${dec2(60/hour.wavePeriod)} Wellen/min`:'—'; $('#wxSwell').textContent=valueText(hour.swellHeight,'m',1); $('#wxSwellDir').textContent=hour.swellDirection===null?'—':`aus ${windDirectionText(hour.swellDirection)}`; $('#wxCurrent').textContent=current===null?'—':`${dec2(current)} kn`; $('#wxCurrentDir').textContent=current===null?'—':`nach ${windDirectionText(hour.currentDirection)}`; $('#wxTemperature').textContent=valueText(hour.temperature,'°C',1); $('#wxCondition').textContent=`${condition[0]} ${condition[1]} · Regen ${hour.precipitationProbability??'—'} %`; $('#wxTideState').textContent=tide.state; $('#wxNextTide').textContent=tide.next?`${tide.next.type} ca. ${formatTime(tide.next.time)}`:'kein Scheitelpunkt erkannt';
  renderTideChart(hours,events); $('#tideEvents').innerHTML=events.map(event=>`<div><strong>${event.type}</strong><span>${formatTime(event.time)} Uhr</span><small>${valueText(event.value,'m',2)}</small></div>`).join('')||'<span class="meta">Keine modellierten Scheitelpunkte erkannt.</span>'; renderPegel(snapshot.pegel);
  $('#weatherHourly').innerHTML=hours.map((item,itemIndex)=>{const c=weatherCodeInfo(item.weatherCode);const itemCurrent=currentKnots(item);return `<tr data-weather-index="${itemIndex}" class="${itemIndex===index?'selected':''}"><td><strong>${formatTime(item.time)}</strong><small>${c[0]} ${c[1]}</small></td><td><strong>${windDirectionText(item.windDirection)} ${valueText(item.windSpeed,'kn',1)}</strong><small>${beaufortFromKnots(item.windSpeed)} Bft</small></td><td>${valueText(item.windGust,'kn',1)}</td><td><strong>${valueText(item.waveHeight,'m',1)}</strong><small>${windDirectionText(item.waveDirection)}</small></td><td><strong>${valueText(item.wavePeriod,'s',1)}</strong><small>${item.wavePeriod?`${(60/item.wavePeriod).toFixed(1).replace('.',',')}/min`:'—'}</small></td><td><strong>${valueText(item.swellHeight,'m',1)}</strong><small>${windDirectionText(item.swellDirection)}</small></td><td><strong>${itemCurrent===null?'—':`${itemCurrent.toFixed(1).replace('.',',')} kn`}</strong><small>${itemCurrent===null?'—':`nach ${windDirectionText(item.currentDirection)}`}</small></td><td><strong>${valueText(item.seaLevel,'m',2)}</strong><small>${tideStateAt(hours,itemIndex).state}</small></td></tr>`;}).join('');
  setWeatherLocation({name:snapshot.locationName,latitude:snapshot.latitude,longitude:snapshot.longitude,source:snapshot.source,routeId:snapshot.routeId,routeSide:snapshot.routeSide,zoom:11},{pan:false});
  loadOfficialBsh(snapshot);
}

function reportPointByName(name) {
  const normalized = normalizePlaceName(name);
  if (!normalized) return null;

  const storedPort = state.ports.find(port => normalizePlaceName(port.name) === normalized && parseCoordinates(port.coords));
  if (storedPort) return parseCoordinates(storedPort.coords);

  const fixed = Object.values(WEATHER_LOCATIONS).find(item => normalizePlaceName(item.name) === normalized);
  if (fixed) return [fixed.latitude, fixed.longitude];

  const direct = REPORT_PLACE_COORDS[normalized];
  if (direct) return direct;

  const compact = normalized
    .replace(/yachthafen|marina|binnenhafen|aussenhafen|stadthafen|hafen|yachtclub|segelverein/g, '');
  if (REPORT_PLACE_COORDS[compact]) return REPORT_PLACE_COORDS[compact];

  const partial = Object.entries(REPORT_PLACE_COORDS)
    .find(([key]) => key.length >= 4 && (normalized.includes(key) || key.includes(normalized)));
  return partial?.[1] || null;
}

function reportPlannedRouteSegments() {
  const segments = [];
  const stages = [...state.route]
    .filter(stage => stage.status !== 'skip')
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  for (const stage of stages) {
    const from = reportPointByName(stage.from);
    const to = reportPointByName(stage.to);
    if (!from && !to) continue;
    segments.push({
      id: stage.id,
      label: `${stage.from || 'Start'} → ${stage.to || 'Ziel'}`,
      from,
      to,
      date: stage.date,
      nm: stage.nm
    });
  }
  return segments;
}

function reportMapContentAvailable() {
  return true;
}

function reportRouteMapHtml() {
  const hasGpx = state.gpx.some(item => item.points?.length);
  const hasPlan = reportPlannedRouteSegments().length > 0;
  const routeCaption = hasGpx
    ? '<span><i class="report-legend-line"></i> GPX-Route</span>'
    : hasPlan
      ? '<span><i class="report-legend-line planned"></i> geplanter Törn</span>'
      : '<span><i class="report-legend-line planned"></i> Seekartenübersicht</span>';

  return `<div class="report-map-shell">
    <div id="reportRouteMap" class="report-map" role="img" aria-label="Seekarte des Törns">
      <div id="reportMapLoading" class="report-map-loading"><span>⚓</span><strong>Seekarte wird geladen …</strong><small>Küstenkarte, Seezeichen und der Verlauf des aktuellen Törns werden eingeblendet.</small></div>
    </div>
    <div class="report-map-caption">${routeCaption}<span>⚓ Start / Hafen</span><span>◆ Ziel</span><span>Seezeichen: OpenSeaMap</span></div>
    <p class="report-map-warning">Planungs- und Dokumentationsansicht – keine zugelassene Navigationskarte. Ohne GPX verbindet die App bekannte Etappenorte als gestrichelte Planungslinie.</p>
  </div>`;
}

function removeReportRouteMap() {
  if (!reportRouteMap) return;
  try { reportRouteMap.remove(); } catch (error) { console.info('Alte Reisebericht-Karte konnte nicht entfernt werden.', error); }
  reportRouteMap = null;
}

function waitForReportTileLayer(layer, timeout = 4500) {
  return new Promise(resolve => {
    let finished = false;
    const done = status => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      resolve(status);
    };
    const timer = window.setTimeout(() => done('timeout'), timeout);
    layer.once('load', () => done('loaded'));
    layer.once('tileerror', () => window.setTimeout(() => done('partial'), 500));
  });
}

function reportRouteLabel(route, index) {
  return esc(route.name || route.fileName || `Route ${index + 1}`);
}

function addReportRouteLayers(map) {
  const bounds = L.latLngBounds([]);
  const routes = state.gpx.filter(item => item.points?.length);
  const marked = new Set();

  const addNamedMarker = (point, kind, label, popupHtml) => {
    if (!point) return;
    const key = `${point[0].toFixed(5)}:${point[1].toFixed(5)}:${kind}`;
    if (marked.has(key)) return;
    marked.add(key);
    bounds.extend(point);
    const icon = kind === 'finish' ? routeMarker('finish', label) : kind === 'port' ? portMarkerIcon() : routeMarker('start', label);
    L.marker(point, { icon, title: label || 'Position' })
      .bindPopup(popupHtml || `<strong>${esc(label || 'Position')}</strong>`)
      .addTo(map);
  };

  routes.forEach((route, index) => {
    const latLngs = route.points
      .map(point => [num(point[0]), num(point[1])])
      .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    if (!latLngs.length) return;
    latLngs.forEach(point => bounds.extend(point));
    L.polyline(latLngs, { color: '#08283b', weight: 9, opacity: .9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
    L.polyline(latLngs, { color: '#f2bd2e', weight: 4.5, opacity: 1, lineCap: 'round', lineJoin: 'round' })
      .bindPopup(`<strong>${reportRouteLabel(route, index)}</strong><br>${route.distanceNm ? `${dec(route.distanceNm)} sm` : `${latLngs.length} Punkte`}`)
      .addTo(map);
    addNamedMarker(latLngs[0], 'start', index === 0 ? 'Start' : `Start ${index + 1}`, `<strong>${reportRouteLabel(route, index)}</strong><br>Start`);
    addNamedMarker(latLngs.at(-1), 'finish', index === routes.length - 1 ? 'Ziel' : `Ziel ${index + 1}`, `<strong>${reportRouteLabel(route, index)}</strong><br>Ziel`);
  });

  const planned = reportPlannedRouteSegments();
  planned.forEach((segment, index) => {
    if (segment.from && segment.to) {
      bounds.extend(segment.from);
      bounds.extend(segment.to);
      L.polyline([segment.from, segment.to], {
        color: '#b27a20',
        weight: routes.length ? 2.5 : 4,
        opacity: routes.length ? .65 : .9,
        dashArray: '10 8',
        lineCap: 'round',
        lineJoin: 'round'
      }).bindPopup(`<strong>${esc(segment.label)}</strong>${segment.date ? `<br>${fmtDate(segment.date)}` : ''}${segment.nm ? `<br>${dec(segment.nm)} sm` : ''}`)
        .addTo(map);
    }
    if (segment.from) addNamedMarker(segment.from, index === 0 ? 'start' : 'port', segment.label.split(' → ')[0], `<strong>${esc(segment.label.split(' → ')[0])}</strong>${segment.date ? `<br>Etappe am ${fmtDate(segment.date)}` : ''}`);
    if (segment.to) addNamedMarker(segment.to, index === planned.length - 1 ? 'finish' : 'port', segment.label.split(' → ')[1], `<strong>${esc(segment.label.split(' → ')[1])}</strong>${segment.date ? `<br>Etappe am ${fmtDate(segment.date)}` : ''}`);
  });

  state.ports.forEach(port => {
    const point = parseCoordinates(port.coords);
    if (!point) return;
    const rating = clamp(Math.round(num(port.rating)), 0, 5);
    addNamedMarker(
      point,
      'port',
      port.name || 'Hafen',
      `<div class="port-map-popup"><strong>${esc(port.name || 'Hafen')}</strong>${rating ? `<div>${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</div>` : ''}${port.berth ? `<span>Liegeplatz: ${esc(port.berth)}</span>` : ''}</div>`
    );
  });
  return bounds;
}

function initReportRouteMap() {
  removeReportRouteMap();
  const element = $('#reportRouteMap');
  if (!element) return Promise.resolve();
  if (!window.L) {
    element.innerHTML = '<div class="report-map-loading error"><span>⚠</span><strong>Seekarte konnte nicht gestartet werden.</strong><small>Bitte die Seite mit Internetverbindung neu laden.</small></div>';
    return Promise.resolve();
  }

  reportRouteMap = L.map(element, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false,
    doubleClickZoom: true,
    dragging: true,
    tap: true,
    preferCanvas: false
  });

  const baseLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    crossOrigin: true,
    attribution: '&copy; OpenStreetMap-Mitwirkende'
  }).addTo(reportRouteMap);
  const seaMarkLayer = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
    maxZoom: 18,
    opacity: 1,
    crossOrigin: true,
    attribution: 'Seezeichen &copy; OpenSeaMap'
  }).addTo(reportRouteMap);

  L.control.scale({ metric: true, imperial: false, maxWidth: 140, position: 'bottomleft' }).addTo(reportRouteMap);
  const bounds = addReportRouteLayers(reportRouteMap);
  if (bounds.isValid()) reportRouteMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
  else reportRouteMap.setView([54.05, 9.10], 7);

  const loading = $('#reportMapLoading');
  const tileState = Promise.all([waitForReportTileLayer(baseLayer), waitForReportTileLayer(seaMarkLayer)]).then(states => {
    reportRouteMap?.invalidateSize(false);
    if (!loading) return;
    const baseLoaded = states[0] === 'loaded' || states[0] === 'partial';
    if (baseLoaded) loading.remove();
    else {
      loading.classList.add('warning');
      loading.innerHTML = '<span>⌁</span><strong>Kartenhintergrund noch nicht vollständig geladen</strong><small>Bitte Internetverbindung prüfen. Bereits gespeicherte Kacheln bleiben offline verfügbar.</small>';
      window.setTimeout(() => loading.remove(), 5000);
    }
  });
  window.setTimeout(() => reportRouteMap?.invalidateSize(false), 120);
  return tileState;
}

function buildReport() {
  const settings=getSettings();const days=[...state.days].sort((a,b)=>String(a.date).localeCompare(String(b.date)));const photos=[...state.photos];const ports=[...state.ports].sort((a,b)=>String(a.date).localeCompare(String(b.date)));const totalNm=days.reduce((s,i)=>s+num(i.distance),0);const hours=days.reduce((s,i)=>s+Math.max(0,num(i.engineEnd)-num(i.engineStart)),0);const fuelLiters=state.fuel.reduce((s,i)=>s+num(i.liters),0);const fuelCost=state.fuel.reduce((s,i)=>s+num(i.liters)*num(i.price),0);const portCost=ports.reduce((s,i)=>s+num(i.cost),0);const cover=settings.boatPhoto||photos.find(p=>p.featured)?.data||defaultHero;const includeWeather=$('#reportIncludeWeather')?.checked!==false,includePorts=$('#reportIncludePorts')?.checked!==false,includeCosts=$('#reportIncludeCosts')?.checked!==false,includeMaintenance=$('#reportIncludeMaintenance')?.checked===true;
  $('#reportContent').innerHTML=`<div class="report-cover"><img src="${cover}" alt="${esc(settings.boatName)}"><div><h1>${esc(settings.tripTitle||'Reisebericht')}</h1><p>${esc(settings.boatName)} · ${esc(settings.boatType)} · ${fmtDate(settings.tripStart)} bis ${fmtDate(settings.tripEnd)}</p></div></div><div class="report-summary-grid"><div><span>Reisetage</span><strong>${days.length}</strong></div><div><span>Seemeilen</span><strong>${dec(totalNm)} sm</strong></div><div><span>Motorstunden</span><strong>${dec(hours)} h</strong></div><div><span>Häfen</span><strong>${ports.length}</strong></div></div><p class="meta">${esc(settings.boatName)} · Baujahr ${esc(settings.buildYear)} · ${dec2(settings.length)} × ${dec2(settings.beam)} m · ${esc(settings.engine)} · Heimathafen ${esc(settings.homePort)}</p><section class="report-map-section"><h2>Der Törn auf der Seekarte</h2>${reportRouteMapHtml()}</section>${state.route.length?`<section class="report-plan"><h2>Törnplan</h2>${[...state.route].sort((a,b)=>String(a.date).localeCompare(String(b.date))).map((stage,index)=>`<div><b>${index+1}. ${fmtDate(stage.date)} · ${esc(stage.from||'—')} → ${esc(stage.to||'—')}</b><span>${dec(stage.nm)} sm${stage.departTime?` · Ablegen ${esc(stage.departTime)} Uhr`:''}${includeWeather&&stage.wind?` · ${esc(stage.wind)}`:''}${includeWeather&&stage.wave?` · Welle ${esc(stage.wave)}`:''}${includeWeather&&stage.tide?` · ${esc(stage.tide)}`:''}</span></div>`).join('')}</section>`:''}${days.map(day=>{const dayPhotos=photos.filter(photo=>photo.relatedId===day.id||(!photo.relatedId&&photo.date===day.date)).sort((a,b)=>Number(b.featured===true||b.featured==='true')-Number(a.featured===true||a.featured==='true'));return `<section class="report-day"><h2>${fmtDate(day.date)} · ${esc(day.title||`${day.fromPort||''} → ${day.toPort||''}`)}</h2><p class="meta">${esc(day.fromPort||'')} → ${esc(day.toPort||'')} · ${dec(day.distance)} sm${includeWeather?` · ${esc(day.wind||'')} · ${esc(day.wave||'')}`:''}</p><p>${esc(day.summary||'').replace(/\n/g,'<br>')}</p>${day.moment?`<blockquote>„${esc(day.moment)}“</blockquote>`:''}${dayPhotos.map(photo=>photo.data?`<figure><img class="report-photo" src="${photo.data}" alt="${esc(photo.caption||'')}"><figcaption>${esc(photo.caption||'')}</figcaption></figure>`:'').join('')}</section>`;}).join('')||'<p>Noch keine Tagesberichte vorhanden.</p>'}${includePorts&&ports.length?`<section><h2>Hafenbuch</h2><table class="report-port-table"><thead><tr><th>Hafen</th><th>Bewertung</th><th>Liegeplatz</th><th>Kosten</th></tr></thead><tbody>${ports.map(port=>`<tr><td>${esc(port.name)}</td><td>${'★'.repeat(Math.round(num(port.rating)))}${'☆'.repeat(5-Math.round(num(port.rating)))}</td><td>${esc(port.berth||'—')}</td><td>${port.cost?eur(port.cost):'—'}</td></tr>`).join('')}</tbody></table></section>`:''}${includeCosts?`<section class="report-finance-section"><div class="report-section-heading"><div><small>KOSTENÜBERSICHT</small><h2>Diesel & Reisekosten</h2></div><p>Zusammenfassung der im aktuellen Törn erfassten Tank- und Liegeplatzkosten.</p></div><div class="report-costs"><div class="report-cost-card"><span class="report-cost-icon">⛽</span><div><span>Getankt</span><strong>${dec(fuelLiters)} <em>Liter</em></strong></div></div><div class="report-cost-card"><span class="report-cost-icon">€</span><div><span>Dieselkosten</span><strong>${eur(fuelCost)}</strong></div></div><div class="report-cost-card"><span class="report-cost-icon">⚓</span><div><span>Liegeplätze</span><strong>${eur(portCost)}</strong></div></div><div class="report-cost-card report-cost-total"><span class="report-cost-icon">Σ</span><div><span>Gesamtkosten</span><strong>${eur(fuelCost+portCost)}</strong></div></div></div></section>`:''}${includeMaintenance&&state.maintenance.length?`<section><h2>Technik & Wartung</h2>${state.maintenance.map(item=>`<p><b>${fmtDate(item.date)} · ${esc(item.title)}</b><br>${esc(item.note||'')}${item.cost?` · ${eur(item.cost)}`:''}</p>`).join('')}</section>`:''}`;
  reportMapReadyPromise = initReportRouteMap();
  return reportMapReadyPromise;
}

function renderV6Extras() {
  renderOperations(); renderHistory(); renderAutoBackups(); renderRouteWeatherOptions(); photoRelationOptions();
  const conflicts=(state.conflicts||[]).filter(item=>item.status==='open');const badge=$('#conflictNavBadge');if(badge){badge.hidden=!conflicts.length;badge.textContent=String(conflicts.length)}
}


function guestAppUrl(enabled) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('v', APP_VERSION);
  url.searchParams.set('guest', enabled ? '1' : '0');
  return url.toString();
}

function enterGuestMode() {
  localStorage.setItem(GUEST_MODE_KEY, '1');
  window.location.href = guestAppUrl(true);
}

function exitGuestMode() {
  localStorage.removeItem(GUEST_MODE_KEY);
  window.location.href = guestAppUrl(false);
}

async function resetGuestDemo() {
  if (!IS_GUEST_MODE) return;
  if (!window.confirm('Die gesamte lokale Demo wird auf den vorbereiteten Ausgangsstand zurückgesetzt. Fortfahren?')) return;
  for (const store of [...stores, ...systemStores]) await rawClear(store);
  cachedDeviceIdentity = null;
  window.location.reload();
}

async function staticImageDataUrl(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) return '';
    return await blobToDataUrl(await response.blob());
  } catch {
    return '';
  }
}

async function seedGuestDemoData() {
  if (!IS_GUEST_MODE) return;
  const existingSeed = await metaGet('guestSeed');
  const existingTrips = await all('trips');
  if (existingSeed?.version === APP_VERSION && existingTrips.length) return;

  const now = '2026-07-27T09:30:00.000Z';
  const demoDevice = 'leefke-demo';
  const tripId = 'guest-trip-helgoland-2026';
  const autumnTripId = 'guest-trip-herbst-2026';
  const gpxId = 'guest-gpx-bremerhaven-helgoland';
  const record = (store, value, timestamp = now) => normalizeRecord(store, value, timestamp, demoDevice);

  const photoData = await staticImageDataUrl('leefke-hero.jpg');
  const demoSettings = record('settings', {
    ...DEFAULT_SETTINGS,
    id: 'main',
    currentTankPercent: 76,
    currentEngineHours: 954.0,
    defaultCrew: 'Demo-Crew',
    photoAutoSync: false,
    preferredCruiseSpeed: 6.5
  });
  await rawPut('settings', demoSettings);

  await rawPut('trips', record('trips', {
    id: tripId,
    title: 'Helgoland-Wochenende · Demo',
    startDate: '2026-07-25',
    endDate: '2026-07-26',
    crew: 'Demo-Crew',
    status: 'active',
    notes: 'Vorbereiteter Gast-Törn zum gefahrlosen Testen der LEEFKE-App.',
    createdAt: '2026-07-20T10:00:00.000Z'
  }, '2026-07-20T10:00:00.000Z'));
  await rawPut('trips', record('trips', {
    id: autumnTripId,
    title: 'Herbsturlaub · Demo',
    startDate: '2026-10-03',
    endDate: '2026-10-11',
    crew: 'Demo-Crew',
    status: 'planned',
    notes: 'Leerer zweiter Demo-Törn zum Testen des Törnwechsels.',
    createdAt: '2026-07-21T10:00:00.000Z'
  }, '2026-07-21T10:00:00.000Z'));

  const gpxPoints = [
    [53.5505, 8.5795], [53.6170, 8.5200], [53.7040, 8.4100],
    [53.8150, 8.2550], [53.9200, 8.1150], [54.0300, 7.9900],
    [54.1150, 7.9150], [54.1825, 7.8854]
  ];
  await rawPut('gpx', record('gpx', {
    id: gpxId,
    tripId,
    name: 'Bremerhaven – Helgoland · Demo',
    points: gpxPoints,
    distanceNm: 43.8,
    created: Date.parse('2026-07-22T09:00:00.000Z')
  }, '2026-07-22T09:00:00.000Z'));

  const routes = [
    {
      id: 'guest-route-outbound', tripId, date: '2026-07-25', status: 'done',
      from: 'Bremerhaven', to: 'Helgoland', departTime: '06:20', berth: 'Binnenhafen · Gastliegerbereich',
      nm: 43.8, hours: 5.9, weather: 'Heiter, 18 °C', wind: 'NW 3 Bft, Böen 4 Bft',
      wave: '0,5–0,8 m aus NW · 5 s', tide: 'Ablaufend, zunächst mitlaufender Strom', gpxId,
      note: 'Früh ablegen, Verkehr auf der Außenweser aufmerksam beobachten.'
    },
    {
      id: 'guest-route-return', tripId, date: '2026-07-26', status: 'done',
      from: 'Helgoland', to: 'Cuxhaven', departTime: '08:10', berth: 'City Marina · Steg C',
      nm: 36.5, hours: 4.9, weather: 'Wechselnd bewölkt, 17 °C', wind: 'W 3 Bft',
      wave: '0,4–0,6 m aus W · 5 s', tide: 'Auflaufend Richtung Elbe', gpxId: '',
      note: 'Vor Cuxhaven Berufsschifffahrt und Fahrwasserquerung beachten.'
    }
  ];
  for (const route of routes) await rawPut('route', record('route', route, `${route.date}T18:00:00.000Z`));

  const days = [
    {
      id: 'guest-day-1', tripId, date: '2026-07-25', dayNo: 1,
      title: 'Von der Weser hinaus nach Helgoland', fromPort: 'Bremerhaven', toPort: 'Helgoland',
      depart: '06:20', arrive: '12:15', distance: 43.8, engineStart: 943.2, engineEnd: 949.1,
      weather: 'Heiter', wind: 'NW 3 Bft, Böen 4 Bft', wave: '0,5–0,8 m aus NW · 5 s',
      tide: 'Ablaufend, zunächst mitlaufender Strom', crew: 'Demo-Crew',
      summary: 'Ruhige Ausfahrt aus Bremerhaven. Ab Alte Weser etwas mehr Bewegung, aber eine lange und gutmütige Welle. Die Ansteuerung Helgoland war klar und gut sichtbar.',
      moment: 'Der erste Blick auf die rote Felsküste in der Mittagssonne.'
    },
    {
      id: 'guest-day-2', tripId, date: '2026-07-26', dayNo: 2,
      title: 'Zurück über die Deutsche Bucht', fromPort: 'Helgoland', toPort: 'Cuxhaven',
      depart: '08:10', arrive: '13:05', distance: 36.5, engineStart: 949.1, engineEnd: 954.0,
      weather: 'Wechselnd bewölkt', wind: 'W 3 Bft', wave: '0,4–0,6 m aus W · 5 s',
      tide: 'Auflaufend Richtung Elbe', crew: 'Demo-Crew',
      summary: 'Entspannte Rückfahrt mit guter Sicht. Vor Cuxhaven war etwas mehr Verkehr, die Einfahrt in die Marina verlief problemlos.',
      moment: 'Kaffee auf dem Achterdeck bei ruhiger See.'
    }
  ];
  for (const day of days) await rawPut('days', record('days', day, `${day.date}T19:00:00.000Z`));

  const ports = [
    {
      id: 'guest-port-helgoland', tripId, name: 'Helgoland', date: '2026-07-25', berth: 'Binnenhafen', cost: 34,
      services: 'Strom am Steg, Wasser zentral', contact: 'Hafenmeister vor Ort', coords: '54.1825, 7.8854',
      returnVisit: 'yes', rating: 5, ratingFriendly: 5, ratingSanitary: 4, ratingSupply: 4, ratingValue: 4,
      approach: 'Ansteuerung eindeutig, Fähr- und Ausflugsverkehr beachten.',
      note: 'Außergewöhnlicher Inselhafen und ein wunderschöner Abend auf dem Oberland.'
    },
    {
      id: 'guest-port-cuxhaven', tripId, name: 'Cuxhaven', date: '2026-07-26', berth: 'City Marina · Steg C', cost: 29,
      services: 'Strom und Wasser am Steg', contact: 'Hafenbüro', coords: '53.8688, 8.7064',
      returnVisit: 'yes', rating: 4, ratingFriendly: 4, ratingSanitary: 4, ratingSupply: 5, ratingValue: 4,
      approach: 'Starker Verkehr im Elbfahrwasser; Einfahrt und Querung sorgfältig planen.',
      note: 'Gute Versorgung und praktischer Ausgangspunkt für die Elbe.'
    }
  ];
  for (const port of ports) await rawPut('ports', record('ports', port, `${port.date}T18:30:00.000Z`));

  await rawPut('fuel', record('fuel', {
    id: 'guest-fuel-cuxhaven', tripId, date: '2026-07-26', place: 'Cuxhaven', liters: 120,
    price: 1.82, engineHours: 954.0, tankPercent: 92, note: 'Nach dem Demo-Törn aufgefüllt.'
  }, '2026-07-26T15:00:00.000Z'));

  const maintenance = [
    { id: 'guest-maint-oil', date: '2026-06-18', category: 'Motor · Perkins M135', title: 'Motoröl und Ölfilter gewechselt', engineHours: 930.0, done: 'true', dueDate: '', dueHours: 1080, cost: 148.50, note: 'Probebetrieb ohne Auffälligkeiten.' },
    { id: 'guest-maint-impeller', date: '2026-07-20', category: 'Motor · Perkins M135', title: 'Impeller kontrollieren', engineHours: 954.0, done: 'false', dueDate: '2026-09-01', dueHours: 1000, cost: '', note: 'Ersatzimpeller liegt an Bord.' }
  ];
  for (const item of maintenance) await rawPut('maintenance', record('maintenance', item, `${item.date}T12:00:00.000Z`));

  const inventory = [
    { id: 'guest-inv-filter', name: 'Dieselfilter Vorfilter', category: 'Dieselanlage', quantity: 3, minimum: 1, unit: 'Stück', location: 'Motorraum · Backbordfach', note: '' },
    { id: 'guest-inv-impeller', name: 'Impeller', category: 'Motor', quantity: 1, minimum: 1, unit: 'Stück', location: 'Ersatzteilfach', note: '' },
    { id: 'guest-inv-oil', name: 'Motoröl', category: 'Motor', quantity: 4, minimum: 5, unit: 'Liter', location: 'Vorratsschrank', note: 'Ein Liter nachkaufen.' }
  ];
  for (const item of inventory) await rawPut('inventory', record('inventory', item));

  const safety = [
    { id: 'guest-safe-raft', name: 'Rettungsinsel', lastCheck: '2025-09-12', dueDate: '2028-09-12', status: 'ok', note: 'Plombe unbeschädigt.' },
    { id: 'guest-safe-fire', name: 'Feuerlöscher', lastCheck: '2026-03-10', dueDate: '2028-03-10', status: 'ok', note: '' },
    { id: 'guest-safe-firstaid', name: 'Erste-Hilfe-Ausrüstung', lastCheck: '2026-04-02', dueDate: '2027-04-02', status: 'ok', note: '' }
  ];
  for (const item of safety) await rawPut('safety', record('safety', item));

  const checks = [
    ['Vor dem Ablegen', 'Wetter, Wind, Wellen und Sicht geprüft', true],
    ['Vor dem Ablegen', 'Tiden und Strömung geprüft', true],
    ['Vor dem Ablegen', 'Motorraum und Dieselfilter kontrolliert', true],
    ['Vor dem Ablegen', 'Navigation, AIS, Radar und UKW eingeschaltet', false],
    ['Nach dem Anlegen', 'Motorstunden und Tankstand notiert', false],
    ['Sicherheit', 'Rettungsmittel kontrolliert', true]
  ];
  for (let i = 0; i < checks.length; i += 1) {
    const [group, item, done] = checks[i];
    await rawPut('checklists', record('checklists', { id: `guest-check-${i + 1}`, group, item, done }));
  }

  if (photoData) {
    await rawPut('photos', record('photos', {
      id: 'guest-photo-leefke', tripId, date: '2026-07-25', caption: 'LEEFKE unterwegs – Demo-Titelbild',
      relatedType: 'trip', relatedId: tripId, featured: true, data: photoData,
      mimeType: 'image/jpeg', fileName: 'leefke-hero.jpg', size: 0, created: Date.parse('2026-07-25T12:00:00.000Z'),
      _cloudState: 'local'
    }, '2026-07-25T12:00:00.000Z'));
  }

  await metaSet('activeTrip', { tripId, changedAt: now });
  await metaSet('guestSeed', { version: APP_VERSION, createdAt: now });
  await metaSet('dirty', { value: false, changedAt: now });
  await metaSet('lastSync', { at: '', guest: true });
}

function applyGuestModeUI() {
  document.body.classList.toggle('guest-mode', IS_GUEST_MODE);
  const banner = $('#guestModeBanner');
  if (banner) banner.hidden = !IS_GUEST_MODE;
  const cloudHint = $('#documentCloudHint');
  if (cloudHint && IS_GUEST_MODE) cloudHint.textContent = 'Gastmodus: Dokumente bleiben ausschließlich lokal in der getrennten Demo und werden nicht in die Cloud übertragen.';
  const photoStatus = $('#photoCloudStatus');
  if (photoStatus && IS_GUEST_MODE) photoStatus.textContent = 'Gastmodus: Fotos bleiben ausschließlich lokal in der getrennten Demo.';
  for (const selector of ['#syncPhotosButton', '#photoAutoSync']) {
    const element = $(selector);
    if (element) element.disabled = IS_GUEST_MODE;
  }
}

async function setupV6Defaults() {
  if (!(await all('inventory')).length) {
    const defaults = [
      ['default-dieselfilter-vorfilter','Dieselfilter Vorfilter',3,1,'Stück','Motorraum'],
      ['default-motoroel','Motoröl passend für Perkins M135',0,5,'Liter','Vorrat'],
      ['default-impeller','Impeller',1,1,'Stück','Ersatzteilfach'],
      ['default-keilriemen','Keilriemen',1,1,'Stück','Ersatzteilfach'],
      ['default-kuehlmittel','Kühlmittel',0,2,'Liter','Vorrat']
    ];
    for (const item of defaults) await put('inventory',{id:item[0],name:item[1],category:item[1].includes('Diesel')?'Dieselanlage':'Motor',quantity:item[2],minimum:item[3],unit:item[4],location:item[5],note:''});
  }
  if (!(await all('safety')).length) {
    const defaults = [
      ['default-rettungsinsel','Rettungsinsel'],['default-feuerloescher','Feuerlöscher'],
      ['default-rettungswesten','Rettungswesten'],['default-ukw-handfunk','UKW-Handfunkgerät'],
      ['default-erste-hilfe','Erste-Hilfe-Ausrüstung']
    ];
    for (const item of defaults) await put('safety',{id:item[0],name:item[1],lastCheck:'',dueDate:'',status:'ok',note:''});
  }
}

async function applyServiceWorkerUpdate() {
  await createAutoBackup('Vor App-Aktualisierung', true);
  if (pendingServiceWorker) pendingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
  else location.reload();
}

function setupServiceWorkerUpdates(registration) {
  if (!registration) return;
  const show = worker => { pendingServiceWorker=worker; $('#updateBanner').hidden=false; };
  if (registration.waiting) show(registration.waiting);
  registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)show(worker);});});
  navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload());
}

// Zusätzliche UI-Ereignisse. Sie werden nach dem vorhandenen v5-Code gesetzt und ersetzen dessen Medienhandler.
window.addEventListener('load', () => {
  $('#globalTripSelect')?.addEventListener('change', event => setActiveTrip(event.target.value));
  $('#newTripButton')?.addEventListener('click', () => openTripDialog('new'));
  $('#editTripButton')?.addEventListener('click', () => openTripDialog('edit', activeTripId));
  $('#tripForm')?.addEventListener('submit', saveTripForm);
  $('#routeWeatherForm')?.addEventListener('submit', analyzeRouteWeather);
  $('#historyStoreFilter')?.addEventListener('change', renderHistory);
  $('#undoLastChangeButton')?.addEventListener('click', undoLastOwnChange);
  $('#verifySyncButton')?.addEventListener('click', verifySyncState);
  $('#createAutoBackupButton')?.addEventListener('click', async()=>{await createAutoBackup('Manueller Sicherungspunkt',true);await refresh();toast('Sicherungspunkt angelegt')});
  $('#createMaintenanceTemplates')?.addEventListener('click',createMaintenanceTemplates);
  $('#syncPhotosButton')?.addEventListener('click',syncPhotosNow);
  $('#photoAutoSync')?.addEventListener('change',async event=>{await put('settings',{...getSettings(),photoAutoSync:event.target.checked,id:'main'});await refresh()});
  $('#photoForm')?.elements.relatedType?.addEventListener('change',photoRelationOptions);
  $('#applyUpdateButton')?.addEventListener('click',applyServiceWorkerUpdate);
  $('#dismissUpdateButton')?.addEventListener('click',()=>{$('#updateBanner').hidden=true});
  $('#enterGuestModeButton')?.addEventListener('click', enterGuestMode);
  $('#exitGuestButton')?.addEventListener('click', exitGuestMode);
  $('#exitGuestTopButton')?.addEventListener('click', exitGuestMode);
  $('#resetGuestButton')?.addEventListener('click', resetGuestDemo);
  $('#resetGuestTopButton')?.addEventListener('click', resetGuestDemo);
  $('#cleanupChecks')?.addEventListener('click', async () => {
    await cleanupChecklistsV69({ force: true, notify: true });
    await refresh();
  });
  $('#holidayModeToggle')?.addEventListener('change', event => applyHolidayMode(event.target.checked));
  $('#holidayBackupButton')?.addEventListener('click', () => downloadFullBackup({ vacation: true }));
  $('#holidayBackupButtonBackupPage')?.addEventListener('click', () => downloadFullBackup({ vacation: true }));
  applyHolidayMode();
  updateConnectionBanner();
  applyGuestModeUI();
});

// Formulare für Bordbetrieb
for (const [store, formId] of [['inventory','inventoryForm'],['safety','safetyForm']]) {
  const form=$(`#${formId}`); if(form)form.onsubmit=async event=>{event.preventDefault();const item=formObject(form);item.id=item.id||uid();await put(store,item);form.reset();await refresh();toast('Gespeichert')};
}
if($('#documentForm'))$('#documentForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const data=formObject(form);const file=form.elements.file.files[0];let existing=data.id?await getOne('documents',data.id):null;let fileData=existing?.data||'';let mimeType=existing?.mimeType||'';let fileName=existing?.fileName||'';if(file){if(file.size>15e6)return alert('Die Datei ist größer als 15 MB. Bitte verkleinern.');fileData=file.type.startsWith('image/')?await compressImage(file,1800,.82):await blobToDataUrl(file);mimeType=file.type;fileName=file.name;}await put('documents',{...(existing||{}),...data,id:data.id||uid(),data:fileData,mimeType,fileName,size:file?.size||existing?.size||0,_mediaUpdatedAt:file?new Date().toISOString():existing?._mediaUpdatedAt||''});form.reset();await refresh();scheduleSync(200);toast('Dokument gespeichert')};

// Medienhandler ersetzen
if($('#photoForm'))$('#photoForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const fd=new FormData(form);const file=fd.get('photo');if(!file||!file.size)return;if(file.size>15e6)return alert('Das Foto ist größer als 15 MB. Bitte vorher verkleinern.');const data=await compressImage(file,1800,.82);await put('photos',{id:uid(),date:fd.get('date'),caption:fd.get('caption'),relatedType:fd.get('relatedType')||'day',relatedId:fd.get('relatedId')||'',featured:fd.get('featured')==='true',data,mimeType:'image/jpeg',fileName:file.name,size:file.size,created:Date.now(),_mediaUpdatedAt:new Date().toISOString(),_cloudState:'pending'});form.reset();photoRelationOptions();await refresh();scheduleSync(200);toast('Foto verkleinert und gespeichert')};
if($('#boatPhotoInput'))$('#boatPhotoInput').onchange=async event=>{const file=event.target.files[0];if(!file)return;if(file.size>15e6)return alert('Das Startbild ist größer als 15 MB.');const data=await compressImage(file,2000,.86);await put('settings',{...getSettings(),boatPhoto:data,boatPhotoStoragePath:'',_mediaUpdatedAt:new Date().toISOString(),id:'main'});event.target.value='';await refresh();scheduleSync(200);toast('Startbild gespeichert')};


(async () => {
  db = await openDB();
  await seedGuestDemoData();
  await migrateLocalTimestamps();
  await initializeSupabase();
  if (currentSession && navigator.onLine) {
    if (await isLinkedForCurrentUser()) await syncNow({ silent: true, reason: 'startup' });
    else await connectDeviceAutomatically({ silent: true });
  }
  await defaults();
  await repairLeefkeSettingsV610();
  const versionMeta = await metaGet('appVersion');
  if (versionMeta?.value && versionMeta.value !== APP_VERSION) {
    await createAutoBackup(`Update von ${versionMeta.value} auf ${APP_VERSION}`, true);
  }
  await setupV6Defaults();
  await cleanupChecklistsV69();
  await metaSet('appVersion', { value: APP_VERSION, at: new Date().toISOString() });
  const daily = await metaGet('dailyBackup');
  if (!daily?.date || daily.date !== dateInputValue()) {
    await createAutoBackup('Täglicher Sicherungspunkt', true);
    await metaSet('dailyBackup', { date: dateInputValue() });
  }
  await refresh();
  await onlineState();
  if (currentSession) {
    startRealtimeSubscription();
    registerDeviceHeartbeat().catch(error => console.warn('Gerätestatus konnte nicht übertragen werden.', error));
  }
  startAutoSync();
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('service-worker.js');
      setupServiceWorkerUpdates(registration);
      registration.update();
    } catch (error) {
      console.warn('Service Worker konnte nicht registriert werden.', error);
    }
  }
})();

// Android/Standalone: eine eventuell hängen gebliebene Menüsperre sicher lösen.
function verifyMobileScrollState() {
  const navOpen = $('#nav')?.classList.contains('open');
  if (!navOpen) restoreDocumentScrolling();
}
window.addEventListener('pageshow', verifyMobileScrollState);
window.addEventListener('resize', verifyMobileScrollState);
window.addEventListener('orientationchange', () => window.setTimeout(verifyMobileScrollState, 120));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') verifyMobileScrollState();
});

// Mobile Bedienleiste nach dem Laden auf die aktuelle Ansicht abstimmen.
window.addEventListener('DOMContentLoaded', () => {
  const activeView = document.querySelector('.view.active')?.id || 'home';
  updateMobileChrome(activeView);
});
