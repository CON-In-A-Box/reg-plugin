// shared/js/background-core.js
//
// ============================================================================
// Generic MV3 service-worker helpers: icon caching, icon setter, and the
// state-aggregation rule used by extensions whose toolbar icon reflects
// the worst of several per-row states.
// ============================================================================
//
// Assumes the following globals are already in scope (load order in the
// caller's importScripts):
//   - STATE                          (from shared/js/constants-base.js)
//   - STORAGE_KEY.MANAGEMENT_OVERRIDE (from shared/js/constants-base.js)
//
// Assumes the extension exposes colored icons at:
//   assets/{reggie|connie}-{token}-{19|38}.png  (per-mode toolbar face)
//   assets/{reggie|connie}-black-{16|19|38}.png  (idle / default icon)
// The image set is chosen by STORAGE_KEY.EXTENSION_MODE: REG → reggie, MERCH → connie.
// The "go" file token differs by face: reggie uses "blue" (colorblind-friendly),
// connie uses "green" (see ICON_FILE_TOKENS); STATE values stay green/yellow/red.
//
// Side-effects on load: kicks off generateIconCaches() and resolves
// iconCachesReadyPromise when every icon has been processed. Callers may
// await iconCachesReadyPromise before calling setIcon() if they need a
// guarantee, but setIcon() also no-ops safely while the cache is warming.
// ============================================================================

// ── ICON SIZE LIST ─────────────────────────────────────────────────────
// Chrome can use a 19px icon for normal displays and a 38px icon for
// high-DPI displays. We generate both for every (state, override) combo.
const ICON_SIZES = [19, 38];

// Sizes generated for the plain black "default" icon (idle / non-Neon tabs).
const DEFAULT_ICON_SIZES = [16, 19, 38];

// ── PER-MODE ICON FACE ───────────────────────────────────────────────────
// REG mode uses the "reggie" face; MERCH mode uses the "connie" face. Both sets
// must exist at assets/{prefix}-{token}-{size}.png and {prefix}-black-{size}.png.
const ICON_PREFIX_BY_MODE = {
  [EXTENSION_MODE.REG]:   "reggie",
  [EXTENSION_MODE.MERCH]: "connie",
};
const DEFAULT_ICON_PREFIX = "reggie";

// Filename color token per STATE, per face. STATE values stay semantic
// (green/yellow/red = go/caution/stop); the reggie "go" ICON is blue
// (colorblind-friendly per BRANDING.md), so STATE.GREEN loads the *blue* file
// for reggie. Connie keeps its green-named "go" file.
const ICON_FILE_TOKENS = {
  reggie: { [STATE.GREEN]: "blue",  [STATE.YELLOW]: "yellow", [STATE.RED]: "red" },
  connie: { [STATE.GREEN]: "green", [STATE.YELLOW]: "yellow", [STATE.RED]: "red" },
};
function iconFileToken(prefix, state) {
  return ICON_FILE_TOKENS[prefix]?.[state] ?? state;
}

// ── ICON CACHES ────────────────────────────────────────────────────────
//
// normalIconCache["prefix-state-size"]   → ImageData for the plain colored icon
// overrideIconCache["prefix-state-size"] → ImageData for the icon with "M" badge
// defaultIconCache["prefix-size"]        → ImageData for the idle black icon
//
// All caches use ImageData so that chrome.action.setIcon always receives
// { imageData } rather than { path }. Path-based setIcon silently fails
// from a MV3 service worker context in some Chrome versions; ImageData
// works reliably in both cases.
const normalIconCache   = {};
const overrideIconCache = {};
const defaultIconCache  = {};

// Set to `true` once generateIconCaches() has populated the caches.
// setIcon() checks this flag before trying to read from the caches —
// if it's still false the call is skipped (and logged).
let iconCachesReady = false;

// ── ICON CACHE GENERATION ──────────────────────────────────────────────

/**
 * Loads every colored icon PNG and stores it as ImageData in normalIconCache.
 * Also generates an "M" badge variant for each icon and stores it in
 * overrideIconCache. This runs once at service-worker startup.
 *
 * If individual icon files fail to load, the loop continues so that any
 * remaining icons still get cached and the extension can fall back to
 * showing them where possible.
 */
