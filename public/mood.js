/* DayBook Mood view — capture + calendar visualization (static file, no API fn).
   Entries are cards tagged "mood", stored via /api/app?r=cards.
   details JSON: {d: "2026-10-06", m: 1..5, note: "...", ts: epochMs} */
var MOODS = [
  { v: 1, e: "\uD83D\uDE22", label: "Terrible", color: "#e5484d", bg: "#fdecec" },
  { v: 2, e: "\uD83D\uDE15", label: "Bad",      color: "#f76b15", bg: "#fef1e7" },
  { v: 3, e: "\uD83D\uDE10", label: "Okay",     color: "#d9930d", bg: "#fef6e0" },
  { v: 4, e: "\uD83D\uDE42", label: "Good",     color: "#6fa82e", bg: "#eff7e4" },
  { v: 5, e: "\uD83D\uDE04", label: "Great",    color: "#2f9e63", bg: "#e6f6ee" },
];
var moodEntries = [];    // {id, d, m, note, ts}
var moodMonth = null;    // Date: first of displayed month
var moodSelected = null; // iso date string
var moodPicked = 0;      // mood value chosen in the capture UI
var moodBound = false;     // #view-mood persists across repaints: bind once

function moodDef(v) {
  for (var i = 0; i < MOODS.length; i++) if (MOODS[i].v === v) return MOODS[i];
  return MOODS[2];
}
function moodIso(d) {
  var p = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function moodMonthLabel(d) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function moodDayLabel(iso) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US",
      { weekday: "short", month: "short", day: "numeric" });
  } catch (e) { return iso; }
}
function parseMoodCard(c) {
  try {
    var d = JSON.parse(c.details || "{}");
    if (!d.d || !d.m) return null;
    return { id: c.id, d: d.d, m: Math.max(1, Math.min(5, +d.m || 3)),
             note: String(d.note || ""), ts: +d.ts || 0 };
  } catch (e) { return null; }
}
function moodEntriesOn(iso) {
  return moodEntries.filter(function (e) { return e.d === iso; })
    .sort(function (a, b) { return b.ts - a.ts; });
}
function moodAvg(iso) {
  var list = moodEntriesOn(iso);
  if (!list.length) return 0;
  var s = 0;
  list.forEach(function (e) { s += e.m; });
  return s / list.length;
}
async function reloadMoodEntries() {
  moodEntries = [];
  var cards = await api("GET", "/api/app?r=cards");
  (cards || []).forEach(function (c) {
    if (!(c.tags || []).some(function (t) { return String(t).toLowerCase() === "mood"; })) return;
    var p = parseMoodCard(c);
    if (p) moodEntries.push(p);
  });
}

async function renderMood() {
  var el = document.getElementById("view-mood");
  if (!el) return;
  el.innerHTML = '<div class="mood-loading">Loading your moods\u2026</div>';
  try {
    await reloadMoodEntries();
  } catch (e) {
    el.innerHTML = '<div class="mood-empty">Couldn\u2019t load moods. Try again later.</div>';
    return;
  }
  var now = new Date();
  moodMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  moodSelected = moodIso(now);
  moodPicked = 0;
  paintMood();
}

function moodEntryHtml(e) {
  var md = moodDef(e.m);
  var t = "";
  try { t = new Date(e.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); } catch (x) {}
  return '<div class="mood-entry" style="border-left-color:' + md.color + '">' +
    '<span class="mood-entry-e">' + md.e + "</span>" +
    '<div class="mood-entry-b"><div class="mood-entry-t">' + escHtml(md.label) +
    (t ? ' <span class="mood-entry-time">' + escHtml(t) + "</span>" : "") + "</div>" +
    (e.note ? '<div class="mood-entry-n">' + escHtml(e.note) + "</div>" : "") + "</div>" +
    '<button class="mood-del" data-id="' + escHtml(e.id) + '" aria-label="Delete check-in">\u00d7</button></div>';
}

