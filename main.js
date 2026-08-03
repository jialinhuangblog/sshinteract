// Engine: render loop + typewriter + draggable floats + i18n. Content lives in data.js.

const NAV_LANG = navigator.language || "en";
let lang = localStorage.getItem("sshinteract-lang")
  || (NAV_LANG.startsWith("zh") ? "zh" : "en");
if (lang === "ja") lang = "zh";  // ja retired from the switcher
const LANG_LABELS = { en: "EN", zh: "中文" };  // ja data kept in data.js but not offered: never checked by a native speaker

// prose fields are either a plain string (same in all languages) or {en, zh, ja}
function T(v) { return typeof v === "string" ? v : (v[lang] || v.en); }

let mode = 0, idx = 0, typeToken = 0, compareOn = false;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = id => document.getElementById(id);
const els = {
  tabs: $("tabs"), langs: $("langs"), intro: $("intro"), terms: $("terms"),
  h1text: $("h1text"), bar: $("bar"), note: $("note"),
  stepname: $("stepname"), prev: $("prev"), next: $("next"), prog: $("prog"),
};
let panes = {}, paneWins = {}, fsOpen = {};

// one nav to rule them all: the step arrows also cross mode boundaries.
// the pill is an indicator + jump menu, not a second pair of arrows.
function gotoMode(i, stepIdx) {
  if (i === MODES.length) {
    compareOn = true;
  } else {
    compareOn = false; mode = i; idx = stepIdx; fsOpen = {};
  }
  clearFsPops();
  render();
}

function buildTabs() {
  els.tabs.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "modewrap";
  const pill = document.createElement("button");
  pill.className = "modename";
  pill.textContent = (compareOn ? T(COMPARE.tab) : MODES[mode].tab) + " ▾";
  const menu = document.createElement("div");
  menu.className = "modemenu";
  menu.hidden = true;
  MODES.forEach((m, i) => {
    const b = document.createElement("button");
    b.textContent = m.tab;
    b.onclick = () => gotoMode(i, 0);
    menu.appendChild(b);
  });
  const c = document.createElement("button");
  c.textContent = T(COMPARE.tab);
  c.onclick = () => gotoMode(MODES.length, 0);
  menu.appendChild(c);
  pill.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  wrap.append(pill, menu);
  els.tabs.appendChild(wrap);
}
// pointerdown, not click: iOS doesn't reliably bubble click from non-interactive areas
document.addEventListener("pointerdown", e => {
  if (e.target.closest(".modewrap")) return;
  document.querySelectorAll(".modemenu").forEach(m => { m.hidden = true; });
});

// --- provenance panel behind the i button ---
function envHTML() {
  const rows = ENV.rows.map(r =>
    `<tr><td>${T(r.k)}</td><td class="mono">${esc(T(r.v))}</td></tr>`).join("");
  const notes = ENV.notes.map(n => `<p class="envnote">${T(n)}</p>`).join("");
  return `<div class="envcard">
    <div class="envhead"><span class="envtitle">${T(ENV.title)}</span>
      <button class="envclose" aria-label="close">×</button></div>
    <p class="envlead">${T(ENV.lead)}</p>
    <table class="envtbl"><tbody>${rows}</tbody></table>
    ${notes}
    <p class="envnote">${T(ENV.scripts)}</p>
  </div>`;
}

function toggleEnv(open) {
  const w = $("envwrap"), b = $("envbtn");
  if (open) { w.innerHTML = envHTML(); w.hidden = false; w.querySelector(".envclose").onclick = () => toggleEnv(false); }
  else { w.hidden = true; w.innerHTML = ""; }
  b.setAttribute("aria-expanded", String(!!open));
}
$("envbtn").onclick = e => { e.stopPropagation(); toggleEnv($("envwrap").hidden); };
$("envwrap").addEventListener("pointerdown", e => { if (e.target.id === "envwrap") toggleEnv(false); });
addEventListener("keydown", e => { if (e.key === "Escape") toggleEnv(false); });

