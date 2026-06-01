# CONvergence Check-In Extension — Developer Guide

This document is for IT volunteers who maintain, debug, or update the
extension code. It assumes basic familiarity with JavaScript and Chrome
extensions.

---

## Architecture Overview

The extension is built to Manifest V3 (MV3) standards using ES modules.
jQuery has been removed — all DOM access uses native browser APIs.

### How the pieces connectUser navigates to Neon page
↓
background.js (service worker) detects the URL via webNavigation listener
↓
Sends message to content script (attendeeContact.js or registrations.js)
↓
Content script scrapes the page and returns a state object
↓
background.js stores the state in chrome.storage.local
and sets the toolbar icon color (green / yellow / red)
↓
User clicks the toolbar icon → popup.html loads → popup.js reads storage
↓
popup.js renders the appropriate view (attendee view or registrations view)
↓
User clicks "Complete Check-In" in popup
↓
popup.js downloads badge CSV, then sends "Increment Badge Count" message
↓
attendeeContact.js writes fields to Neon form and clicks the save button

### Content script injection

Content scripts are injected by the manifest based on URL patterns. They
are plain (non-module) scripts. Every content_scripts block loads these
files in order before the per-page script:

1. `shared/js/constants-base.js` -- framework-level globals: `STATE`,
   `ERROR_MESSAGES`, `dbg()`, and the icon-machinery `STORAGE_KEY` entries
   (`MANAGEMENT_OVERRIDE`, `PENDING_ICON_UPDATE`, `REGISTRATION_ERROR`).
2. `config.js` -- annual settings, including `CONFIG.debug` (consumed by `dbg()`).
3. `js/constants.js` -- app-specific globals: `REG_STATUS`, `ACTION`,
   `CONDITION`, `EVENT_MATCH`. Also mutates `STORAGE_KEY` to add app keys
   like `ATTENDEE`, `REGISTRATIONS`, `ACCOUNT`, etc.

Do not add `import` / `export` statements. The same load order is mirrored
in `popup.html` script tags, `extension_options_page.html` script tags, and
`importScripts(...)` at the top of `js/background.js`.

The `shared/` folder exists to keep framework-level helpers separate from
app-specific code so they're easy to reuse if a second extension mode is
added later. It is internal organization, not a cross-extension boundary.

### Extension modes

The extension ships two flows in one install, gated by `CONFIG.mode`
(default) and the user-selectable `STORAGE_KEY.EXTENSION_MODE` value
(set on the options page; overrides the default once chosen):

- `EXTENSION_MODE.REG`   -- badge check-in. The original flow; everything
  in `js/popup.js`, `js/attendeeContact.js`, etc. is reg-mode behavior.
- `EXTENSION_MODE.MERCH` -- merchandise pickup. Volunteer confirms which
  items in `CONFIG.merch.items` an attendee is collecting; the extension
  writes a date/time into the matching pickup field on the attendee form
  and redirects to the dashboard. Items can be sourced from a Neon
  custom field or a Neon session; see `CONFIG.merch` in `config.js`.

`js/popup.js` reads the mode at the top of `displayPopup()` and, when
merch mode is active, calls `displayMerchPopup()` (defined in
`js/popup-merch.js`) -- the reg flow is not invoked.

Content scripts are mode-aware:
- `js/attendeeContact.js` (reg-mode owner of attendeeEdit) returns early
  from its IIFE when mode is MERCH, leaving `buildFieldIndex()` and
  `buildCustomFieldLabelMap()` defined as content-script globals for
  `js/merch-attendee.js` to call.
- `js/merch-attendee.js` (merch-mode owner of attendeeEdit) returns early
  when mode is REG. When MERCH, it scrapes per-item ordered/picked-up
  state and writes `STORAGE_KEY.ATTENDEE_MERCH`.
- `js/registrations.js` reads mode once on page load; in MERCH mode it
  skips badge-eligibility validation and instead attaches a per-attendee
  `merch` summary array using the same `readField()` helper the reg flow
  uses for ICE/holds/etc.

### Merchandise pickup data model

`CONFIG.merch.items` is the year's merch catalog (see `config.js`). Each
entry declares how to detect whether an attendee ordered the item and
where to write pickup date/time:

```js
{
  name: "T-Shirt",                          // shown in popup
  source: {
    type: "customField",                    // only customField supported in Phase B2
    label: "Preorder your 2026 T-shirt",    // substring of the source field's label
    matchMode: "anyExcept",                 // "anyExcept" or "substring"
    notOrderedValue: "...",                 // (anyExcept) ordered if value differs
    // matchValue: "..."                    // (substring) ordered if value contains
  },
  pickupFieldLabel: "T-Shirt Picked Up",    // substring of the pickup field's label
}
```

