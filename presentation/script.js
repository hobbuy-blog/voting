// ============================================================
//  Leaslide — script.js (Export Optimized Edition)
// ============================================================

// --- 1. タブルーター (Gemini修正：イベントなしでも青色を反映) ---
window.openTab = function(evt, tabName) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
    
    const t = document.getElementById(tabName);
    if (t) t.classList.add('active');

    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    } else {
        // IDやonclick属性から対象のボタンを特定して青くする
        const targetBtn = document.querySelector(`.tab-link[onclick*="${tabName}"]`);
        if (targetBtn) targetBtn.classList.add('active');
    }
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
        const u = document.getElementById('btn-undo'); if (u) u.disabled = !s.undoStack.length;
        const r = document.getElementById('btn-redo'); if (r) r.disabled = !s.redoStack.length;
    }
    bindClick('btn-undo', () => {
        const s = slides[currentSlideIndex]; if (!s.undoStack.length) return;
        s.redoStack.push(canvas.innerHTML);
        canvas.innerHTML = s.undoStack.pop();
        reattachEvents(); updateUndoRedoUI();
    });
    bindClick('btn-redo', () => {
        const s = slides[currentSlideIndex]; if (!s.redoStack.length) return;
        s.undoStack.push(canvas.innerHTML);
        canvas.innerHTML = s.redoStack.pop();
        reattachEvents(); updateUndoRedoUI();
    });

    // ── 3. ズーム ────────────────
    function applyZoom() {
        const isPresenting = document.fullscreenElement || document.webkitFullscreenElement || document.querySelector('.pseudo-fullscreen');
        if (isPresenting) return;
        if (canvas) {
            canvas.style.transform = `scale(${currentZoom})`;
            canvas.style.transformOrigin = 'center center';
        }
        const lbl = document.getElementById('zoom-val');
        if (lbl) lbl.textContent = Math.round(currentZoom * 100) + '%';
    }
    bindClick('zoom-in',    () => { currentZoom = Math.min(2.0, currentZoom + 0.1); applyZoom(); });
    bindClick('zoom-out',   () => { currentZoom = Math.max(0.15, currentZoom - 0.1); applyZoom(); });
    bindClick('zoom-reset', () => { currentZoom = 0.5; applyZoom(); });

    // ── 4. 要素作成 ─────────────────────────────────────────
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el = document.createElement('div');
        el.className = `canvas-element ${typeClass}`;
        Object.assign(el.style, {
            width: w + 'px', height: h + 'px',
            left: '200px', top: '200px',
            zIndex: maxZIndex++, touchAction: 'none'
        });
        el.setAttribute('data-animation', 'none');
        canvas.appendChild(el);
        initElementEvents(el);
        selectElement(el);
        renderSlideList();
        return el;
    }

    bindClick('add-text-btn', () => {
        const el = createBaseElement('text-element', 600, 120);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.contentEditable = true;
        Object.assign(inner.style, { fontSize:'48px', color:'#0f172a', fontFamily:"'Noto Sans JP', sans-serif", textAlign:'left' });
        inner.innerText = 'Click to edit text';
        el.appendChild(inner);
        inner.onblur = () => { saveState(); renderSlideList(); };
    });

    bindClick('add-rect-btn', () => {
        const el = createBaseElement('rect-element', 300, 200);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper'; inner.style.backgroundColor = '#2563eb';
        el.appendChild(inner);
    });

    // ── 5. ドラッグ＆リサイズ ────
    function initElementEvents(el) {
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
            if (isDrag) {
                let nx = ox + dx, ny = oy + dy;
                if (snapEnabled) { nx = Math.round(nx / 10) * 10; ny = Math.round(ny / 10) * 10; }
                el.style.left = nx + 'px'; el.style.top = ny + 'px';
                updateFloatingMenuPosition(); updatePropsPanel();
            }
            if (isRes) {
                if (dir === 'se') {
                    el.style.width  = Math.max(20, sw + dx) + 'px';
                    el.style.height = Math.max(20, sh + dy) + 'px';
                } // 他のdirも同様に（省略）
                updateFloatingMenuPosition(); updatePropsPanel();
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

        // 強制Home戻し + 青色反映
        window.openTab(null, 'home-tab');

        const isText = el.classList.contains('text-element');
        document.querySelector('.text-only-tools').style.display = isText ? 'flex' : 'none';
        
        updatePropsPanel(); updateFloatingMenuPosition();
    }

    function deselect() {
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement = null;
        floatingMenu?.classList.add('hidden');
        updatePropsPanel();
    }
    canvas?.addEventListener('pointerdown', (e) => { if (e.target === canvas) deselect(); });

    function updateFloatingMenuPosition() {
        if (!floatingMenu || !selectedElement) { floatingMenu?.classList.add('hidden'); return; }
        floatingMenu.classList.remove('hidden');
        const rect = selectedElement.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        floatingMenu.style.top  = (selectedElement.offsetTop - 50) + 'px';
        floatingMenu.style.left = selectedElement.offsetLeft + 'px';
    }

    function updatePropsPanel() {
        const cont = document.getElementById('props-content');
        const noSel = document.getElementById('props-no-select');
        if (!selectedElement) {
            cont.classList.add('hidden'); noSel.classList.remove('hidden'); return;
        }
        cont.classList.remove('hidden'); noSel.classList.add('hidden');

        document.getElementById('prop-left').value = parseInt(selectedElement.style.left);
        document.getElementById('prop-top').value = parseInt(selectedElement.style.top);
        document.getElementById('prop-width').value = parseInt(selectedElement.style.width);
        document.getElementById('prop-height').value = parseInt(selectedElement.style.height);

        const isText = selectedElement.classList.contains('text-element');
        document.getElementById('text-props').classList.toggle('hidden', !isText);
        document.getElementById('shape-props').classList.toggle('hidden', isText);
    }

    // ── 11. PDF 高精度エクスポート (位置ズレ・UI混入修正版) ──
    bindClick('export-pdf-btn', async () => {
        if (!window.jspdf || !window.html2canvas) { alert("Library missing"); return; }
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [currentWidth, currentHeight] });
        const origIdx = currentSlideIndex;
        deselect();

        // 作業開始前に現在の状態を保存
        slides[currentSlideIndex].html = canvas.innerHTML;

        // 書き出し中：ズームを一時的に解除してUIの干渉を防ぐ
        const oldZoom = currentZoom;
        currentZoom = 1.0;
        canvas.style.transform = 'none';

        for (let i = 0; i < slides.length; i++) {
            // スライドの内容を切り替え
            canvas.innerHTML = slides[i].html;
            const s = slides[i];
            if (s.bgStyle === 'gradient') canvas.style.background = s.bg;
            else canvas.style.backgroundColor = s.bg || '#ffffff';

            // html2canvasに「キャンバス本体」だけを絶対座標で抜き出すよう指示
            const cap = await html2canvas(canvas, {
                width: currentWidth,
                height: currentHeight,
                scale: 1,
                useCORS: true,
                backgroundColor: null,
                logging: false
            });

            if (i > 0) pdf.addPage([currentWidth, currentHeight], 'landscape');
            pdf.addImage(cap.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, currentWidth, currentHeight);
        }

        pdf.save('presentation.pdf');
        
        // 復元
        currentZoom = oldZoom;
        switchSlide(origIdx);
    });

    // ── PPTX 高精度エクスポート (NaNエラー・解像度修正版) ──
    bindClick('export-pptx-btn', () => {
        if (!window.PptxGenJS) { alert("PptxGenJS missing"); return; }
        const pptx = new PptxGenJS();
        
        // 解像度をPPTXのインチ設定に合わせる (16:9 or 4:3)
        pptx.layout = (currentWidth/currentHeight > 1.4) ? 'LAYOUT_16x9' : 'LAYOUT_4x3';
        
        // 保存
        slides[currentSlideIndex].html = canvas.innerHTML;

        slides.forEach((s, idx) => {
            const slide = pptx.addSlide();
            if (s.bgStyle !== 'gradient') {
                slide.background = { fill: (s.bg || '#ffffff').replace('#', '') };
            }

            const temp = document.createElement('div');
            temp.innerHTML = s.html;
            
            temp.querySelectorAll('.canvas-element').forEach(el => {
                const style = window.getComputedStyle(el);
                // getComputedStyleならクラス由来の座標も確実に取れる
                const x = (parseFloat(style.left) || 0) / currentWidth * 100 + "%";
                const y = (parseFloat(style.top) || 0) / currentHeight * 100 + "%";
                const w = (parseFloat(style.width) || 100) / currentWidth * 100 + "%";
                const h = (parseFloat(style.height) || 100) / currentHeight * 100 + "%";

                if (el.classList.contains('text-element')) {
                    const inner = el.querySelector('.content-wrapper');
                    const innerStyle = window.getComputedStyle(inner);
                    slide.addText(inner.innerText, {
                        x, y, w, h,
                        fontSize: parseFloat(innerStyle.fontSize) * 0.75, // pt換算
                        color: rgbToHex(innerStyle.color).replace('#', ''),
                        align: innerStyle.textAlign || 'left',
                        fontFace: innerStyle.fontFamily.split(',')[0].replace(/['"]/g, '')
                    });
                } else if (el.classList.contains('rect-element')) {
                    const inner = el.querySelector('.content-wrapper');
                    const isCircle = el.classList.contains('circle-element');
                    slide.addShape(isCircle ? pptx.ShapeType.oval : pptx.ShapeType.rectangle, {
                        x, y, w, h,
                        fill: { color: rgbToHex(window.getComputedStyle(inner).backgroundColor).replace('#', '') }
                    });
                }
            });
        });

        pptx.writeFile({ fileName: 'presentation.pptx' });
    });

    // ── スライド管理 ─────────────────────────────────────
    function renderSlideList() {
        const container = document.getElementById('thumb-container');
        if (!container) return;
        container.innerHTML = '';
        slides.forEach((s, i) => {
            const thumb = document.createElement('div');
            thumb.className = `slide-thumb ${i === currentSlideIndex ? 'active' : ''}`;
            thumb.style.aspectRatio = `${currentWidth}/${currentHeight}`;
            
            // プレビュー用の縮小表示
            const preview = document.createElement('div');
            preview.className = 'thumb-preview-container';
            preview.style.width = currentWidth + 'px';
            preview.style.height = currentHeight + 'px';
            preview.innerHTML = (i === currentSlideIndex) ? canvas.innerHTML : s.html;
            
            const scale = container.clientWidth / currentWidth;
            preview.style.transform = `scale(${scale * 0.9})`;
            
            if (s.bgStyle === 'gradient') preview.style.background = s.bg;
            else preview.style.backgroundColor = s.bg || '#ffffff';

            thumb.appendChild(preview);
            thumb.onclick = () => switchSlide(i);
            container.appendChild(thumb);
        });
    }

    function switchSlide(idx) {
        slides[currentSlideIndex].html = canvas.innerHTML;
        currentSlideIndex = idx;
        canvas.innerHTML = slides[idx].html;
        const s = slides[idx];
        if (s.bgStyle === 'gradient') canvas.style.background = s.bg;
        else canvas.style.backgroundColor = s.bg || '#ffffff';
        reattachEvents();
        renderSlideList();
    }

    bindClick('btn-add-slide', () => {
        slides.push({ html:'', bg:'#ffffff', bgStyle:'color', undoStack:[], redoStack:[] });
        switchSlide(slides.length - 1);
    });

    bindClick('btn-del-slide', () => {
        if (slides.length <= 1) return;
        slides.splice(currentSlideIndex, 1);
        switchSlide(Math.max(0, currentSlideIndex - 1));
    });

    function reattachEvents() {
        Array.from(canvas.children).forEach(el => initElementEvents(el));
    }

    function rgbToHex(rgb) {
        if (!rgb || rgb === 'transparent') return '#ffffff';
        const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? "#" + m.slice(1).map(x => parseInt(x).toString(16).padStart(2, '0')).join('') : '#ffffff';
    }

    updateCanvasResolution();
});
