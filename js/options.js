// js/options.js
//
// Extension options page script.
// Persists three settings to chrome.storage.local:
//   - STORAGE_KEY.EXTENSION_MODE      ("reg" | "merch") -- drives popup flow
//   - STORAGE_KEY.MANAGEMENT_OVERRIDE (boolean)         -- password-gated bypass
//   - STORAGE_KEY.DEBUG_MODE          (boolean)         -- only honored when
//                                                          MANAGEMENT_OVERRIDE
//                                                          is true. When on,
//                                                          clicking the icon
//                                                          on an account page
//                                                          triggers the
//                                                          debug-walk audit.
//
// Password verification uses SHA-256 hash comparison -- the real password
// is never stored in code or in chrome.storage.
//
// CONFIG, STORAGE_KEY, EXTENSION_MODE are globals injected via
// extension_options_page.html script tags before this file loads.
// hashPassword() comes from shared/js/crypto.js, also loaded before this file.

/**
 * Reads form values, validates the management password if override is
 * being enabled, saves settings to chrome.storage.local, and closes
 * the window on success.
 */
async function saveOptions() {
  const mngtOverride = document.getElementById("mngtoverride").checked;
  const mode         = document.querySelector('input[name="ext-mode"]:checked')?.value
                       ?? EXTENSION_MODE.REG;
  const behavior     = document.querySelector('input[name="behavior-mode"]:checked')?.value
                       ?? "regular";
  const popupChoice  = document.querySelector('input[name="popup-mode"]:checked')?.value
                       ?? "automated";
  const statusEl     = document.getElementById("status");

  if (mngtOverride) {
    const entered     = document.getElementById("mngt-password").value;
    const enteredHash = await hashPassword(entered);
    if (enteredHash !== CONFIG.managementPasswordHash) {
      statusEl.className   = "error";
      statusEl.textContent = "Incorrect password -- options not saved.";
      setTimeout(() => { statusEl.textContent = ""; statusEl.className = ""; }, 2000);
      return;
    }
  }

  // Debug mode only honored when Management Override is on. Force it off
  // (and clear any in-progress walk state) when override is being disabled.
  const debugMode = mngtOverride && behavior === "debugging";

  // Manual pop-up is a manager-only choice; everyone else is automated.
  const popupMode = (mngtOverride && popupChoice === "manual") ? "manual" : "automated";

  await chrome.storage.local.set({
    [STORAGE_KEY.MANAGEMENT_OVERRIDE]: mngtOverride,
    [STORAGE_KEY.EXTENSION_MODE]:      mode,
    [STORAGE_KEY.DEBUG_MODE]:          debugMode,
    [STORAGE_KEY.POPUP_MODE]:          popupMode,
  });
  if (!debugMode) {
    await chrome.storage.local.remove([STORAGE_KEY.DEBUG_WALK_ACTIVE]);
  }

  statusEl.className   = "";
  statusEl.textContent = "Options saved.";

  // Close the options window after a brief confirmation pause.
  // window.close() works when opened as a popup; if opened as a
  // full tab it will be blocked by the browser and the status
  // message will remain visible instead.
  setTimeout(() => window.close(), 1000);
}

/**
 * Restores saved settings into the options form on page load.
 */
function restoreOptions() {
  chrome.storage.local.get(
    {
      [STORAGE_KEY.MANAGEMENT_OVERRIDE]: false,
      [STORAGE_KEY.EXTENSION_MODE]:      EXTENSION_MODE.REG,
      [STORAGE_KEY.DEBUG_MODE]:          false,
      [STORAGE_KEY.POPUP_MODE]:          "automated",
    },
    (items) => {
      document.getElementById("mngtoverride").checked = items[STORAGE_KEY.MANAGEMENT_OVERRIDE];

      const mode  = items[STORAGE_KEY.EXTENSION_MODE];
      const radio = document.querySelector(`input[name="ext-mode"][value="${mode}"]`)
                 ?? document.getElementById("mode-reg");
      radio.checked = true;

      const behaviorValue = items[STORAGE_KEY.DEBUG_MODE] ? "debugging" : "regular";
      const behaviorRadio = document.querySelector(`input[name="behavior-mode"][value="${behaviorValue}"]`)
                         ?? document.getElementById("behavior-regular");
      behaviorRadio.checked = true;

      const popupValue = items[STORAGE_KEY.POPUP_MODE] === "manual" ? "manual" : "automated";
      const popupRadio = document.querySelector(`input[name="popup-mode"][value="${popupValue}"]`)
                      ?? document.getElementById("popup-automated");
      popupRadio.checked = true;

      togglePasswordField();
    }
  );
}

/**
 * Shows or hides the password + Behavior + Maintenance rows based on the
 * override checkbox state. These are meaningless without Management Override,
 * so they're hidden entirely when override is off.
 */
