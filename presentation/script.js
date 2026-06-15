/**
 * Leaslide — Integrated & Optimised script.js
 * Fully adapted for iPad touch gestures, Canvas Zoom, and Presentation Mode
 */

// --- 1. Ribbon UI Tab Router (Safe Event Setup) ---
window.openTab = function(evt, tabName) {
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".tab-link").forEach(l => l.classList.remove("active"));
    const t = document.getElementById(tabName);
    if (t) t.classList.add("active");
    if (evt?.currentTarget) evt.currentTarget.classList.add("active");
};

// --- Application State ---
let slides = [{ html: "", bg: "", bgStyle: "", transition: "none", undoStack: [], redoStack: [] }];
let currentSlideIndex = 0;
let selectedElement = null;
let maxZIndex = 100;
let currentZoom = 1.0;
let snapEnabled = true;
let isDrawing = false;
let drawMode = null; 
let autoAdvanceTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const container = document.getElementById('canvas-container');
    const floatingMenu = document.getElementById('floating-menu');

    // ── 2. History Management (Undo / Redo) ──
    function saveState() {
        if (!canvas) return;
        const slide = slides[currentSlideIndex];
        const cur = canvas.innerHTML;
        if (slide.undoStack.length > 0 && slide.undoStack.at(-1) === cur) return;
        slide.undoStack.push(cur);
        slide.redoStack = []; 
        updateUndoRedoUI();
    }

    function updateUndoRedoUI() {
        const uBtn = document.getElementById('undo-btn');
        const rBtn = document.getElementById('redo-btn');
        if (uBtn) uBtn.disabled = slides[currentSlideIndex].undoStack.length === 0;
        if (rBtn) rBtn.disabled = slides[currentSlideIndex].redoStack.length === 0;
    }

    document.getElementById('undo-btn')?.addEventListener('click', () => {
        const s = slides[currentSlideIndex];
        if (s.undoStack.length === 0) return;
        s.redoStack.push(canvas.innerHTML);
        canvas.innerHTML = s.undoStack.pop();
        reattachEvents();
        updateUndoRedoUI();
    });

    document.getElementById('redo-btn')?.addEventListener('click', () => {
        const s = slides[currentSlideIndex];
        if (s.redoStack.length === 0) return;
        s.undoStack.push(canvas.innerHTML);
        canvas.innerHTML = s.redoStack.pop();
        reattachEvents();
        updateUndoRedoUI();
    });

    // ── 3. Zoom Mechanics (Buttons & Pinch/Wheel) ──
    function applyZoom() {
        if (canvas) {
            canvas.style.transform = `scale(${currentZoom})`;
            canvas.style.transformOrigin = 'center center';
        }
        const zoomVal = document.getElementById('zoom-val');
        if (zoomVal) zoomVal.textContent = `${Math.round(currentZoom * 100)}%`;
    }

    document.getElementById('zoom-in')?.addEventListener('click', () => {
        currentZoom = Math.min(2.5, currentZoom + 0.1);
        applyZoom();
    });

    document.getElementById('zoom-out')?.addEventListener('click', () => {
        currentZoom = Math.max(0.3, currentZoom - 0.1);
        applyZoom();
    });

    document.getElementById('zoom-reset')?.addEventListener('click', () => {
        currentZoom = 1.0;
        applyZoom();
    });

    // ✨ Canvas Trackpad Pinch & Ctrl+Wheel Zoom Integration
    container?.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const factor = 0.05;
            if (e.deltaY < 0) {
                currentZoom = Math.min(2.5, currentZoom + factor);
            } else {
                currentZoom = Math.max(0.3, currentZoom - factor);
            }
            applyZoom();
        }
    }, { passive: false });

    // ── 4. Element Creation Engine ──
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el = document.createElement('div');
        el.className = `canvas-element ${typeClass}`;
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        el.style.left = '100px';
        el.style.top = '100px';
        el.style.zIndex = maxZIndex++;
        el.setAttribute('data-animation', 'none');
        el.style.touchAction = 'none'; // Lock Safari default zooming gestures

        ['nw', 'ne', 'sw', 'se'].forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${dir}`;
            handle.dataset.direction = dir;
            el.appendChild(handle);
        });

        canvas.appendChild(el);
        initElementEvents(el);
        selectElement(el);
        return el;
    }

    document.getElementById('add-text-btn')?.addEventListener('click', () => {
        const el = createBaseElement('text-element', 300, 60);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.contentEditable = true;
        inner.style.fontSize = "32px";
        inner.style.color = "#0f172a";
        inner.innerText = "Type text here"; // English UI String
        el.appendChild(inner);
        inner.addEventListener('blur', () => saveState());
    });

    document.getElementById('add-rect-btn')?.addEventListener('click', () => {
        const el = createBaseElement('rect-element', 150, 150);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.style.backgroundColor = "#2563eb";
        el.appendChild(inner);
    });

    // ── 5. Pointer Gesture Engine (iPad Drag & Resize Fixes) ──
    function initElementEvents(el) {
        let isDrag = false, isRes = false;
        let sx, sy, ox, oy, sw, sh, dir;

        el.addEventListener('pointerdown', (e) => {
            if (e.target.classList.contains('resize-handle')) return;
            if (el.classList.contains('text-element') && e.target.classList.contains('content-wrapper') && selectedElement === el) return;

            isDrag = true;
            saveState();
            el.setPointerCapture(e.pointerId); // ✨ Essential iPad Touch Tracking Fix
            
            sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;
            selectElement(el);
            e.stopPropagation();
        });

        el.querySelectorAll('.resize-handle').forEach(h => {
            h.addEventListener('pointerdown', (e) => {
                isRes = true;
                saveState();
                h.setPointerCapture(e.pointerId); // ✨ Secure Handle Capture for Touch
                dir = h.dataset.direction;
                sx = e.clientX; sy = e.clientY;
                sw = el.offsetWidth; sh = el.offsetHeight;
                ox = el.offsetLeft; oy = el.offsetTop;
                e.stopPropagation();
                e.preventDefault();
            });
        });

        document.addEventListener('pointermove', (e) => {
            if (isDrag && selectedElement === el) {
                // Adjust movement steps depending on Zoom level
                const dx = (e.clientX - sx) / currentZoom;
                const dy = (e.clientY - sy) / currentZoom;
                el.style.left = (ox + dx) + 'px';
                el.style.top = (oy + dy) + 'px';
                updateFloatingMenuPosition();
            }
            if (isRes && selectedElement === el) {
                const dx = (e.clientX - sx) / currentZoom;
                const dy = (e.clientY - sy) / currentZoom;
                if (dir === 'se') {
                    el.style.width = Math.max(30, sw + dx) + 'px';
                    el.style.height = Math.max(30, sh + dy) + 'px';
                } else if (dir === 'sw') {
                    const nw = Math.max(30, sw - dx);
                    if (nw > 30) { el.style.left = (ox + dx) + 'px'; el.style.width = nw + 'px'; }
                    el.style.height = Math.max(30, sh + dy) + 'px';
                } else if (dir === 'ne') {
                    el.style.width = Math.max(30, sw + dx) + 'px';
                    const nh = Math.max(30, sh - dy);
                    if (nh > 30) { el.style.top = (oy + dy) + 'px'; el.style.height = nh + 'px'; }
                } else if (dir === 'nw') {
                    const nw = Math.max(30, sw - dx);
                    const nh = Math.max(30, sh - dy);
                    if (nw > 30) { el.style.left = (ox + dx) + 'px'; el.style.width = nw + 'px'; }
                    if (nh > 30) { el.style.top = (oy + dy) + 'px'; el.style.height = nh + 'px'; }
                }
                updateFloatingMenuPosition();
            }
        });

        document.addEventListener('pointerup', (e) => {
            if (isDrag) { el.releasePointerCapture(e.pointerId); isDrag = false; }
            if (isRes) { isRes = false; }
        });
    }

    // ── 6. Selection Logic ──
    function selectElement(el) {
        if (!el) return;
        if (selectedElement && selectedElement !== el) selectedElement.classList.remove('selected');
        selectedElement = el;
        el.classList.add('selected');
        updateFloatingMenuPosition();
    }

    function deselect() {
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement = null;
        floatingMenu?.classList.add('hidden');
    }

    canvas?.addEventListener('pointerdown', (e) => {
        if (e.target === canvas) deselect();
    });

    function updateFloatingMenuPosition() {
        if (!floatingMenu || !selectedElement) { floatingMenu?.classList.add('hidden'); return; }
        floatingMenu.classList.remove('hidden');
        floatingMenu.style.top = (selectedElement.offsetTop - 45) + 'px';
        floatingMenu.style.left = selectedElement.offsetLeft + 'px';
    }

    // ── 7. Slides Presentation Engine (iPad Safari Fallback) ──
    function startPresent() {
        const area = document.querySelector(".canvas-area");
        if (area?.requestFullscreen) {
            area.requestFullscreen();
        } else if (area?.webkitRequestFullscreen) {
            area.webkitRequestFullscreen(); // iOS Safari Engine
        } else {
            // ✨ Pseudo-Fullscreen Fallback Class for strict iPad environments
            area?.classList.add("pseudo-fullscreen");
            triggerPresentationUI(true);
        }
    }

    function triggerPresentationUI(isEntering) {
        const ctrl = document.getElementById('presenter-controls');
        if (!ctrl) return;
        ctrl.classList.toggle('hidden', !isEntering);
        if (isEntering) {
            deselect();
            document.getElementById('slide-number').textContent = `${currentSlideIndex + 1} / ${slides.length}`;
            playSlideAnimations();
        } else {
            clearInterval(autoAdvanceTimer);
            const area = document.querySelector(".canvas-area");
            area?.classList.remove("pseudo-fullscreen");
        }
    }

    document.addEventListener('fullscreenchange', () => triggerPresentationUI(!!document.fullscreenElement));
    document.addEventListener('webkitfullscreenchange', () => triggerPresentationUI(!!document.webkitFullscreenElement));

    document.getElementById('present-btn')?.addEventListener('click', startPresent);
    document.getElementById('exit-present-btn')?.addEventListener('click', () => {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else triggerPresentationUI(false);
    });

    function playSlideAnimations() {
        if (!canvas) return;
        Array.from(canvas.children).forEach(el => {
            el.classList.remove('play-anim');
            void el.offsetWidth;
            el.classList.add('play-anim');
        });
    }

    function switchSlide(idx) {
        if (!canvas || idx < 0 || idx >= slides.length) return;
        slides[currentSlideIndex].html = canvas.innerHTML;
        
        currentSlideIndex = idx;
        canvas.innerHTML = slides[idx].html;
        reattachEvents();
        
        const sn = document.getElementById('slide-number');
        if (sn) sn.textContent = `${currentSlideIndex + 1} / ${slides.length}`;
        renderSlidesThumbnails();
    }

    document.getElementById('next-slide')?.addEventListener('click', () => switchSlide(currentSlideIndex + 1));
    document.getElementById('prev-slide')?.addEventListener('click', () => switchSlide(currentSlideIndex - 1));

    document.getElementById('add-slide-btn')?.addEventListener('click', () => {
        slides.push({ html: "", bg: "", bgStyle: "", transition: "none", undoStack: [], redoStack: [] });
        switchSlide(slides.length - 1);
    });

    function renderSlidesThumbnails() {
        const list = document.getElementById('slide-list');
        if (!list) return;
        list.innerHTML = "";
        slides.forEach((s, i) => {
            const thumb = document.createElement('div');
            thumb.className = `slide-thumb ${i === currentSlideIndex ? 'active' : ''}`;
            thumb.addEventListener('click', () => switchSlide(i));
            list.appendChild(thumb);
        });
    }

    function reattachEvents() {
        if (!canvas) return;
        Array.from(canvas.children).forEach(el => {
            if (el.id !== 'floating-menu') initElementEvents(el);
        });
        deselect();
    }

    // ── 8. Global Keyboard Control Core ──
    window.addEventListener('keydown', (e) => {
        if (document.activeElement.contentEditable === 'true') return;

        if ((document.fullscreenElement || document.webkitFullscreenElement || document.querySelector('.pseudo-fullscreen'))) {
            if (e.key === 'ArrowRight' || e.key === ' ') switchSlide(currentSlideIndex + 1);
            if (e.key === 'ArrowLeft') switchSlide(currentSlideIndex - 1);
            if (e.key === 'Escape') document.getElementById('exit-present-btn')?.click();
        }
    });

    // Initialize module interfaces
    renderSlidesThumbnails();
    updateUndoRedoUI();
    applyZoom();
});
