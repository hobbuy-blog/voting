// ============================================================
//  Leaslide — script.js (Optimized & Bug-Fixed Version)
// ============================================================

window.openTab = function(evt, tabName) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
    document.getElementById(tabName)?.classList.add('active');
    
    if (evt?.currentTarget) {
        evt.currentTarget.classList.add('active');
    } else {
        const targetBtn = document.querySelector(`.tab-link[onclick*="${tabName}"]`);
        if (targetBtn) targetBtn.classList.add('active');
    }
};

const PALETTE = [
    '#ffffff','#f8fafc','#f1f5f9','#e2e8f0','#cbd5e1','#94a3b8','#64748b','#475569',
    '#334155','#1e293b','#0f172a','#000000',
    '#fef2f2','#fee2e2','#fca5a5','#f87171','#ef4444','#dc2626','#b91c1c','#7f1d1d',
    '#fff7ed','#ffedd5','#fed7aa','#fdba74','#fb923c','#f97316','#ea580c','#7c2d12',
    '#fefce8','#fef9c3','#fde047','#facc15','#eab308','#ca8a04','#a16207','#713f12',
    '#f0fdf4','#dcfce7','#86efac','#4ade80','#22c55e','#16a34a','#15803d','#14532d',
    '#eff6ff','#dbeafe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8','#1e3a8a',
    '#f5f3ff','#ede9fe','#c4b5fd','#a78bfa','#8b5cf6','#7c3aed','#6d28d9','#4c1d95',
    '#fdf4ff','#fae8ff','#e879f9','#d946ef','#a21caf','#86198f','#701a75','#4a044e',
];

let currentWidth  = 1920;
let currentHeight = 1080;
let slides = [{ html:'', bg:'#ffffff', bgStyle:'color', transition:'none', undoStack:[], redoStack:[] }];
let currentSlideIndex = 0;
let selectedElement   = null;
let maxZIndex = 100;
let currentZoom = 0.5;
let snapEnabled = true;
let colorTarget = null; 

