// js/modal-drag.js
// ============================================================================
// Shared drag behavior for the in-page modals (#cvg-checkin-modal).
//
// Loaded by the manifest BEFORE js/checkin-modal.js (eventReg page) and
// js/attendee-modal.js (attendee page). Exposes makeDraggable() as a plain
// content-script global. No import/export.
//
// The modal is re-rendered from scratch on every Re-check / toolbar re-open,
// so the DOM node is recreated each time. We remember the last position and
// reapply it after each render so the modal doesn't jump back to its CSS
// default corner. The position is held in a module-level variable (fast path
// for same-page re-renders) AND persisted to chrome.storage.local under
// STORAGE_KEY.MODAL_POS so it survives page navigations — the modal reappears
// wherever the user last dragged it, on every page.
// ============================================================================

// Last position the user dragged a modal to (shared across all modals, which
// use the same #cvg-checkin-modal id and are never on screen at once).
let cvgModalDragPos = null;

function makeDraggable(modalEl, handleEl) {
  if (!modalEl || !handleEl) return;

  handleEl.style.cursor = "move";

  // Reapply the remembered position after a re-render. In-memory wins (instant,
  // no flicker); otherwise load the persisted position from storage and apply
  // it once it arrives (clamped to the current viewport in case the saved spot
  // is off-screen on a smaller display).
  if (cvgModalDragPos) {
    applyModalPosClamped(modalEl, cvgModalDragPos.left, cvgModalDragPos.top);
  } else {
    chrome.storage.local.get(STORAGE_KEY.MODAL_POS, (res) => {
      const pos = res?.[STORAGE_KEY.MODAL_POS];
      if (pos && cvgModalDragPos === null && modalEl.isConnected) {
        cvgModalDragPos = { left: pos.left, top: pos.top };
        applyModalPosClamped(modalEl, pos.left, pos.top);
      }
    });
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
    // Persist so the modal reopens here on the next page / navigation.
    if (cvgModalDragPos) {
      chrome.storage.local.set({ [STORAGE_KEY.MODAL_POS]: cvgModalDragPos });
    }
  }
}

function applyModalPos(modalEl, left, top) {
  modalEl.style.left   = `${left}px`;
  modalEl.style.top    = `${top}px`;
  modalEl.style.right  = "auto";
  modalEl.style.bottom = "auto";
}

// Like applyModalPos but keeps the modal on screen (the saved spot may be
// off-screen if the window shrank since it was stored).
function applyModalPosClamped(modalEl, left, top) {
  const rect    = modalEl.getBoundingClientRect();
  const maxLeft = Math.max(0, window.innerWidth  - rect.width);
  const maxTop  = Math.max(0, window.innerHeight - rect.height);
  applyModalPos(modalEl, clamp(left, 0, maxLeft), clamp(top, 0, maxTop));
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
