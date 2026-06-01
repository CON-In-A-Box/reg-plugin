// js/modal-drag.js
// ============================================================================
// Shared drag behavior for the in-page modals (#cvg-checkin-modal).
//
// Loaded by the manifest BEFORE js/checkin-modal.js (eventReg page) and
// js/attendee-modal.js (attendee page). Exposes makeDraggable() as a plain
// content-script global. No import/export.
//
// The modal is re-rendered from scratch on every Re-check / toolbar re-open,
// so the DOM node is recreated each time. We remember the last position in a
// module-level variable and reapply it after each render so the modal doesn't
// jump back to its CSS default corner.
// ============================================================================

// Last position the user dragged a modal to (shared across both modals, which
// use the same #cvg-checkin-modal id and are never on screen at once).
let cvgModalDragPos = null;

function makeDraggable(modalEl, handleEl) {
  if (!modalEl || !handleEl) return;

  handleEl.style.cursor = "move";

  // Reapply the remembered position after a re-render.
  if (cvgModalDragPos) {
    applyModalPos(modalEl, cvgModalDragPos.left, cvgModalDragPos.top);
  }

  let dragging = false;
  let startX = 0, startY = 0;        // pointer position at mousedown
  let startLeft = 0, startTop = 0;   // modal position at mousedown

  handleEl.addEventListener("mousedown", (e) => {
    // Ignore drags that start on the ✕ (or any button) in the header.
    if (e.target.closest("button")) return;
    e.preventDefault();

    const rect = modalEl.getBoundingClientRect();
    // Switch from the CSS right/top anchor to explicit left/top so the modal
    // tracks the pointer regardless of which corner it was anchored to.
    applyModalPos(modalEl, rect.left, rect.top);

    dragging  = true;
    startX    = e.clientX;
    startY    = e.clientY;
    startLeft = rect.left;
    startTop  = rect.top;

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  function onMove(e) {
    if (!dragging) return;
    const rect = modalEl.getBoundingClientRect();
    // Clamp so at least part of the modal stays on screen.
    const maxLeft = window.innerWidth  - rect.width;
    const maxTop  = window.innerHeight - rect.height;
    const left = clamp(startLeft + (e.clientX - startX), 0, Math.max(0, maxLeft));
    const top  = clamp(startTop  + (e.clientY - startY), 0, Math.max(0, maxTop));
    applyModalPos(modalEl, left, top);
    cvgModalDragPos = { left, top };
  }

  function onUp() {
    dragging = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }
}

function applyModalPos(modalEl, left, top) {
  modalEl.style.left   = `${left}px`;
  modalEl.style.top    = `${top}px`;
  modalEl.style.right  = "auto";
  modalEl.style.bottom = "auto";
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
