// shared/js/constants-base.js
//
// ============================================================================
// FRAMEWORK-LEVEL CONSTANTS shared by all Neon-CRM helper extensions.
// ============================================================================
//
// Loaded as a plain script BEFORE each extension's own js/constants.js.
// The extension's constants.js may add app-specific entries (CONDITION,
// EVENT_MATCH, additional ACTION / STORAGE_KEY values), but should never
// redefine anything here.
//
// Do not add import/export statements — this file is injected as a global.
// ============================================================================

// ── PAGE / ICON STATES ───────────────────────────────────────────────────
// Map directly to the colored icons (green/yellow/red) and to the CSS
// classes used in popup.css. Do not rename without updating both.

const STATE = {
  GREEN:  "green",
  YELLOW: "yellow",
  RED:    "red",
};

// ── EXTENSION MODE ──────────────────────────────────────────────────────
// Drives which popup flow the extension shows. Set on the options page
// and persisted in chrome.storage.local[STORAGE_KEY.EXTENSION_MODE].
// When no stored value exists, the popup defaults to EXTENSION_MODE.REG
// so existing installs keep the registration flow they had before.

const EXTENSION_MODE = {
  REG:   "reg",
  MERCH: "merch",
};

// ── chrome.storage.local KEYS USED BY THE SHARED ICON MACHINERY ──────────
// Keys here MUST be unique across all extensions that consume this file.
// Extension-specific keys (ATTENDEE, REGISTRATIONS, etc.) live in the
// extension's own js/constants.js and extend STORAGE_KEY at runtime.

const STORAGE_KEY = {
  MANAGEMENT_OVERRIDE: "managementOverride",
  PENDING_ICON_UPDATE: "pendingIconUpdate",
  REGISTRATION_ERROR:  "REGISTRATION_ERROR",
  EXTENSION_MODE:      "extensionMode",
  // ── Manager debug walk (pre-con field-label resolution audit) ──
  // DEBUG_MODE        -- options-page toggle, only honored when MANAGEMENT_OVERRIDE is true
  // DEBUG_WALK_ACTIVE -- {startedAt, accountId} | null; present while the walk is in flight
  // DEBUG_REPORT      -- {steps: [{step, status, details, issues:[]}], finishedAt} | null
  DEBUG_MODE:          "debugMode",
  DEBUG_WALK_ACTIVE:   "debugWalkActive",
  DEBUG_REPORT:        "debugReport",
  // ERROR_LOG -- bounded ring buffer (last ~20) of recorded errors, for the
  // debug report's "Recent errors" section. REGISTRATION_ERROR above is the
  // single latest error the popup surfaces; this is the rolling history.
  ERROR_LOG:           "errorLog",
};

// ── BRAND COLORS ─────────────────────────────────────────────────────────
// JS mirror of the brand palette (see BRANDING.md + css/brand.css) for the few
// places colors are set outside CSS: the toolbar icon "M" override badge and a
// handful of inline styles. Keep in sync with css/brand.css.
//   purple = section headers/override · green = links · blue = "go/OK" status
//   (colorblind-friendly) · red = stop/error · yellow = caution
const BRAND = {
  purple: "#620272",
  green:  "#328332",
  blue:   "#0072B2",
  red:    "#CC0202",
  yellow: "#FFB400",
};

// ── ERROR MESSAGE TEMPLATES ──────────────────────────────────────────────
// Generic templates surfaced by the popup. Extensions may add app-specific
// templates to this object from their own constants.js.

const ERROR_MESSAGES = {
  NO_VALID_EVENT: {
    title:  "No event found",
    detail: "We couldn't locate your current event. Please make sure you're viewing the correct account page.",
    action: "Try refreshing the page and clicking the extension icon again",
  },
  NO_SUCCEEDED_REGISTRATION: {
    title:  "No active registrations found",
    detail: "This attendee doesn't have any confirmed registrations for the current event.",
    action: "Verify the attendee is registered for this event in Neon",
  },
  // Shown as an in-page modal on the account Attendees tab when the account
  // has NO usable registration to check in: either no attendee records at all,
  // only cancelled/failed/refunded ones, or none matching the current/test
  // event list. See accountPage.js showNoRegistrationModal().
  NO_VALID_REGISTRATION: {
    title:  "No valid event registration found",
    detail: "This account has no active registration for the current event. Any records present are cancelled, failed, refunded, or for a different event.",
    action: "Send the attendee to the Help Desk to sort out their registration.",
  },
  NAVIGATION_FAILED: {
    title:  "Navigation error",
    detail: "We couldn't navigate to the registration page automatically.",
    action: "Navigate to the event registrations page manually and try again",
  },
  SCRIPT_INJECTION_FAILED: {
    title:  "Unable to read account data",
    detail: "The extension encountered a technical issue reading the page.",
    action: "Refresh the page and try clicking the extension icon again",
  },
  TIMEOUT: {
    title:  "Request took too long",
    detail: "The page didn't load quickly enough. This can happen if you're on a slow connection.",
    action: "Wait a moment and try again",
  },
  UNKNOWN_ERROR: {
    title:  "Something went wrong",
    detail: "An unexpected error occurred while processing your request.",
    action: "Try refreshing the page and try again. If the problem persists, contact IT",
  },
};

// ── DEBUG HELPER ─────────────────────────────────────────────────────────
// Cheap wrapper around console.log gated on CONFIG.debug (defined in each
// extension's config.js, which is loaded after this file).

function dbg(...args) {
  if (typeof CONFIG !== "undefined" && CONFIG.debug) console.log(...args);
}

// end shared/js/constants-base.js