When `matchMode === "anyExcept"`, the field's own value IS the variant
(e.g., the T-shirt size). When `matchMode === "substring"`, there is no
variant.

`STORAGE_KEY.ATTENDEE_MERCH` shape (written by `js/merch-attendee.js`,
read by `js/popup-merch.js`):

```js
{
  accountId, attendeeId, legalName, preferredName,
  items: [
    { name, ordered: bool, variant: string|null,
      alreadyPickedUp: bool, pickedUpAt: string|null },
    ...
  ],
}
```

| URL pattern | Script injected |
|---|---|
| `.../admin/accounts/*` | `js/accountPage.js` |
| `.../attendeeEdit.do*` | `js/attendeeContact.js` |
| `.../contactSelect.do*` | `js/attendeeContact.js` |
| `.../eventRegDetails.do*` | `js/registrations.js` |

---

## File Responsibilities

| File | Purpose |
|---|---|
| `config.js` | All annual configuration -- event IDs, field indexes, ticket rules |
| `shared/js/constants-base.js` | Framework constants reusable across Neon helper modes (STATE, ERROR_MESSAGES, icon-machinery STORAGE_KEY entries, dbg) |
| `shared/js/background-core.js` | Generic MV3 icon cache + setter + worstStateFromRows helper |
| `shared/js/crypto.js` | SHA-256 hashPassword used by the options page |
| `js/constants.js` | App-specific constants (REG_STATUS, ACTION, CONDITION, EVENT_MATCH) and STORAGE_KEY extensions |
| `js/background.js` | Service worker -- page load listeners, icon updates, post-check-in redirect, error capture |
| `js/attendeeContact.js` | Scrapes AttendeeEdit page, validates, writes check-in data |
| `js/registrations.js` | Scrapes EventRegDetails page, validates registrants |
| `js/popup.js` | Reg-mode popup UI + top-level entry point. Reads `STORAGE_KEY.EXTENSION_MODE` first; if it's `"merch"`, delegates to `displayMerchPopup()` and skips the reg flow entirely. |
| `js/popup-merch.js` | Merch-mode popup UI. On eventreg: attendee list with merch summary + Review Merch button per row. On attendeeEdit: checkbox per ordered item (already-picked-up items disabled), Confirm Pickup submit. |
| `js/merch-attendee.js` | Merch-mode content script for attendeeEdit pages. Reads each `CONFIG.merch.items[]` entry by label substring, evaluates the matcher to decide `ordered`, reads each pickup field to decide `alreadyPickedUp`. Stores result in `STORAGE_KEY.ATTENDEE_MERCH`. On `ACTION.WRITE_MERCH_PICKUP`, writes the current date/time into the matching pickup field for each newly-checked item, then arms the post-checkin redirect and clicks Save. |
| `js/options.js` | Options page -- saves `EXTENSION_MODE` (reg/merch radio) and `MANAGEMENT_OVERRIDE` (password-gated boolean) |

---

## The Attendee State Object

