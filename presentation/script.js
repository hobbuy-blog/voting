// --- アプリケーション状態管理 ---
let slides = [{ html: "", undoStack: [], redoStack: [] }];
let currentSlideIndex = 0;
let selectedElement = null;
let maxZIndex = 100;
let isCropping = false;

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    
    // --- 1. リボンUI タブ切り替え制御 ---
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

    // --- 3. コンポーネント生成 ---
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el = document.createElement('div');
        el.className = `canvas-element ${typeClass}`;
        el.style.width = w + 'px'; el.style.height = h + 'px';
        el.style.left = '120px'; el.style.top = '120px';
        el.style.zIndex = maxZIndex++;
        
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        el.appendChild(handle);
        
        canvas.appendChild(el);
        initElementEvents(el);
        selectElement(el);
        return el;
    }

    document.getElementById('add-text-btn').onclick = () => {
        const el = createBaseElement('text-element', 320, 70);
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.contentEditable = true;
        inner.style.fontSize = "32px";
        inner.style.color = "#0f172a";
        inner.style.fontFamily = "sans-serif";
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
            img.draggable = false;
            el.appendChild(img);
        };
        reader.readAsDataURL(file);
        imageUpload.value = ''; // 連続アップロード可能にクリア
    };

    // --- 4. マウス操作（ドラッグ＆リサイズ） ---
    function initElementEvents(el) {
        let isDragging = false, sx, sy, ox, oy;
        
        el.onmousedown = (e) => {
            if(e.target.classList.contains('resize-handle')) return;
            if(e.target.contentEditable === "true" && document.activeElement === e.target) return;
            isDragging = true;
            saveState();
            sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;
            selectElement(el);
            e.stopPropagation();
        };

        document.addEventListener('mousemove', (e) => {
            if(!isDragging) return;
            el.style.left = (ox + (e.clientX - sx)) + 'px';
            el.style.top = (oy + (e.clientY - sy)) + 'px';
        });

        document.addEventListener('mouseup', () => isDragging = false);

        // コーナーリサイズ
        const h = el.querySelector('.resize-handle');
        if(h) {
            let isResizing = false, sw, sh;
            h.onmousedown = (e) => {
                isResizing = true; saveState();
                sx = e.clientX; sy = e.clientY;
                sw = el.offsetWidth; sh = el.offsetHeight;
                e.stopPropagation(); e.preventDefault();
            };
            document.addEventListener('mousemove', (e) => {
                if(!isResizing) return;
                el.style.width = Math.max(20, sw + (e.clientX - sx)) + 'px';
                el.style.height = Math.max(20, sh + (e.clientY - sy)) + 'px';
            });
            document.addEventListener('mouseup', () => isResizing = false);
        }
    }

    function selectElement(el) {
        if(selectedElement) selectedElement.classList.remove('selected');
        selectedElement = el;
        el.classList.add('selected');
        
        // リボンUI上のツール状態と選択要素の同期
        const inner = el.querySelector('.content-wrapper');
        const style = window.getComputedStyle(inner);
        if(el.classList.contains('text-element')) {
            document.getElementById('font-size').value = parseInt(style.fontSize);
            document.getElementById('font-family').value = style.fontFamily.includes('serif') ? 'serif' : (style.fontFamily.includes('monospace') ? 'monospace' : 'sans-serif');
            document.getElementById('element-color').value = rgbToHex(style.color);
        } else if(el.classList.contains('rect-element')) {
            document.getElementById('element-color').value = rgbToHex(style.backgroundColor);
        }
    }

    canvas.onmousedown = (e) => { if(e.target === canvas) deselect(); };
    function deselect() { if(selectedElement) selectedElement.classList.remove('selected'); selectedElement = null; }

    // --- 5. プロパティ操作同期 ---
    document.getElementById('font-size').oninput = (e) => {
        if(selectedElement && selectedElement.classList.contains('text-element')) {
            selectedElement.querySelector('.content-wrapper').style.fontSize = e.target.value + 'px';
        }
    };

    document.getElementById('font-family').onchange = (e) => {
        if(selectedElement && selectedElement.classList.contains('text-element')) {
            selectedElement.querySelector('.content-wrapper').style.fontFamily = e.target.value;
        }
    };

    document.getElementById('element-color').oninput = (e) => {
        if(!selectedElement) return;
        const inner = selectedElement.querySelector('.content-wrapper');
        if(selectedElement.classList.contains('text-element')) inner.style.color = e.target.value;
        else if(selectedElement.classList.contains('rect-element')) inner.style.backgroundColor = e.target.value;
    };

    document.getElementById('delete-btn').onclick = () => {
        if(selectedElement) { saveState(); selectedElement.remove(); deselect(); }
    };
    document.getElementById('bring-front-btn').onclick = () => { if (selectedElement) { saveState(); selectedElement.style.zIndex = maxZIndex++; } };
    document.getElementById('send-back-btn').onclick = () => { if (selectedElement) { saveState(); selectedElement.style.zIndex = 1; } };

    // --- 6. スライド＆ページ管理 ---
    const slideList = document.getElementById('slide-list');
    function renderSlides() {
        slideList.innerHTML = "";
        slides.forEach((s, i) => {
            const div = document.createElement('div');
            div.className = `slide-thumb ${i === currentSlideIndex ? 'active' : ''}`;
            div.onclick = () => switchSlide(i);
            slideList.appendChild(div);
        });
    }

    function switchSlide(idx) {
        slides[currentSlideIndex].html = canvas.innerHTML;
        currentSlideIndex = idx;
        canvas.innerHTML = slides[idx].html;
        reattachEvents();
        renderSlides();
    }

    document.getElementById('add-slide-btn').onclick = () => {
        slides[currentSlideIndex].html = canvas.innerHTML;
        slides.push({ html: "", undoStack: [], redoStack: [] });
        switchSlide(slides.length - 1);
    };

    function reattachEvents() {
        Array.from(canvas.children).forEach(el => initElementEvents(el));
        deselect();
    }

    // --- 7. 各種エクスポート機能 ---
    document.getElementById('export-pdf-btn').onclick = async () => {
        deselect();
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('l', 'px', [960, 540]);
        const originalSlideIndex = currentSlideIndex;
        slides[currentSlideIndex].html = canvas.innerHTML;

        for(let i=0; i<slides.length; i++) {
            if(i > 0) pdf.addPage([960, 540], 'l');
            canvas.innerHTML = slides[i].html;
            const cap = await html2canvas(canvas, { scale: 2 });
            pdf.addImage(cap.toDataURL('image/png'), 'PNG', 0, 0, 960, 540);
        }
        pdf.save("presentation.pdf");
        switchSlide(originalSlideIndex);
    };

    document.getElementById('export-pptx-btn').onclick = () => {
        deselect();
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_16x9';
        const originalSlideIndex = currentSlideIndex;
        slides[currentSlideIndex].html = canvas.innerHTML;

        slides.forEach((s, i) => {
            const slide = pptx.addSlide();
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
                    slide.addText(inner.innerText, { 
                        x, y, w, h, 
                        fontSize: parseInt(inner.style.fontSize) || 24,
                        color: rgbToHex(inner.style.color).replace('#', ''),
                        fontFace: inner.style.fontFamily || 'Arial'
                    });
                } else if(el.classList.contains('image-element')) {
                    slide.addImage({ data: inner.src, x, y, w, h });
                } else if(el.classList.contains('rect-element')) {
                    slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: rgbToHex(inner.style.backgroundColor).replace('#', '') } });
                }
            });
        });
        pptx.writeFile({ fileName: "presentation.pptx" });
        switchSlide(originalSlideIndex);
    };

    // --- 8. スライドショー機能 ---
    document.getElementById('present-btn').onclick = () => {
        document.querySelector(".canvas-area").requestFullscreen();
    };

    document.onfullscreenchange = () => {
        const controls = document.getElementById('presenter-controls');
        if(document.fullscreenElement) {
            controls.classList.remove('hidden');
            deselect();
            document.getElementById('slide-number').innerText = `${currentSlideIndex + 1} / ${slides.length}`;
        } else {
            controls.classList.add('hidden');
        }
    };

    document.getElementById('next-slide').onclick = () => { if (currentSlideIndex < slides.length - 1) switchSlide(currentSlideIndex + 1); document.getElementById('slide-number').innerText = `${currentSlideIndex + 1} / ${slides.length}`; };
    document.getElementById('prev-slide').onclick = () => { if (currentSlideIndex > 0) switchSlide(currentSlideIndex - 1); document.getElementById('slide-number').innerText = `${currentSlideIndex + 1} / ${slides.length}`; };
    document.getElementById('exit-present-btn').onclick = () => document.exitFullscreen();

    // カラー変換ユーティリティ
    function rgbToHex(rgb) {
        if (!rgb || rgb === "transparent") return "#000000";
        let match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match) return '#000000';
        const hex = (x) => ("0" + parseInt(x).toString(16)).slice(-2);
        return "#" + hex(match[1]) + hex(match[2]) + hex(match[3]);
    }

    renderSlides();
    updateUndoRedoUI();
});
