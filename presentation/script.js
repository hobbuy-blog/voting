window.openTab = function(evt, tabName) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
    document.getElementById(tabName)?.classList.add('active');
    if (evt?.currentTarget) evt.currentTarget.classList.add('active');
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

document.addEventListener('DOMContentLoaded', () => {
    const canvas    = document.getElementById('canvas');
    const container = document.getElementById('canvas-container');
    const bindClick = (id, fn) => { document.getElementById(id)?.addEventListener('click', fn); };

    // ── カラーパレット ──
    let colorTarget = null;
    const swatchContainer = document.getElementById('color-swatches');
    PALETTE.forEach(c => {
        const btn = document.createElement('div'); btn.className = 'color-swatch-item'; btn.style.background = c;
        btn.addEventListener('click', () => applyColor(c)); swatchContainer.appendChild(btn);
    });
    const colorFloat = document.getElementById('color-picker-float');
    let cfDrag=false, cfOX=0, cfOY=0;
    colorFloat.querySelector('.color-float-header').addEventListener('mousedown', e => { cfDrag=true; cfOX=e.clientX-colorFloat.offsetLeft; cfOY=e.clientY-colorFloat.offsetTop; });
    document.addEventListener('mousemove', e => { if(cfDrag){ colorFloat.style.left=Math.max(0,e.clientX-cfOX)+'px'; colorFloat.style.top=Math.max(0,e.clientY-cfOY)+'px'; } });
    document.addEventListener('mouseup', () => cfDrag=false);
    bindClick('color-float-close', () => colorFloat.classList.add('hidden'));

    document.querySelectorAll('.color-trigger-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); colorTarget = btn.dataset.target;
            const rect = btn.getBoundingClientRect();
            colorFloat.style.left = Math.min(rect.left, window.innerWidth - 240) + 'px';
            colorFloat.style.top = (rect.bottom + 4) + 'px';
            colorFloat.classList.remove('hidden');
        });
    });

    function applyColor(color) {
        if (!colorTarget) return;
        if (colorTarget === 'bg') { slides[currentSlideIndex].bg = color; slides[currentSlideIndex].bgStyle = 'color'; canvas.style.background = color; canvas.style.backgroundImage = 'none'; document.getElementById('bg-color-preview').style.background = color; }
        else if (colorTarget === 'text' && selectedElement?.classList.contains('text-element')) { selectedElement.querySelector('.content-wrapper').style.color = color; syncPropsPanel(); }
        else if (colorTarget === 'shape' && selectedElement && !selectedElement.classList.contains('text-element')) { selectedElement.querySelector('.content-wrapper').style.backgroundColor = color; syncPropsPanel(); }
        saveState(); renderSlideList();
    }

    // ── ズームとDisplayタブ ──
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomVal = document.getElementById('zoom-slider-val');

    function applyZoom() {
        if (!canvas) return;
        canvas.style.transform=`scale(${currentZoom})`;
        const pct = Math.round(currentZoom * 100);
        if(zoomVal) zoomVal.textContent = pct + '%';
        if(zoomSlider) zoomSlider.value = pct;
        redrawRulers();
    }
    zoomSlider?.addEventListener('input', (e) => {
        currentZoom = parseInt(e.target.value) / 100; applyZoom();
    });
    bindClick('zoom-100-btn', () => { currentZoom = 1.0; applyZoom(); });
    bindClick('zoom-fit-btn', () => {
        const area = document.getElementById('canvas-area');
        if(!area) return;
        currentZoom = Math.min((area.clientWidth - 80) / currentWidth, (area.clientHeight - 80) / currentHeight);
        applyZoom();
    });

    let showGrid = false, showRuler = false;
    bindClick('toggle-grid-btn', () => {
        showGrid = !showGrid;
        canvas?.classList.toggle('show-grid', showGrid);
        document.getElementById('toggle-grid-btn').classList.toggle('active-toggle', showGrid);
    });
    bindClick('toggle-ruler-btn', () => {
        showRuler = !showRuler;
        document.getElementById('ruler-h')?.classList.toggle('hidden', !showRuler);
        document.getElementById('ruler-v')?.classList.toggle('hidden', !showRuler);
        document.getElementById('toggle-ruler-btn').classList.toggle('active-toggle', showRuler);
        redrawRulers();
    });

    function redrawRulers() {
        if (!showRuler) return;
        const cRect = canvas.getBoundingClientRect();
        // 水平
        const rh = document.getElementById('ruler-h');
        if(rh && !rh.classList.contains('hidden')){
            rh.width = rh.offsetWidth; rh.height = rh.offsetHeight;
            const ctx = rh.getContext('2d'); ctx.clearRect(0,0,rh.width,rh.height);
            ctx.strokeStyle='#cbd5e1'; ctx.fillStyle='#94a3b8'; ctx.font='9px sans-serif';
            const offset = cRect.left - rh.getBoundingClientRect().left;
            for(let v=0; v<=currentWidth; v+=100) {
                const sx = offset + v * currentZoom; if(sx<0 || sx>rh.width) continue;
                ctx.beginPath(); ctx.moveTo(sx, rh.height); ctx.lineTo(sx, rh.height/2); ctx.stroke();
                ctx.fillText(v, sx+2, rh.height-2);
            }
        }
        // 垂直
        const rv = document.getElementById('ruler-v');
        if(rv && !rv.classList.contains('hidden')){
            rv.width = rv.offsetWidth; rv.height = rv.offsetHeight;
            const ctx = rv.getContext('2d'); ctx.clearRect(0,0,rv.width,rv.height);
            ctx.strokeStyle='#cbd5e1'; ctx.fillStyle='#94a3b8'; ctx.font='9px sans-serif';
            const offset = cRect.top - rv.getBoundingClientRect().top;
            for(let v=0; v<=currentHeight; v+=100) {
                const sy = offset + v * currentZoom; if(sy<0 || sy>rv.height) continue;
                ctx.beginPath(); ctx.moveTo(rv.width, sy); ctx.lineTo(rv.width/2, sy); ctx.stroke();
            }
        }
    }
    window.addEventListener('resize', redrawRulers);

    // ── 履歴 ──
    function saveState() {
        if (!canvas) return;
        const s=slides[currentSlideIndex]; const cur=canvas.innerHTML;
        if (s.undoStack.length>0 && s.undoStack.at(-1)===cur) return;
        s.undoStack.push(cur); s.redoStack=[];
    }
    bindClick('undo-btn', () => { const s=slides[currentSlideIndex]; if(!s.undoStack.length) return; s.redoStack.push(canvas.innerHTML); canvas.innerHTML=s.undoStack.pop(); reattachEvents(); });
    bindClick('redo-btn', () => { const s=slides[currentSlideIndex]; if(!s.redoStack.length) return; s.undoStack.push(canvas.innerHTML); canvas.innerHTML=s.redoStack.pop(); reattachEvents(); });

    // ── 要素作成とダブルタップ編集 ──
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el=document.createElement('div'); el.className=`canvas-element ${typeClass}`;
        Object.assign(el.style, {width:w+'px',height:h+'px',left:'100px',top:'100px',zIndex:maxZIndex++});
        const handles = typeClass.includes('text-element') ? ['nw','ne','sw','se','w','e'] : ['nw','ne','sw','se'];
        handles.forEach(dir => { const h2=document.createElement('div'); h2.className=`resize-handle ${dir}`; h2.dataset.direction=dir; el.appendChild(h2); });
        canvas.appendChild(el); initElementEvents(el); selectElement(el); renderSlideList();
        window.openTab(null, 'tab-home'); // ★ 強制Home遷移
        return el;
    }

    bindClick('add-text-btn', () => {
        const el=createBaseElement('text-element',380,80);
        const inner=document.createElement('div'); inner.className='content-wrapper'; inner.contentEditable=true;
        Object.assign(inner.style,{fontSize:'32px',color:'#0f172a',fontFamily:"'Noto Sans JP', sans-serif"}); inner.innerText='テキストを入力';
        el.appendChild(inner);
        inner.addEventListener('input', () => { el.style.height = inner.scrollHeight + 'px'; renderSlideList(); });
    });
    bindClick('add-rect-btn', () => { const el=createBaseElement('rect-element',200,130); const inner=document.createElement('div'); inner.className='content-wrapper'; inner.style.backgroundColor='#2563eb'; el.appendChild(inner); });
    bindClick('add-circle-btn', () => { const el=createBaseElement('rect-element circle-element',140,140); const inner=document.createElement('div'); inner.className='content-wrapper'; inner.style.backgroundColor='#7c3aed'; inner.style.borderRadius='50%'; el.appendChild(inner); });

    function initElementEvents(el) {
        let isDrag=false, isRes=false, sx, sy, ox, oy, sw, sh, dir;
        let lastTap = 0;

        // ★ ダブルタップ(DblClick)でテキスト編集を許可
        const inner = el.querySelector('.content-wrapper');
        if(inner && el.classList.contains('text-element')) {
            const handleEdit = (e) => {
                if(selectedElement === el) { e.stopPropagation(); inner.focus(); }
            };
            inner.addEventListener('dblclick', handleEdit);
            inner.addEventListener('touchstart', (e) => {
                const now = Date.now();
                if(now - lastTap < 300) handleEdit(e);
                lastTap = now;
            });
        }

        el.addEventListener('pointerdown', e => {
            if (e.target.classList.contains('resize-handle')) return;
            // 編集中の場合はドラッグを無効化
            if (el.classList.contains('text-element') && document.activeElement === inner) return;

            isDrag=true; saveState(); el.setPointerCapture(e.pointerId);
            sx=e.clientX; sy=e.clientY; ox=el.offsetLeft; oy=el.offsetTop;
            selectElement(el); e.stopPropagation();
        });

        el.querySelectorAll('.resize-handle').forEach(h => {
            h.addEventListener('pointerdown', e => {
                isRes=true; saveState(); h.setPointerCapture(e.pointerId);
                dir=h.dataset.direction; sx=e.clientX; sy=e.clientY; sw=el.offsetWidth; sh=el.offsetHeight; ox=el.offsetLeft; oy=el.offsetTop;
                e.stopPropagation(); e.preventDefault();
            });
        });

        document.addEventListener('pointermove', e => {
            if (!selectedElement || selectedElement!==el) return;
            const dx=(e.clientX-sx)/currentZoom, dy=(e.clientY-sy)/currentZoom;
            if (isDrag) { el.style.left=(ox+dx)+'px'; el.style.top=(oy+dy)+'px'; syncPropsPanel(); }
            if (isRes) {
                const isText = el.classList.contains('text-element');
                let nw=sw, nh=sh;
                if (dir==='se'){nw=sw+dx; nh=sh+dy;} else if(dir==='sw'){nw=sw-dx; el.style.left=(ox+dx)+'px'; nh=sh+dy;}
                else if(dir==='ne'){nw=sw+dx; nh=sh-dy; el.style.top=(oy+dy)+'px';} else if(dir==='nw'){nw=sw-dx; el.style.left=(ox+dx)+'px'; nh=sh-dy; el.style.top=(oy+dy)+'px';}
                else if(dir==='e'){nw=sw+dx;} else if(dir==='w'){nw=sw-dx; el.style.left=(ox+dx)+'px';}
                el.style.width=Math.max(20,nw)+'px'; if(!isText) el.style.height=Math.max(20,nh)+'px';
                if(isText && inner) el.style.height = inner.scrollHeight + 'px';
                syncPropsPanel();
            }
        });
        document.addEventListener('pointerup', e => {
            if(isDrag){ try{el.releasePointerCapture(e.pointerId);}catch(_){} isDrag=false; renderSlideList(); }
            if(isRes){ isRes=false; renderSlideList(); }
        });
    }

    function selectElement(el) {
        if (!el) return;
        if (selectedElement && selectedElement!==el) selectedElement.classList.remove('selected');
        selectedElement=el; el.classList.add('selected');
        window.openTab(null, 'tab-home'); // ★ 強制Home遷移
        syncPropsPanel();
    }
    function deselect() {
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement=null; syncPropsPanel();
    }
    canvas?.addEventListener('pointerdown', e => { if (e.target===canvas) deselect(); });

    // ── プロパティ同期 ──
    function syncPropsPanel() {
        const noSel=document.getElementById('props-no-select'); const cont=document.getElementById('props-content');
        if (!selectedElement) { noSel?.classList.remove('hidden'); cont?.classList.add('hidden'); return; }
        noSel?.classList.add('hidden'); cont?.classList.remove('hidden');

        document.getElementById('prop-x').value=parseInt(selectedElement.style.left)||0;
        document.getElementById('prop-y').value=parseInt(selectedElement.style.top)||0;
        document.getElementById('prop-w').value=parseInt(selectedElement.style.width)||0;
        document.getElementById('prop-h').value=parseInt(selectedElement.style.height)||0;

        const isText=selectedElement.classList.contains('text-element');
        document.getElementById('text-props').classList.toggle('hidden',!isText);
        document.getElementById('shape-props').classList.toggle('hidden',isText);
    }
    ['prop-x','prop-y','prop-w','prop-h'].forEach(id=>{
        document.getElementById(id)?.addEventListener('change',()=>{
            if(!selectedElement) return; saveState();
            if(id==='prop-x') selectedElement.style.left=(parseInt(document.getElementById(id).value)||0)+'px';
            if(id==='prop-y') selectedElement.style.top=(parseInt(document.getElementById(id).value)||0)+'px';
            if(id==='prop-w') selectedElement.style.width=(parseInt(document.getElementById(id).value)||20)+'px';
            if(id==='prop-h') selectedElement.style.height=(parseInt(document.getElementById(id).value)||20)+'px';
            renderSlideList();
        });
    });

    // ── スライド管理・複製 ──
    function switchSlide(idx) {
        if(idx<0 || idx>=slides.length) return;
        slides[currentSlideIndex].html=canvas.innerHTML;
        currentSlideIndex=idx; const s=slides[idx]; canvas.innerHTML=s.html;
        canvas.style.background=s.bg||'#ffffff';
        reattachEvents(); renderSlideList();
    }
    function renderSlideList() {
        const list=document.getElementById('slide-list'); if(!list) return;
        list.innerHTML='';
        slides.forEach((s,i)=>{
            const thumb=document.createElement('div'); thumb.className=`slide-thumb ${i===currentSlideIndex?'active':''}`; thumb.style.aspectRatio=`${currentWidth}/${currentHeight}`;
            const pv=document.createElement('div'); pv.className='thumb-preview-container'; pv.style.width=currentWidth+'px'; pv.style.height=currentHeight+'px';
            pv.innerHTML=(i===currentSlideIndex)?canvas.innerHTML:s.html; pv.style.background=s.bg;
            pv.style.transform=`scale(${(list.clientWidth-14)/currentWidth})`;
            thumb.appendChild(pv); thumb.onclick=()=>switchSlide(i); list.appendChild(thumb);
        });
    }
    bindClick('add-slide-btn', () => {
        slides[currentSlideIndex].html=canvas.innerHTML;
        slides.push({html:'',bg:'#ffffff',bgStyle:'color',transition:'none',undoStack:[],redoStack:[]});
        switchSlide(slides.length-1);
    });
    bindClick('delete-slide-btn', () => {
        if(slides.length<=1) return;
        slides.splice(currentSlideIndex,1); switchSlide(Math.max(0,currentSlideIndex-1));
    });
    
    // ★ スライド複製のバグ修正
    bindClick('duplicate-slide-btn', () => {
        slides[currentSlideIndex].html = canvas.innerHTML; // 現状保存
        const curr = slides[currentSlideIndex];
        const clone = { html: curr.html, bg: curr.bg, bgStyle: curr.bgStyle, transition: curr.transition, undoStack: [], redoStack: [] };
        slides.splice(currentSlideIndex + 1, 0, clone); // 次の配列に挿入
        switchSlide(currentSlideIndex + 1);
    });

    function reattachEvents() { Array.from(canvas.children).forEach(el=>initElementEvents(el)); deselect(); }

    // ── PPTX エクスポート修正（NaN・透明化対応） ──
    function rgbToHex(rgb){
        if(!rgb||rgb==='transparent'||rgb.includes('rgba(0,0,0,0)')) return '#ffffff';
        const m=rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m?'#'+m.slice(1).map(v=>parseInt(v).toString(16).padStart(2,'0')).join(''):'#ffffff';
    }
    bindClick('export-pptx-btn', () => {
        if(!window.PptxGenJS){alert('Library missing');return;}
        deselect();
        const pptx = new PptxGenJS();
        pptx.layout = (currentWidth/currentHeight > 1.4) ? 'LAYOUT_16x9' : 'LAYOUT_4x3';
        slides[currentSlideIndex].html = canvas.innerHTML;

        slides.forEach(s => {
            const sl = pptx.addSlide();
            sl.background = { fill: rgbToHex(s.bg).replace('#', '') };

            const tmp = document.createElement('div'); tmp.innerHTML = s.html;
            tmp.querySelectorAll('.canvas-element').forEach(el => {
                const inner = el.querySelector('.content-wrapper'); if(!inner) return;
                const style = window.getComputedStyle(el);
                const x = ((parseFloat(style.left)||0) / currentWidth) * 100 + "%";
                const y = ((parseFloat(style.top)||0) / currentHeight) * 100 + "%";
                const w = ((parseFloat(style.width)||100) / currentWidth) * 100 + "%";
                const h = ((parseFloat(style.height)||50) / currentHeight) * 100 + "%";

                if (el.classList.contains('text-element')) {
                    const innerStyle = window.getComputedStyle(inner);
                    sl.addText(inner.innerText||'', { x, y, w, h, fontSize: (parseFloat(innerStyle.fontSize)||32)*0.75, color: rgbToHex(innerStyle.color).replace('#',''), align: innerStyle.textAlign||'left' });
                } else if (el.classList.contains('rect-element') || el.classList.contains('circle-element')) {
                    const shape = el.classList.contains('circle-element') ? pptx.ShapeType.oval : pptx.ShapeType.rectangle;
                    sl.addShape(shape, { x, y, w, h, fill: { color: rgbToHex(window.getComputedStyle(inner).backgroundColor).replace('#','') } });
                }
            });
        });
        pptx.writeFile({ fileName: 'presentation.pptx' });
    });

    // ── スライドショー（全画面連動） ──
    bindClick('present-btn', () => startPresent(false));
    bindClick('present-from-start-btn', () => startPresent(true));
    
    function startPresent(fromStart) {
        deselect();
        if(fromStart) currentSlideIndex = 0;
        slides[currentSlideIndex].html = canvas.innerHTML;
        
        const overlay = document.getElementById('presenter-overlay');
        overlay.classList.remove('hidden');
        buildPresenterSlide(currentSlideIndex);

        // ★ ブラウザのフルスクリーン化
        const docElm = document.documentElement;
        if (docElm.requestFullscreen) docElm.requestFullscreen();
        else if (docElm.webkitRequestFullscreen) docElm.webkitRequestFullscreen();
    }

    bindClick('exit-present-btn', () => {
        document.getElementById('presenter-overlay').classList.add('hidden');
        switchSlide(currentSlideIndex);

        // ★ ブラウザのフルスクリーン解除
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    });

    function buildPresenterSlide(idx) {
        const s=slides[idx];
        const wrap = document.getElementById('presenter-canvas-wrap');
        wrap.innerHTML = `<div id="presenter-slide" class="slide-canvas" style="width:${currentWidth}px;height:${currentHeight}px;background:${s.bg||'#fff'};">${s.html}</div>`;
        const pSlide = document.getElementById('presenter-slide');
        pSlide.querySelectorAll('.resize-handle').forEach(h => h.style.display='none');
        pSlide.querySelectorAll('.selected').forEach(e => e.classList.remove('selected'));
        
        const scale = Math.min(window.innerWidth / currentWidth, window.innerHeight / currentHeight);
        pSlide.style.transform = `scale(${scale})`;
        document.getElementById('slide-number').textContent = `${idx+1} / ${slides.length}`;
    }

    bindClick('next-slide', () => { if(currentSlideIndex<slides.length-1){ currentSlideIndex++; buildPresenterSlide(currentSlideIndex); } });
    bindClick('prev-slide', () => { if(currentSlideIndex>0){ currentSlideIndex--; buildPresenterSlide(currentSlideIndex); } });

    // 初期化
    updateCanvasResolution();
    applyZoom();
});