function moodStatsHtml() {
  var mk = moodMonth.getFullYear() + "-" + ("0" + (moodMonth.getMonth() + 1)).slice(-2);
  var inMonth = moodEntries.filter(function (e) { return e.d.indexOf(mk) === 0; });
  var avg = inMonth.length
    ? inMonth.reduce(function (s, e) { return s + e.m; }, 0) / inMonth.length : 0;
  var have = {};
  moodEntries.forEach(function (e) { have[e.d] = 1; });
  var cur = new Date(), streak = 0;
  if (!have[moodIso(cur)]) cur.setDate(cur.getDate() - 1);
  while (have[moodIso(cur)]) { streak++; cur.setDate(cur.getDate() - 1); }
  var avgTxt = inMonth.length ? avg.toFixed(1) + " " + moodDef(Math.round(avg)).e : "\u2014";
  return '<div class="mood-stat"><span class="mood-stat-v">' + inMonth.length + '</span>' +
    '<span class="mood-stat-l">check-ins</span></div>' +
    '<div class="mood-stat"><span class="mood-stat-v">' + avgTxt + '</span>' +
    '<span class="mood-stat-l">avg mood</span></div>' +
    '<div class="mood-stat"><span class="mood-stat-v">' + streak + 'd</span>' +
    '<span class="mood-stat-l">streak</span></div>';
}

function moodGridHtml() {
  var y = moodMonth.getFullYear(), mo = moodMonth.getMonth();
  var startDay = new Date(y, mo, 1).getDay();
  var days = new Date(y, mo + 1, 0).getDate();
  var todayIso = moodIso(new Date());
  var h = "";
  ["S", "M", "T", "W", "T", "F", "S"].forEach(function (d) {
    h += '<div class="mood-dow">' + d + "</div>";
  });
  for (var i = 0; i < startDay; i++) h += '<div class="mood-cell empty"></div>';
  for (var dnum = 1; dnum <= days; dnum++) {
    var iso = moodIso(new Date(y, mo, dnum));
    var avg = moodAvg(iso);
    var cls = "mood-cell";
    if (iso === todayIso) cls += " today";
    if (iso === moodSelected) cls += " sel";
    var inner = '<span class="mood-num">' + dnum + "</span>";
    var style = "";
    if (avg > 0) {
      var md = moodDef(Math.round(avg));
      style = ' style="background:' + md.bg + ";border-color:" + md.color + '"';
      inner += '<span class="mood-e">' + md.e + "</span>";
      var cnt = moodEntriesOn(iso).length;
      if (cnt > 1) inner += '<span class="mood-cnt">' + cnt + "</span>";
    }
    var future = iso > todayIso;
    h += "<button class=\"" + cls + "\"" + style + ' data-d="' + iso + '"' +
      (future ? " disabled" : "") + ">" + inner + "</button>";
  }
  return h;
}

function moodDayHtml() {
  var list = moodEntriesOn(moodSelected);
  var h = '<div class="mood-sec-t">' + escHtml(moodDayLabel(moodSelected)) + "</div>";
  if (!list.length) return h + '<div class="mood-none">No check-ins this day.</div>';
  return h + list.map(moodEntryHtml).join("");
}

