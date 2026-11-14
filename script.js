/* ============================================================
 *  KONFIGURASI — GANTI DENGAN URL & API KEY ANDA
 * ============================================================ */
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbz7wLGpIx-E69jiguOH8SOY05z-rbzmi7UMO0m00d1NvnCEfcTtyCOAUt51Kjiuk3Txkg/exec";
const API_KEY    = "ABSENSI-RAHASIA-2025";

let usersCache = [];
let attendanceCache = [];
let rekapCache = [];

/* ---------- UTIL: GET via JSONP (menghindari CORS Apps Script) ---------- */
function jsonp(action, extraParams = {}) {
  return new Promise((resolve, reject) => {
    const cb = "jsonpCb_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    const params = new URLSearchParams({ action, api_key: API_KEY, callback: cb, ...extraParams });
    const script = document.createElement("script");
    script.src = `${WEBAPP_URL}?${params.toString()}`;
    const timer = setTimeout(() => { cleanup(); reject(new Error("Timeout")); }, 12000);

    window[cb] = (data) => {
      cleanup();
      if (data.status === "error") reject(new Error(data.message));
      else resolve(data);
    };
    function cleanup() {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    }
    script.onerror = () => { cleanup(); reject(new Error("Gagal memuat")); };
    document.body.appendChild(script);
  });
}

/* ---------- UTIL: POST ke Apps Script ---------- */
async function postAction(action, payload = {}) {
  const body = JSON.stringify({ api_key: API_KEY, action, ...payload });
  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body
  });
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message);
  return data;
}

/* ---------- TAB NAVIGATION ---------- */
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "users") loadUsers();
    if (btn.dataset.tab === "attendance") loadAttendance();
    if (btn.dataset.tab === "settings") loadSettings();
  });
});

/* ---------- JAM ---------- */
function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toLocaleTimeString("id-ID");
  document.getElementById("todayDate").textContent = now.toLocaleDateString("id-ID", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}
setInterval(updateClock, 1000);
updateClock();

/* ---------- DASHBOARD ---------- */
async function loadDashboard() {
  try {
    const d = await jsonp("getDashboard");
    document.getElementById("statTotal").textContent = d.totalUsers;
    document.getElementById("statHadir").textContent = d.hadir;
    document.getElementById("statTerlambat").textContent = d.terlambat;
    document.getElementById("statBelum").textContent = d.belumHadir;
    document.getElementById("statPersen").textContent = d.persentase + "%";
    setConnStatus(true);
  } catch (e) {
    console.error(e);
    setConnStatus(false);
  }
}

function setConnStatus(ok) {
  const el = document.getElementById("connStatus");
  el.textContent = ok ? "ESP32: Online" : "ESP32: Offline";
  el.className = "badge " + (ok ? "online" : "offline");
}

/* ---------- USERS ---------- */
async function loadUsers() {
  const data = await jsonp("getUsers");
  usersCache = data.data || [];
  renderUsers();
}

