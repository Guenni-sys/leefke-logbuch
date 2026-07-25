const APP_VERSION = 4;
const DB_NAME = 'leefke-v2';
const DB_VERSION = 2;
const stores = ['days', 'fuel', 'maintenance', 'photos', 'checklists', 'route', 'ports', 'settings', 'gpx'];

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

let db;
let state = {};

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
      stores.forEach(store => {
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

function put(store, value) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readwrite').objectStore(store).put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function del(store, id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readwrite').objectStore(store).delete(id);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

function clear(store) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readwrite').objectStore(store).clear();
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 2100);
}

function view(id) {
  $$('.view').forEach(section => section.classList.toggle('active', section.id === id));
  $$('nav button').forEach(button => button.classList.toggle('active', button.dataset.view === id));
  $('#nav').classList.remove('open');
  if (id === 'report') buildReport();
  if (id === 'day') prepareDayForm();
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
        hours: '', status: 'planned', note: ''
      });
    }
  }

  const settingsRows = await all('settings');
  if (!settingsRows.length) {
    await put('settings', { ...DEFAULT_SETTINGS });
  } else {
    const existing = settingsRows.find(item => item.id === 'main') || settingsRows[0];
    const migrated = { ...DEFAULT_SETTINGS, ...existing, id: 'main' };
    if (migrated.homePort === 'Lemwerder') migrated.homePort = 'Weser Yacht Club Lemwerder';
    if (!migrated.model) migrated.model = 'Finse';
    await put('settings', migrated);
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

function stars(value, large = false) {
  const rating = clamp(Math.round(num(value)), 0, 5);
  return `<span class="stars${large ? ' large' : ''}" aria-label="${rating} von 5 Sternen">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>`;
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
}

function renderTank(settings) {
  const latestFuelWithLevel = state.fuel.find(item => item.tankPercent !== '' && item.tankPercent !== undefined && item.tankPercent !== null);
  const rawPercent = latestFuelWithLevel ? latestFuelWithLevel.tankPercent : settings.currentTankPercent;
  const hasValue = rawPercent !== '' && rawPercent !== undefined && rawPercent !== null;
  const percent = hasValue ? clamp(num(rawPercent), 0, 100) : 0;
  const capacity = num(settings.tankCapacity) || 400;
  const liters = capacity * percent / 100;
  $('#tankFill').style.width = `${percent}%`;
  $('#tankPercent').textContent = hasValue ? `${dec2(percent)} %` : '—';
  $('#tankLiters').textContent = hasValue ? `etwa ${dec2(liters)} von ${dec2(capacity)} Litern` : `Tankkapazität ${dec2(capacity)} Liter · Stand noch nicht eingetragen`;
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

function renderRoute() {
  const routes = [...state.route].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const nauticalMiles = routes.filter(item => item.status !== 'skip').reduce((sum, item) => sum + num(item.nm), 0);
  const hours = routes.filter(item => item.status !== 'skip').reduce((sum, item) => sum + num(item.hours), 0);
  $('#routeSummary').innerHTML = `${routes.length} Etappen · ${dec(nauticalMiles)} sm geplant${hours ? ` · ${dec(hours)} Stunden Planzeit` : ''}`;
  $('#routeList').innerHTML = routes.map(item => `<article class="route ${esc(item.status || 'planned')}">
    ${actionButtons('route', item.id)}
    <div class="meta">${fmtDate(item.date)} · ${dec(item.nm)} sm · ${item.status === 'done' ? 'gefahren' : item.status === 'skip' ? 'entfällt' : 'geplant'}</div>
    <h3>${esc(item.from)} → ${esc(item.to)}</h3><p>${esc(item.note || '')}</p>
  </article>`).join('') || '<div class="card muted">Noch keine Etappen geplant.</div>';
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
      <div class="port-head"><div><div class="meta">${fmtDate(item.date)}</div><h3>${esc(item.name)}</h3></div>${stars(item.rating || 0, true)}</div>
      <div class="meta">Liegeplatz: ${esc(item.berth || '—')} · ${item.cost ? eur(item.cost) : 'Kosten —'}</div>
      <span class="return-badge ${returnClass}">${returnText}</span>
      <div class="rating-grid">
        <div><span>Freundlichkeit</span>${stars(item.ratingFriendly || item.rating || 0)}</div>
        <div><span>Sanitär</span>${stars(item.ratingSanitary || item.rating || 0)}</div>
        <div><span>Versorgung</span>${stars(item.ratingSupply || item.rating || 0)}</div>
        <div><span>Preis / Leistung</span>${stars(item.ratingValue || item.rating || 0)}</div>
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
  const select = $('#gpxSelect');
  const current = select.value;
  select.innerHTML = '<option value="">Keine GPX-Route</option>' + state.gpx.map(item => `<option value="${item.id}">${esc(item.name)} (${dec(item.distanceNm)} sm)</option>`).join('');
  if (state.gpx.some(item => item.id === current)) select.value = current;
  else if (state.gpx[0]) select.value = state.gpx[0].id;
  drawGpx(select.value);
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
    form.reset();
    await refresh();
    toast(id === 'port' ? 'Hafen mit Sternen gespeichert' : 'Gespeichert');
  };
}

$('#settingsForm').onsubmit = async event => {
  event.preventDefault();
  const current = getSettings();
  const updated = { ...current, ...formObject(event.target), id: 'main' };
  await put('settings', updated);
  await refresh();
  toast('Schiffsdaten der LEEFKE gespeichert');
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
    const points = [...xml.querySelectorAll('trkpt,rtept')]
      .map(point => [num(point.getAttribute('lat')), num(point.getAttribute('lon'))])
      .filter(point => point.every(Number.isFinite));
    if (points.length < 2) throw new Error('Keine Route');
    const distance = points.slice(1).reduce((sum, point, index) => sum + haversine(points[index], point), 0);
    await put('gpx', { id: uid(), name: file.name.replace(/\.gpx$/i, ''), points, distanceNm: distance, created: Date.now() });
    await refresh();
    $('#gpxInfo').textContent = `${points.length} Punkte · ${dec(distance)} sm importiert`;
    toast('GPX-Route importiert');
  } catch (error) {
    alert('Die GPX-Datei konnte nicht gelesen werden.');
  }
};

