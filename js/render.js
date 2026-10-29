/*
 * Diet plan render engine  (design: "Fresh Tiles", v3)
 * Pure functions: (client, plan, settings, images) -> pdfmake document definitions.
 * Runs unchanged in the browser (pdfmake) and in Node (previews/tests).
 * images = { logo: dataURL, logoAspect: height/width }
 *
 * Plan model:
 *   { pattern: "3meal"|"2meal", days: 1..7, startDate: "YYYY-MM-DD", weekNumber?,
 *     slotModes?: { slotId: "daily"|"shared" },             // per-plan override
 *     meals: { slotId: { shared?: Cell, days?: Cell[] } },  // both kept; mode picks one
 *     exercise: [{text, duration, link?}], servingSizes, guidelines, notes? }
 *   Cell = "text" | { text, link? }   (links stored, shown only if settings.output.showLinks)
 */
(function (root) {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const PAGE_SIZES = { A4: [595.28, 841.89], LETTER: [612, 792] };

  // ---------- icons ----------
  const ICON_PATHS = {
    sunrise: "M3 18h18M7 18a5 5 0 0 1 10 0M12 6v4M5.2 11.2l2 1.4M18.8 11.2l-2 1.4M6 21h12",
    cup: "M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3",
    apple: "M12 7.5c-2-1.6-7-1.2-7 4.2 0 4.3 3.3 8.3 7 7.3 3.7 1 7-3 7-7.3 0-5.4-5-5.8-7-4.2zM12 7.5c0-2.2 1.2-3.8 3.4-4.5",
    bowl: "M3 11h18a9 7.5 0 0 1-18 0zM7 21h10M9 3.5c-.8 1.5.8 2.5 0 4M13 3.5c-.8 1.5.8 2.5 0 4",
    tea: "M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1a2 2 0 0 1 0 4h-1M3 21h16M10.5 3c-1 1 1 2 0 3",
    moon: "M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z",
    heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z",
    leaf: "M5 19C5 10 10 5 20 4c-1 10-6 15-15 15zM5 19l8-8",
    scale: "M4 6h16v14H4zM8 10a4 4 0 0 1 8 0M12 10l1.5-2",
    trend: "M3 7l6 6 4-4 8 8M15 17h6v-6",
    ruler: "M3 16L16 3l5 5L8 21zM7.5 11.5l2 2M10.5 8.5l2 2M13.5 5.5l2 2",
    glass: "M7 3h10l-1.5 17h-7zM7.6 8h8.8",
    dumbbell: "M3 9v6M6.5 6.5v11M17.5 6.5v11M21 9v6M6.5 12h11",
    bed: "M3 18v-9M3 14h18v4M21 18v-4a3 3 0 0 0-3-3h-7v3M6.5 11.5a1.5 1.5 0 1 0 0-.01",
    pill: "M8.5 15.5l7-7a3.5 3.5 0 0 0-5-5l-7 7a3.5 3.5 0 0 0 5 5zM7 8.5l5 5",
    star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  };
  const svgWrap = (inner, size) => ({ svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">${inner}</svg>`, width: size, height: size });
  const icon = (name, color, size, sw) => svgWrap(`<path d="${ICON_PATHS[name]}" fill="none" stroke="${color}" stroke-width="${sw || 1.9}" stroke-linecap="round" stroke-linejoin="round"/>`, size);
  function badge(kind, bg, size, fg) {
    fg = fg || "#fff";
    const g = {
      pulse: `<path d="M5 12h3l2-4 3 8 2-4h4" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
      tick: `<path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="${fg}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
      cross: `<path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="${fg}" stroke-width="2.4" stroke-linecap="round"/>` }[kind];
    return svgWrap(`<circle cx="12" cy="12" r="12" fill="${bg}"/>${g}`, size);
  }
  // Indian-style food mark: square outline with a dot (veg), triangle (non-veg) or dot (egg)
  function foodMark(pref, color, size) {
    const inner = /non/i.test(pref) ? `<path d="M12 7l5 9H7z" fill="${color}"/>` : `<circle cx="12" cy="12" r="4.5" fill="${color}"/>`;
    return svgWrap(`<rect x="3" y="3" width="18" height="18" rx="2" fill="#fff" stroke="${color}" stroke-width="2"/>${inner}`, size);
  }

  // ---------- dates & numbers ----------
  const iso = (d) => d.toISOString().slice(0, 10);
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const addDays = (dt, n) => new Date(dt.getTime() + n * 86400000);
  const planDates = (plan) => { const s = parseDate(plan.startDate); return Array.from({ length: plan.days }, (_, i) => addDays(s, i)); };
  const dm = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  function rangeText(plan) {
    const d = planDates(plan), a = d[0], b = d[d.length - 1];
    return d.length === 1 ? `${dm(a)} ${a.getUTCFullYear()}` : `${dm(a)} – ${dm(b)} ${b.getUTCFullYear()}`;
  }
  const planTitle = (plan) => (plan.days === 7 && plan.weekNumber ? `Week ${plan.weekNumber}` : `${plan.days}-Day Plan`);
  const kg = (v) => `${(+v).toFixed(1)} kg`;

  // ---------- client metrics (weight log is the single source of truth) ----------
  function weightsUpTo(client, endIso) {
    return (client.weightLog || []).filter((w) => w.date <= endIso).sort((a, b) => a.date.localeCompare(b.date));
  }
  function metrics(client, plan) {
    const end = iso(planDates(plan).at(-1));
    const log = weightsUpTo(client, end);
    const start = log[0], current = log.at(-1);
    const m = ((client.heightFt || 0) * 12 + (client.heightIn || 0)) * 0.0254;
    const bmi = current && m ? +(current.kg / (m * m)).toFixed(1) : null;
    return { log, start, current, bmi, change: start && current ? +(current.kg - start.kg).toFixed(1) : null };
  }
  const computeBmi = (weightKg, ft, inch) => { const m = ((+ft || 0) * 12 + (+inch || 0)) * 0.0254, kg = +weightKg; return m && kg ? +(kg / (m * m)).toFixed(1) : null; };
  const bmiBand = (bmi, settings) => settings.bmiBands.find((b) => bmi < b.max) || settings.bmiBands.at(-1);

  // ---------- layout helpers ----------
  const pageWidth = (settings, landscape) => { const [w, h] = PAGE_SIZES[settings.page.size.toUpperCase()]; return landscape ? h : w; };
  const contentWidth = (settings, landscape) => pageWidth(settings, landscape) - settings.page.margins[0] - settings.page.margins[2];
  const isLandscape = (plan, settings) => plan.days >= settings.page.landscapeFromDays;

  function heading(text, t, margin) {
    return { stack: [{ text, fontSize: 13, bold: true, color: t.navy },
      { canvas: [{ type: "line", x1: 0, y1: 3, x2: 34, y2: 3, lineWidth: 3, lineColor: t.teal, lineCap: "round" }] }],
      margin: margin || [0, 16, 0, 10] };
  }
  const eyebrow = (text, color) => ({ text: text.toUpperCase(), fontSize: 7.5, characterSpacing: 1.6, color, bold: true });

  function tile(w, h, fill, content, pad) {
    pad = pad || [12, 9];
    return { width: w, stack: [
      { canvas: [{ type: "rect", x: 0, y: 0, w, h, r: 10, color: fill }] },
      { stack: content, width: w - pad[0] * 2, relativePosition: { x: pad[0], y: -h + pad[1] } }] };
  }
  function tileRow(items, totalW, h, gap) {
    const w = (totalW - gap * (items.length - 1)) / items.length;
    return { columns: items.map((it) => tile(w, h, it.fill, it.content, it.pad)), columnGap: gap };
  }
  function card(body, accent, fill) {
    return { table: { widths: ["*"], body: [[{ stack: body, fillColor: fill }]] },
      layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 4 : 0), vLineColor: () => accent,
        paddingLeft: () => 13, paddingRight: () => 11, paddingTop: () => 10, paddingBottom: () => 6 } };
  }
  const iconTitle = (ic, text, color) => ({ table: { widths: [15, "*"], body: [[ic, { text, bold: true, color }]] },
    layout: { defaultBorder: false, paddingLeft: (i) => (i ? 6 : 0), paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
    margin: [0, 0, 0, 7] });
  const field = (label, value, t, opts) => (value ? { stack: [
    { text: label.toUpperCase(), fontSize: 6.8, characterSpacing: 1.2, color: t.muted },
    typeof value === "object" && !Array.isArray(value) ? value
      : { text: String(value), fontSize: (opts && opts.fs) || 9.5, bold: !!(opts && opts.bold), color: t.ink },
  ], unbreakable: true, margin: [0, 0, 0, 7] } : null);   // a label never ends up on one page and its value on the next
  function chips(items, color, fill) {
    if (!items || !items.length) return null;
    return { table: { body: [items.map((x) => ({ text: x, fontSize: 8, bold: true, color, fillColor: fill, margin: [3, 0, 3, 0] }))] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 4, vLineColor: () => "#FFFFFF", paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 2, paddingBottom: () => 2 } };
  }
  // Long words without spaces (e.g. "Roti+Dal+Salad", pasted links) would stretch one day column and push
  // the other days off the page. Split them into pieces joined by a near-invisible space the PDF can wrap at.
  // Split a long word into pieces of n letters without breaking a Hindi letter cluster or an emoji.
  const SEG = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  function chunks(x, n) {
    const g = SEG ? [...SEG.segment(x)].map((s) => s.segment) : Array.from(x), out = [];
    for (let i = 0; i < g.length; i += n) out.push(g.slice(i, i + n).join(""));
    return out;
  }
  function softPieces(text) {
    const out = [];
    for (const word of String(text ?? "").split(/(\s+)/)) {
      if (/^\s*$/.test(word) || word.length <= 12) { out.push(word); continue; }
      const parts = word.split(/(?<=[+\/,;:&)\]-])/).flatMap((x) => x.length > 12 ? chunks(x, 10) : [x]);
      parts.forEach((x, i) => { if (i) out.push(null); out.push(x); });   // null = break point
    }
    return out;
  }
  function cellRuns(cell, t, showLinks) {
    if (cell == null) return "";
    const c = typeof cell === "string" ? { text: cell } : cell;
    const style = showLinks && c.link ? { link: c.link, color: t.link, decoration: "underline" } : {};
    const runs = [];
    let buf = "";
    for (const piece of softPieces(c.text)) {
      if (piece === null) { runs.push({ text: buf, ...style }, { text: " ", fontSize: 0.5 }); buf = ""; } else buf += piece;
    }
    runs.push({ text: buf, ...style });
    return runs;
  }

  // ---------- weight chart (SVG, no text inside; labels laid out by pdfmake) ----------
  function weightChart(log, settings, w, h) {
    const t = settings.theme;
    const pts = log.slice(-settings.output.chartMaxPoints);
    if (pts.length < 2) return { text: "Chart appears after 2 weigh-ins.", fontSize: 8.5, color: t.muted, italics: true, margin: [0, 30, 0, 0] };
    const vals = pts.map((p) => p.kg), startKg = log[0].kg;   // dashed line = the true starting weight (same as the Starting box)
    const lo = Math.floor(Math.min(...vals, startKg) - 0.5), hi = Math.ceil(Math.max(...vals, startKg) + 0.5);
    const px = 6, py = 8, iw = w - px * 2, ih = h - py * 2;
    const X = (i) => px + (iw * i) / (pts.length - 1), Y = (v) => py + ih * (1 - (v - lo) / (hi - lo));
    const line = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(" ");
    const area = `${px},${py + ih} ${line} ${X(pts.length - 1).toFixed(1)},${py + ih}`;
    const grid = [0, 0.5, 1].map((f) => `<line x1="${px}" x2="${px + iw}" y1="${py + ih * f}" y2="${py + ih * f}" stroke="#E3E8EE" stroke-width="0.8"/>`).join("");
    const base = `<line x1="${px}" x2="${px + iw}" y1="${Y(startKg)}" y2="${Y(startKg)}" stroke="${t.muted}" stroke-width="0.8" stroke-dasharray="3,3"/>`;
    const dots = pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.kg)}" r="${i === pts.length - 1 ? 3.6 : 2.2}" fill="${i === pts.length - 1 ? t.coral : t.teal}" stroke="#fff" stroke-width="1"/>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${grid}` +
      `<polygon points="${area}" fill="${t.teal}" fill-opacity="0.12"/>${base}` +
      `<polyline points="${line}" fill="none" stroke="${t.teal}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`;
    const lbl = (s, extra) => ({ text: s, fontSize: 7, color: t.muted, ...extra });
    return { stack: [
      { columns: [
        { width: 26, stack: [lbl(`${hi}`, { margin: [0, py - 4, 0, 0] }), lbl(`${(lo + hi) / 2}`, { margin: [0, ih / 2 - 13, 0, 0] }), lbl(`${lo}`, { margin: [0, ih / 2 - 13, 0, 0] })] },
        { svg, width: w, height: h }] },
      { columns: [{ width: 26, text: "" }, lbl(dm(parseDate(pts[0].date))), lbl(dm(parseDate(pts.at(-1).date)), { alignment: "right" })], margin: [0, 2, 0, 0] },
    ] };
  }

  // ---------- decorations ----------
  function background(settings, images, kind) {
    const b = settings.branding, t = settings.theme;
    return (current, size) => {
      if (!isFinite(size.height)) return null; // auto-height measuring pass
      const out = [];
      const cover = kind === "plan" && current === 1;
      if (cover) out.push({ canvas: [
        { type: "ellipse", x: size.width - 20, y: 10, r1: 150, r2: 150, color: t.teal, fillOpacity: 0.07 },
        { type: "ellipse", x: size.width - 110, y: 150, r1: 46, r2: 46, color: t.green, fillOpacity: 0.08 }],
        absolutePosition: { x: 0, y: 0 } });
      if (images.logo && !cover) {
        const aspect = images.logoAspect || 0.75;
        const w = Math.min(size.width * b.watermarkWidthRatio, (size.height * 0.75) / aspect);
        out.push({ image: images.logo, width: w, opacity: b.watermarkOpacity,
          absolutePosition: { x: (size.width - w) / 2, y: (size.height - w * aspect) / 2 } });
      }
      const seg = size.width / 4;
      out.push({ canvas: [t.green, t.teal, t.coral, t.navy].map((c, i) => ({ type: "rect", x: seg * i, y: size.height - 5, w: seg, h: 5, color: c })),
        absolutePosition: { x: 0, y: 0 } });
      return out;
    };
  }

  // ---------- client program (package) with holds ----------
  // program = { start, end, holds: [{ id, from, to, reason }] }. Hold days push the end date back and are not counted.
  const dIdx = (s) => Math.round(parseDate(s).getTime() / 86400000);
  const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  function programInfo(client, refIso, plans) {
    const pg = client.program;
    if (!pg || !pg.start || !pg.end || pg.end < pg.start) return null;
    const s0 = dIdx(pg.start), e0 = dIdx(pg.end), total = e0 - s0 + 1;
    const holds = (pg.holds || []).filter((h) => h.from && h.to && h.to >= h.from).map((h) => ({ ...h, a: dIdx(h.from), b: dIdx(h.to) })).sort((x, y) => x.a - y.a);
    const inHold = (d) => holds.some((h) => d >= h.a && d <= h.b);
    // The end date is the day the program's last working (non-hold) day falls on. Only hold days inside the
    // program count: holds before the start or after the (extended) end change nothing; overlapping holds count once.
    let effEnd = s0 - 1;
    for (let n = 0; n < total; effEnd++) if (!inHold(effEnd + 1)) n++;
    const holdDays = effEnd - e0;
    const ref = dIdx(refIso);
    const onHold = holds.find((h) => ref >= h.a && ref <= h.b && ref >= s0 && ref <= effEnd) || null;
    // program days used up to the reference day (hold days don't count)
    let used = 0;
    for (let d = s0; d <= Math.min(ref, effEnd); d++) if (!inHold(d)) used++;
    const dayNo = Math.min(used, total);
    // plan days given = distinct programme days covered by any plan (outside holds)
    const covered = new Set();
    for (const p of plans || []) { const a = dIdx(p.startDate); for (let k = 0; k < (+p.days || 0); k++) { const d = a + k; if (d >= s0 && d <= effEnd && !inHold(d)) covered.add(d); } }
    const given = Math.min(covered.size + (+pg.priorDays || 0), total);   // + days given by hand before using the app
    return { start: pg.start, end: pg.end, effEnd: isoOf(effEnd), total, holdDays, holds: holds.map(({ a, b, ...h }) => h),
      dayNo, daysLeft: Math.max(0, total - dayNo), given, remaining: Math.max(0, total - given),
      onHold, started: ref >= s0, ended: ref > effEnd };
  }
  const fmtRange = (a, b) => { const A = parseDate(a), Bd = parseDate(b); return `${dm(A)}${A.getUTCFullYear() !== Bd.getUTCFullYear() ? " " + A.getUTCFullYear() : ""} – ${dm(Bd)} ${Bd.getUTCFullYear()}`; };

  // ---------- PDF section switches: plan choice → (call summary's own tick) → Settings default ----------
  function sectionOn(plan, settings, key) {
    const p = plan.pdfSections || {};
    if (key in p) return !!p[key];
    if (key === "callSummary" && plan.callSummary && "includeInPdf" in plan.callSummary) return !!plan.callSummary.includeInPdf;
    const d = settings.pdfSections || {};
    return key in d ? !!d[key] : true;
  }
  // Health issues with optional level: client.healthFlags (names) + client.healthLevels {name: levelKey}
  function healthItems(client, settings) {
    const levels = settings.severityLevels || [];
    return (client.healthFlags || []).map((name) => {
      const k = (client.healthLevels || {})[name];
      const i = levels.findIndex((l) => l.key === k);
      return { name, level: i >= 0 ? levels[i] : null, rank: i };
    });
  }
  // Chips wrap onto several lines (estimated width) so many health issues never push the Food card off the page.
  function healthChips(items, t, maxW = 215) {
    if (!items.length) return null;
    const style = [ { fill: "#FDE9E5", color: "#C0533F" }, { fill: "#F9C8BE", color: "#9E3524" }, { fill: t.coral, color: "#FFFFFF" } ];
    const chip = (x) => { const st = style[Math.min(Math.max(x.rank, 0), 2)] || style[0];
      return { text: x.level ? [{ text: x.name }, { text: "  " + x.level.label, bold: false, fontSize: 7 }] : x.name,
        fontSize: 8, bold: true, color: x.rank < 0 ? "#C0533F" : st.color, fillColor: x.rank < 0 ? "#FBDCD7" : st.fill, margin: [3, 0, 3, 0] }; };
    const est = (x) => String(x.name).length * 4.7 + (x.level ? String(x.level.label).length * 3.6 + 6 : 0) + 18;
    const rows = []; let row = [], w = 0;
    for (const x of items) { const cw = est(x); if (row.length && w + cw > maxW) { rows.push(row); row = []; w = 0; } row.push(x); w += cw; }
    if (row.length) rows.push(row);
    const layout = { hLineWidth: () => 0, vLineWidth: () => 4, vLineColor: () => "#FFFFFF", paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 2, paddingBottom: () => 2 };
    // one small table per line; a single chip wider than the card wraps its own text
    return { stack: rows.map((r, i) => ({ table: { widths: r.length === 1 && est(r[0]) > maxW ? ["*"] : undefined, body: [r.map(chip)] }, layout, margin: [0, i ? 3 : 0, 0, 0] })) };
  }

  // ---------- meal table ----------
  // The plan's type from Settings; if it was deleted/reset, the copy saved with the plan; else the first type.
  function patternOf(plan, settings) {
    return settings.mealPatterns[plan.pattern] || plan.patternSnapshot || settings.mealPatterns["3meal"] || Object.values(settings.mealPatterns)[0];
  }
  function slotInfo(id, plan, settings) {
    return settings.slotCatalog[id] || plan.slotSnapshot?.[id] || { name: id, icon: "star", accent: "#7A8594", fill: "#F4F7FA" };
  }
  // Fill in anything missing in older or hand-edited records so the PDF never crashes.
  function normPlan(plan) {
    return { ...plan, days: Math.min(Math.max(Math.round(+plan.days) || 7, 1), 7), meals: plan.meals || {}, exercise: (plan.exercise || []).filter(Boolean),
      servingSizes: plan.servingSizes || [], guidelines: (plan.guidelines || []).map((g) => ({ ...g, items: g.items || [] })), slotModes: plan.slotModes || {} };
  }
  function normClient(c) {
    return { ...c, name: c.name || "Client", heightFt: +c.heightFt || 0, heightIn: +c.heightIn || 0,
      weightLog: (c.weightLog || []).filter((w) => w && w.date && w.kg !== "" && w.kg != null && +w.kg > 0 && +w.kg < 500).map((w) => ({ ...w, kg: +w.kg })) };   // 0 / blank / impossible weights are ignored
  }

  function resolveSlots(plan, settings) {
    const pattern = patternOf(plan, settings);
    return pattern.slots.map((s) => ({ ...slotInfo(s.id, plan, settings), ...s,
      mode: (plan.slotModes && plan.slotModes[s.id]) || s.mode }));
  }

  function mealTable(client, plan, settings, opts = {}) {
    const t = settings.theme, show = settings.output.showLinks;
    const dates = planDates(plan), n = dates.length;
    const fit = plan._fit || {};
    const fs = (n <= 3 ? 10 : n <= 5 ? 9.2 : 8.6) * (fit.scale || 1);   // shrunk when a long plan must fit one page
    const header = [{ text: "", border: [false, false, false, false] }].concat(dates.map((d) => {
      const wd = d.getUTCDay();
      return { stack: [{ text: WEEKDAYS[wd].toUpperCase(), bold: true, fontSize: 10, characterSpacing: 1.5 },
        { text: dm(d), fontSize: 8, color: "#D7E4F5" }],
        fillColor: wd === 0 || wd === 6 ? t.weekendHeader : t.dayHeader, color: "#FFFFFF", alignment: "center", margin: [0, 2, 0, 2] };
    }));
    const body = [header];
    const fillers = Array.from({ length: n - 1 }, () => ({}));
    const slotCell = (s, label, time) => ({ stack: [
      { table: { widths: [15, "*"], body: [[icon(s.icon, s.accent, 15), { text: label, bold: true, fontSize: 9, color: s.accent }]] },
        layout: { defaultBorder: false, paddingLeft: (i) => (i ? 4 : 0), paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 } },
      { text: time, fontSize: 7.5, color: t.muted, margin: [19, 0, 0, 0] },
      // fit test only: an invisible marker per row, so export.js can tell whether any row went missing
      ...(fit.probe ? [{ text: `QZX${s.id.replace(/[^A-Za-z0-9]/g, "")}QZX`, fontSize: 1, color: s.fill || "#FFFFFF" }] : [])], fillColor: s.fill, margin: [2, 3, 0, 3] });

    for (const s of resolveSlots(plan, settings)) {
      const m = plan.meals[s.id] || {};
      if (s.mode === "shared") {
        if (!m.shared) continue;
        body.push([slotCell(s, s.name, s.time), { text: cellRuns(m.shared, t, show), colSpan: n, alignment: "center", bold: true,
          fontSize: fs + 0.6, color: s.accent, fillColor: s.fill, margin: [6, 9, 6, 9] }, ...fillers]);
      } else {
        const days = (m.days || []).slice(0, n);
        if (!days.some(Boolean)) continue;
        while (days.length < n) days.push("");
        body.push([slotCell(s, s.name, s.time)].concat(days.map((d) => ({
          text: cellRuns(d, t, show), alignment: "center", fillColor: s.fill, fillOpacity: 0.45, margin: [1, 3, 1, 3] }))));
      }
    }

    // Daily weight row: only days with an entry; whole row hidden if none.
    const byDate = Object.fromEntries((client.weightLog || []).map((w) => [w.date, w.kg]));
    const weights = dates.map((d) => byDate[iso(d)]);
    if (opts.weights !== false && sectionOn(plan, settings, "weightRow") && weights.some((v) => v != null)) {
      body.push([{ stack: [{ table: { widths: [15, "*"], body: [[icon("scale", t.navy, 15), { text: "Weight", bold: true, fontSize: 9, color: t.navy }]] },
          layout: { defaultBorder: false, paddingLeft: (i) => (i ? 4 : 0), paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 } }],
        fillColor: t.soft, margin: [2, 3, 0, 3] }].concat(weights.map((v) => ({
        text: v != null ? kg(v) : "", bold: true, fontSize: fs + 1, color: t.navy, alignment: "center",
        fillColor: v != null ? "#E6F4F2" : t.soft, margin: [0, 4, 0, 4] }))));
    }

    return {
      table: { headerRows: 1, dontBreakRows: !fit.allowRowBreak, widths: [92].concat(Array(n).fill("*")), body },
      layout: { hLineWidth: () => 3, vLineWidth: () => 3, hLineColor: () => "#FFFFFF", vLineColor: () => "#FFFFFF",
        paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 5, paddingBottom: () => 5 },
      fontSize: fs, color: t.ink, lineHeight: 1.15,
    };
  }

  function mealHeader(client, plan, settings, images, logoW) {
    const t = settings.theme;
    return { columns: [
      { stack: [eyebrow(`Meal Plan  ·  ${patternOf(plan, settings).label}`, t.teal),
        { text: client.name, fontSize: 18, bold: true, color: t.navy, margin: [0, 1, 0, 0] },
        { text: `${planTitle(plan)}  ·  ${rangeText(plan)}`, fontSize: 9.5, color: t.muted }] },
      images.logo ? { image: images.logo, width: logoW, alignment: "right" } : { text: "" },
    ], margin: [0, 0, 0, 10] };
  }

  // ---------- body measurements (start vs current per site, up to plan end) ----------
  function measurementCard(client, plan, settings) {
    const t = settings.theme, cfg = settings.measurements;
    const end = iso(planDates(plan).at(-1));
    const log = (client.measurementLog || []).filter((m) => m.date <= end).sort((a, b) => a.date.localeCompare(b.date));
    if (!log.length) return null;
    const first = (k) => log.find((m) => m[k] != null), last = (k) => [...log].reverse().find((m) => m[k] != null);
    const sites = cfg.sites.filter((s) => first(s.key));
    if (!sites.length) return null;
    const fmt = (v) => (v == null ? "–" : (+v).toFixed(1));
    const startDate = log[0].date, curDate = log.at(-1).date;
    const lab = (txt, sub) => ({ stack: [{ text: txt, fontSize: 8.5, bold: true, color: t.ink },
      { text: sub, fontSize: 6.8, color: t.muted }] });
    const head = [{ text: "" }].concat(sites.map((s) => ({ stack: [
      { text: s.label, fontSize: 8, bold: true, color: t.navy, alignment: "center" },
      { text: s.hint || " ", fontSize: 6.5, color: t.muted, alignment: "center" }] })));
    const row = (name, sub, pick) => [lab(name, sub)].concat(sites.map((s) => ({ text: fmt(pick(s)), fontSize: 10, alignment: "center", color: t.ink })));
    const change = [lab("Change", cfg.unit === "in" ? "inches" : cfg.unit)].concat(sites.map((s) => {
      const a = first(s.key)[s.key], b = last(s.key)[s.key], d = +(b - a).toFixed(1);
      return { text: d === 0 ? "0.0" : (d < 0 ? "−" : "+") + Math.abs(d).toFixed(1), bold: true, fontSize: 10.5, alignment: "center",
        color: d < 0 ? t.green : d > 0 ? t.amber : t.muted, fillColor: d < 0 ? "#E9F5DF" : d > 0 ? "#FFF0DF" : null };
    }));
    return card([
      iconTitle(icon("ruler", t.navy, 15), `Body Measurements  (${cfg.unit === "in" ? "inches" : cfg.unit})`, t.navy),
      { table: { widths: [62].concat(Array(sites.length).fill("*")), body: [head,
          row("Starting", dm(parseDate(startDate)), (s) => first(s.key)[s.key])].concat(
          log.length > 1 ? [row("Current", dm(parseDate(curDate)), (s) => last(s.key)[s.key]), change] : []) },
        layout: { hLineWidth: (i) => (i === 1 || i === 3 ? 0.8 : 0), vLineWidth: () => 0, hLineColor: () => "#D9E0E8",
          paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 3, paddingBottom: () => 3 } },
    ], t.navy, t.soft);
  }

  // ---------- full document ----------
  function buildPlanDoc(client, plan, settings, images) {
    client = normClient(client); plan = normPlan(plan);
    const t = settings.theme, W = contentWidth(settings, false), show = settings.output.showLinks;
    const mx = metrics(client, plan), band = mx.bmi ? bmiBand(mx.bmi, settings) : null;
    const pref = settings.foodPreferences.find((p) => p.label === client.foodPreference);
    // Cover too long for one page (long name, many health notes…)? export.js asks for a more compact cover (1 or 2).
    const cz = Math.min(2, (plan._cover && plan._cover.compact) || 0);
    const fld = (l, v, tt, o) => field(l, v, tt, { ...o, fs: 9.5 - cz * 0.8 });
    const nameFs = (client.name.length > 60 ? 16 : client.name.length > 32 ? 19 : 24) - cz * 2;

    const stat = (label, value, sub, fill, fg) => ({ fill: fill || t.soft, content: [
      eyebrow(label, fg ? "#FFFFFF" : t.muted), { text: value, fontSize: 18, bold: true, color: fg || t.navy, margin: [0, 2, 0, 0] },
      { text: sub || " ", fontSize: 7.5, color: fg || t.muted }] });

    const lost = mx.change != null ? -mx.change : null;
    const progressColor = lost == null ? t.muted : lost > 0 ? t.green : lost < 0 ? t.amber : t.muted;
    const mini = (label, value, color) => ({ stack: [
      { text: label.toUpperCase(), fontSize: 6.8, characterSpacing: 1.2, color: t.muted },
      { text: value, fontSize: 15, bold: true, color: color || t.navy }], margin: [0, 0, 0, 8] });

    const cover = [
      { columns: [
        images.logo && settings.branding.coverLogo ? { image: images.logo, width: 104 } : { text: "" },
        { stack: [eyebrow(`Personalised Diet Plan  ·  ${patternOf(plan, settings).label}`, t.teal),
          { text: planTitle(plan), fontSize: 32, bold: true, color: t.navy, lineHeight: 0.95 },
          { text: rangeText(plan), fontSize: 10.5, color: t.muted }], alignment: "right", margin: [0, 16, 0, 0] }] },
      { stack: [eyebrow("Prepared for", t.muted), { text: client.name, fontSize: nameFs, bold: true, color: t.ink },
        client.code && sectionOn(plan, settings, "clientId") ? { text: `Client ID: ${client.code}`, fontSize: 9, color: t.muted, margin: [0, 1, 0, 0] } : "",
        (() => { const pi = sectionOn(plan, settings, "program") && programInfo(client, plan.startDate, []);
          return pi ? { text: [{ text: "Program: ", bold: true, color: t.navy }, `${fmtRange(pi.start, pi.effEnd)}  ·  ${pi.total} days`,
            pi.holdDays ? ` + ${pi.holdDays} hold day${pi.holdDays > 1 ? "s" : ""}` : ""],
            fontSize: 9, color: t.muted, margin: [0, 3, 0, 0] } : ""; })()], margin: [0, 16, 0, 10] },
      { _sec: "statTiles", ...tileRow([
        stat("Age · Sex", client.age ? `${client.age}` : "–", client.sex),
        stat("Height", client.heightFt ? `${client.heightFt}'${client.heightIn || 0}"` : "–"),
        stat("Blood group", client.bloodGroup || "–"),
        band ? stat("BMI", String(mx.bmi), `${band.label}  ·  at ${mx.current.kg} kg`, band.color, "#FFFFFF") : stat("BMI", "–"),
      ], W, 60 - cz * 2, 10) },
      ...(!mx.start ? [] : [{ _sec: "weightProgress", margin: [0, 12, 0, 0], ...card([
        iconTitle(icon("trend", t.teal, 15), "Weight Progress", t.teal),
        { columns: [
          { width: 110, stack: [
            mini("Starting", mx.start ? kg(mx.start.kg) : "–"),
            mini("Current", mx.current ? kg(mx.current.kg) : "–"),
            mini(lost == null ? "Change" : lost >= 0 ? "Total lost" : "Gained",
              lost == null ? "–" : `${Math.abs(lost).toFixed(1)} kg`, progressColor)] },
          weightChart(mx.log, settings, W - 110 - 26 - 40, 92 - cz * 26),
        ], columnGap: 8 }], t.teal, "#F1F8F7") }]),
      ...(measurementCard(client, plan, settings) ? [{ _sec: "measurements", margin: [0, 10, 0, 0], ...measurementCard(client, plan, settings) }] : []),
      { _cards: true, columns: [
        (() => { const f = [fld("Medical problems", client.medical, t, { bold: true }),   // card left out when there is nothing to show
            fld(settings.healthIssuesTitle || "Health issues", healthChips(healthItems(client, settings), t), t),
            fld("Food allergies", client.allergies, t)].filter(Boolean);
          return sectionOn(plan, settings, "health") && f.length ? card([iconTitle(icon("heart", t.coral, 15), "Health", t.coral), ...f], t.coral, "#FDF3F1") : null; })(),
        (() => { const f = [fld("Preference", pref ? { table: { widths: [12, "*"], body: [[foodMark(pref.label, pref.color, 12), { text: pref.label, fontSize: 9.5, bold: true, color: pref.color }]] },
            layout: { defaultBorder: false, paddingLeft: (i) => (i ? 5 : 0), paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 } } : client.foodPreference, t),
          fld("Preference notes", client.foodNotes, t),
          fld("Likes", client.likes, t), fld("Dislikes", client.dislikes, t), fld("Water intake", client.water, t)].filter(Boolean);
          return sectionOn(plan, settings, "food") && f.length ? card([iconTitle(icon("leaf", t.green, 15), "Food", t.green), ...f], t.green, "#F2F8EC") : null; })(),
      ].filter(Boolean), columnGap: 12, margin: [0, 10, 0, 0] },
    ].filter((b) => (b._sec ? sectionOn(plan, settings, b._sec) : true) && !(b._cards && !b.columns.length));

    const meals = [
      { ...mealHeader(client, plan, settings, images, 62), pageBreak: "before", pageOrientation: isLandscape(plan, settings) ? "landscape" : "portrait" },
      mealTable(client, plan, settings),
    ];
    if (plan.notes && sectionOn(plan, settings, "clientNotes")) {
      const nc = card([{ text: "Notes from your dietitian", bold: true, color: t.navy, margin: [0, 0, 0, 4] }, { text: plan.notes, fontSize: 9.5 }], t.navy, t.soft);
      if (String(plan.notes).length <= 1500) nc.table.dontBreakRows = true;   // short notes move to the next page whole (no lonely heading)
      meals.push({ margin: [0, 12, 0, 0], ...nc });
    }

    const servingTiles = [];
    for (let i = 0; i < plan.servingSizes.length; i += 4) {
      const row = plan.servingSizes.slice(i, i + 4).map((s) => ({ fill: t.soft, pad: [8, 12], content: [
        { text: s.value, fontSize: 17, bold: true, color: t.teal, alignment: "center" },
        { text: s.label, fontSize: 8.5, color: t.muted, alignment: "center" }] }));
      while (row.length < 4) row.push({ fill: "#FFFFFF", content: [] });
      servingTiles.push({ ...tileRow(row, W, 54, 10), margin: [0, 0, 0, 10] });
    }
    const guideCard = (g) => {
      const avoid = g.type === "avoid", col = avoid ? t.coral : t.green, fill = avoid ? "#FDF3F1" : "#F2F8EC";
      return { table: { widths: ["*"], body: [
          [{ table: { widths: [14, "*"], body: [[badge(avoid ? "cross" : "tick", "#FFFFFF", 14, col),
              { text: g.title.toUpperCase(), bold: true, color: "#FFFFFF", characterSpacing: 1.5 }]] },
            layout: { defaultBorder: false, paddingLeft: (i) => (i ? 7 : 0), paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
            fillColor: col }],
          [{ table: { widths: [12, "*"], body: g.items.map((it) => [
              { ...badge(avoid ? "cross" : "tick", col, 10), margin: [0, 2, 0, 0] }, { text: cellRuns(it, t, false), fontSize: 9.5 }]) },
            layout: "noBorders", fillColor: fill }]] },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 8, paddingBottom: () => 8 } };
    };
    // Call summary: printed only when the plan says so; private notes are never printed.
    const cs = plan.callSummary;
    const summaryBlock = cs && sectionOn(plan, settings, "callSummary") && String(cs.text || "").trim() ? [
      heading("Consultation Summary", t, [0, 0, 0, 10]),
      { ...card([
          cs.date ? { text: `Call on ${dm(parseDate(cs.date))} ${parseDate(cs.date).getUTCFullYear()}`.toUpperCase(), fontSize: 7.5, characterSpacing: 1.4, bold: true, color: t.muted, margin: [0, 0, 0, 6] } : null,
          { text: cs.text.trim(), fontSize: 10, lineHeight: 1.35 }].filter(Boolean), t.navy, t.soft), margin: [0, 0, 0, 6] },
    ] : [];
    const exerciseBlock = !(sectionOn(plan, settings, "exercise") && plan.exercise.length) ? [] : [
      heading("Exercise Routine", t, [0, 18, 0, 10]),
      { table: { widths: [20, "*", "auto"], body: plan.exercise.map((e) => [
          { ...badge("pulse", t.teal, 16), margin: [0, 1, 0, 0] },
          show && e.link ? { text: cellRuns(e.text, t, false), link: e.link, bold: true, fontSize: 10, decoration: "underline" } : { text: cellRuns(e.text, t, false), bold: true, fontSize: 10 },
          { text: e.duration, fontSize: 8.5, bold: true, color: "#FFFFFF", fillColor: t.teal, alignment: "center", margin: [6, 1, 6, 1] }]) },
        layout: { hLineWidth: () => 5, vLineWidth: () => 0, hLineColor: () => "#FFFFFF",
          paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 5, paddingBottom: () => 5,
          fillColor: (row, node, col) => (col < 2 ? t.soft : null) } },
    ];
    const isPlaceholder = (x) => /^Edit your default .* list in Settings$/i.test(String(x).trim());
    const groups = plan.guidelines.map((g) => ({ ...g, items: g.items.filter((x) => String(x).trim() && !isPlaceholder(x)) })).filter((g) => g.items.length);
    const guideTail = [];
    const guide = [
      ...summaryBlock,
      ...exerciseBlock,
      ...(sectionOn(plan, settings, "servingGuide") && servingTiles.length ? [heading("Serving Guide", t, [0, 18, 0, 12]), ...servingTiles] : []),
      ...(sectionOn(plan, settings, "guidelines") && groups.length ? [heading("General Guidelines", t, [0, 16, 0, 12]), { columns: groups.map(guideCard), columnGap: 14 }] : []),
    ];
    // Recipes picked for this plan (passed in as plan._recipes), one page each
    if (sectionOn(plan, settings, "recipes") && (plan._recipes || []).length) {
      plan._recipes.forEach((r) => { const b = recipeBlocks(r, settings, images, {}); b[0] = { ...b[0], pageBreak: "before", pageOrientation: "portrait" }; guideTail.push(...b); });
    }
    if (guide.length) {   // last page exists only if something is on it
      guide[0] = { ...guide[0], pageBreak: "before", pageOrientation: "portrait" };
      if (guide[0].stack) guide[0].margin = [0, 0, 0, guide[0].margin ? guide[0].margin[3] : 10];
    }

    return {
      pageSize: settings.page.size,
      pageMargins: settings.page.margins,
      background: background(settings, images, "plan"),
      footer: (page, count) => ({ columns: [
        { text: `${settings.branding.name}  ·  ${settings.branding.tagline}`, fontSize: 7.5, color: t.muted },
        { text: `${page} / ${count}`, fontSize: 7.5, color: t.muted, alignment: "right" }],
        margin: [settings.page.margins[0], 16, settings.page.margins[2], 0] }),
      content: [...cover, ...meals, ...guide, ...guideTail],
      defaultStyle: { font: t.font, fontSize: 10, color: t.ink },
      info: { title: fileBaseName(client, plan), author: settings.branding.name },
    };
  }

  // Cover page only (used by export.js to check that the cover fits on one page)
  function buildCoverFitDoc(client, plan, settings, images) {
    const d = buildPlanDoc(client, plan, settings, images);
    const i = d.content.findIndex((b) => b && b.pageBreak === "before");
    return { ...d, footer: undefined, content: i > 0 ? d.content.slice(0, i) : d.content };
  }

  // ---------- recipes ----------
  // recipe = { name, category, pref, servings, prepTime, cookTime, ingredients:[..], steps:[..], tips, link, photo(dataURL),
  //            nutrition:{ kcal, protein, carbs, fat } }
  function recipeBlocks(r, settings, images, opts) {
    const t = settings.theme, W = contentWidth(settings, false);
    const pref = settings.foodPreferences.find((p) => p.label === r.pref);
    const meta = [r.servings && `Serves ${r.servings}`, r.prepTime && `Prep ${r.prepTime}`, r.cookTime && `Cook ${r.cookTime}`].filter(Boolean);
    const lines = (a) => (Array.isArray(a) ? a : String(a || "").split("\n")).map((x) => String(x).trim()).filter(Boolean);
    const ing = lines(r.ingredients), steps = lines(r.steps);
    const nut = r.nutrition || {}, nutItems = [["kcal", "Calories", "kcal"], ["protein", "Protein", "g"], ["carbs", "Carbs", "g"], ["fat", "Fat", "g"]]
      .filter(([k]) => nut[k] !== undefined && nut[k] !== "" && nut[k] !== null);
    const out = [];
    out.push({ columns: [
      { stack: [eyebrow([r.category || "Recipe", opts.client ? `Prepared for ${opts.client.name}` : ""].filter(Boolean).join("  ·  "), t.teal),
        { text: r.name || "Recipe", fontSize: 22, bold: true, color: t.navy, margin: [0, 2, 0, 4] },
        { columns: [
          pref ? { width: "auto", table: { widths: [11, "auto"], body: [[foodMark(pref.label, pref.color, 11), { text: pref.label, fontSize: 9, bold: true, color: pref.color }]] },
            layout: { defaultBorder: false, paddingLeft: (i) => (i ? 4 : 0), paddingRight: () => 10, paddingTop: () => 0, paddingBottom: () => 0 } } : { width: 0, text: "" },
          { width: "*", text: meta.join("   ·   "), fontSize: 9.5, color: t.muted, margin: [0, 0, 0, 0] }] }] },
      images.logo ? { width: 70, image: images.logo, fit: [70, 60], alignment: "right" } : { width: 0, text: "" },
    ], margin: [0, 0, 0, 12] });
    if (r.photo) out.push({ image: r.photo, fit: [W, 210], alignment: "center", margin: [0, 0, 0, 14] });
    const head = (txt) => ({ text: txt.toUpperCase(), fontSize: 8.5, bold: true, characterSpacing: 1.4, color: t.teal, margin: [0, 0, 0, 6] });
    out.push({ columns: [
      ing.length ? { width: "38%", stack: [head("Ingredients"), card(ing.map((x) => ({ columns: [{ width: 10, canvas: [{ type: "ellipse", x: 3, y: 6, r1: 2.2, r2: 2.2, color: t.green }] }, { text: x, fontSize: 9.5 }], margin: [0, 0, 0, 4] })), t.green, "#F2F8EC")] } : { width: 0, text: "" },
      steps.length ? { width: "*", stack: [head("Method"), ...steps.map((x, i) => ({ columns: [
        { width: 22, stack: [{ canvas: [{ type: "ellipse", x: 9, y: 9, r1: 9, r2: 9, color: t.navy }] }, { text: String(i + 1), color: "#FFFFFF", bold: true, fontSize: 8.5, alignment: "center", width: 18, relativePosition: { x: 0, y: -14.5 } }] },
        { text: x, fontSize: 10, lineHeight: 1.3, margin: [4, 1, 0, 0] }], margin: [0, 0, 0, 8] }))] } : { width: 0, text: "" },
    ], columnGap: 16 });
    if (nutItems.length) out.push({ margin: [0, 10, 0, 0], ...tileRow(nutItems.map(([k, l, u]) => ({ fill: t.soft, pad: [8, 9], content: [
      { text: `${nut[k]}${u === "kcal" ? "" : " " + u}`, fontSize: 15, bold: true, color: t.navy, alignment: "center" },
      { text: `${l}${u === "kcal" ? " (kcal)" : ""} · per serving`, fontSize: 7.5, color: t.muted, alignment: "center" }] })), W, 46, 10) });
    if (String(r.tips || "").trim()) out.push({ margin: [0, 12, 0, 0], ...card([{ text: "Tips", bold: true, color: t.coral, margin: [0, 0, 0, 3] }, { text: r.tips.trim(), fontSize: 9.5, lineHeight: 1.3 }], t.coral, "#FDF3F1") });
    if (r.link) out.push({ margin: [0, 12, 0, 0], table: { widths: [22, "*"], body: [[
        { ...badge("pulse", t.teal, 18), margin: [0, 2, 0, 0], link: r.link },
        { stack: [{ text: "Open recipe / video", bold: true, color: t.link, decoration: "underline", link: r.link, fontSize: 10.5 },
          { text: cellRuns(r.link, t, false), fontSize: 7.5, color: t.muted, link: r.link }] }]] },   // long links wrap
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 8, paddingBottom: () => 8, fillColor: () => "#E3F4F2" } });
    return out;
  }
  // A PDF with one page per recipe (single recipe or a booklet).
  // A recipe with nothing but a name would print an empty page: such recipes are left out of PDFs.
  function recipeHasContent(r) {
    const has = (a) => (Array.isArray(a) ? a.some((x) => String(x).trim()) : !!String(a || "").trim());
    return !!r && (has(r.ingredients) || has(r.steps) || has(r.tips) || !!r.photo || !!r.link || Object.values(r.nutrition || {}).some((v) => v !== "" && v != null));
  }
  function buildRecipeDoc(recipes, settings, images, opts = {}) {
    const t = settings.theme;
    const content = [];
    recipes.forEach((r, i) => { const b = recipeBlocks(r, settings, images, opts); if (i) b[0] = { ...b[0], pageBreak: "before" }; content.push(...b); });
    return {
      pageSize: settings.page.size, pageMargins: settings.page.margins,
      background: background(settings, images, "recipe"),
      footer: (page, count) => ({ columns: [
        { text: `${settings.branding.name}  ·  ${settings.branding.tagline}`, fontSize: 7.5, color: t.muted },
        { text: `${page} / ${count}`, fontSize: 7.5, color: t.muted, alignment: "right" }], margin: [settings.page.margins[0], 16, settings.page.margins[2], 0] }),
      content, defaultStyle: { font: t.font, fontSize: 10, color: t.ink },
      info: { title: recipes.length === 1 ? recipes[0].name : "Recipes", author: settings.branding.name },
    };
  }

  // Same page as the PDF's meal-table page, used to test whether the table fits on one page.
  function buildTableFitDoc(client, plan, settings, images) {
    client = normClient(client); plan = normPlan(plan);
    const t = settings.theme, land = isLandscape(plan, settings);
    // Header + table only: long client notes simply continue on the next page and must not shrink the table.
    const content = [mealHeader(client, plan, settings, images, 62), mealTable(client, plan, settings)];
    return { pageSize: settings.page.size, pageOrientation: land ? "landscape" : "portrait", pageMargins: settings.page.margins,
      content, defaultStyle: { font: t.font, fontSize: 10, color: t.ink } };
  }

  // Meal table only -> PNG. Two passes: measure (height undefined), then final height.
  function buildTableDoc(client, plan, settings, images, height) {
    client = normClient(client); plan = normPlan(plan);
    const t = settings.theme;
    return {
      pageSize: { width: pageWidth(settings, isLandscape(plan, settings)), height: height || "auto" },
      pageMargins: [24, 22, 24, 26],
      background: background(settings, images, "table"),
      content: [mealHeader(client, plan, settings, images, 58), mealTable(client, plan, settings, { weights: false })], // PNG: no weight row
      defaultStyle: { font: t.font, fontSize: 10, color: t.ink },
    };
  }

  function recipeFileName(recipes, client) {
    const base = recipes.length === 1 ? recipes[0].name || "Recipe" : `Recipes (${recipes.length})`;
    return client ? `${base} - ${client.name}` : base;
  }
  function fileBaseName(client, plan) {
    client = normClient(client || {}); plan = normPlan(plan);
    const d = planDates(plan);
    const span = d.length === 1 ? dm(d[0]) : `${dm(d[0])} to ${dm(d.at(-1))}`;
    return `${client.name} - ${planTitle(plan)} - ${span}`;
  }


  // ---------- money (Indian format) ----------
  const inr = (n) => "₹" + Math.round(+n || 0).toLocaleString("en-IN");
  function amountInWords(n) {
    n = Math.round(+n || 0); if (!n) return "Rupees Zero Only";
    const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const two = (x) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? " " + a[x % 10] : ""));
    const three = (x) => (x >= 100 ? a[Math.floor(x / 100)] + " Hundred" + (x % 100 ? " " + two(x % 100) : "") : two(x));
    const parts = []; const crore = Math.floor(n / 1e7), lakh = Math.floor((n % 1e7) / 1e5), thou = Math.floor((n % 1e5) / 1000), rest = n % 1000;
    if (crore) parts.push(three(crore) + " Crore"); if (lakh) parts.push(two(lakh) + " Lakh"); if (thou) parts.push(two(thou) + " Thousand"); if (rest) parts.push(three(rest));
    return "Rupees " + parts.join(" ") + " Only";
  }

  // ---------- payment receipt (one page, A5-like on A4 width) ----------
  // r = { client, payment, packageName, fee, paidTotal, due, extra }
  function buildReceiptDoc(r, settings, images) {
    const t = settings.theme, b = settings.branding, rc = settings.receipt || {}, client = normClient(r.client || {}), p = r.payment;
    const W = contentWidth(settings, false);
    const dmy = (iso) => { const d = parseDate(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
    const tile = (label, value, o = {}) => ({ stack: [{ text: label, fontSize: 7.5, characterSpacing: 1.2, color: o.fg ? "#FFFFFF" : t.muted },
        { text: value, bold: true, fontSize: 13, color: o.fg || o.color || t.navy, decoration: o.strike ? "lineThrough" : undefined },
        ...(o.sub ? [{ text: o.sub, fontSize: 7.5, color: o.fg ? "#FFFFFF" : t.muted, margin: [0, 1, 0, 0] }] : [])], fillColor: o.fill || t.soft, margin: [10, 8, 10, 8] });
    const line = (label, value, bold) => [{ text: label, color: t.muted, fontSize: 9.5 }, { text: value, bold: !!bold, fontSize: 10.5, alignment: "right" }];
    const content = [
      { columns: [
        images.logo ? { image: images.logo, fit: [90, 70], width: 100 } : { text: "", width: 0 },
        { stack: [{ text: b.name, bold: true, fontSize: 15, color: t.navy }, b.tagline ? { text: b.tagline, fontSize: 9, color: t.muted } : "",
          ...String(rc.details || "").split("\n").filter(Boolean).map((x) => ({ text: x, fontSize: 8.5, color: t.muted }))], alignment: "right" }] },
      { canvas: [{ type: "rect", x: 0, y: 0, w: W, h: 3, color: t.teal }], margin: [0, 12, 0, 14] },
      { columns: [{ text: "PAYMENT RECEIPT", bold: true, fontSize: 18, color: t.navy, characterSpacing: 1 },
        { stack: [{ text: `Receipt No. ${p.receiptNo || ""}`, bold: true, fontSize: 10, alignment: "right" }, { text: dmy(p.date), fontSize: 9.5, color: t.muted, alignment: "right" }] }], margin: [0, 0, 0, 16] },
      { table: { widths: ["*"], body: [[{ stack: [
          { text: "RECEIVED FROM", fontSize: 7.5, characterSpacing: 1.2, color: t.muted },
          { text: client.name, bold: true, fontSize: 14, color: t.ink, margin: [0, 2, 0, 0] },
          { text: [client.code ? `Client ID: ${client.code}` : "", client.phone ? `${client.code ? "   ·   " : ""}+${client.phoneCode || "91"} ${client.phone}` : ""].join(""), fontSize: 9, color: t.muted }],
          fillColor: t.soft, margin: [12, 10, 12, 10] }]] }, layout: "noBorders", margin: [0, 0, 0, 14] },
      { table: { widths: [110, "*"], body: [
          [{ text: "Amount received", fontSize: 11, color: t.muted, margin: [0, 6, 0, 0] }, { text: inr(p.amount), bold: true, fontSize: 24, color: t.green || t.teal, alignment: "right" }],
          [{ text: amountInWords(p.amount), colSpan: 2, italics: true, fontSize: 9.5, color: t.muted, margin: [0, 0, 0, 8] }, {}],
          line("Payment mode", p.mode || "–"),
          line("For", (r.packageName || "Diet consultation") + (r.packageStart && r.packageEnd ? `  (${dmy(r.packageStart)} – ${dmy(r.packageEnd)})` : "")),
          ...(p.note ? [line("Note", p.note)] : []),
        ] }, layout: { hLineWidth: (i) => (i >= 2 ? 0.6 : 0), vLineWidth: () => 0, hLineColor: () => "#E3E8EE", paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 0, paddingRight: () => 0 } },
      ...(r.fee || r.price ? [{ margin: [0, 16, 0, 0], table: { widths: r.discount ? ["*", "*", "*"] : ["*", "*", "*"], body: [
          ...(r.discount ? [[tile("PRICE", inr(r.price), { strike: true, color: t.muted }),
            tile(`DISCOUNT${r.discountPct != null ? ` (${r.discountPct}%)` : ""}`, "− " + inr(r.discount), { color: t.green || t.teal, fill: "#EEF7E6", sub: r.discountReason || "" }),
            tile("TOTAL FEE", inr(r.fee))]] : []),
          [r.discount ? tile("PAID TILL DATE", inr(r.paidTotal)) : tile("TOTAL FEE", inr(r.fee)),
           r.discount ? tile(r.due > 0 ? "BALANCE DUE" : r.extra > 0 ? "ADVANCE" : "BALANCE", r.due > 0 ? inr(r.due) : r.extra > 0 ? inr(r.extra) : "Fully paid", r.due > 0 ? { fill: t.coral, fg: "#FFFFFF" } : { fill: "#E6F4F2", color: t.green || t.teal })
             : tile("PAID TILL DATE", inr(r.paidTotal)),
           r.discount ? { text: "" } : tile(r.due > 0 ? "BALANCE DUE" : r.extra > 0 ? "ADVANCE" : "BALANCE", r.due > 0 ? inr(r.due) : r.extra > 0 ? inr(r.extra) : "Fully paid", r.due > 0 ? { fill: t.coral, fg: "#FFFFFF" } : { fill: "#E6F4F2", color: t.green || t.teal })]] },
          layout: { hLineWidth: () => 6, hLineColor: () => "#FFFFFF", vLineWidth: () => 6, vLineColor: () => "#FFFFFF", paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 } }] : []),
      ...(r.savedLine ? [{ text: r.savedLine, bold: true, fontSize: 12, color: t.green || t.teal, alignment: "center", margin: [0, 12, 0, 0] }] : []),
      ...(rc.note ? [{ text: rc.note, fontSize: 9.5, color: t.ink, margin: [0, 18, 0, 0] }] : []),
      { text: "This is a computer-generated receipt.", fontSize: 7.5, color: t.muted, alignment: "center", margin: [0, 30, 0, 0] },
    ];
    return { pageSize: settings.page.size, pageMargins: settings.page.margins, content,
      defaultStyle: { font: t.font, fontSize: 10, color: t.ink }, info: { title: `Receipt ${p.receiptNo || ""} - ${client.name}`, author: b.name } };
  }

  // ---------- invoice (asks the client to pay; made before or between payments) ----------
  // r = { client, invoiceNo, date, packageName, start, price, discount, discountPct, discountReason, fee, paid, due, savedLine, showPay, showQr }
  function upiLink(rc, amount, note, payee) {
    return `upi://pay?pa=${encodeURIComponent(rc.upiId).replace(/%40/g, "@")}&pn=${encodeURIComponent(payee)}&am=${(+amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
  }
  function buildInvoiceDoc(r, settings, images) {
    const t = settings.theme, b = settings.branding, rc = settings.receipt || {}, client = normClient(r.client || {});
    const dmy = (iso) => { const d = parseDate(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
    const row = (label, value, o = {}) => [{ text: label, fontSize: o.big ? 12 : 10, bold: !!o.big, color: o.big ? t.navy : t.muted, margin: [0, o.big ? 4 : 0, 0, 0] },
      { text: value, fontSize: o.big ? 18 : 10.5, bold: !!(o.big || o.bold), alignment: "right", color: o.color || (o.big ? t.coral : t.ink), decoration: o.strike ? "lineThrough" : undefined }];
    const lines = [
      ...(r.discount ? [row("Price", inr(r.price), { strike: true }),
        [{ stack: [{ text: `Discount${r.discountPct != null ? ` (${r.discountPct}%)` : ""}`, fontSize: 10, color: t.green || t.teal }, ...(r.discountReason ? [{ text: r.discountReason, fontSize: 8, color: t.muted }] : [])] },
         { text: "− " + inr(r.discount), fontSize: 10.5, bold: true, alignment: "right", color: t.green || t.teal }]] : []),
      row("Total fee", inr(r.fee), { bold: true }),
      ...(r.paid ? [row("Paid so far", "− " + inr(r.paid))] : []),
      row("AMOUNT DUE", inr(r.due), { big: true }),
    ];
    const payee = rc.upiName || b.name;
    const payBlock = [];
    if (r.showPay && (rc.upiId || rc.bank)) payBlock.push({ stack: [{ text: "HOW TO PAY", fontSize: 7.5, characterSpacing: 1.2, color: t.muted, margin: [0, 0, 0, 4] },
      ...(rc.upiId ? [{ text: [{ text: "UPI: ", color: t.muted }, { text: rc.upiId, bold: true }], fontSize: 10.5 }, ...(rc.upiName ? [{ text: `Name: ${rc.upiName}`, fontSize: 9, color: t.muted }] : [])] : []),
      ...(rc.bank ? [{ text: "Bank transfer", fontSize: 9, color: t.muted, margin: [0, rc.upiId ? 8 : 0, 0, 1] }, ...String(rc.bank).split("\n").filter(Boolean).map((x) => ({ text: x, fontSize: 9.5 }))] : [])], width: "*" });
    if (r.showQr && rc.upiId && r.due > 0) payBlock.push({ stack: [{ qr: upiLink(rc, r.due, `Invoice ${r.invoiceNo}`, payee), fit: 120, foreground: t.navy, alignment: "center" },
      { text: `Scan to pay ${inr(r.due)}`, fontSize: 8.5, color: t.muted, alignment: "center", margin: [0, 4, 0, 0] }, { text: "GPay · PhonePe · Paytm · any UPI app", fontSize: 7, color: t.muted, alignment: "center" }], width: 150 });
    const content = [
      { columns: [
        images.logo ? { image: images.logo, fit: [90, 70], width: 100 } : { text: "", width: 0 },
        { stack: [{ text: b.name, bold: true, fontSize: 15, color: t.navy }, b.tagline ? { text: b.tagline, fontSize: 9, color: t.muted } : "",
          ...String(rc.details || "").split("\n").filter(Boolean).map((x) => ({ text: x, fontSize: 8.5, color: t.muted }))], alignment: "right" }] },
      { canvas: [{ type: "rect", x: 0, y: 0, w: contentWidth(settings, false), h: 3, color: t.navy }], margin: [0, 12, 0, 14] },
      { columns: [{ text: "INVOICE", bold: true, fontSize: 20, color: t.navy, characterSpacing: 1.5 },
        { stack: [{ text: `Invoice No. ${r.invoiceNo}`, bold: true, fontSize: 10, alignment: "right" }, { text: dmy(r.date), fontSize: 9.5, color: t.muted, alignment: "right" }] }], margin: [0, 0, 0, 16] },
      { table: { widths: ["*"], body: [[{ stack: [
          { text: "BILL TO", fontSize: 7.5, characterSpacing: 1.2, color: t.muted },
          { text: client.name, bold: true, fontSize: 14, color: t.ink, margin: [0, 2, 0, 0] },
          { text: [client.code ? `Client ID: ${client.code}` : "", client.phone ? `${client.code ? "   ·   " : ""}+${client.phoneCode || "91"} ${client.phone}` : ""].join(""), fontSize: 9, color: t.muted }],
          fillColor: t.soft, margin: [12, 10, 12, 10] }]] }, layout: "noBorders", margin: [0, 0, 0, 16] },
      { columns: [{ text: "DESCRIPTION", fontSize: 7.5, characterSpacing: 1.2, color: t.muted }, { text: "AMOUNT", fontSize: 7.5, characterSpacing: 1.2, color: t.muted, alignment: "right" }], margin: [0, 0, 0, 4] },
      { text: [{ text: r.packageName || "Diet consultation", bold: true }, r.start ? { text: r.end ? `   ${dmy(r.start)} – ${dmy(r.end)}` : `   from ${dmy(r.start)}`, color: t.muted, fontSize: 9 } : ""], fontSize: 11, margin: [0, 0, 0, 8] },
      { table: { widths: ["*", 140], body: lines }, layout: { hLineWidth: (i, n) => (i === n.table.body.length - 1 ? 1 : 0), hLineColor: () => t.navy, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 5, paddingBottom: () => 5 } },
      { text: amountInWords(r.due), italics: true, fontSize: 9, color: t.muted, alignment: "right", margin: [0, 2, 0, 0] },
      ...(r.savedLine ? [{ text: r.savedLine, bold: true, fontSize: 12, color: t.green || t.teal, alignment: "center", margin: [0, 14, 0, 0] }] : []),
      ...(payBlock.length ? [{ table: { widths: ["*"], body: [[{ columns: payBlock, columnGap: 16, fillColor: "#F1F8F7", margin: [12, 12, 12, 12] }]] }, layout: "noBorders", margin: [0, 18, 0, 0] }] : []),
      ...(rc.note ? [{ text: rc.note, fontSize: 9.5, color: t.ink, margin: [0, 18, 0, 0] }] : []),
      { text: "This is a computer-generated invoice.", fontSize: 7.5, color: t.muted, alignment: "center", margin: [0, 30, 0, 0] },
    ];
    return { pageSize: settings.page.size, pageMargins: settings.page.margins, content,
      defaultStyle: { font: t.font, fontSize: 10, color: t.ink }, info: { title: `Invoice ${r.invoiceNo} - ${client.name}`, author: b.name } };
  }

  // ---------- fonts: Poppins (Latin + Hindi/Devanagari + ₹) with a symbol fallback (✓ → ★ …) ----------
  // Every text in a document is split into runs: characters Poppins has stay as they are, symbols go to the
  // "Sym" font, emoji are left out (PDF fonts can't draw them). Anything else (e.g. Gujarati) is reported in doc._missing.
  const FONT_MAIN = "0,d,20-7e,a0-107,10a-11b,11e-123,128-131,136-137,139-148,14c-15b,15e-165,168-17e,18f,192,1fc-1fd,218-21b,259,2bc,2c6-2c7,2c9,2da,2dc-2dd,901-903,905-90d,90f-911,913-928,92a-933,935-939,93c-945,947-949,94b-94d,950,958-95e,960-970,972,1e80-1e85,1ef2-1ef3,1ef8-1ef9,200c-200d,2013-2014,2018-201a,201c-201e,2020,2022,2026,2039-203a,2044,20a8,20ac,20b9-20ba,20bd,2113,2122,2212,2215,25cc";
  const FONT_SYM = "2010-2012,2015-2017,201b,201f,2021,2023-2025,2027-2038,203b-2043,2045-205f,20a0-20a7,20a9-20ab,20ad-20b5,20b8,2100-2109,210b-2112,2114-2121,2123-2149,214b,214e,2190-2211,2213-2214,2216-2311,2318-2319,231c-2321,2324-2328,232b-232c,2373-2375,237a,237d,2387,2394,239b-23ae,23ce-23cf,23e3,23e5,23e8,25a0-25cb,25cd-269c,269e-26b8,26c0-26c3,26e2,2701-2704,2706-2709,270c-2727,2729-274b,274d,274f-2752,2756,2758-275e,2761-2794,2798-27af,27b1-27be,2b00-2b1a,2b1f-2b24,2b53-2b54";
  const parseRanges = (s) => s.split(",").map((x) => x.split("-").map((h) => parseInt(h, 16))).map(([a, b]) => [a, b ?? a]);
  const R_MAIN = parseRanges(FONT_MAIN), R_SYM = parseRanges(FONT_SYM);
  const inR = (R, c) => { let lo = 0, hi = R.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (c < R[m][0]) hi = m - 1; else if (c > R[m][1]) lo = m + 1; else return true; } return false; };
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{FE0F}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u;
  function splitRuns(str, missing) {
    if (!/[^\x00-\x7E]/.test(str)) return null;   // plain ASCII: nothing to do
    const runs = []; let cur = "", curF = null, changed = false;
    for (const ch of str) {
      const c = ch.codePointAt(0);
      let f;
      if (c < 0x7F || inR(R_MAIN, c)) f = null;
      else if (EMOJI.test(ch) || (c >= 0x2600 && c <= 0x27BF && !inR(R_SYM, c))) { changed = true; continue; }
      else if (inR(R_SYM, c)) f = "Sym";
      else { f = null; missing.add(ch); }
      if (f !== curF && cur) { runs.push(curF ? { text: cur, font: curF } : cur); cur = ""; }
      curF = f; cur += ch;
      if (f) changed = true;
    }
    if (cur) runs.push(curF ? { text: cur, font: curF } : cur);
    return changed ? runs : null;
  }
  function fontRuns(node, missing) {
    if (Array.isArray(node)) { node.forEach((n, i) => { if (typeof n === "string") { const r = splitRuns(n, missing); if (r) node[i] = { text: r }; } else fontRuns(n, missing); }); return node; }
    if (!node || typeof node !== "object") return node;
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (k === "text" && typeof v === "string") { const r = splitRuns(v, missing); if (r) node.text = r; }
      else if (k === "image" || k === "svg" || k === "canvas" || typeof v === "function") continue;
      else if (v && typeof v === "object") fontRuns(v, missing);
    }
    return node;
  }
  function withFonts(doc) {
    const missing = new Set();
    fontRuns(doc.content, missing);
    for (const k of ["header", "footer"]) if (typeof doc[k] === "function") { const f = doc[k]; doc[k] = (...a) => fontRuns(f(...a), new Set()); }
    doc._missing = [...missing];
    return doc;
  }

  const api = { buildInvoiceDoc, inr, amountInWords, buildReceiptDoc, recipeHasContent, buildCoverFitDoc, recipeFileName, buildRecipeDoc, programInfo, buildPlanDoc, buildTableDoc, buildTableFitDoc, sectionOn, healthItems, patternOf, slotInfo, resolveSlots, fileBaseName, computeBmi, bmiBand, metrics, resolveSlots };
  for (const k of ["buildPlanDoc", "buildTableDoc", "buildTableFitDoc", "buildRecipeDoc", "buildCoverFitDoc", "buildReceiptDoc", "buildInvoiceDoc"]) { const f = api[k]; api[k] = (...a) => withFonts(f(...a)); }
  api.FONT_FILES = { main: { 400: "poppins-full-400.woff", 600: "poppins-full-600.woff" }, sym: { 400: "sym-400.woff", 600: "sym-600.woff" } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DietRender = api;
})(this);