function buildLangs() {
  els.langs.innerHTML = "";
  Object.keys(LANG_LABELS).forEach(l => {
    const b = document.createElement("button");
    b.className = "lang" + (l === lang ? " on" : "");
    b.textContent = LANG_LABELS[l];
    b.onclick = () => {
      lang = l;
      localStorage.setItem("sshinteract-lang", l);
      render();
    };
    els.langs.appendChild(b);
  });
}

function accFiles() {
  const m = MODES[mode];
  const acc = {};
  m.machines.forEach(k => { acc[k] = []; });
  // a file is identified by its path: if a later step attaches the same
  // dir+name, it is the same file whose content was overwritten (alice's cert
  // goes from the 2026 body to the 2027 one on the re-sign), so replace the
  // entry in place rather than showing the file twice.
  const pathOf = fk => `${F[fk].dir}/${perMode(F[fk].name)}`;
  for (let i = 0; i <= idx; i++) {
    (m.steps[i].files || []).forEach(([mk, fk]) => {
      const ex = acc[mk].find(e => pathOf(e.fk) === pathOf(fk));
      if (ex) { ex.fk = fk; ex.isNew = i === idx; }
      else acc[mk].push({ fk, isNew: i === idx });
    });
  }
  return acc;
}

// A panel shown in several modes holds a different real value in each: every
// mode is its own lab run, with its own keys. So name and content may be an
// object keyed by mode number instead of a plain string.
const perMode = (v, fallbackKey) =>
  typeof v === "string" ? v : (v[MODES[mode].id] || Object.values(v)[0]);
const fcontent = f => perMode(f.content);
const fname = f => perMode(f.name);

function fsTreeHTML(entries) {
  const dirs = [], byDir = {};
  entries.forEach(e => {
    const d = F[e.fk].dir;
    if (!byDir[d]) { byDir[d] = []; dirs.push(d); }
    byDir[d].push(e);
  });
  let html = "";
  dirs.forEach(d => {
    html += `<div class="dirline">${d}</div>`;
    byDir[d].forEach((e, i) => {
      const f = F[e.fk];
      const last = i === byDir[d].length - 1;
      const tagText = f.tag === "private" ? T(UI.tagPrivate) : f.tag === "auto" ? T(UI.tagAuto) : f.tag === "manual" ? T(UI.tagManual) : "cert";
      html += `<div class="fline${e.isNew ? " new" : ""}" tabindex="0"><span class="branch">${last ? "└── " : "├── "}</span><span class="fname-t">${fname(f)}</span>${f.tag ? `<span class="tag ${f.tag}">${tagText}</span>` : ""}<div class="fpop">${fcontent(f)}</div></div>`;
    });
  });
  return html;
}

// The file popover flies left of the fs panel by default (CSS). But the CA
// terminal sits at the screen's left, so 440px to the left runs off-viewport
// (measured: left:-347). On hover, pick the side with room and clamp to screen.
document.addEventListener("mouseover", e => {
  const fline = e.target.closest && e.target.closest(".fline");
  if (!fline) return;
  const pop = fline.querySelector(".fpop");
  if (!pop) return;
  pop.style.left = pop.style.right = "auto";       // reset before measuring
  const line = fline.getBoundingClientRect();
  const w = pop.offsetWidth || 440, pad = 8;
  // room to the left of the fs panel vs to the right
  const roomLeft = line.left - pad, roomRight = innerWidth - line.right - pad;
  let x = roomLeft >= w ? line.left - 10 - w        // fly left (preferred)
        : roomRight >= w ? line.right + 10          // else fly right
        : Math.max(pad, innerWidth - w - pad);      // else pin to the right edge
  x = Math.max(pad, Math.min(x, innerWidth - w - pad));
  // position: fixed so viewport coords work regardless of scrolled ancestors
  pop.style.position = "fixed";
  pop.style.left = x + "px";
  pop.style.top = Math.max(pad, Math.min(line.top - 4, innerHeight - pop.offsetHeight - pad)) + "px";
}, true);

let fsPops = {};  // live panel elements, updated in place so they never flash

