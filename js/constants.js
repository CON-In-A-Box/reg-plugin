// js/constants.js
//
// ============================================================================
// App-specific constants for the CONvergence Check-In extension.
// ============================================================================
//
// Framework-level constants (STATE, ERROR_MESSAGES, the icon-machinery
// STORAGE_KEY entries, dbg()) live in shared/js/constants-base.js, which
// is loaded BEFORE this file in every entry point (manifest content_scripts,
// popup.html script tags, extension_options_page.html script tags, and
// background.js importScripts).
//
// This file:
//   - Mutates STORAGE_KEY to add app-specific keys (does NOT redeclare it)
//   - Declares REG_STATUS, ACTION, CONDITION, EVENT_MATCH (all app-specific)
//
// If you need to add a new error template that's specific to this
// extension, mutate ERROR_MESSAGES here:
//     ERROR_MESSAGES.MY_NEW_ERROR = { title: "...", detail: "...", action: "..." };
// Otherwise, generic templates belong in shared/js/constants-base.js so
// any future Neon helper extension can reuse them.
//
// Do not add import/export statements -- this file is injected as a global.
// ============================================================================

// ── REGISTRATION STATUS VALUES ───────────────────────────────────────────
// Neon reports registration status as uppercase strings. We only care
// about SUCCEEDED right now, but additional values can be added here
// if we ever need to handle PENDING, REFUNDED, CANCELED, etc.

const REG_STATUS = {
  SUCCEEDED: "SUCCEEDED",
};

// Status substrings (case-insensitive) that EXCLUDE a registration record
// from "has this person attended before?" history counting. A record whose
// status contains any of these is treated as if it never happened. Used by
// accountPage.js analyzeAttendeeRecords() for the first-time-attendee guide.
// Substrings (not exact) so "CANCELED"/"CANCELLED" both match "cancel".
REG_STATUS.EXCLUDED_FROM_HISTORY = ["cancel", "fail", "refund"];

// ── MESSAGE ACTION NAMES ─────────────────────────────────────────────────
// Used as the `action` field in chrome.runtime.sendMessage / tabs.sendMessage
// calls between popup, background, and content scripts. Every cross-script
// message MUST use one of these constants -- never raw strings.

const ACTION = {
  GET_ATTENDEE_DATA:          "Get Attendee Data",
  GET_REGISTRATIONS:          "Get Registrations Data",
  GET_ACCOUNT_DATA:           "Get Account Data",       // popup → accountPage.js
  INCREMENT_BADGE_COUNT:      "Increment Badge Count",
  HIGHLIGHT_ICE_FIELD:        "Highlight ICE Field",
  NAVIGATE_TO_EVENT_REG:      "Navigate To Event Reg",
  // Sent by attendeeContact.js right before submitting the check-in form.
  // background.js arms a one-shot redirect that fires when the resulting
  // eventRegDetails navigation commits -- forcing the volunteer back to the
  // account search so the next check-in starts from a fresh lookup.
  ARM_POST_CHECKIN_REDIRECT:  "Arm Post Check-In Redirect",
  // Sent by popup-merch.js when the volunteer confirms which items the
  // attendee is collecting now. merch-attendee.js writes current date/time
  // into each item's pickup field, then submits the form (same submit +
  // redirect path as the reg flow).
  WRITE_MERCH_PICKUP:         "Write Merch Pickup",
  // Sent by popup-merch.js when STORAGE_KEY.ATTENDEE_MERCH is empty
  // (race: popup opened before the content script's on-load scrape
  // finished). merch-attendee.js scrapes fresh and returns the state
  // synchronously so the popup can render without waiting on storage.
  GET_ATTENDEE_MERCH:         "Get Attendee Merch",
  // Sent by attendeeContact.js after the manager debug walk's final
  // audit step writes STORAGE_KEY.DEBUG_REPORT. background.js opens the
  // full-page report tab in response. Also sent at every early-halt point
  // (accountPage.js / registrations.js) so a partial report still opens.
  OPEN_DEBUG_REPORT:          "Open Debug Report",
  // Sent by popup.js initiateDebugWalk to accountPage.js BEFORE navigating
  // away from the account About page, so the About-page fields are captured
  // into the debug report while they are still on screen.
  RUN_ACCOUNT_DEBUG_AUDIT:    "Run Account Debug Audit",
  // Connectivity check: every content script answers PING so the options-page
  // maintenance panel can confirm the script actually injected on the tab.
  PING:                       "Ping Content Script",
  // Sent by background.js (chrome.action.onClicked) when the toolbar icon is
  // clicked in Automated pop-up mode on the eventReg page, so the in-page
  // check-in modal re-scrapes and re-opens.
  SHOW_CHECKIN_MODAL:         "Show Check-In Modal",
};

