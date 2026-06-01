// js/debug-report.js
// Renders STORAGE_KEY.DEBUG_REPORT into debug-report.html. Loaded as an
// external script because the MV3 extension-page CSP forbids inline JS.
//
// Report shape (written by the walk's content scripts):
//   { startedAt, steps: [ { step, status, details, issues, recordedAt } ] }
//   step    — "account" | "eventreg" | "attendee"
//   status  — "ok" | "warning" | "error" | "skipped"
//   details — may include { fields:[{label,value}], used:[{role,label,found}],
//             missing, requiredMissing, requiredEmpty, merch:[...], ... }
//   issues  — [ { severity:"error"|"warning", message } ]

const PAGES = [
  { key: "account",  title: "Account page" },
  { key: "eventreg", title: "Event Registration page" },
  { key: "attendee", title: "Attendee page" },
];

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function valCell(v) {
  return v === "" || v == null ? '<span class="empty">(empty)</span>' : esc(v);
}
function pill(kind, text) { return `<span class="pill ${kind}">${esc(text)}</span>`; }

function statusPill(status) {
  if (status === "ok")      return pill("ok", "OK");
  if (status === "warning") return pill("warn", "WARNING");
  if (status === "error")   return pill("bad", "ERROR");
  return pill("warn", String(status || "").toUpperCase() || "—");
}

function countIssues(report) {
  let errors = 0, warnings = 0;
  for (const s of report.steps) {
    for (const i of s.issues ?? []) {
      if (i.severity === "error") errors++;
      else if (i.severity === "warning") warnings++;
    }
  }
  return { errors, warnings };
}

function fieldsTable(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return '<p class="muted">No fields captured.</p>';
  }
  const rows = fields.map(f => `<tr><td class="mono">${esc(f.label)}</td><td>${valCell(f.value)}</td></tr>`).join("");
  return `<h3>Fields on page (${fields.length})</h3><table><thead><tr><th>Label</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function usedTable(used) {
  if (!Array.isArray(used) || used.length === 0) return "";
  const rows = used.map(u => {
    const cls = u.found ? "" : "bad";
    const status = u.found ? pill("ok", "found") : pill("bad", "NOT FOUND");
    return `<tr class="${cls}"><td class="mono">${esc(u.role)}</td><td class="mono">${esc(u.label)}</td><td>${status}</td></tr>`;
  }).join("");
  return `<h3>Fields the extension relies on</h3><table><thead><tr><th>Role</th><th>Expected label</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function requiredBlock(details) {
  const miss = details.requiredMissing ?? [];
  const empty = details.requiredEmpty ?? [];
  if (miss.length === 0 && empty.length === 0) return "";
  let html = "<h3>Required check-in fields</h3><ul class='issues'>";
  miss.forEach(l => { html += `<li class="error">${esc(l)} — NOT FOUND</li>`; });
  empty.forEach(l => { html += `<li class="warning">${esc(l)} — present but empty</li>`; });
  return html + "</ul>";
}

