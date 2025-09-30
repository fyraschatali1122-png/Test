// script.js

// Charger le planning depuis le CSV
async function loadCSV() {
  try {
    const response = await fetch(CONFIG.CSV_URL);
    const text = await response.text();

    // Découper les lignes
    const rows = text.split("\n").map(r => r.split(","));
    const table = document.getElementById("csvTable");

    // Vider la table avant de remplir
    table.innerHTML = "";

    // Ajouter chaque ligne du CSV dans un tableau HTML
    rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      row.forEach(col => {
        const td = document.createElement(i === 0 ? "th" : "td");
        td.textContent = col.trim();
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
  } catch (err) {
    console.error("Erreur CSV:", err);
  }
}

// Charger la liste des demandes depuis la WebApp
async function loadRequests() {
  try {
    const response = await fetch(CONFIG.WEBAPP_URL + "?action=requests");
    const data = await response.json();

    const list = document.getElementById("requestsList");
    list.innerHTML = "";

    if (data.items && data.items.length > 0) {
      data.items.forEach(item => {
        const li = document.createElement("li");
        li.textContent = `${item.date} - ${item.name} (${item.status})`;
        list.appendChild(li);
      });
    } else {
      list.innerHTML = "<li>Aucune demande ouverte</li>";
    }
  } catch (err) {
    console.error("Erreur WebApp:", err);
  }
}

// Envoyer une nouvelle demande
async function sendRequest() {
  const name = document.getElementById("reqName").value;
  const date = document.getElementById("reqDate").value;
  const code = document.getElementById("reqCode").value;
  const note = document.getElementById("reqNote").value;

  const url = `${CONFIG.WEBAPP_URL}?action=add&name=${encodeURIComponent(name)}&date=${encodeURIComponent(date)}&code=${encodeURIComponent(code)}&note=${encodeURIComponent(note)}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.ok) {
      alert("Demande envoyée !");
      loadRequests(); // rafraîchir la liste
    } else {
      alert("Erreur: " + data.error);
    }
  } catch (err) {
    console.error("Erreur envoi:", err);
  }
}

// Lancer au chargement de la page
window.onload = function () {
  loadCSV();
  loadRequests();

  document.getElementById("sendBtn").addEventListener("click", sendRequest);
};