// ── EXTEND STORAGE_KEY WITH APP-SPECIFIC KEYS ───────────────────────────
// STORAGE_KEY itself is declared in shared/js/constants-base.js. Here we
// only ADD entries -- never redeclare the object, or we'll throw
// "Identifier already declared".
//
// ATTENDEE / REGISTRATIONS / ACCOUNT -- cached scrape results
// AGE_VERIFIED            -- per-attendee flag set when staff confirms ID
// ACCOUNT_AUTO_NAV        -- flag set by popup so accountPage knows to
//                            auto-click the first SUCCEEDED registration
// NOTE_ACKNOWLEDGED       -- set by popup when the volunteer dismisses the
//                            registration-note screen; cleared on popup reset

STORAGE_KEY.ATTENDEE          = "attendee";
STORAGE_KEY.ATTENDEE_MERCH    = "attendeeMerch";   // merch-mode equivalent of ATTENDEE
STORAGE_KEY.REGISTRATIONS     = "registrations";
STORAGE_KEY.ACCOUNT           = "account";
STORAGE_KEY.AGE_VERIFIED      = "ageVerified";
STORAGE_KEY.ACCOUNT_AUTO_NAV  = "cvgAccountAutoNav";
STORAGE_KEY.NOTE_ACKNOWLEDGED = "noteAcknowledged";
// FIRST_TIME -- { accountId, isFirstTime, recordCount, ts }. Written by
// accountPage.js on the Attendees tab (the only page that lists every
// registration record + status). Read by popup.js / attendee-modal.js to
// show the "First Time? Badge Ribbon!" line on the Badge Issued screen.
// Gated on accountId match so a stale flag can't leak to another attendee.
// Purely a visual guide -- the answer is never recorded or validated.
STORAGE_KEY.FIRST_TIME        = "firstTime";
// POPUP_MODE -- "automated" | "manual". Automated (default) auto-opens the
// in-page check-in modal on the eventReg page and re-opens it on toolbar click;
// Manual keeps the classic click-to-open popup.html. Anyone can pick manual
// (set on the options page); not gated behind Management Override.
STORAGE_KEY.POPUP_MODE        = "popupMode";
// MODAL_POS -- { left, top } in px. Last spot the user dragged an in-page modal
// to. Persisted by modal-drag.js so the modal reappears where they left it,
// even across page navigations. Absent = use the CSS default corner.
STORAGE_KEY.MODAL_POS         = "cvgModalPos";

// ── BLOCKING / WARNING CONDITION KEYS ────────────────────────────────────
// Keys for every blocking/warning condition. Used as keys in the reasons
// map produced by buildRegistrantState and getAttendeeInfo, and must match
// the keys in CONFIG.conditionOrder.
//
// Conditions marked fixableOnAttendeePage: true show a Re-check button in
// the popup because the staff member can resolve them on the AttendeeEdit
// form. NOT_PAID is the only red condition that cannot be fixed there.

const CONDITION = {
  WRONG_YEAR:       "wrongYear",
  WRONG_EVENT:      "wrongEvent",          // event name does not match config
  NOT_PAID:         "notPaid",
  REG_HOLD:         "regHold",
  ART_HOLD:         "artHold",
  OPS_HOLD:         "opsHold",
  ALREADY_ISSUED:   "alreadyIssued",
  UNKNOWN_TICKET:   "unknownTicket",
  INCORRECT_DAY:    "incorrectDay",
  NO_ACCOUNT_ID:    "noAccountId",
  NO_ATTENDEE_ID:   "noAttendeeId",
  NO_NAME:          "noName",
  MISSING_ICE:      "missingIce",
  AGE_VERIFICATION: "ageVerification",
  NAME_MISMATCH:    "nameMismatch",
};

// ── EVENT-NAME VALIDATION RESULT TYPES ───────────────────────────────────
// Returned by validateEventName() in registrations.js to indicate whether
// the page we're on is the real con event, a training/test event, or an
// event we don't recognise at all.

const EVENT_MATCH = {
  CURRENT:  "CURRENT",
  TEST:     "TEST",
  MISMATCH: "MISMATCH",
};

// end js/constants.js
