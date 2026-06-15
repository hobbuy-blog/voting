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
        inner.style.fontFamily = "'Noto Sans JP', sans-serif"; // 初期フォント
        inner.innerText = "クリックして編集";
        el.appendChild(inner);
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

    // --- 4. マウスインタラクション（移動・マルチリサイズ） ---
    function initElementEvents(el) {
        let isDragging = false, isResizing = false;
        let sx, sy, ox, oy, sw, sh, currentDir;
        
        el.onmousedown = (e) => {
            if(e.target.classList.contains('resize-handle')) return;
            if(el.classList.contains('text-element') && selectedElement === el && document.activeElement === el.querySelector('.content-wrapper')) return;
            
            isDragging = true;
            saveState();
            sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;
            selectElement(el);
            e.stopPropagation();
        };

        const handles = el.querySelectorAll('.resize-handle');
        handles.forEach(h => {
            h.onmousedown = (e) => {
                isResizing = true;
                saveState();
                currentDir = h.dataset.direction;
                sx = e.clientX; sy = e.clientY;
                sw = el.offsetWidth; sh = el.offsetHeight;
                ox = el.offsetLeft; oy = el.offsetTop;
                e.stopPropagation(); e.preventDefault();
            };
        });

        document.addEventListener('mousemove', (e) => {
            if(isDragging) {
                el.style.left = (ox + (e.clientX - sx)) + 'px';
                el.style.top = (oy + (e.clientY - sy)) + 'px';
                updateFloatingMenuPosition();
            }
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

        document.addEventListener('mouseup', () => { isDragging = false; isResizing = false; });
    }

    // --- 5. UI同期とフローティングメニュー ---
    function selectElement(el) {
        if(selectedElement) selectedElement.classList.remove('selected');
        selectedElement = el;
        el.classList.add('selected');
        
        const inner = el.querySelector('.content-wrapper');
        const style = window.getComputedStyle(inner);
        const currentAnim = el.getAttribute('data-animation') || 'none';
        
        // アニメーションUI同期
        document.querySelectorAll('.anim-set-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.anim === currentAnim);
        });
        document.getElementById('float-anim-select').value = currentAnim;

        if(el.classList.contains('text-element')) {
            document.getElementById('font-size').value = parseInt(style.fontSize);
            
            // クォーテーションを考慮した高度なフォントファミリー文字列の同期
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

    canvas.onmousedown = (e) => { if(e.target === canvas) deselect(); };
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
        
        // 即時プレビュー
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
    
    // フォントファミリー変更の即時反映
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
                console.error(err);
                alert("PDFのパースに失敗しました。ファイル構造を確認してください。");
            }
        };
        reader.readAsArrayBuffer(file);
        pdfFileInput.value = '';
    };

    // --- 8. スライド＆ナビゲーション管理 ---
    const slideList = document.getElementById('slide-list');
    function renderSlides() {
        slideList.innerHTML = "";
        slides.forEach((s, i) => {
            const div = document.createElement('div');
            div.className = `slide-thumb ${i === currentSlideIndex ? 'active' : ''}`;
            if (s.bg) div.style.backgroundImage = `url(${s.bg})`;
            div.onclick = () => switchSlide(i);
            slideList.appendChild(div);
        });
    }

    function switchSlide(idx) {
        slides[currentSlideIndex].html = canvas.innerHTML;
        slides[currentSlideIndex].bg = canvas.style.backgroundImage ? canvas.style.backgroundImage.slice(5, -2) : "";
        
        currentSlideIndex = idx;
        canvas.innerHTML = slides[idx].html;
        canvas.style.backgroundImage = slides[idx].bg ? `url(${slides[idx].bg})` : "";
        
        reattachEvents();
        renderSlides();
    }

    document.getElementById('add-slide-btn').onclick = () => {
        slides[currentSlideIndex].html = canvas.innerHTML;
        slides[currentSlideIndex].bg = canvas.style.backgroundImage ? canvas.style.backgroundImage.slice(5, -2) : "";
        slides.push({ html: "", bg: "", undoStack: [], redoStack: [] });
        switchSlide(slides.length - 1);
    };

    function reattachEvents() {
        Array.from(canvas.children).forEach(el => { if(el.id !== 'floating-menu') initElementEvents(el); });
        deselect();
    }

    // --- 9. 各種高度エクスポート (PDF / PPTX) ---
    document.getElementById('export-pdf-btn').onclick = async () => {
        deselect();
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('l', 'px', [960, 540]);
        const originalIndex = currentSlideIndex;
        slides[currentSlideIndex].html = canvas.innerHTML;

        for(let i=0; i<slides.length; i++) {
            if(i > 0) pdf.addPage([960, 540], 'l');
            canvas.innerHTML = slides[i].html;
            canvas.style.backgroundImage = slides[i].bg ? `url(${slides[i].bg})` : "";
            const cap = await html2canvas(canvas, { scale: 2, useCORS: true });
            pdf.addImage(cap.toDataURL('image/png'), 'PNG', 0, 0, 960, 540);
        }
        pdf.save("presentation.pdf");
        switchSlide(originalIndex);
    };

    document.getElementById('export-pptx-btn').onclick = () => {
        deselect();
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_16x9';
        const originalIndex = currentSlideIndex;
        slides[currentSlideIndex].html = canvas.innerHTML;

        slides.forEach((s, i) => {
            const slide = pptx.addSlide();
            if(s.bg) slide.addImage({ data: s.bg, x: 0, y: 0, w: "100%", h: "100%" });
            
            const temp = document.createElement('div');
            temp.innerHTML = s.html;
            Array.from(temp.children).forEach(el => {
                const inner = el.querySelector('.content-wrapper');
                if(!inner) return;
                const x = (parseInt(el.style.left)/960)*100 + "%";
                const y = (parseInt(el.style.top)/540)*100 + "%";
                const w = (parseInt(el.style.width)/960)*100 + "%";
                const h = (parseInt(el.style.height)/540)*100 + "%";
                
                if(el.classList.contains('text-element')) {
                    // PPTX出力向けにフォント名を適切にクレンジング
                    const rawFont = inner.style.fontFamily || 'Arial';
                    const fontFaceClean = rawFont.split(',')[0].replace(/['"]/g, '').trim();
                    
                    slide.addText(inner.innerText, { 
                        x, y, w, h, fontSize: parseInt(inner.style.fontSize) || 24, 
                        color: rgbToHex(inner.style.color).replace('#', ''), 
                        fontFace: fontFaceClean
                    });
                } else if(el.classList.contains('image-element')) {
                    slide.addImage({ data: inner.src, x, y, w, h });
                } else if(el.classList.contains('rect-element')) {
                    slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: rgbToHex(inner.style.backgroundColor).replace('#', '') } });
                }
            });
        });
        pptx.writeFile({ fileName: "presentation.pptx" });
        switchSlide(originalIndex);
    };

    // --- 10. スライドショー＆Canva風マルチアニメーション一斉制御 ---
    document.getElementById('present-btn').onclick = () => document.querySelector(".canvas-area").requestFullscreen();
    
    document.onfullscreenchange = () => {
        const controls = document.getElementById('presenter-controls');
        if(document.fullscreenElement) {
            controls.classList.remove('hidden'); deselect();
            document.getElementById('slide-number').innerText = `${currentSlideIndex + 1} / ${slides.length}`;
            playSlideAnimations();
        } else {
            controls.classList.add('hidden');
            Array.from(canvas.children).forEach(el => el.classList.remove('play-anim'));
        }
    };

    function playSlideAnimations() {
        Array.from(canvas.children).forEach(el => {
            el.classList.remove('play-anim');
            void el.offsetWidth; // リフローによる再トリガー
            el.classList.add('play-anim');
        });
    }

    document.getElementById('next-slide').onclick = () => { 
        if (currentSlideIndex < slides.length - 1) { switchSlide(currentSlideIndex + 1); playSlideAnimations(); }
        document.getElementById('slide-number').innerText = `${currentSlideIndex + 1} / ${slides.length}`;
    };
    document.getElementById('prev-slide').onclick = () => { 
        if (currentSlideIndex > 0) { switchSlide(currentSlideIndex - 1); playSlideAnimations(); }
        document.getElementById('slide-number').innerText = `${currentSlideIndex + 1} / ${slides.length}`;
    };
    document.getElementById('exit-present-btn').onclick = () => document.exitFullscreen();

    function rgbToHex(rgb) {
        if (!rgb || rgb === "transparent") return "#000000";
        let match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match) return '#000000';
        return "#" + (("0" + parseInt(match[1]).toString(16)).slice(-2)) + (("0" + parseInt(match[2]).toString(16)).slice(-2)) + (("0" + parseInt(match[3]).toString(16)).slice(-2));
    }

    renderSlides();
    updateUndoRedoUI();
});