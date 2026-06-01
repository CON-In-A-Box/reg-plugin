# Handoff — Training & Beads Setup (2026-05-30)

## Summary
Session 1 (2026-05-29): Phase 2 in-page modal implementation complete.
Session 2 (2026-05-30): Comprehensive training documentation + beads issue tracking setup. All volunteer guides, management manual, and .pptx presentations complete. Event 142 references corrected across all docs. Beads initialized and ready for issue tracking.

## Files Touched

### New Files
- `js/modal-drag.js` (~95 lines) — shared `makeDraggable(modalEl, handleEl)` for both modal pages. Stores position in module var, reapplies on re-render, clamps to viewport, ignores drag on buttons.
- `js/attendee-modal.js` (~330 lines) — attendee page (`attendeeEdit.do`) check-in modal. Auto-opens REG+Automated+no-walk; reuses `getAttendeeInfo()`, `incrementBadge()`, `highlightICEField()` globals from `attendeeContact.js`; renders full badge check-in view; local `saveBadgeCSV` helper; `ACTION.SHOW_CHECKIN_MODAL` listener for toolbar re-open.

### Modified Files
- `js/checkin-modal.js` — +1 line after `document.body.appendChild(root)`: `if (typeof makeDraggable === "function") makeDraggable(root, header);`
- `js/background.js` — line 124: `if (page === "registrations" || page === "attendee")` (extend popup-clear to attendee page in Automated REG mode).
- `css/checkin-modal.css` — +cursor/user-select on `.cvg-modal-header`; +~200 line attendee-view block (banners, badge cell, info table, buttons, confirm/error screens, all scoped under `#cvg-checkin-modal`).
- `manifest.json` — `attendeeEdit.do` row: += `js/modal-drag.js`, `js/attendee-modal.js` + `css`; `eventRegDetails.do` row: += `js/modal-drag.js`.
- `CLAUDE.md` — updated URL table + conventions + pop-up-vs-modal section.
- `DEVELOPER.MD` — split "check-in modal" section into Phase 1 + Phase 2 + Both Pages subsections.

## Current State
✅ **Implementation complete** — all code per approved plan.
✅ **Tests passing** — `npm test` = 3 skipped (gated on Neon creds, expected), 0 failures.
✅ **Manifest valid** — JSON parses.
✅ **Docs updated** — CLAUDE.md + DEVELOPER.MD reflect Phase 2.

## Verification Checklist (Manual)
- [ ] Reload extension + page on `attendeeEdit.do` (REG+Automated) → modal auto-opens
- [ ] Age-verify gate → button → set storage key → re-render
- [ ] Re-check → re-scrape + update + re-render
- [ ] Show me the field → highlight ICE on form (modal stays open)
- [ ] Badge Issued → CSV download → form submit → redirect to dashboard
- [ ] Drag modal header → position persists across Re-check + toolbar re-open
- [ ] Manual mode → fallback to popup.html (no modal)
- [ ] Blocked attendee (no override) → "SEND TO HELP DESK" (no Badge button)

## Session 2: Training Documentation & Beads Setup (2026-05-30)

### New Training Files
**HTML Graphical Guides** (read in browser or share with volunteers):
- `TRAINING/reg-checkin.html` — Registration check-in volunteers (icon legend, 5 steps, detailed age-verification section with sub-steps, ICE fix walkthrough, badge-issued screen mocks, escalation guide)
- `TRAINING/merch-checkin.html` — Merchandise pickup volunteers (icon legend, 4 steps, checkbox mock-up with greyed already-picked-up items, "Already Picked Up" resolution section, escalation guide)
- `TRAINING/management.html` — Management & Help Desk manual (options page mock, mode comparison table, override procedures, full red/yellow condition tables with resolution column, debug walk steps, maintenance tools, escalation)

**Print-Ready One-Pager Cards** (Chrome → Print → laminate):
- `TRAINING/reg-checkin-card.html` — Registration station card with icon legend + 5 step cards + expanded ID check procedure (7 numbered sub-steps: which IDs count, face match, DOB check, return ID, click button, when to escalate)
- `TRAINING/merch-checkin-card.html` — Merchandise station card with icon legend + 4 steps + already-picked-up resolution

