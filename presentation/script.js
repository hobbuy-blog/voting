/**
 * Leaslide — Complete Integrated Core Script (Optimized Multi-Resolution Edition)
 * Fixed: Slide Previews, Element Creation Home Tab Auto-Routing, True Presentation Ratio Fit,
 * iPad Multi-Touch Pinch Zoom, Page Erasure Pipeline, 1st Page PDF Import & High-Res Precise Export.
 */

// --- 1. Tab Router Controller ---
window.openTab = function(evt, tabName) {
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".tab-link").forEach(l => l.classList.remove("active"));
    const t = document.getElementById(tabName);
    if (t) t.classList.add("active");
    
    if (evt?.currentTarget) {
        evt.currentTarget.classList.add("active");
    } else {
        const matchingLink = document.querySelector(`.tab-link[onclick*="${tabName}"]`);
        if (matchingLink) matchingLink.classList.add("active");
    }
};

// Auto-route tab focus back to Home for easy styling access
function routeToHomeTab() {
    window.openTab(null, 'tab-home');
}

// --- Multi-Resolution State Configuration ---
let currentWidth = 1920;
let currentHeight = 1080;

let slides = [{ html: "", bg: "#ffffff", bgStyle: "color", undoStack: [], redoStack: [] }];
let currentSlideIndex = 0;
let selectedElement = null;
let maxZIndex = 100;
let minZIndex = 10;
let currentZoom = 0.5; // Starts optimized to fit screen bounds comfortably
let snapEnabled = true;

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const container = document.getElementById('canvas-container');
    const floatingMenu = document.getElementById('floating-menu');
    const imageUpload = document.getElementById('image-upload');
    const pdfFileInput = document.getElementById('pdf-file-input');
    const sizeSelect = document.getElementById('slide-size-select');

    const bindClick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

    // Initialize resolution sizing mapping layout
    function updateCanvasResolution() {
        if (!sizeSelect || !canvas) return;
        const [w, h] = sizeSelect.value.split('x').map(Number);
        currentWidth = w;
        currentHeight = h;
        canvas.style.width = currentWidth + 'px';
        canvas.style.height = currentHeight + 'px';
        applyZoom();
        renderSlidesThumbnails();
    }
    sizeSelect?.addEventListener('change', () => {
        saveState();
        updateCanvasResolution();
    });

    // ── 2. History Stack Pipeline ──
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

    // ── 3. Advanced Zoom Engine (Pinch Tracking & Trackpad Handles) ──
    function applyZoom() {
        const isPresenting = document.fullscreenElement || document.webkitFullscreenElement || document.querySelector('.pseudo-fullscreen');
        if (isPresenting) return; // Presentation Layout mode overrules manual scaling factor

        if (canvas) {
            canvas.style.transform = `scale(${currentZoom})`;
            canvas.style.transformOrigin = 'center center';
            canvas.style.position = 'relative';
            canvas.style.left = 'auto'; canvas.style.top = 'auto'; canvas.style.margin = '0';
        }
        const zoomVal = document.getElementById('zoom-val');
        if (zoomVal) zoomVal.textContent = `${Math.round(currentZoom * 100)}%`;
    }

    bindClick('zoom-in', () => { currentZoom = Math.min(2.0, currentZoom + 0.1); applyZoom(); });
    bindClick('zoom-out', () => { currentZoom = Math.max(0.2, currentZoom - 0.1); applyZoom(); });
    bindClick('zoom-reset', () => { currentZoom = 0.6; applyZoom(); });

    container?.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const factor = 0.04;
            currentZoom = e.deltaY < 0 ? Math.min(2.0, currentZoom + factor) : Math.max(0.2, currentZoom - factor);
            applyZoom();
        }
    }, { passive: false });

    // ✨ iPad Native Multi-Touch Pinch Gesture Framework
    let touchStartDist = 0;
    let touchStartZoom = 1.0;

    container?.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            touchStartDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            touchStartZoom = currentZoom;
        }
    }, { passive: false });

    container?.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && touchStartDist > 0) {
            e.preventDefault();
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const ratio = currentDist / touchStartDist;
            currentZoom = Math.min(2.0, Math.max(0.2, touchStartZoom * ratio));
            applyZoom();
        }
    }, { passive: false });

    container?.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) touchStartDist = 0;
    });

    // ── 4. Element Factory (Auto Routing Feature Embedded) ──
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el = document.createElement('div');
        el.className = `canvas-element ${typeClass}`;
        Object.assign(el.style, {
            width: w + 'px', height: h + 'px', left: '200px', top: '200px',
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

        canvas.appendChild(el);
        initElementEvents(el);
        selectElement(el);
        routeToHomeTab(); // ✨ Force Focus Redirect
        renderSlidesThumbnails();
        return el;
    }

    bindClick('add-text-btn', () => {
        const el = createBaseElement('text-element', 450, 100);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.contentEditable = true;
        Object.assign(inner.style, {
            fontSize: "44px", color: "#0f172a", fontFamily: "'Noto Sans JP', sans-serif", textAlign: "left"
        });
        inner.innerText = "Double click to edit text";
        el.appendChild(inner);
        inner.onblur = () => { saveState(); renderSlidesThumbnails(); };
        inner.oninput = () => renderSlidesThumbnails();
    });

    bindClick('add-rect-btn', () => {
        const el = createBaseElement('rect-element', 240, 180);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper'; inner.style.backgroundColor = "#2563eb";
        el.appendChild(inner);
    });

    bindClick('add-circle-btn', () => {
        const el = createBaseElement('rect-element circle-element', 180, 180);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper'; inner.style.backgroundColor = "#7c3aed"; inner.style.borderRadius = "50%";
        el.appendChild(inner);
    });

    bindClick('add-line-btn', () => {
        const el = createBaseElement('rect-element line-element', 300, 6);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper'; inner.style.backgroundColor = "#0f172a";
        el.appendChild(inner);
    });

    bindClick('insert-arrow-btn', () => {
        const el = createBaseElement('rect-element', 200, 50);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper'; inner.style.display = 'flex'; inner.style.alignItems = 'center';
        inner.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 200 50" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path d="M5 25h175M160 10l20 15-20 15" stroke="#2563eb" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        el.appendChild(inner);
    });

    bindClick('insert-star-btn', () => {
        const el = createBaseElement('rect-element', 160, 160);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M60 8l13.5 27.6 30.5 4.4-22 21.4 5.2 30.4L60 77l-27.2 14.8 5.2-30.4L16 39.9l30.5-4.4z" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/></svg>`;
        el.appendChild(inner);
    });

    if (imageUpload) {
        bindClick('add-image-btn', () => imageUpload.click());
        imageUpload.onchange = (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const el = createBaseElement('image-element', 400, 300);
                const img = document.createElement('img');
                img.className = 'content-wrapper'; img.src = ev.target.result;
                el.appendChild(img);
                selectElement(el);
            };
            reader.readAsDataURL(file);
            imageUpload.value = '';
        };
    }

    // ── 5. iPad Touch-Sticky Pointer Captures ──
    function initElementEvents(el) {
        let isDrag = false, isRes = false;
        let sx, sy, ox, oy, sw, sh, dir;

        el.addEventListener('pointerdown', (e) => {
            if (e.target.classList.contains('resize-handle')) return;
            if (el.classList.contains('text-element') && e.target.classList.contains('content-wrapper') && selectedElement === el) return;
            
            isDrag = true; 
            saveState();
            el.setPointerCapture(e.pointerId);
            
            sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;
            selectElement(el);
            routeToHomeTab(); // ✨ Focus redirect on direct touch select
            e.stopPropagation();
        });

        el.querySelectorAll('.resize-handle').forEach(h => {
            h.addEventListener('pointerdown', (e) => {
                isRes = true; saveState();
                h.setPointerCapture(e.pointerId);
                dir = h.dataset.direction;
                sx = e.clientX; sy = e.clientY;
                sw = el.offsetWidth; sh = el.offsetHeight;
                ox = el.offsetLeft; oy = el.offsetTop;
                e.stopPropagation(); e.preventDefault();
            });
        });

        document.addEventListener('pointermove', (e) => {
            if (!selectedElement || selectedElement !== el) return;
            const dx = (e.clientX - sx) / currentZoom;
            const dy = (e.clientY - sy) / currentZoom;

            if (isDrag) {
                let nx = ox + dx, ny = oy + dy;
                if (snapEnabled) { nx = Math.round(nx / 12) * 12; ny = Math.round(ny / 12) * 12; }
                el.style.left = nx + 'px'; el.style.top = ny + 'px';
                updateFloatingMenuPosition(); updatePropsPosition();
            }
            if (isRes) {
                const limit = 15;
                if (dir === 'se') {
                    el.style.width  = Math.max(limit, sw + dx) + 'px';
                    el.style.height = Math.max(limit, sh + dy) + 'px';
                } else if (dir === 'sw') {
                    const nw = Math.max(limit, sw - dx);
                    if (nw > limit) { el.style.left = (ox + dx) + 'px'; el.style.width = nw + 'px'; }
                    el.style.height = Math.max(limit, sh + dy) + 'px';
                } else if (dir === 'ne') {
                    el.style.width = Math.max(limit, sw + dx) + 'px';
                    const nh = Math.max(limit, sh - dy);
                    if (nh > limit) { el.style.top = (oy + dy) + 'px'; el.style.height = nh + 'px'; }
                } else if (dir === 'nw') {
                    const nw = Math.max(limit, sw - dx), nh = Math.max(limit, sh - dy);
                    if (nw > limit) { el.style.left = (ox + dx) + 'px'; el.style.width = nw + 'px'; }
                    if (nh > limit) { el.style.top  = (oy + dy) + 'px'; el.style.height = nh + 'px'; }
                }
                updateFloatingMenuPosition(); updatePropsSize();
            }
        });

        document.addEventListener('pointerup', (e) => {
            if (isDrag) { el.releasePointerCapture(e.pointerId); isDrag = false; renderSlidesThumbnails(); }
            if (isRes) { isRes = false; renderSlidesThumbnails(); }
        });
    }

    // ── 6. Selection & Sync Inspector Mechanics ──
    function selectElement(el) {
        if (!el) return;
        if (selectedElement && selectedElement !== el) selectedElement.classList.remove('selected');
        selectedElement = el;
        el.classList.add('selected');

        const inner = el.querySelector('.content-wrapper');
        const style = inner ? window.getComputedStyle(inner) : null;
        const anim = el.getAttribute('data-animation') || 'none';

        document.querySelectorAll('.anim-set-btn').forEach(b => b.classList.toggle('active', b.dataset.anim === anim));
        const fa = document.getElementById('float-anim-select'); if (fa) fa.value = anim;

        const isText = el.classList.contains('text-element');
        const textSection = document.querySelector('.text-only-tools');
        if (textSection) textSection.style.display = isText ? 'flex' : 'none';

        if (style && isText) {
            const fs = document.getElementById('font-size'); if (fs) fs.value = parseInt(style.fontSize) || 32;
            const ec = document.getElementById('element-color'); if (ec && style.color) ec.value = rgbToHex(style.color);
            const fc = document.getElementById('float-color'); if (fc && style.color) fc.value = rgbToHex(style.color);
        }
        updatePropsPanel();
        updateFloatingMenuPosition();
    }

    function deselect() {
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement = null;
        floatingMenu?.classList.add('hidden');
        const textSection = document.querySelector('.text-only-tools');
        if (textSection) textSection.style.display = 'none';
        updatePropsPanel();
    }

    canvas?.addEventListener('pointerdown', (e) => { if (e.target === canvas) deselect(); });

    function updateFloatingMenuPosition() {
        if (!floatingMenu || !selectedElement) { floatingMenu?.classList.add('hidden'); return; }
        floatingMenu.classList.remove('hidden');
        floatingMenu.style.top = (selectedElement.offsetTop - 45) + 'px';
        floatingMenu.style.left = selectedElement.offsetLeft + 'px';
    }

    // Typography Aligners & Injectors
    const patchTextStyle = (key, val) => {
        if (selectedElement?.classList.contains('text-element')) {
            saveState();
            const inner = selectedElement.querySelector('.content-wrapper');
            if (inner) inner.style[key] = val;
            updatePropsPanel(); renderSlidesThumbnails();
        }
    };
    bindClick('align-left-btn', () => patchTextStyle('textAlign', 'left'));
    bindClick('align-center-btn', () => patchTextStyle('textAlign', 'center'));
    bindClick('align-right-btn', () => patchTextStyle('textAlign', 'right'));
    bindClick('bold-btn', () => {
        const inner = selectedElement?.querySelector('.content-wrapper');
        if (inner) patchTextStyle('fontWeight', inner.style.fontWeight === 'bold' ? 'normal' : 'bold');
    });
    bindClick('italic-btn', () => {
        const inner = selectedElement?.querySelector('.content-wrapper');
        if (inner) patchTextStyle('fontStyle', inner.style.fontStyle === 'italic' ? 'normal' : 'italic');
    });

    document.getElementById('font-family')?.addEventListener('change', (e) => patchTextStyle('fontFamily', e.target.value));
    document.getElementById('font-size')?.addEventListener('input', (e) => patchTextStyle('fontSize', e.target.value + 'px'));
    document.getElementById('element-color')?.addEventListener('input', (e) => patchTextStyle('color', e.target.value));
    document.getElementById('float-color')?.addEventListener('input', (e) => patchTextStyle('color', e.target.value));

    // Two-Way Parameters Panel Matching
    function updatePropsPanel() {
        const noSel = document.getElementById('props-no-select');
        const cont = document.getElementById('props-content');
        const textSec = document.getElementById('text-props');
        const shapeSec = document.getElementById('shape-props');

        if (!selectedElement) { noSel?.classList.remove('hidden'); cont?.classList.add('hidden'); return; }
        noSel?.classList.add('hidden'); cont?.classList.remove('hidden');

        updatePropsPosition(); updatePropsSize();
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
        const op = Math.round((parseFloat(selectedElement.style.opacity) || 1) * 100);
        const po = document.getElementById('prop-opacity'); if (po) po.value = op;
        const pov = document.getElementById('prop-opacity-val'); if (pov) pov.textContent = op + '%';
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
            const inner = selectedElement.querySelector('.content-wrapper');
            if (selectedElement.classList.contains('text-element') && inner) {
                inner.style.fontSize = (parseInt(document.getElementById('prop-fontsize').value) || 12) + 'px';
                inner.style.color = document.getElementById('prop-color').value;
            } else if (inner) {
                inner.style.backgroundColor = document.getElementById('prop-fill').value;
            }
            selectedElement.style.left = (parseInt(document.getElementById('prop-x').value) || 0) + 'px';
            selectedElement.style.top  = (parseInt(document.getElementById('prop-y').value) || 0) + 'px';
            selectedElement.style.width = (parseInt(document.getElementById('prop-w').value) || 20) + 'px';
            selectedElement.style.height = (parseInt(document.getElementById('prop-h').value) || 20) + 'px';
            
            const opVal = parseInt(document.getElementById('prop-opacity').value) || 100;
            selectedElement.style.opacity = opVal / 100;
            document.getElementById('prop-opacity-val').textContent = opVal + '%';
            updateFloatingMenuPosition(); renderSlidesThumbnails();
        });
    });

    bindClick('bring-front-btn', () => { if (selectedElement) { saveState(); selectedElement.style.zIndex = ++maxZIndex; } });
    bindClick('send-back-btn', () => { if (selectedElement) { saveState(); selectedElement.style.zIndex = --minZIndex; } });
    bindClick('duplicate-btn', () => {
        if (!selectedElement) return; saveState();
        const clone = selectedElement.cloneNode(true);
        clone.classList.remove('selected');
        clone.style.left = (parseInt(selectedElement.style.left) + 25) + 'px';
        clone.style.top = (parseInt(selectedElement.style.top) + 25) + 'px';
        canvas.appendChild(clone); initElementEvents(clone); selectElement(clone);
        renderSlidesThumbnails();
    });

    const removeSelected = () => { if (selectedElement) { saveState(); canvas.removeChild(selectedElement); deselect(); renderSlidesThumbnails(); } };
    bindClick('delete-btn', removeSelected); bindClick('float-delete-btn', removeSelected);

    // ── 7. ✨ 本物のスライド縮小プレビュー生成エンジン ──
    function renderSlidesThumbnails() {
        const list = document.getElementById('slide-list');
        if (!list) return;
        list.innerHTML = "";

        slides.forEach((s, i) => {
            const thumb = document.createElement('div');
            thumb.className = `slide-thumb ${i === currentSlideIndex ? 'active' : ''}`;
            
            // アスペクト比を現在の解像度設定に同期
            thumb.style.aspectRatio = `${currentWidth} / ${currentHeight}`;

            const previewCont = document.createElement('div');
            previewCont.className = 'thumb-preview-container';
            previewCont.style.width = currentWidth + 'px';
            previewCont.style.height = currentHeight + 'px';

            // 現在編集中のページはリアルタイムの内容、それ以外は保存データをロード
            previewCont.innerHTML = (i === currentSlideIndex) ? canvas.innerHTML : s.html;

            // 背景色同期
            if (s.bgStyle === 'gradient') previewCont.style.background = s.bg;
            else { previewCont.style.backgroundColor = s.bg || '#ffffff'; previewCont.style.backgroundImage = 'none'; }

            // サイドバーのサイズに収まるよう正確な縮小率をスケール計算
            const containerWidth = list.clientWidth - 4; 
            const scalingFactor = containerWidth / currentWidth;
            previewCont.style.transform = `scale(${scalingFactor})`;

            thumb.appendChild(previewCont);
            thumb.onclick = () => switchSlide(i);
            list.appendChild(thumb);
        });
    }

    // ── 8. スライド管理 & 削除（完全保護付） ──
    function switchSlide(idx) {
        if (!canvas || idx < 0 || idx >= slides.length) return;
        slides[currentSlideIndex].html = canvas.innerHTML; // セーブ

        currentSlideIndex = idx;
        const s = slides[idx];
        canvas.innerHTML = s.html;
        
        if (s.bgStyle === 'gradient') canvas.style.background = s.bg;
        else { canvas.style.backgroundColor = s.bg || '#ffffff'; canvas.style.backgroundImage = 'none'; }

        reattachEvents();
        const sn = document.getElementById('slide-number');
        if (sn) sn.textContent = `${currentSlideIndex + 1} / ${slides.length}`;
        renderSlidesThumbnails();
    }

    bindClick('add-slide-btn', () => {
        slides[currentSlideIndex].html = canvas.innerHTML;
        slides.push({ html: "", bg: "#ffffff", bgStyle: "color", undoStack: [], redoStack: [] });
        switchSlide(slides.length - 1);
    });

    // ✨ スライド削除バグの完全修正
    bindClick('delete-slide-btn', () => {
        if (slides.length <= 1) {
            alert("Cannot delete the last remaining slide."); return;
        }
        if (confirm("Are you sure you want to delete the current slide?")) {
            slides.splice(currentSlideIndex, 1);
            // 削除後の適切なインデックスにフォールバック
            const nextIdx = Math.max(0, currentSlideIndex - 1);
            currentSlideIndex = nextIdx;
            
            const s = slides[nextIdx];
            canvas.innerHTML = s.html;
            if (s.bgStyle === 'gradient') canvas.style.background = s.bg;
            else { canvas.style.backgroundColor = s.bg || '#ffffff'; canvas.style.backgroundImage = 'none'; }

            reattachEvents();
            switchSlide(nextIdx);
        }
    });

    function reattachEvents() {
        if (!canvas) return;
        Array.from(canvas.children).forEach(el => { if (el.id !== 'floating-menu') initElementEvents(el); });
        deselect();
    }

    // ── 9. ✨ プレゼンテーションモード（解像度完全追従型自動フィット） ──
    function layoutPresentation() {
        const isPresent = document.fullscreenElement || document.webkitFullscreenElement || document.querySelector('.pseudo-fullscreen');
        if (!isPresent || !canvas) return;

        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // 画面アスペクトに完全に一致する縮小最大比率を自動計算
        const scale = Math.min(windowWidth / currentWidth, windowHeight / currentHeight);
        
        canvas.style.transform = `scale(${scale})`;
        canvas.style.transformOrigin = 'center center';
        canvas.style.position = 'absolute';
        canvas.style.left = '50%';
        canvas.style.top = '50%';
        canvas.style.margin = `-${currentHeight / 2}px 0 0 -${currentWidth / 2}px`;
    }

    function triggerPresentationUI(isEntering) {
        const ctrl = document.getElementById('presenter-controls');
        if (!ctrl) return;
        ctrl.classList.toggle('hidden', !isEntering);
        
        if (isEntering) {
            deselect();
            slides[currentSlideIndex].html = canvas.innerHTML;
            document.getElementById('slide-number').textContent = `${currentSlideIndex + 1} / ${slides.length}`;
            layoutPresentation();
            playSlideAnimations();
        } else {
            document.querySelector(".canvas-area")?.classList.remove("pseudo-fullscreen");
            applyZoom(); // 通常の編集モード配置に復元
        }
    }

    window.addEventListener('resize', () => {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.querySelector('.pseudo-fullscreen')) {
            layoutPresentation();
        }
    });

    document.addEventListener('fullscreenchange', () => triggerPresentationUI(!!document.fullscreenElement));
    document.addEventListener('webkitfullscreenchange', () => triggerPresentationUI(!!document.webkitFullscreenElement));

    bindClick('present-btn', () => {
        const area = document.querySelector(".canvas-area");
        if (area?.requestFullscreen) area.requestFullscreen();
        else if (area?.webkitRequestFullscreen) area.webkitRequestFullscreen();
        else {
            area?.classList.add("pseudo-fullscreen");
            triggerPresentationUI(true);
        }
    });

    bindClick('exit-present-btn', () => {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else triggerPresentationUI(false);
    });

    function playSlideAnimations() {
        if (!canvas) return;
        Array.from(canvas.children).forEach(el => {
            el.classList.remove('play-anim'); void el.offsetWidth;
            el.classList.add('play-anim');
            el.style.animationDelay = (el.getAttribute('data-anim-delay') || '0') + 's';
        });
    }

    // ── 10. Design Themes Linker ──
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
            if (!selectedElement) return; saveState();
            const anim = btn.dataset.anim || 'none';
            selectedElement.setAttribute('data-animation', anim);
            document.querySelectorAll('.anim-set-btn').forEach(b => b.classList.toggle('active', b === btn));
            const fa = document.getElementById('float-anim-select'); if (fa) fa.value = anim;
        };
    });

    document.getElementById('float-anim-select')?.addEventListener('change', (e) => {
        if (!selectedElement) return; saveState();
        selectedElement.setAttribute('data-animation', e.target.value);
    });
    document.getElementById('snap-toggle')?.addEventListener('change', (e) => { snapEnabled = e.target.checked; });

    // Text Analyzer Statistics
    bindClick('run-proofread-btn', () => {
        const resTxt = document.getElementById('proofread-result'); if (!resTxt) return;
        const texts = []; canvas.querySelectorAll('.text-element .content-wrapper').forEach(el => texts.push(el.innerText || ""));
        const combined = texts.join(" ");
        const words = combined.trim().split(/\s+/).filter(w => w.length > 0).length;
        resTxt.innerHTML = `<strong>Deck Analysis:</strong><br>• Slides Count: ${slides.length}<br>• Words: ${words}<br>• Total Chars: ${combined.length}`;
    });

    // ── 11. ✨ PDF 高精度エクスポート（位置ズレ完全解消） ──
    bindClick('export-pdf-btn', async () => {
        if (!window.jspdf) { alert("PDF Engine library missing."); return; }
        const { jsPDF } = window.jspdf;
        
        // 選択されているアスペクト比解像度（1920/1024など）でPDFの規格枠を生成
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [currentWidth, currentHeight] });
        const originalIdx = currentSlideIndex;
        deselect();

        slides[currentSlideIndex].html = canvas.innerHTML;

        // 【ズレ対策】html2canvas実行前に、一時的に配置を原寸大ズーム1.0に固定
        canvas.style.transform = "scale(1)";
        canvas.style.transformOrigin = "center center";
        canvas.style.position = "relative";
        canvas.style.margin = "0";

        for (let i = 0; i < slides.length; i++) {
            if (i > 0) pdf.addPage([currentWidth, currentHeight], 'landscape');
            canvas.innerHTML = slides[i].html;
            
            const s = slides[i];
            if (s.bgStyle === 'gradient') canvas.style.background = s.bg;
            else { canvas.style.backgroundColor = s.bg || '#ffffff'; canvas.style.backgroundImage = 'none'; }
            
            // 原寸サイズで1ピクセルも狂わずにキャプチャ
            const capture = await html2canvas(canvas, { 
                width: currentWidth, 
                height: currentHeight, 
                scale: 1, 
                useCORS: true,
                logging: false
            });
            pdf.addImage(capture.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, currentWidth, currentHeight);
        }
        
        switchSlide(originalIdx);
        pdf.save('presentation.pdf');
    });

    // ✨ PDF インポート（1ページ目消失不具合の完全修正）
    if (pdfFileInput) {
        bindClick('btn-import-pdf', () => pdfFileInput.click());
        pdfFileInput.onchange = async (e) => {
            const file = e.target.files[0]; if (!file || !window.pdfjsLib) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ev.target.result) }).promise;
                    const importedSlidesList = [];

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        // インポートを1920x1080の高解像度ベースでレンダー処理
                        const viewport = page.getViewport({ scale: 2.0 });
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = viewport.width; tempCanvas.height = viewport.height;
                        
                        await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport: viewport }).promise;

                        importedSlidesList.push({
                            html: `<div class="canvas-element image-element" style="width:${currentWidth}px;height:${currentHeight}px;left:0;top:0;z-index:50;"><img class="content-wrapper" src="${tempCanvas.toDataURL('image/png')}" style="width:100%;height:100%;"></div>`,
                            bg: "#ffffff", bgStyle: "color", undoStack: [], redoStack: []
                        });
                    }

                    if (importedSlidesList.length > 0) {
                        // 初期の1枚目が空なら完全に上書きして1ページ目から反映
                        if (slides.length === 1 && slides[0].html === "") {
                            slides = importedSlidesList;
                        } else {
                            slides = slides.concat(importedSlidesList);
                        }
                        currentSlideIndex = 0;
                        switchSlide(0); // 1ページ目を確実に描画
                    }
                } catch (err) { alert("PDF Import broken: " + err.message); }
            };
            reader.readAsArrayBuffer(file);
            pdfFileInput.value = '';
        };
    }

    // PPTX Engine Multi-Resolution Injector
    bindClick('export-pptx-btn', () => {
        if (!window.PptxGenJS) { alert("PPTX Core missing."); return; }
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_16x9';
        slides[currentSlideIndex].html = canvas.innerHTML;

        slides.forEach(s => {
            const slide = pptx.addSlide();
            if (s.bg && s.bgStyle === 'color') slide.background = { fill: s.bg.replace('#', '') };
            const box = document.createElement('div'); box.innerHTML = s.html;
            
            box.querySelectorAll('.canvas-element').forEach(el => {
                // 解像度に応じたインチサイズ変換マトリクス
                const factorX = currentWidth / 10; const factorY = currentHeight / 5.625;
                const x = (parseInt(el.style.left) || 0) / factorX;
                const y = (parseInt(el.style.top) || 0) / factorY;
                const w = (parseInt(el.style.width) || 100) / factorX;
                const h = (parseInt(el.style.height) || 50) / factorY;

                if (el.classList.contains('text-element')) {
                    const wr = el.querySelector('.content-wrapper');
                    slide.addText(wr ? wr.innerText : "", {
                        x, y, w, h, fontSize: (parseInt(wr?.style.fontSize) || 32) * 0.7,
                        color: rgbToHex(window.getComputedStyle(wr).color).replace('#', ''),
                        align: wr?.style.textAlign || 'left'
                    });
                } else if (el.classList.contains('rect-element')) {
                    const wr = el.querySelector('.content-wrapper');
                    slide.addShape(el.classList.contains('circle-element') ? pptx.ShapeType.oval : pptx.ShapeType.rectangle, {
                        x, y, w, h, fill: { color: rgbToHex(window.getComputedStyle(wr).backgroundColor).replace('#', '') }
                    });
                }
            });
        });
        pptx.writeFile({ fileName: 'presentation.pptx' });
    });

    // ── 12. Hotkey Control Matrix ──
    window.addEventListener('keydown', (e) => {
        if (document.activeElement.contentEditable === 'true' || document.activeElement.tagName === 'INPUT') return;

        const isPresenting = document.fullscreenElement || document.webkitFullscreenElement || document.querySelector('.pseudo-fullscreen');
        if (isPresenting) {
            if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); switchSlide(currentSlideIndex + 1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); switchSlide(currentSlideIndex - 1); }
            if (e.key === 'Escape') document.getElementById('exit-present-btn')?.click();
            return;
        }

        if (selectedElement) {
            const pace = e.shiftKey ? 2 : 12;
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                e.preventDefault();
                if (e.key === 'ArrowLeft')  selectedElement.style.left = (parseInt(selectedElement.style.left) || 0) - pace + 'px';
                if (e.key === 'ArrowRight') selectedElement.style.left = (parseInt(selectedElement.style.left) || 0) + pace + 'px';
                if (e.key === 'ArrowUp')    selectedElement.style.top  = (parseInt(selectedElement.style.top)  || 0) - pace + 'px';
                if (e.key === 'ArrowDown')  selectedElement.style.top  = (parseInt(selectedElement.style.top)  || 0) + pace + 'px';
                updateFloatingMenuPosition(); updatePropsPosition(); renderSlidesThumbnails();
            }
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
        }
    });

    function rgbToHex(rgb) {
        if (!rgb || rgb === 'transparent') return '#ffffff';
        const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return match ? "#" + match.slice(1).map(x => parseInt(x).toString(16).padStart(2, '0')).join('') : '#ffffff';
    }

    // Launch Default Core Setup
    updateCanvasResolution();
});
