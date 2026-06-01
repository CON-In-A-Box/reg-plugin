#!/usr/bin/env node
// tools/generate-training-pptx.js
// Generates three training .pptx files in TRAINING/
// Run: node tools/generate-training-pptx.js

const PptxGenJS = require("pptxgenjs");
const path = require("path");

const OUT = path.join(__dirname, "..", "TRAINING");

// ── Brand palette ────────────────────────────────────────────────────────────
const C = {
  purple: "620272",
  green:  "328332",
  blue:   "0072B2",
  red:    "CC0202",
  yellow: "FFB400",
  white:  "FFFFFF",
  ink:    "1A1A1A",
  light:  "F5F4F7",
  border: "E0DCE6",
};

// ── Shared slide helpers ─────────────────────────────────────────────────────

function applyMaster(pres) {
  pres.defineSlideMaster({
    title: "MASTER",
    background: { color: C.light },
    objects: [],
  });
}

/** Full-bleed title slide */
function titleSlide(pres, title, subtitle, color = C.purple) {
  const s = pres.addSlide();
  s.background = { color };
  s.addText(title, {
    x: 0.5, y: 2.2, w: 9, h: 1.4,
    fontSize: 36, bold: true, color: C.white, align: "center",
  });
  if (subtitle) {
    s.addText(subtitle, {
      x: 0.5, y: 3.8, w: 9, h: 0.6,
      fontSize: 18, color: C.white, align: "center", italic: true,
    });
  }
  return s;
}

/** Section divider */
function sectionSlide(pres, label, color = C.purple) {
  const s = pres.addSlide();
  s.background = { color };
  s.addText(label, {
    x: 0.5, y: 2.6, w: 9, h: 1,
    fontSize: 28, bold: true, color: C.white, align: "center",
  });
  return s;
}

/** Standard content slide */
function contentSlide(pres, title, bodyFn) {
  const s = pres.addSlide();
  s.background = { color: C.white };
  // Purple header bar
  s.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 10, h: 0.9,
    fill: { color: C.purple }, line: { color: C.purple },
  });
  s.addText(title, {
    x: 0.35, y: 0.08, w: 9.3, h: 0.75,
    fontSize: 20, bold: true, color: C.white,
  });
  bodyFn(s, pres);
  // Subtle footer line
  s.addShape(pres.ShapeType.rect, {
    x: 0, y: 7.1, w: 10, h: 0.05,
    fill: { color: C.purple }, line: { color: C.purple },
  });
  return s;
}

/** Bullet list block */
function bullets(s, items, opts = {}) {
  const {
    x = 0.4, y = 1.1, w = 9.2, h = 5.5,
    fontSize = 18, color = C.ink, indent = 0,
  } = opts;
  const rows = items.map(item => {
    if (typeof item === "string") {
      return { text: item, options: { bullet: { indent: indent * 12 }, fontSize, color } };
    }
    // { text, sub: true, color }
    return {
      text: item.text,
      options: {
        bullet: { indent: (indent + (item.sub ? 1 : 0)) * 12 },
        fontSize: item.sub ? fontSize - 2 : fontSize,
        color: item.color || color,
        italic: !!item.italic,
      },
    };
  });
  s.addText(rows, { x, y, w, h, valign: "top", paraSpaceBefore: 6 });
}

/** Colored callout box */
function callout(s, pres, text, bgColor, borderColor, opts = {}) {
  const { x = 0.35, y = 1.1, w = 9.3, h = 1.0, fontSize = 16, bold = false } = opts;
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: bgColor },
    line: { color: borderColor, pt: 2 },
    rectRadius: 0.08,
  });
  s.addText(text, { x: x + 0.15, y: y + 0.08, w: w - 0.3, h: h - 0.16, fontSize, color: C.ink, bold, wrap: true });
}

/** Status chip row */
function chipRow(s, pres, chips) {
  // chips: [{ label, desc, color }]
  const cw = 2.1;
  const gap = 0.18;
  const startX = (10 - (chips.length * cw + (chips.length - 1) * gap)) / 2;
  chips.forEach((chip, i) => {
    const cx = startX + i * (cw + gap);
    s.addShape(pres.ShapeType.roundRect, {
      x: cx, y: 1.2, w: cw, h: 1.5,
      fill: { color: "F8F8F8" },
      line: { color: chip.color, pt: 3 },
      rectRadius: 0.1,
    });
    s.addShape(pres.ShapeType.ellipse, {
      x: cx + cw / 2 - 0.22, y: 1.35, w: 0.44, h: 0.44,
      fill: { color: chip.color }, line: { color: chip.color },
    });
    s.addText(chip.label, {
      x: cx, y: 1.82, w: cw, h: 0.32,
      fontSize: 14, bold: true, align: "center", color: C.ink,
    });
    s.addText(chip.desc, {
      x: cx + 0.05, y: 2.16, w: cw - 0.1, h: 0.48,
      fontSize: 11, align: "center", color: "555555", wrap: true,
    });
  });
}

