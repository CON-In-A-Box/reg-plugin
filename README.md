# CONvergence Registration Check-In Extension

A Chrome browser extension used by the CONvergence Registration department
to check in attendees at the convention.

## What It Does

The extension runs inside Chrome while staff are logged into the CONvergence
Neon CRM account. It reads information from the Neon pages, validates whether
an attendee is eligible to receive their badge, and — when the volunteer
confirms check-in — writes the check-in data back to Neon automatically.

**Without the extension**, a volunteer would have to manually read every field
on the page, mentally check all the rules, and type the pickup date, time, and
name into Neon by hand. The extension does all of that automatically and
reduces errors.

## What It Checks

Before allowing check-in, the extension verifies:

- The registration is for **this year's CONvergence** (not a past year or dealer event)
- The registration status is **SUCCEEDED** (fully paid)
- The badge has **not already been issued**
- There are **no holds** on the badge (Art Show, Operations, or Registration)
- For non-transferable badges, the **name on the badge matches** the person presenting
- The attendee's **emergency contact information** is filled in
- For Adult and Teen tickets, the volunteer is reminded to **verify age**
- For Day Pass tickets, the pass is being used on the **correct day**

It also gives the volunteer two visual cues:

- **First-time attendee** — if this is the only registration on the account
  (ignoring any cancelled, failed, or refunded ones), the Badge Issued screen
  shows a purple **"🎀 First Time? Badge Ribbon!"** prompt. It's a reminder
  only — nothing is recorded.
- **No valid registration** — if an account has no usable registration for the
  current event (no records, or only cancelled/failed/refunded/wrong-event
  ones), a **"No valid event registration found"** pop-up appears so the
  volunteer can send the attendee to the Help Desk.

## What It Does at Check-In

When a volunteer confirms check-in, the extension automatically:

1. Downloads a CSV file for the badge printer
2. Increments the "Number of Active Badges" counter in Neon
3. Writes the attendee's name to the Non-Transferable Name field
4. Records the pickup date and time in the next available pickup slot
5. Submits the Neon form

## File Structure/
├── config.js                        ← ANNUAL UPDATE FILE — edit this each year
├── manifest.json                    ← Chrome extension configuration
├── popup.html                       ← Extension popup window
├── extension_options_page.html      ← Options page (mode, manager override, debug)
├── debug-report.html                ← Manager Debug Walk report tab
├── assets/                          ← Extension icons
├── _locales/en/                     ← Localisation strings
├── installation/                    ← Page shown on first install
├── shared/js/                       ← Framework-level helpers (icon cache, hashing, base constants)
│   ├── constants-base.js            ← STATE, base STORAGE_KEY, ERROR_MESSAGES, dbg
│   ├── background-core.js           ← Icon caching + setIcon (service worker uses)
│   └── crypto.js                    ← Salted PBKDF2-SHA256 hashing/verification for the options page
├── js/
│   ├── constants.js                 ← App-specific constants (extends STORAGE_KEY)
│   ├── background.js                ← Service worker (page load listeners)
│   ├── popup.js                     ← Reg-mode popup UI + mode dispatcher
│   ├── popup-merch.js               ← Merch-mode popup UI (Merchandise pickup)
│   ├── options.js                   ← Options page logic (mode toggle + override)
│   ├── accountPage.js               ← Account page scrape + auto-nav
│   ├── account-modal.js             ← Auto-opening in-page account modal, REG (holds/notes/Proceed)
│   ├── merch-account-modal.js       ← Auto-opening in-page account modal, MERCH (name + Proceed)
│   ├── attendeeContact.js           ← AttendeeEdit page logic (REG mode)
│   ├── attendee-modal.js            ← Auto-opening in-page attendee check-in modal, REG
│   ├── merch-attendee.js            ← AttendeeEdit page logic (MERCH mode)
│   ├── merch-attendee-modal.js      ← Auto-opening in-page merch-pickup modal, MERCH
│   ├── registrations.js             ← EventRegDetails page logic (both modes)
│   ├── checkin-modal.js             ← Auto-opening in-page check-in modal, REG (eventReg)
│   ├── merch-reg-modal.js           ← Auto-opening in-page merch-pickup list modal, MERCH (eventReg)
│   ├── modal-drag.js                ← Shared makeDraggable() for the in-page modals
│   ├── config-doctor.js             ← validateConfig() — config.js self-check
│   └── debug-report.js              ← Renders the Manager Debug Walk report
└── tools/
├── generate-password-hash.html  ← Run locally to PBKDF2-hash the annual password
└── field-diagnostic.html        ← Single-page field check (paste a DevTools dump)

## Key People

| Role | Responsibility |
|---|---|
| Annual updater | Edit `config.js` each year — see `ANNUAL_UPDATE_GUIDE.md` |
| IT volunteer | Maintain code, handle breaks — see `DEVELOPER.md` |
| Registration head | Set workstation IDs, share override password with Help Desk |

## Documentation Index

| Document | Who Should Read It |
|---|---|
| `TRAINING/reg-checkin.html` | Registration check-in volunteers — graphical guide |
| `TRAINING/merch-checkin.html` | Merchandise pickup volunteers — graphical guide |
| `TRAINING/management.html` | Registration management / Help Desk leads — full manual |
| `TRAINING/reg-checkin-card.html` | Print-ready reg station card (Chrome → Print → laminate) |
| `TRAINING/merch-checkin-card.html` | Print-ready merch station card (Chrome → Print → laminate) |
| `ANNUAL_UPDATE_GUIDE.md` | Anyone doing the yearly update |
| `SETUP.md` | Anyone setting up a new workstation |
| `TROUBLESHOOTING.md` | Anyone dealing with a problem at con |
| `DEVELOPER.md` | IT volunteers maintaining the code |