**PowerPoint/Google Slides Presentations** (auto-convert in Google Drive):
- `TRAINING/reg-checkin.pptx` — 9 slides (title, before-you-start, icon colors, steps overview, account screen, age verify × 3, ICE, badge issued, escalate)
- `TRAINING/merch-checkin.pptx` — 7 slides (title, before-you-start, icon colors, steps overview, checkbox screen, already-picked-up, escalate)
- `TRAINING/management.pptx` — 14 slides (title, overview, options page, modes, pop-up behavior, override × 2, red conditions, yellow conditions, debug walk × 2, maintenance, escalation)

**Plain-Text Markdown** (git-tracked source):
- `TRAINING/reg-checkin.md` — Registration volunteer guide (plain text version)
- `TRAINING/merch-checkin.md` — Merchandise volunteer guide (plain text version)
- `TRAINING/management.md` — Management manual (plain text version)
- `TRAINING/README.md` — Index and guidance for all training formats

Generated via `tools/generate-training-pptx.js` (pptxgenjs library).

### Documentation Corrections
**Removed "use event 142 for testing" language** from all user-facing documentation:
- `Claude.md` — replaced with note that event 142 is config-only, lacks fields for full testing
- `ANNUAL_UPDATE_GUIDE.md` — Step 3 (debug walk): "any real attendee" instead of event 142; Step 6 (test before con): debug walk guidance instead of navigate-to-142
- `TROUBLESHOOTING.md` — Debug walk: "real attendee" instead of event 142
- `handoff.md` (prior session) — removed event 142 reference
- `TRAINING/management.md` — debug walk and testing sections corrected
- `TRAINING/management.html` — two instances corrected

**Rationale**: Event 142 exists only in `config.js` `testEventNames` for framework purposes. It lacks custom fields needed for full check-in flow testing. Debug Walk against real attendees is the correct field-detection test.

Added memory file `feedback_event142.md` to prevent reintroduction.

### Beads Issue Tracking Setup
- Installed beads plugin: `claude plugin marketplace add gastownhall/beads` → `claude plugin install beads@beads-marketplace`
- Downloaded `bd.exe` v0.44.0 from `steveyegge/beads` releases (upstream binary)
- Placed at `C:\Users\colt2\AppData\Roaming\npm\bd.exe` (on PATH) + plugin cache location
- Initialized beads in repo: `bd init` → `.beads/` database created
- Added `.beads/` to `.git/info/exclude` so it doesn't appear in PRs to upstream `CON-In-A-Box/reg-plugin`
- Status: `bd prime` shows no issues; database empty, ready for use

### Next Session
1. **Commit training docs** — new TRAINING/*.{md,html,pptx} files + updated docs
2. **Commit manual verification results** — Phase 2 modal checklist (if running it)
3. **Deploy** — push 2026Refactor branch to master
4. **Open beads issues** — create tasks for ongoing work, blockers, etc.

## Key Decision Points

### Session 1 (Phase 2 Modal)
- Position memory stored in module var (survives DOM re-render, simple).
- `attendee-modal.js` calls content globals directly (same isolated world, no messaging overhead).
- Reused `MODAL_ID="cvg-checkin-modal"` container → existing CSS + drag logic apply automatically.
- Local `saveBadgeCSV` copy in `attendee-modal.js` (can't reuse `popup.js` function across windows).

### Session 2 (Training & Beads)
- Three-format approach for training: HTML guides (on-screen), one-pagers (printable), .pptx (shareable)
- Volunteer cards focus on task-card style: status icons → numbered steps with exact button text → "when to escalate" box. No prose.
- Management manual is reference-heavy (condition tables, procedures) + points to existing guides rather than duplicating.
- Event 142 removed from user-facing docs; config-only note added to CLAUDE.md; feedback memory file created to prevent reintroduction.
- Beads initialized with upstream fork awareness (`.beads/` excluded from PRs to CON-In-A-Box/reg-plugin).
- `bd` binary placed in both npm global bin (PATH) and plugin cache dir (plugin wrapper requirement).
