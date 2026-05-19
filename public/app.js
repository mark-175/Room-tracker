'use strict';

// Frontend logic. Mirrors the original prototype's "one render() rebuilds
// everything from state" pattern, but `rooms` is now loaded from the REST API
// instead of a hardcoded array, and every mutation calls the API then
// re-fetches before re-rendering so the DB stays the source of truth.
//
// "Overdue" is still derived here (never stored): a non-Done room past its
// deadline. completedDate is stamped server-side.

let rooms = [];
let filter = 'all';
let search = '';
let chart;

const $ = id => document.getElementById(id);

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

async function loadRooms() {
  try {
    rooms = await api('GET', '/api/rooms');
    render();
  } catch (e) {
    alert('Could not load rooms: ' + e.message);
  }
}

function isOverdue(r) {
  if (r.status === 'Done' || !r.deadline) return false;
  return new Date(r.deadline) < new Date(new Date().toISOString().slice(0, 10));
}
function effectiveStatus(r) {
  return isOverdue(r) ? 'Overdue' : r.status;
}

function badgeStatus(s) {
  if (s === 'Done') return 'badge-done';
  if (s === 'In Progress') return 'badge-progress';
  if (s === 'Overdue') return 'badge-overdue';
  return 'badge-todo';
}
function badgeDiff(d) {
  if (d === 'Easy') return 'badge-easy';
  if (d === 'Medium') return 'badge-medium';
  return 'badge-hard';
}
function fmt(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function matchesSearch(r) {
  if (!search) return true;
  const q = search.toLowerCase();
  return r.name.toLowerCase().includes(q)
    || r.category.toLowerCase().includes(q)
    || (r.tags || []).some(t => t.toLowerCase().includes(q));
}

const linkIcon = '<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h5"/></svg>';
const alertIcon = '<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
const trashIcon = '<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';

function render() {
  const done = rooms.filter(r => r.status === 'Done').length;
  const inprog = rooms.filter(r => r.status === 'In Progress').length;
  const overdue = rooms.filter(isOverdue).length;
  const total = rooms.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  $('metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Total rooms</div><div class="metric-value">${total}</div></div>
    <div class="metric"><div class="metric-label">Completed</div><div class="metric-value green">${done}</div></div>
    <div class="metric"><div class="metric-label">In progress</div><div class="metric-value amber">${inprog}</div></div>
    <div class="metric"><div class="metric-label">Overdue</div><div class="metric-value ${overdue > 0 ? 'red' : ''}">${overdue}</div></div>
  `;

  $('progress-bar').style.width = pct + '%';
  $('pct-label').textContent = pct + '% complete';

  const visible = rooms.filter(r =>
    (filter === 'all' || effectiveStatus(r) === filter) && matchesSearch(r));

  $('room-count').textContent = `${visible.length} room${visible.length !== 1 ? 's' : ''}`;
  $('empty-state').hidden = visible.length !== 0;

  $('room-tbody').innerHTML = visible.map(r => {
    const es = effectiveStatus(r);
    const od = isOverdue(r);
    const nameCell = r.url
      ? `<a class="room-link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)} ${linkIcon}</a>`
      : esc(r.name);
    const tagsCell = (r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('') || '<span class="muted-sm">—</span>';
    return `<tr data-id="${r.id}">
      <td><input type="checkbox" class="js-toggle" ${r.status === 'Done' ? 'checked' : ''} aria-label="Mark ${esc(r.name)} done"></td>
      <td><span class="room-name">${nameCell}${od ? `<span class="overdue-hint" title="Past deadline">${alertIcon}</span>` : ''}</span></td>
      <td class="muted-sm">${esc(r.category)}</td>
      <td><span class="badge ${badgeDiff(r.difficulty)}">${esc(r.difficulty)}</span></td>
      <td class="tags-cell">${tagsCell}</td>
      <td class="muted-sm" style="color:${od ? '#a32d2d' : 'var(--color-text-secondary)'}">${fmt(r.deadline)}</td>
      <td class="muted-sm">${fmt(r.completedDate)}</td>
      <td><span class="badge status-badge ${badgeStatus(es)} js-cycle" title="Click to cycle status">${es}</span></td>
      <td><button class="delete-btn js-delete" title="Remove room">${trashIcon}</button></td>
    </tr>`;
  }).join('');

  updateChart();
}

function updateChart() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const completed = new Array(12).fill(0);
  const planned = new Array(12).fill(0);
  rooms.forEach(r => {
    if (r.deadline) {
      const m = parseInt(r.deadline.split('-')[1], 10) - 1;
      planned[m]++;
      if (r.status === 'Done') completed[m]++;
    }
  });

  if (chart) chart.destroy();
  chart = new Chart($('myChart'), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: 'Completed', data: completed, backgroundColor: '#639922', borderRadius: 4 },
        { label: 'Planned', data: planned, backgroundColor: '#d3d1c7', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: 'rgba(128,128,128,0.15)' } },
      },
    },
  });
}

