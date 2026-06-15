// ============================================================
//  Leaslide — script.js
//  元タブ構成維持 + Gemini追加機能統合版
// ============================================================

// --- 1. タブルーター ---
window.openTab = function(evt, tabName) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
    const t = document.getElementById(tabName);
    if (t) t.classList.add('active');
    if (evt?.currentTarget) evt.currentTarget.classList.add('active');
};

// --- 状態 ---
let currentWidth  = 1920;
let currentHeight = 1080;
let slides        = [{ html:'', bg:'#ffffff', bgStyle:'color', transition:'none', undoStack:[], redoStack:[] }];
let currentSlideIndex = 0;
let selectedElement   = null;
let maxZIndex = 100;
let currentZoom = 0.5;
let snapEnabled = true;
let drawMode    = null;
let autoAdvanceTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    const canvas       = document.getElementById('canvas');
    const container    = document.getElementById('canvas-container');
    const floatingMenu = document.getElementById('floating-menu');
    const imageUpload  = document.getElementById('image-upload');
    const pdfInput     = document.getElementById('pdf-file-input');

    const bindClick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

    // ── 解像度設定 ──────────────────────────────────────────
    function updateCanvasResolution() {
        const sel = document.getElementById('slide-size-select');
        if (!sel || !canvas) return;
        const [w, h] = sel.value.split('x').map(Number);
        currentWidth = w; currentHeight = h;
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
        applyZoom();
        renderSlideList();
    }
    document.getElementById('slide-size-select')?.addEventListener('change', () => {
        saveState(); updateCanvasResolution();
    });

    // ── 2. 履歴 ─────────────────────────────────────────────
    function saveState() {
        if (!canvas) return;
        const s = slides[currentSlideIndex];
        const cur = canvas.innerHTML;
        if (s.undoStack.length > 0 && s.undoStack.at(-1) === cur) return;
        s.undoStack.push(cur);
        s.redoStack = [];
        updateUndoRedoUI();
    }
    function updateUndoRedoUI() {
        const s = slides[currentSlideIndex];
        const u = document.getElementById('undo-btn'); if (u) u.disabled = !s.undoStack.length;
        const r = document.getElementById('redo-btn'); if (r) r.disabled = !s.redoStack.length;
    }
    bindClick('undo-btn', () => {
        const s = slides[currentSlideIndex]; if (!s.undoStack.length) return;
        s.redoStack.push(canvas.innerHTML);
        canvas.innerHTML = s.undoStack.pop();
        reattachEvents(); updateUndoRedoUI();
    });
    bindClick('redo-btn', () => {
        const s = slides[currentSlideIndex]; if (!s.redoStack.length) return;
        s.undoStack.push(canvas.innerHTML);
        canvas.innerHTML = s.redoStack.pop();
        reattachEvents(); updateUndoRedoUI();
    });

    // ── 3. ズーム（ボタン・ホイール・ピンチ） ────────────────
    function applyZoom() {
        const isPresenting = document.fullscreenElement || document.webkitFullscreenElement
                           || document.querySelector('.pseudo-fullscreen');
        if (isPresenting) return;
        if (canvas) {
            canvas.style.transform       = `scale(${currentZoom})`;
            canvas.style.transformOrigin = 'center center';
        }
        const lbl = document.getElementById('zoom-label');
        if (lbl) lbl.textContent = Math.round(currentZoom * 100) + '%';
    }
    bindClick('zoom-in-btn',    () => { currentZoom = Math.min(2.0, currentZoom + 0.1); applyZoom(); });
    bindClick('zoom-out-btn',   () => { currentZoom = Math.max(0.15, currentZoom - 0.1); applyZoom(); });
    bindClick('zoom-reset-btn', () => { currentZoom = 0.5; applyZoom(); });

    // Ctrl+Wheel ズーム
    container?.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            currentZoom = e.deltaY < 0
                ? Math.min(2.0, currentZoom + 0.04)
                : Math.max(0.15, currentZoom - 0.04);
            applyZoom();
        }
    }, { passive: false });

    // iPad ピンチズーム
    let touchStartDist = 0, touchStartZoom = 1.0;
    container?.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            touchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                                        e.touches[0].clientY - e.touches[1].clientY);
            touchStartZoom = currentZoom;
        }
    }, { passive: false });
    container?.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && touchStartDist > 0) {
            e.preventDefault();
            const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                                 e.touches[0].clientY - e.touches[1].clientY);
            currentZoom = Math.min(2.0, Math.max(0.15, touchStartZoom * (d / touchStartDist)));
            applyZoom();
        }
    }, { passive: false });
    container?.addEventListener('touchend', (e) => { if (e.touches.length < 2) touchStartDist = 0; });

    // ── 4. 要素作成 ─────────────────────────────────────────
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el = document.createElement('div');
        el.className = `canvas-element ${typeClass}`;
        Object.assign(el.style, {
            width: w + 'px', height: h + 'px',
            left: '120px', top: '120px',
            zIndex: maxZIndex++, touchAction: 'none'
        });
        el.setAttribute('data-animation', 'none');
        el.setAttribute('data-anim-delay', '0');
        ['nw','ne','sw','se'].forEach(dir => {
            const h2 = document.createElement('div');
            h2.className = `resize-handle ${dir}`;
            h2.dataset.direction = dir;
            el.appendChild(h2);
        });
        canvas.appendChild(el);
        initElementEvents(el);
        selectElement(el);
        renderSlideList();
        return el;
    }

    bindClick('add-text-btn', () => {
        const el = createBaseElement('text-element', 400, 90);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.contentEditable = true;
        Object.assign(inner.style, { fontSize:'32px', color:'#0f172a', fontFamily:"'Noto Sans JP', sans-serif", textAlign:'left' });
        inner.innerText = 'テキストを入力';
        el.appendChild(inner);
        inner.onblur  = () => { saveState(); renderSlideList(); };
        inner.oninput = () => renderSlideList();
    });

    bindClick('add-rect-btn', () => {
        const el = createBaseElement('rect-element', 200, 140);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper'; inner.style.backgroundColor = '#2563eb'; inner.style.borderRadius = '4px';
        el.appendChild(inner);
    });

    bindClick('add-circle-btn', () => {
        const el = createBaseElement('rect-element circle-element', 150, 150);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper'; inner.style.backgroundColor = '#7c3aed'; inner.style.borderRadius = '50%';
        el.appendChild(inner);
    });

    bindClick('add-line-btn', () => {
        const el = createBaseElement('rect-element line-element', 250, 5);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper'; inner.style.backgroundColor = '#0f172a';
        el.appendChild(inner);
    });

    bindClick('insert-arrow-btn', () => {
        const el = createBaseElement('rect-element', 180, 45);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper'; inner.style.display = 'flex'; inner.style.alignItems = 'center';
        inner.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 180 45" fill="none" preserveAspectRatio="none"><path d="M4 22.5h155M143 9l18 13.5-18 13.5" stroke="#2563eb" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        el.appendChild(inner);
    });

    bindClick('insert-star-btn', () => {
        const el = createBaseElement('rect-element', 140, 140);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 120 120" fill="none"><path d="M60 8l13.5 27.6 30.5 4.4-22 21.4 5.2 30.4L60 77l-27.2 14.8 5.2-30.4L16 39.9l30.5-4.4z" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/></svg>`;
        el.appendChild(inner);
    });

    if (imageUpload) {
        bindClick('add-image-btn', () => imageUpload.click());
        imageUpload.onchange = (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const el = createBaseElement('image-element', 360, 270);
                const img = document.createElement('img');
                img.className = 'content-wrapper'; img.src = ev.target.result;
                el.appendChild(img); selectElement(el);
            };
            reader.readAsDataURL(file); imageUpload.value = '';
        };
    }

    // ── 5. ドラッグ＆リサイズ（setPointerCapture安定版） ────
    function initElementEvents(el) {
        if (el.classList.contains('drawing-element')) return;
        let isDrag = false, isRes = false;
        let sx, sy, ox, oy, sw, sh, dir;

        el.addEventListener('pointerdown', (e) => {
            if (e.target.classList.contains('resize-handle')) return;
            if (el.classList.contains('text-element') && e.target.classList.contains('content-wrapper') && selectedElement === el) return;
            isDrag = true; saveState();
            el.setPointerCapture(e.pointerId);
            sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;
            selectElement(el); e.stopPropagation();
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
            const MIN = 15;
            if (isDrag) {
                let nx = ox + dx, ny = oy + dy;
                if (snapEnabled) { nx = Math.round(nx / 10) * 10; ny = Math.round(ny / 10) * 10; }
                el.style.left = nx + 'px'; el.style.top = ny + 'px';
                updateFloatingMenuPosition(); updatePropsPosition();
            }
            if (isRes) {
                if (dir === 'se') {
                    el.style.width  = Math.max(MIN, sw + dx) + 'px';
                    el.style.height = Math.max(MIN, sh + dy) + 'px';
                } else if (dir === 'sw') {
                    const nw = Math.max(MIN, sw - dx);
                    if (nw > MIN) { el.style.left = (ox + dx) + 'px'; el.style.width = nw + 'px'; }
                    el.style.height = Math.max(MIN, sh + dy) + 'px';
                } else if (dir === 'ne') {
                    el.style.width = Math.max(MIN, sw + dx) + 'px';
                    const nh = Math.max(MIN, sh - dy);
                    if (nh > MIN) { el.style.top = (oy + dy) + 'px'; el.style.height = nh + 'px'; }
                } else if (dir === 'nw') {
                    const nw = Math.max(MIN, sw - dx), nh = Math.max(MIN, sh - dy);
                    if (nw > MIN) { el.style.left = (ox + dx) + 'px'; el.style.width = nw + 'px'; }
                    if (nh > MIN) { el.style.top  = (oy + dy) + 'px'; el.style.height = nh + 'px'; }
                }
                updateFloatingMenuPosition(); updatePropsSize();
            }
        });

        document.addEventListener('pointerup', (e) => {
            if (isDrag) { try { el.releasePointerCapture(e.pointerId); } catch(_){} isDrag = false; renderSlideList(); }
            if (isRes)  { isRes = false; renderSlideList(); }
        });
    }

    // ── 6. 選択・プロパティ同期 ──────────────────────────────
    function selectElement(el) {
        if (!el) return;
        if (selectedElement && selectedElement !== el) selectedElement.classList.remove('selected');
        selectedElement = el; el.classList.add('selected');

        const inner = el.querySelector('.content-wrapper');
        const style  = inner ? window.getComputedStyle(inner) : null;
        const anim   = el.getAttribute('data-animation') || 'none';
        const delay  = el.getAttribute('data-anim-delay') || '0';

        document.querySelectorAll('.anim-set-btn').forEach(b => b.classList.toggle('active', b.dataset.anim === anim));
        const fa = document.getElementById('float-anim-select'); if (fa) fa.value = anim;
        const ad = document.getElementById('anim-delay'); if (ad) ad.value = delay;

        const isText = el.classList.contains('text-element');
        const textGroup = document.querySelector('.text-only-tools');
        if (textGroup) textGroup.style.display = isText ? 'flex' : 'none';

        // ★ テキスト選択時にリボンUIを「Home」タブに戻す処理を追加
        if (isText) {
            openTab(null, 'tab-home');
        }

        if (style && isText) {
            const fs = document.getElementById('font-size'); if (fs) fs.value = parseInt(style.fontSize) || 32;
            const ec = document.getElementById('element-color'); if (ec) ec.value = rgbToHex(style.color);
            const fc = document.getElementById('float-color');   if (fc) fc.value = rgbToHex(style.color);
        }
        updatePropsPanel(); updateFloatingMenuPosition();
    }

    function deselect() {
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement = null;
        floatingMenu?.classList.add('hidden');
        const textGroup = document.querySelector('.text-only-tools');
        if (textGroup) textGroup.style.display = 'none';
        updatePropsPanel();
    }
    canvas?.addEventListener('pointerdown', (e) => { if (e.target === canvas) deselect(); });

    function updateFloatingMenuPosition() {
        if (!floatingMenu || !selectedElement) { floatingMenu?.classList.add('hidden'); return; }
        floatingMenu.classList.remove('hidden');
        floatingMenu.style.top  = Math.max(4, selectedElement.offsetTop - 46) + 'px';
        floatingMenu.style.left = Math.max(4, selectedElement.offsetLeft) + 'px';
    }

    // ── プロパティパネル ─────────────────────────────────────
    function updatePropsPanel() {
        const noSel   = document.getElementById('props-no-select');
        const cont    = document.getElementById('props-content');
        const textSec = document.getElementById('text-props');
        const shapeSec= document.getElementById('shape-props');
        if (!selectedElement) {
            noSel?.classList.remove('hidden'); cont?.classList.add('hidden'); return;
        }
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
                const pc = document.getElementById('prop-color');    if (pc) pc.value = rgbToHex(s.color);
                const pff= document.getElementById('prop-fontfamily');
                if (pff) {
                    const cur = s.fontFamily.replace(/['"]/g,'').toLowerCase();
                    for (const opt of pff.options) {
                        if (opt.value.replace(/['"]/g,'').toLowerCase().includes(cur.split(',')[0].trim())) {
                            pff.value = opt.value; break;
                        }
                    }
                }
            } else {
                const fill = document.getElementById('prop-fill'); if (fill) fill.value = rgbToHex(s.backgroundColor);
            }
        }
        const op  = Math.round((parseFloat(selectedElement.style.opacity) || 1) * 100);
        const po  = document.getElementById('prop-opacity'); if (po) po.value = op;
        const pov = document.getElementById('prop-opacity-val'); if (pov) pov.textContent = op + '%';
    }
    function updatePropsPosition() {
        if (!selectedElement) return;
        const px = document.getElementById('prop-x'); if (px) px.value = parseInt(selectedElement.style.left) || 0;
        const py = document.getElementById('prop-y'); if (py) py.value = parseInt(selectedElement.style.top)  || 0;
    }
    function updatePropsSize() {
        if (!selectedElement) return;
        const pw = document.getElementById('prop-w'); if (pw) pw.value = parseInt(selectedElement.style.width)  || 0;
        const ph = document.getElementById('prop-h'); if (ph) ph.value = parseInt(selectedElement.style.height) || 0;
    }

    // プロパティ入力 → 要素反映
    ['prop-x','prop-y','prop-w','prop-h'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            if (!selectedElement) return; saveState();
            selectedElement.style.left   = (parseInt(document.getElementById('prop-x')?.value)||0) + 'px';
            selectedElement.style.top    = (parseInt(document.getElementById('prop-y')?.value)||0) + 'px';
            selectedElement.style.width  = (parseInt(document.getElementById('prop-w')?.value)||20) + 'px';
            selectedElement.style.height = (parseInt(document.getElementById('prop-h')?.value)||20) + 'px';
            updateFloatingMenuPosition(); renderSlideList();
        });
    });
    document.getElementById('prop-fontsize')?.addEventListener('change', (e) => {
        const inner = selectedElement?.querySelector('.content-wrapper'); if (inner) inner.style.fontSize = e.target.value + 'px';
    });
    document.getElementById('prop-fontfamily')?.addEventListener('change', (e) => {
        const inner = selectedElement?.querySelector('.content-wrapper'); if (inner) inner.style.fontFamily = e.target.value;
    });
    document.getElementById('prop-color')?.addEventListener('input', (e) => {
        const inner = selectedElement?.querySelector('.content-wrapper'); if (inner) inner.style.color = e.target.value;
        const ec = document.getElementById('element-color'); if (ec) ec.value = e.target.value;
    });
    document.getElementById('prop-fill')?.addEventListener('input', (e) => {
        const inner = selectedElement?.querySelector('.content-wrapper'); if (inner) inner.style.backgroundColor = e.target.value;
        renderSlideList();
    });
    document.getElementById('prop-opacity')?.addEventListener('input', (e) => {
        if (!selectedElement) return;
        selectedElement.style.opacity = e.target.value / 100;
        const pov = document.getElementById('prop-opacity-val'); if (pov) pov.textContent = e.target.value + '%';
    });

    // ── 7. テキスト書式・色 ─────────────────────────────────
    const patchText = (key, val) => {
        if (!selectedElement?.classList.contains('text-element')) return;
        saveState();
        const inner = selectedElement.querySelector('.content-wrapper');
        if (inner) inner.style[key] = val;
        updatePropsPanel(); renderSlideList();
    };
    bindClick('align-left-btn',    () => patchText('textAlign', 'left'));
    bindClick('align-center-btn', () => patchText('textAlign', 'center'));
    bindClick('align-right-btn',  () => patchText('textAlign', 'right'));
    bindClick('bold-btn',   () => { const inner = selectedElement?.querySelector('.content-wrapper'); if (inner) patchText('fontWeight', window.getComputedStyle(inner).fontWeight === '700' ? '400' : '700'); });
    bindClick('italic-btn', () => { const inner = selectedElement?.querySelector('.content-wrapper'); if (inner) patchText('fontStyle', window.getComputedStyle(inner).fontStyle === 'italic' ? 'normal' : 'italic'); });
    bindClick('float-bold',   () => { const inner = selectedElement?.querySelector('.content-wrapper'); if (inner) patchText('fontWeight', window.getComputedStyle(inner).fontWeight === '700' ? '400' : '700'); });
    bindClick('float-italic', () => { const inner = selectedElement?.querySelector('.content-wrapper'); if (inner) patchText('fontStyle', window.getComputedStyle(inner).fontStyle === 'italic' ? 'normal' : 'italic'); });

    document.getElementById('font-family')?.addEventListener('change', (e) => patchText('fontFamily', e.target.value));
    document.getElementById('font-size')?.addEventListener('input',   (e) => patchText('fontSize', e.target.value + 'px'));
    document.getElementById('element-color')?.addEventListener('input', (e) => {
        if (!selectedElement) return;
        const inner = selectedElement.querySelector('.content-wrapper'); if (!inner) return;
        if (selectedElement.classList.contains('text-element')) inner.style.color = e.target.value;
        else inner.style.backgroundColor = e.target.value;
        const fc = document.getElementById('float-color'); if (fc) fc.value = e.target.value;
        const pc = document.getElementById('prop-color');  if (pc) pc.value = e.target.value;
    });
    document.getElementById('float-color')?.addEventListener('input', (e) => {
        if (!selectedElement) return;
        const inner = selectedElement.querySelector('.content-wrapper'); if (!inner) return;
        if (selectedElement.classList.contains('text-element')) inner.style.color = e.target.value;
        else inner.style.backgroundColor = e.target.value;
        const ec = document.getElementById('element-color'); if (ec) ec.value = e.target.value;
    });

    // ── 8. レイヤー・複製・削除 ──────────────────────────────
    bindClick('bring-front-btn',  () => { if (selectedElement) { saveState(); selectedElement.style.zIndex = maxZIndex++; } });
    bindClick('send-back-btn',    () => { if (selectedElement) { saveState(); selectedElement.style.zIndex = 1; } });
    bindClick('float-layer-front',() => { if (selectedElement) { saveState(); selectedElement.style.zIndex = maxZIndex++; } });
    bindClick('float-send-back',  () => { if (selectedElement) { saveState(); selectedElement.style.zIndex = 1; } });

    bindClick('duplicate-btn', () => {
        if (!selectedElement) return; saveState();
        const clone = selectedElement.cloneNode(true);
        clone.classList.remove('selected');
        clone.style.left = (parseInt(selectedElement.style.left) + 20) + 'px';
        clone.style.top  = (parseInt(selectedElement.style.top)  + 20) + 'px';
        clone.style.zIndex = maxZIndex++;
        canvas.appendChild(clone); initElementEvents(clone); selectElement(clone);
        renderSlideList();
    });

    const removeSelected = () => {
        if (!selectedElement) return; saveState();
        selectedElement.remove(); deselect(); renderSlideList();
    };
    bindClick('delete-btn',   removeSelected);
    bindClick('float-delete', removeSelected);

    // ── 9. Designタブ ───────────────────────────────────────
    document.querySelectorAll('.theme-swatch').forEach(sw => {
        sw.onclick = () => {
            saveState();
            const bg = sw.dataset.bg;
            const s  = slides[currentSlideIndex];
            s.bg = bg;
            s.bgStyle = bg.includes('gradient') ? 'gradient' : 'color';
            if (s.bgStyle === 'gradient') { canvas.style.background = bg; canvas.style.backgroundImage = bg; }
            else { canvas.style.background = bg; canvas.style.backgroundImage = 'none'; }
            renderSlideList();
        };
    });
    document.getElementById('slide-bg-color')?.addEventListener('input', (e) => {
        const s = slides[currentSlideIndex];
        s.bg = e.target.value; s.bgStyle = 'color';
        canvas.style.background = e.target.value;
        canvas.style.backgroundImage = 'none';
        renderSlideList();
    });

    let elemOpacity = 100;
    bindClick('opacity-up-btn', () => {
        if (!selectedElement) return;
        elemOpacity = Math.min(100, elemOpacity + 10);
        selectedElement.style.opacity = elemOpacity / 100;
        document.getElementById('opacity-label').textContent = elemOpacity + '%';
        updatePropsPanel();
    });
    bindClick('opacity-down-btn', () => {
        if (!selectedElement) return;
        elemOpacity = Math.max(10, elemOpacity - 10);
        selectedElement.style.opacity = elemOpacity / 100;
        document.getElementById('opacity-label').textContent = elemOpacity + '%';
        updatePropsPanel();
    });

    // ── 10. Transitionタブ ───────────────────────────────────
    document.querySelectorAll('.trans-btn').forEach(btn => {
        btn.onclick = () => {
            slides[currentSlideIndex].transition = btn.dataset.trans;
            document.querySelectorAll('.trans-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
    });

    // ── 11. Animationタブ ────────────────────────────────────
    function setAnimation(name) {
        if (!selectedElement) return; saveState();
        selectedElement.setAttribute('data-animation', name);
        const delay = parseFloat(document.getElementById('anim-delay')?.value || 0);
        selectedElement.setAttribute('data-anim-delay', delay);
        selectedElement.style.animationDelay = delay + 's';
        document.querySelectorAll('.anim-set-btn').forEach(b => b.classList.toggle('active', b.dataset.anim === name));
        const fa = document.getElementById('float-anim-select'); if (fa) fa.value = name;
        selectedElement.classList.remove('play-anim'); void selectedElement.offsetWidth;
        selectedElement.classList.add('play-anim');
    }
    document.querySelectorAll('.anim-set-btn').forEach(b => { b.onclick = () => setAnimation(b.dataset.anim); });
    document.getElementById('float-anim-select')?.addEventListener('change', e => setAnimation(e.target.value));
    document.getElementById('anim-delay')?.addEventListener('change', () => {
        if (!selectedElement) return;
        const v = parseFloat(document.getElementById('anim-delay').value) || 0;
        selectedElement.setAttribute('data-anim-delay', v);
        selectedElement.style.animationDelay = v + 's';
    });

    // ── 12. Drawタブ ─────────────────────────────────────────
    let drawCanvas, drawCtx;
    function ensureDrawCanvas() {
        if (document.getElementById('draw-canvas')) {
            drawCanvas = document.getElementById('draw-canvas');
            drawCtx    = drawCanvas.getContext('2d');
            return;
        }
        drawCanvas = document.createElement('canvas');
        drawCanvas.id = 'draw-canvas';
        drawCanvas.width  = currentWidth;
        drawCanvas.height = currentHeight;
        document.getElementById('canvas-container').appendChild(drawCanvas);
        drawCtx = drawCanvas.getContext('2d');
        let px, py, drawing = false;
        drawCanvas.addEventListener('pointerdown', e => {
            if (!drawMode) return; drawing = true;
            const r = drawCanvas.getBoundingClientRect();
            px = (e.clientX - r.left) / currentZoom;
            py = (e.clientY - r.top)  / currentZoom;
            drawCtx.beginPath(); drawCtx.moveTo(px, py);
        });
        drawCanvas.addEventListener('pointermove', e => {
            if (!drawing) return;
            const r  = drawCanvas.getBoundingClientRect();
            const cx = (e.clientX - r.left) / currentZoom;
            const cy = (e.clientY - r.top)  / currentZoom;
            const sz = parseInt(document.getElementById('draw-size')?.value || 4);
            const co = document.getElementById('draw-color')?.value || '#2563eb';
            drawCtx.lineWidth  = drawMode === 'eraser' ? sz * 3 : sz;
            drawCtx.strokeStyle= drawMode === 'eraser' ? 'rgba(255,255,255,1)' : co;
            drawCtx.lineCap    = 'round'; drawCtx.lineJoin = 'round';
            drawCtx.globalCompositeOperation = drawMode === 'eraser' ? 'destination-out' : 'source-over';
            drawCtx.lineTo(cx, cy); drawCtx.stroke();
            px = cx; py = cy;
        });
        drawCanvas.addEventListener('pointerup', () => { drawing = false; });
    }
    bindClick('draw-pen-btn', () => {
        ensureDrawCanvas(); drawMode = 'pen';
        document.getElementById('draw-canvas').className = 'active';
        deselect();
    });
    bindClick('draw-eraser-btn', () => {
        ensureDrawCanvas(); drawMode = 'eraser';
        document.getElementById('draw-canvas').className = 'active eraser-mode';
        deselect();
    });
    bindClick('draw-stop-btn', () => {
        drawMode = null;
        const dc = document.getElementById('draw-canvas'); if (dc) dc.className = '';
    });
    document.getElementById('draw-size')?.addEventListener('input', e => {
        const lbl = document.getElementById('draw-size-label'); if (lbl) lbl.textContent = e.target.value;
    });

    // ── 13. Displayタブ ──────────────────────────────────────
    let showGrid = false;
    bindClick('toggle-grid-btn', () => {
        showGrid = !showGrid; canvas?.classList.toggle('show-grid', showGrid);
        document.getElementById('toggle-grid-btn')?.classList.toggle('active-toggle', showGrid);
    });
    let showRuler = false;
    bindClick('toggle-ruler-btn', () => {
        showRuler = !showRuler;
        document.getElementById('canvas-ruler-h')?.classList.toggle('hidden', !showRuler);
        document.getElementById('canvas-ruler-v')?.classList.toggle('hidden', !showRuler);
        document.getElementById('toggle-ruler-btn')?.classList.toggle('active-toggle', showRuler);
    });
    document.getElementById('snap-toggle')?.addEventListener('change', e => { snapEnabled = e.target.checked; });

    // ── 14. Proofreading ─────────────────────────────────────
    function getTextContent() {
        const arr = [];
        canvas?.querySelectorAll('.text-element .content-wrapper').forEach(el => {
            if (el.innerText?.trim()) arr.push(el.innerText.trim());
        });
        return arr;
    }
    bindClick('word-count-btn', () => {
        const texts = getTextContent();
        const all   = texts.join(' ');
        const words = all.trim().split(/\s+/).filter(w=>w).length;
        const chars = all.replace(/\s/g,'').length;
        const res   = document.getElementById('proofread-result');
        const txt   = document.getElementById('proofread-text');
        if (txt) txt.textContent = `スライド: ${slides.length}  単語: ${words}  文字（空白除く）: ${chars}`;
        if (res) res.style.display = 'flex';
    });
    bindClick('spellcheck-btn', () => {
        const texts = getTextContent();
        const res   = document.getElementById('proofread-result');
        const txt   = document.getElementById('proofread-text');
        if (txt) txt.textContent = texts.length
            ? `${texts.length} 個のテキスト要素 / 合計 ${texts.join('').length} 文字`
            : 'テキスト要素が見つかりません';
        if (res) res.style.display = 'flex';
    });

    // ── 15. スライド管理 ─────────────────────────────────────
    function renderSlideList() {
        const list = document.getElementById('slide-list'); if (!list) return;
        list.innerHTML = '';
        slides.forEach((s, i) => {
            const thumb = document.createElement('div');
            thumb.className = `slide-thumb ${i === currentSlideIndex ? 'active' : ''}`;
            thumb.style.aspectRatio = `${currentWidth} / ${currentHeight}`;

            const preview = document.createElement('div');
            preview.className = 'thumb-preview-container';
            preview.style.width  = currentWidth  + 'px';
            preview.style.height = currentHeight + 'px';
            preview.innerHTML = (i === currentSlideIndex) ? canvas.innerHTML : s.html;

            if (s.bgStyle === 'gradient') { preview.style.background = s.bg; }
            else { preview.style.backgroundColor = s.bg || '#fff'; preview.style.backgroundImage = 'none'; }

            const containerW = list.clientWidth - 4 || 170;
            preview.style.transform = `scale(${containerW / currentWidth})`;

            const num = document.createElement('div');
            num.className = 'slide-thumb-number'; num.textContent = i + 1;

            thumb.appendChild(preview);
            thumb.appendChild(num);
            thumb.onclick = () => switchSlide(i);
            list.appendChild(thumb);
        });
    }

    function switchSlide(idx, applyTrans = false) {
        if (!canvas || idx < 0 || idx >= slides.length) return;
        // 現在スライドを保存
        slides[currentSlideIndex].html = canvas.innerHTML;
        const cur = slides[currentSlideIndex];
        cur.bgStyle = canvas.style.backgroundImage && canvas.style.backgroundImage !== 'none' ? 'gradient' : 'color';
        cur.bg = cur.bgStyle === 'gradient' ? canvas.style.backgroundImage : (canvas.style.backgroundColor || '#fff');

        currentSlideIndex = idx;
        const s = slides[idx];
        canvas.innerHTML = s.html;

        if (s.bgStyle === 'gradient') { canvas.style.background = s.bg; canvas.style.backgroundImage = s.bg; }
        else { canvas.style.background = s.bg || '#fff'; canvas.style.backgroundImage = 'none'; }

        // トランジション
        if (applyTrans && s.transition && s.transition !== 'none') {
            const area = document.getElementById('canvas-area');
            area?.classList.remove('trans-fade','trans-slide','trans-zoom');
            void area?.offsetWidth;
            const spd  = parseFloat(document.getElementById('trans-speed')?.value || 0.7);
            const cls  = `trans-${s.transition}`;
            if (area) { area.style.setProperty('--trans-duration', spd + 's'); area.classList.add(cls); }
            setTimeout(() => area?.classList.remove(cls), spd * 1000 + 50);
        }

        reattachEvents();
        renderSlideList();
        updateUndoRedoUI();
        const sn = document.getElementById('slide-number'); if (sn) sn.textContent = `${idx+1} / ${slides.length}`;
    }

    bindClick('add-slide-btn', () => {
        slides[currentSlideIndex].html = canvas.innerHTML;
        slides.push({ html:'', bg:'#ffffff', bgStyle:'color', transition:'none', undoStack:[], redoStack:[] });
        switchSlide(slides.length - 1);
    });

    bindClick('delete-slide-btn', () => {
        if (slides.length <= 1) { alert('最後のスライドは削除できません。'); return; }
        if (!confirm('このスライドを削除しますか？')) return;
        slides.splice(currentSlideIndex, 1);
        const next = Math.max(0, currentSlideIndex - 1);
        currentSlideIndex = next;
        const s = slides[next];
        canvas.innerHTML = s.html;
        if (s.bgStyle === 'gradient') { canvas.style.background = s.bg; canvas.style.backgroundImage = s.bg; }
        else { canvas.style.background = s.bg || '#fff'; canvas.style.backgroundImage = 'none'; }
        reattachEvents(); renderSlideList(); updateUndoRedoUI();
    });

    function reattachEvents() {
        if (!canvas) return;
        Array.from(canvas.children).forEach(el => { if (el.id !== 'floating-menu') initElementEvents(el); });
        deselect();
    }

    // ── 16. PDF インポート ───────────────────────────────────
    if (pdfInput) {
        bindClick('btn-import-pdf', () => pdfInput.click());
        pdfInput.onchange = async (e) => {
            const file = e.target.files[0]; if (!file || !window.pdfjsLib) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ev.target.result) }).promise;
                    const imported = [];
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const vp   = page.getViewport({ scale: 2.0 });
                        const rc   = document.createElement('canvas');
                        rc.width = vp.width; rc.height = vp.height;
                        await page.render({ canvasContext: rc.getContext('2d'), viewport: vp }).promise;
                        imported.push({
                            html: `<div class="canvas-element image-element" style="width:${currentWidth}px;height:${currentHeight}px;left:0;top:0;z-index:50;"><img class="content-wrapper" src="${rc.toDataURL('image/png')}" style="width:100%;height:100%;object-fit:contain;pointer-events:none;"></div>`,
                            bg: '#ffffff', bgStyle: 'color', transition: 'none', undoStack:[], redoStack:[]
                        });
                    }
                    if (imported.length > 0) {
                        if (slides.length === 1 && !slides[0].html) slides = imported;
                        else slides = slides.concat(imported);
                        currentSlideIndex = 0;
                        switchSlide(0);
                    }
                } catch (err) { alert('PDF インポートに失敗しました: ' + err.message); }
            };
            reader.readAsArrayBuffer(file); pdfInput.value = '';
        };
    }

    // ── 17. エクスポート ─────────────────────────────────────
    bindClick('export-pdf-btn', async () => {
        if (!window.jspdf || !window.html2canvas) { alert('ライブラリが不足しています。'); return; }
        const { jsPDF } = window.jspdf;
        const pdf  = new jsPDF({ orientation:'landscape', unit:'px', format:[currentWidth, currentHeight] });
        const orig = currentSlideIndex;
        deselect(); slides[orig].html = canvas.innerHTML;

        const origTransform = canvas.style.transform;
        canvas.style.transform = 'scale(1)';
        canvas.style.transformOrigin = 'top left';

        for (let i = 0; i < slides.length; i++) {
            if (i > 0) pdf.addPage([currentWidth, currentHeight], 'landscape');
            canvas.innerHTML = slides[i].html;
            const s = slides[i];
            if (s.bgStyle === 'gradient') { canvas.style.background = s.bg; }
            else { canvas.style.backgroundColor = s.bg || '#fff'; canvas.style.backgroundImage = 'none'; }
            const cap = await html2canvas(canvas, { width: currentWidth, height: currentHeight, scale: 1, useCORS: true, logging: false });
            pdf.addImage(cap.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, currentWidth, currentHeight);
        }
        canvas.style.transform = origTransform;
        switchSlide(orig);
        pdf.save('presentation.pdf');
    });

    bindClick('export-pptx-btn', () => {
        if (!window.PptxGenJS) { alert('PPTXライブラリが読み込まれていません。'); return; }
        const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_16x9';
        slides[currentSlideIndex].html = canvas.innerHTML;
        slides.forEach(s => {
            const sl = pptx.addSlide();
            if (s.bgStyle === 'color') sl.background = { fill: (s.bg || '#ffffff').replace('#','') };
            const tmp = document.createElement('div'); tmp.innerHTML = s.html;
            tmp.querySelectorAll('.canvas-element').forEach(el => {
                const inner = el.querySelector('.content-wrapper'); if (!inner) return;
                const fx = currentWidth / 10, fy = currentHeight / 5.625;
                const x  = (parseInt(el.style.left)||0) / fx;
                const y  = (parseInt(el.style.top) ||0) / fy;
                const w  = (parseInt(el.style.width) ||100) / fx;
                const h  = (parseInt(el.style.height)||50)  / fy;
                if (el.classList.contains('text-element')) {
                    const ff = (inner.style.fontFamily || 'Arial').split(',')[0].replace(/['"]/g,'').trim();
                    sl.addText(inner.innerText || '', {
                        x, y, w, h,
                        fontSize: (parseInt(inner.style.fontSize) || 24) * 0.75,
                        color: rgbToHex(window.getComputedStyle(inner).color).replace('#',''),
                        fontFace: ff, align: inner.style.textAlign || 'left'
                    });
                } else if (el.classList.contains('image-element')) {
                    const img = el.querySelector('img'); if (img?.src) sl.addImage({ data: img.src, x, y, w, h });
                } else if (el.classList.contains('rect-element')) {
                    const shape = el.classList.contains('circle-element') ? pptx.ShapeType.oval : pptx.ShapeType.rectangle;
                    sl.addShape(shape, { x, y, w, h, fill: { color: rgbToHex(window.getComputedStyle(inner).backgroundColor).replace('#','') } });
                }
            });
        });
        pptx.writeFile({ fileName: 'presentation.pptx' });
    });

    // ── 18. プレゼンテーション ───────────────────────────────
    function layoutPresentation() {
        const isPresent = document.fullscreenElement || document.webkitFullscreenElement
                       || document.querySelector('.pseudo-fullscreen');
        if (!isPresent || !canvas) return;
        const scale = Math.min(window.innerWidth / currentWidth, window.innerHeight / currentHeight);
        canvas.style.transform       = `scale(${scale})`;
        canvas.style.transformOrigin = 'center center';
        canvas.style.position        = 'absolute';
        canvas.style.left = '50%';
        canvas.style.top  = '50%';
        canvas.style.margin = `-${currentHeight/2}px 0 0 -${currentWidth/2}px`;
    }
    window.addEventListener('resize', () => {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.querySelector('.pseudo-fullscreen'))
            layoutPresentation();
    });

    function triggerPresentationUI(entering) {
        const ctrl = document.getElementById('presenter-controls'); if (!ctrl) return;
        ctrl.classList.toggle('hidden', !entering);
        if (entering) {
            deselect();
            slides[currentSlideIndex].html = canvas.innerHTML;
            document.getElementById('slide-number').textContent = `${currentSlideIndex+1} / ${slides.length}`;
            layoutPresentation();
            playSlideAnimations();
            const sec = parseFloat(document.getElementById('auto-advance')?.value || 0);
            if (sec > 0) {
                clearInterval(autoAdvanceTimer);
                autoAdvanceTimer = setInterval(() => {
                    if (currentSlideIndex < slides.length - 1) goNextSlide();
                    else clearInterval(autoAdvanceTimer);
                }, sec * 1000);
            }
        } else {
            clearInterval(autoAdvanceTimer);
            document.querySelector('.canvas-area')?.classList.remove('pseudo-fullscreen');
            canvas.style.position = '';
            canvas.style.left     = '';
            canvas.style.top      = '';
            canvas.style.margin   = '';
            applyZoom();
        }
    }
    document.addEventListener('fullscreenchange', () => triggerPresentationUI(!!document.fullscreenElement));
    document.addEventListener('webkitfullscreenchange', () => triggerPresentationUI(!!document.webkitFullscreenElement));

    function startPresent(fromStart = false) {
        if (fromStart) switchSlide(0);
        const area = document.querySelector('.canvas-area');
        if (area?.requestFullscreen) area.requestFullscreen();
        else if (area?.webkitRequestFullscreen) area.webkitRequestFullscreen();
        else { area?.classList.add('pseudo-fullscreen'); triggerPresentationUI(true); }
    }
    bindClick('present-btn',            () => startPresent(false));
    bindClick('present-from-start-btn', () => startPresent(true));
    bindClick('exit-present-btn', () => {
        clearInterval(autoAdvanceTimer);
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else triggerPresentationUI(false);
    });

    function playSlideAnimations() {
        if (!canvas) return;
        Array.from(canvas.children).forEach(el => {
            const delay = parseFloat(el.getAttribute('data-anim-delay') || 0);
            el.classList.remove('play-anim'); void el.offsetWidth;
            el.style.animationDelay = delay + 's';
            el.classList.add('play-anim');
        });
    }

    function goNextSlide() {
        if (currentSlideIndex < slides.length - 1) switchSlide(currentSlideIndex + 1, true);
        const sn = document.getElementById('slide-number'); if (sn) sn.textContent = `${currentSlideIndex+1} / ${slides.length}`;
        playSlideAnimations();
    }
    function goPrevSlide() {
        if (currentSlideIndex > 0) switchSlide(currentSlideIndex - 1, true);
        const sn = document.getElementById('slide-number'); if (sn) sn.textContent = `${currentSlideIndex+1} / ${slides.length}`;
        playSlideAnimations();
    }
    bindClick('next-slide', goNextSlide);
    bindClick('prev-slide', goPrevSlide);

    // ── 19. キーボードショートカット ─────────────────────────
    document.addEventListener('keydown', e => {
        const tag    = document.activeElement.tagName;
        const inText = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
                    || document.activeElement.isContentEditable;

        const isPresenting = document.fullscreenElement || document.webkitFullscreenElement
                          || document.querySelector('.pseudo-fullscreen');
        if (isPresenting) {
            if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNextSlide(); }
            if (e.key === 'ArrowLeft')                   { e.preventDefault(); goPrevSlide(); }
            if (e.key === 'Escape') document.getElementById('exit-present-btn')?.click();
            return;
        }
        if (inText) return;

        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') { e.preventDefault(); document.getElementById('undo-btn')?.click(); return; }
            if (e.key === 'y') { e.preventDefault(); document.getElementById('redo-btn')?.click(); return; }
            if (e.key === 'd') { e.preventDefault(); document.getElementById('duplicate-btn')?.click(); return; }
        }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }

        if (selectedElement) {
            const pace = e.shiftKey ? 1 : 10;
            if (e.key === 'ArrowLeft')  { e.preventDefault(); selectedElement.style.left = (parseInt(selectedElement.style.left)||0) - pace + 'px'; }
            if (e.key === 'ArrowRight') { e.preventDefault(); selectedElement.style.left = (parseInt(selectedElement.style.left)||0) + pace + 'px'; }
            if (e.key === 'ArrowUp')    { e.preventDefault(); selectedElement.style.top  = (parseInt(selectedElement.style.top) ||0) - pace + 'px'; }
            if (e.key === 'ArrowDown')  { e.preventDefault(); selectedElement.style.top  = (parseInt(selectedElement.style.top) ||0) + pace + 'px'; }
            updateFloatingMenuPosition(); updatePropsPosition(); renderSlideList();
        }
    });

    // ── ユーティリティ ───────────────────────────────────────
    function rgbToHex(rgb) {
        if (!rgb || rgb === 'transparent') return '#000000';
        const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? '#' + m.slice(1).map(v => parseInt(v).toString(16).padStart(2,'0')).join('') : '#000000';
    }

    // ── 初期化 ───────────────────────────────────────────────
    updateCanvasResolution();
    renderSlideList();
    updateUndoRedoUI();
});