function togglePasswordField() {
  const on = document.getElementById("mngtoverride").checked;
  document.getElementById("password-row").style.display    = on ? "block" : "none";
  document.getElementById("behavior-row").style.display    = on ? "block" : "none";
  document.getElementById("popup-mode-row").style.display  = on ? "block" : "none";
  document.getElementById("maintenance-row").style.display = on ? "block" : "none";
  if (on) renderStorageDump();
}

// ── CONFIG DOCTOR (T1) ──────────────────────────────────────────────────────

/** Runs validateConfig() and renders the result into #config-check. */
function renderConfigCheck() {
  const el = document.getElementById("config-check");
  chrome.storage.local.get({ [STORAGE_KEY.DEBUG_MODE]: false }, (items) => {
    const problems = validateConfig(CONFIG, {
      manifestVersion: chrome.runtime.getManifest().version,
      debugMode:       items[STORAGE_KEY.DEBUG_MODE],
    });
    if (problems.length === 0) {
      el.innerHTML = `<h3>Config check</h3><div class="allgood">No problems found in config.js.</div>`;
      return;
    }
    const items_ = problems
      .map(p => `<div class="issue ${p.severity}">${p.severity === "error" ? "✖" : "⚠"} ${escapeHtml(p.message)}</div>`)
      .join("");
    el.innerHTML = `<h3>Config check (${problems.length})</h3>${items_}`;
  });
}

// ── MAINTENANCE (T3): storage inspector, cache reset, connectivity ──────────

// Cached scrape/transient keys that are safe to clear. Settings keys
// (EXTENSION_MODE, MANAGEMENT_OVERRIDE, DEBUG_MODE) are intentionally excluded.
const CACHE_KEYS = [
  STORAGE_KEY.ATTENDEE, STORAGE_KEY.ATTENDEE_MERCH, STORAGE_KEY.REGISTRATIONS,
  STORAGE_KEY.ACCOUNT, STORAGE_KEY.PENDING_ICON_UPDATE, STORAGE_KEY.NOTE_ACKNOWLEDGED,
  STORAGE_KEY.AGE_VERIFIED, STORAGE_KEY.REGISTRATION_ERROR, STORAGE_KEY.ACCOUNT_AUTO_NAV,
  STORAGE_KEY.DEBUG_REPORT, STORAGE_KEY.DEBUG_WALK_ACTIVE,
];

function renderStorageDump() {
  chrome.storage.local.get(null, (all) => {
    const pre = document.getElementById("storage-dump");
    const keys = Object.keys(all).sort();
    pre.textContent = keys.length
      ? keys.map(k => `${k}: ${JSON.stringify(all[k])}`).join("\n")
      : "(storage is empty)";
  });
}

function clearCache() {
  chrome.storage.local.remove(CACHE_KEYS, () => {
    const s = document.getElementById("maint-status");
    s.textContent = "Cleared cached scrape data. Reload the Neon tab to re-scrape.";
    s.className = "maint-status allgood";
    renderStorageDump();
  });
}

/** Pings one tab; resolves to the response, or null if no content script answers. */
function pingTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: ACTION.PING }, (resp) => {
      resolve(chrome.runtime.lastError ? null : resp);
    });
  });
}

// The Options page opens as its own dialog (open_in_tab:false), so the "active
// tab" is NOT the Neon page. Find Neon tabs by URL and ping each instead.
function checkActiveTab() {
  const s = document.getElementById("maint-status");
  const pattern = `https://${CONFIG.neon.productionDomain}/*`;
  chrome.tabs.query({ url: pattern }, async (tabs) => {
    if (chrome.runtime.lastError) {
      s.textContent = "Could not query tabs: " + chrome.runtime.lastError.message;
      s.className = "maint-status issue error";
      return;
    }
    if (!tabs || tabs.length === 0) {
      s.textContent = `No ${CONFIG.neon.productionDomain} tab is open. Open a Neon account / registration / attendee page, then click again.`;
      s.className = "maint-status issue warning";
      return;
    }
    const results = await Promise.all(tabs.map(async t => ({ t, resp: await pingTab(t.id) })));
    const ok = results.filter(r => r.resp?.ok);
    if (ok.length > 0) {
      s.textContent = `Content script OK on ${ok.length} of ${tabs.length} Neon tab(s): ${ok.map(r => r.resp.script).join(", ")}.`;
      s.className = "maint-status allgood";
    } else {
      s.textContent = `Found ${tabs.length} Neon tab(s) but no content script responded. Make sure one is a supported page (account / registration / attendee) and reload it.`;
      s.className = "maint-status issue error";
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

document.addEventListener("DOMContentLoaded", () => {
  restoreOptions();
  renderConfigCheck();
});
document.getElementById("save").addEventListener("click", saveOptions);
document.getElementById("mngtoverride").addEventListener("change", togglePasswordField);
document.getElementById("clear-cache").addEventListener("click", clearCache);
document.getElementById("check-tab").addEventListener("click", checkActiveTab);

// end js/options.js
