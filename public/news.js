/* DayBook News view — sectioned briefing renderer (static file, no API fn). */
var newsByDate = {};   // iso -> { label, sections: [{t, items}] }
var newsDates = [];    // iso list, newest first
var newsSelected = null;

var NEWS_SECTION_ORDER = ["Lead", "Wire", "Kerala", "World", "US Stock Movers",
  "Green Card", "US Immigration", "AI Nuggets", "X Trending", "Upcoming Dates"];

function escN(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function newsDateLabel(iso) {
  try {
    var d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch (e) { return iso; }
}

function parseNewsCard(c) {
  // Section-card format: details = {d: iso, t: section, items: [...]}
  // Legacy flat format: details = {d: iso, items: [...]}
  try {
    var d = JSON.parse(c.details || "{}");
    if (!d.d) return null;
    if (d.sections) return { date: d.d, sections: d.sections };
    if (d.t && d.items) return { date: d.d, sections: [{ t: d.t, items: d.items }] };
    if (d.items) return { date: d.d, sections: [{ t: "", items: d.items }] };
    return null;
  } catch (e) { return null; }
}

function orderSections(sections) {
  var rank = {};
  NEWS_SECTION_ORDER.forEach(function (t, i) { rank[t.toLowerCase()] = i; });
  return sections.slice().sort(function (a, b) {
    var ra = rank[(a.t || "").toLowerCase()], rb = rank[(b.t || "").toLowerCase()];
    if (ra === undefined) ra = 99;
    if (rb === undefined) rb = 99;
    return ra - rb;
  });
}

async function renderNews() {
  var el = document.getElementById("view-news");
  if (!el) return;
  el.innerHTML = '<div class="news-loading">Loading today\u2019s briefing\u2026</div>';
  newsByDate = {}; newsDates = []; newsSelected = null;
  try {
    var cards = await api("GET", "/api/app?r=cards");
    (cards || []).forEach(function (c) {
      if (!(c.tags || []).some(function (t) { return String(t).toLowerCase() === "news"; })) return;
      var p = parseNewsCard(c);
      if (!p) return;
      if (!newsByDate[p.date]) newsByDate[p.date] = { label: newsDateLabel(p.date), sections: [] };
      p.sections.forEach(function (s) {
        if (s.items && s.items.length) newsByDate[p.date].sections.push(s);
      });
    });
    newsDates = Object.keys(newsByDate).sort().reverse();
    newsDates.forEach(function (d) {
      newsByDate[d].sections = orderSections(newsByDate[d].sections);
    });
    if (newsDates.length) newsSelected = newsDates[0];
  } catch (e) {
    el.innerHTML = '<div class="news-empty">Couldn\u2019t load the briefing. Try again later.</div>';
    return;
  }
  paintNews();
}

function paintNews() {
  var el = document.getElementById("view-news");
  if (!el) return;
  if (!newsDates.length) {
    el.innerHTML = '<div class="news-empty">No briefings yet. The first edition lands at 4 PM.</div>';
    return;
  }
  var h = '<div class="news-dates">' + newsDates.map(function (d) {
    return '<button class="news-date-pill' + (d === newsSelected ? " active" : "") +
      '" data-d="' + escN(d) + '">' + escN(newsByDate[d].label) + "</button>";
  }).join("") + "</div>";

  var day = newsByDate[newsSelected];
  h += '<div class="news-day">';
  day.sections.forEach(function (sec) {
    if (sec.t) h += '<h3 class="news-section-title">' + escN(sec.t) + "</h3>";
    h += '<div class="news-list">' + sec.items.map(function (it) {
      return '<article class="news-story">' +
        '<a class="news-headline" href="' + escN(it.u) + '" target="_blank" rel="noopener">' +
        escN(it.h) + "</a>" +
        (it.s ? '<p class="news-summary">' + escN(it.s) + "</p>" : "") +
        '<span class="news-source">' + escN(it.src || "") + "</span>" +
        "</article>";
    }).join("") + "</div>";
  });
  h += "</div>";
  el.innerHTML = h;

  el.querySelectorAll(".news-date-pill").forEach(function (b) {
    b.addEventListener("click", function () {
      newsSelected = b.getAttribute("data-d");
      paintNews();
      var v = document.getElementById("view-news");
      if (v) v.scrollTop = 0;
    });
  });
}