function merchTable(merch) {
  if (!Array.isArray(merch) || merch.length === 0) return "";
  const rows = merch.map(m => {
    const srcStatus = m.sourceFound ? valCell(m.sourceVal) : pill("bad", "field not found");
    const pickStatus = !m.pickupFound ? pill("bad", "field not found")
                     : m.pickedUp ? pill("warn", "picked up: " + (m.pickedUpAt || "")) : '<span class="muted">not picked up</span>';
    const cls = (!m.sourceFound || !m.pickupFound) ? "bad" : "";
    return `<tr class="${cls}"><td>${esc(m.name)}</td><td class="mono">${esc(m.sourceLabel)}</td><td>${srcStatus}</td>` +
           `<td>${m.ordered ? pill("ok", "ordered") : '<span class="muted">no</span>'}</td>` +
           `<td>${m.variant ? esc(m.variant) : '<span class="muted">—</span>'}</td>` +
           `<td class="mono">${esc(m.pickupLabel)}</td><td>${pickStatus}</td></tr>`;
  }).join("");
  return `<h3>Merch items</h3><table><thead><tr><th>Item</th><th>Source label</th><th>Source value</th>` +
         `<th>Ordered?</th><th>Variant</th><th>Pickup label</th><th>Pickup state</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function summaryKv(details) {
  const bits = [];
  if (details.accountId)        bits.push(`account ${esc(details.accountId)}`);
  if (details.attendeeId)       bits.push(`attendee ${esc(details.attendeeId)}`);
  if (details.eventName)        bits.push(`event "${esc(details.eventName)}"`);
  if (details.validationType)   bits.push(`match: ${esc(details.validationType)}`);
  if (details.matchedEventName) bits.push(`matched "${esc(details.matchedEventName)}"`);
  if (typeof details.attendeeCount === "number") bits.push(`${details.attendeeCount} attendees`);
  if (typeof details.rowCount === "number")      bits.push(`${details.rowCount} rows`);
  return bits.length ? `<div class="kv">${bits.join(" · ")}</div>` : "";
}

function issuesList(issues) {
  if (!Array.isArray(issues) || issues.length === 0) return "";
  const items = issues.map(i => `<li class="${esc(i.severity)}">${esc(i.message)}</li>`).join("");
  return `<ul class="issues">${items}</ul>`;
}

function rosterTable(roster) {
  if (!Array.isArray(roster) || roster.length === 0) return "";
  const rows = roster.map(a => {
    const bad = !a.ticketResolved || !a.icePresent;
    const ticket = a.ticketResolved ? esc(a.ticket) : pill("bad", "UNKNOWN: " + (a.ticketName || "(none)"));
    const ice    = a.icePresent ? pill("ok", "yes") : pill("bad", "missing");
    const holds  = a.anyHold ? pill("warn", "hold") : '<span class="muted">none</span>';
    return `<tr class="${bad ? "bad" : ""}"><td>${esc(a.name)}</td><td>${ticket}</td><td>${ice}</td>` +
           `<td>${holds}</td><td>${esc(String(a.badges))}</td><td class="mono">${esc(a.layout)}</td></tr>`;
  }).join("");
  return `<h3>Attendee roster (${roster.length})</h3><table><thead><tr><th>Name</th><th>Ticket</th>` +
         `<th>ICE</th><th>Holds</th><th>Badges</th><th>Layout</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function plannedWritesTable(d) {
  if (d.plannedWritesError) {
    return `<h3>What check-in would write</h3><p class="issue warning">Cannot preview: ${esc(d.plannedWritesError)}</p>`;
  }
  if (!Array.isArray(d.plannedWrites) || d.plannedWrites.length === 0) return "";
  const rows = d.plannedWrites.map(w =>
    `<tr><td class="mono">[${esc(String(w.fieldIndex))}] ${esc(w.label)}</td><td>${valCell(w.currentValue)}</td>` +
    `<td>&rarr; ${esc(w.plannedValue)}</td></tr>`).join("");
  return `<h3>What check-in would write</h3><table><thead><tr><th>Field</th><th>Current</th><th>Planned</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderStepCard(step) {
  const d = step.details ?? {};
  const when = step.recordedAt ? new Date(step.recordedAt).toLocaleTimeString() : "";
  const label = d.phase === "fields" ? "Field audit" : "Navigation";
  let html = `<div class="card">`;
  html += `<div>${statusPill(step.status)} <strong>${esc(label)}</strong> <span class="muted">${esc(when)}</span></div>`;
  html += summaryKv(d);
  html += issuesList(step.issues);
  if (d.roster) html += rosterTable(d.roster);
  if (d.fields) html += fieldsTable(d.fields);
  if (d.used)   html += usedTable(d.used);
  html += requiredBlock(d);
  if (d.merch)  html += merchTable(d.merch);
  if (d.plannedWrites !== undefined) html += plannedWritesTable(d);
  html += `</div>`;
  return html;
}

/** Config Doctor section — runs validateConfig() against the live config. */
function configSection() {
  if (typeof validateConfig !== "function") return "";
  let problems = [];
  try {
    problems = validateConfig(CONFIG, { manifestVersion: chrome.runtime.getManifest().version });
  } catch (e) {
    return `<h2>Config check</h2><div class="banner bad">Config check failed: ${esc(e.message)}</div>`;
  }
  if (problems.length === 0) {
    return `<h2>Config check</h2><div class="card"><div class="pill ok">OK</div> No problems found in config.js.</div>`;
  }
  const items = problems.map(p => `<li class="${esc(p.severity)}">${esc(p.message)}</li>`).join("");
  return `<h2>Config check (${problems.length})</h2><div class="card"><ul class="issues">${items}</ul></div>`;
}

/** Recent errors section — reads the ERROR_LOG ring buffer. */
function errorLogSection(log) {
  if (!Array.isArray(log) || log.length === 0) return "";
  const rows = log.slice().reverse().map(e =>
    `<tr><td class="mono">${esc(e.at ? new Date(e.at).toLocaleString() : "")}</td><td class="mono">${esc(e.type)}</td>` +
    `<td>${esc(e.title || "")}</td><td>${esc(e.message || "")}</td></tr>`).join("");
  return `<h2>Recent errors (${log.length})</h2><div class="card"><table><thead><tr><th>When</th><th>Type</th>` +
         `<th>Title</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function render(report, errorLog) {
  const app = document.getElementById("app");
  const sub = document.getElementById("subtitle");

  // Config check + error log are config/runtime-derived, so they render
  // regardless of whether a walk report exists.
  const configHtml = configSection();
  const errorsHtml = errorLogSection(errorLog);

  if (!report || !Array.isArray(report.steps) || report.steps.length === 0) {
    app.innerHTML = configHtml +
      `<div class="banner warn">No debug walk report found. Run the walk from an account page with Manager Override + Debugging enabled.</div>` +
      errorsHtml;
    return;
  }

  if (report.startedAt) {
    sub.textContent = `Manager debug walk started ${new Date(report.startedAt).toLocaleString()}.`;
  }

  const { errors, warnings } = countIssues(report);
  const complete = report.steps.some(s => s.step === "attendee");

  // Summary banner
  let bannerClass = errors > 0 ? "bad" : warnings > 0 ? "warn" : "ok";
  let bannerText  = errors === 0 && warnings === 0
    ? "All fields the extension relies on were found on every page visited."
    : `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"} across the walk.`;
  let html = `<div class="banner ${bannerClass}">${esc(bannerText)}</div>`;

  // Incomplete note
  if (!complete) {
    const last = report.steps[report.steps.length - 1];
    const why = (last?.issues ?? []).filter(i => i.severity === "error").map(i => i.message);
    const where = PAGES.find(p => p.key === last?.step)?.title ?? last?.step ?? "an early step";
    html += `<div class="banner warn">Incomplete — the walk halted at the <strong>${esc(where)}</strong> and never reached the attendee page.` +
            (why.length ? ` Reason: ${esc(why.join("; "))}` : "") + `</div>`;
  }

  html += configHtml;

  // One section per page
  for (const page of PAGES) {
    const steps = report.steps.filter(s => s.step === page.key);
    html += `<h2>${esc(page.title)}</h2>`;
    if (steps.length === 0) {
      html += `<div class="card notreached">Not reached — the walk halted before this page.</div>`;
    } else {
      html += steps.map(renderStepCard).join("");
    }
  }

  html += errorsHtml;
  app.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get([STORAGE_KEY.DEBUG_REPORT, STORAGE_KEY.ERROR_LOG]).then(result => {
    render(result[STORAGE_KEY.DEBUG_REPORT], result[STORAGE_KEY.ERROR_LOG]);
  }).catch(err => {
    document.getElementById("app").innerHTML =
      `<div class="banner bad">Could not read the debug report: ${esc(err.message)}</div>`;
  });
});