/** Numbered step rows */
function stepRows(s, pres, steps, startY = 1.15) {
  const rowH = 0.78;
  steps.forEach((step, i) => {
    const y = startY + i * (rowH + 0.08);
    s.addShape(pres.ShapeType.ellipse, {
      x: 0.35, y: y + 0.08, w: 0.52, h: 0.52,
      fill: { color: C.purple }, line: { color: C.purple },
    });
    s.addText(String(i + 1), {
      x: 0.35, y: y + 0.08, w: 0.52, h: 0.52,
      fontSize: 16, bold: true, color: C.white, align: "center", valign: "middle",
    });
    s.addShape(pres.ShapeType.roundRect, {
      x: 1.0, y, w: 8.6, h: rowH,
      fill: { color: "F9F8FC" }, line: { color: C.border, pt: 1 },
      rectRadius: 0.06,
    });
    s.addText([
      { text: step.title + "  ", options: { bold: true, fontSize: 15, color: C.ink } },
      { text: step.desc, options: { fontSize: 14, color: "333333" } },
    ], { x: 1.1, y: y + 0.08, w: 8.4, h: rowH - 0.16, wrap: true, valign: "middle" });
  });
}

/** Two-column layout */
function twoCol(s, pres, leftFn, rightFn, splitX = 4.8) {
  leftFn(s, pres, splitX - 0.1);
  rightFn(s, pres, splitX + 0.1, 10 - splitX - 0.2);
}

// ── REG CHECK-IN PRESENTATION ────────────────────────────────────────────────

