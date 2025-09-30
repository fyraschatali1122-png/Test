/********* Helpers *********/
const mapCode = (c) => {
  const code = String(c||"").trim().toUpperCase();
  if (["EF","FN"].includes(code)) return "Frühschicht";
  if (["ES","SN"].includes(code)) return "Spätschicht";
  if (["K2N","AK2","AKN","N","NA"].includes(code)) return "Nachtschicht";
  if (["U","O"].includes(code)) return "Urlaub";
  if (code==="AV") return "Frei";
  return code || "";
};
const pad2 = (n)=> String(n).padStart(2,"0");
const toISO = (d, t) => t ? `${d}T${t.length===5?t:pad2(t.split(":")[0])+":"+pad2(t.split(":")[1]||"00")}` : d;

/********* État *********/
let RAW_ROWS = [];
let FILTER = { name:"", schicht:"" };
let calendar;

/********* CSV → Table + Calendar *********/
async function loadCSV(){
  try{
    const res = await fetch(CONFIG.CSV_URL, { cache:'no-store' });
    if(!res.ok) throw new Error('CSV HTTP '+res.status);
    const text = await res.text();
    const parsed = Papa.parse(text, { header:true, skipEmptyLines:true });
    RAW_ROWS = parsed.data.filter(r => (r.Date || r.Datum));

    renderTable(RAW_ROWS);
    renderCalendar(RAW_ROWS);
  }catch(e){
    console.error('CSV Fehler:', e);
    alert('CSV konnte nicht geladen werden.');
  }
}