document.addEventListener('DOMContentLoaded', () => {
    const canvas    = document.getElementById('canvas');
    const container = document.getElementById('canvas-container');
    const floatMenu = document.getElementById('floating-menu');
    const canvasWrap= document.getElementById('canvas-wrapper');

    const bindClick = (id, fn) => { document.getElementById(id)?.addEventListener('click', fn); };

    // ── カラーパレット設定 ─────────────────────────────────
    const swatchContainer = document.getElementById('color-swatches');
    PALETTE.forEach(c => {
        const btn = document.createElement('div');
        btn.className = 'color-swatch-item'; btn.style.background = c; btn.title = c;
        btn.addEventListener('click', () => applyColorFromPalette(c));
        swatchContainer.appendChild(btn);
    });

    const colorFloat = document.getElementById('color-picker-float');
    const colorHeader= colorFloat.querySelector('.color-float-header');
    let cfDrag=false, cfOX=0, cfOY=0;
    colorHeader.addEventListener('mousedown', e => { cfDrag=true; cfOX=e.clientX-colorFloat.offsetLeft; cfOY=e.clientY-colorFloat.offsetTop; e.preventDefault(); });
    document.addEventListener('mousemove', e => { if (!cfDrag) return; colorFloat.style.left = Math.max(0,e.clientX-cfOX)+'px'; colorFloat.style.top = Math.max(0,e.clientY-cfOY)+'px'; colorFloat.style.right='auto'; colorFloat.style.bottom='auto'; });
    document.addEventListener('mouseup', () => cfDrag=false);
    bindClick('color-float-close', () => colorFloat.classList.add('hidden'));
    bindClick('color-custom-apply', () => applyColorFromPalette(document.getElementById('color-custom-input').value));

    document.querySelectorAll('.color-trigger-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); colorTarget = btn.dataset.target; const rect = btn.getBoundingClientRect();
            colorFloat.style.left = Math.min(rect.left, window.innerWidth - 240) + 'px';
            colorFloat.style.top = (rect.bottom + 4) + 'px'; colorFloat.style.right = 'auto'; colorFloat.style.bottom = 'auto';
            document.getElementById('color-float-title').textContent = colorTarget === 'bg' ? 'Background Color' : colorTarget === 'text' ? 'Text Color' : colorTarget === 'shape' ? 'Shape Fill' : 'Color';
            colorFloat.classList.remove('hidden');
        });
    });
    document.addEventListener('click', (e) => { if (!colorFloat.contains(e.target) && !e.target.closest('.color-trigger-btn')) colorFloat.classList.add('hidden'); });

    function applyColorFromPalette(color) {
        document.querySelectorAll('.color-swatch-item').forEach(s => s.classList.toggle('selected', s.style.background === color || s.title === color));
        if (!colorTarget) return;
        if (colorTarget === 'bg') { canvas.style.background = color; slides[currentSlideIndex].bg = color; document.getElementById('bg-color-preview').style.background = color; }
        else if (colorTarget === 'text') { if (selectedElement?.classList.contains('text-element')) { const inner = selectedElement.querySelector('.content-wrapper'); if(inner) inner.style.color = color; syncPropsPanel(); } }
        else if (colorTarget === 'shape') { if (selectedElement) { const inner = selectedElement.querySelector('.content-wrapper'); if(inner) inner.style.backgroundColor = color; syncPropsPanel(); } }
        saveState(); renderSlideList();
    }

    // ── 解像度・履歴・ズーム ────────────────────────────────
    function updateCanvasResolution() {
        const sel = document.getElementById('slide-size-select'); if(!sel||!canvas) return;
        const [w,h] = sel.value.split('x').map(Number);
        currentWidth=w; currentHeight=h; canvas.style.width=w+'px'; canvas.style.height=h+'px';
        applyZoom(); renderSlideList();
    }
    document.getElementById('slide-size-select')?.addEventListener('change', () => { saveState(); updateCanvasResolution(); });

    function saveState() {
        if (!canvas) return;
        const s=slides[currentSlideIndex]; const cur=canvas.innerHTML;
        if (s.undoStack.length>0 && s.undoStack.at(-1)===cur) return;
        s.undoStack.push(cur); s.redoStack=[]; updateUndoRedoUI();
    }
    function updateUndoRedoUI() {
        const s=slides[currentSlideIndex];
        const u=document.getElementById('undo-btn'); if(u) u.disabled=!s.undoStack.length;
        const r=document.getElementById('redo-btn'); if(r) r.disabled=!s.redoStack.length;
    }
    bindClick('undo-btn', () => { const s=slides[currentSlideIndex]; if(!s.undoStack.length) return; s.redoStack.push(canvas.innerHTML); canvas.innerHTML=s.undoStack.pop(); reattachEvents(); updateUndoRedoUI(); });
    bindClick('redo-btn', () => { const s=slides[currentSlideIndex]; if(!s.redoStack.length) return; s.undoStack.push(canvas.innerHTML); canvas.innerHTML=s.redoStack.pop(); reattachEvents(); updateUndoRedoUI(); });

    function applyZoom() {
        if (!canvas || document.querySelector('.pseudo-fullscreen')) return;
        canvas.style.transform=`scale(${currentZoom})`; canvas.style.transformOrigin='center center';
        const zlbl = document.getElementById('zoom-label'); if(zlbl) zlbl.textContent=Math.round(currentZoom*100)+'%';
    }
    bindClick('zoom-in-btn', () => { currentZoom=Math.min(2.0,currentZoom+0.1); applyZoom(); });
    bindClick('zoom-out-btn', () => { currentZoom=Math.max(0.1,currentZoom-0.1); applyZoom(); });
    bindClick('zoom-reset-btn', () => { currentZoom=0.5; applyZoom(); });

    // ── 要素操作・スナップ・テキストリサイズ連携 ───────────────────────────
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el=document.createElement('div'); el.className=`canvas-element ${typeClass}`;
        Object.assign(el.style, {width:w+'px',height:h+'px',left:'100px',top:'100px',zIndex:maxZIndex++,touchAction:'none'});
        el.setAttribute('data-animation','none');
        
        // テキストは左右水平ハンドル(w, e)も追加
        const handles = typeClass.includes('text-element') ? ['nw','ne','sw','se','w','e'] : ['nw','ne','sw','se'];
        handles.forEach(dir => { const h2=document.createElement('div'); h2.className=`resize-handle ${dir}`; h2.dataset.direction=dir; el.appendChild(h2); });
        
        canvas.appendChild(el); initElementEvents(el); selectElement(el); renderSlideList();
        return el;
    }

    bindClick('add-text-btn', () => {
        const el=createBaseElement('text-element',380,80);
        const inner=document.createElement('div'); inner.className='content-wrapper'; inner.contentEditable=true;
        Object.assign(inner.style,{fontSize:'32px',color:'#0f172a',fontFamily:"'Noto Sans JP', sans-serif",textAlign:'left'});
        inner.innerText='テキストを入力'; el.appendChild(inner);
        
        inner.addEventListener('input', () => {
            el.style.height = inner.scrollHeight + 'px'; // 自動高さ同期
            renderSlideList();
        });
        inner.onblur=()=>{saveState();renderSlideList();};
    });

    bindClick('add-rect-btn', () => { const el=createBaseElement('rect-element',200,130); const inner=document.createElement('div'); inner.className='content-wrapper'; inner.style.backgroundColor='#2563eb'; inner.style.borderRadius='4px'; el.appendChild(inner); });
    bindClick('add-circle-btn', () => { const el=createBaseElement('rect-element circle-element',140,140); const inner=document.createElement('div'); inner.className='content-wrapper'; inner.style.backgroundColor='#7c3aed'; inner.style.borderRadius='50%'; el.appendChild(inner); });
    bindClick('add-line-btn', () => { const el=createBaseElement('rect-element line-element',240,5); const inner=document.createElement('div'); inner.className='content-wrapper'; inner.style.backgroundColor='#0f172a'; el.appendChild(inner); });

    function initElementEvents(el) {
        let isDrag=false, isRes=false;
        let sx, sy, ox, oy, sw, sh, dir;
        let startFontSize = 32;

        el.addEventListener('pointerdown', e => {
            if (e.target.classList.contains('resize-handle')) return;
            if (el.classList.contains('text-element') && e.target.classList.contains('content-wrapper') && selectedElement===el) return;
            isDrag=true; saveState(); el.setPointerCapture(e.pointerId);
            sx=e.clientX; sy=e.clientY; ox=el.offsetLeft; oy=el.offsetTop;
            selectElement(el); e.stopPropagation();
        });

        el.querySelectorAll('.resize-handle').forEach(h => {
            h.addEventListener('pointerdown', e => {
                isRes=true; saveState(); h.setPointerCapture(e.pointerId);
                dir=h.dataset.direction; sx=e.clientX; sy=e.clientY; sw=el.offsetWidth; sh=el.offsetHeight; ox=el.offsetLeft; oy=el.offsetTop;
                if(el.classList.contains('text-element')){
                    const inner=el.querySelector('.content-wrapper');
                    startFontSize=parseFloat(window.getComputedStyle(inner).fontSize)||32;
                }
                e.stopPropagation(); e.preventDefault();
            });
        });

        document.addEventListener('pointermove', e => {
            if (!selectedElement || selectedElement!==el) return;
            const dx=(e.clientX-sx)/currentZoom, dy=(e.clientY-sy)/currentZoom;
            
            if (isDrag) {
                let nx=ox+dx, ny=oy+dy;
                if (snapEnabled) {
                    const snapX = [0, currentWidth*0.05, currentWidth*0.1, currentWidth/2, currentWidth*0.9, currentWidth*0.95, currentWidth];
                    const snapY = [0, currentHeight*0.05, currentHeight*0.1, currentHeight/2, currentHeight*0.9, currentHeight*0.95, currentHeight];
                    let closestX=nx, closestY=ny, minDx=15, minDy=15;
                    snapX.forEach(x => { if(Math.abs(nx-x)<minDx) { closestX=x; minDx=Math.abs(nx-x); } });
                    snapY.forEach(y => { if(Math.abs(ny-y)<minDy) { closestY=y; minDy=Math.abs(ny-y); } });
                    nx=closestX; ny=closestY;
                    drawGuides(nx, ny); // 絶対座標でガイド描画
                }
                el.style.left=nx+'px'; el.style.top=ny+'px';
                syncPropsPanel();
            }
            if (isRes) {
                const isText = el.classList.contains('text-element');
                let newWidth = sw, newHeight = sh;
                if(dir==='se') { newWidth=Math.max(20,sw+dx); if(!isText) newHeight=Math.max(20,sh+dy); }
                else if(dir==='sw') { newWidth=Math.max(20,sw-dx); if(newWidth>20) el.style.left=(ox+dx)+'px'; if(!isText) newHeight=Math.max(20,sh+dy); }
                else if(dir==='ne') { newWidth=Math.max(20,sw+dx); if(!isText) { newHeight=Math.max(20,sh-dy); if(newHeight>20) el.style.top=(oy+dy)+'px'; } }
                else if(dir==='nw') { newWidth=Math.max(20,sw-dx); if(newWidth>20) el.style.left=(ox+dx)+'px'; if(!isText) { newHeight=Math.max(20,sh-dy); if(newHeight>20) el.style.top=(oy+dy)+'px'; } }
                else if(dir==='e') { newWidth=Math.max(20,sw+dx); }
                else if(dir==='w') { newWidth=Math.max(20,sw-dx); if(newWidth>20) el.style.left=(ox+dx)+'px'; }
                
                el.style.width=newWidth+'px'; if(!isText) el.style.height=newHeight+'px';
                
                // テキストボックスの斜めリサイズ時はフォントサイズも比例拡大
                if(isText && ['nw','ne','sw','se'].includes(dir)) {
                    const scale = newWidth / sw;
                    const inner = el.querySelector('.content-wrapper');
                    inner.style.fontSize = (startFontSize * scale) + 'px';
                }
                if (isText) el.style.height = el.querySelector('.content-wrapper').scrollHeight + 'px';
                syncPropsPanel();
            }
        });
        document.addEventListener('pointerup', () => {
            if (isDrag) { isDrag=false; clearGuides(); renderSlideList(); }
            if (isRes)  { isRes=false; renderSlideList(); }
        });
    }

    function drawGuides(x, y) {
        clearGuides();
        if(!canvasWrap) return;
        const gx = document.createElement('div'); gx.className = 'snap-guide vertical'; gx.style.left = x + 'px';
        const gy = document.createElement('div'); gy.className = 'snap-guide horizontal'; gy.style.top = y + 'px';
        canvasWrap.appendChild(gx); canvasWrap.appendChild(gy);
    }
    function clearGuides() { document.querySelectorAll('.snap-guide').forEach(g => g.remove()); }

    function selectElement(el) {
        if (!el) return;
        if (selectedElement && selectedElement!==el) selectedElement.classList.remove('selected');
        selectedElement=el; el.classList.add('selected');
        
        // 要素選択時に強制的にHomeタブへ戻る
        window.openTab(null, 'tab-home');
        
        syncPropsPanel(); repositionFloatMenu();
    }
    function deselect() {
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement=null; floatMenu?.classList.add('hidden'); syncPropsPanel();
    }
    canvas?.addEventListener('pointerdown', e => { if (e.target===canvas) deselect(); });

    function repositionFloatMenu() {
        if (!floatMenu || !selectedElement) { floatMenu?.classList.add('hidden'); return; }
        floatMenu.classList.remove('hidden');
        floatMenu.style.top=Math.max(4,selectedElement.offsetTop-46)+'px';
        floatMenu.style.left=Math.max(4,selectedElement.offsetLeft)+'px';
    }

    function syncPropsPanel() {
        const noSel=document.getElementById('props-no-select'); const cont=document.getElementById('props-content');
        if (!selectedElement) { noSel?.classList.remove('hidden'); cont?.classList.add('hidden'); return; }
        noSel?.classList.add('hidden'); cont?.classList.remove('hidden');
        document.getElementById('prop-left').value=parseInt(selectedElement.style.left)||0;
        document.getElementById('prop-top').value=parseInt(selectedElement.style.top)||0;
        document.getElementById('prop-width').value=parseInt(selectedElement.style.width)||0;
        document.getElementById('prop-height').value=parseInt(selectedElement.style.height)||0;
    }

    // ── 高度なインポート (PDF / PPTX) ─────────────────────────
    bindClick('btn-import-pdf', () => document.getElementById('pdf-file-input').click());
    document.getElementById('pdf-file-input').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async function() {
            try {
                const pdf = await pdfjsLib.getDocument(new Uint8Array(this.result)).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 1.5 });
                    const tCanvas = document.createElement('canvas'); const ctx = tCanvas.getContext('2d');
                    tCanvas.height = viewport.height; tCanvas.width = viewport.width;
                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                    
                    const imgData = tCanvas.toDataURL('image/jpeg', 0.9);
                    const html = `<div class="canvas-element image-element" style="left:0px;top:0px;width:${currentWidth}px;height:${currentHeight}px;z-index:${maxZIndex++};">
                        <img src="${imgData}" class="content-wrapper" style="width:100%;height:100%;object-fit:contain;">
                        <div class="resize-handle nw" data-direction="nw"></div><div class="resize-handle ne" data-direction="ne"></div><div class="resize-handle sw" data-direction="sw"></div><div class="resize-handle se" data-direction="se"></div>
                    </div>`;
                    
                    // 1ページ目の空白対策
                    if (i === 1 && slides.length === 1 && canvas.innerHTML.trim() === '') {
                        slides[0].html = html;
                    } else {
                        slides.push({ html, bg:'#ffffff', bgStyle:'color', transition:'none', undoStack:[], redoStack:[] });
                    }
                }
                switchSlide(0);
            } catch (err) { console.error(err); alert("PDFの読み込みに失敗しました"); }
        };
        reader.readAsArrayBuffer(file); e.target.value = '';
    });

    bindClick('btn-import-pptx', () => document.getElementById('pptx-file-input').click());
    document.getElementById('pptx-file-input').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        const zip = new JSZip();
        try {
            const contents = await zip.loadAsync(file);
            const slideFiles = Object.keys(contents.files).filter(n => n.match(/ppt\/slides\/slide\d+\.xml/));
            
            for (let i = 0; i < slideFiles.length; i++) {
                const slideName = `ppt/slides/slide${i+1}.xml`;
                if (!contents.files[slideName]) continue;
                const xmlText = await contents.files[slideName].async('text');
                const xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
                
                let slideHtml = '';
                xmlDoc.getElementsByTagName('p:sp').forEach(sp => {
                    let textContent = '';
                    // 段落(改行)ごとの分離抽出
                    sp.getElementsByTagName('a:p').forEach(p => {
                        let pText = '';
                        p.getElementsByTagName('a:t').forEach(t => pText += t.textContent);
                        textContent += `<div>${pText || '<br>'}</div>`;
                    });
                    
                    if (textContent.trim().replace(/<br>/g,'')) {
                        slideHtml += `<div class="canvas-element text-element" style="left:100px;top:100px;width:600px;height:auto;z-index:${maxZIndex++};">
                            <div class="content-wrapper" contenteditable="true" style="font-size:32px;color:#000;">${textContent}</div>
                            <div class="resize-handle nw" data-direction="nw"></div><div class="resize-handle ne" data-direction="ne"></div>
                            <div class="resize-handle sw" data-direction="sw"></div><div class="resize-handle se" data-direction="se"></div>
                            <div class="resize-handle w" data-direction="w"></div><div class="resize-handle e" data-direction="e"></div>
                        </div>`;
                    }
                });
                
                if (i === 0 && slides.length === 1 && canvas.innerHTML.trim() === '') slides[0].html = slideHtml;
                else slides.push({ html: slideHtml, bg:'#ffffff', bgStyle:'color', transition:'none', undoStack:[], redoStack:[] });
            }
            switchSlide(0);
        } catch(err) { console.error(err); alert("PPTXの読み込みに失敗"); }
        e.target.value = '';
    });

    // ── 高度なエクスポート (バグ除去) ────────────────────────
    bindClick('export-pdf-btn', async () => {
        if (!window.jspdf || !window.html2canvas) return;
        deselect(); // グレーの帯・UI写り込み防止
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation:'landscape', unit:'px', format:[currentWidth, currentHeight] });
        const origIdx = currentSlideIndex;
        slides[currentSlideIndex].html = canvas.innerHTML; // 元データを安全退避
        
        const oldZoom = currentZoom;
        currentZoom = 1.0; canvas.style.transform = 'none'; // ズーム解除でキャプチャ枠ズレ修正
        await new Promise(r => setTimeout(r, 100)); // ブラウザの再描画待機

        for (let i = 0; i < slides.length; i++) {
            canvas.innerHTML = slides[i].html;
            canvas.style.background = slides[i].bg || '#ffffff';
            await new Promise(r => setTimeout(r, 50));
            
            const cap = await html2canvas(canvas, { width: currentWidth, height: currentHeight, scale: 1, useCORS: true, backgroundColor: null });
            if (i > 0) pdf.addPage([currentWidth, currentHeight], 'landscape');
            pdf.addImage(cap.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, currentWidth, currentHeight);
        }
        
        pdf.save('presentation.pdf');
        
        // 元の環境を安全に完全復元 (ファイル書き換わりバグの解消)
        currentZoom = oldZoom; applyZoom();
        currentSlideIndex = origIdx; canvas.innerHTML = slides[origIdx].html; canvas.style.background = slides[origIdx].bg || '#ffffff';
        reattachEvents();
    });

    bindClick('export-pptx-btn', () => {
        if (!window.PptxGenJS) return;
        const pptx = new PptxGenJS();
        pptx.layout = (currentWidth/currentHeight > 1.4) ? 'LAYOUT_16x9' : 'LAYOUT_4x3';
        slides[currentSlideIndex].html = canvas.innerHTML;

        slides.forEach(s => {
            const slide = pptx.addSlide();
            // PPTX背景黒化バグ修正
            const bgHex = (s.bg && s.bg !== 'transparent' && !s.bg.includes('rgba(0, 0, 0, 0)')) ? rgbToHex(s.bg) : '#ffffff';
            slide.background = { fill: bgHex.replace('#', '') };

            const temp = document.createElement('div'); temp.innerHTML = s.html;
            temp.querySelectorAll('.canvas-element').forEach(el => {
                const inner = el.querySelector('.content-wrapper'); if(!inner) return;
                const x = ((parseFloat(el.style.left)||0)/currentWidth)*100+"%", y = ((parseFloat(el.style.top)||0)/currentHeight)*100+"%";
                const w = ((parseFloat(el.style.width)||100)/currentWidth)*100+"%", h = ((parseFloat(el.style.height)||100)/currentHeight)*100+"%";

                if (el.classList.contains('text-element')) {
                    slide.addText(inner.innerText, { x, y, w, h, fontSize: (parseFloat(inner.style.fontSize)||32)*0.75, color: rgbToHex(inner.style.color||'#000').replace('#',''), align: inner.style.textAlign||'left' });
                } else if (el.classList.contains('rect-element') || el.classList.contains('circle-element')) {
                    slide.addShape(el.classList.contains('circle-element') ? pptx.ShapeType.oval : pptx.ShapeType.rectangle, { x, y, w, h, fill: { color: rgbToHex(inner.style.backgroundColor||'#2563eb').replace('#','') } });
                }
            });
        });
        pptx.writeFile({ fileName: 'presentation.pptx' });
    });

    // ── スライドショー (隔離実行でデータ破損修正) ──────────────────
    let presenterIndex = 0;
    bindClick('present-btn', () => {
        deselect(); slides[currentSlideIndex].html = canvas.innerHTML; // 現時点を保存
        document.getElementById('presenter-overlay').classList.remove('hidden');
        presenterIndex = currentSlideIndex;
        renderPresenterSlide();
    });
    bindClick('exit-present-btn', () => { document.getElementById('presenter-overlay').classList.add('hidden'); });
    bindClick('next-slide', () => { if(presenterIndex < slides.length-1) { presenterIndex++; renderPresenterSlide(); } });
    bindClick('prev-slide', () => { if(presenterIndex > 0) { presenterIndex--; renderPresenterSlide(); } });
    
    function renderPresenterSlide() {
        const wrap = document.getElementById('presenter-canvas-wrap');
        wrap.innerHTML = slides[presenterIndex].html; // 編集DOMとは独立した空間にクローン
        wrap.style.width = currentWidth+'px'; wrap.style.height = currentHeight+'px';
        wrap.style.background = slides[presenterIndex].bg || '#ffffff';
        wrap.style.transform = `scale(${Math.min(window.innerWidth/currentWidth, window.innerHeight/currentHeight)})`;
        wrap.style.transformOrigin = 'center center';
        
        wrap.querySelectorAll('.canvas-element').forEach(el => { el.classList.remove('selected'); el.classList.add('play-anim'); });
        document.getElementById('slide-number').textContent = `${presenterIndex + 1} / ${slides.length}`;
    }

    // ── スライド管理共通ユーティリティ ────────────────────────────
    function switchSlide(idx) {
        slides[currentSlideIndex].html = canvas.innerHTML;
        currentSlideIndex = idx; canvas.innerHTML = slides[idx].html; canvas.style.background = slides[idx].bg;
        reattachEvents(); renderSlideList();
    }
    function renderSlideList() {
        const cont = document.getElementById('thumb-container'); if (!cont) return;
        cont.innerHTML = '';
        slides.forEach((s, i) => {
            const thumb = document.createElement('div'); thumb.className = `slide-thumb ${i===currentSlideIndex ? 'active':''}`; thumb.style.aspectRatio = `${currentWidth}/${currentHeight}`;
            const pv = document.createElement('div'); pv.className = 'thumb-preview-container'; pv.style.width=currentWidth+'px'; pv.style.height=currentHeight+'px';
            pv.innerHTML = i===currentSlideIndex ? canvas.innerHTML : s.html; pv.style.background = s.bg; pv.style.transform = `scale(${(cont.clientWidth/currentWidth)*0.9})`;
            thumb.appendChild(pv); thumb.onclick = () => switchSlide(i); cont.appendChild(thumb);
        });
    }
    function reattachEvents() { Array.from(canvas.children).forEach(el => initElementEvents(el)); }
    function rgbToHex(rgb) {
        if (!rgb || rgb === 'transparent' || rgb.replace(/\s/g, '').includes('rgba(0,0,0,0)')) return '#ffffff';
        if (rgb.startsWith('#')) return rgb;
        const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? "#" + m.slice(1).map(x => parseInt(x).toString(16).padStart(2, '0')).join('') : '#ffffff';
    }

    bindClick('btn-add-slide', () => { slides.push({ html:'', bg:'#ffffff', bgStyle:'color', transition:'none', undoStack:[], redoStack:[] }); switchSlide(slides.length-1); });
    bindClick('btn-del-slide', () => { if(slides.length>1) { slides.splice(currentSlideIndex, 1); switchSlide(Math.max(0, currentSlideIndex-1)); } });
    bindClick('delete-btn', () => { if(selectedElement) { saveState(); selectedElement.remove(); deselect(); renderSlideList(); }});
    bindClick('float-delete', () => document.getElementById('delete-btn').click());

    updateCanvasResolution();
});