$('#gpxSelect').onchange = event => drawGpx(event.target.value);

function drawGpx(id) {
  const svg = $('#routeMap');
  const route = state.gpx?.find(item => item.id === id);
  if (!route) {
    svg.innerHTML = '<text x="450" y="240" text-anchor="middle">Noch keine GPX-Route importiert</text>';
    return;
  }
  const points = route.points;
  const minLat = Math.min(...points.map(point => point[0]));
  const maxLat = Math.max(...points.map(point => point[0]));
  const minLon = Math.min(...points.map(point => point[1]));
  const maxLon = Math.max(...points.map(point => point[1]));
  const pad = 35, width = 900, height = 480;
  const scaleX = (width - 2 * pad) / (maxLon - minLon || 1);
  const scaleY = (height - 2 * pad) / (maxLat - minLat || 1);
  const scale = Math.min(scaleX, scaleY);
  const plot = points.map(point => [pad + (point[1] - minLon) * scale, height - pad - (point[0] - minLat) * scale]);
  const path = plot.map(point => point.join(',')).join(' ');
  const start = plot[0], end = plot.at(-1);
  svg.innerHTML = `<polyline points="${path}"/><circle cx="${start[0]}" cy="${start[1]}" r="8"/><circle cx="${end[0]}" cy="${end[1]}" r="8"/><text x="${start[0] + 12}" y="${start[1] - 10}">Start</text><text x="${end[0] + 12}" y="${end[1] - 10}">Ziel</text><text x="20" y="28">${esc(route.name)} · ${dec(route.distanceNm)} sm</text>`;
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
    ${days.map(day => {
      const dayPhotos = photos.filter(photo => photo.date === day.date);
      return `<section class="report-day"><h2>${fmtDate(day.date)} · ${esc(day.title || `${day.fromPort || ''} → ${day.toPort || ''}`)}</h2><p class="meta">${esc(day.fromPort || '')} → ${esc(day.toPort || '')} · ${dec(day.distance)} sm · ${esc(day.wind || '')} · ${esc(day.wave || '')}</p><p>${esc(day.summary || '').replace(/\n/g, '<br>')}</p>${day.moment ? `<blockquote>„${esc(day.moment)}“</blockquote>` : ''}${dayPhotos.map(photo => `<figure><img class="report-photo" src="${photo.data}" alt="${esc(photo.caption || '')}"><figcaption>${esc(photo.caption || '')}</figcaption></figure>`).join('')}</section>`;
    }).join('') || '<p>Noch keine Tagesberichte vorhanden.</p>'}`;
}

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

$('#menu').onclick = () => $('#nav').classList.toggle('open');
$$('nav button').forEach(button => button.onclick = () => view(button.dataset.view));
$$('[data-open]').forEach(button => button.onclick = () => view(button.dataset.open));

function onlineState() {
  $('#onlineState').textContent = navigator.onLine ? 'online · offlinefähig' : 'offline';
}
window.addEventListener('online', onlineState);
window.addEventListener('offline', onlineState);

(async () => {
  db = await openDB();
  await defaults();
  await refresh();
  onlineState();
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('service-worker.js');
      registration.update();
    } catch (error) {
      console.warn('Service Worker konnte nicht registriert werden.', error);
    }
  }
})();
