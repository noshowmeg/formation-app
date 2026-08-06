/* ============================================================
   Formation Builder — app.js
   Vanilla JS. No build step, no backend.

   NOTE ON FUTURE API INTEGRATION
   -------------------------------
   All player data currently comes from the local PLAYERS array
   below. The search UI (filterPlayers) and roster render
   (renderRoster) are the only two places that read from it.
   To swap in a real API:
     - Replace PLAYERS with an async fetch, cache results locally
     - Make filterPlayers async (debounce the input handler) and
       hit a `/players?q=` style endpoint instead of Array.filter
     - Keep the Player shape { id, name, number, color } so the
       rest of the app (assignment, jersey rendering, roster
       chips) doesn't need to change.
   ============================================================ */

(function () {
  "use strict";

  /* ---------------- Player data (generic, local) ---------------- */

  const PLAYER_COLORS = [
    "#e6194b", "#3cb44b", "#ffd400", "#4363d8", "#f58231",
    "#a349e6", "#42d4f4", "#f032e6", "#8fd400", "#ff8fb2",
    "#469990", "#b19cd9", "#c47a2c", "#f2e28a", "#c44545",
    "#7fd9a0"
  ];

  const PLAYERS = Array.from({ length: 16 }, (_, i) => ({
    id: "player" + (i + 1),
    name: "Player " + (i + 1),
    number: i + 1,
    color: PLAYER_COLORS[i]
  }));

  const PLACEHOLDER_COLOR = "#8b93a8";

  /* ---------------- Formation data ---------------- */

  // x, y are percentages of the pitch box. y:0 = attacking end, y:100 = GK end.
  const DEFAULT_FORMATIONS = {
    "4-3-3": [
      { role: "GK", x: 50, y: 92 },
      { role: "LB", x: 14, y: 74 }, { role: "CB", x: 34, y: 76 },
      { role: "CB", x: 66, y: 76 }, { role: "RB", x: 86, y: 74 },
      { role: "CM", x: 28, y: 50 }, { role: "CM", x: 50, y: 46 }, { role: "CM", x: 72, y: 50 },
      { role: "LW", x: 16, y: 18 }, { role: "ST", x: 50, y: 10 }, { role: "RW", x: 84, y: 18 }
    ],
    "4-4-2": [
      { role: "GK", x: 50, y: 92 },
      { role: "LB", x: 14, y: 74 }, { role: "CB", x: 34, y: 76 },
      { role: "CB", x: 66, y: 76 }, { role: "RB", x: 86, y: 74 },
      { role: "LM", x: 14, y: 46 }, { role: "CM", x: 37, y: 48 },
      { role: "CM", x: 63, y: 48 }, { role: "RM", x: 86, y: 46 },
      { role: "ST", x: 36, y: 14 }, { role: "ST", x: 64, y: 14 }
    ],
    "4-2-3-1": [
      { role: "GK", x: 50, y: 92 },
      { role: "LB", x: 14, y: 74 }, { role: "CB", x: 34, y: 76 },
      { role: "CB", x: 66, y: 76 }, { role: "RB", x: 86, y: 74 },
      { role: "CDM", x: 36, y: 56 }, { role: "CDM", x: 64, y: 56 },
      { role: "LW", x: 16, y: 32 }, { role: "CAM", x: 50, y: 28 }, { role: "RW", x: 84, y: 32 },
      { role: "ST", x: 50, y: 10 }
    ],
    "3-5-2": [
      { role: "GK", x: 50, y: 92 },
      { role: "CB", x: 26, y: 76 }, { role: "CB", x: 50, y: 80 }, { role: "CB", x: 74, y: 76 },
      { role: "LM", x: 10, y: 48 }, { role: "CM", x: 32, y: 50 }, { role: "CM", x: 50, y: 54 },
      { role: "CM", x: 68, y: 50 }, { role: "RM", x: 90, y: 48 },
      { role: "ST", x: 36, y: 14 }, { role: "ST", x: 64, y: 14 }
    ],
    "3-4-3": [
      { role: "GK", x: 50, y: 92 },
      { role: "CB", x: 26, y: 76 }, { role: "CB", x: 50, y: 80 }, { role: "CB", x: 74, y: 76 },
      { role: "LM", x: 15, y: 50 }, { role: "CM", x: 38, y: 52 },
      { role: "CM", x: 62, y: 52 }, { role: "RM", x: 85, y: 50 },
      { role: "LW", x: 16, y: 18 }, { role: "ST", x: 50, y: 10 }, { role: "RW", x: 84, y: 18 }
    ]
  };

  const STORAGE_KEY = "formationbuilder.customFormations.v1";

  /* ---------------- State ---------------- */

  const state = {
    formations: {},                 // name -> [{role,x,y}, ...11]
    currentFormationName: "4-3-3",
    assignmentsByFormation: {},      // name -> { slotIndex: playerId }
    mode: "select",                  // 'select' | 'create'
    draftSlots: null,                // working copy while in create mode
    activeSlotIndex: null,           // slot awaiting player assignment
    drag: null                       // { index, pointerId } while dragging in create mode
  };

  function loadCustomFormations() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveCustomFormations() {
    const custom = {};
    Object.keys(state.formations).forEach((name) => {
      if (!DEFAULT_FORMATIONS[name]) custom[name] = state.formations[name];
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  }

  state.formations = Object.assign({}, DEFAULT_FORMATIONS, loadCustomFormations());

  /* ---------------- DOM refs ---------------- */

  const els = {
    createBtn: document.getElementById("createFormationBtn"),
    saveBtn: document.getElementById("saveFormationBtn"),
    formationSelect: document.getElementById("formationSelect"),
    searchInput: document.getElementById("playerSearch"),
    searchResults: document.getElementById("searchResults"),
    searchHint: document.getElementById("searchHint"),
    searchLabel: document.getElementById("searchLabel"),
    roster: document.getElementById("roster"),
    pitch: document.getElementById("pitch"),
    pitchWrap: document.querySelector(".pitch-wrap"),
    pitchLines: document.querySelector(".pitch-lines"),
    modeBadge: document.getElementById("modeBadge"),
    modalOverlay: document.getElementById("modalOverlay"),
    modalInput: document.getElementById("modalInput"),
    modalConfirm: document.getElementById("modalConfirm"),
    modalCancel: document.getElementById("modalCancel"),
    toast: document.getElementById("toast"),
    fieldBgPicker: document.getElementById("fieldBgPicker"),
    fieldBgHex: document.getElementById("fieldBgHex"),
    fieldStripePicker: document.getElementById("fieldStripePicker"),
    fieldStripeHex: document.getElementById("fieldStripeHex"),
    fieldLinePicker: document.getElementById("fieldLinePicker"),
    fieldLineHex: document.getElementById("fieldLineHex"),
    colorsDisabledHint: document.getElementById("colorsDisabledHint"),
    pitchImageInput: document.getElementById("pitchImageInput"),
    pitchImageReset: document.getElementById("pitchImageReset"),
    pitchImageName: document.getElementById("pitchImageName"),
    jerseyImageInput: document.getElementById("jerseyImageInput"),
    jerseyImageReset: document.getElementById("jerseyImageReset"),
    jerseyImageName: document.getElementById("jerseyImageName")
  };

  /* ---------------- Jersey SVG ---------------- */

  function shadeColor(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    const amt = Math.round(2.55 * percent);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0x00ff) + amt;
    let b = (num & 0x0000ff) + amt;
    r = Math.max(Math.min(255, r), 0);
    g = Math.max(Math.min(255, g), 0);
    b = Math.max(Math.min(255, b), 0);
    return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
  }

  function relativeLuminance(hex) {
    const num = parseInt(hex.slice(1), 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  function numberTextStyle(color) {
    return relativeLuminance(color) > 0.6
      ? { fill: "#22252f", stroke: "rgba(255,255,255,0.55)" }
      : { fill: "#ffffff", stroke: "rgba(0,0,0,0.3)" };
  }

  /* ---------------- Jersey template (swap jersey.svg to change artwork) ----------------
     Drop a new SVG in as formation-app/jersey.svg and reload — no code changes needed.
     How the auto-recolor works: every solid hex fill in the file is collected, near-white
     fills (luminance > 0.92, e.g. the sleeve/trim highlight) are left exactly as authored,
     and the remaining fills are sorted lightest-to-darkest. The lightest becomes the shirt's
     main color, each darker one gets a progressively darker shade of that same color
     (collar, piping, shadow details, etc). This means any jersey art following the usual
     "white base + one or more accent tones" convention drops in with zero JS changes. */

  const JERSEY_SRC = "jersey.svg";
  const SHADE_STEPS = [-18, -32, -45, -58];
  let jerseyTemplate = null;

  function isHexColor(v) {
    return typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
  }

  // Parses raw SVG markup into a jersey template — shared by the default fetch()
  // load and the "Upload SVG" file picker. Throws on anything that isn't a usable SVG.
  function parseJerseyTemplate(svgText) {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl || doc.querySelector("parsererror")) throw new Error("Could not parse SVG");

    let viewBox = svgEl.getAttribute("viewBox");
    if (!viewBox) {
      const w = parseFloat(svgEl.getAttribute("width")) || 100;
      const h = parseFloat(svgEl.getAttribute("height")) || 100;
      viewBox = "0 0 " + w + " " + h;
    }
    const [, , vw, vh] = viewBox.split(/\s+/).map(Number);

    const fills = Array.from(svgEl.querySelectorAll("[fill]"))
      .map((el) => el.getAttribute("fill"))
      .filter(isHexColor)
      .map((v) => v.toUpperCase());
    const colorRoles = Array.from(new Set(fills))
      .filter((hex) => relativeLuminance(hex) <= 0.92)
      .sort((a, b) => relativeLuminance(b) - relativeLuminance(a));

    svgEl.removeAttribute("width");
    svgEl.removeAttribute("height");
    return { svgEl, viewBox, vw, vh, colorRoles };
  }

  async function loadJerseyTemplate() {
    try {
      const res = await fetch(JERSEY_SRC);
      if (!res.ok) throw new Error(JERSEY_SRC + " responded with " + res.status);
      const text = await res.text();
      jerseyTemplate = parseJerseyTemplate(text);
    } catch (err) {
      console.error("Failed to load jersey template (" + JERSEY_SRC + "):", err);
      jerseyTemplate = null;
      showToast("Couldn't load jersey.svg — showing a fallback shirt. Serve this app over http:// (not by double-clicking the file) and check the file exists.");
    }
  }

  // Minimal built-in shirt used only if jersey.svg fails to load, so slots are never blank.
  function fallbackJerseySVG(color, numberLabel) {
    const collar = shadeColor(color, -22);
    const text = numberTextStyle(color);
    return (
      '<svg class="jersey-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M22 8 L9 18 L15 29 L22 23 L22 55 Q22 59 26 59 L38 59 Q42 59 42 55 L42 23 L49 29 L55 18 L42 8 L36 12 Q32 15.5 28 12 Z" ' +
          'fill="' + color + '" stroke="rgba(0,0,0,0.28)" stroke-width="1.2"/>' +
        '<path d="M28 12 Q32 15.5 36 12 L34.5 9 L29.5 9 Z" fill="' + collar + '"/>' +
        (numberLabel !== null && numberLabel !== undefined
          ? '<text x="32" y="40" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-weight="700" ' +
            'font-size="' + (String(numberLabel).length > 2 ? 13 : 17) + '" fill="' + text.fill + '" ' +
            'stroke="' + text.stroke + '" stroke-width="0.6">' + numberLabel + "</text>"
          : "") +
      "</svg>"
    );
  }

  function jerseySVG(color, numberLabel) {
    if (!jerseyTemplate) return fallbackJerseySVG(color, numberLabel);

    const clone = jerseyTemplate.svgEl.cloneNode(true);
    clone.setAttribute("class", "jersey-svg");
    clone.querySelectorAll("[fill]").forEach((el) => {
      const raw = el.getAttribute("fill");
      if (!isHexColor(raw)) return;
      const roleIndex = jerseyTemplate.colorRoles.indexOf(raw.toUpperCase());
      if (roleIndex === -1) return; // near-white base tone — leave untouched
      const target = roleIndex === 0 ? color : shadeColor(color, SHADE_STEPS[Math.min(roleIndex - 1, SHADE_STEPS.length - 1)]);
      el.setAttribute("fill", target);
    });

    if (numberLabel !== null && numberLabel !== undefined) {
      const text = numberTextStyle(color);
      const vw = jerseyTemplate.vw, vh = jerseyTemplate.vh;
      const fontSize = vh * (String(numberLabel).length > 2 ? 0.2 : 0.27);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", String(vw * 0.5));
      t.setAttribute("y", String(vh * 0.39));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("dominant-baseline", "middle");
      t.setAttribute("font-family", "Arial, sans-serif");
      t.setAttribute("font-weight", "700");
      t.setAttribute("font-size", String(fontSize));
      t.setAttribute("fill", text.fill);
      t.setAttribute("stroke", text.stroke);
      t.setAttribute("stroke-width", String(vh * 0.0084));
      t.textContent = String(numberLabel);
      clone.appendChild(t);
    }

    return clone.outerHTML;
  }

  /* ---------------- Pitch color pickers ---------------- */

  const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

  function normalizeHex(v) {
    const hex = v.trim();
    if (hex.length === 4) {
      return "#" + hex.slice(1).split("").map((c) => c + c).join("");
    }
    return hex;
  }

  function initColorPicker(picker, hexInput, cssVar) {
    picker.addEventListener("input", () => {
      hexInput.value = picker.value.toUpperCase();
      hexInput.classList.remove("invalid");
      document.documentElement.style.setProperty(cssVar, picker.value);
    });

    hexInput.addEventListener("input", () => {
      const raw = hexInput.value.trim();
      if (HEX_RE.test(raw)) {
        const normalized = normalizeHex(raw);
        hexInput.classList.remove("invalid");
        picker.value = normalized;
        document.documentElement.style.setProperty(cssVar, normalized);
      } else {
        hexInput.classList.add("invalid");
      }
    });

    hexInput.addEventListener("blur", () => {
      if (!HEX_RE.test(hexInput.value.trim())) {
        hexInput.value = picker.value.toUpperCase();
        hexInput.classList.remove("invalid");
      }
    });
  }

  function initColorPickers() {
    initColorPicker(els.fieldBgPicker, els.fieldBgHex, "--field");
    initColorPicker(els.fieldStripePicker, els.fieldStripeHex, "--field-stripe");
    initColorPicker(els.fieldLinePicker, els.fieldLineHex, "--field-line");
  }

  /* ---------------- Pitch background image upload ---------------- */

  const PITCH_IMAGE_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];

  function setPitchBackgroundControlsEnabled(enabled) {
    [els.fieldBgPicker, els.fieldBgHex, els.fieldStripePicker, els.fieldStripeHex].forEach((el) => {
      el.disabled = !enabled;
    });
    els.colorsDisabledHint.classList.toggle("hidden", enabled);
  }

  function clearPitchImage() {
    els.pitchWrap.style.backgroundImage = "";
    els.pitchWrap.style.backgroundSize = "";
    els.pitchWrap.style.backgroundPosition = "";
    els.pitchWrap.style.backgroundRepeat = "";
    els.pitchImageInput.value = "";
    els.pitchImageName.textContent = "No custom image — using generated pitch.";
    els.pitchImageReset.disabled = true;
    els.pitchLines.style.display = "";
    setPitchBackgroundControlsEnabled(true);
  }

  function initPitchImageUpload() {
    els.pitchImageInput.addEventListener("change", () => {
      const file = els.pitchImageInput.files && els.pitchImageInput.files[0];
      if (!file) return;

      const isAllowedType =
        PITCH_IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|svg)$/i.test(file.name);
      if (!isAllowedType) {
        showToast("Please upload a PNG, JPEG, or SVG image.");
        els.pitchImageInput.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        els.pitchWrap.style.backgroundImage = 'url("' + reader.result + '")';
        els.pitchWrap.style.backgroundSize = "cover";
        els.pitchWrap.style.backgroundPosition = "center";
        els.pitchWrap.style.backgroundRepeat = "no-repeat";
        els.pitchImageName.textContent = file.name;
        els.pitchImageReset.disabled = false;
        els.pitchLines.style.display = "none";
        setPitchBackgroundControlsEnabled(false);
      };
      reader.onerror = () => showToast("Couldn't read that image file.");
      reader.readAsDataURL(file);
    });

    els.pitchImageReset.addEventListener("click", clearPitchImage);
  }

  /* ---------------- Placeholder jersey SVG upload ---------------- */

  function initJerseyImageUpload() {
    els.jerseyImageInput.addEventListener("change", () => {
      const file = els.jerseyImageInput.files && els.jerseyImageInput.files[0];
      if (!file) return;

      const isAllowedType = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
      if (!isAllowedType) {
        showToast("Please upload an SVG file.");
        els.jerseyImageInput.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          jerseyTemplate = parseJerseyTemplate(String(reader.result));
        } catch (err) {
          console.error("Failed to parse uploaded jersey SVG:", err);
          showToast("Couldn't use that SVG — check that it's valid.");
          els.jerseyImageInput.value = "";
          return;
        }
        els.jerseyImageName.textContent = file.name;
        els.jerseyImageReset.disabled = false;
        renderPitch();
      };
      reader.onerror = () => showToast("Couldn't read that SVG file.");
      reader.readAsText(file);
    });

    els.jerseyImageReset.addEventListener("click", async () => {
      els.jerseyImageInput.value = "";
      els.jerseyImageName.textContent = "Using default jersey.svg.";
      els.jerseyImageReset.disabled = true;
      await loadJerseyTemplate();
      renderPitch();
    });
  }

  /* ---------------- Helpers ---------------- */

  function currentAssignments() {
    const name = state.currentFormationName;
    if (!state.assignmentsByFormation[name]) state.assignmentsByFormation[name] = {};
    return state.assignmentsByFormation[name];
  }

  function playerById(id) {
    return PLAYERS.find((p) => p.id === id) || null;
  }

  function assignedPlayerIdsExcluding(slotIndex) {
    const assignments = currentAssignments();
    return Object.keys(assignments)
      .filter((k) => Number(k) !== slotIndex)
      .map((k) => assignments[k]);
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => els.toast.classList.add("hidden"), 2200);
  }

  /* ---------------- Formation select dropdown ---------------- */

  function renderFormationOptions() {
    els.formationSelect.innerHTML = "";
    Object.keys(state.formations).forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === state.currentFormationName) opt.selected = true;
      els.formationSelect.appendChild(opt);
    });
  }

  els.formationSelect.addEventListener("change", () => {
    loadFormation(els.formationSelect.value);
  });

  function loadFormation(name) {
    if (!state.formations[name]) return;
    state.currentFormationName = name;
    deactivateSlot();
    if (state.mode === "create") exitCreateMode(true);
    else renderPitch();
    renderFormationOptions();
  }

  /* ---------------- Pitch rendering (select mode) ---------------- */

  function renderPitch() {
    els.pitch.innerHTML = "";
    const slots = state.mode === "create" ? state.draftSlots : state.formations[state.currentFormationName];
    const assignments = state.mode === "create" ? {} : currentAssignments();

    slots.forEach((slot, i) => {
      const el = document.createElement("div");
      el.className = "slot" + (state.mode === "create" ? " create-mode" : "");
      el.style.left = slot.x + "%";
      el.style.top = slot.y + "%";
      el.dataset.index = String(i);

      const playerId = assignments[i];
      const player = playerId ? playerById(playerId) : null;

      const color = player ? player.color : PLACEHOLDER_COLOR;
      const numberLabel = player ? player.number : (state.mode === "create" ? String(i + 1) : slot.role);

      el.innerHTML = jerseySVG(color, numberLabel);

      if (state.mode === "select") {
        const label = document.createElement("div");
        label.className = "slot-label";
        if (player) {
          label.innerHTML =
            '<span class="slot-name">' + player.name + "</span>" +
            '<span class="slot-sub">' + slot.role + "</span>";
        } else {
          label.innerHTML = '<span class="slot-sub">' + slot.role + "</span>";
        }
        el.appendChild(label);

        if (state.activeSlotIndex === i) el.classList.add("active");
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          activateSlot(i);
        });
      } else {
        attachDragHandlers(el, i);
      }

      els.pitch.appendChild(el);
    });
  }

  els.pitchWrap.addEventListener("click", () => {
    if (state.mode === "select") deactivateSlot();
  });

  /* ---------------- Selection mode: search & assign ---------------- */

  function activateSlot(i) {
    state.activeSlotIndex = i;
    renderPitch();
    els.searchInput.disabled = false;
    els.searchInput.value = "";
    els.searchInput.focus();
    const slot = state.formations[state.currentFormationName][i];
    els.searchHint.textContent = "Assigning position: " + slot.role + " — search below.";
    els.searchHint.classList.add("armed");
    renderSearchResults("");
  }

  function deactivateSlot() {
    state.activeSlotIndex = null;
    els.searchInput.disabled = true;
    els.searchInput.value = "";
    els.searchResults.classList.add("hidden");
    els.searchResults.innerHTML = "";
    els.searchHint.textContent = "Select a position on the pitch to assign a player.";
    els.searchHint.classList.remove("armed");
    if (state.mode === "select") renderPitch();
  }

  function filterPlayers(query) {
    const q = query.trim().toLowerCase();
    const used = assignedPlayerIdsExcluding(state.activeSlotIndex);
    return PLAYERS.filter((p) => !used.includes(p.id)).filter((p) =>
      q === "" ? true : p.name.toLowerCase().includes(q)
    );
  }

  function renderSearchResults(query) {
    if (state.activeSlotIndex === null) {
      els.searchResults.classList.add("hidden");
      return;
    }
    const results = filterPlayers(query);
    els.searchResults.innerHTML = "";

    if (results.length === 0) {
      const empty = document.createElement("div");
      empty.className = "result-empty";
      empty.textContent = "No available players match.";
      els.searchResults.appendChild(empty);
    } else {
      results.forEach((p) => {
        const row = document.createElement("div");
        row.className = "result-row";
        row.innerHTML =
          '<span class="result-swatch" style="background:' + p.color + '"></span>' +
          '<span class="result-name">' + p.name + " · #" + p.number + "</span>";
        row.addEventListener("click", () => assignPlayer(p.id));
        els.searchResults.appendChild(row);
      });
    }
    els.searchResults.classList.remove("hidden");
  }

  function assignPlayer(playerId) {
    if (state.activeSlotIndex === null) return;
    const assignments = currentAssignments();
    assignments[state.activeSlotIndex] = playerId;
    const player = playerById(playerId);
    showToast(player.name + " assigned to " + state.formations[state.currentFormationName][state.activeSlotIndex].role);
    deactivateSlot();
    renderRoster();
  }

  els.searchInput.addEventListener("input", () => renderSearchResults(els.searchInput.value));

  /* ---------------- Roster panel ---------------- */

  function renderRoster() {
    const assignments = currentAssignments();
    const usedIds = new Set(Object.values(assignments));
    els.roster.innerHTML = "";
    PLAYERS.forEach((p) => {
      const chip = document.createElement("div");
      chip.className = "roster-chip" + (usedIds.has(p.id) ? " used" : "");
      chip.innerHTML =
        '<span class="roster-dot" style="background:' + p.color + '"></span>' +
        "<span>" + p.name + "</span>";
      els.roster.appendChild(chip);
    });
  }

  /* ---------------- Create Formation mode ---------------- */

  function enterCreateMode() {
    state.mode = "create";
    deactivateSlot();
    const base = state.formations[state.currentFormationName];
    state.draftSlots = base.map((s) => ({ x: s.x, y: s.y, role: s.role }));

    els.createBtn.textContent = "Cancel Create";
    els.createBtn.classList.add("active");
    els.saveBtn.disabled = false;
    els.searchInput.disabled = true;
    els.formationSelect.disabled = true;
    els.searchHint.textContent = "Drag placeholders to design the layout, then Save Formation.";
    els.searchHint.classList.remove("armed");
    els.modeBadge.textContent = "CREATING";
    els.modeBadge.classList.add("mode-create");

    renderPitch();
  }

  function exitCreateMode(discard) {
    state.mode = "select";
    state.draftSlots = null;
    els.createBtn.textContent = "Create Formation";
    els.createBtn.classList.remove("active");
    els.saveBtn.disabled = true;
    els.formationSelect.disabled = false;
    els.modeBadge.textContent = "SELECTING";
    els.modeBadge.classList.remove("mode-create");
    deactivateSlot();
    renderPitch();
  }

  els.createBtn.addEventListener("click", () => {
    if (state.mode === "create") {
      exitCreateMode(true);
    } else {
      enterCreateMode();
    }
  });

  els.saveBtn.addEventListener("click", () => {
    if (state.mode !== "create") return;
    openModal();
  });

  /* ---- Dragging placeholders on the pitch (create mode) ---- */

  function attachDragHandlers(el, index) {
    el.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      el.setPointerCapture(ev.pointerId);
      state.drag = { index, pointerId: ev.pointerId };
      el.classList.add("dragging");
    });

    el.addEventListener("pointermove", (ev) => {
      if (!state.drag || state.drag.index !== index) return;
      const rect = els.pitchWrap.getBoundingClientRect();
      let x = ((ev.clientX - rect.left) / rect.width) * 100;
      let y = ((ev.clientY - rect.top) / rect.height) * 100;
      x = Math.max(2, Math.min(98, x));
      y = Math.max(2, Math.min(98, y));
      state.draftSlots[index].x = x;
      state.draftSlots[index].y = y;
      el.style.left = x + "%";
      el.style.top = y + "%";
    });

    function endDrag(ev) {
      if (!state.drag || state.drag.index !== index) return;
      el.classList.remove("dragging");
      state.drag = null;
    }
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
  }

  /* ---------------- Save-formation modal ---------------- */

  function openModal() {
    els.modalOverlay.classList.remove("hidden");
    els.modalInput.value = "";
    setTimeout(() => els.modalInput.focus(), 0);
  }

  function closeModal() {
    els.modalOverlay.classList.add("hidden");
  }

  els.modalCancel.addEventListener("click", closeModal);
  els.modalOverlay.addEventListener("click", (ev) => {
    if (ev.target === els.modalOverlay) closeModal();
  });
  els.modalInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") confirmSaveFormation();
    if (ev.key === "Escape") closeModal();
  });
  els.modalConfirm.addEventListener("click", confirmSaveFormation);

  function confirmSaveFormation() {
    let name = els.modalInput.value.trim();
    if (!name) {
      els.modalInput.focus();
      return;
    }
    if (state.formations[name]) {
      let n = 2;
      while (state.formations[name + " (" + n + ")"]) n++;
      name = name + " (" + n + ")";
    }

    state.formations[name] = state.draftSlots.map((s) => ({
      x: s.x,
      y: s.y,
      role: s.role
    }));
    saveCustomFormations();

    closeModal();
    state.currentFormationName = name;
    exitCreateMode(false);
    renderFormationOptions();
    showToast('Formation "' + name + '" saved.');
  }

  /* ---------------- Init ---------------- */

  async function init() {
    await loadJerseyTemplate();
    renderFormationOptions();
    renderPitch();
    renderRoster();
    deactivateSlot();
    initColorPickers();
    initPitchImageUpload();
    initJerseyImageUpload();
  }

  init();
})();
