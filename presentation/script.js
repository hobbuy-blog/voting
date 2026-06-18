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
let globalDragging = false;

document.addEventListener('DOMContentLoaded', () => {
    const canvas    = document.getElementById('canvas');
    const area      = document.getElementById('canvas-area');
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
        if (colorTarget === 'bg') { 
            slides[currentSlideIndex].bg = color; slides[currentSlideIndex].bgStyle = 'color'; 
            canvas.style.background = color; canvas.style.backgroundImage = 'none'; 
            document.getElementById('bg-color-preview').style.background = color; 
        }
        else if (colorTarget === 'text' && selectedElement?.classList.contains('text-element')) { 
            selectedElement.querySelector('.content-wrapper').style.color = color; syncPropsPanel(); 
        }
        else if (colorTarget === 'shape' && selectedElement && !selectedElement.classList.contains('text-element')) { 
            selectedElement.querySelector('.content-wrapper').style.backgroundColor = color; syncPropsPanel(); 
        }
        saveState(); renderSlideList();
    }

    // ── ズーム・表示 (複数UI同期 + ピンチズーム) ──
    function applyZoom() {
        if (!canvas) return;
        canvas.style.transform=`scale(${currentZoom})`;
        const pct = Math.round(currentZoom * 100);
        document.querySelectorAll('.zoom-val-sync').forEach(el => el.textContent = pct + '%');
        document.querySelectorAll('.zoom-slider-sync').forEach(el => el.value = pct);
        redrawRulers();
    }
    document.querySelectorAll('.zoom-slider-sync').forEach(slider => { slider.addEventListener('input', (e) => { currentZoom = parseInt(e.target.value) / 100; applyZoom(); }); });
    document.querySelectorAll('.zoom-100-sync').forEach(btn => { btn.addEventListener('click', () => { currentZoom = 1.0; applyZoom(); }); });
    document.querySelectorAll('.zoom-fit-sync').forEach(btn => { btn.addEventListener('click', () => { if(!area) return; currentZoom = Math.min((area.clientWidth - 80) / currentWidth, (area.clientHeight - 80) / currentHeight); applyZoom(); }); });

    let pinchStartDist = 0, pinchStartZoom = 1;
    area?.addEventListener('touchstart', e => { if (e.touches.length === 2) { e.preventDefault(); pinchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); pinchStartZoom = currentZoom; } }, { passive: false });
    area?.addEventListener('touchmove', e => { if (e.touches.length === 2 && pinchStartDist > 0) { e.preventDefault(); const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); currentZoom = Math.min(2.0, Math.max(0.1, pinchStartZoom * (dist / pinchStartDist))); applyZoom(); } }, { passive: false });
    area?.addEventListener('touchend', e => { if (e.touches.length < 2) pinchStartDist = 0; });
    document.addEventListener('touchmove', e => { if (globalDragging) e.preventDefault(); }, { passive: false });

    // ── グリッド＆ルーラー ──
    let showGrid = false, showRuler = false;
    bindClick('toggle-grid-btn', () => { showGrid = !showGrid; canvas?.classList.toggle('show-grid', showGrid); document.getElementById('toggle-grid-btn').classList.toggle('active-toggle', showGrid); });
    bindClick('toggle-ruler-btn', () => { showRuler = !showRuler; document.getElementById('ruler-h')?.classList.toggle('hidden', !showRuler); document.getElementById('ruler-v')?.classList.toggle('hidden', !showRuler);  document.getElementById('toggle-ruler-btn').classList.toggle('active-toggle', showRuler); redrawRulers(); });

    function redrawRulers() {
        if (!showRuler || !area) return;
        const cRect = canvas.getBoundingClientRect();
        const rh = document.getElementById('ruler-h');
        if(rh && !rh.classList.contains('hidden')){
            rh.style.top = area.scrollTop + 'px'; rh.style.left = area.scrollLeft + 32 + 'px';
            rh.width = area.clientWidth - 32; rh.height = 20;
            const ctx = rh.getContext('2d'); ctx.clearRect(0,0,rh.width,rh.height);
            ctx.strokeStyle='#cbd5e1'; ctx.fillStyle='#94a3b8'; ctx.font='9px sans-serif';
            const offset = cRect.left - rh.getBoundingClientRect().left;
            for(let v=0; v<=currentWidth; v+=100) { const sx = offset + v * currentZoom; if(sx<0 || sx>rh.width) continue; ctx.beginPath(); ctx.moveTo(sx, rh.height); ctx.lineTo(sx, rh.height/2); ctx.stroke(); ctx.fillText(v, sx+2, rh.height-2); }
        }
        const rv = document.getElementById('ruler-v');
        if(rv && !rv.classList.contains('hidden')){
            rv.style.left = area.scrollLeft + 'px'; rv.style.top = area.scrollTop + 20 + 'px';
            rv.width = 20; rv.height = area.clientHeight - 20;
            const ctx = rv.getContext('2d'); ctx.clearRect(0,0,rv.width,rv.height);
            ctx.strokeStyle='#cbd5e1'; ctx.fillStyle='#94a3b8'; ctx.font='9px sans-serif';
            const offset = cRect.top - rv.getBoundingClientRect().top;
            for(let v=0; v<=currentHeight; v+=100) { const sy = offset + v * currentZoom; if(sy<0 || sy>rv.height) continue; ctx.beginPath(); ctx.moveTo(rv.width, sy); ctx.lineTo(rv.width/2, sy); ctx.stroke(); }
        }
    }
    window.addEventListener('resize', redrawRulers);
    area?.addEventListener('scroll', redrawRulers);

    function updateCanvasResolution() {
        const sel = document.getElementById('slide-size-select'); if(!sel||!canvas) return;
        const [w,h] = sel.value.split('x').map(Number);
        currentWidth=w; currentHeight=h; canvas.style.width=w+'px'; canvas.style.height=h+'px';
        applyZoom(); renderSlideList();
    }
    document.getElementById('slide-size-select')?.addEventListener('change', () => { saveState(); updateCanvasResolution(); });

    // ── 履歴 ──
    function saveState() {
        if (!canvas) return;
        const s=slides[currentSlideIndex]; const cur=canvas.innerHTML;
        if (s.undoStack.length>0 && s.undoStack.at(-1)===cur) return;
        s.undoStack.push(cur); s.redoStack=[];
    }
    bindClick('undo-btn', () => { const s=slides[currentSlideIndex]; if(!s.undoStack.length) return; s.redoStack.push(canvas.innerHTML); canvas.innerHTML=s.undoStack.pop(); reattachEvents(); });
    bindClick('redo-btn', () => { const s=slides[currentSlideIndex]; if(!s.redoStack.length) return; s.undoStack.push(canvas.innerHTML); canvas.innerHTML=s.redoStack.pop(); reattachEvents(); });

    // ── 要素作成とイベント ──
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el=document.createElement('div'); el.className=`canvas-element ${typeClass}`;
        Object.assign(el.style, {width:w+'px',height:h+'px',left:'100px',top:'100px',zIndex:maxZIndex++});
        const handles = typeClass.includes('text-element') ? ['nw','ne','sw','se','w','e'] : ['nw','ne','sw','se'];
        handles.forEach(dir => { const h2=document.createElement('div'); h2.className=`resize-handle ${dir}`; h2.dataset.direction=dir; el.appendChild(h2); });
        canvas.appendChild(el); initElementEvents(el); selectElement(el); renderSlideList();
        window.openTab(null, 'tab-home'); 
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
    bindClick('add-line-btn', () => { const el=createBaseElement('rect-element line-element',240,5); const inner=document.createElement('div'); inner.className='content-wrapper'; inner.style.backgroundColor='#0f172a'; el.appendChild(inner); });
    bindClick('insert-arrow-btn', () => { const el=createBaseElement('rect-element',180,44); const inner=document.createElement('div'); inner.className='content-wrapper'; inner.style.display='flex'; inner.style.alignItems='center'; inner.innerHTML=`<svg width="100%" height="100%" viewBox="0 0 180 44" fill="none" preserveAspectRatio="none"><path d="M4 22h155M143 8l18 14-18 14" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`; el.appendChild(inner); });
    bindClick('insert-star-btn', () => { const el=createBaseElement('rect-element',130,130); const inner=document.createElement('div'); inner.className='content-wrapper'; inner.innerHTML=`<svg width="100%" height="100%" viewBox="0 0 120 120" fill="none"><path d="M60 8l13.5 27.6 30.5 4.4-22 21.4 5.2 30.4L60 77l-27.2 14.8 5.2-30.4L16 39.9l30.5-4.4z" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/></svg>`; el.appendChild(inner); });
    const imageUpload = document.getElementById('image-upload');
    if (imageUpload) {
        bindClick('add-image-btn', () => imageUpload.click());
        imageUpload.addEventListener('change', e => {
            const file = e.target.files[0]; if (!file) return; const r = new FileReader();
            r.onload = ev => {
                const el = createBaseElement('image-element', 340, 255); const img = document.createElement('img');
                img.className = 'content-wrapper'; img.src = ev.target.result; el.appendChild(img); selectElement(el);
            };
            r.readAsDataURL(file); imageUpload.value = '';
        });
    }

    function initElementEvents(el) {
        let isDrag=false, isRes=false, sx, sy, ox, oy, sw, sh, dir;
        const inner = el.querySelector('.content-wrapper');

        // ★ ダブルタップ(クリック)で確実にテキスト編集モードへ移行
        if(inner && el.classList.contains('text-element')) {
            let lastTap = 0;
            const handleEdit = (e) => {
                if(selectedElement === el) { 
                    e.stopPropagation(); e.preventDefault(); 
                    inner.focus(); 
                    try {
                        const range = document.createRange(); range.selectNodeContents(inner); range.collapse(false);
                        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
                    } catch(err){}
                }
            };
            inner.addEventListener('dblclick', handleEdit);
            inner.addEventListener('touchend', (e) => {
                const now = Date.now();
                if(now - lastTap < 300) { handleEdit(e); }
                lastTap = now;
            });
            inner.addEventListener('mousedown', e => { if(document.activeElement === inner) e.stopPropagation(); });
            inner.addEventListener('touchstart', e => { if(document.activeElement === inner) e.stopPropagation(); }, {passive:true});
        }

        el.addEventListener('pointerdown', e => {
            if (e.target.classList.contains('resize-handle')) return;
            // 編集中の場合はドラッグさせない
            if (el.classList.contains('text-element') && document.activeElement === inner) return;

            isDrag=true; globalDragging=true; saveState(); 
            sx=e.clientX; sy=e.clientY; ox=el.offsetLeft; oy=el.offsetTop;
             selectElement(el); e.stopPropagation();
        });

        el.querySelectorAll('.resize-handle').forEach(h => {
            h.addEventListener('pointerdown', e => {
                isRes=true; globalDragging=true; saveState(); 
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
                else if(dir==='e'){nw=sw+dx;} else if(dir==='w'){nw=sw-dx;  el.style.left=(ox+dx)+'px';}
                el.style.width=Math.max(20,nw)+'px'; if(!isText) el.style.height=Math.max(20,nh)+'px';
                if(isText && inner) el.style.height = inner.scrollHeight + 'px';
                syncPropsPanel();
            }
        });
        document.addEventListener('pointerup', e => {
            if(isDrag){ isDrag=false; globalDragging=false; renderSlideList(); }
            if(isRes){ isRes=false; globalDragging=false; renderSlideList(); }
        });
    }

    function selectElement(el) {
        if (!el) return;
        if (selectedElement && selectedElement!==el) selectedElement.classList.remove('selected');
        selectedElement=el; el.classList.add('selected');
        window.openTab(null, 'tab-home'); 
        syncPropsPanel();
    }
    function deselect() {
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement=null; syncPropsPanel();
    }
    canvas?.addEventListener('pointerdown', e => { if (e.target===canvas) deselect(); });

    // ── プロパティ同期とHomeタブ装飾機能の復活 ──
    function syncPropsPanel() {
        const noSel=document.getElementById('props-no-select'); const cont=document.getElementById('props-content');
        if (!selectedElement) { noSel?.classList.remove('hidden'); cont?.classList.add('hidden'); return; }
        noSel?.classList.add('hidden'); cont?.classList.remove('hidden');

        document.getElementById('prop-x').value=parseInt(selectedElement.style.left)||0;
        document.getElementById('prop-y').value=parseInt(selectedElement.style.top)||0;
        document.getElementById('prop-w').value=parseInt(selectedElement.style.width)||0;
        document.getElementById('prop-h').value=parseInt(selectedElement.style.height)||0;

        const inner = selectedElement.querySelector('.content-wrapper');
        const isText = selectedElement.classList.contains('text-element');
        document.getElementById('text-props').classList.toggle('hidden',!isText);
        document.getElementById('shape-props').classList.toggle('hidden',isText);

        if (inner) {
            const s = window.getComputedStyle(inner);
            if (isText) {
                document.getElementById('prop-fontsize').value = parseInt(s.fontSize)||32;
                document.getElementById('font-size').value = parseInt(s.fontSize)||32;
                document.getElementById('text-color-preview').style.background = rgbToHex(s.color);
            } else {
                document.getElementById('shape-color-preview').style.background = rgbToHex(s.backgroundColor||'#2563eb');
            }
        }
        document.getElementById('prop-opacity').value = Math.round((parseFloat(selectedElement.style.opacity)||1)*100);
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

    const patchText = (key, val) => {
        if (!selectedElement?.classList.contains('text-element')) return;
        saveState(); const inner = selectedElement.querySelector('.content-wrapper'); if(inner) inner.style[key] = val;
        syncPropsPanel(); renderSlideList();
    };
    bindClick('align-left-btn',   () => patchText('textAlign','left'));
    bindClick('align-center-btn', () => patchText('textAlign','center'));
    bindClick('align-right-btn',  () => patchText('textAlign','right'));
    bindClick('bold-btn', () => { const inner = selectedElement?.querySelector('.content-wrapper'); if(inner) patchText('fontWeight', window.getComputedStyle(inner).fontWeight==='700'?'400':'700'); });
    bindClick('italic-btn', () => { const inner = selectedElement?.querySelector('.content-wrapper'); if(inner) patchText('fontStyle', window.getComputedStyle(inner).fontStyle==='italic'?'normal':'italic'); });
    document.getElementById('font-family')?.addEventListener('change', e => patchText('fontFamily', e.target.value));
    document.getElementById('font-size')?.addEventListener('input', e => patchText('fontSize', e.target.value+'px'));
    document.getElementById('prop-fontsize')?.addEventListener('input', e => patchText('fontSize', e.target.value+'px'));
    document.getElementById('prop-opacity')?.addEventListener('input', e => { if(selectedElement) selectedElement.style.opacity = e.target.value/100; });

    bindClick('bring-front-btn', () => { if(selectedElement){ saveState(); selectedElement.style.zIndex = maxZIndex++; }});
    bindClick('send-back-btn', () => { if(selectedElement){ saveState(); selectedElement.style.zIndex = 1; }});
    const removeSelected = () => { if(!selectedElement) return; saveState(); selectedElement.remove(); deselect(); renderSlideList(); };
    bindClick('delete-btn', removeSelected);
    bindClick('duplicate-btn', () => {
        if(!selectedElement) return; saveState();
        const clone = selectedElement.cloneNode(true); clone.classList.remove('selected');
        clone.style.left = (parseInt(selectedElement.style.left) + 20) + 'px'; clone.style.top = (parseInt(selectedElement.style.top) + 20) + 'px';
        clone.style.zIndex = maxZIndex++;
        canvas.appendChild(clone); initElementEvents(clone); selectElement(clone); renderSlideList();
    });

    document.querySelectorAll('.theme-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
            saveState(); const bg = sw.dataset.bg; const isGrad = bg.includes('gradient');
            slides[currentSlideIndex].bg = bg; slides[currentSlideIndex].bgStyle = isGrad ? 'gradient' : 'color';
            canvas.style.background = bg; if(!isGrad) canvas.style.backgroundImage = 'none';
            document.getElementById('bg-color-preview').style.background = bg;
            renderSlideList();
        });
    });

    document.querySelectorAll('.trans-btn').forEach(btn => { 
        btn.addEventListener('click', () => { slides[currentSlideIndex].transition = btn.dataset.trans; document.querySelectorAll('.trans-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }); 
    });
    document.querySelectorAll('.anim-set-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if(!selectedElement) return; saveState();
            selectedElement.setAttribute('data-animation', btn.dataset.anim);
            document.querySelectorAll('.anim-set-btn').forEach(b => b.classList.toggle('active', b.dataset.anim === btn.dataset.anim));
            selectedElement.classList.remove('play-anim'); void selectedElement.offsetWidth; selectedElement.classList.add('play-anim');
        });
    });

    // ── スライド管理・エクスポート・プレゼン ──
    function switchSlide(idx) {
        if(idx<0 || idx>=slides.length) return;
        slides[currentSlideIndex].html=canvas.innerHTML;
        currentSlideIndex=idx; 
        const s=slides[idx]; 
        canvas.innerHTML=s.html;
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
    bindClick('add-slide-btn', () => { slides[currentSlideIndex].html=canvas.innerHTML; slides.push({html:'',bg:'#ffffff',bgStyle:'color',transition:'none',undoStack:[],redoStack:[]}); switchSlide(slides.length-1); });
    bindClick('delete-slide-btn', () => { if(slides.length<=1) return; slides.splice(currentSlideIndex,1); switchSlide(Math.max(0,currentSlideIndex-1)); });
    bindClick('duplicate-slide-btn', () => { slides[currentSlideIndex].html = canvas.innerHTML; const curr = slides[currentSlideIndex]; const clone = { html: curr.html, bg: curr.bg, bgStyle: curr.bgStyle, transition: curr.transition, undoStack: [], redoStack: [] }; slides.splice(currentSlideIndex + 1, 0, clone); switchSlide(currentSlideIndex + 1); });

    function reattachEvents() { Array.from(canvas.children).forEach(el=>initElementEvents(el)); deselect(); }

    function rgbToHex(rgb){
        if(!rgb||rgb==='transparent'||rgb.includes('rgba(0,0,0,0)')) return '#ffffff';
        const m=rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m?'#'+m.slice(1).map(v=>parseInt(v).toString(16).padStart(2,'0')).join(''):'#ffffff';
    }

    bindClick('export-pdf-btn', async ()=>{
        if(!window.jspdf||!window.html2canvas){alert('Library missing');return;}
        deselect();
        const{jsPDF}=window.jspdf; const pdf=new jsPDF({orientation:'landscape',unit:'px',format:[currentWidth,currentHeight]});
        const origIdx=currentSlideIndex; slides[origIdx].html=canvas.innerHTML;
        const prevTransform=canvas.style.transform; canvas.style.transform='none';
        const area=document.getElementById('canvas-area'); const prevSL=area.scrollLeft, prevST=area.scrollTop; area.scrollLeft=0; area.scrollTop=0;
        await new Promise(r => setTimeout(r, 100)); 
        for(let i=0;i<slides.length;i++){
            if(i>0) pdf.addPage([currentWidth,currentHeight],'landscape');
            canvas.innerHTML=slides[i].html; const s=slides[i]; canvas.style.background=s.bg||'#fff';
            await new Promise(r => setTimeout(r, 50));
            const cap=await html2canvas(canvas,{ width:currentWidth,height:currentHeight,scale:1,useCORS:true,logging:false });
            pdf.addImage(cap.toDataURL('image/jpeg',0.95),'JPEG',0,0,currentWidth,currentHeight);
        }
        canvas.style.transform=prevTransform; area.scrollLeft=prevSL; area.scrollTop=prevST;
        switchSlide(origIdx); pdf.save('presentation.pdf');
    });

    bindClick('export-pptx-btn', () => {
        if(!window.PptxGenJS){alert('Library missing');return;}
        deselect();
        const pptx = new PptxGenJS(); pptx.layout = (currentWidth/currentHeight > 1.4) ? 'LAYOUT_16x9' : 'LAYOUT_4x3';
        slides[currentSlideIndex].html = canvas.innerHTML;
        slides.forEach(s => {
            const sl = pptx.addSlide(); sl.background = { fill: rgbToHex(s.bg).replace('#', '') };
            const tmp = document.createElement('div'); tmp.innerHTML = s.html;
            tmp.querySelectorAll('.canvas-element').forEach(el => {
                const inner = el.querySelector('.content-wrapper'); if(!inner) return;
                const style = window.getComputedStyle(el);
                const x = ((parseFloat(style.left)||0) / currentWidth) * 100 + "%", y = ((parseFloat(style.top)||0) / currentHeight) * 100 + "%";
                const w = ((parseFloat(style.width)||100) / currentWidth) * 100 + "%", h = ((parseFloat(style.height)||50) / currentHeight) * 100 + "%";
                if (el.classList.contains('text-element')) {
                    const innerStyle = window.getComputedStyle(inner);
                    sl.addText(inner.innerText||'', { x, y, w, h, fontSize: (parseFloat(innerStyle.fontSize)||32)*0.75, color: rgbToHex(innerStyle.color).replace('#',''), align: innerStyle.textAlign||'left' });
                } else if (el.classList.contains('image-element')){
                    const img=el.querySelector('img'); if(img?.src) sl.addImage({data:img.src,x,y,w,h});
                } else if (el.classList.contains('rect-element') || el.classList.contains('circle-element')) {
                    const shape = el.classList.contains('circle-element') ? pptx.ShapeType.oval : pptx.ShapeType.rectangle;
                    sl.addShape(shape, { x, y, w, h, fill: { color: rgbToHex(window.getComputedStyle(inner).backgroundColor).replace('#','') } });
                }
            });
        });
        pptx.writeFile({ fileName: 'presentation.pptx' });
    });

    bindClick('present-btn', () => startPresent(false));
    bindClick('present-from-start-btn', () => startPresent(true));
    function startPresent(fromStart) {
        deselect(); if(fromStart) currentSlideIndex = 0; slides[currentSlideIndex].html = canvas.innerHTML;
        const overlay = document.getElementById('presenter-overlay'); overlay.classList.remove('hidden');
        buildPresenterSlide(currentSlideIndex);
        const docElm = document.documentElement;
        if (docElm.requestFullscreen) docElm.requestFullscreen(); else if (docElm.webkitRequestFullscreen) docElm.webkitRequestFullscreen();
    }
    bindClick('exit-present-btn', () => {
        document.getElementById('presenter-overlay').classList.add('hidden'); switchSlide(currentSlideIndex);
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    });
    function buildPresenterSlide(idx) {
        const s=slides[idx]; const wrap = document.getElementById('presenter-canvas-wrap');
        wrap.innerHTML = `<div id="presenter-slide" class="slide-canvas" style="width:${currentWidth}px;height:${currentHeight}px;background:${s.bg||'#fff'};">${s.html}</div>`;
        const pSlide = document.getElementById('presenter-slide');
        pSlide.querySelectorAll('.resize-handle').forEach(h => h.style.display='none');
        pSlide.querySelectorAll('.selected').forEach(e => e.classList.remove('selected'));
        const scale = Math.min(window.innerWidth / currentWidth, window.innerHeight / currentHeight);
        pSlide.style.transform = `scale(${scale})`; document.getElementById('slide-number').textContent = `${idx+1} / ${slides.length}`;
    }
    bindClick('next-slide', () => { if(currentSlideIndex<slides.length-1){ currentSlideIndex++; buildPresenterSlide(currentSlideIndex); } });
    bindClick('prev-slide', () => { if(currentSlideIndex>0){ currentSlideIndex--; buildPresenterSlide(currentSlideIndex); } });

    document.addEventListener('keydown', e => {
        const tag = document.activeElement.tagName; const inText = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement.isContentEditable;
        const presenting = !document.getElementById('presenter-overlay').classList.contains('hidden');
        if (presenting) {
            if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); document.getElementById('next-slide')?.click(); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); document.getElementById('prev-slide')?.click(); }
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
            if (e.key === 'ArrowLeft') { e.preventDefault(); selectedElement.style.left = (parseInt(selectedElement.style.left) || 0) - pace + 'px'; }
            if (e.key === 'ArrowRight') { e.preventDefault(); selectedElement.style.left = (parseInt(selectedElement.style.left) || 0) + pace + 'px'; }
            if (e.key === 'ArrowUp') { e.preventDefault(); selectedElement.style.top = (parseInt(selectedElement.style.top) || 0) - pace + 'px'; }
            if (e.key === 'ArrowDown') { e.preventDefault(); selectedElement.style.top = (parseInt(selectedElement.style.top) || 0) + pace + 'px'; }
            syncPropsPanel(); renderSlideList();
        }
    });

    // ── 初期化 ──
    updateCanvasResolution();
    canvas.innerHTML = slides[0].html;
    canvas.style.background = slides[0].bg || '#ffffff';
    renderSlideList();
    applyZoom();

    // ============================================================
    //  AI Assistant (Cloudflare Worker経由)
    // ============================================================

    // ★ 以下のURLをご自身のCloudflare WorkerのURLに変更してください
    const WORKER_URL = "https://leaslide-ai.bockring-scratcher.workers.dev/"; 
    // ★ OpenRouter等のプロキシ用にモデルを明示的に指定
    const AI_MODEL = "qwen/qwen-2.5-7b-instruct:free";

    async function callAI(systemPrompt, userPrompt) {
        try {
            console.log("AIリクエスト送信中...", AI_MODEL);
            const response = await fetch(WORKER_URL, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: AI_MODEL, 
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.2
                })
            });

            // ★ いきなりJSONとして解釈せず、まずはテキストとして受け取る
            const responseText = await response.text();

            if (!response.ok) {
                throw new Error(`APIエラー (HTTP ${response.status}): ${responseText}`);
            }

            let data;
            try {
                // ここでJSONパースを試みる
                data = JSON.parse(responseText);
            } catch (e) {
                // WorkerからJSONではなくテキスト（エラーメッセージ）が返ってきた場合
                throw new Error(`Workerからの応答エラー: ${responseText}`);
            }
            
            // OpenRouterのエラーハンドリング
            if (data.error) {
                throw new Error(data.error.message || JSON.stringify(data.error));
            }
            if (!data.choices || data.choices.length === 0) {
                throw new Error("AIから有効なデータが返されませんでした。");
            }
            
            const content = data.choices[0].message.content;
            console.log("AIの生レスポンス:", content);
            
            // マークダウンを除去してJSON部分のみを抽出
            let cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const jsonMatch = cleanContent.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (!jsonMatch) throw new Error("AIがJSON形式で応答しませんでした。レスポンス: " + cleanContent);
            
            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.error("AI Error詳細: ", error);
            // ★ ここで本当のエラー原因をアラート表示する
            alert("AIの処理中にエラーが発生しました。\n\n詳細: " + error.message);
            return null;
        }
    }

    // ── 1. 文章修正 (Fix Text) ──
    bindClick('ai-text-btn', async () => {
        if (!selectedElement || !selectedElement.classList.contains('text-element')) {
            alert("文章を修正するには、テキストボックスを選択してください。");
            return;
        }
        
        const inner = selectedElement.querySelector('.content-wrapper');
        const originalText = inner.innerText;
        
        const btn = document.getElementById('ai-text-btn');
        const origBtnText = btn.innerHTML;
        btn.innerHTML = "⏳ Thinking..."; 
        btn.disabled = true;

        try {
            const systemPrompt = `You are a professional presentation editor. Improve the given Japanese text to make it more concise, impactful, and suitable for a presentation slide.
CRITICAL: Respond ONLY with a raw JSON object. Do not include markdown formatting.
Format: { "revisedText": "your improved Japanese text here" }`;
            
            const result = await callAI(systemPrompt, `Original text: ${originalText}`);
            
            if (result && result.revisedText) {
                saveState();
                inner.innerText = result.revisedText;
                selectedElement.style.height = inner.scrollHeight + 'px';
                renderSlideList();
            }
        } catch (e) {
            console.error(e);
        } finally {
            btn.innerHTML = origBtnText; 
            btn.disabled = false;
        }
    });

    // ── 2. 自動レイアウト (Auto Layout) ──
    bindClick('ai-layout-btn', async () => {
        const activeCanvas = document.querySelector('.canvas-area:not(.hidden)');
        if (!activeCanvas) return;

        const elements = Array.from(activeCanvas.querySelectorAll('.canvas-element'));
        if (elements.length === 0) {
            alert("配置を調整する要素がありません。");
            return;
        }

        const cWidth = currentWidth;
        const cHeight = currentHeight;

        const layoutData = elements.map((el, index) => {
            const type = el.classList.contains('text-element') ? 'text' : 
                         el.classList.contains('image-element') ? 'image' : 'shape';
            return {
                id: `el_${index}`,
                type: type,
                content: type === 'text' ? el.innerText.substring(0, 30) : '',
                x: parseInt(el.style.left) || 0,
                y: parseInt(el.style.top) || 0,
                w: parseInt(el.style.width) || 0,
                h: parseInt(el.style.height) || 0
            };
        });

        const btn = document.getElementById('ai-layout-btn');
        const origBtnText = btn.innerHTML;
        btn.innerHTML = "⏳ Designing..."; 
        btn.disabled = true;

        try {
            const systemPrompt = `You are an expert UI/UX and presentation designer.
The user provides a JSON array of slide elements. The slide canvas size is ${cWidth}x${cHeight} pixels.
Arrange these elements logically without overlapping.
Do not change 'id', 'type', or 'content'. 
CRITICAL: Respond ONLY with a raw JSON array.
Example: [{"id":"el_0","x":100,"y":100,"w":500,"h":80}, ...]`;
            
            const result = await callAI(systemPrompt, JSON.stringify(layoutData));

            if (result && Array.isArray(result)) {
                saveState();
                result.forEach(newLayout => {
                    const index = parseInt(newLayout.id.split('_')[1]);
                    const el = elements[index];
                    if (el) {
                        el.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
                        el.style.left = newLayout.x + 'px';
                        el.style.top = newLayout.y + 'px';
                        el.style.width = newLayout.w + 'px';
                        if (!el.classList.contains('text-element')) {
                            el.style.height = newLayout.h + 'px';
                        }
                        setTimeout(() => el.style.transition = '', 500);
                    }
                });
                syncPropsPanel();
                renderSlideList();
            }
        } catch (e) {
            console.error(e);
        } finally {
            btn.innerHTML = origBtnText; 
            btn.disabled = false;
        }
    });
});