function renderTable(rows){
  // (restera cachée côté CSS ; utile pour debug)
  const thead = document.getElementById('csvHead');
  const tbody = document.getElementById('csvBody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const trh = document.createElement('tr');
  ['Datum','Beginn','Ende','Name','Dienst'].forEach(h=>{
    const th = document.createElement('th'); th.textContent = h; trh.appendChild(th);
  });
  thead.appendChild(trh);

  rows.forEach(r=>{
    const tr = document.createElement('tr');
    const date = r.Date || r.Datum || '';
    const start = r.Start || r.Beginn || '';
    const end   = r.End   || r.Ende   || '';
    const name  = r.Name  || '';
    const code  = r.Code  || r.Dienst || '';
    tr.innerHTML = `
      <td>${date}</td>
      <td>${start}</td>
      <td>${end}</td>
      <td>${name}</td>
      <td>${mapCode(code)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function rowsToEvents(rows){
  return rows.map(r=>{
    const date = r.Date || r.Datum;
    if(!date) return null;
    const start = r.Start || r.Beginn;
    const end   = r.End   || r.Ende;
    const name  = r.Name || '';
    const codeRaw  = r.Code || r.Dienst || '';
    const schicht  = mapCode(codeRaw);
    const title = `${name} (${schicht})`;

    const ev = (!start)
      ? { title, start: date, allDay:true }
      : { title, start: toISO(date, start), end: end ? toISO(date,end) : undefined };

    // tag pour couleur
    ev.extendedProps = { schicht };
    ev.classNames = [ classForSchicht(schicht) ];
    return ev;
  }).filter(Boolean);
}

function classForSchicht(s){
  const k = String(s||'').toLowerCase();
  if (k.includes('früh')) return 'frueh';
  if (k.includes('spät')) return 'spaet';
  if (k.includes('nacht')) return 'nacht';
  if (k.includes('urlaub')) return 'urlaub';
  if (k.includes('frei')) return 'frei';
  return '';
}

function applyFilters(rows){
  return rows.filter(r=>{
    const name = (r.Name || '').toLowerCase();
    const sch  = mapCode(r.Code || r.Dienst).toLowerCase();
    const okName = FILTER.name ? name.includes(FILTER.name.toLowerCase()) : true;
    const okSch  = FILTER.schicht ? (sch === FILTER.schicht.toLowerCase()) : true;
    return okName && okSch;
  });
}

function renderCalendar(rows){
  const target = document.getElementById('calendar');
  const filtered = applyFilters(rows);
  const events = rowsToEvents(filtered);

  if(!calendar){
    calendar = new FullCalendar.Calendar(target, {
      initialView: 'dayGridMonth',
      locale: 'de',
      firstDay: 1,
      headerToolbar: { left:'prev,next today', center:'title', right:'dayGridMonth,timeGridWeek,timeGridDay' },
      events
    });
    calendar.render();
  } else {
    calendar.removeAllEvents();
    calendar.addEventSource(events);
    calendar.render();
  }
}

/********* Filtres *********/
function bindFilters(){
  document.getElementById('filterName').addEventListener('input', (e)=>{
    FILTER.name = e.target.value.trim();
    renderCalendar(RAW_ROWS);
    // on ne montre pas la table (cachée), donc pas besoin de rerenderTable
  });
  document.getElementById('filterCode').addEventListener('change', (e)=>{
    FILTER.schicht = e.target.value.trim();
    renderCalendar(RAW_ROWS);
  });
  document.getElementById('btnReset').addEventListener('click', ()=>{
    FILTER = { name:'', schicht:'' };
    document.getElementById('filterName').value = '';
    document.getElementById('filterCode').value = '';
    renderCalendar(RAW_ROWS);
  });
}

/********* Wünsche API *********/
async function loadRequests(){
  try{
    const url = `${CONFIG.WEBAPP_URL}?action=requests&t=${Date.now()}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    if(!j.ok) throw new Error(j.error||'API Fehler');

    const items = j.items || [];
    const open = items.filter(x => String(x.status||'').toLowerCase()==='open');
    const accepted = items
      .filter(x => String(x.status||'').toLowerCase()==='accepted')
      .sort((a,b)=> String(b.accepted_at||'').localeCompare(String(a.accepted_at||'')));

    renderRequests(open);
    renderAccepted(accepted);
  }catch(e){
    console.error('Requests Fehler:', e);
    document.getElementById('reqList').innerHTML = `<div class="muted">Fehler beim Laden.</div>`;
    document.getElementById('reqAcceptedList').innerHTML = `<div class="muted">–</div>`;
  }
}

function renderRequests(items){
  const box = document.getElementById('reqList');
  box.innerHTML = '';
  if(!items.length){
    box.innerHTML = `<div class="muted">Noch keine offenen Anfragen.</div>`;
    return;
  }
  items
    .sort((a,b)=> String(a.date||'').localeCompare(String(b.date||'')) || String(a.name||'').localeCompare(String(b.name||'')))
    .forEach(it=>{
      const div = document.createElement('div');
      div.className = 'req-item';
      const info = document.createElement('div');
      info.className = 'req-info';
      const schicht = mapCode(it.code || '');
      const noteTxt = it.note ? ` · ${it.note}` : '';
      info.innerHTML = `<strong>${it.date||''}</strong> ${it.name||''} <span class="muted">(${schicht}${noteTxt})</span>`;
      const btn = document.createElement('button');
      btn.textContent = 'Akzeptieren';
      btn.addEventListener('click', ()=> acceptRequest(it.id));
      div.appendChild(info);
      div.appendChild(btn);
      box.appendChild(div);
    });
}

function renderAccepted(items){
  const box = document.getElementById('reqAcceptedList');
  box.innerHTML = '';
  if(!items.length){
    box.innerHTML = `<div class="muted">Keine angenommenen Anfragen.</div>`;
    return;
  }
  items.forEach(it=>{
    const schicht = mapCode(it.code || '');
    const who = it.accepter_name ? ` — angenommen von ${it.accepter_name}` : '';
    const when = it.accepted_at ? ` (${String(it.accepted_at).toString().slice(0,16)})` : '';
    const div = document.createElement('div');
    div.className = 'req-item';
    div.innerHTML = `
      <div class="req-info">
        <strong>${it.date||''}</strong> ${it.name||''} <span class="muted">(${schicht})</span>
        <span class="muted">Status: accepted${who}${when}</span>
      </div>
    `;
    box.appendChild(div);
  });
}

async function sendRequest(){
  const name = document.getElementById('reqName').value.trim();
  const date = document.getElementById('reqDate').value;
  const code = document.getElementById('reqCode').value;
  const note = document.getElementById('reqNote').value.trim();
  if(!name || !date || !code){ alert('Bitte Name, Datum und Dienst wählen.'); return; }

  const url = `${CONFIG.WEBAPP_URL}?action=add&name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&code=${encodeURIComponent(code)}&note=${encodeURIComponent(note)}&t=${Date.now()}`;
  try{
    const r = await fetch(url);
    const j = await r.json();
    if(!j.ok) throw new Error(j.error||'Fehler');
    document.getElementById('reqNote').value = '';
    await loadRequests();
    alert('Anfrage gesendet (ID: '+j.id+').');
  }catch(e){
    console.error(e);
    alert('Fehler beim Senden: '+e.message);
  }
}

async function acceptRequest(id){
  if(!id) return;
  const accepter = prompt('Dein Name zum Übernehmen:');
  if(!accepter) return;
  const url = `${CONFIG.WEBAPP_URL}?action=accept&id=${encodeURIComponent(id)}&accepter=${encodeURIComponent(accepter)}&t=${Date.now()}`;
  try{
    const r = await fetch(url);
    const j = await r.json();
    if(!j.ok) throw new Error(j.error||'Fehler');
    await loadRequests();
    alert('Übernommen.');
  }catch(e){
    console.error(e);
    alert('Fehler beim Akzeptieren: '+e.message);
  }
}

/********* Init *********/
window.addEventListener('DOMContentLoaded', async ()=>{
  bindFilters();
  await loadCSV();
  await loadRequests();
  document.getElementById('btnSendReq')?.addEventListener('click', sendRequest);
});