async function buildReg() {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 10×7.5in
  applyMaster(pres);

  // 1 — Title
  titleSlide(pres,
    "Registration Check-In",
    "Volunteer Training Guide — Badge Issuance",
    C.purple
  );

  // 2 — Before You Start
  contentSlide(pres, "Before You Start Each Shift", (s, p) => {
    callout(s, p,
      'Toolbar face = REGGIE (not Connie)   |   NO blue "MERCH MODE" banner on any screen',
      "F0E8F7", C.purple, { y: 1.1, h: 0.7, fontSize: 16, bold: true }
    );
    callout(s, p,
      "If the toolbar shows Connie OR you see a MERCH MODE banner: STOP — tell your lead before doing anything.",
      "FFF5F5", C.red, { y: 1.95, h: 0.7, fontSize: 15 }
    );
    bullets(s, [
      "Extension is in Merchandise mode → manager must fix it on the Options page.",
      "Never try to fix the mode yourself.",
    ], { y: 2.8, fontSize: 15, indent: 1 });
  });

  // 3 — Icon legend
  contentSlide(pres, "What the Toolbar Icon Color Means", (s, p) => {
    chipRow(s, p, [
      { label: "Blue",   desc: "Good — clear to issue badge",       color: C.blue   },
      { label: "Yellow", desc: "Caution — read screen before doing anything", color: C.yellow },
      { label: "Red",    desc: "Stop — send to Help Desk",          color: C.red    },
      { label: "Grey",   desc: "Idle — not on a check-in page yet", color: "777777" },
    ]);
    s.addText("The icon is always in the top-right corner of Chrome, next to the address bar.", {
      x: 0.5, y: 3.0, w: 9, h: 0.5,
      fontSize: 14, color: "666666", align: "center", italic: true,
    });
    s.addShape(p.ShapeType.rect, { x: 0.35, y: 3.55, w: 9.3, h: 0.04, fill: { color: C.border }, line: { color: C.border } });
    s.addText("[SCREENSHOT: four icon states in toolbar]", {
      x: 0.35, y: 3.7, w: 9.3, h: 2.5,
      fontSize: 12, color: "AAAAAA", align: "center", italic: true,
      line: { color: "BBBBBB", pt: 2, dashType: "dash" },
    });
  });

  // 4 — Steps overview
  sectionSlide(pres, "The 5 Steps", C.purple);

  contentSlide(pres, "Steps at a Glance", (s, p) => {
    stepRows(s, p, [
      { title: "Find the attendee",           desc: "Search Neon, click their name. Window opens automatically." },
      { title: "Read the account screen",     desc: "Green = wait. Yellow = read note + tick box. Red = Help Desk." },
      { title: "Pick the attendee from list", desc: "Click Check In →. Rows saying 'Send to Help Desk' are blocked." },
      { title: "Do what the screen asks",     desc: "Age check (Adult/Dealer) or fix missing emergency contact." },
      { title: "Issue the badge",             desc: "Click 'Badge Issued' when BADGE NUMBER appears." },
    ], 1.1);
  });

  // 5 — Account screen detail
  contentSlide(pres, "Step 2 — Reading the Account Screen", (s, p) => {
    [
      { color: C.blue,   label: "Green: Ready for check-in", desc: "Moves forward automatically. Wait." },
      { color: C.yellow, label: "Yellow — Note(s) on account",   desc: "Read every note. Tick the checkbox, then click Proceed to Check-In." },
      { color: C.red,    label: "Red: SEND TO HELP DESK",    desc: "Stop. Send the attendee to the Help Desk without issuing anything." },
    ].forEach((row, i) => {
      const y = 1.15 + i * 1.7;
      s.addShape(p.ShapeType.ellipse, {
        x: 0.35, y: y + 0.2, w: 0.42, h: 0.42,
        fill: { color: row.color }, line: { color: row.color },
      });
      s.addText(row.label, { x: 0.9, y, w: 8.7, h: 0.5, fontSize: 16, bold: true, color: C.ink });
      s.addText(row.desc, { x: 0.9, y: y + 0.5, w: 8.7, h: 0.9, fontSize: 14, color: "333333", wrap: true });
    });
  });

  // 6 — Age verification section
  sectionSlide(pres, "Age Verification\n(Adult & Dealer Badges)", C.blue);

  contentSlide(pres, "Age Verification — Why & When", (s, p) => {
    callout(s, p,
      "Adult and Dealer ticket types require age verification. The screen blocks the badge until you confirm the ID.",
      "F0F7FF", C.blue, { y: 1.05, h: 0.65, fontSize: 15 }
    );
    s.addText("The screen shows:", { x: 0.35, y: 1.85, w: 9.3, h: 0.4, fontSize: 15, bold: true, color: C.ink });
    // Mock screen box
    s.addShape(p.ShapeType.roundRect, {
      x: 0.35, y: 2.3, w: 4.2, h: 1.9,
      fill: { color: "F8F8F8" }, line: { color: "CCCCCC", pt: 2 }, rectRadius: 0.1,
    });
    s.addText([
      { text: "Legal Name\n", options: { bold: false, fontSize: 12, color: "888888" } },
      { text: "Sample, Angela\n\n", options: { bold: true, fontSize: 14, color: C.ink } },
      { text: "ID Required\n", options: { bold: false, fontSize: 12, color: "888888" } },
      { text: "DOB on or before 7/3/2007", options: { bold: true, fontSize: 14, color: C.red } },
    ], { x: 0.6, y: 2.45, w: 3.7, h: 1.6, wrap: true });
    bullets(s, [
      "The cutoff date is calculated automatically.",
      "You only need to check the ID — no math required.",
      "The name shown is the legal name from Neon.",
    ], { x: 4.8, y: 2.3, w: 4.9, fontSize: 14 });
  });

  contentSlide(pres, "Age Verification — Step by Step", (s, p) => {
    stepRows(s, p, [
      { title: "Ask for a government-issued photo ID",  desc: "Driver's license, passport, or state/government ID. Student IDs are not valid." },
      { title: "Confirm the face matches",              desc: "The person in front of you should clearly match the ID photo." },
      { title: "Read the date of birth",                desc: "It must be ON OR BEFORE the date shown on screen." },
      { title: "Return the ID immediately",             desc: "Hand it back before clicking anything. Don't set it on the desk." },
      { title: "Click Age Verified, ID Returned ✓",    desc: "Only after the ID is back in the attendee's hands." },
    ], 1.1);
  });

  contentSlide(pres, "Age Verification — Call Your Lead If:", (s, p) => {
    callout(s, p,
      "⛔  Do NOT click Age Verified in any of these situations — call a manager instead.",
      "FFF5F5", C.red, { y: 1.05, h: 0.65, fontSize: 15, bold: true }
    );
    bullets(s, [
      "The date of birth is AFTER the cutoff date (attendee is under 18).",
      "The face on the ID doesn't clearly match the person in front of you.",
      "The attendee doesn't have a government-issued photo ID.",
      "The legal name on screen doesn't match the name on the ID.",
      "You're unsure about anything on the ID.",
    ], { y: 1.85, fontSize: 16 });
  });

  // 7 — ICE
  contentSlide(pres, "Missing Emergency Contact (ICE)", (s, p) => {
    callout(s, p,
      "⚠  If the emergency contact field is blank, a yellow warning appears. You can fix this at the station.",
      "FFFBF0", C.yellow, { y: 1.05, h: 0.65, fontSize: 15 }
    );
    stepRows(s, p, [
      { title: "Ask the attendee",            desc: "Get their emergency contact's name and phone number." },
      { title: "Click Show me the field ↓",   desc: "The field on the Neon form highlights in yellow behind the check-in window." },
      { title: "Type the information in",     desc: "Fill in the highlighted field on the Neon page." },
      { title: "Click Re-check ↺",            desc: "In the check-in window. If it saved, the warning clears." },
    ], 1.85);
  });

  // 8 — Issuing the badge
  contentSlide(pres, "Step 5 — Issuing the Badge", (s, p) => {
    callout(s, p,
      "BADGE NUMBER and ticket type appear only when ALL issues are resolved. If they're hidden, something still needs fixing.",
      "F0F7FF", C.blue, { y: 1.05, h: 0.65, fontSize: 14 }
    );
    bullets(s, [
      { text: 'Badge Issued', bold: true, color: C.blue },
      { text: "→ Standard check-in. Click to complete.", sub: true },
      { text: "Badge Issued - Send to Merchandise", bold: true, color: C.blue },
      { text: "→ Same as above, but attendee also pre-ordered merch.", sub: true },
      { text: "   After clicking: tell them to visit the Merchandise table.", sub: true },
    ], { y: 1.85, fontSize: 16 });
    callout(s, p,
      "After you click: extension downloads a badge CSV, records pickup in Neon, and resets for the next person.",
      "F0FAF0", C.green, { y: 5.3, h: 0.7, fontSize: 14 }
    );
  });

  // 9 — When to escalate
  contentSlide(pres, "When to Call a Manager / Help Desk", (s, p) => {
    s.addShape(p.ShapeType.roundRect, {
      x: 0.35, y: 1.05, w: 9.3, h: 5.6,
      fill: { color: "FFF5F5" }, line: { color: C.red, pt: 2 }, rectRadius: 0.1,
    });
    bullets(s, [
      "Anything RED, or any Send to Help Desk / NOT ALLOWED message.",
      "A hold — Registration Hold, Art Show Hold, or Operations Hold.",
      "ID date of birth is after the cutoff (attendee under 18).",
      "Face on ID doesn't clearly match the person.",
      "No valid government-issued photo ID.",
      "Badge already issued — ALREADY ISSUED message on screen.",
      "Name mismatch — non-transferable badge, name doesn't match.",
      "Screen says badge file didn't download or contact Registration Head.",
    ], { y: 1.15, x: 0.55, w: 9.0, fontSize: 15 });
    s.addText("When in doubt — don't issue the badge. Ask first.", {
      x: 0.35, y: 6.35, w: 9.3, h: 0.45,
      fontSize: 16, bold: true, color: C.red, align: "center",
    });
  });

  await pres.writeFile({ fileName: path.join(OUT, "reg-checkin.pptx") });
  console.log("✓ reg-checkin.pptx");
}