// the termbar's fs button IS the minimized state on every platform:
// the panel only exists while open, embedded at the terminal's top-right, × closes it
function refreshFs() {
  const acc = accFiles();
  MODES[mode].machines.forEach(mk => {
    const win = paneWins[mk];
    if (!win) return;
    const btn = win.querySelector(".fsbtn");
    const n = acc[mk].length;
    btn.innerHTML = `fs <span class="cnt">${n}</span>`;
    btn.style.visibility = n ? "visible" : "hidden";
    if (fsOpen[mk] && n) {
      let pop = fsPops[mk];
      if (!pop || !pop.isConnected) {
        pop = document.createElement("div");
        pop.className = "fspop";
        pop.innerHTML = `<div class="fshead"><span class="ftitle host who-${mk}"></span><button class="fsminbtn">×</button></div><div class="fsbody"></div>`;
        win.appendChild(pop);
        pop.querySelector(".fsminbtn").onclick = e => {
          e.stopPropagation();
          fsOpen[mk] = false;
          refreshFs();
        };
        fsPops[mk] = pop;
      }
      pop.querySelector(".ftitle").textContent = `${MACHINES[mk].label} · fs ${n}`;
      pop.querySelector(".fsbody").innerHTML = fsTreeHTML(acc[mk]);
    } else if (fsPops[mk]) {
      fsPops[mk].remove();
      delete fsPops[mk];
    }
  });
}

function clearFsPops() {
  Object.values(fsPops).forEach(p => p.remove());
  fsPops = {};
}

// commentary panel: fixed in flow below the nav bar, thick border in the actor's color
function renderNote(step) {
  const anchor = step.actor || (step.arrow && step.arrow[0]);
  const who = step.actor
    ? MACHINES[step.actor].label
    : `${MACHINES[step.arrow[0]].label} → ${MACHINES[step.arrow[1]].label}`;
  els.note.hidden = false;
  els.note.className = "note-panel who-" + anchor;
  els.note.innerHTML = `<div class="btitle">${who} · ${T(step.title)}</div>`
    + (step.note ? `<div class="bnote">${T(step.note)}</div>` : "")
    + `<p class="btext">${T(step.expl)}</p>`;
  applyNotePos();
}

// --- dragging the note ---
// Where the reader last put it, kept across steps and modes. null = the CSS
// default (top-left of the stage).
let notePos = null;

function applyNotePos() {
  // position: fixed, so these are viewport coordinates and the note can be
  // dragged anywhere on screen, not only over the terminals. The first render
  // seeds it from the stage's top-left, which is where it used to live.
  if (!notePos) {
    const st = els.note.parentElement.getBoundingClientRect();
    notePos = { x: st.left + 8, y: st.top + 8 };
  }
  els.note.style.left = notePos.x + "px";
  els.note.style.top = notePos.y + "px";
}

els.note.addEventListener("pointerdown", e => {
  // let people select the text; only the padding and the title start a drag
  if (e.target.closest(".bnote, .btext")) return;
  const box = els.note.getBoundingClientRect();
  const grabX = e.clientX - box.left, grabY = e.clientY - box.top;
  els.note.setPointerCapture(e.pointerId);
  els.note.classList.add("dragging");

  const move = ev => {
    // anywhere on screen; clamped to the viewport only so it cannot be lost
    const x = Math.max(0, Math.min(ev.clientX - grabX, innerWidth - box.width));
    const y = Math.max(0, Math.min(ev.clientY - grabY, innerHeight - box.height));
    notePos = { x, y };
    applyNotePos();
  };
  const up = () => {
    els.note.classList.remove("dragging");
    els.note.removeEventListener("pointermove", move);
    els.note.removeEventListener("pointerup", up);
  };
  els.note.addEventListener("pointermove", move);
  els.note.addEventListener("pointerup", up);
});

// a drag that ends up off-screen after a resize would be unreachable
addEventListener("resize", () => { notePos = null; applyNotePos(); });