`attendeeContact.js` builds and returns this object. `popup.js` consumes it.
If you change the shape of this object, update both files.
```javascript{
accountId:             string,   // Neon account ID (from URL param)
attendeeId:            string,   // Badge prefix + attendee ID (e.g. "A81463")
name:                  string,   // First + last name from form
badgeName:             string,   // Badge Name field, falls back to name
badgeImage:            string,   // .tif filename for badge printer
ticket:                string,   // e.g. "Adult Weekend", "Teen Day Pass"
activeBadges:          number,   // Current value of Active Badge Count field
regStatus:             string,   // e.g. "SUCCEEDED"
state:                 string,   // "green" | "yellow" | "red"
reason:                string,   // Staff-facing message
missingRequiredFields: string[], // Labels of any empty required fields
merch:                 [{name: string}], // Pending merch (ordered, not yet picked up).
                                          // Populated by getAttendeeInfo via scrapeAttendeeMerch
                                          // (defined in js/merch-attendee.js). popup.js renders
                                          // one "{name} Ordered" line per entry and switches
                                          // the action button to "Badge Issued - Send to
                                          // Merchandise" when the array is non-empty.
}

---

## Neon Custom Field Indexes (verified 2025)

All custom fields on the AttendeeEdit page use the pattern:
`name="attendee.customDataList[N].value"`

| Index | Field | Type |
|---|---|---|
| 0 | Registration Hold - Do Not Release | checkbox |
| 1 | Art Show Hold - Do Not Release | checkbox |
| 2 | Operations Hold - Do Not Release | checkbox |
| 3 | Unknown — not used | — |
| 4 | In Case Of Emergency (Name and Phone) | text |
| 5 | Badge Name | text |
| 6–9 | Unknown — not used | — |
| 10 | Non-Transferable First and Last Name | text |
| 11 | Number of Active Badges | text |
| 12 | Pickup Date 1 | text |
| 13 | Pickup Time 1 | text |
| 14 | Pickup Date 2 | text |
| 15 | Pickup Time 2 | text |
| 16 | Pickup Date 3 | text |
| 17 | Pickup Time 3 | text |
| 18 | Pickup Date 4 | text |
| 19 | Pickup Time 4 | text |

### If field indexes change

> Fields are resolved at runtime by **label substring** (`CONFIG.fieldLabels`),
> not by hardcoded index — the index table above is reference only. The fastest
> way to see what resolves and what doesn't is `tools/field-diagnostic.html`
> (see the Tools section). The manual mapping below still works as a fallback.

If the extension stops reading or writing fields correctly after a Neon
update, a label may have changed. To map the new ones:

1. Open the Neon AttendeeEdit page in Chrome and open DevTools → Console.
2. Run `Array.from(document.querySelectorAll('[name^="attendee.customDataList"]')).map((el, i) => ({ index: i, name: el.name, label: el.closest('tr')?.querySelector('td:first-child')?.innerText?.trim() }))`.
3. Match the labels you see against the table above and update
   `config.js` → `fieldIndexes` with the new values.

---

## Password Hashing

The management override password is stored as a SHA-256 hex hash in
`config.js`. The hash is generated by `tools/generate-password-hash.html`.

The hashing is done by `hashPassword()` in `shared/js/crypto.js` using the
browser's built-in `crypto.subtle.digest("SHA-256", ...)` -- no external
libraries. `js/options.js` calls it after loading the script in
`extension_options_page.html`.

**Do not commit `tools/generate-password-hash.html` to GitHub.** It is
listed in `.gitignore`. If it appears in a commit, remove it.

---

## Common Debugging Steps

### Extension not activating on a page
1. Check `chrome://extensions` for errors
2. Verify the URL matches a pattern in `manifest.json` `content_scripts`
3. Open DevTools on the Neon page → Console tab — look for errors from
   `attendeeContact.js` or `registrations.js`

### Popup shows stale or wrong data
Data is cached in `chrome.storage.local`. The cache is updated each time
a matching page finishes loading (via `background.js`).
- Refreshing the Neon page forces a re-scrape
- You can inspect storage at `chrome://extensions` → Details → Inspect views: service worker → Application → Storage → Local Storage

### Field writes not working
1. Verify the field index in `config.js` matches the live page
2. Re-map indexes using the DevTools snippet under "If field indexes change"
3. Check the console for errors from `incrementBadge()` in `attendeeContact.js`

### Adding a new required field
1. Find the field's `customDataList` index using the DevTools snippet
   under "If field indexes change"
2. Add an entry to `config.js` → `requiredFields`
3. Add a corresponding highlight case to `highlightICEField()` in
   `attendeeContact.js` if you want the "Show me the field" button to work

### Adding a new hold type
1. Find the field's `customDataList` index using the same DevTools snippet
2. Add the index to `config.js` → `fieldIndexes` (name it clearly)
3. Add the staff-facing message to `config.js` → `holdMessages`
   (order must match the hold indexes array in `attendeeContact.js`)

---

## Annual Release Checklist

- [ ] Update `event.currentEventId` in `config.js`
- [ ] Regenerate management password hash and update `config.js`
- [ ] Confirm `adultMinimumAge` is still correct
- [ ] Confirm ticket type `nameIncludes` values match current Neon ticket names
- [ ] Confirm field labels still resolve against the live Neon form (run `tools/field-diagnostic.html`)
- [ ] Update `version` in `manifest.json` to current year
- [ ] Test on the training event (ID 142) before con weekend
- [ ] Brief incoming Registration IT volunteer on this document

---

## Manager Debug Walk

A diagnostic that audits field detection across all three Neon pages and opens a
report tab. Gated behind Manager Override + **Debugging** on the options page
(`debugMode = mngtOverride && behavior === "debugging"`).

