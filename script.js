// === Utilitaires ===
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

// === État global ===
let RAW_ROWS = [];       // lignes CSV brutes {Date,Start,End,Name,Code}
let FILTER = { name:"", schicht:"" };
let calendar;

// === Chargement CSV & rendu calendrier/table ===
async function loadCSV(){
  try{
    const res = await fetch(CONFIG.CSV_URL, { cache:'no-store' });
    if(!res.ok) throw new Error('CSV HTTP '+res.status);
    const text = await res.text();
    const parsed = Papa.parse(text, { header:true, skipEmptyLines:true });
    RAW_ROWS = parsed.data.filter(r => (r.Date || r.Datum)); // tolère 'Datum'

    renderTable(RAW_ROWS);
    renderCalendar(RAW_ROWS);
  }catch(e){
    console.error('CSV Fehler:', e);
    alert('CSV konnte nicht geladen werden.');
  }
}

function renderTable(rows){
  const thead = document.getElementById('csvHead');
  const tbody = document.getElementById('csvBody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  // entêtes
  const trh = document.createElement('tr');
  ['Datum','Beginn','Ende','Name','Dienst'].forEach(h=>{
    const th = document.createElement('th'); th.textContent = h; trh.appendChild(th);
  });
  thead.appendChild(trh);

  // lignes
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
    const code  = r.Code || r.Dienst || '';
    const title = `${name} (${mapCode(code)})`;
    if(!start) return { title, start: date, allDay:true };
    return {
      title,
      start: toISO(date, start),
      end: end ? toISO(date, end) : undefined
    };
  }).filter(Boolean);
}

function applyFilters(rows){
  return rows.filter(r=>{
    const name  = (r.Name || '').toLowerCase();
    const code  = mapCode(r.Code || r.Dienst).toLowerCase();
    const byName = FILTER.name ? name.includes(FILTER.name.toLowerCase()) : true;
    const byCode = FILTER.schicht ? (code === FILTER.schicht.toLowerCase()) : true;
    return byName && byCode;
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

// === Filtres UI ===
function bindFilters(){
  document.getElementById('filterName').addEventListener('input', (e)=>{
    FILTER.name = e.target.value.trim();
    renderCalendar(RAW_ROWS);
    renderTable(applyFilters(RAW_ROWS));
  });
  document.getElementById('filterCode').addEventListener('change', (e)=>{
    FILTER.schicht = e.target.value.trim();
    renderCalendar(RAW_ROWS);
    renderTable(applyFilters(RAW_ROWS));
  });
  document.getElementById('btnReset').addEventListener('click', ()=>{
    FILTER = { name:'', schicht:'' };
    document.getElementById('filterName').value = '';
    document.getElementById('filterCode').value = '';
    renderCalendar(RAW_ROWS);
    renderTable(RAW_ROWS);
  });
}

// === Wünsche API ===
async function loadRequests(){
  try{
    const url = `${CONFIG.WEBAPP_URL}?action=requests&status=open&t=${Date.now()}`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    if(!j.ok) throw new Error(j.error||'API Fehler');
    renderRequests(j.items || []);
  }catch(e){
    console.error('Requests Fehler:', e);
    document.getElementById('reqList').innerHTML = `<div class="muted">Fehler beim Laden.</div>`;
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
      info.innerHTML = `<strong>${it.date || ''}</strong> ${it.name || ''} <span class="chip">${it.code || ''}${it.note ? ' · '+it.note : ''}</span>`;
      const btn = document.createElement('button');
      btn.textContent = 'Akzeptieren';
      btn.addEventListener('click', ()=> acceptRequest(it.id));
      div.appendChild(info);
      div.appendChild(btn);
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

// === Init ===
window.addEventListener('DOMContentLoaded', async ()=>{
  bindFilters();
  await loadCSV();
  await loadRequests();
  document.getElementById('btnSendReq')?.addEventListener('click', sendRequest);
});