// --- terminal typing engine (accumulating) ---
function makeLine(line) {
  const kind = line[0], pane = panes[line[1]];
  if (!pane) return null;
  if (kind === "i") {
    // input continuation: the terminal is waiting at a prompt like "password:" —
    // typed text lands on the pane's last line, no new prompt
    let div = pane.lastElementChild;
    if (!div) {
      div = document.createElement("div");
      div.className = "tline";
      pane.appendChild(div);
    }
    return { pane, div, text: line[2] };
  }
  pane.closest(".termwin").classList.remove("quiet");
  const div = document.createElement("div");
  div.className = "tline" + (kind === "o" ? " out" : kind === "k" ? " ok" : "");
  let text;
  if (kind === "c") {
    const p = PROMPTS[line[2]];
    const s = document.createElement("span");
    s.className = "prompt who-" + p.who;
    s.textContent = p.text + " ";
    div.appendChild(s);
    text = line[3];
  } else {
    text = line[2];
  }
  pane.appendChild(div);
  pane.scrollTop = pane.scrollHeight;
  return { pane, div, text };
}

function appendInstant(line) {
  const l = makeLine(line);
  if (l && l.text) l.div.appendChild(document.createTextNode(l.text));
  if (l) l.pane.scrollTop = l.pane.scrollHeight;
}

function playTerm(lines, onDone) {
  const token = ++typeToken;
  const cursor = document.createElement("span");
  cursor.className = "cursor";

  function typeInto(l, speed, cb) {
    l.div.appendChild(cursor);
    if (reduced || !l.text) {
      cursor.insertAdjacentText("beforebegin", l.text);
      l.pane.scrollTop = l.pane.scrollHeight;
      cb();
      return;
    }
    let i = 0;
    (function tick() {
      if (token !== typeToken) return;
      if (i >= l.text.length) { cb(); return; }
      cursor.insertAdjacentText("beforebegin", l.text[i++]);
      l.pane.scrollTop = l.pane.scrollHeight;
      setTimeout(tick, speed);
    })();
  }

  let li = 0;
  (function nextLine() {
    if (token !== typeToken) return;
    if (li >= lines.length) { onDone && onDone(token); return; }
    const line = lines[li++];
    const l = makeLine(line);
    if (!l) { nextLine(); return; }
    const isTyped = line[0] === "c" || line[0] === "i";
    typeInto(l, isTyped ? 26 : 10, () => setTimeout(nextLine, reduced ? 0 : isTyped ? 260 : 180));
  })();
}

// machine name colored like everywhere else
const mspan = k => `<span class="host who-${k}">${MACHINES[k].label}</span>`;
// commands carry >> and quotes, so they cannot go into innerHTML raw
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function compareHTML() {
  // by id, not by index: failure pages are interleaved between the modes
  const byId = id => MODES.find(m => m.id === id);
  const modeCols = [byId("ca").tab, byId("hostca").tab, byId("hostonly").tab];
  const fileRows = COMPARE.files.map(r =>
    `<tr><td>${T(r.name)}</td><td>${r.where.map(mspan).join(" → ")}</td>`
    + r.m.map(v => `<td class="c">${v ? '<span class="yes">✓</span>' : '<span class="no">—</span>'}</td>`).join("")
    + `</tr>`).join("");
  const scenRows = COMPARE.scen.map(r =>
    `<tr><td class="mono">${r.mode}</td><td>${T(r.dir)}</td><td>${T(r.fit)}</td></tr>`).join("");
  const cmdRows = COMPARE.cmds.map(r =>
    `<tr><td class="cmd"><code>${esc(r.cmd)}</code><span class="who">${r.who}</span></td>`
    + `<td class="c mono">${r.modes}</td><td>${T(r.d)}</td></tr>`).join("");
  return `<div class="compare">
    <h2>${T(COMPARE.filesH)}</h2>
    <div class="tblwrap"><table>
      <thead><tr><th>${T(COMPARE.colFile)}</th><th>${T(COMPARE.colWhere)}</th>${modeCols.map(t => `<th class="c">${t}</th>`).join("")}</tr></thead>
      <tbody>${fileRows}</tbody>
    </table></div>
    <p class="note">${T(COMPARE.pairsNote)}</p>
    <p class="note">${T(COMPARE.invariants)}</p>
    <h2>${T(COMPARE.fitH)}</h2>
    <div class="tblwrap"><table>
      <thead><tr><th>mode</th><th>${T(COMPARE.colDir)}</th><th>${T(COMPARE.colFit)}</th></tr></thead>
      <tbody>${scenRows}</tbody>
    </table></div>
    <p class="note">${T(COMPARE.heuristic)}</p>
    <p class="note">${T(COMPARE.angle)}</p>
    <h2>${T(COMPARE.cmdsH)}</h2>
    <div class="tblwrap"><table class="cmdtbl">
      <thead><tr><th>${T(COMPARE.colCmd)}</th><th class="c">${T(COMPARE.colModes)}</th><th>${T(COMPARE.colDoes)}</th></tr></thead>
      <tbody>${cmdRows}</tbody>
    </table></div>
    <p class="note">${T(COMPARE.cmdsNote)}</p>
  </div>`;
}