**Trigger & flow** (clicking the toolbar icon on an account page):
1. `displayPopup()` (`js/popup.js`) sees `MANAGEMENT_OVERRIDE` + `DEBUG_MODE` and calls
   `initiateDebugWalk()`, which arms `STORAGE_KEY.DEBUG_WALK_ACTIVE`, sends
   `ACTION.RUN_ACCOUNT_DEBUG_AUDIT` to the account content script (captures the About-page
   `.neon_nest_grid_row` fields *before* navigating), then navigates to the Attendees tab
   (reusing `ACCOUNT_AUTO_NAV` / `autoClickFirstSucceededRegistration()`).
2. `js/registrations.js` `maybeAdvanceDebugWalk()` enumerates the first attendee's custom-field
   rows, records the `eventreg` step, then clicks the first attendee.
3. `js/attendeeContact.js` `runDebugAuditOnAttendeePage()` enumerates the attendee form, checks
   `CONFIG.fieldLabels` / `requiredFields` / `merch.items[]` (reusing `FIELD`,
   `readFieldValueByLabel`, `isMerchItemOrdered`), records the `attendee` step, then sends
   `ACTION.OPEN_DEBUG_REPORT`.
4. `js/background.js` handles `OPEN_DEBUG_REPORT` → opens `debug-report.html` in a new tab and
   clears `DEBUG_WALK_ACTIVE`. Every early-halt point (no SUCCEEDED reg, no attendee link) also
   sends `OPEN_DEBUG_REPORT`, so a **partial** report still opens with a note on where it stopped.

**Storage:** each leg appends to `STORAGE_KEY.DEBUG_REPORT`
(`{startedAt, steps:[{step, status, details, issues, recordedAt}]}`) via
`appendDebugStepIfWalkActive` (account), `appendDebugStep` (registrations), and a local appender
(attendee). `debug-report.html` + `js/debug-report.js` read that key and render one section per page.

**To extend:** if you change what a leg records, keep the `details` keys (`fields`, `used`,
`missing`, `requiredMissing`, `requiredEmpty`, `merch`, `roster`, `plannedWrites`) aligned with the
renderers in `js/debug-report.js`.

### Other diagnostics (surfaced in the same report / options page)

- **Config Doctor** — `validateConfig(CONFIG, extras)` in `js/config-doctor.js` (pure, DOM-free).
  Catches silent `config.js` mistakes: `holdMessages` count, `conditionOrder` vs `CONDITION`,
  merch `matchMode`/sub-keys, event-name overlap, password-hash format, ticket catch-all, plus
  version/debug drift. Rendered as a "Config check" panel on the **options page**
  (`renderConfigCheck()` in `js/options.js`) and a "Config check" section in the report.
- **Roster audit** — `maybeAdvanceDebugWalk()` builds `details.roster` for **every** attendee
  (ticket via `resolveTicketConfig(readTicketType())`, holds, ICE, badges, layout); the report
  red-flags unresolved tickets / missing ICE.
- **Check-in dry-run** — `computeCheckinWrites()` (`js/attendeeContact.js`) returns the planned
  field writes; `incrementBadge()` applies them and the attendee audit records them as
  `details.plannedWrites` (preview only, no submit), so preview and reality share one code path.
- **Error log** — `recordErrorInStorage()` (`js/background.js`) appends to a 20-entry ring buffer
  `STORAGE_KEY.ERROR_LOG`, rendered as "Recent errors" in the report.
- **Environment health** (options page, manager-gated): storage inspector + **Clear cached scrape
  data** (`CACHE_KEYS` in `js/options.js`, leaves settings keys), and a **Check Neon tab(s)**
  button that finds Neon tabs by URL (`chrome.tabs.query({url})` — the Options dialog isn't the
  active tab) and pings each via `ACTION.PING` (handled in `accountPage.js`, `registrations.js`,
  `attendeeContact.js`).

---

## Auto-opening check-in modal

In **Automated** pop-up mode (`STORAGE_KEY.POPUP_MODE`, default `"automated"`; managers can pick
`"manual"` on the options page) the eventReg AND attendee pages show their check-in UI as an
**in-page modal** instead of the toolbar popup.

**Phase 1 — eventReg list modal:**
- `js/checkin-modal.js` (manifest-injected **after** `js/registrations.js`, with
  `css/checkin-modal.css`) auto-opens the modal on load when REG + Automated and no debug walk is
  active. It reuses `registrations.js`'s `getRegistrationsInfo()` / `getRegistrationNotes()` globals
  and mirrors `popup.js`'s `buildAttendeeListContent()` + `navigateToAttendeeEdit()`. All styles are
  scoped under `#cvg-checkin-modal`.

