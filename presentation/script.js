document.addEventListener('DOMContentLoaded', () => {
    const { jsPDF } = window.jspdf;
    const canvas = document.getElementById('canvas');
    const slideListContainer = document.getElementById('slide-list');
    
    // アプリケーション状態の管理
    let slides = [{ html: "", undoStack: [], redoStack: [] }];
    let currentSlideIndex = 0;
    let selectedElement = null;
    let maxZIndex = 10;
    let isCropping = false;

    // UI 要素の取得
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const colorProperty = document.getElementById('color-property');
    const colorInput = document.getElementById('element-color');
    const textProperties = document.getElementById('text-properties');
    const fontFamilyInp = document.getElementById('font-family');
    const fontSizeInp = document.getElementById('font-size');
    const boldBtn = document.getElementById('bold-btn');
    const italicBtn = document.getElementById('italic-btn');
    const underlineBtn = document.getElementById('underline-btn');
    const alignLeftBtn = document.getElementById('align-left-btn');
    const alignCenterBtn = document.getElementById('align-center-btn');
    const alignRightBtn = document.getElementById('align-right-btn');
    const imageProperties = document.getElementById('image-properties');
    const cropStartBtn = document.getElementById('crop-start-btn');
    const imgBrightnessInp = document.getElementById('img-brightness');
    const imgContrastInp = document.getElementById('img-contrast');
    const imgSaturateInp = document.getElementById('img-saturate');

    // --- 0. 履歴管理 (Undo / Redo) ロジック ---
    function updateUndoRedoUI() {
        const slide = slides[currentSlideIndex];
        undoBtn.disabled = slide.undoStack.length === 0;
        redoBtn.disabled = slide.redoStack.length === 0;
    }

    function saveState() {
        const slide = slides[currentSlideIndex];
        const currentHTML = canvas.innerHTML;
        // 直前の状態と重複していなければ履歴に追加
        if (slide.undoStack.length > 0 && slide.undoStack[slide.undoStack.length - 1] === currentHTML) return;
        
        slide.undoStack.push(currentHTML);
        slide.redoStack = []; // 新しい操作が行われたら進む履歴をクリア
        
        if (slide.undoStack.length > 50) slide.undoStack.shift(); // 最大50件
        updateUndoRedoUI();
    }

    function undo() {
        const slide = slides[currentSlideIndex];
        if (slide.undoStack.length === 0) return;
        if (isCropping) cancelCrop();
        
        slide.redoStack.push(canvas.innerHTML);
        canvas.innerHTML = slide.undoStack.pop();
        reattachBehaviors();
        updateUndoRedoUI();
    }

    function redo() {
        const slide = slides[currentSlideIndex];
        if (slide.redoStack.length === 0) return;
        if (isCropping) cancelCrop();
        
        slide.undoStack.push(canvas.innerHTML);
        canvas.innerHTML = slide.redoStack.pop();
        reattachBehaviors();
        updateUndoRedoUI();
    }

    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);

    // キーボードショートカット設定
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') { e.preventDefault(); undo(); }
            else if (e.key === 'y' || (e.key === 'Z' && e.shiftKey)) { e.preventDefault(); redo(); }
        }
    });

    // 履歴復元やスライド切り替え時にイベントを再構築する関数
    function reattachBehaviors() {
        selectedElement = null;
        colorProperty.style.display = 'none';
        textProperties.style.display = 'none';
        imageProperties.style.display = 'none';
        
        Array.from(canvas.children).forEach(el => {
            el.classList.remove('selected');
            makeDraggable(el);
            makeResizable(el);
            el.addEventListener('mousedown', (e) => { selectElement(el); e.stopPropagation(); });
            
            const inner = el.querySelector('.content-wrapper');
            if (inner && inner.contentEditable === "true") {
                inner.addEventListener('focus', () => saveState());
            }
        });
    }

    // --- 1. スライド管理 ---
    function renderSlideList() {
        slideListContainer.innerHTML = "";
        slides.forEach((slide, index) => {
            const thumb = document.createElement('div');
            thumb.className = `slide-thumb ${index === currentSlideIndex ? 'active' : ''}`;
            thumb.innerHTML = `<span style="position:absolute; bottom:2px; right:5px; font-size:10px; color:#666">${index+1}</span>`;
            thumb.onclick = () => switchSlide(index);
            slideListContainer.appendChild(thumb);
        });
    }

    function switchSlide(index) {
        if (isCropping) cancelCrop();
        slides[currentSlideIndex].html = canvas.innerHTML;
        currentSlideIndex = index;
        canvas.innerHTML = slides[currentSlideIndex].html;
        reattachBehaviors();
        updateUndoRedoUI();
        renderSlideList();
    }

    document.getElementById('add-slide-btn').addEventListener('click', () => {
        slides[currentSlideIndex].html = canvas.innerHTML;
        slides.push({ html: "", undoStack: [], redoStack: [] });
        switchSlide(slides.length - 1);
    });

    // --- 2. 要素作成ロジック ---
    function createBaseElement(w, h, typeClass) {
        saveState();
        const el = document.createElement('div');
        el.className = `canvas-element ${typeClass}`;
        el.style.width = w + 'px'; el.style.height = h + 'px';
        el.style.left = '50px'; el.style.top = '50px';
        el.style.zIndex = maxZIndex++;
        
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        el.appendChild(handle);
        canvas.appendChild(el);
        
        makeDraggable(el);
        makeResizable(el);
        el.addEventListener('mousedown', (e) => { selectElement(el); e.stopPropagation(); });
        return el;
    }

    document.getElementById('add-text-btn').addEventListener('click', () => {
        const el = createBaseElement(250, 60, 'text-element');
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.contentEditable = true;
        inner.innerText = "テキストを入力";
        inner.style.fontSize = "24px";
        inner.style.fontFamily = "Arial";
        inner.style.color = "#333333";
        inner.addEventListener('focus', () => saveState());
        el.appendChild(inner);
        selectElement(el);
    });

    document.getElementById('add-rect-btn').addEventListener('click', () => {
        const el = createBaseElement(100, 100, 'rect-element');
        const inner = document.createElement('div');
        inner.className = 'content-wrapper';
        inner.style.backgroundColor = "#3b82f6";
        inner.style.borderRadius = "4px";
        el.appendChild(inner);
        selectElement(el);
    });

    const imageUpload = document.getElementById('image-upload');
    document.getElementById('add-image-btn').addEventListener('click', () => imageUpload.click());
    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width, h = img.height;
                const maxW = 400, maxH = 300;
                if (w > maxW) { h = h * (maxW / w); w = maxW; }
                if (h > maxH) { w = w * (maxH / h); h = maxH; }
                
                const el = createBaseElement(w, h, 'image-element');
                const inner = document.createElement('img');
                inner.className = 'content-wrapper';
                inner.src = ev.target.result;
                inner.draggable = false;
                el.dataset.brightness = 100;
                el.dataset.contrast = 100;
                el.dataset.saturate = 100;
                el.appendChild(inner);
                selectElement(el);
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        imageUpload.value = '';
    });

    // --- 3. 要素の選択とプロパティの同期 ---
    [colorInput, fontFamilyInp, fontSizeInp, imgBrightnessInp, imgContrastInp, imgSaturateInp].forEach(inp => {
        inp.addEventListener('focus', () => saveState());
        inp.addEventListener('mousedown', () => saveState());
    });

    function selectElement(el) {
        if (isCropping) return;
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement = el;
        el.classList.add('selected');

        colorProperty.style.display = 'none';
        textProperties.style.display = 'none';
        imageProperties.style.display = 'none';

        const inner = el.querySelector('.content-wrapper');
        const style = window.getComputedStyle(inner);

        if (el.classList.contains('text-element')) {
            colorProperty.style.display = 'flex'; textProperties.style.display = 'flex';
            colorInput.value = rgbToHex(style.color);
            fontSizeInp.value = parseInt(style.fontSize);
            boldBtn.classList.toggle('active', style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700);
            italicBtn.classList.toggle('active', style.fontStyle === 'italic');
            underlineBtn.classList.toggle('active', style.textDecorationLine.includes('underline'));
        } else if (el.classList.contains('rect-element')) {
            colorProperty.style.display = 'flex';
            colorInput.value = rgbToHex(style.backgroundColor);
        } else if (el.classList.contains('image-element')) {
            imageProperties.style.display = 'flex';
            imgBrightnessInp.value = el.dataset.brightness;
            imgContrastInp.value = el.dataset.contrast;
            imgSaturateInp.value = el.dataset.saturate;
        }
    }

    function deselectElement() {
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement = null;
        colorProperty.style.display = 'none';
        textProperties.style.display = 'none';
        imageProperties.style.display = 'none';
    }

    canvas.addEventListener('mousedown', (e) => { if (e.target === canvas) deselectElement(); });

    // --- 4. プロパティ変更処理 ---
    colorInput.addEventListener('input', (e) => {
        if (!selectedElement) return;
        const inner = selectedElement.querySelector('.content-wrapper');
        if (selectedElement.classList.contains('text-element')) inner.style.color = e.target.value;
        else if (selectedElement.classList.contains('rect-element')) inner.style.backgroundColor = e.target.value;
    });

    fontFamilyInp.addEventListener('change', (e) => { 
        if (selectedElement && selectedElement.classList.contains('text-element')) {
            selectedElement.querySelector('.content-wrapper').style.fontFamily = e.target.value;
        }
    });
    
    fontSizeInp.addEventListener('input', (e) => { 
        if (selectedElement && selectedElement.classList.contains('text-element')) {
            selectedElement.querySelector('.content-wrapper').style.fontSize = `${e.target.value}px`;
        }
    });

    const toggleStyle = (btn, prop, value1, value2) => {
        if (!selectedElement || !selectedElement.classList.contains('text-element')) return;
        saveState();
        const inner = selectedElement.querySelector('.content-wrapper');
        const current = window.getComputedStyle(inner)[prop];
        const isActive = (prop === 'fontWeight' && (current === 'bold' || parseInt(current) >= 700)) || current.includes(value1);
        inner.style[prop] = isActive ? value2 : value1;
        btn.classList.toggle('active', !isActive);
    };
    boldBtn.onclick = () => toggleStyle(boldBtn, 'fontWeight', 'bold', 'normal');
    italicBtn.onclick = () => toggleStyle(italicBtn, 'fontStyle', 'italic', 'normal');
    underlineBtn.onclick = () => toggleStyle(underlineBtn, 'textDecorationLine', 'underline', 'none');

    const setAlign = (align) => {
        if (!selectedElement || !selectedElement.classList.contains('text-element')) return;
        saveState();
        selectedElement.querySelector('.content-wrapper').style.textAlign = align;
        alignLeftBtn.classList.toggle('active', align === 'left');
        alignCenterBtn.classList.toggle('active', align === 'center');
        alignRightBtn.classList.toggle('active', align === 'right');
    };
    alignLeftBtn.onclick = () => setAlign('left');
    alignCenterBtn.onclick = () => setAlign('center');
    alignRightBtn.onclick = () => setAlign('right');

    function updateImageFilter(prop, value) {
        if (selectedElement && selectedElement.classList.contains('image-element')) {
            selectedElement.dataset[prop] = value;
            const inner = selectedElement.querySelector('.content-wrapper');
            inner.style.filter = `brightness(${selectedElement.dataset.brightness}%) contrast(${selectedElement.dataset.contrast}%) saturate(${selectedElement.dataset.saturate}%)`;
        }
    }
    imgBrightnessInp.addEventListener('input', (e) => updateImageFilter('brightness', e.target.value));
    imgContrastInp.addEventListener('input', (e) => updateImageFilter('contrast', e.target.value));
    imgSaturateInp.addEventListener('input', (e) => updateImageFilter('saturate', e.target.value));

    // --- 5. 移動・リサイズ・レイヤー管理 ---
    function makeDraggable(el) {
        let isDragging = false, sx, sy, ox, oy;
        el.onmousedown = (e) => {
            if (e.target.classList.contains('resize-handle') || e.target.tagName === 'BUTTON') return;
            if (e.target.contentEditable === "true" && document.activeElement === e.target) return;
            saveState();
            isDragging = true;
            sx = e.clientX; sy = e.clientY;
            ox = el.offsetLeft; oy = el.offsetTop;
            if (!el.classList.contains('crop-box')) selectElement(el);
            e.stopPropagation();
        };
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            el.style.left = (ox + (e.clientX - sx)) + 'px';
            el.style.top = (oy + (e.clientY - sy)) + 'px';
            if (el.classList.contains('crop-box')) updateCropPreview();
        });
        document.addEventListener('mouseup', () => isDragging = false);
    }

    function makeResizable(el) {
        const h = el.querySelector('.resize-handle');
        if (!h) return;
        let isResizing = false, sw, sh, sx, sy;
        h.onmousedown = (e) => {
            saveState();
            isResizing = true;
            sx = e.clientX; sy = e.clientY;
            sw = el.offsetWidth; sh = el.offsetHeight;
            e.stopPropagation(); e.preventDefault();
        };
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            el.style.width = Math.max(20, sw + (e.clientX - sx)) + 'px';
            el.style.height = Math.max(20, sh + (e.clientY - sy)) + 'px';
            if (el.classList.contains('crop-box')) updateCropPreview();
        });
        document.addEventListener('mouseup', () => isResizing = false);
    }

    document.getElementById('bring-front-btn').onclick = () => { if (selectedElement) { saveState(); selectedElement.style.zIndex = maxZIndex++; } };
    document.getElementById('send-back-btn').onclick = () => { if (selectedElement) { saveState(); selectedElement.style.zIndex = 0; } };
    document.getElementById('delete-btn').onclick = () => { if (selectedElement) { saveState(); selectedElement.remove(); deselectElement(); } };
    document.getElementById('clear-btn').onclick = () => { if (confirm('すべて消去しますか？')) { saveState(); canvas.innerHTML = ''; deselectElement(); } };

    // --- 6. 画像トリミング ---
    let cropTargetElement = null; let cropBox = null;
    cropStartBtn.addEventListener('click', () => {
        if (!selectedElement || !selectedElement.classList.contains('image-element')) return;
        isCropping = true; cropTargetElement = selectedElement;
        const innerImg = cropTargetElement.querySelector('.content-wrapper');
        cropTargetElement.classList.remove('selected'); imageProperties.style.display = 'none';
        
        const overlay = document.createElement('div'); overlay.className = 'crop-overlay'; overlay.id = 'crop-overlay'; canvas.appendChild(overlay);
        cropBox = document.createElement('div'); cropBox.className = 'crop-box';
        cropBox.style.width = cropTargetElement.style.width; cropBox.style.height = cropTargetElement.style.height;
        cropBox.style.left = cropTargetElement.style.left; cropBox.style.top = cropTargetElement.style.top;
        
        const previewImg = innerImg.cloneNode(); previewImg.style.filter = 'none'; cropBox.appendChild(previewImg);
        const handle = document.createElement('div'); handle.className = 'resize-handle'; cropBox.appendChild(handle);
        
        const controls = document.createElement('div'); controls.className = 'crop-controls';
        controls.innerHTML = `<button id="crop-ok-btn" class="accent-btn">✅ 確定</button><button id="crop-cancel-btn" class="danger-btn">❌ キャンセル</button>`;
        cropBox.appendChild(controls);
        canvas.appendChild(cropBox);
        
        makeDraggable(cropBox); makeResizable(cropBox); updateCropPreview();
        
        document.getElementById('crop-ok-btn').onclick = finalizeCrop;
        document.getElementById('crop-cancel-btn').onclick = cancelCrop;
        overlay.onclick = cancelCrop;
    });

    function updateCropPreview() {
        if (!cropBox || !cropTargetElement) return;
        const previewImg = cropBox.querySelector('img');
        const ox = parseInt(cropTargetElement.style.left), oy = parseInt(cropTargetElement.style.top);
        const bx = parseInt(cropBox.style.left), by = parseInt(cropBox.style.top);
        previewImg.style.left = (ox - bx) + 'px'; previewImg.style.top = (oy - by) + 'px';
        previewImg.style.width = cropTargetElement.style.width; previewImg.style.height = cropTargetElement.style.height;
    }

    function cancelCrop() { isCropping = false; if (document.getElementById('crop-overlay')) document.getElementById('crop-overlay').remove(); if (cropBox) cropBox.remove(); cropBox = null; if (cropTargetElement) { selectElement(cropTargetElement); cropTargetElement = null; } }
    
    async function finalizeCrop() {
        if (!cropBox || !cropTargetElement) return;
        saveState();
        const innerImg = cropTargetElement.querySelector('.content-wrapper');
        const tempCanvas = document.createElement('canvas'); const ctx = tempCanvas.getContext('2d');
        const cw = cropBox.offsetWidth, ch = cropBox.offsetHeight; tempCanvas.width = cw; tempCanvas.height = ch;
        const ox = parseInt(cropTargetElement.style.left), oy = parseInt(cropTargetElement.style.top);
        const bx = parseInt(cropBox.style.left), by = parseInt(cropBox.style.top);
        
        const img = new Image(); img.src = innerImg.src; await img.decode();
        const scaleX = img.naturalWidth / cropTargetElement.offsetWidth, scaleY = img.naturalHeight / cropTargetElement.offsetHeight;
        ctx.drawImage(img, (bx - ox) * scaleX, (by - oy) * scaleY, cw * scaleX, ch * scaleY, 0, 0, cw, ch);
        
        innerImg.src = tempCanvas.toDataURL('image/png');
        cropTargetElement.style.width = cw + 'px'; cropTargetElement.style.height = ch + 'px';
        cropTargetElement.style.left = bx + 'px'; cropTargetElement.style.top = by + 'px';
        cancelCrop(); 
    }

    // --- 7. エクスポート機能 (PDF & PPTX) ---
    document.getElementById('export-pdf-btn').addEventListener('click', async () => {
        deselectElement();
        const pdf = new jsPDF('landscape', 'px', [800, 600]);
        const originalSlideIndex = currentSlideIndex;
        slides[currentSlideIndex].html = canvas.innerHTML;
        
        for (let i = 0; i < slides.length; i++) {
            if (i > 0) pdf.addPage([800, 600], 'landscape');
            canvas.innerHTML = slides[i].html;
            const capture = await html2canvas(canvas, { backgroundColor: '#ffffff', scale: 2 });
            pdf.addImage(capture.toDataURL('image/png'), 'PNG', 0, 0, 800, 600);
        }
        pdf.save('presentation.pdf');
        switchSlide(originalSlideIndex);
    });

    document.getElementById('export-pptx-btn').addEventListener('click', async () => {
        deselectElement();
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_4x3';
        
        const originalSlideIndex = currentSlideIndex;
        slides[currentSlideIndex].html = canvas.innerHTML;
        const tempDiv = document.createElement('div');

        for (let i = 0; i < slides.length; i++) {
            const slide = pptx.addSlide();
            tempDiv.innerHTML = slides[i].html;
            const elements = Array.from(tempDiv.children);
            elements.sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0));

            for (const el of elements) {
                const rect = {
                    x: (parseInt(el.style.left) / 800) * 100 + '%',
                    y: (parseInt(el.style.top) / 600) * 100 + '%',
                    w: (parseInt(el.style.width) / 800) * 100 + '%',
                    h: (parseInt(el.style.height) / 600) * 100 + '%'
                };
                const inner = el.querySelector('.content-wrapper');
                if (!inner) continue;

                if (el.classList.contains('text-element')) {
                    const style = inner.style;
                    slide.addText(inner.innerText, {
                        x: rect.x, y: rect.y, w: rect.w, h: rect.h,
                        fontSize: parseInt(style.fontSize) || 18,
                        color: rgbToHex(style.color).replace('#', ''),
                        fontFace: style.fontFamily || 'Arial',
                        bold: style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 700,
                        italic: style.fontStyle === 'italic',
                        underline: { style: style.textDecorationLine.includes('underline') ? 'sng' : 'none' },
                        align: style.textAlign || 'left',
                        valign: 'top'
                    });
                } else if (el.classList.contains('rect-element')) {
                    slide.addShape(pptx.ShapeType.rect, {
                        x: rect.x, y: rect.y, w: rect.w, h: rect.h,
                        fill: { color: rgbToHex(inner.style.backgroundColor).replace('#', '') }
                    });
                } else if (el.classList.contains('image-element')) {
                    slide.addImage({ data: inner.src, x: rect.x, y: rect.y, w: rect.w, h: rect.h });
                }
            }
        }
        pptx.writeFile({ fileName: 'presentation.pptx' });
        switchSlide(originalSlideIndex);
    });

    // --- 8. プレゼンテーションモード ---
    const presenterPanel = document.getElementById('presenter-controls');
    document.getElementById('present-btn').onclick = () => document.getElementById('canvas-view').requestFullscreen();
    document.onfullscreenchange = () => {
        if (document.fullscreenElement) {
            if (isCropping) cancelCrop();
            presenterPanel.classList.remove('hidden'); deselectElement();
            document.getElementById('slide-number').innerText = `${currentSlideIndex + 1} / ${slides.length}`;
        } else presenterPanel.classList.add('hidden');
    };
    
    document.getElementById('next-slide').onclick = () => { if (currentSlideIndex < slides.length - 1) switchSlide(currentSlideIndex + 1); document.getElementById('slide-number').innerText = `${currentSlideIndex + 1} / ${slides.length}`; };
    document.getElementById('prev-slide').onclick = () => { if (currentSlideIndex > 0) switchSlide(currentSlideIndex - 1); document.getElementById('slide-number').innerText = `${currentSlideIndex + 1} / ${slides.length}`; };
    document.getElementById('exit-present-btn').onclick = () => document.exitFullscreen();

    // カラーユーティリティ
    function rgbToHex(rgb) {
        if (!rgb || rgb === "transparent") return "#000000";
        let match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match) return '#000000';
        const hex = (x) => ("0" + parseInt(x).toString(16)).slice(-2);
        return "#" + hex(match[1]) + hex(match[2]) + hex(match[3]);
    }

    // 初期起動
    renderSlideList();
    updateUndoRedoUI();
});