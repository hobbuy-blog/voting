// --- 1. リボンUI タブ切り替え ---
// 最上部に配置し、絶対に他のエラーに巻き込まれないように隔離
window.openTab = function(evt, tabName) {
    try {
        const panes = document.querySelectorAll(".tab-pane");
        panes.forEach(p => p.classList.remove("active"));
        const links = document.querySelectorAll(".tab-link");
        links.forEach(l => l.classList.remove("active"));
        
        const targetTab = document.getElementById(tabName);
        if (targetTab) targetTab.classList.add("active");
        if (evt && evt.currentTarget) evt.currentTarget.classList.add("active");
    } catch(e) {
        console.error("Tab error:", e);
    }
};

// --- アプリケーション状態管理 ---
let slides = [{ html: "", bg: "", undoStack: [], redoStack: [] }];
let currentSlideIndex = 0;
let selectedElement = null;
let maxZIndex = 100;

// PDF.jsのWorker設定（Safariでのエラー対策としてtry-catchで囲む）
try {
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
    }
} catch(e) {
    console.log("PDF.js worker config skipped");
}

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const floatingMenu = document.getElementById('floating-menu');

    // --- 2. 履歴管理 (Undo/Redo) ---
    function saveState() {
        if (!canvas) return;
        const slide = slides[currentSlideIndex];
        const currentHTML = canvas.innerHTML;
        if (slide.undoStack.length > 0 && slide.undoStack[slide.undoStack.length - 1] === currentHTML) return;
        slide.undoStack.push(currentHTML);
        slide.redoStack = [];
        updateUndoRedoUI();
    }

    function updateUndoRedoUI() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        if (undoBtn) undoBtn.disabled = slides[currentSlideIndex].undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = slides[currentSlideIndex].redoStack.length === 0;
    }

    if (document.getElementById('undo-btn')) {
        document.getElementById('undo-btn').onclick = () => {
            const s = slides[currentSlideIndex];
            if (s.undoStack.length === 0) return;
            s.redoStack.push(canvas.innerHTML);
            canvas.innerHTML = s.undoStack.pop();
            reattachEvents();
            updateUndoRedoUI();
        };
    }

    if (document.getElementById('redo-btn')) {
        document.getElementById('redo-btn').onclick = () => {
            const s = slides[currentSlideIndex];
            if (s.redoStack.length === 0) return;
            s.undoStack.push(canvas.innerHTML);
            canvas.innerHTML = s.redoStack.pop();
            reattachEvents();
            updateUndoRedoUI();
        };
    }

    // --- 3. 要素コンポーネント生成 ---
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el = document.createElement('div');
        el.className = `canvas-element ${typeClass}`;
        el.style.width = w + 'px'; el.style.height = h + 'px';
        el.style.left = '120px'; el.style.top = '120px';
        el.style.zIndex = maxZIndex++;
        el.setAttribute('data-animation', 'none');
        el.style.touchAction = 'none'; // iPadでのスクロール暴発防止
        
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

    if (document.getElementById('add-text-btn')) {
        document.getElementById('add-text-btn').onclick = () => {
            const el = createBaseElement('text-element', 360, 80);
            const inner = document.createElement('div');
            inner.className = 'content-wrapper';
            inner.contentEditable = true;
            inner.style.fontSize = "32px";
            inner.style.color = "#0f172a";
            inner.style.fontFamily = "'Noto Sans JP', sans-serif";
            inner.innerText = "タップして編集";
            el.appendChild(inner);
            inner.onblur = () => saveState();
        };
    }

    if (document.getElementById('add-rect-btn')) {
        document.getElementById('add-rect-btn').onclick = () => {
            const el = createBaseElement('rect-element', 160, 160);
            const inner = document.createElement('div');
            inner.className = 'content-wrapper';
            inner.style.backgroundColor = "#2563eb";
            el.appendChild(inner);
        };
    }

    const imageUpload = document.getElementById('image-upload');
    if (document.getElementById('add-image-btn') && imageUpload) {
        document.getElementById('add-image-btn').onclick = () => imageUpload.click();
        imageUpload.onchange = (e) => {
            const file = e.target.files[0];
            if(!file) return;
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

    // --- 4. ドラッグ＆リサイズ（iOS Safari完全準拠） ---
    function initElementEvents(el) {
        let isDragging = false, isResizing = false;
        let sx, sy, ox, oy, sw, sh, currentDir;
        
        el.addEventListener('pointerdown', (e) => {
            if(e.target.classList.contains('resize-handle')) return;
            
            // すでに選択状態のテキストを触った時はキーボード起動を最優先
            if(el.classList.contains('text-element') && e.target.classList.contains('content-wrapper') && selectedElement === el) {
                return; 
            }
            
            isDragging = true;
            saveState();
            sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;
            selectElement(el);
            e.stopPropagation();
        });

        const handles = el.querySelectorAll('.resize-handle');
        handles.forEach(h => {
            h.addEventListener('pointerdown', (e) => {
                isResizing = true;
                saveState();
                currentDir = h.dataset.direction;
                sx = e.clientX; sy = e.clientY;
                sw = el.offsetWidth; sh = el.offsetHeight;
                ox = el.offsetLeft; oy = el.offsetTop;
                e.stopPropagation();
                e.preventDefault();
            });
        });

        document.addEventListener('pointermove', (e) => {
            if(isDragging && selectedElement === el) {
                el.style.left = (ox + (e.clientX - sx)) + 'px';
                el.style.top = (oy + (e.clientY - sy)) + 'px';
                updateFloatingMenuPosition();
            }
            if(isResizing && selectedElement === el) {
                const dx = e.clientX - sx; const dy = e.clientY - sy;
                if(currentDir === 'se') {
                    el.style.width = Math.max(40, sw + dx) + 'px'; el.style.height = Math.max(40, sh + dy) + 'px';
                } else if(currentDir === 'sw') {
                    const newWidth = Math.max(40, sw - dx);
                    if(newWidth > 40) { el.style.left = (ox + dx) + 'px'; el.style.width = newWidth + 'px'; }
                    el.style.height = Math.max(40, sh + dy) + 'px';
                } else if(currentDir === 'ne') {
                    el.style.width = Math.max(40, sw + dx) + 'px';
                    const newHeight = Math.max(40, sh - dy);
                    if(newHeight > 40) { el.style.top = (oy + dy) + 'px'; el.style.height = newHeight + 'px'; }
                } else if(currentDir === 'nw') {
                    const newWidth = Math.max(40, sw - dx); const newHeight = Math.max(40, sh - dy);
                    if(newWidth > 40) { el.style.left = (ox + dx) + 'px'; el.style.width = newWidth + 'px'; }
                    if(newHeight > 40) { el.style.top = (oy + dy) + 'px'; el.style.height = newHeight + 'px'; }
                }
                updateFloatingMenuPosition();
            }
        });

        document.addEventListener('pointerup', () => {
            isDragging = false;
            isResizing = false;
        });
    }

    // --- 5. UI同期とフローティングメニュー ---
    function selectElement(el) {
        if (!el) return;
        if(selectedElement && selectedElement !== el) selectedElement.classList.remove('selected');
        selectedElement = el;
        el.classList.add('selected');
        
        const inner = el.querySelector('.content-wrapper');
        if (!inner) return;
        const style = window.getComputedStyle(inner);
        const currentAnim = el.getAttribute('data-animation') || 'none';
        
        document.querySelectorAll('.anim-set-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.anim === currentAnim);
        });
        const floatAnim = document.getElementById('float-anim-select');
        if (floatAnim) floatAnim.value = currentAnim;

        if(el.classList.contains('text-element')) {
            const fontSizeInput = document.getElementById('font-size');
            if (fontSizeInput) fontSizeInput.value = parseInt(style.fontSize) || 32;
            
            const currentFontClean = style.fontFamily.replace(/['"]/g, '').toLowerCase();
            const fontSelect = document.getElementById('font-family');
            if (fontSelect) {
                let fontMatched = false;
                for (let option of fontSelect.options) {
                    const optValClean = option.value.replace(/['"]/g, '').toLowerCase();
                    if (optValClean.includes(currentFontClean) || currentFontClean.includes(optValClean.split(',')[0].trim())) {
                        fontSelect.value = option.value;
                        fontMatched = true;
                        break;
                    }
                }
                if(!fontMatched && fontSelect.options.length > 0) fontSelect.value = fontSelect.options[0].value;
            }

            const elColor = document.getElementById('element-color');
            const flColor = document.getElementById('float-color');
            if (elColor) elColor.value = rgbToHex(style.color);
            if (flColor) flColor.value = rgbToHex(style.color);
            
            const textTools = document.querySelector('.text-only-tools');
            if (textTools) textTools.style.display = 'flex';
        } else {
            const textTools = document.querySelector('.text-only-tools');
            if (textTools) textTools.style.display = 'none';
            if(el.classList.contains('rect-element')) {
                const elColor = document.getElementById('element-color');
                const flColor = document.getElementById('float-color');
                if (elColor) elColor.value = rgbToHex(style.backgroundColor);
                if (flColor) flColor.value = rgbToHex(style.backgroundColor);
            }
        }
        updateFloatingMenuPosition();
    }

    function updateFloatingMenuPosition() {
        if(!floatingMenu) return;
        if(!selectedElement) { floatingMenu.classList.add('hidden'); return; }
        floatingMenu.classList.remove('hidden');
        floatingMenu.style.top = Math.max(10, selectedElement.offsetTop - 48) + 'px';
        floatingMenu.style.left = Math.max(10, selectedElement.offsetLeft) + 'px';
    }

    if (canvas) {
        canvas.addEventListener('pointerdown', (e) => { if(e.target === canvas) deselect(); });
    }
    function deselect() { 
        if(selectedElement) selectedElement.classList.remove('selected'); 
        selectedElement = null; 
        if (floatingMenu) floatingMenu.classList.add('hidden'); 
    }

    // --- 6. アニメーション＆プロパティ設定変更 ---
    function setAnimation(animName) {
        if(!selectedElement) return;
        saveState();
        selectedElement.setAttribute('data-animation', animName);
        document.querySelectorAll('.anim-set-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.anim === animName);
        });
        const floatAnim = document.getElementById('float-anim-select');
        if (floatAnim) floatAnim.value = animName;
        
        selectedElement.classList.remove('play-anim');
        void selectedElement.offsetWidth;
        selectedElement.classList.add('play-anim');
    }

    document.querySelectorAll('.anim-set-btn').forEach(btn => {
        btn.onclick = () => setAnimation(btn.dataset.anim);
    });
    if (document.getElementById('float-anim-select')) {
        document.getElementById('float-anim-select').onchange = (e) => setAnimation(e.target.value);
    }

    const applyColor = (color) => {
        if(!selectedElement) return;
        const inner = selectedElement.querySelector('.content-wrapper');
        if(!inner) return;
        if(selectedElement.classList.contains('text-element')) inner.style.color = color;
        else if(selectedElement.classList.contains('rect-element')) inner.style.backgroundColor = color;
    };
    
    if(document.getElementById('element-color')) {
        document.getElementById('element-color').oninput = (e) => { applyColor(e.target.value); const fc = document.getElementById('float-color'); if(fc) fc.value = e.target.value; };
    }
    if(document.getElementById('float-color')) {
        document.getElementById('float-color').oninput = (e) => { applyColor(e.target.value); const ec = document.getElementById('element-color'); if(ec) ec.value = e.target.value; };
    }
    if(document.getElementById('font-size')) {
        document.getElementById('font-size').oninput = (e) => { if(selectedElement && selectedElement.classList.contains('text-element')) { const iw = selectedElement.querySelector('.content-wrapper'); if(iw) iw.style.fontSize = e.target.value + 'px'; } };
    }
    if(document.getElementById('font-family')) {
        document.getElementById('font-family').onchange = (e) => { if(selectedElement && selectedElement.classList.contains('text-element')) { saveState(); const iw = selectedElement.querySelector('.content-wrapper'); if(iw) iw.style.fontFamily = e.target.value; } };
    }

    const deleteAction = () => { if(selectedElement) { saveState(); selectedElement.remove(); deselect(); } };
    if(document.getElementById('delete-btn')) document.getElementById('delete-btn').onclick = deleteAction;
    if(document.getElementById('float-delete')) document.getElementById('float-delete').onclick = deleteAction;

    const bringFrontAction = () => { if(selectedElement) { saveState(); selectedElement.style.zIndex = maxZIndex++; } };
    if(document.getElementById('bring-front-btn')) document.getElementById('bring-front-btn').onclick = bringFrontAction;
    if(document.getElementById('float-layer-front')) document.getElementById('float-layer-front').onclick = bringFrontAction;
    if(document.getElementById('send-back-btn')) document.getElementById('send-back-btn').onclick = () => { if(selectedElement) { saveState(); selectedElement.style.zIndex = 1; } };

    // --- 7. インポート（Safariクラッシュ完全隔離対策） ---
    const pdfFileInput = document.getElementById('pdf-file-input');
    if (pdfFileInput && document.getElementById('btn-import-pdf')) {
        document.getElementById('btn-import-pdf').onclick = () => pdfFileInput.click();
        pdfFileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    const typedarray = new Uint8Array(this.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    alert(`PDF読み込み成功: 全 ${pdf.numPages} ページを展開します。`);
                    
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const viewport = page.getViewport({ scale: 1.5 });
                        const renderCanvas = document.createElement('canvas');
                        const context = renderCanvas.getContext('2d');
                        renderCanvas.width = viewport.width;
                        renderCanvas.height = viewport.height;
                        
                        await page.render({ canvasContext: context, viewport: viewport }).promise;
                        const imgDataUrl = renderCanvas.toDataURL('image/jpeg', 0.85);
                        
                        if (i === 1 && slides.length === 1 && slides[0].html === "") {
                            slides[0].bg = imgDataUrl; slides[0].html = "";
                        } else {
                            slides.push({ html: "", bg: imgDataUrl, undoStack: [], redoStack: [] });
                        }
                    }
                    switchSlide(slides.length - pdf.numPages);
                } catch (err) {
                    alert("PDFの読み込み機能はこのブラウザに対応していないか、ファイルが破損しています。");
                }
            };
            reader.readAsArrayBuffer(file);
            pdfFileInput.value = '';
        };
    }

    // --- 8. スライド＆ナビ