**Phase 2 — attendee-page check-in modal:**
- `js/attendee-modal.js` (manifest-injected **after** `js/attendeeContact.js` + `js/merch-attendee.js`,
  with `css/checkin-modal.css`) auto-opens on the `attendeeEdit.do` page under the same gate. Same
  isolated world, so it calls `attendeeContact.js`'s globals **directly** (no messaging):
  `getAttendeeInfo()` (scrape / Re-check), `incrementBadge()` (write fields + submit),
  `highlightICEField()` (Show-me-the-field). `renderAttendeeModal()` mirrors `popup.js`'s
  `buildAttendeeView` (override banner, age-verify gate, red/yellow banners, badge cell vs
  placeholder, info table, blocked → help-desk, Re-check section, Badge-Issued) and the
  `completeCheckIn` flow (`saveBadgeCSV` — replicated locally — then `incrementBadge`, then clear
  `AGE_VERIFIED`). Reuses the `#cvg-checkin-modal` container/styles.

**Both pages:**
- `js/background.js` `applyPopupForTab()` clears the tab's action popup (`setPopup({tabId, popup:""})`)
  in REG+Automated mode for `page === "registrations"` and `page === "attendee"`, so a toolbar click
  fires `chrome.action.onClicked` → `ACTION.SHOW_CHECKIN_MODAL` (re-scrape + re-open). Account pages
  and Manual mode keep `popup.html`. Toggling `POPUP_MODE` re-applies the active eventReg tab
  immediately.
- **Draggable:** `js/modal-drag.js` (shared, loaded before each modal script) exposes
  `makeDraggable(modalEl, handleEl)`. Header `mousedown` switches the modal to `left/top` and drags it
  (clamped to the viewport); the position is remembered in a module variable and reapplied on
  re-render so it survives a Re-check or toolbar re-open. Clicks on the ✕ (or any header button) don't
  start a drag.

---

## Brand colors

Canonical palette + rules live in `BRANDING.md`. In code:
- **CSS:** `css/brand.css` defines `:root` brand variables (`--brand-purple/green/blue/red/yellow`)
  plus `color-mix()`-derived `*-bg` (light backgrounds), `*-dark` (hover/border), and `*-ink` (text)
  variants. It's loaded by `popup.html`, the options page, and the eventReg `content_scripts` css.
  `css/popup.css` and `css/checkin-modal.css` reference `var(--brand-*)` — no raw brand hex.
- **JS:** `BRAND` in `shared/js/constants-base.js` mirrors the base hexes for non-CSS uses (the icon
  "M" badge in `background-core.js`, a few inline styles in popup/content scripts).
- **Colorblind status rule:** the "ready/go" state uses **blue**, not green (green is links). This
  shows up as `--brand-blue-bg` for `.banner-green` / `.reg-row-green`, the blue `reggie-blue-*`
  toolbar icon, and blue primary buttons.
- **Toolbar faces:** `assets/reggie-*` (REG) and `assets/connie-*` (MERCH); raster, so not affected
  by the CSS vars.

---

## Tools

### `tools/generate-password-hash.html`
Open locally in Chrome. Generates a SHA-256 hash of a password for use
in `config.js`. This file is gitignored (`.gitignore` line 6) — it lives
on individual maintainers' machines and must not be committed. If you
don't have a copy, regenerate the hash with this one-liner in DevTools:
`crypto.subtle.digest("SHA-256", new TextEncoder().encode("yourPassword")).then(b => console.log(Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,"0")).join("")))`.

### `tools/field-diagnostic.html`
Open locally in Chrome. Loads `../config.js` and compares a field dump scraped
from a live Neon AttendeeEdit page against `CONFIG.fieldLabels`,
`CONFIG.requiredFields`, and `CONFIG.merch.items[]`, flagging anything it can't
resolve in red. It mirrors the runtime matching in `buildFieldIndex()`
(`js/attendeeContact.js`) and `scrapeAttendeeMerch()` (`js/merch-attendee.js`) —
keep it in sync if those resolution rules change. The page shows a copy-paste
console snippet that produces the dump. Unlike the password-hash tool it holds
no secret, so it **is** committed. Walkthrough: Step 3 in `ANNUAL_UPDATE_GUIDE.md`.