function render() {
  buildTabs();
  buildLangs();
  els.h1text.textContent = T(UI.title);
  document.title = T(UI.title);

  if (compareOn) {
    els.intro.textContent = T(COMPARE.intro);
    els.bar.style.display = "none";
    els.note.hidden = true;
    els.terms.innerHTML = compareHTML();
    return;
  }
  els.bar.style.display = "";

  const m = MODES[mode];
  const step = m.steps[idx];
  els.intro.textContent = T(m.intro);

  const actors = step.actor ? [step.actor] : step.arrow ? [step.arrow[0], step.arrow[1]] : [];

  els.terms.innerHTML = "";
  panes = {}; paneWins = {};
  const buildWin = key => {
    const win = document.createElement("div");
    win.className = "termwin";
    win.innerHTML = `<div class="termbar">
        <span class="lamp who-${key}"></span>
        <span class="host who-${key}">${MACHINES[key].label}</span>
        <span class="sub">${T(MACHINES[key].sub)}</span>
        <button class="fsbtn" title="${T(UI.fsTitle)}">fs</button>
      </div><div class="termbody"></div>`;
    panes[key] = win.querySelector(".termbody");
    paneWins[key] = win;
    win.querySelector(".fsbtn").onclick = e => {
      e.stopPropagation();
      fsOpen[key] = !fsOpen[key];
      refreshFs();
    };
    win.querySelector(".termbody").onclick = () => els.next.click();
    return win;
  };
  // layout: m.columns lets a column hold more than one terminal. Each entry is a
  // machine key, or an array of keys stacked vertically in one column (the ops
  // page puts alice and bob side by side there). Falls back to one column each.
  (m.columns || m.machines).forEach(col => {
    if (Array.isArray(col)) {
      const group = document.createElement("div");
      group.className = "termcol";
      col.forEach(k => group.appendChild(buildWin(k)));
      els.terms.appendChild(group);
    } else {
      els.terms.appendChild(buildWin(col));
    }
  });
  actors.forEach(a => paneWins[a] && paneWins[a].classList.add("active-" + a));
  // terminals with no output yet collapse on mobile; first line un-collapses them
  m.machines.forEach(key => paneWins[key].classList.add("quiet"));

  // history lands instantly, current step types
  for (let i = 0; i < idx; i++) {
    (m.steps[i].term || []).forEach(appendInstant);
  }
  // no auto-open anywhere: the panel covers output, the badge count is the cue
  refreshFs();

  // commentary leads, typewriter follows
  renderNote(step);
  playTerm(step.term || []);

  els.stepname.innerHTML = `<span class="ph">${T(UI[step.phase])}</span> ${T(step.title)}`;
  els.prev.disabled = mode === 0 && idx === 0;
  els.next.disabled = false;
  els.prog.textContent = `${idx + 1} / ${m.steps.length}`;
}

els.prev.onclick = () => {
  if (compareOn) return;
  if (idx > 0) { idx--; render(); }
  else if (mode > 0) gotoMode(mode - 1, MODES[mode - 1].steps.length - 1);
};
els.next.onclick = () => {
  if (compareOn) return;
  if (idx < MODES[mode].steps.length - 1) { idx++; render(); }
  else if (mode < MODES.length - 1) gotoMode(mode + 1, 0);
  else gotoMode(MODES.length, 0);  // past the last step of the last mode → compare
};
document.addEventListener("keydown", e => {
  if (compareOn) return;
  if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); els.next.click(); }
  if (e.key === "ArrowLeft") els.prev.click();
});
render();