function renderUsers() {
  const q = document.getElementById("searchUser").value.toLowerCase();
  const tbody = document.querySelector("#usersTable tbody");
  tbody.innerHTML = "";
  usersCache
    .filter(u => !q || String(u["ID Fingerprint"]).includes(q) || (u["Nama"] || "").toLowerCase().includes(q))
    .forEach(u => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${u["ID Fingerprint"]}</td>
        <td>${u["NIS"] || ""}</td>
        <td>${u["Nama"] || ""}</td>
        <td>${u["Kelas"] || ""}</td>
        <td>${u["Jenis Kelamin"] || ""}</td>
        <td>${u["Status"] || "Aktif"}</td>
        <td>
          <button class="btn" onclick='editUser(${JSON.stringify(u)})'>Edit</button>
          <button class="btn danger" onclick="deleteUser(${u["ID Fingerprint"]})">Hapus</button>
        </td>`;
      tbody.appendChild(tr);
    });
}

document.getElementById("searchUser").addEventListener("input", renderUsers);

function openUserModal(user = null) {
  document.getElementById("userModal").classList.remove("hidden");
  const edit = !!user;
  document.getElementById("modalTitle").textContent = edit ? "Edit Pengguna" : "Tambah Pengguna";
  document.getElementById("uEditMode").value = edit ? "1" : "0";
  document.getElementById("uId").value = user ? user["ID Fingerprint"] : "";
  document.getElementById("uId").disabled = edit;
  document.getElementById("uNis").value = user ? user["NIS"] : "";
  document.getElementById("uNama").value = user ? user["Nama"] : "";
  document.getElementById("uKelas").value = user ? user["Kelas"] : "";
  document.getElementById("uJk").value = user ? user["Jenis Kelamin"] : "L";
  document.getElementById("uStatus").value = user ? user["Status"] : "Aktif";
}

function closeUserModal() { document.getElementById("userModal").classList.add("hidden"); }
function editUser(u) { openUserModal(u); }

async function saveUser() {
  const payload = {
    fingerprint_id: document.getElementById("uId").value,
    nis: document.getElementById("uNis").value,
    nama: document.getElementById("uNama").value,
    kelas: document.getElementById("uKelas").value,
    jenis_kelamin: document.getElementById("uJk").value,
    status: document.getElementById("uStatus").value
  };
  if (!payload.fingerprint_id || !payload.nama) return alert("ID dan Nama wajib diisi.");
  const action = document.getElementById("uEditMode").value === "1" ? "updateUser" : "addUser";
  await postAction(action, payload);
  closeUserModal();
  loadUsers();
  loadDashboard();
}

async function deleteUser(id) {
  if (!confirm("Hapus pengguna ini?")) return;
  await postAction("deleteUser", { fingerprint_id: id });
  loadUsers();
  loadDashboard();
}

/* ---------- ATTENDANCE ---------- */
async function loadAttendance() {
  const tgl = document.getElementById("filterTanggal").value;
  const data = await jsonp("getAttendance", tgl ? { tanggal: tgl } : {});
  attendanceCache = data.data || [];
  const tbody = document.querySelector("#attendanceTable tbody");
  tbody.innerHTML = "";
  attendanceCache.forEach((r, i) => {
    const cls = r["Status"] === "Hadir" ? "status-hadir" : "status-terlambat";
    tbody.innerHTML += `<tr>
      <td>${i + 1}</td><td>${r["ID Fingerprint"]}</td><td>${r["Nama"]}</td>
      <td>${r["NIS"]}</td><td>${r["Kelas"]}</td><td>${r["Tanggal"]}</td>
      <td>${r["Jam"]}</td><td class="${cls}">${r["Status"]}</td>
    </tr>`;
  });
}

/* ---------- REKAP ---------- */
async function loadRekap() {
  const params = {
    start: document.getElementById("rekapStart").value,
    end: document.getElementById("rekapEnd").value,
    kelas: document.getElementById("rekapKelas").value
  };
  const d = await jsonp("getRekap", params);
  rekapCache = d.data || [];
  document.getElementById("rekapHadir").textContent = d.totalHadir;
  document.getElementById("rekapTerlambat").textContent = d.totalTerlambat;
  document.getElementById("rekapBelum").textContent = d.totalTidakHadir;
  const tbody = document.querySelector("#rekapTable tbody");
  tbody.innerHTML = "";
  rekapCache.forEach(r => {
    tbody.innerHTML += `<tr><td>${r["Tanggal"]}</td><td>${r["Nama"]}</td>
      <td>${r["Kelas"]}</td><td>${r["Jam"]}</td><td>${r["Status"]}</td></tr>`;
  });
}

/* ---------- EXPORT CSV ---------- */
function exportCSV(type) {
  const rows = type === "rekap" ? rekapCache : attendanceCache;
  if (!rows.length) return alert("Tidak ada data untuk diexport.");
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${r[h] ?? ""}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `absensi_${type}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

/* ---------- SETTINGS ---------- */
async function loadSettings() {
  const s = await jsonp("getSettings");
  document.getElementById("setNama").value = s.namaSekolah || "";
  document.getElementById("setJamMasuk").value = s.jamMasuk || "07:00";
  document.getElementById("setBatas").value = s.batasTerlambat || "07:15";
  document.getElementById("setTahun").value = s.tahunAjaran || "";
  document.getElementById("schoolName").textContent = s.namaSekolah || "";
}

async function saveSettings() {
  const payload = {
    namaSekolah: document.getElementById("setNama").value,
    jamMasuk: document.getElementById("setJamMasuk").value,
    batasTerlambat: document.getElementById("setBatas").value,
    tahunAjaran: document.getElementById("setTahun").value
  };
  await postAction("saveSettings", payload);
  alert("Pengaturan disimpan.");
  loadSettings();
  loadDashboard();
}

/* ---------- INIT ---------- */
loadDashboard();
loadSettings();
setInterval(loadDashboard, 30000); // refresh dashboard tiap 30 detik