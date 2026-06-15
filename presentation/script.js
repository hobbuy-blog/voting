// ============================================================
//  Leaslide — script.js
// ============================================================

// --- 1. リボンUI タブ切り替え ---
window.openTab = function(evt, tabName) {
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".tab-link").forEach(l => l.classList.remove("active"));
    const t = document.getElementById(tabName);
    if (t) t.classList.add("active");
    if (evt?.currentTarget) evt.currentTarget.classList.add("active");
};

// --- アプリ状態 ---
let slides = [{ html: "", bg: "", bgStyle: "", transition: "none", undoStack: [], redoStack: [] }];
let currentSlideIndex = 0;
let selectedElement = null;
let maxZIndex = 100;
let currentZoom = 1.0;
let snapEnabled = true;
let isDrawing = false;
let drawMode = null; // 'pen' | 'eraser' | null
let autoAdvanceTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    const canvas  = document.getElementById('canvas');
    const floatingMenu = document.getElementById('floating-menu');

    // ── 2. 履歴管理 ──────────────────────────────────────────
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
        const u = document.getElementById('undo-btn');
        const r = document.getElementById('redo-btn');
        if (u) u.disabled = s.undoStack.length === 0;
        if (r) r.disabled = s.redoStack.length === 0;
    }
    const bindClick = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

    bindClick('undo-btn', () => {
        const s = slides[currentSlideIndex];
        if (!s.undoStack.length) return;
        s.redoStack.push(canvas.innerHTML);
        canvas.innerHTML = s.undoStack.pop();
        reattachEvents(); updateUndoRedoUI();
    });
    bindClick('redo-btn', () => {
        const s = slides[currentSlideIndex];
        if (!s.redoStack.length) return;
        s.undoStack.push(canvas.innerHTML);
        canvas.innerHTML = s.redoStack.pop();
        reattachEvents(); updateUndoRedoUI();
    });

    // ── 3. 要素生成 ──────────────────────────────────────────
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el = document.createElement('div');
        el.className = `canvas-element ${typeClass}`;
        el.style.width = w + 'px'; el.style.height = h + 'px';
        el.style.left = '100px'; el.style.top = '100px';
        el.style.zIndex = maxZIndex++;
        el.setAttribute('data-animation', 'none');
        el.setAttribute('data-anim-delay', '0');
        el.style.touchAction = 'none';
        ['nw','ne','sw','se'].forEach(dir => {
            const h2 = document.createElement('div');
            h2.className = `resize-handle ${dir}`;
            h2.dataset.direction = dir;
            el.appendChild(h2);
        });
        if (canvas) canvas.appendChild(el);
        initElementEvents(el);
        selectElement(el);
        return el;
    }

    // テキスト
    bindClick('add-text-btn', () => {
        const el = createBaseElement('text-element', 360, 80);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.contentEditable = true;
        inner.style.fontSize = "32px";
        inner.style.color = "#0f172a";
        inner.style.fontFamily = "'Noto Sans JP', sans-serif";
        inner.style.textAlign = "left";
        inner.innerText = "テキストを入力";
        el.appendChild(inner);
        inner.onblur = saveState;
    });

    // 四角形
    bindClick('add-rect-btn', () => {
        const el = createBaseElement('rect-element', 160, 120);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.style.backgroundColor = "#2563eb";
        inner.style.borderRadius = "4px";
        el.appendChild(inner);
    });

    // 円
    bindClick('add-circle-btn', () => {
        const el = createBaseElement('rect-element circle-element', 120, 120);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.style.backgroundColor = "#7c3aed";
        inner.style.borderRadius = "50%";
        el.appendChild(inner);
    });

    // 線
    bindClick('add-line-btn', () => {
        const el = createBaseElement('rect-element line-element', 200, 4);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.style.backgroundColor = "#0f172a";
        el.appendChild(inner);
    });

    // 矢印 (SVG)
    bindClick('insert-arrow-btn', () => {
        const el = createBaseElement('rect-element', 160, 40);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.style.display = 'flex';
        inner.style.alignItems = 'center';
        inner.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 160 40" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path d="M4 20h140M130 8l16 12-16 12" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        el.appendChild(inner);
    });

    // 星 (SVG)
    bindClick('insert-star-btn', () => {
        const el = createBaseElement('rect-element', 120, 120);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M60 8l13.5 27.6 30.5 4.4-22 21.4 5.2 30.4L60 77l-27.2 14.8 5.2-30.4L16 39.9l30.5-4.4z" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/></svg>`;
        el.appendChild(inner);
    });

    // 画像
    const imageUpload = document.getElementById('image-upload');
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

    // ── 4. ドラッグ＆リサイズ ─────────────────────────────────
    function initElementEvents(el) {
        if (el.classList.contains('drawing-element')) return; // 描画要素はスキップ
        let isDrag = false, isRes = false;
        let sx, sy, ox, oy, sw, sh, dir;

        el.addEventListener('pointerdown', (e) => {
            if (e.target.classList.contains('resize-handle')) return;
            if (el.classList.contains('text-element') && e.target.classList.contains('content-wrapper') && selectedElement === el) return;
            isDrag = true; saveState();
            sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;
            selectElement(el);
            e.stopPropagation();
        });

        el.querySelectorAll('.resize-handle').forEach(h => {
            h.addEventListener('pointerdown', (e) => {
                isRes = true; saveState();
                dir = h.dataset.direction;
                sx = e.clientX; sy = e.clientY;
                sw = el.offsetWidth; sh = el.offsetHeight;
                ox = el.offsetLeft; oy = el.offsetTop;
                e.stopPropagation(); e.preventDefault();
            });
        });

        document.addEventListener('pointermove', (e) => {
            const dx = (e.clientX - sx) / currentZoom;
            const dy = (e.clientY - sy) / currentZoom;
            if (isDrag && selectedElement === el) {
                let nx = ox + dx, ny = oy + dy;
                if (snapEnabled) { nx = Math.round(nx / 10) * 10; ny = Math.round(ny / 10) * 10; }
                el.style.left = nx + 'px'; el.style.top = ny + 'px';
                updateFloatingMenuPosition(); updatePropsPosition();
            }
            if (isRes && selectedElement === el) {
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
                updateFloatingMenuPosition(); updatePropsSize();
            }
        });
        document.addEventListener('pointerup', () => { isDrag = false; isRes = false; });
    }

    // ── 5. 選択・UI同期 ──────────────────────────────────────
    function selectElement(el) {
        if (!el) return;
        if (selectedElement && selectedElement !== el) selectedElement.classList.remove('selected');
        selectedElement = el;
        el.classList.add('selected');
        const inner = el.querySelector('.content-wrapper');
        const style = inner ? window.getComputedStyle(inner) : null;
        const anim = el.getAttribute('data-animation') || 'none';
        const delay = el.getAttribute('data-anim-delay') || '0';

        document.querySelectorAll('.anim-set-btn').forEach(b => b.classList.toggle('active', b.dataset.anim === anim));
        const fa = document.getElementById('float-anim-select'); if (fa) fa.value = anim;
        const ad = document.getElementById('anim-delay'); if (ad) ad.value = delay;

        const isText = el.classList.contains('text-element');
        const textSection = document.querySelector('.text-only-tools');
        if (textSection) textSection.style.display = isText ? 'flex' : 'none';

        // Ribbon font controls
        if (style && isText) {
            const fs = document.getElementById('font-size'); if (fs) fs.value = parseInt(style.fontSize) || 32;
            const ff = document.getElementById('font-family');
            if (ff) {
                const cur = style.fontFamily.replace(/['"]/g, '').toLowerCase();
                let matched = false;
                for (const opt of ff.options) {
                    const ov = opt.value.replace(/['"]/g, '').toLowerCase();
                    if (cur.includes(ov.split(',')[0].trim()) || ov.includes(cur.split(',')[0].trim())) {
                        ff.value = opt.value; matched = true; break;
                    }
                }
                if (!matched && ff.options.length) ff.value = ff.options[0].value;
            }
            const ec = document.getElementById('element-color'); if (ec && style.color) ec.value = rgbToHex(style.color);
            const fc = document.getElementById('float-color');   if (fc && style.color) fc.value = rgbToHex(style.color);
        }

        // Props panel
        updatePropsPanel();
        updateFloatingMenuPosition();
    }

    function updatePropsPanel() {
        const noSel  = document.getElementById('props-no-select');
        const cont   = document.getElementById('props-content');
        const textSec  = document.getElementById('text-props');
        const shapeSec = document.getElementById('shape-props');
        if (!selectedElement) {
            noSel?.classList.remove('hidden');
            cont?.classList.add('hidden');
            return;
        }
        noSel?.classList.add('hidden');
        cont?.classList.remove('hidden');

        const px = document.getElementById('prop-x'); if (px) px.value = parseInt(selectedElement.style.left) || 0;
        const py = document.getElementById('prop-y'); if (py) py.value = parseInt(selectedElement.style.top)  || 0;
        updatePropsSize();

        const isText = selectedElement.classList.contains('text-element');
        textSec?.classList.toggle('hidden', !isText);
        shapeSec?.classList.toggle('hidden', isText);

        if (isText) {
            const inner = selectedElement.querySelector('.content-wrapper');
            if (inner) {
                const s = window.getComputedStyle(inner);
                const pf = document.getElementById('prop-fontsize'); if (pf) pf.value = parseInt(s.fontSize) || 32;
                const pc = document.getElementById('prop-color'); if (pc) pc.value = rgbToHex(s.color);
            }
        } else {
            const inner = selectedElement.querySelector('.content-wrapper');
            if (inner) {
                const s = window.getComputedStyle(inner);
                const pf = document.getElementById('prop-fill'); if (pf) pf.value = rgbToHex(s.backgroundColor || '#2563eb');
            }
            const po = document.getElementById('prop-opacity');
            const pov = document.getElementById('prop-opacity-val');
            const op = Math.round((parseFloat(selectedElement.style.opacity) || 1) * 100);
            if (po) po.value = op;
            if (pov) pov.textContent = op + '%';
        }
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

    // Props panel input handlers
    ['prop-x','prop-y','prop-w','prop-h'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => {
            if (!selectedElement) return;
            saveState();
            const x = parseInt(document.getElementById('prop-x')?.value) || 0;
            const y = parseInt(document.getElementById('prop-y')?.value) || 0;
            const w = parseInt(document.getElementById('prop-w')?.value) || 50;
            const h = parseInt(document.getElementById('prop-h')?.value) || 50;
            selectedElement.style.left = x + 'px'; selectedElement.style.top  = y + 'px';
            selectedElement.style.width = w + 'px'; selectedElement.style.height = h + 'px';
        });
    });
    document.getElementById('prop-fontsize')?.addEventListener('change', (e) => {
        if (!selectedElement) return;
        const inner = selectedElement.querySelector('.content-wrapper');
        if (inner) inner.style.fontSize = e.target.value + 'px';
    });
    document.getElementById('prop-color')?.addEventListener('input', (e) => {
        if (!selectedElement) return;
        const inner = selectedElement.querySelector('.content-wrapper');
        if (inner) inner.style.color = e.target.value;
        const ec = document.getElementById('element-color'); if (ec) ec.value = e.target.value;
    });
    document.getElementById('prop-fill')?.addEventListener('input', (e) => {
        if (!selectedElement) return;
        const inner = selectedElement.querySelector('.content-wrapper');
        if (inner) inner.style.backgroundColor = e.target.value;
    });
    document.getElementById('prop-opacity')?.addEventListener('input', (e) => {
        if (!selectedElement) return;
        selectedElement.style.opacity = e.target.value / 100;
        const pov = document.getElementById('prop-opacity-val'); if (pov) pov.textContent = e.target.value + '%';
    });

    function updateFloatingMenuPosition() {
        if (!floatingMenu || !selectedElement) { floatingMenu?.classList.add('hidden'); return; }
        floatingMenu.classList.remove('hidden');
        const t = Math.max(4, selectedElement.offsetTop - 46);
        floatingMenu.style.top  = t + 'px';
        floatingMenu.style.left = Math.max(4, selectedElement.offsetLeft) + 'px';
    }

    canvas?.addEventListener('pointerdown', (e) => { if (e.target === canvas) deselect(); });
    function deselect() {
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement = null;
        floatingMenu?.classList.add('hidden');
        document.getElementById('props-no-select')?.classList.remove('hidden');
        document.getElementById('props-content')?.classList.add('hidden');
    }

    // ── 6. プロパティ変更 ────────────────────────────────────
    function setAnimation(name) {
        if (!selectedElement) return;
        saveState();
        selectedElement.setAttribute('data-animation', name);
        const delay = parseFloat(document.getElementById('anim-delay')?.value || 0);
        selectedElement.setAttribute('data-anim-delay', delay);
        document.querySelectorAll('.anim-set-btn').forEach(b => b.classList.toggle('active', b.dataset.anim === name));
        const fa = document.getElementById('float-anim-select'); if (fa) fa.value = name;
        selectedElement.style.animationDelay = delay + 's';
        selectedElement.classList.remove('play-anim');
        void selectedElement.offsetWidth;
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

    const applyColor = (color) => {
        if (!selectedElement) return;
        const inner = selectedElement.querySelector('.content-wrapper'); if (!inner) return;
        if (selectedElement.classList.contains('text-element')) inner.style.color = color;
        else inner.style.backgroundColor = color;
    };
    document.getElementById('element-color')?.addEventListener('input', e => {
        applyColor(e.target.value);
        const fc = document.getElementById('float-color'); if (fc) fc.value = e.target.value;
        const pc = document.getElementById('prop-color');  if (pc) pc.value = e.target.value;
    });
    document.getElementById('float-color')?.addEventListener('input', e => {
        applyColor(e.target.value);
        const ec = document.getElementById('element-color'); if (ec) ec.value = e.target.value;
    });
    document.getElementById('font-size')?.addEventListener('input', e => {
        if (selectedElement?.classList.contains('text-element')) {
            const inner = selectedElement.querySelector('.content-wrapper'); if (inner) inner.style.fontSize = e.target.value + 'px';
            const pf = document.getElementById('prop-fontsize'); if (pf) pf.value = e.target.value;
        }
    });
    document.getElementById('font-family')?.addEventListener('change', e => {
        if (selectedElement?.classList.contains('text-element')) {
            saveState(); const inner = selectedElement.querySelector('.content-wrapper'); if (inner) inner.style.fontFamily = e.target.value;
        }
    });

    // テキスト揃え
    ['left','center','right'].forEach(align => {
        document.getElementById(`align-${align}-btn`)?.addEventListener('click', () => {
            if (!selectedElement?.classList.contains('text-element')) return;
            const inner = selectedElement.querySelector('.content-wrapper'); if (inner) inner.style.textAlign = align;
        });
    });

    // 太字・斜体
    const toggleStyle = (prop, vals) => {
        if (!selectedElement?.classList.contains('text-element')) return;
        const inner = selectedElement.querySelector('.content-wrapper'); if (!inner) return;
        const s = window.getComputedStyle(inner);
        inner.style[prop] = s[prop] === vals[0] ? vals[1] : vals[0];
    };
    bindClick('bold-btn',   () => toggleStyle('fontWeight', ['700','400']));
    bindClick('italic-btn', () => toggleStyle('fontStyle',  ['italic','normal']));
    bindClick('float-bold',   () => toggleStyle('fontWeight', ['700','400']));
    bindClick('float-italic', () => toggleStyle('fontStyle',  ['italic','normal']));

    // 削除・複製・レイヤー
    const deleteAction = () => { if (selectedElement) { saveState(); selectedElement.remove(); deselect(); } };
    bindClick('delete-btn',   deleteAction);
    bindClick('float-delete', deleteAction);

    const bringFront = () => { if (selectedElement) { saveState(); selectedElement.style.zIndex = maxZIndex++; } };
    bindClick('bring-front-btn', bringFront);
    bindClick('float-layer-front', bringFront);

    const sendBack = () => { if (selectedElement) { saveState(); selectedElement.style.zIndex = 1; } };
    bindClick('send-back-btn', sendBack);
    bindClick('float-send-back', sendBack);

    const duplicateAction = () => {
        if (!selectedElement) return;
        saveState();
        const clone = selectedElement.cloneNode(true);
        clone.style.left = (parseInt(selectedElement.style.left) + 20) + 'px';
        clone.style.top  = (parseInt(selectedElement.style.top)  + 20) + 'px';
        clone.style.zIndex = maxZIndex++;
        canvas.appendChild(clone);
        initElementEvents(clone);
        selectElement(clone);
    };
    bindClick('duplicate-btn', duplicateAction);

    // ── 7. Design タブ ────────────────────────────────────────
    const THEMES = {
        white: { bg: '#ffffff', text: '#0f172a' },
        dark:  { bg: '#0f172a', text: '#f8fafc' },
        blue:  { bg: 'linear-gradient(135deg,#2563eb,#7c3aed)', text: '#ffffff' },
        warm:  { bg: 'linear-gradient(135deg,#f59e0b,#ef4444)', text: '#ffffff' },
        green: { bg: 'linear-gradient(135deg,#10b981,#2563eb)', text: '#ffffff' },
        rose:  { bg: 'linear-gradient(135deg,#f43f5e,#f59e0b)', text: '#ffffff' },
    };
    document.querySelectorAll('.theme-swatch').forEach(btn => {
        btn.onclick = () => {
            const t = THEMES[btn.dataset.theme]; if (!t) return;
            applySlideBackground(t.bg);
        };
    });
    document.getElementById('slide-bg-color')?.addEventListener('input', e => {
        applySlideBackground(e.target.value);
    });
    function applySlideBackground(val) {
        if (!canvas) return;
        if (val.startsWith('linear-gradient')) {
            canvas.style.background = val;
            canvas.style.backgroundImage = val;
            slides[currentSlideIndex].bgStyle = val;
            slides[currentSlideIndex].bg = '';
        } else {
            canvas.style.background = val;
            canvas.style.backgroundImage = '';
            slides[currentSlideIndex].bgStyle = val;
            slides[currentSlideIndex].bg = '';
        }
    }

    // Opacity
    let elemOpacity = 100;
    bindClick('opacity-up-btn', () => {
        if (!selectedElement) return;
        elemOpacity = Math.min(100, elemOpacity + 10);
        selectedElement.style.opacity = elemOpacity / 100;
        const po = document.getElementById('prop-opacity'); if (po) po.value = elemOpacity;
        const pov = document.getElementById('prop-opacity-val'); if (pov) pov.textContent = elemOpacity + '%';
        document.getElementById('opacity-label').textContent = elemOpacity + '%';
    });
    bindClick('opacity-down-btn', () => {
        if (!selectedElement) return;
        elemOpacity = Math.max(10, elemOpacity - 10);
        selectedElement.style.opacity = elemOpacity / 100;
        const po = document.getElementById('prop-opacity'); if (po) po.value = elemOpacity;
        const pov = document.getElementById('prop-opacity-val'); if (pov) pov.textContent = elemOpacity + '%';
        document.getElementById('opacity-label').textContent = elemOpacity + '%';
    });

    // ── 8. Transition タブ ────────────────────────────────────
    document.querySelectorAll('.trans-btn').forEach(btn => {
        btn.onclick = () => {
            slides[currentSlideIndex].transition = btn.dataset.trans;
            document.querySelectorAll('.trans-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
    });

    // ── 9. Draw タブ ──────────────────────────────────────────
    let drawCanvas, drawCtx;
    function ensureDrawCanvas() {
        if (document.getElementById('draw-canvas')) return;
        drawCanvas = document.createElement('canvas');
        drawCanvas.id = 'draw-canvas';
        drawCanvas.width = 960; drawCanvas.height = 540;
        document.getElementById('canvas-container').appendChild(drawCanvas);
        drawCtx = drawCanvas.getContext('2d');
        let px, py, drawing = false;
        drawCanvas.addEventListener('pointerdown', e => {
            if (!drawMode) return;
            drawing = true;
            const r = drawCanvas.getBoundingClientRect();
            px = (e.clientX - r.left) / currentZoom;
            py = (e.clientY - r.top)  / currentZoom;
            drawCtx.beginPath(); drawCtx.moveTo(px, py);
        });
        drawCanvas.addEventListener('pointermove', e => {
            if (!drawing) return;
            const r = drawCanvas.getBoundingClientRect();
            const cx2 = (e.clientX - r.left) / currentZoom;
            const cy2 = (e.clientY - r.top)  / currentZoom;
            const size = parseInt(document.getElementById('draw-size')?.value || 4);
            const color = document.getElementById('draw-color')?.value || '#2563eb';
            drawCtx.lineWidth = drawMode === 'eraser' ? size * 3 : size;
            drawCtx.strokeStyle = drawMode === 'eraser' ? 'rgba(255,255,255,1)' : color;
            drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
            drawCtx.globalCompositeOperation = drawMode === 'eraser' ? 'destination-out' : 'source-over';
            drawCtx.lineTo(cx2, cy2); drawCtx.stroke();
            px = cx2; py = cy2;
        });
        drawCanvas.addEventListener('pointerup', () => { drawing = false; });
    }

    bindClick('draw-pen-btn', () => {
        ensureDrawCanvas();
        drawMode = 'pen';
        document.getElementById('draw-canvas').className = 'active';
        deselect();
    });
    bindClick('draw-eraser-btn', () => {
        ensureDrawCanvas();
        drawMode = 'eraser';
        document.getElementById('draw-canvas').className = 'active eraser-mode';
        deselect();
    });
    bindClick('draw-stop-btn', () => {
        drawMode = null;
        const dc = document.getElementById('draw-canvas');
        if (dc) dc.className = '';
    });
    document.getElementById('draw-size')?.addEventListener('input', e => {
        const lbl = document.getElementById('draw-size-label'); if (lbl) lbl.textContent = e.target.value;
    });

    // ── 10. Display タブ ─────────────────────────────────────
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.onclick = () => {
            currentZoom = Math.max(0.3, Math.min(2.5, currentZoom + parseInt(btn.dataset.zoom) / 100));
            applyZoom();
        };
    });
    bindClick('zoom-reset-btn', () => { currentZoom = 1.0; applyZoom(); });
    function applyZoom() {
        if (canvas) canvas.style.transform = `scale(${currentZoom})`;
        const lbl = document.getElementById('zoom-label'); if (lbl) lbl.textContent = Math.round(currentZoom * 100) + '%';
    }

    let showGrid = false;
    bindClick('toggle-grid-btn', () => {
        showGrid = !showGrid;
        canvas?.classList.toggle('show-grid', showGrid);
        document.getElementById('toggle-grid-btn')?.classList.toggle('active-toggle', showGrid);
    });

    let showRuler = false;
    bindClick('toggle-ruler-btn', () => {
        showRuler = !showRuler;
        document.getElementById('canvas-ruler-h')?.classList.toggle('hidden', !showRuler);
        document.getElementById('canvas-ruler-v')?.classList.toggle('hidden', !showRuler);
        document.getElementById('toggle-ruler-btn')?.classList.toggle('active-toggle', showRuler);
    });

    bindClick('toggle-snap-btn', () => {
        snapEnabled = !snapEnabled;
        document.getElementById('toggle-snap-btn')?.classList.toggle('active-toggle', snapEnabled);
    });

    // ── 11. Proofreading ─────────────────────────────────────
    bindClick('spellcheck-btn', () => {
        const texts = [];
        canvas?.querySelectorAll('.text-element .content-wrapper').forEach(el => {
            if (el.innerText.trim()) texts.push(el.innerText.trim());
        });
        const resSection = document.getElementById('proofread-result');
        const resTxt = document.getElementById('proofread-text');
        if (!texts.length) {
            resTxt.textContent = 'テキスト要素が見つかりません';
        } else {
            const total = texts.join(' ').length;
            resTxt.textContent = `${texts.length}つのテキスト / ${total}文字 を検出しました`;
        }
        if (resSection) resSection.style.display = 'flex';
    });

    bindClick('word-count-btn', () => {
        const texts = [];
        canvas?.querySelectorAll('.text-element .content-wrapper').forEach(el => {
            if (el.innerText.trim()) texts.push(el.innerText.trim());
        });
        const all = texts.join('\n');
        const words = all.split(/\s+/).filter(w => w).length;
        const chars = all.replace(/\s/g, '').length;
        const resSection = document.getElementById('proofread-result');
        const resTxt = document.getElementById('proofread-text');
        if (resTxt) resTxt.textContent = `単語数: ${words} / 文字数（空白除く）: ${chars}`;
        if (resSection) resSection.style.display = 'flex';
    });

    // ── 12. PDFインポート ─────────────────────────────────────
    const pdfFileInput = document.getElementById('pdf-file-input');
    if (pdfFileInput) {
        bindClick('btn-import-pdf', () => pdfFileInput.click());
        pdfFileInput.onchange = async (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    if (!window.pdfjsLib) { alert("PDFライブラリが読み込まれていません。"); return; }
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
                    const pdf = await pdfjsLib.getDocument(new Uint8Array(this.result)).promise;
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const vp = page.getViewport({ scale: 1.5 });
                        const rc = document.createElement('canvas');
                        rc.width = vp.width; rc.height = vp.height;
                        await page.render({ canvasContext: rc.getContext('2d'), viewport: vp }).promise;
                        const img = rc.toDataURL('image/jpeg', 0.85);
                        if (i === 1 && slides.length === 1 && !slides[0].html) {
                            slides[0].bg = img; slides[0].bgStyle = '';
                        } else {
                            slides.push({ html: "", bg: img, bgStyle: '', transition: 'none', undoStack: [], redoStack: [] });
                        }
                    }
                    switchSlide(slides.length - pdf.numPages);
                } catch { alert("PDFの展開に失敗しました。"); }
            };
            reader.readAsArrayBuffer(file);
            pdfFileInput.value = '';
        };
    }

    // ── 13. スライド管理 ─────────────────────────────────────
    function renderSlides() {
        const list = document.getElementById('slide-list'); if (!list) return;
        list.innerHTML = '';
        slides.forEach((s, i) => {
            const div = document.createElement('div');
            div.className = `slide-thumb ${i === currentSlideIndex ? 'active' : ''}`;
            if (s.bgStyle && s.bgStyle.startsWith('linear-gradient')) {
                div.style.background = s.bgStyle;
            } else if (s.bg) {
                div.style.backgroundImage = `url(${s.bg})`;
            } else if (s.bgStyle) {
                div.style.background = s.bgStyle;
            }
            div.onclick = () => switchSlide(i);
            const num = document.createElement('div');
            num.className = 'slide-thumb-number';
            num.textContent = i + 1;
            div.appendChild(num);
            list.appendChild(div);
        });
    }

    function switchSlide(idx, applyTrans = false) {
        if (!canvas) return;
        // 現在スライドを保存
        slides[currentSlideIndex].html = canvas.innerHTML;
        slides[currentSlideIndex].bg = canvas.style.backgroundImage
            ? canvas.style.backgroundImage.replace(/^url\(["']?|["']?\)$/g, '')
            : '';
        slides[currentSlideIndex].bgStyle = canvas.style.background || '';

        currentSlideIndex = idx;
        const s = slides[idx];
        canvas.innerHTML = s.html;

        // 背景復元
        if (s.bgStyle && s.bgStyle.startsWith('linear-gradient')) {
            canvas.style.background = s.bgStyle;
            canvas.style.backgroundImage = s.bgStyle;
        } else if (s.bg) {
            canvas.style.backgroundImage = `url(${s.bg})`;
            canvas.style.background = '';
        } else if (s.bgStyle) {
            canvas.style.background = s.bgStyle;
            canvas.style.backgroundImage = '';
        } else {
            canvas.style.background = '#ffffff';
            canvas.style.backgroundImage = '';
        }

        // トランジション
        if (applyTrans && s.transition && s.transition !== 'none') {
            const area = document.getElementById('canvas-area');
            area?.classList.remove(`trans-fade`, `trans-slide`, `trans-zoom`);
            void area?.offsetWidth;
            area?.classList.add(`trans-${s.transition}`);
            setTimeout(() => area?.classList.remove(`trans-${s.transition}`), 800);
        }

        reattachEvents();
        renderSlides();
        updateUndoRedoUI();
        deselect();
    }

    bindClick('add-slide-btn', () => {
        if (!canvas) return;
        slides[currentSlideIndex].html = canvas.innerHTML;
        slides.push({ html: "", bg: "", bgStyle: '', transition: 'none', undoStack: [], redoStack: [] });
        switchSlide(slides.length - 1);
    });

    function reattachEvents() {
        if (!canvas) return;
        Array.from(canvas.children).forEach(el => { if (el.id !== 'floating-menu') initElementEvents(el); });
        deselect();
    }

    // ── 14. エクスポート ──────────────────────────────────────
    bindClick('export-pdf-btn', async () => {
        try {
            if (!window.jspdf || !window.html2canvas) { alert("ライブラリが不足しています。"); return; }
            deselect();
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('l', 'px', [960, 540]);
            const orig = currentSlideIndex;
            slides[orig].html = canvas.innerHTML;
            for (let i = 0; i < slides.length; i++) {
                if (i > 0) pdf.addPage([960, 540], 'l');
                canvas.innerHTML = slides[i].html;
                const bg = slides[i];
                if (bg.bgStyle?.startsWith('linear-gradient')) canvas.style.background = bg.bgStyle;
                else if (bg.bg) canvas.style.backgroundImage = `url(${bg.bg})`;
                else canvas.style.background = bg.bgStyle || '#ffffff';
                const cap = await html2canvas(canvas, { scale: 2, useCORS: true });
                pdf.addImage(cap.toDataURL('image/png'), 'PNG', 0, 0, 960, 540);
            }
            pdf.save("presentation.pdf");
            switchSlide(orig);
        } catch (e) { alert("PDF生成に失敗しました。\n" + e.message); }
    });

    bindClick('export-pptx-btn', () => {
        try {
            if (!window.PptxGenJS) { alert("PPTXライブラリが読み込まれていません。"); return; }
            deselect();
            const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_16x9';
            const orig = currentSlideIndex;
            slides[orig].html = canvas.innerHTML;
            slides.forEach(s => {
                const sl = pptx.addSlide();
                if (s.bg) sl.addImage({ data: s.bg, x: 0, y: 0, w: "100%", h: "100%" });
                const tmp = document.createElement('div'); tmp.innerHTML = s.html;
                Array.from(tmp.children).forEach(el => {
                    const inner = el.querySelector('.content-wrapper'); if (!inner) return;
                    const x = (parseInt(el.style.left)/960)*100+'%';
                    const y = (parseInt(el.style.top)/540)*100+'%';
                    const w = (parseInt(el.style.width)/960)*100+'%';
                    const h2 = (parseInt(el.style.height)/540)*100+'%';
                    if (el.classList.contains('text-element')) {
                        const ff = (inner.style.fontFamily || 'Arial').split(',')[0].replace(/['"]/g,'').trim();
                        sl.addText(inner.innerText, { x, y, w, h: h2, fontSize: parseInt(inner.style.fontSize)||24, color: rgbToHex(inner.style.color).replace('#',''), fontFace: ff });
                    } else if (el.classList.contains('image-element')) {
                        sl.addImage({ data: inner.src, x, y, w, h: h2 });
                    } else if (el.classList.contains('rect-element')) {
                        sl.addShape(pptx.ShapeType.rect, { x, y, w, h: h2, fill: { color: rgbToHex(inner.style.backgroundColor).replace('#','') } });
                    }
                });
            });
            pptx.writeFile({ fileName: "presentation.pptx" });
            switchSlide(orig);
        } catch (e) { alert("PPTX生成に失敗しました。\n" + e.message); }
    });

    // ── 15. スライドショー ────────────────────────────────────
    function startPresent(fromBeginning = false) {
        if (fromBeginning) switchSlide(0);
        const area = document.querySelector(".canvas-area");
        if (area?.requestFullscreen) area.requestFullscreen();
        else if (area?.webkitRequestFullscreen) area.webkitRequestFullscreen();
    }
    bindClick('present-btn',            () => startPresent(false));
    bindClick('present-from-start-btn', () => startPresent(true));

    const onFSChange = () => {
        const controls = document.getElementById('presenter-controls');
        if (!controls) return;
        const inFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
        controls.classList.toggle('hidden', !inFS);
        if (inFS) {
            deselect();
            const sn = document.getElementById('slide-number');
            if (sn) sn.textContent = `${currentSlideIndex+1} / ${slides.length}`;
            playSlideAnimations();
            // 自動進行
            const sec = parseFloat(document.getElementById('auto-advance')?.value || 0);
            if (sec > 0) {
                clearInterval(autoAdvanceTimer);
                autoAdvanceTimer = setInterval(() => {
                    if (currentSlideIndex < slides.length - 1) { goNextSlide(); }
                    else clearInterval(autoAdvanceTimer);
                }, sec * 1000);
            }
        } else {
            clearInterval(autoAdvanceTimer);
            canvas && Array.from(canvas.children).forEach(el => el.classList.remove('play-anim'));
        }
    };
    document.addEventListener('fullscreenchange', onFSChange);
    document.addEventListener('webkitfullscreenchange', onFSChange);

    function playSlideAnimations() {
        if (!canvas) return;
        Array.from(canvas.children).forEach(el => {
            const delay = parseFloat(el.getAttribute('data-anim-delay') || 0);
            el.classList.remove('play-anim');
            void el.offsetWidth;
            el.style.animationDelay = delay + 's';
            el.classList.add('play-anim');
        });
    }

    function goNextSlide() {
        if (currentSlideIndex < slides.length - 1) {
            switchSlide(currentSlideIndex + 1, true); playSlideAnimations();
        }
        const sn = document.getElementById('slide-number'); if (sn) sn.textContent = `${currentSlideIndex+1} / ${slides.length}`;
    }
    function goPrevSlide() {
        if (currentSlideIndex > 0) { switchSlide(currentSlideIndex - 1, true); playSlideAnimations(); }
        const sn = document.getElementById('slide-number'); if (sn) sn.textContent = `${currentSlideIndex+1} / ${slides.length}`;
    }

    bindClick('next-slide', goNextSlide);
    bindClick('prev-slide', goPrevSlide);
    bindClick('exit-present-btn', () => {
        clearInterval(autoAdvanceTimer);
        document.exitFullscreen?.() || document.webkitExitFullscreen?.();
    });

    // ── 16. キーボードショートカット ──────────────────────────
    document.addEventListener('keydown', e => {
        const tag = document.activeElement.tagName;
        const inText = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement.isContentEditable;

        if ((e.metaKey || e.ctrlKey) && !inText) {
            if (e.key === 'z') { e.preventDefault(); document.getElementById('undo-btn')?.click(); return; }
            if (e.key === 'y') { e.preventDefault(); document.getElementById('redo-btn')?.click(); return; }
            if (e.key === 'd') { e.preventDefault(); duplicateAction(); return; }
        }
        if (!inText) {
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteAction(); return; }
            // 矢印キーでナッジ（10px or Shift+1px）
            if (selectedElement && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
                e.preventDefault();
                const step = e.shiftKey ? 1 : 10;
                if (e.key === 'ArrowLeft')  selectedElement.style.left = (parseInt(selectedElement.style.left)||0) - step + 'px';
                if (e.key === 'ArrowRight') selectedElement.style.left = (parseInt(selectedElement.style.left)||0) + step + 'px';
                if (e.key === 'ArrowUp')    selectedElement.style.top  = (parseInt(selectedElement.style.top) ||0) - step + 'px';
                if (e.key === 'ArrowDown')  selectedElement.style.top  = (parseInt(selectedElement.style.top) ||0) + step + 'px';
                updateFloatingMenuPosition(); updatePropsPosition();
            }
        }
        // プレゼンモードキー操作
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (e.key === 'ArrowRight' || e.key === ' ') goNextSlide();
            if (e.key === 'ArrowLeft')  goPrevSlide();
            if (e.key === 'Escape') document.getElementById('exit-present-btn')?.click();
        }
    });

    // ── ユーティリティ ────────────────────────────────────────
    function rgbToHex(rgb) {
        if (!rgb || rgb === 'transparent') return '#000000';
        const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!m) return '#000000';
        return '#' + [m[1],m[2],m[3]].map(v => ('0'+parseInt(v).toString(16)).slice(-2)).join('');
    }

    // ── 初期化 ────────────────────────────────────────────────
    renderSlides();
    updateUndoRedoUI();
});