async function generateIconCaches() {
  const prefixes = [...new Set(Object.values(ICON_PREFIX_BY_MODE))];

  for (const prefix of prefixes) {
    // ── Colored state icons (+ "M" override-badge variant) ──
    for (const state of [STATE.GREEN, STATE.YELLOW, STATE.RED]) {
      for (const size of ICON_SIZES) {
        try {
          const token    = iconFileToken(prefix, state);
          const url      = chrome.runtime.getURL(`assets/${prefix}-${token}-${size}.png`);
          const response = await fetch(url);
          const blob     = await response.blob();
          const bitmap   = await createImageBitmap(blob);

          const canvas = new OffscreenCanvas(size, size);
          const ctx    = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(bitmap, 0, 0, size, size);

          // ── Plain icon (cache keyed by semantic STATE, not the file token) ──
          normalIconCache[`${prefix}-${state}-${size}`] = ctx.getImageData(0, 0, size, size);

          // ── Override icon: draw "M" badge on top ──
          const badgeRadius = Math.max(4, Math.round(size * 0.28));
          const badgeX      = size - badgeRadius - 1;
          const badgeY      = size - badgeRadius - 1;

          ctx.beginPath();
          ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
          ctx.fillStyle = BRAND.purple; // manager override = brand purple
          ctx.fill();

          const fontSize = Math.max(5, Math.round(badgeRadius * 1.2));
          ctx.font         = `bold ${fontSize}px sans-serif`;
          ctx.fillStyle    = "#ffffff";
          ctx.textAlign    = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("M", badgeX, badgeY + 1);

          overrideIconCache[`${prefix}-${state}-${size}`] = ctx.getImageData(0, 0, size, size);

          console.log(`background-core.js: icon cached: ${prefix}-${state}-${size}`);
        } catch (err) {
          console.error(`background-core.js: failed to cache icon ${prefix}-${state}-${size}:`, err);
        }
      }
    }

    // ── Plain black "default" icon (idle / non-Neon tabs) ──
    for (const size of DEFAULT_ICON_SIZES) {
      try {
        const url      = chrome.runtime.getURL(`assets/${prefix}-black-${size}.png`);
        const response = await fetch(url);
        const blob     = await response.blob();
        const bitmap   = await createImageBitmap(blob);

        const canvas = new OffscreenCanvas(size, size);
        const ctx    = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0, size, size);
        defaultIconCache[`${prefix}-${size}`] = ctx.getImageData(0, 0, size, size);
      } catch (err) {
        console.error(`background-core.js: failed to cache default icon ${prefix}-black-${size}:`, err);
      }
    }
  }
}

// ── ICON SETTER ────────────────────────────────────────────────────────

/**
 * Sets the extension icon for a given tab using pre-generated ImageData.
 * Always uses imageData (never path strings) to avoid a Chrome MV3 service
 * worker bug where path-based setIcon silently fails.
 *
 * @param {number} tabId
 * @param {string} state - STATE.GREEN | STATE.YELLOW | STATE.RED
 */
async function setIcon(tabId, state) {
  if (!iconCachesReady) {
    console.warn("background-core.js: icon caches not ready yet, skipping setIcon");
    return;
  }
  const result = await chrome.storage.local.get({
    [STORAGE_KEY.MANAGEMENT_OVERRIDE]: false,
    [STORAGE_KEY.EXTENSION_MODE]:      EXTENSION_MODE.REG,
  });
  const managementOverride = result[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;
  const mode               = result[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG;
  const prefix             = ICON_PREFIX_BY_MODE[mode] ?? DEFAULT_ICON_PREFIX;

  const cache     = managementOverride ? overrideIconCache : normalIconCache;
  const imageData = {};

  for (const size of ICON_SIZES) {
    // Prefer the mode's face; fall back to the default face if a file failed to load.
    const cached = cache[`${prefix}-${state}-${size}`] ?? cache[`${DEFAULT_ICON_PREFIX}-${state}-${size}`];
    if (cached) imageData[size] = cached;
  }

  if (Object.keys(imageData).length > 0) {
    await chrome.action.setIcon({ tabId, imageData });
    console.log(`background-core.js: icon set → tab ${tabId} prefix=${prefix} state=${state} override=${managementOverride}`);
    return;
  }

  console.error(`background-core.js: icon cache empty for ${prefix}-${state}, cannot set icon`);
}

/**
 * Sets the GLOBAL default toolbar icon (no tabId) to the current mode's black
 * icon set. Tabs that already have a per-tab colored icon keep it; idle and
 * non-Neon tabs pick this up. Call at startup and whenever EXTENSION_MODE changes.
 */
async function applyDefaultIconForMode() {
  if (!iconCachesReady) return;
  const result = await chrome.storage.local.get({ [STORAGE_KEY.EXTENSION_MODE]: EXTENSION_MODE.REG });
  const mode   = result[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG;
  const prefix = ICON_PREFIX_BY_MODE[mode] ?? DEFAULT_ICON_PREFIX;

  const imageData = {};
  for (const size of DEFAULT_ICON_SIZES) {
    const cached = defaultIconCache[`${prefix}-${size}`] ?? defaultIconCache[`${DEFAULT_ICON_PREFIX}-${size}`];
    if (cached) imageData[size] = cached;
  }
  if (Object.keys(imageData).length > 0) {
    await chrome.action.setIcon({ imageData });
    console.log(`background-core.js: default icon set for mode=${mode} (prefix=${prefix})`);
  }
}

// ── STARTUP ────────────────────────────────────────────────────────────
// Trigger the icon cache build at service-worker load. iconCachesReady
// flips to true only after every icon has been processed.
const iconCachesReadyPromise = generateIconCaches().then(async () => {
  iconCachesReady = true;
  console.log("background-core.js: all icon caches ready");
  await applyDefaultIconForMode();
});

// ── STATE AGGREGATION HELPER ───────────────────────────────────────────

/**
 * Given an array of rows (each with a `state` field), returns the "worst"
 * state for icon display:
 *   all red       → RED
 *   any yellow    → YELLOW
 *   otherwise     → GREEN
 */
function worstStateFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return STATE.GREEN;
  if (rows.every(r => r.state === STATE.RED))    return STATE.RED;
  if (rows.some(r => r.state === STATE.YELLOW))  return STATE.YELLOW;
  return STATE.GREEN;
}

// end shared/js/background-core.js