// ── MERCH CHECK-IN PRESENTATION ──────────────────────────────────────────────

async function buildMerch() {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  applyMaster(pres);

  titleSlide(pres, "Merchandise Pickup", "Volunteer Training Guide — T-Shirts & Souvenir Guides", C.blue);

  contentSlide(pres, "Before You Start Each Shift", (s, p) => {
    // MERCH MODE bar mock
    s.addShape(p.ShapeType.roundRect, {
      x: 1.5, y: 1.1, w: 7, h: 0.6,
      fill: { color: C.blue }, line: { color: C.blue }, rectRadius: 0.06,
    });
    s.addText("MERCH MODE", {
      x: 1.5, y: 1.1, w: 7, h: 0.6,
      fontSize: 17, bold: true, color: C.white, align: "center", valign: "middle",
    });
    s.addText("This blue banner must appear at the top of every screen.", {
      x: 0.5, y: 1.85, w: 9, h: 0.4, fontSize: 14, color: "555555", align: "center",
    });
    callout(s, p,
      "Toolbar face = CONNIE   |   Blue MERCH MODE banner on every screen",
      "F0E8F7", C.purple, { y: 2.35, h: 0.6, fontSize: 15, bold: true }
    );
    callout(s, p,
      "No MERCH MODE banner, or toolbar shows Reggie? STOP — tell your lead. Do not hand out any merchandise.",
      "FFF5F5", C.red, { y: 3.1, h: 0.7, fontSize: 14 }
    );
    callout(s, p,
      "No age checks or holds at this station. You only confirm what was ordered and hand it over.",
      "F0FAF0", C.green, { y: 4.0, h: 0.6, fontSize: 14 }
    );
  });

  contentSlide(pres, "What the Toolbar Icon Color Means", (s, p) => {
    chipRow(s, p, [
      { label: "Green",  desc: "Ready — proceed normally",              color: C.green  },
      { label: "Yellow", desc: "Item not yet picked up — OK to hand out", color: C.yellow },
      { label: "Red",    desc: "Stop — ask your lead",                  color: C.red    },
      { label: "Grey",   desc: "Idle — not on a merch page yet",        color: "777777" },
    ]);
    s.addText("[SCREENSHOT: Connie icon states in toolbar]", {
      x: 0.35, y: 3.5, w: 9.3, h: 2.8,
      fontSize: 12, color: "AAAAAA", align: "center", italic: true,
      line: { color: "BBBBBB", pt: 2, dashType: "dash" },
    });
  });

  sectionSlide(pres, "The 4 Steps", C.blue);

  contentSlide(pres, "Steps at a Glance", (s, p) => {
    stepRows(s, p, [
      { title: "Open the attendee in Neon",     desc: "Find them by name or account number. Open account page, click Connie icon." },
      { title: "Pick the right person",         desc: "List shows what each person ordered. Click Review Merch → on their row." },
      { title: "Check off what you hand over",  desc: "Tick the box for each item you give them now." },
      { title: "Hand over, then confirm",       desc: "Give the items first, then click Confirm Pickup." },
    ], 1.2);
  });

  contentSlide(pres, "Step 3 — The Checkbox Screen", (s, p) => {
    // Left: checkbox mock
    const bx = 0.35;
    [
      { label: "T-Shirt (Unisex L)", checked: false, greyOut: false },
      { label: "Souvenir Guide",     checked: true,  greyOut: true,  sub: "Already picked up: 07/03/2026 14:22" },
    ].forEach((item, i) => {
      const ry = 1.15 + i * 1.5;
      s.addShape(p.ShapeType.roundRect, {
        x: bx, y: ry, w: 4.5, h: item.greyOut ? 1.3 : 0.85,
        fill: { color: item.greyOut ? "F0F0F0" : "FFFBF0" },
        line: { color: item.greyOut ? "CCCCCC" : C.yellow, pt: 2 }, rectRadius: 0.08,
      });
      s.addShape(p.ShapeType.roundRect, {
        x: bx + 0.15, y: ry + 0.18, w: 0.38, h: 0.38,
        fill: { color: item.checked ? "E0F0E0" : C.white },
        line: { color: item.checked ? C.green : "AAAAAA", pt: 2 }, rectRadius: 0.04,
      });
      if (item.checked) {
        s.addText("✓", { x: bx + 0.15, y: ry + 0.18, w: 0.38, h: 0.38, fontSize: 14, bold: true, color: C.green, align: "center", valign: "middle" });
      }
      s.addText(item.label, {
        x: bx + 0.65, y: ry + 0.2, w: 3.6, h: 0.35,
        fontSize: 14, bold: true, color: item.greyOut ? "888888" : C.ink,
      });
      if (item.sub) {
        s.addText(item.sub, { x: bx + 0.65, y: ry + 0.58, w: 3.6, h: 0.35, fontSize: 12, color: "888888" });
      }
    });
    // Confirm button mock
    s.addShape(p.ShapeType.roundRect, {
      x: bx, y: 4.35, w: 4.5, h: 0.6,
      fill: { color: C.green }, line: { color: C.green }, rectRadius: 0.06,
    });
    s.addText("Confirm Pickup", { x: bx, y: 4.35, w: 4.5, h: 0.6, fontSize: 15, bold: true, color: C.white, align: "center", valign: "middle" });

    // Right: callouts
    callout(s, p,
      "Tick the box for each item you hand over right now.",
      "F0FAF0", C.green, { x: 5.1, y: 1.15, w: 4.55, h: 0.7, fontSize: 14 }
    );
    callout(s, p,
      "Greyed-out 'Already picked up' items were collected at an earlier visit. DO NOT hand out a second one.",
      "FFF5F5", C.red, { x: 5.1, y: 2.0, w: 4.55, h: 1.0, fontSize: 14 }
    );
    callout(s, p,
      "Hand over the merch FIRST, then click Confirm Pickup.",
      "F0F7FF", C.blue, { x: 5.1, y: 3.15, w: 4.55, h: 0.7, fontSize: 14 }
    );
  });

  contentSlide(pres, "Already Picked Up — What To Do", (s, p) => {
    callout(s, p,
      "When an item shows Already picked up: [date/time], Neon has a record it was collected. The checkbox is locked.",
      "FFFBF0", C.yellow, { y: 1.05, h: 0.75, fontSize: 14 }
    );
    bullets(s, [
      "If attendee says they never received it:",
      { text: "Do not hand out another item on your own authority.", sub: true },
      { text: "Tell your lead — they can look up the record in Neon.", sub: true },
      { text: "The recording includes the exact date and time.", sub: true },
      "",
      "Never override a locked checkbox.",
      { text: "Handing out a second item without manager approval is against policy.", sub: true },
    ], { y: 1.95, fontSize: 15 });
  });

  contentSlide(pres, "When to Call a Manager / Lead", (s, p) => {
    s.addShape(p.ShapeType.roundRect, {
      x: 0.35, y: 1.05, w: 9.3, h: 5.6,
      fill: { color: "FFF5F5" }, line: { color: C.red, pt: 2 }, rectRadius: 0.1,
    });
    bullets(s, [
      "Toolbar is RED, or MERCH MODE banner is missing.",
      "Attendee says they ordered something not in the list.",
      "'Already picked up' shows but attendee says they never got it.",
      "Screen says 'Attendee merch data not ready' or 'Could not record pickup.'",
      "The person's name isn't in the attendee list at all.",
    ], { y: 1.15, x: 0.55, w: 9.0, fontSize: 16 });
    s.addText("When in doubt — don't hand out the item. Ask first.", {
      x: 0.35, y: 6.35, w: 9.3, h: 0.45,
      fontSize: 16, bold: true, color: C.red, align: "center",
    });
  });

  await pres.writeFile({ fileName: path.join(OUT, "merch-checkin.pptx") });
  console.log("✓ merch-checkin.pptx");
}