async function addRoom() {
  const name = $('inp-name').value.trim();
  if (!name) { $('inp-name').focus(); return; }
  try {
    await api('POST', '/api/rooms', {
      name,
      url: $('inp-url').value.trim(),
      category: $('inp-cat').value,
      difficulty: $('inp-diff').value,
      deadline: $('inp-deadline').value,
      tags: $('inp-tags').value,
    });
    ['inp-name', 'inp-url', 'inp-deadline', 'inp-tags'].forEach(id => ($(id).value = ''));
    await loadRooms();
    $('inp-name').focus();
  } catch (e) {
    alert('Could not add room: ' + e.message);
  }
}

async function patchRoom(id, patch) {
  try {
    await api('PATCH', '/api/rooms/' + id, patch);
    await loadRooms();
  } catch (e) {
    alert('Could not update room: ' + e.message);
  }
}

function toggleDone(id) {
  const r = rooms.find(x => x.id === id);
  if (!r) return;
  patchRoom(id, { status: r.status === 'Done' ? 'To Do' : 'Done' });
}

function cycleStatus(id) {
  const r = rooms.find(x => x.id === id);
  if (!r) return;
  const cycle = ['To Do', 'In Progress', 'Done'];
  patchRoom(id, { status: cycle[(cycle.indexOf(r.status) + 1) % 3] });
}

async function deleteRoom(id) {
  const r = rooms.find(x => x.id === id);
  if (!confirm(`Delete "${r ? r.name : 'this room'}"?`)) return;
  try {
    await api('DELETE', '/api/rooms/' + id);
    await loadRooms();
  } catch (e) {
    alert('Could not delete room: ' + e.message);
  }
}

async function importFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (_) {
    alert('That file is not valid JSON.');
    return;
  }
  const list = Array.isArray(data) ? data : data.rooms;
  if (!Array.isArray(list)) {
    alert('No "rooms" array found in that file.');
    return;
  }
  if (!confirm(`Import ${list.length} room(s)? This REPLACES all current rooms.`)) return;
  try {
    await api('POST', '/api/import', { rooms: list });
    await loadRooms();
    alert('Import complete.');
  } catch (e) {
    alert('Import failed: ' + e.message);
  }
}

// --- Event wiring (delegated; table rows are re-rendered constantly) ---
$('btn-add').addEventListener('click', addRoom);
$('inp-name').addEventListener('keydown', e => { if (e.key === 'Enter') addRoom(); });
$('inp-tags').addEventListener('keydown', e => { if (e.key === 'Enter') addRoom(); });

$('btn-export').addEventListener('click', () => { window.location = '/api/export'; });
$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', e => {
  if (e.target.files[0]) importFile(e.target.files[0]);
  e.target.value = '';
});

$('filter-row').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  filter = btn.dataset.filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
  render();
});

$('search').addEventListener('input', e => { search = e.target.value.trim(); render(); });

$('room-tbody').addEventListener('click', e => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  const id = Number(tr.dataset.id);
  if (e.target.closest('.js-cycle')) cycleStatus(id);
  else if (e.target.closest('.js-delete')) deleteRoom(id);
});
$('room-tbody').addEventListener('change', e => {
  if (e.target.classList.contains('js-toggle')) {
    toggleDone(Number(e.target.closest('tr').dataset.id));
  }
});

loadRooms();
