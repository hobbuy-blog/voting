// --- アプリケーション状態管理 ---
let slides = [{ html: "", bg: "", undoStack: [], redoStack: [] }];
let currentSlideIndex = 0;
let selectedElement = null;
let maxZIndex = 100;

// PDF.jsのWorker設定
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const floatingMenu = document.getElementById('floating-menu');
    
    // --- 1. リボンUI タブ切り替え ---
    window.openTab = function(evt, tabName) {
        const panes = document.querySelectorAll(".tab-pane");
        panes.forEach(p => p.classList.remove("active"));
        const links = document.querySelectorAll(".tab-link");
        links.forEach(l => l.classList.remove("active"));
        document.getElementById(tabName).classList.add("active");
        evt.currentTarget.classList.add("active");
    };

    // --- 2. 履歴管理 (Undo/Redo) ---
    function saveState() {
        const slide = slides[currentSlideIndex];
        const currentHTML = canvas.innerHTML;
        if (slide.undoStack.length > 0 && slide.undoStack[slide.undoStack.length - 1] === currentHTML) return;
        slide.undoStack.push(currentHTML);
        slide.redoStack = [];
        updateUndoRedoUI();
    }

    function updateUndoRedoUI() {
        document.getElementById('undo-btn').disabled = slides[currentSlideIndex].undoStack.length === 0;
        document.getElementById('redo-btn').disabled = slides[currentSlideIndex].redoStack.length === 0;
    }

    document.getElementById('undo-btn').onclick = () => {
        const s = slides[currentSlideIndex];
        if (s.undoStack.length === 0) return;
        s.redoStack.push(canvas.innerHTML);
        canvas.innerHTML = s.undoStack.pop();
        reattachEvents();
        updateUndoRedoUI();
    };

    document.getElementById('redo-btn').onclick = () => {
        const s = slides[currentSlideIndex];
        if (s.redoStack.length === 0) return;
        s.undoStack.push(canvas.innerHTML);
        canvas.innerHTML = s.redoStack.pop();
        reattachEvents();
        updateUndoRedoUI();
    };

    // --- 3. 要素コンポーネント生成 ---
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el = document.createElement('div');
        el.className = `canvas-element ${typeClass}`;
        el.style.width = w + 'px'; el.style.height = h + 'px';
        el.style.left = '120px'; el.style.top = '120px';
        el.style.zIndex = maxZIndex++;
        el.setAttribute('data-animation', 'none');
        
        // iPadでのスクロール暴発防止
        el.style.touchAction = 'none';
        
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
        
        // iPad向け：フォーカスが外れたら履歴保存
        inner.onblur = () => saveState();
    };

    document.getElementById('add-rect-btn').onclick = () => {
        const el = createBaseElement('rect-element', 160, 160);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.style.backgroundColor = "#2563eb";
        el.appendChild(inner);
    };

    const imageUpload = document.getElementById('image-upload');
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

    // --- 4. ポインターインタラクション（iPad/マウス両対応） ---
    function initElementEvents(el) {
        let isDragging = false, isResizing = false;
        let sx, sy, ox, oy, sw, sh, currentDir;
        
        // iPadでの誤作動を完全に防ぐため、pointerdownを使用
        el.addEventListener('pointerdown', (e) => {
            if(e.target.classList.contains('resize-handle')) return;
            
            // iPad対応: すでに選択済みのテキストボックスの中身（文字）を触った時は、移動モードにせずキーボードを優先する
            if(el.classList.contains('text-element') && selectedElement === el && e.target.classList.contains('content-wrapper')) {
                return; 
            }
            
            isDragging = true;
            el.setPointerCapture(e.pointerId); // タッチ追跡を固定
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
                h.setPointerCapture(e.pointerId);
                saveState();
                currentDir = h.dataset.direction;
                sx = e.clientX; sy = e.clientY;
                sw = el.offsetWidth; sh = el.offsetHeight;
                ox = el.offsetLeft; oy = el.offsetTop;
                e.stopPropagation(); e.preventDefault();
            });
            
            h.addEventListener('pointerup', (e) => {
                isResizing = false;
                h.releasePointerCapture(e.pointerId);
            });
        });

        el.addEventListener('pointermove', (e) => {
            if(isDragging) {
                el.style.left = (ox + (e.clientX - sx)) + 'px';
                el.style.top = (oy + (e.clientY - sy)) + 'px';
                updateFloatingMenuPosition();
            }
        });

        document.addEventListener('pointermove', (e) => {
            if(isResizing) {
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

        el.addEventListener('pointerup', (e) => {
            isDragging = false;
            el.releasePointerCapture(e.pointerId);
        });
    }

    // --- 5. UI同期とフローティングメニュー ---
    function selectElement(el) {
        if(selectedElement) selectedElement.classList.remove('selected');
        selectedElement = el;
        el.classList.add('selected');
        
        const inner = el.querySelector('.content-wrapper');
        const style = window.getComputedStyle(inner);
        const currentAnim = el.getAttribute('data-animation') || 'none';
        
        document.querySelectorAll('.anim-set-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.anim === currentAnim);
        });
        document.getElementById('float-anim-select').value = currentAnim;

        if(el.classList.contains('text-element')) {
            document.getElementById('font-size').value = parseInt(style.fontSize);
            
            const currentFontClean = style.fontFamily.replace(/['"]/g, '').toLowerCase();
            const fontSelect = document.getElementById('font-family');
            let fontMatched = false;
            for (let option of fontSelect.options) {
                const optValClean = option.value.replace(/['"]/g, '').toLowerCase();
                if (optValClean.includes(currentFontClean) || currentFontClean.includes(optValClean.split(',')[0].trim())) {
                    fontSelect.value = option.value;
                    fontMatched = true;
                    break;
                }
            }
            if(!fontMatched) fontSelect.value = fontSelect.options[0].value;

            document.getElementById('element-color').value = rgbToHex(style.color);
            document.getElementById('float-color').value = rgbToHex(style.color);
            document.querySelector('.text-only-tools').style.display = 'flex';
        } else {
            document.querySelector('.text-only-tools').style.display = 'none';
            if(el.classList.contains('rect-element')) {
                document.getElementById('element-color').value = rgbToHex(style.backgroundColor);
                document.getElementById('float-color').value = rgbToHex(style.backgroundColor);
            }
        }
        updateFloatingMenuPosition();
    }

    function updateFloatingMenuPosition() {
        if(!selectedElement) { floatingMenu.classList.add('hidden'); return; }
        floatingMenu.classList.remove('hidden');
        floatingMenu.style.top = Math.max(10, selectedElement.offsetTop - 48) + 'px';
        floatingMenu.style.left = Math.max(10, selectedElement.offsetLeft) + 'px';
    }

    canvas.addEventListener('pointerdown', (e) => { if(e.target === canvas) deselect(); });
    function deselect() { if(selectedElement) selectedElement.classList.remove('selected'); selectedElement = null; floatingMenu.classList.add('hidden'); }

    // --- 6. アニメーション＆プロパティ設定変更 ---
    function setAnimation(animName) {
        if(!selectedElement) return;
        saveState();
        selectedElement.setAttribute('data-animation', animName);
        document.querySelectorAll('.anim-set-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.anim === animName);
        });
        document.getElementById('float-anim-select').value = animName;
        
        selectedElement.classList.remove('play-anim');
        void selectedElement.offsetWidth;
        selectedElement.classList.add('play-anim');
    }

    document.querySelectorAll('.anim-set-btn').forEach(btn => {
        btn.onclick = () => setAnimation(btn.dataset.anim);
    });
    document.getElementById('float-anim-select').onchange = (e) => setAnimation(e.target.value);

    const applyColor = (color) => {
        if(!selectedElement) return;
        const inner = selectedElement.querySelector('.content-wrapper');
        if(selectedElement.classList.contains('text-element')) inner.style.color = color;
        else if(selectedElement.classList.contains('rect-element')) inner.style.backgroundColor = color;
    };
    document.getElementById('element-color').oninput = (e) => { applyColor(e.target.value); document.getElementById('float-color').value = e.target.value; };
    document.getElementById('float-color').oninput = (e) => { applyColor(e.target.value); document.getElementById('element-color').value = e.target.value; };
    document.getElementById('font-size').oninput = (e) => { if(selectedElement && selectedElement.classList.contains('text-element')) selectedElement.querySelector('.content-wrapper').style.fontSize = e.target.value + 'px'; };
    
    document.getElementById('font-family').onchange = (e) => { 
        if(selectedElement && selectedElement.classList.contains('text-element')) {
            saveState();
            selectedElement.querySelector('.content-wrapper').style.fontFamily = e.target.value; 
        }
    };

    document.getElementById('delete-btn').onclick = () => { if(selectedElement) { saveState(); selectedElement.remove(); deselect(); } };
    document.getElementById('float-delete').onclick = () => { if(selectedElement) { saveState(); selectedElement.remove(); deselect(); } };
    document.getElementById('bring-front-btn').onclick = () => { if(selectedElement) { saveState(); selectedElement.style.zIndex = maxZIndex++; } };
    document.getElementById('float-layer-front').onclick = () => { if(selectedElement) { saveState(); selectedElement.style.zIndex = maxZIndex++; } };
    document.getElementById('send-back-btn').onclick = () => { if(selectedElement) { saveState(); selectedElement.style.zIndex = 1; } };

    // --- 7. インポート（PDFスライド自動コンバート） ---
    const pdfFileInput = document.getElementById('pdf-file-input');
    document.getElementById('btn-import-pdf').onclick = () => pdfFileInput.click();
    
    pdfFileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async function() {
            const typedarray = new Uint8Array(this.result);
            try {
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                alert(`PDF読み込み成功: 全 ${pdf.numPages} ページを独自スライド構造へ自動展開します。`);
                
                for (let i = 1; i