// ── MANAGEMENT PRESENTATION ──────────────────────────────────────────────────

async function buildManagement() {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  applyMaster(pres);

  titleSlide(pres, "Management & Help Desk Manual", "Registration leads and Help Desk — CONvergence Check-In Extension", C.purple);

  // Overview
  sectionSlide(pres, "Overview & Setup", C.purple);

  contentSlide(pres, "How the Extension Works", (s, p) => {
    bullets(s, [
      "Chrome extension running inside Neon CRM — no server, no build step.",
      "Reads attendee/registration pages, validates eligibility, writes check-in data back to Neon.",
      "Volunteers never type badge numbers, dates, or times.",
      "",
      "Settings are per-workstation — changes on one machine don't affect others.",
      { text: "Configure each station before the shift starts.", sub: true },
      "",
      "Two flows in one install: Registration mode and Merchandise mode.",
      { text: "Set on the Options page. Each station runs one mode.", sub: true },
    ], { fontSize: 15 });
  });

  contentSlide(pres, "The Options Page", (s, p) => {
    // Left: mock options page
    const ox = 0.35;
    s.addShape(p.ShapeType.roundRect, {
      x: ox, y: 1.05, w: 4.5, h: 5.8,
      fill: { color: C.white }, line: { color: "CCCCCC", pt: 2 }, rectRadius: 0.1,
    });
    s.addText("CONvergence Check-In — Options", {
      x: ox + 0.15, y: 1.15, w: 4.2, h: 0.45,
      fontSize: 13, bold: true, color: C.purple,
    });
    const optItems = [
      { label: "Extension Mode", sub: "Registration (badge) ● Merchandise pickup" },
      { label: "Enable Management Override", sub: "Reveals password field + manager controls" },
      { label: "Behavior (manager only)", sub: "Regular ● Debugging (pre-con walk)" },
      { label: "Pop-up behavior (manager only)", sub: "Automated (modal) ● Manual (click icon)" },
    ];
    optItems.forEach((o, i) => {
      const oy = 1.75 + i * 1.12;
      s.addText(o.label, { x: ox + 0.15, y: oy, w: 4.2, h: 0.38, fontSize: 12, bold: true, color: C.ink });
      s.addText(o.sub, { x: ox + 0.25, y: oy + 0.36, w: 4.0, h: 0.35, fontSize: 11, color: "666666" });
      if (i < optItems.length - 1) {
        s.addShape(p.ShapeType.rect, { x: ox + 0.1, y: oy + 0.78, w: 4.3, h: 0.02, fill: { color: "EEEEEE" }, line: { color: "EEEEEE" } });
      }
    });
    s.addShape(p.ShapeType.roundRect, {
      x: ox + 0.15, y: 6.35, w: 1.4, h: 0.38,
      fill: { color: C.blue }, line: { color: C.blue }, rectRadius: 0.04,
    });
    s.addText("Save Options", { x: ox + 0.15, y: 6.35, w: 1.4, h: 0.38, fontSize: 12, bold: true, color: C.white, align: "center", valign: "middle" });
    // Right: notes
    bullets(s, [
      "Right-click toolbar icon → Options",
      "Settings persist per workstation until changed.",
      "Always click Save Options to apply.",
      "",
      "Config check panel — always visible.",
      { text: "Red = annual-update error. Fix before con.", sub: true, color: C.red },
      { text: "Yellow = warning. Review before con.", sub: true },
      "",
      "Maintenance panel (manager-only):",
      { text: "Tab check, cache reset, storage dump.", sub: true },
    ], { x: 5.1, y: 1.1, w: 4.55, fontSize: 14 });
  });

  // Modes
  sectionSlide(pres, "Modes & Pop-up Behavior", C.purple);

  contentSlide(pres, "Registration Mode vs Merchandise Mode", (s, p) => {
    // Header row
    ["Setting", "Registration", "Merchandise"].forEach((h, i) => {
      s.addShape(p.ShapeType.rect, {
        x: i === 0 ? 0.35 : (i === 1 ? 2.9 : 6.55),
        y: 1.05, w: i === 0 ? 2.5 : 3.6, h: 0.55,
        fill: { color: C.purple }, line: { color: C.purple },
      });
      s.addText(h, {
        x: i === 0 ? 0.35 : (i === 1 ? 2.9 : 6.55),
        y: 1.05, w: i === 0 ? 2.5 : 3.6, h: 0.55,
        fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle",
      });
    });
    const rows = [
      ["Purpose",          "Badge issuance",                  "T-shirts & Guides"],
      ["Toolbar face",     "Reggie",                          "Connie"],
      ["On-screen marker", "—",                               "Blue MERCH MODE banner"],
      ["Validates holds?", "Yes — all checks apply",          "No — ordered items only"],
      ["Guide",            "reg-checkin.html",                "merch-checkin.html"],
    ];
    rows.forEach((row, ri) => {
      const ry = 1.6 + ri * 0.9;
      const bg = ri % 2 === 0 ? "FBFAFC" : C.white;
      [0.35, 2.9, 6.55].forEach((rx, ci) => {
        const w = ci === 0 ? 2.5 : 3.6;
        s.addShape(p.ShapeType.rect, { x: rx, y: ry, w, h: 0.85, fill: { color: bg }, line: { color: C.border, pt: 1 } });
        s.addText(row[ci], { x: rx + 0.1, y: ry, w: w - 0.2, h: 0.85, fontSize: 13, color: C.ink, valign: "middle", wrap: true });
      });
    });
  });

  contentSlide(pres, "Pop-up Behavior: Automated vs Manual", (s, p) => {
    [
      {
        label: "Automated (default — recommended)",
        color: C.blue,
        bullets: [
          "Check-in window opens in the page as a modal, automatically on page load.",
          "Toolbar click re-opens it.",
          "Modal is draggable by its title bar — position is remembered.",
          "Best for a busy check-in line.",
        ],
      },
      {
        label: "Manual",
        color: "888888",
        bullets: [
          "Nothing opens automatically.",
          "Volunteer clicks toolbar icon to open the classic small pop-up window.",
          "Use as a fallback if the in-page modal conflicts with a Neon page.",
        ],
      },
    ].forEach((mode, i) => {
      const my = 1.1 + i * 2.8;
      s.addShape(p.ShapeType.roundRect, {
        x: 0.35, y: my, w: 9.3, h: 2.5,
        fill: { color: "F8F8F8" }, line: { color: mode.color, pt: 2 }, rectRadius: 0.1,
      });
      s.addShape(p.ShapeType.roundRect, {
        x: 0.35, y: my, w: 9.3, h: 0.55,
        fill: { color: mode.color }, line: { color: mode.color }, rectRadius: 0.1,
      });
      s.addText(mode.label, { x: 0.55, y: my + 0.07, w: 9.0, h: 0.42, fontSize: 15, bold: true, color: C.white });
      mode.bullets.forEach((b, bi) => {
        s.addText("• " + b, { x: 0.6, y: my + 0.65 + bi * 0.44, w: 9.0, h: 0.42, fontSize: 13, color: C.ink });
      });
    });
  });

  // Override
  sectionSlide(pres, "Management Override", C.red);

  contentSlide(pres, "Management Override — What It Does", (s, p) => {
    // Override bar mock
    s.addShape(p.ShapeType.rect, { x: 0.35, y: 1.05, w: 9.3, h: 0.55, fill: { color: C.red }, line: { color: C.red } });
    s.addText("MANAGER OVERRIDE ACTIVE", { x: 0.35, y: 1.05, w: 9.3, h: 0.55, fontSize: 16, bold: true, color: C.white, align: "center", valign: "middle" });
    bullets(s, [
      "Red MANAGER OVERRIDE ACTIVE bar on every screen (above).",
      "Toolbar icon carries a purple M badge.",
      "Red attendee rows get ⚠ Override — Check In → button instead of 'Send to Help Desk.'",
      "Full red ⛔ DO NOT ISSUE BADGE detail still shows — override doesn't hide the reason.",
      "",
      "Use override only after personally resolving the underlying issue.",
      "Turn override OFF (uncheck + Save) when stepping away from a Help Desk workstation.",
    ], { y: 1.75, fontSize: 15 });
  });

  contentSlide(pres, "Management Override — Password Rules", (s, p) => {
    callout(s, p,
      "The code stores only a cryptographic hash. The real password is never in the repo or source code.",
      "F7F0FC", C.purple, { y: 1.05, h: 0.65, fontSize: 14 }
    );
    bullets(s, [
      "Share the password VERBALLY or via a password manager only.",
      { text: "Never in email, Slack, GitHub, or any written note.", sub: true, color: C.red },
      "",
      "Rotate annually:",
      { text: "Open tools/generate-password-hash.html locally in Chrome (don't upload to GitHub).", sub: true },
      { text: "Paste the new hash into config.js.", sub: true },
      { text: "See ANNUAL_UPDATE_GUIDE.md for full steps.", sub: true },
      "",
      "Enabling it: Options → check Enable Management Override → enter password → Save Options.",
      { text: "Wrong password = options don't save, error message shown.", sub: true },
    ], { y: 1.85, fontSize: 14 });
  });

  // Conditions
  sectionSlide(pres, "Blocking Conditions", C.red);

  contentSlide(pres, "Red Conditions — Block Check-In", (s, p) => {
    s.addShape(p.ShapeType.rect, { x: 0.35, y: 1.05, w: 9.3, h: 0.45, fill: { color: "FDE8E8" }, line: { color: C.red, pt: 1 } });
    s.addText("Badge number is hidden until ALL red conditions clear AND all required fields are filled.", {
      x: 0.45, y: 1.05, w: 9.1, h: 0.45, fontSize: 12, color: C.red, italic: true, valign: "middle",
    });
    const reds = [
      ["Reg / Art Show / Ops Hold", "Hold on this registration or account.", "Resolve at the respective department."],
      ["Not Paid",                   "Status isn't SUCCEEDED.",               "Send to cashier / Reg Head."],
      ["Already Issued",             "Badge already handed out.",              "Help Desk — possible duplicate."],
      ["Wrong Year / Event",         "Registration isn't for this con.",       "Verify correct event in Neon."],
      ["Name Mismatch",              "Non-transferable, name doesn't match.", "Help Desk."],
    ];
    reds.forEach((row, ri) => {
      const ry = 1.6 + ri * 0.97;
      s.addShape(p.ShapeType.roundRect, { x: 0.35, y: ry, w: 9.3, h: 0.85, fill: { color: "FFF5F5" }, line: { color: "FFCCCC", pt: 1 }, rectRadius: 0.05 });
      s.addShape(p.ShapeType.ellipse, { x: 0.45, y: ry + 0.18, w: 0.42, h: 0.42, fill: { color: C.red }, line: { color: C.red } });
      s.addText(row[0], { x: 1.0, y: ry + 0.06, w: 2.8, h: 0.38, fontSize: 13, bold: true, color: C.ink });
      s.addText(row[1], { x: 3.9, y: ry + 0.06, w: 3.2, h: 0.38, fontSize: 12, color: "333333" });
      s.addText(row[2], { x: 7.2, y: ry + 0.06, w: 2.3, h: 0.38, fontSize: 12, color: C.red });
      s.addText("→ " + row[2], { x: 1.0, y: ry + 0.46, w: 8.4, h: 0.32, fontSize: 12, color: C.red, italic: true });
    });
  });

  contentSlide(pres, "Yellow Conditions — Fixable at the Station", (s, p) => {
    [
      {
        label: "Age Verification",
        desc: "Adult or Dealer ticket — ID hasn't been checked yet.",
        fix: "Volunteer checks photo ID against cutoff date shown on screen, clicks Age Verified, ID Returned ✓.",
      },
      {
        label: "Missing ICE",
        desc: "Emergency contact field is empty.",
        fix: "Volunteer asks attendee, fills field on Neon form, clicks Re-check ↺.",
      },
    ].forEach((c, i) => {
      const cy = 1.1 + i * 2.8;
      s.addShape(p.ShapeType.roundRect, {
        x: 0.35, y: cy, w: 9.3, h: 2.55,
        fill: { color: "FFFBF0" }, line: { color: C.yellow, pt: 2 }, rectRadius: 0.1,
      });
      s.addShape(p.ShapeType.ellipse, { x: 0.5, y: cy + 0.18, w: 0.42, h: 0.42, fill: { color: C.yellow }, line: { color: C.yellow } });
      s.addText(c.label, { x: 1.05, y: cy + 0.1, w: 8.4, h: 0.45, fontSize: 17, bold: true, color: C.ink });
      s.addText(c.desc, { x: 0.55, y: cy + 0.65, w: 9.0, h: 0.5, fontSize: 14, color: "444444" });
      s.addText("Fix: " + c.fix, { x: 0.55, y: cy + 1.2, w: 9.0, h: 1.1, fontSize: 13, color: C.ink, wrap: true });
    });
  });

  // Debug walk
  sectionSlide(pres, "Pre-Con Field Check\n(Debug Walk)", C.purple);

  contentSlide(pres, "Why & When to Run the Debug Walk", (s, p) => {
    callout(s, p,
      "The extension finds Neon custom fields by matching label text. If Neon renames or reorders fields, matching silently breaks.",
      "F0F7FF", C.blue, { y: 1.05, h: 0.75, fontSize: 14 }
    );
    bullets(s, [
      "Run before con and after any Neon form change.",
      { text: "After admins change any attendee-form field label or order.", sub: true },
      { text: "Before the first shift of each con (annual sanity check).", sub: true },
      { text: "After any annual update to config.js fieldLabels.", sub: true },
      "",
      "Report flags any field the extension expects but can't find.",
      { text: "Green report = check-in will resolve every field correctly.", sub: true, color: C.green },
      { text: "Red NOT FOUND items = config.js labels need updating.", sub: true, color: C.red },
    ], { y: 1.95, fontSize: 15 });
  });

  contentSlide(pres, "Running the Debug Walk", (s, p) => {
    stepRows(s, p, [
      { title: "Options → enable Management Override",       desc: "Enter password and save." },
      { title: "Set Behavior to Debugging",                  desc: "Options page → Debugging (pre-con field check walk). Save." },
      { title: "Open any real Neon attendee page",           desc: "Click the toolbar icon. Extension walks Account → Registration → Attendee automatically." },
      { title: "Review the report tab",                      desc: "No red NOT FOUND items = all good. Red items = update config.js labels." },
      { title: "Set Behavior back to Regular",               desc: "⛔ Do this immediately. Leaving it on Debugging means every toolbar click triggers a walk instead of a check-in." },
    ], 1.1);
  });

  // Maintenance
  sectionSlide(pres, "Maintenance & Escalation", C.purple);

  contentSlide(pres, "Maintenance Tools (Options Page)", (s, p) => {
    [
      { label: "Check Neon tab(s)",          desc: "Confirms extension scripts loaded on open Neon tabs. First step when nothing happens." },
      { label: "Clear cached scrape data",   desc: "Wipes cached page reads without touching settings. Use when page shows stale data; reload Neon tab after." },
      { label: "Storage contents",           desc: "Raw dump of local storage. Share with IT when diagnosing." },
      { label: "Config check panel",         desc: "Always visible. Red = must fix before con. Yellow = review." },
    ].forEach((tool, i) => {
      const ty = 1.1 + i * 1.45;
      s.addShape(p.ShapeType.roundRect, {
        x: 0.35, y: ty, w: 9.3, h: 1.3,
        fill: { color: "F9F8FC" }, line: { color: C.border, pt: 1 }, rectRadius: 0.08,
      });
      s.addText(tool.label, { x: 0.55, y: ty + 0.1, w: 9.0, h: 0.45, fontSize: 15, bold: true, color: C.purple });
      s.addText(tool.desc, { x: 0.55, y: ty + 0.6, w: 9.0, h: 0.55, fontSize: 13, color: "333333", wrap: true });
    });
  });

  contentSlide(pres, "When to Call IT", (s, p) => {
    callout(s, p,
      "Point IT to DEVELOPER.MD and TROUBLESHOOTING.md",
      "F7F0FC", C.purple, { y: 1.05, h: 0.5, fontSize: 14 }
    );
    bullets(s, [
      "Config check or Debug Walk reports errors you can't resolve by re-running.",
      "A condition fires that doesn't match reality",
      { text: "e.g. everyone shows 'Unknown ticket' → Neon field/ticket names probably changed.", sub: true },
      "Badge CSV won't download on a correctly-set-up station.",
      "Extension doesn't load or scripts don't respond after reloads.",
      "",
      "Annual update (event names, ticket names, merch catalog, password):",
      { text: "All in config.js — full checklist in ANNUAL_UPDATE_GUIDE.md.", sub: true },
      { text: "Don't edit other files unless IT says to.", sub: true },
    ], { y: 1.7, fontSize: 15 });
  });

  await pres.writeFile({ fileName: path.join(OUT, "management.pptx") });
  console.log("✓ management.pptx");
}

// ── Run ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await Promise.all([buildReg(), buildMerch(), buildManagement()]);
    console.log("\nAll done → TRAINING/*.pptx");
    console.log("Upload to Google Drive — it auto-converts to Google Slides.");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
})();