function paintMood() {
  var el = document.getElementById("view-mood");
  if (!el) return;
  var today = moodIso(new Date());
  var tlist = moodEntriesOn(today);
  var h = "";
  // capture
  h += '<div class="mood-capture">';
  h += '<div class="mood-q">How are you feeling right now?</div>';
  h += '<div class="mood-btns">';
  MOODS.forEach(function (md) {
    h += '<button class="mood-btn" data-m="' + md.v + '">' +
      '<span class="mood-btn-e">' + md.e + "</span>" +
      '<span class="mood-btn-l">' + md.label + "</span></button>";
  });
  h += "</div>";
  h += '<input id="mood-note" class="mood-note" maxlength="280" placeholder="Add a note (optional)\u2026">';
  h += '<button id="mood-save" class="mood-save" disabled>Save check-in</button>';
  h += "</div>";
  // today's entries
  h += '<div class="mood-sec-t">Today\u2019s check-ins</div><div id="mood-today-list">';
  h += tlist.length ? tlist.map(moodEntryHtml).join("")
                    : '<div class="mood-none">Nothing yet \u2014 tap a face above.</div>';
  h += "</div>";
  // stats + calendar
  h += '<div class="mood-sec-t">Calendar</div>';
  h += '<div class="mood-stats">' + moodStatsHtml() + "</div>";
  h += '<div class="mood-cal">';
  h += '<div class="mood-cal-head"><button id="mood-prev" aria-label="Previous month">\u2039</button>' +
    '<div class="mood-cal-label">' + escHtml(moodMonthLabel(moodMonth)) + "</div>" +
    '<button id="mood-next" aria-label="Next month">\u203a</button></div>';
  h += '<div class="mood-grid">' + moodGridHtml() + "</div>";
  h += '<div id="mood-day">' + moodDayHtml() + "</div>";
  h += "</div>";
  el.innerHTML = h;

  // capture: pick a mood (DOM-only, keeps the note text)
  Array.prototype.forEach.call(el.querySelectorAll(".mood-btn"), function (b) {
    b.addEventListener("click", function () {
      moodPicked = +b.getAttribute("data-m");
      Array.prototype.forEach.call(el.querySelectorAll(".mood-btn"), function (x) {
        var on = +x.getAttribute("data-m") === moodPicked;
        var md = moodDef(+x.getAttribute("data-m"));
        x.classList.toggle("sel", on);
        x.style.borderColor = on ? md.color : "";
        x.style.background = on ? md.bg : "";
      });
      var sv = document.getElementById("mood-save");
      if (sv) sv.disabled = false;
    });
  });
  // capture: save
  var sv = document.getElementById("mood-save");
  if (sv) sv.addEventListener("click", async function () {
    if (!moodPicked) return;
    var noteEl = document.getElementById("mood-note");
    var note = noteEl ? noteEl.value.trim() : "";
    sv.disabled = true;
    sv.textContent = "Saving\u2026";
    var now = new Date(), md = moodDef(moodPicked);
    try {
      await api("POST", "/api/app?r=cards", {
        title: "Mood: " + md.label + " \u00b7 " + moodDayLabel(moodIso(now)),
        tags: ["mood"],
        lane: "done",
        details: JSON.stringify({ d: moodIso(now), m: moodPicked, note: note, ts: now.getTime() }),
      });
      moodPicked = 0;
      await reloadMoodEntries();
      paintMood();
    } catch (e) {
      sv.disabled = false;
      sv.textContent = "Save check-in";
    }
  });
  // calendar nav
  var pv = document.getElementById("mood-prev"), nx = document.getElementById("mood-next");
  if (pv) pv.addEventListener("click", function () {
    moodMonth = new Date(moodMonth.getFullYear(), moodMonth.getMonth() - 1, 1);
    paintMood();
  });
  if (nx) nx.addEventListener("click", function () {
    moodMonth = new Date(moodMonth.getFullYear(), moodMonth.getMonth() + 1, 1);
    paintMood();
  });
  // day select + delete (event delegation; bound once since #view-mood persists)
  if (!moodBound) {
  moodBound = true;
  el.addEventListener("click", async function (ev) {
    var cell = ev.target.closest ? ev.target.closest(".mood-cell[data-d]") : null;
    if (cell && !cell.disabled) {
      moodSelected = cell.getAttribute("data-d");
      paintMood();
      return;
    }
    var del = ev.target.closest ? ev.target.closest(".mood-del") : null;
    if (del) {
      var id = del.getAttribute("data-id");
      del.disabled = true;
      try { await api("DELETE", "/api/app?r=cards&id=" + encodeURIComponent(id)); } catch (e) {}
      try { await reloadMoodEntries(); } catch (e) {}
      paintMood();
    }
  });
  }
}
