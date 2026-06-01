// js/config-doctor.js
//
// Config Doctor — pure, DOM-free validation of config.js. Catches the silent
// annual-update mistakes that don't surface until a real check-in fails.
//
// validateConfig(CONFIG, extras?) -> [ { severity:"error"|"warning", message } ]
//
// Loaded (after config.js + js/constants.js, so CONFIG and CONDITION are in
// scope) by the options page and the debug report page. No chrome APIs, no DOM
// — callers pass runtime context (manifest version, debug flag) via `extras`.

function validateConfig(cfg, extras = {}) {
  const out  = [];
  const err  = (m) => out.push({ severity: "error",   message: m });
  const warn = (m) => out.push({ severity: "warning", message: m });

  if (!cfg || typeof cfg !== "object") { err("CONFIG is missing or not an object."); return out; }

  // holdMessages — code hard-indexes [0],[1],[2] in several files.
  if (!Array.isArray(cfg.holdMessages) || cfg.holdMessages.length !== 3) {
    err(`holdMessages must have exactly 3 entries (found ${cfg.holdMessages?.length ?? 0}); code indexes [0],[1],[2].`);
  } else {
    cfg.holdMessages.forEach((h, i) => { if (!h?.title) err(`holdMessages[${i}].title is empty.`); });
  }

  // conditionOrder ↔ CONDITION constants.
  if (typeof CONDITION !== "undefined") {
    const conditionValues = new Set(Object.values(CONDITION));
    const orderKeys       = new Set((cfg.conditionOrder ?? []).map(c => c.key));
    (cfg.conditionOrder ?? []).forEach(c => {
      if (!conditionValues.has(c.key)) err(`conditionOrder key "${c.key}" is not a CONDITION value.`);
    });
    conditionValues.forEach(v => {
      if (!orderKeys.has(v)) warn(`CONDITION "${v}" is never listed in conditionOrder (it will never render in the popup).`);
    });
  }

  // fieldLabels — every value must be a non-empty substring to match against.
  for (const [role, label] of Object.entries(cfg.fieldLabels ?? {})) {
    if (!label || typeof label !== "string") err(`fieldLabels.${role} is empty.`);
  }

  // requiredFields
  (cfg.requiredFields ?? []).forEach((rf, i) => {
    if (!rf?.labelText) err(`requiredFields[${i}].labelText is empty.`);
  });

  // merch items
  (cfg.merch?.items ?? []).forEach((item, i) => {
    const where = `merch.items[${i}] ("${item?.name ?? "?"}")`;
    const src   = item?.source ?? {};
    if (!src.label)            err(`${where} source.label is empty.`);
    if (!item?.pickupFieldLabel) err(`${where} pickupFieldLabel is empty.`);
    if (src.matchMode === "anyExcept") {
      if (src.notOrderedValue == null || src.notOrderedValue === "") err(`${where} matchMode "anyExcept" requires a non-empty notOrderedValue.`);
    } else if (src.matchMode === "substring") {
      if (!src.matchValue) err(`${where} matchMode "substring" requires a non-empty matchValue.`);
    } else {
      err(`${where} has unknown matchMode "${src.matchMode}" (expected "anyExcept" or "substring").`);
    }
  });

  // Event names
  const cur  = Array.isArray(cfg.event?.currentEventNames) ? cfg.event.currentEventNames : [];
  const test = Array.isArray(cfg.event?.testEventNames)    ? cfg.event.testEventNames    : [];
  if (cur.length === 0) err("event.currentEventNames is empty — every registration will read as WRONG_EVENT.");
  cur.filter(n => test.includes(n)).forEach(n => warn(`"${n}" appears in BOTH currentEventNames and testEventNames (a real event left in the test list?).`));

  // Management password hash
  if (!/^[0-9a-f]{64}$/.test(cfg.managementPasswordHash ?? "")) {
    err("managementPasswordHash is not a 64-character SHA-256 hex string.");
  }

  // Ticket-type catch-all (empty nameIncludes handles Dealer / no-admission rows).
  const catchAlls = (cfg.ticketTypes ?? []).filter(t => t.nameIncludes === "");
  if (catchAlls.length === 0) warn("ticketTypes has no empty-nameIncludes catch-all — Dealer / no-admission rows will read as UNKNOWN_TICKET.");
  if (catchAlls.length > 1)  warn(`ticketTypes has ${catchAlls.length} empty-nameIncludes catch-alls; only the first is reachable.`);

  // Neon domain
  if (!cfg.neon?.productionDomain) warn("neon.productionDomain is empty.");

  // ── Runtime drift (from extras) ──
  if (extras.debugMode) {
    warn("Debugging mode is currently ON — switch Behavior back to Regular before production check-in.");
  }
  if (extras.manifestVersion && cur.length) {
    const verYear = String(extras.manifestVersion).match(/(20\d{2})/)?.[1];
    const evtYear = cur.join(" ").match(/(20\d{2})/)?.[1];
    if (verYear && evtYear && verYear !== evtYear) {
      warn(`manifest version year (${verYear}) doesn't match the currentEventNames year (${evtYear}) — did you update one but not the other?`);
    }
  }

  return out;
}
