/**
 * Leaslide — Complete Integrated & Optimized Core Script
 * Fully supports iPad Touch Gestures, Canvas Pinch/Wheel Zoom, Presenter Fallback,
 * Drawing Engine, Advanced Shapes, Alignment, and Property Syncing.
 */

// --- 1. Ribbon UI Tab Router ---
window.openTab = function(evt, tabName) {
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".tab-link").forEach(l => l.classList.remove("active"));
    const t = document.getElementById(tabName);
    if (t) t.classList.add("active");
    if (evt?.currentTarget) evt.currentTarget.classList.add("active");
};

// --- Application Core State ---
let slides = [{ html: "", bg: "#ffffff", bgStyle: "color", transition: "none", undoStack: [], redoStack: [] }];
let currentSlideIndex = 0;
let selectedElement = null;
let maxZIndex = 100;
let minZIndex = 10;
let currentZoom = 1.0;
let snapEnabled = true;
let isDrawing = false;
let drawMode = null; // 'pen' | 'eraser' | null
let autoAdvanceTimer = null;

// Drawing Path Tracker
let pathData = "";
let currentPath = null;
let currentSvg = null;

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const container = document.getElementById('canvas-container');
    const floatingMenu = document.getElementById('floating-menu');
    const imageUpload = document.getElementById('image-upload');
    const pdfFileInput = document.getElementById('pdf-file-input');

    // Utility to bind click events safely
    const bindClick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

    // ── 2. History Engine (Undo / Redo) ──
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
        const s = slides[currentSlideIndex];
        const uBtn = document.getElementById('undo-btn');
        const rBtn = document.getElementById('redo-btn');
        if (uBtn) uBtn.disabled = s.undoStack.length === 0;
        if (rBtn) rBtn.disabled = s.redoStack.length === 0;
    }

    bindClick('undo-btn', () => {
        const s = slides[currentSlideIndex];
        if (s.undoStack.length === 0) return;
        s.redoStack.push(canvas.innerHTML);
        canvas.innerHTML = s.undoStack.pop();
        reattachEvents();
        updateUndoRedoUI();
    });

    bindClick('redo-btn', () => {
        const s = slides[currentSlideIndex];
        if (s.redoStack.length === 0) return;
        s.undoStack.push(canvas.innerHTML);
        canvas.innerHTML = s.redoStack.pop();
        reattachEvents();
        updateUndoRedoUI();
    });

    // ── 3. Zoom Mechanics (Buttons, Trackpad Pinch, Ctrl+Wheel) ──
    function applyZoom() {
        if (canvas) {
            canvas.style.transform = `scale(${currentZoom})`;
            canvas.style.transformOrigin = 'center center';
        }
        const zoomVal = document.getElementById('zoom-val');
        if (zoomVal) zoomVal.textContent = `${Math.round(currentZoom * 100)}%`;
    }

    bindClick('zoom-in', () => { currentZoom = Math.min(2.5, currentZoom + 0.1); applyZoom(); });
    bindClick('zoom-out', () => { currentZoom = Math.max(0.3, currentZoom - 0.1); applyZoom(); });
    bindClick('zoom-reset', () => { currentZoom = 1.0; applyZoom(); });

    container?.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const factor = 0.05;
            currentZoom = e.deltaY < 0 ? Math.min(2.5, currentZoom + factor) : Math.max(0.3, currentZoom - factor);
            applyZoom();
        }
    }, { passive: false });

    // ── 4. Drawing Engine (iPad SVG Freehand & Eraser) ──
    function initDrawingListeners() {
        if (!canvas) return;

        canvas.addEventListener('pointerdown', (e) => {
            if (!drawMode) return;
            if (drawMode === 'pen') {
                isDrawing = true;
                saveState();
                canvas.setPointerCapture(e.pointerId);

                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.className = "canvas-element drawing-element";
                Object.assign(svg.style, {
                    position: "absolute", left: "0", top: "0", width: "100%", height: "100%",
                    pointerEvents: "none", zIndex: maxZIndex++, touchAction: "none"
                });

                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                const color = document.getElementById('pen-color')?.value || "#dc2626";
                const width = document.getElementById('pen-width')?.value || "4";
                path.setAttribute("stroke", color);
                path.setAttribute("stroke-width", width);
                path.setAttribute("fill", "none");
                path.setAttribute("stroke-linecap", "round");
                path.setAttribute("stroke-linejoin", "round");

                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) / currentZoom;
                const y = (e.clientY - rect.top) / currentZoom;
                pathData = `M ${x} ${y}`;
                path.setAttribute("d", pathData);

                svg.appendChild(path);
                canvas.appendChild(svg);
                currentPath = path;
                currentSvg = svg;
                e.stopPropagation();
            } else if (drawMode === 'eraser') {
                isDrawing = true;
                canvas.setPointerCapture(e.pointerId);
                eraseAtPoint(e);
                e.stopPropagation();
            }
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!isDrawing) return;
            if (drawMode === 'pen' && currentPath) {
                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) / currentZoom;
                const y = (e.clientY - rect.top) / currentZoom;
                pathData += ` L ${x} ${y}`;
                currentPath.setAttribute("d", pathData);
            } else if (drawMode === 'eraser') {
                eraseAtPoint(e);
            }
        });

        canvas.addEventListener('pointerup', (e) => {
            if (isDrawing) {
                canvas.releasePointerCapture(e.pointerId);
                isDrawing = false;
                currentPath = null;
                currentSvg = null;
            }
        });
    }

    function eraseAtPoint(e) {
        const hits = document.elementsFromPoint(e.clientX, e.clientY);
        hits.forEach(el => {
            const drawingSvg = el.closest('.drawing-element');
            if (drawingSvg && canvas.contains(drawingSvg)) {
                saveState();
                canvas.removeChild(drawingSvg);
            }
        });
    }

    // Toggle Draw Modes
    const toggleDrawMode = (mode, btnId) => {
        drawMode = drawMode === mode ? null : mode;
        document.querySelectorAll('#tab-draw button').forEach(b => b.classList.remove('active-toggle'));
        if (drawMode) {
            document.getElementById(btnId)?.classList.add('active-toggle');
            deselect();
        }
    };

    bindClick('pen-btn', () => toggleDrawMode('pen', 'pen-btn'));
    bindClick('eraser-btn', () => toggleDrawMode('eraser', 'eraser-btn'));
    bindClick('draw-select-btn', () => {
        drawMode = null;
        document.querySelectorAll('#tab-draw button').forEach(b => b.classList.remove('active-toggle'));
    });

    // ── 5. Element Creation Factory (Shapes, Text, Images) ──
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el = document.createElement('div');
        el.className = `canvas-element ${typeClass}`;
        Object.assign(el.style, {
            width: w + 'px', height: h + 'px', left: '100px', top: '100px',
            zIndex: maxZIndex++, touchAction: 'none'
        });
        el.setAttribute('data-animation', 'none');
        el.setAttribute('data-anim-delay', '0');

        ['nw', 'ne', 'sw', 'se'].forEach(dir => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${dir}`;
            handle.dataset.direction = dir;
            el.appendChild(handle);
        });

        if (canvas) canvas.appendChild(el);
        initElementEvents(el);
        selectElement(el);
        return el;
    }

    // Text Element Insert
    bindClick('add-text-btn', () => {
        const el = createBaseElement('text-element', 360, 80);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.contentEditable = true;
        Object.assign(inner.style, {
            fontSize: "32px", color: "#0f172a", fontFamily: "'Noto Sans JP', sans-serif", textAlign: "left"
        });
        inner.innerText = "Type text here";
        el.appendChild(inner);
        inner.onblur = saveState;
    });

    // Rectangle Shape Insert
    bindClick('add-rect-btn', () => {
        const el = createBaseElement('rect-element', 160, 120);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.style.backgroundColor = "#2563eb";
        inner.style.borderRadius = "4px";
        el.appendChild(inner);
    });

    // Circle Shape Insert
    bindClick('add-circle-btn', () => {
        const el = createBaseElement('rect-element circle-element', 120, 120);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.style.backgroundColor = "#7c3aed";
        inner.style.borderRadius = "50%";
        el.appendChild(inner);
    });

    // Line Shape Insert
    bindClick('add-line-btn', () => {
        const el = createBaseElement('rect-element line-element', 200, 4);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.style.backgroundColor = "#0f172a";
        el.appendChild(inner);
    });

    // Arrow SVG Insert
    bindClick('insert-arrow-btn', () => {
        const el = createBaseElement('rect-element', 160, 40);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.style.display = 'flex';
        inner.style.alignItems = 'center';
        inner.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 160 40" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path d="M4 20h140M130 8l16 12-16 12" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        el.appendChild(inner);
    });

    // Star SVG Insert
    bindClick('insert-star-btn', () => {
        const el = createBaseElement('rect-element', 120, 120);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M60 8l13.5 27.6 30.5 4.4-22 21.4 5.2 30.4L60 77l-27.2 14.8 5.2-30.4L16 39.9l30.5-4.4z" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/></svg>`;
        el.appendChild(inner);
    });

    // Image Upload Pipeline
    if (imageUpload) {
        bindClick('add-image-btn', () => imageUpload.click());
        imageUpload.onchange = (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const el = createBaseElement('image-element', 300, 200);
                const img = document.createElement('img');
                img.className = 'content-wrapper';
                img.src = ev.target.result;
                el.appendChild(img);
                selectElement(el);
            };
            reader.readAsDataURL(file);
            imageUpload.value = '';
        };
    }

    // ── 6. Pointer Gesture System (iPad Touch Stickiness Fixes) ──
    function initElementEvents(el) {
        if (el.classList.contains('drawing-element')) return;
        let isDrag = false, isRes = false;
        let sx, sy, ox, oy, sw, sh, dir;

        el.addEventListener('pointerdown', (e) => {
            if (drawMode) return; // Prevent selection/drag during drawing
            if (e.target.classList.contains('resize-handle')) return;
            if (el.classList.contains('text-element') && e.target.classList.contains('content-wrapper') && selectedElement === el) return;
            
            isDrag = true; 
            saveState();
            el.setPointerCapture(e.pointerId); // Force capture on iPad touch release boundaries
            
            sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;
            selectElement(el);
            e.stopPropagation();
        });

        el.querySelectorAll('.resize-handle').forEach(h => {
            h.addEventListener('pointerdown', (e) => {
                isRes = true; 
                saveState();
                h.setPointerCapture(e.pointerId); // Bind resizer pointer specifically
                dir = h.dataset.direction;
                sx = e.clientX; sy = e.clientY;
                sw = el.offsetWidth; sh = el.offsetHeight;
                ox = el.offsetLeft; oy = el.offsetTop;
                e.stopPropagation(); 
                e.preventDefault();
            });
        });

        document.addEventListener('pointermove', (e) => {
            if (!selectedElement || selectedElement !== el) return;
            const dx = (e.clientX - sx) / currentZoom;
            const dy = (e.clientY - sy) / currentZoom;

            if (isDrag) {
                let nx = ox + dx, ny = oy + dy;
                if (snapEnabled) { nx = Math.round(nx / 10) * 10; ny = Math.round(ny / 10) * 10; }
                el.style.left = nx + 'px'; 
                el.style.top = ny + 'px';
                updateFloatingMenuPosition(); 
                updatePropsPosition();
            }
            if (isRes) {
                const min = 20;
                if (dir === 'se') {
                    el.style.width  = Math.max(min, sw + dx) + 'px';
                    el.style.height = Math.max(min, sh + dy) + 'px';
                } else if (dir === 'sw') {
                    const nw = Math.max(min, sw - dx);
                    if (nw > min) { el.style.left = (ox + dx) + 'px'; el.style.width = nw + 'px'; }
                    el.style.height = Math.max(min, sh + dy) + 'px';
                } else if (dir === 'ne') {
                    el.style.width = Math.max(min, sw + dx) + 'px';
                    const nh = Math.max(min, sh - dy);
                    if (nh > min) { el.style.top = (oy + dy) + 'px'; el.style.height = nh + 'px'; }
                } else if (dir === 'nw') {
                    const nw = Math.max(min, sw - dx), nh = Math.max(min, sh - dy);
                    if (nw > min) { el.style.left = (ox + dx) + 'px'; el.style.width = nw + 'px'; }
                    if (nh > min) { el.style.top  = (oy + dy) + 'px'; el.style.height = nh + 'px'; }
                }
                updateFloatingMenuPosition(); 
                updatePropsSize();
            }
        });

        document.addEventListener('pointerup', (e) => {
            if (isDrag) { el.releasePointerCapture(e.pointerId); isDrag = false; }
            if (isRes) { isRes = false; }
        });
    }

    // ── 7. Selection Control & UI State Synchronizer ──
    function selectElement(el) {
        if (!el) return;
        if (selectedElement && selectedElement !== el) selectedElement.classList.remove('selected');
        selectedElement = el;
        el.classList.add('selected');

        const inner = el.querySelector('.content-wrapper');
        const style = inner ? window.getComputedStyle(inner) : null;
        const anim = el.getAttribute('data-animation') || 'none';
        const delay = el.getAttribute('data-anim-delay') || '0';

        // Synchronize Animation Pane Tab Linkage
        document.querySelectorAll('.anim-set-btn').forEach(b => b.classList.toggle('active', b.dataset.anim === anim));
        const fa = document.getElementById('float-anim-select'); if (fa) fa.value = anim;
        const ad = document.getElementById('anim-delay'); if (ad) ad.value = delay;

        const isText = el.classList.contains('text-element');
        const textSection = document.querySelector('.text-only-tools');
        if (textSection) textSection.style.display = isText ? 'flex' : 'none';

        // Synchronize Text Controls
        if (style && isText) {
            const fs = document.getElementById('font-size'); if (fs) fs.value = parseInt(style.fontSize) || 32;
            const ec = document.getElementById('element-color'); if (ec && style.color) ec.value = rgbToHex(style.color);
            const fc = document.getElementById('float-color'); if (fc && style.color) fc.value = rgbToHex(style.color);
            
            const ff = document.getElementById('font-family');
            if (ff) {
                const cur = style.fontFamily.replace(/['"]/g, '').toLowerCase();
                for (const opt of ff.options) {
                    if (cur.includes(opt.value.replace(/['"]/g, '').toLowerCase().split(',')[0].trim())) {
                        ff.value = opt.value; break;
                    }
                }
            }
        }

        updatePropsPanel();
        updateFloatingMenuPosition();
    }

    function deselect() {
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement = null;
        floatingMenu?.classList.add('hidden');
        updatePropsPanel();
    }

    canvas?.addEventListener('pointerdown', (e) => {
        if (e.target === canvas && !drawMode) deselect();
    });

    function updateFloatingMenuPosition() {
        if (!floatingMenu || !selectedElement) { floatingMenu?.classList.add('hidden'); return; }
        floatingMenu.classList.remove('hidden');
        floatingMenu.style.top = (selectedElement.offsetTop - 50) + 'px';
        floatingMenu.style.left = selectedElement.offsetLeft + 'px';
    }

    // ── 8. Text Alignment & Font Customization Directives ──
    const updateTextStyle = (property, value) => {
        if (selectedElement && selectedElement.classList.contains('text-element')) {
            saveState();
            const inner = selectedElement.querySelector('.content-wrapper');
            if (inner) inner.style[property] = value;
            updatePropsPanel();
        }
    };

    bindClick('align-left-btn', () => updateTextStyle('textAlign', 'left'));
    bindClick('align-center-btn', () => updateTextStyle('textAlign', 'center'));
    bindClick('align-right-btn', () => updateTextStyle('textAlign', 'right'));

    bindClick('bold-btn', () => {
        if (!selectedElement) return;
        const inner = selectedElement.querySelector('.content-wrapper');
        if (inner) updateTextStyle('fontWeight', inner.style.fontWeight === 'bold' ? 'normal' : 'bold');
    });

    bindClick('italic-btn', () => {
        if (!selectedElement) return;
        const inner = selectedElement.querySelector('.content-wrapper');
        if (inner) updateTextStyle('fontStyle', inner.style.fontStyle === 'italic' ? 'normal' : 'italic');
    });

    document.getElementById('font-family')?.addEventListener('change', (e) => updateTextStyle('fontFamily', e.target.value));
    document.getElementById('font-size')?.addEventListener('input', (e) => updateTextStyle('fontSize', e.target.value + 'px'));
    document.getElementById('element-color')?.addEventListener('input', (e) => updateTextStyle('color', e.target.value));
    document.getElementById('float-color')?.addEventListener('input', (e) => updateTextStyle('color', e.target.value));

    // ── 9. Properties Panel Two-Way Synchronization ──
    function updatePropsPanel() {
        const noSel = document.getElementById('props-no-select');
        const cont = document.getElementById('props-content');
        const textSec = document.getElementById('text-props');
        const shapeSec = document.getElementById('shape-props');

        if (!selectedElement) {
            noSel?.classList.remove('hidden'); cont?.classList.add('hidden'); return;
        }
        noSel?.classList.add('hidden'); cont?.classList.remove('hidden');

        const px = document.getElementById('prop-x'); if (px) px.value = parseInt(selectedElement.style.left) || 0;
        const py = document.getElementById('prop-y'); if (py) py.value = parseInt(selectedElement.style.top)  || 0;
        updatePropsSize();

        const isText = selectedElement.classList.contains('text-element');
        textSec?.classList.toggle('hidden', !isText);
        shapeSec?.classList.toggle('hidden', isText);

        const inner = selectedElement.querySelector('.content-wrapper');
        if (inner) {
            const s = window.getComputedStyle(inner);
            if (isText) {
                const pf = document.getElementById('prop-fontsize'); if (pf) pf.value = parseInt(s.fontSize) || 32;
                const pc = document.getElementById('prop-color'); if (pc) pc.value = rgbToHex(s.color);
            } else {
                const fill = document.getElementById('prop-fill'); if (fill) fill.value = rgbToHex(s.backgroundColor || '#2563eb');
            }
        }
        const po = document.getElementById('prop-opacity');
        const pov = document.getElementById('prop-opacity-val');
        const op = Math.round((parseFloat(selectedElement.style.opacity) || 1) * 100);
        if (po) po.value = op; if (pov) pov.textContent = op + '%';
    }

    function updatePropsPosition() {
        if (!selectedElement) return;
        const px = document.getElementById('prop-x'); if (px) px.value = parseInt(selectedElement.style.left) || 0;
        const py = document.getElementById('prop-y'); if (py) py.value = parseInt(selectedElement.style.top)  || 0;
    }
    function updatePropsSize() {
        if (!selectedElement) return;
        const pw = document.getElementById('prop-w'); if (pw) pw.value = parseInt(selectedElement.style.width) || 0;
        const ph = document.getElementById('prop-h'); if (ph) ph.value = parseInt(selectedElement.style.height)|| 0;
    }

    ['prop-x', 'prop-y', 'prop-w', 'prop-h', 'prop-fontsize', 'prop-color', 'prop-fill', 'prop-opacity'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            if (!selectedElement) return;
            saveState();
            const x = parseInt(document.getElementById('prop-x')?.value) || 0;
            const y = parseInt(document.getElementById('prop-y')?.value) || 0;
            const w = parseInt(document.getElementById('prop-w')?.value) || 20;
            const h = parseInt(document.getElementById('prop-h')?.value) || 20;
            
            selectedElement.style.left = x + 'px';
            selectedElement.style.top = y + 'px';
            selectedElement.style.width = w + 'px';
            selectedElement.style.height = h + 'px';

            const inner = selectedElement.querySelector('.content-wrapper');
            if (inner) {
                if (selectedElement.classList.contains('text-element')) {
                    inner.style.fontSize = (parseInt(document.getElementById('prop-fontsize')?.value) || 12) + 'px';
                    inner.style.color = document.getElementById('prop-color')?.value || '#000000';
                } else {
                    inner.style.backgroundColor = document.getElementById('prop-fill')?.value || '#2563eb';
                }
            }
            const opVal = parseInt(document.getElementById('prop-opacity')?.value) || 100;
            selectedElement.style.opacity = opVal / 100;
            const pov = document.getElementById('prop-opacity-val'); if (pov) pov.textContent = opVal + '%';
            updateFloatingMenuPosition();
        });
    });

    // ── 10. Depth Arrange & Element Modifiers ──
    bindClick('bring-front-btn', () => {
        if (!selectedElement) return; saveState(); selectedElement.style.zIndex = ++maxZIndex;
    });
    bindClick('send-back-btn', () => {
        if (!selectedElement) return; saveState(); selectedElement.style.zIndex = --minZIndex;
    });

    bindClick('duplicate-btn', () => {
        if (!selectedElement) return;
        saveState();
        const clone = selectedElement.cloneNode(true);
        clone.classList.remove('selected');
        clone.style.left = (parseInt(selectedElement.style.left) + 20) + 'px';
        clone.style.top = (parseInt(selectedElement.style.top) + 20) + 'px';
        clone.style.zIndex = ++maxZIndex;
        canvas.appendChild(clone);
        initElementEvents(clone);
        selectElement(clone);
    });

    const deleteSelected = () => {
        if (!selectedElement) return;
        saveState();
        canvas.removeChild(selectedElement);
        deselect();
    };
    bindClick('delete-btn', deleteSelected);
    bindClick('float-delete-btn', deleteSelected);

    // ── 11. Presentation Controls (Unified iOS Safari System) ──
    function startPresent() {
        const area = document.querySelector(".canvas-area");
        if (area?.requestFullscreen) { area.requestFullscreen(); }
        else if (area?.webkitRequestFullscreen) { area.webkitRequestFullscreen(); } 
        else {
            // Pseudo-Fullscreen Class approach optimized for standalone Mobile Safari
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
            const sn = document.getElementById('slide-number');
            if (sn) sn.textContent = `${currentSlideIndex + 1} / ${slides.length}`;
            playSlideAnimations();
        } else {
            clearInterval(autoAdvanceTimer);
            document.querySelector(".canvas-area")?.classList.remove("pseudo-fullscreen");
        }
    }

    document.addEventListener('fullscreenchange', () => triggerPresentationUI(!!document.fullscreenElement));
    document.addEventListener('webkitfullscreenchange', () => triggerPresentationUI(!!document.webkitFullscreenElement));

    bindClick('present-btn', startPresent);
    bindClick('exit-present-btn', () => {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else triggerPresentationUI(false);
    });

    function playSlideAnimations() {
        if (!canvas) return;
        Array.from(canvas.children).forEach(el => {
            el.classList.remove('play-anim');
            void el.offsetWidth; // Force reflow trigger
            el.classList.add('play-anim');
            const d = el.getAttribute('data-anim-delay') || '0';
            el.style.animationDelay = d + 's';
        });
    }

    function switchSlide(idx) {
        if (!canvas || idx < 0 || idx >= slides.length) return;
        slides[currentSlideIndex].html = canvas.innerHTML;

        currentSlideIndex = idx;
        canvas.innerHTML = slides[idx].html;
        
        // Restore properties on Canvas container
        const s = slides[idx];
        if (s.bgStyle === 'gradient') canvas.style.background = s.bg;
        else { canvas.style.backgroundColor = s.bg || '#ffffff'; canvas.style.backgroundImage = 'none'; }

        reattachEvents();
        const sn = document.getElementById('slide-number');
        if (sn) sn.textContent = `${currentSlideIndex + 1} / ${slides.length}`;
        renderSlidesThumbnails();
    }

    bindClick('next-slide', () => switchSlide(currentSlideIndex + 1));
    bindClick('prev-slide', () => switchSlide(currentSlideIndex - 1));

    bindClick('add-slide-btn', () => {
        slides.push({ html: "", bg: "#ffffff", bgStyle: "color", transition: "none", undoStack: [], redoStack: [] });
        switchSlide(slides.length - 1);
    });

    function renderSlidesThumbnails() {
        const list = document.getElementById('slide-list');
        if (!list) return;
        list.innerHTML = "";
        slides.forEach((s, i) => {
            const thumb = document.createElement('div');
            thumb.className = `slide-thumb ${i === currentSlideIndex ? 'active' : ''}`;
            if (s.bgStyle === 'gradient') thumb.style.background = s.bg;
            else thumb.style.backgroundColor = s.bg || '#ffffff';
            thumb.onclick = () => switchSlide(i);
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

    // ── 12. Design Swatches & Animations Linkage ──
    document.querySelectorAll('.theme-swatch').forEach(sw => {
        sw.onclick = () => {
            saveState();
            const bg = sw.dataset.bg || sw.style.background || sw.style.backgroundColor;
            slides[currentSlideIndex].bg = bg;
            if (bg.includes('gradient')) {
                slides[currentSlideIndex].bgStyle = 'gradient'; canvas.style.background = bg;
            } else {
                slides[currentSlideIndex].bgStyle = 'color'; canvas.style.backgroundColor = bg; canvas.style.backgroundImage = 'none';
            }
            renderSlidesThumbnails();
        };
    });

    document.querySelectorAll('.anim-set-btn').forEach(btn => {
        btn.onclick = () => {
            if (!selectedElement) return;
            saveState();
            const anim = btn.dataset.anim || 'none';
            selectedElement.setAttribute('data-animation', anim);
            document.querySelectorAll('.anim-set-btn').forEach(b => b.classList.toggle('active', b === btn));
            const fa = document.getElementById('float-anim-select'); if (fa) fa.value = anim;
        };
    });

    document.getElementById('float-anim-select')?.addEventListener('change', (e) => {
        if (!selectedElement) return; saveState();
        selectedElement.setAttribute('data-animation', e.target.value);
        document.querySelectorAll('.anim-set-btn').forEach(b => b.classList.toggle('active', b.dataset.anim === e.target.value));
    });

    document.getElementById('anim-delay')?.addEventListener('input', (e) => {
        if (!selectedElement) return; saveState();
        selectedElement.setAttribute('data-anim-delay', e.target.value || '0');
    });

    document.getElementById('snap-toggle')?.addEventListener('change', (e) => {
        snapEnabled = e.target.checked;
    });

    // ── 13. Proofreading Counter Core ──
    bindClick('run-proofread-btn', () => {
        const resTxt = document.getElementById('proofread-result') || document.getElementById('res-text');
        if (!resTxt) return;
        const texts = [];
        canvas.querySelectorAll('.text-element .content-wrapper').forEach(el => {
            texts.push(el.innerText || el.textContent || "");
        });
        if (texts.length === 0) { resTxt.textContent = 'No text elements found.'; return; }
        
        const combined = texts.join(" ");
        const words = combined.trim().split(/\s+/).filter(w => w.length > 0).length;
        resTxt.innerHTML = `
            <strong>Analysis:</strong><br>
            • Text Elements: ${texts.length}<br>
            • Word Count: ${words}<br>
            • Character Count: ${combined.length}
        `;
    });

    // ── 14. PDF & PPTX Import / Export Operations ──
    bindClick('export-pdf-btn', async () => {
        if (!window.jspdf) { alert("PDF library is not loaded."); return; }
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [800, 450] });
        const originalIdx = currentSlideIndex;
        deselect();

        for (let i = 0; i < slides.length; i++) {
            if (i > 0) pdf.addPage([800, 450], 'landscape');
            canvas.innerHTML = slides[i].html;
            canvas.style.background = slides[i].bgStyle === 'gradient' ? slides[i].bg : (slides[i].bg || '#ffffff');
            
            const capture = await html2canvas(canvas, { width: 800, height: 450, scale: 2 });
            pdf.addImage(capture.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 800, 450);
        }
        switchSlide(originalIdx);
        pdf.save('presentation.pdf');
    });

    bindClick('export-pptx-btn', () => {
        if (!window.PptxGenJS) { alert("PPTX library is not loaded."); return; }
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_16x9';
        slides[currentSlideIndex].html = canvas.innerHTML;

        slides.forEach(s => {
            const slide = pptx.addSlide();
            if (s.bg && s.bgStyle === 'color') slide.background = { fill: s.bg.replace('#', '') };

            const sandbox = document.createElement('div'); sandbox.innerHTML = s.html;
            sandbox.querySelectorAll('.canvas-element').forEach(el => {
                const x = (parseInt(el.style.left) || 0) / 80;
                const y = (parseInt(el.style.top) || 0) / 45;
                const w = (parseInt(el.style.width) || 100) / 80;
                const h = (parseInt(el.style.height) || 50) / 45;

                if (el.classList.contains('text-element')) {
                    const wrap = el.querySelector('.content-wrapper');
                    slide.addText(wrap ? wrap.innerText : "", {
                        x, y, w, h, fontSize: (parseInt(wrap?.style.fontSize) || 24) * 0.75,
                        color: rgbToHex(window.getComputedStyle(wrap).color).replace('#', ''),
                        align: wrap?.style.textAlign || 'left'
                    });
                } else if (el.classList.contains('rect-element')) {
                    const wrap = el.querySelector('.content-wrapper');
                    slide.addShape(el.classList.contains('circle-element') ? pptx.ShapeType.oval : pptx.ShapeType.rectangle, {
                        x, y, w, h, fill: { color: rgbToHex(window.getComputedStyle(wrap).backgroundColor).replace('#', '') }
                    });
                }
            });
        });
        pptx.writeFile({ fileName: 'presentation.pptx' });
    });

    if (pdfFileInput) {
        bindClick('btn-import-pdf', () => pdfFileInput.click());
        pdfFileInput.onchange = async (e) => {
            const file = e.target.files[0]; if (!file || !window.pdfjsLib) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ev.target.result) }).promise;
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const vp = page.getViewport({ scale: 2 });
                        const tempC = document.createElement('canvas');
                        tempC.width = vp.width; tempC.height = vp.height;
                        await page.render({ canvasContext: tempC.getContext('2d'), viewport: vp }).promise;

                        const item = {
                            html: `<div class="canvas-element image-element" style="width:800px;height:450px;left:0;top:0;z-index:50;"><img class="content-wrapper" src="${tempC.toDataURL('image/png')}" style="width:100%;height:100%;"></div>`,
                            bg: "#ffffff", bgStyle: "color", transition: "none", undoStack: [], redoStack: []
                        };
                        if (i === 1 && slides.length === 1 && slides[0].html === "") slides[0] = item;
                        else slides.push(item);
                    }
                    switchSlide(0);
                } catch (err) { alert("Import error: " + err.message); }
            };
            reader.readAsArrayBuffer(file);
            pdfFileInput.value = '';
        };
    }

    // ── 15. Global Keys & Input Sanitizers ──
    window.addEventListener('keydown', (e) => {
        if (document.activeElement.contentEditable === 'true' || document.activeElement.tagName === 'INPUT') return;

        // Presentation controls mapping
        if (document.fullscreenElement || document.webkitFullscreenElement || document.querySelector('.pseudo-fullscreen')) {
            if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); switchSlide(currentSlideIndex + 1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); switchSlide(currentSlideIndex - 1); }
            if (e.key === 'Escape') document.getElementById('exit-present-btn')?.click();
            return;
        }

        // Element movement shortcuts
        if (selectedElement) {
            const step = e.shiftKey ? 1 : 10;
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                e.preventDefault();
                if (e.key === 'ArrowLeft')  selectedElement.style.left = (parseInt(selectedElement.style.left) || 0) - step + 'px';
                if (e.key === 'ArrowRight') selectedElement.style.left = (parseInt(selectedElement.style.left) || 0) + step + 'px';
                if (e.key === 'ArrowUp')    selectedElement.style.top  = (parseInt(selectedElement.style.top)  || 0) - step + 'px';
                if (e.key === 'ArrowDown')  selectedElement.style.top  = (parseInt(selectedElement.style.top)  || 0) + step + 'px';
                updateFloatingMenuPosition(); updatePropsPosition();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); document.getElementById('duplicate-btn')?.click(); }
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
        }
    });

    function rgbToHex(rgb) {
        if (!rgb || rgb === 'transparent') return '#ffffff';
        const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return match ? "#" + match.slice(1).map(x => parseInt(x).toString(16).padStart(2, '0')).join('') : '#ffffff';
    }

    // Initialize Subsystems
    initDrawingListeners();
    renderSlidesThumbnails();
    updateUndoRedoUI();
    applyZoom();
});
