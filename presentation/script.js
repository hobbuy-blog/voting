// ============================================================
//  Leaslide — script.js
// ============================================================

window.openTab = function(evt, tabName) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
    document.getElementById(tabName)?.classList.add('active');
    if (evt?.currentTarget) evt.currentTarget.classList.add('active');
};

// ── パレット定義 ──────────────────────────────────────────────
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

// ── 状態 ─────────────────────────────────────────────────────
let currentWidth  = 1920;
let currentHeight = 1080;
let slides = [{ html:'', bg:'#ffffff', bgStyle:'color', transition:'none', undoStack:[], redoStack:[] }];
let currentSlideIndex = 0;
let selectedElement   = null;
let maxZIndex = 100;
let currentZoom = 0.5;
let snapEnabled = true;
let autoAdvanceTimer = null;

// カラーパレット状態
let colorTarget = null; // 'text' | 'shape' | 'bg' | 'float' | 'prop-text' | 'prop-fill'

document.addEventListener('DOMContentLoaded', () => {
    const canvas    = document.getElementById('canvas');
    const container = document.getElementById('canvas-container');
    const floatMenu = document.getElementById('floating-menu');

    const bindClick = (id, fn) => { document.getElementById(id)?.addEventListener('click', fn); };

    // ── カラーパレット初期化 ─────────────────────────────────
    const swatchContainer = document.getElementById('color-swatches');
    PALETTE.forEach(c => {
        const btn = document.createElement('div');
        btn.className = 'color-swatch-item';
        btn.style.background = c;
        btn.title = c;
        btn.addEventListener('click', () => applyColorFromPalette(c));
        swatchContainer.appendChild(btn);
    });

    // カラーパレット フロートウィンドウ ドラッグ
    const colorFloat = document.getElementById('color-picker-float');
    const colorHeader= colorFloat.querySelector('.color-float-header');
    let cfDrag=false, cfOX=0, cfOY=0;
    colorHeader.addEventListener('mousedown', e => {
        cfDrag=true; cfOX=e.clientX-colorFloat.offsetLeft; cfOY=e.clientY-colorFloat.offsetTop;
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!cfDrag) return;
        colorFloat.style.left = Math.max(0,e.clientX-cfOX)+'px';
        colorFloat.style.top  = Math.max(0,e.clientY-cfOY)+'px';
        colorFloat.style.right='auto'; colorFloat.style.bottom='auto';
    });
    document.addEventListener('mouseup', () => cfDrag=false);
    bindClick('color-float-close', () => colorFloat.classList.add('hidden'));
    bindClick('color-custom-apply', () => {
        applyColorFromPalette(document.getElementById('color-custom-input').value);
    });

    // カラートリガーボタン群
    document.querySelectorAll('.color-trigger-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            colorTarget = btn.dataset.target;
            const rect = btn.getBoundingClientRect();
            colorFloat.style.left   = Math.min(rect.left, window.innerWidth - 240) + 'px';
            colorFloat.style.top    = (rect.bottom + 4) + 'px';
            colorFloat.style.right  = 'auto';
            colorFloat.style.bottom = 'auto';
            document.getElementById('color-float-title').textContent =
                colorTarget === 'bg' ? 'Background Color' :
                colorTarget === 'text' ? 'Text Color' :
                colorTarget === 'shape' ? 'Shape Fill' : 'Color';
            colorFloat.classList.remove('hidden');
        });
    });
    document.addEventListener('click', (e) => {
        if (!colorFloat.contains(e.target) && !e.target.closest('.color-trigger-btn'))
            colorFloat.classList.add('hidden');
    });

    function applyColorFromPalette(color) {
        // パレット選択ハイライト
        document.querySelectorAll('.color-swatch-item').forEach(s => {
            s.classList.toggle('selected', s.style.background === color || s.title === color);
        });
        if (!colorTarget) return;

        if (colorTarget === 'bg') {
            applySlideBackground(color, false);
            document.getElementById('bg-color-preview').style.background = color;
        } else if (colorTarget === 'text') {
            if (!selectedElement?.classList.contains('text-element')) return;
            const inner = selectedElement.querySelector('.content-wrapper'); if(!inner) return;
            inner.style.color = color;
            document.getElementById('text-color-preview').style.background = color;
            document.getElementById('float-color-preview').style.background = color;
            document.getElementById('prop-text-color-preview').style.background = color;
            syncPropsPanel();
        } else if (colorTarget === 'shape') {
            if (!selectedElement) return;
            const inner = selectedElement.querySelector('.content-wrapper'); if(!inner) return;
            inner.style.backgroundColor = color;
            document.getElementById('shape-color-preview').style.background = color;
            document.getElementById('prop-fill-preview').style.background = color;
        } else if (colorTarget === 'float') {
            if (!selectedElement) return;
            const inner = selectedElement.querySelector('.content-wrapper'); if(!inner) return;
            const isText = selectedElement.classList.contains('text-element');
            if (isText) inner.style.color = color; else inner.style.backgroundColor = color;
            document.getElementById('float-color-preview').style.background = color;
        } else if (colorTarget === 'prop-text') {
            if (!selectedElement?.classList.contains('text-element')) return;
            const inner = selectedElement.querySelector('.content-wrapper'); if(!inner) return;
            inner.style.color = color;
            document.getElementById('prop-text-color-preview').style.background = color;
            document.getElementById('text-color-preview').style.background = color;
        } else if (colorTarget === 'prop-fill') {
            if (!selectedElement) return;
            const inner = selectedElement.querySelector('.content-wrapper'); if(!inner) return;
            inner.style.backgroundColor = color;
            document.getElementById('prop-fill-preview').style.background = color;
            document.getElementById('shape-color-preview').style.background = color;
        }
        saveState(); renderSlideList();
    }

    // ── 解像度 ───────────────────────────────────────────────
    function updateCanvasResolution() {
        const sel = document.getElementById('slide-size-select'); if(!sel||!canvas) return;
        const [w,h] = sel.value.split('x').map(Number);
        currentWidth=w; currentHeight=h;
        canvas.style.width=w+'px'; canvas.style.height=h+'px';
        applyZoom(); renderSlideList(); redrawRulers();
    }
    document.getElementById('slide-size-select')?.addEventListener('change', () => { saveState(); updateCanvasResolution(); });

    // ── 履歴 ─────────────────────────────────────────────────
    function saveState() {
        if (!canvas) return;
        const s=slides[currentSlideIndex];
        const cur=canvas.innerHTML;
        if (s.undoStack.length>0 && s.undoStack.at(-1)===cur) return;
        s.undoStack.push(cur); s.redoStack=[];
        updateUndoRedoUI();
    }
    function updateUndoRedoUI() {
        const s=slides[currentSlideIndex];
        const u=document.getElementById('undo-btn'); if(u) u.disabled=!s.undoStack.length;
        const r=document.getElementById('redo-btn'); if(r) r.disabled=!s.redoStack.length;
    }
    bindClick('undo-btn', () => {
        const s=slides[currentSlideIndex]; if(!s.undoStack.length) return;
        s.redoStack.push(canvas.innerHTML);
        canvas.innerHTML=s.undoStack.pop();
        reattachEvents(); updateUndoRedoUI();
    });
    bindClick('redo-btn', () => {
        const s=slides[currentSlideIndex]; if(!s.redoStack.length) return;
        s.undoStack.push(canvas.innerHTML);
        canvas.innerHTML=s.redoStack.pop();
        reattachEvents(); updateUndoRedoUI();
    });

    // ── ズーム ───────────────────────────────────────────────
    function applyZoom() {
        if (!canvas) return;
        canvas.style.transform=`scale(${currentZoom})`;
        canvas.style.transformOrigin='center center';
        document.getElementById('zoom-label').textContent=Math.round(currentZoom*100)+'%';
    }
    bindClick('zoom-in-btn',    () => { currentZoom=Math.min(2.0,currentZoom+0.1); applyZoom(); });
    bindClick('zoom-out-btn',   () => { currentZoom=Math.max(0.1,currentZoom-0.1); applyZoom(); });
    bindClick('zoom-reset-btn', () => { currentZoom=0.5; applyZoom(); });
    container?.addEventListener('wheel', (e) => {
        if (!(e.ctrlKey||e.metaKey)) return;
        e.preventDefault();
        currentZoom=e.deltaY<0?Math.min(2.0,currentZoom+0.04):Math.max(0.1,currentZoom-0.04);
        applyZoom();
    }, {passive:false});
    // iPad ピンチ
    let tDist=0, tZoom=1;
    container?.addEventListener('touchstart', e => {
        if (e.touches.length===2) {
            e.preventDefault();
            tDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
            tZoom=currentZoom;
        }
    }, {passive:false});
    container?.addEventListener('touchmove', e => {
        if (e.touches.length===2 && tDist>0) {
            e.preventDefault();
            const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
            currentZoom=Math.min(2.0,Math.max(0.1,tZoom*(d/tDist)));
            applyZoom();
        }
    }, {passive:false});
    container?.addEventListener('touchend', e => { if(e.touches.length<2) tDist=0; });

    // ── 要素作成 ─────────────────────────────────────────────
    function createBaseElement(typeClass, w, h) {
        saveState();
        const el=document.createElement('div');
        el.className=`canvas-element ${typeClass}`;
        Object.assign(el.style, {width:w+'px',height:h+'px',left:'100px',top:'100px',zIndex:maxZIndex++,touchAction:'none'});
        el.setAttribute('data-animation','none');
        el.setAttribute('data-anim-delay','0');
        ['nw','ne','sw','se'].forEach(dir => {
            const h2=document.createElement('div'); h2.className=`resize-handle ${dir}`; h2.dataset.direction=dir; el.appendChild(h2);
        });
        canvas.appendChild(el); initElementEvents(el); selectElement(el); renderSlideList();
        return el;
    }

    bindClick('add-text-btn', () => {
        const el=createBaseElement('text-element',380,80);
        const inner=document.createElement('div'); inner.className='content-wrapper'; inner.contentEditable=true;
        Object.assign(inner.style,{fontSize:'32px',color:'#0f172a',fontFamily:"'Noto Sans JP', sans-serif",textAlign:'left'});
        inner.innerText='テキストを入力'; el.appendChild(inner);
        inner.onblur=()=>{saveState();renderSlideList();}; inner.oninput=()=>renderSlideList();
    });
    bindClick('add-rect-btn', () => {
        const el=createBaseElement('rect-element',200,130); const inner=document.createElement('div');
        inner.className='content-wrapper'; inner.style.backgroundColor='#2563eb'; inner.style.borderRadius='4px'; el.appendChild(inner);
    });
    bindClick('add-circle-btn', () => {
        const el=createBaseElement('rect-element circle-element',140,140); const inner=document.createElement('div');
        inner.className='content-wrapper'; inner.style.backgroundColor='#7c3aed'; inner.style.borderRadius='50%'; el.appendChild(inner);
    });
    bindClick('add-line-btn', () => {
        const el=createBaseElement('rect-element line-element',240,5); const inner=document.createElement('div');
        inner.className='content-wrapper'; inner.style.backgroundColor='#0f172a'; el.appendChild(inner);
    });
    bindClick('insert-arrow-btn', () => {
        const el=createBaseElement('rect-element',180,44); const inner=document.createElement('div');
        inner.className='content-wrapper'; inner.style.display='flex'; inner.style.alignItems='center';
        inner.innerHTML=`<svg width="100%" height="100%" viewBox="0 0 180 44" fill="none" preserveAspectRatio="none"><path d="M4 22h155M143 8l18 14-18 14" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        el.appendChild(inner);
    });
    bindClick('insert-star-btn', () => {
        const el=createBaseElement('rect-element',130,130); const inner=document.createElement('div');
        inner.className='content-wrapper';
        inner.innerHTML=`<svg width="100%" height="100%" viewBox="0 0 120 120" fill="none"><path d="M60 8l13.5 27.6 30.5 4.4-22 21.4 5.2 30.4L60 77l-27.2 14.8 5.2-30.4L16 39.9l30.5-4.4z" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/></svg>`;
        el.appendChild(inner);
    });
    const imageUpload=document.getElementById('image-upload');
    if (imageUpload) {
        bindClick('add-image-btn', ()=>imageUpload.click());
        imageUpload.onchange=e=>{
            const file=e.target.files[0]; if(!file) return;
            const r=new FileReader();
            r.onload=ev=>{
                const el=createBaseElement('image-element',340,255); const img=document.createElement('img');
                img.className='content-wrapper'; img.src=ev.target.result; el.appendChild(img); selectElement(el);
            };
            r.readAsDataURL(file); imageUpload.value='';
        };
    }

    // ── ドラッグ＆リサイズ ───────────────────────────────────
    // スナップガイド（5%・10%）
    const SNAP_PERCENTS=[0.05,0.10,0.90,0.95];
    const SNAP_THRESH=12; // px（スクリーン座標）

    function getSnapPositions() {
        const snaps={x:[],y:[]};
        SNAP_PERCENTS.forEach(p=>{
            snaps.x.push(Math.round(p*currentWidth));
            snaps.y.push(Math.round(p*currentHeight));
        });
        return snaps;
    }

    function trySnap(val, snaps, elSize) {
        let best=null, bestDist=SNAP_THRESH/currentZoom;
        snaps.forEach(s=>{
            const d=Math.abs(val-s); if(d<bestDist){bestDist=d;best=s;}
            const d2=Math.abs(val+elSize-s); if(d2<bestDist){bestDist=d2;best=s-elSize;}
        });
        return best;
    }

    function showGuideLines(snapX, snapY) {
        const gc=document.getElementById('guide-container'); gc.innerHTML='';
        const cRect=canvas.getBoundingClientRect();
        const aRect=document.getElementById('canvas-area').getBoundingClientRect();
        if (snapX!==null) {
            const line=document.createElement('div'); line.className='guide-line v';
            const screenX=cRect.left+snapX*currentZoom-aRect.left;
            line.style.left=screenX+'px'; gc.appendChild(line);
        }
        if (snapY!==null) {
            const line=document.createElement('div'); line.className='guide-line h';
            const screenY=cRect.top+snapY*currentZoom-aRect.top;
            line.style.top=screenY+'px'; gc.appendChild(line);
        }
    }
    function clearGuideLines() { document.getElementById('guide-container').innerHTML=''; }

    function initElementEvents(el) {
        let isDrag=false, isRes=false;
        let sx,sy,ox,oy,sw,sh,dir;

        el.addEventListener('pointerdown', e=>{
            if (e.target.classList.contains('resize-handle')) return;
            if (el.classList.contains('text-element')&&e.target.classList.contains('content-wrapper')&&selectedElement===el) return;
            isDrag=true; saveState(); el.setPointerCapture(e.pointerId);
            sx=e.clientX; sy=e.clientY; ox=el.offsetLeft; oy=el.offsetTop;
            selectElement(el); e.stopPropagation();
        });
        el.querySelectorAll('.resize-handle').forEach(h=>{
            h.addEventListener('pointerdown', e=>{
                isRes=true; saveState(); h.setPointerCapture(e.pointerId);
                dir=h.dataset.direction; sx=e.clientX; sy=e.clientY;
                sw=el.offsetWidth; sh=el.offsetHeight; ox=el.offsetLeft; oy=el.offsetTop;
                e.stopPropagation(); e.preventDefault();
            });
        });
        document.addEventListener('pointermove', e=>{
            if (!selectedElement||selectedElement!==el) return;
            const dx=(e.clientX-sx)/currentZoom, dy=(e.clientY-sy)/currentZoom;
            const MIN=15;
            if (isDrag) {
                let nx=ox+dx, ny=oy+dy;
                const snaps=getSnapPositions();
                let snapX=null, snapY=null;
                if (snapEnabled) {
                    const sx2=trySnap(nx,snaps.x,el.offsetWidth);
                    const sy2=trySnap(ny,snaps.y,el.offsetHeight);
                    if(sx2!==null){nx=sx2; snapX=nx>ox ? nx+el.offsetWidth : nx;}
                    if(sy2!==null){ny=sy2; snapY=ny>oy ? ny+el.offsetHeight : ny;}
                    // 10px グリッドスナップ（ガイドがなければ）
                    if(sx2===null) nx=Math.round(nx/10)*10;
                    if(sy2===null) ny=Math.round(ny/10)*10;
                    showGuideLines(snapX,snapY);
                }
                el.style.left=nx+'px'; el.style.top=ny+'px';
                repositionFloatMenu(); updatePropsPosition();
            }
            if (isRes) {
                if (dir==='se'){el.style.width=Math.max(MIN,sw+dx)+'px';el.style.height=Math.max(MIN,sh+dy)+'px';}
                else if(dir==='sw'){const nw=Math.max(MIN,sw-dx);if(nw>MIN){el.style.left=(ox+dx)+'px';el.style.width=nw+'px';}el.style.height=Math.max(MIN,sh+dy)+'px';}
                else if(dir==='ne'){el.style.width=Math.max(MIN,sw+dx)+'px';const nh=Math.max(MIN,sh-dy);if(nh>MIN){el.style.top=(oy+dy)+'px';el.style.height=nh+'px';}}
                else if(dir==='nw'){const nw=Math.max(MIN,sw-dx),nh=Math.max(MIN,sh-dy);if(nw>MIN){el.style.left=(ox+dx)+'px';el.style.width=nw+'px';}if(nh>MIN){el.style.top=(oy+dy)+'px';el.style.height=nh+'px';}}
                repositionFloatMenu(); updatePropsSize();
            }
        });
        document.addEventListener('pointerup', e=>{
            if(isDrag){try{el.releasePointerCapture(e.pointerId);}catch(_){}isDrag=false;clearGuideLines();renderSlideList();}
            if(isRes){isRes=false;renderSlideList();}
        });
    }

    // ── 選択・フローティングメニュー ────────────────────────
    function selectElement(el) {
        if (!el) return;
        if (selectedElement&&selectedElement!==el) selectedElement.classList.remove('selected');
        selectedElement=el; el.classList.add('selected');

        const inner=el.querySelector('.content-wrapper');
        const style=inner?window.getComputedStyle(inner):null;
        const anim=el.getAttribute('data-animation')||'none';
        const delay=el.getAttribute('data-anim-delay')||'0';

        document.querySelectorAll('.anim-set-btn').forEach(b=>b.classList.toggle('active',b.dataset.anim===anim));
        const fa=document.getElementById('float-anim-select'); if(fa) fa.value=anim;
        const ad=document.getElementById('anim-delay'); if(ad) ad.value=delay;

        const isText=el.classList.contains('text-element');
        const tg=document.querySelector('.text-only-tools'); if(tg) tg.style.display=isText?'flex':'none';

        if (style&&isText) {
            const fs=document.getElementById('font-size'); if(fs) fs.value=parseInt(style.fontSize)||32;
            const hex=rgbToHex(style.color);
            document.getElementById('text-color-preview').style.background=hex;
            document.getElementById('float-color-preview').style.background=hex;
        } else if(style && !isText) {
            const hex=rgbToHex(style.backgroundColor||'#2563eb');
            document.getElementById('shape-color-preview').style.background=hex;
        }

        syncPropsPanel();
        repositionFloatMenu();
    }

    // フローティングメニューをキャンバス上の要素に正確に追従させる
    function repositionFloatMenu() {
        if (!floatMenu||!selectedElement) { floatMenu?.classList.add('hidden'); return; }
        floatMenu.classList.remove('hidden');
        // キャンバスコンテナ基準で位置を計算（スケール考慮）
        const elL=selectedElement.offsetLeft;
        const elT=selectedElement.offsetTop;
        const elW=selectedElement.offsetWidth;
        const menuH=42; // フローティングメニューの概算高さ
        // canvasのtransformを考慮したスクリーン座標
        const cRect=canvas.getBoundingClientRect();
        const ctRect=container.getBoundingClientRect();
        // コンテナ相対座標に変換
        const cx=(cRect.left - ctRect.left) + elL*currentZoom;
        const cy=(cRect.top  - ctRect.top ) + elT*currentZoom - menuH - 6;
        floatMenu.style.left=Math.max(0,cx)+'px';
        floatMenu.style.top =Math.max(0,cy)+'px';
    }

    function deselect() {
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement=null; floatMenu?.classList.add('hidden');
        const tg=document.querySelector('.text-only-tools'); if(tg) tg.style.display='none';
        syncPropsPanel();
    }
    canvas?.addEventListener('pointerdown', e=>{ if(e.target===canvas) deselect(); });

    // ── プロパティパネル ─────────────────────────────────────
    function syncPropsPanel() {
        const noSel=document.getElementById('props-no-select');
        const cont=document.getElementById('props-content');
        const tSec=document.getElementById('text-props');
        const sSec=document.getElementById('shape-props');

        if (!selectedElement) {
            noSel?.classList.remove('hidden'); cont?.classList.add('hidden'); return;
        }
        noSel?.classList.add('hidden'); cont?.classList.remove('hidden');
        updatePropsPosition(); updatePropsSize();

        const isText=selectedElement.classList.contains('text-element');
        tSec?.classList.toggle('hidden',!isText);
        sSec?.classList.toggle('hidden',isText);

        const inner=selectedElement.querySelector('.content-wrapper');
        if (inner) {
            const s=window.getComputedStyle(inner);
            if (isText) {
                const pf=document.getElementById('prop-fontsize'); if(pf) pf.value=parseInt(s.fontSize)||32;
                document.getElementById('prop-text-color-preview').style.background=rgbToHex(s.color);
                const pff=document.getElementById('prop-fontfamily');
                if(pff){
                    const cur=s.fontFamily.replace(/['"]/g,'').toLowerCase();
                    for(const opt of pff.options){if(opt.value.replace(/['"]/g,'').toLowerCase().includes(cur.split(',')[0].trim())){pff.value=opt.value;break;}}
                }
            } else {
                document.getElementById('prop-fill-preview').style.background=rgbToHex(s.backgroundColor||'#2563eb');
            }
        }
        const op=Math.round((parseFloat(selectedElement.style.opacity)||1)*100);
        const po=document.getElementById('prop-opacity'); if(po) po.value=op;
        const pov=document.getElementById('prop-opacity-val'); if(pov) pov.textContent=op+'%';
    }
    function updatePropsPosition() {
        if (!selectedElement) return;
        document.getElementById('prop-x').value=parseInt(selectedElement.style.left)||0;
        document.getElementById('prop-y').value=parseInt(selectedElement.style.top)||0;
    }
    function updatePropsSize() {
        if (!selectedElement) return;
        document.getElementById('prop-w').value=parseInt(selectedElement.style.width)||0;
        document.getElementById('prop-h').value=parseInt(selectedElement.style.height)||0;
    }
    ['prop-x','prop-y','prop-w','prop-h'].forEach(id=>{
        document.getElementById(id)?.addEventListener('change',()=>{
            if(!selectedElement) return; saveState();
            selectedElement.style.left  =(parseInt(document.getElementById('prop-x').value)||0)+'px';
            selectedElement.style.top   =(parseInt(document.getElementById('prop-y').value)||0)+'px';
            selectedElement.style.width =(parseInt(document.getElementById('prop-w').value)||20)+'px';
            selectedElement.style.height=(parseInt(document.getElementById('prop-h').value)||20)+'px';
            repositionFloatMenu(); renderSlideList();
        });
    });
    document.getElementById('prop-fontsize')?.addEventListener('change',e=>{
        const inner=selectedElement?.querySelector('.content-wrapper'); if(inner) inner.style.fontSize=e.target.value+'px';
    });
    document.getElementById('prop-fontfamily')?.addEventListener('change',e=>{
        const inner=selectedElement?.querySelector('.content-wrapper'); if(inner) inner.style.fontFamily=e.target.value;
    });
    document.getElementById('prop-opacity')?.addEventListener('input',e=>{
        if(!selectedElement) return; selectedElement.style.opacity=e.target.value/100;
        document.getElementById('prop-opacity-val').textContent=e.target.value+'%';
    });

    // ── テキスト書式 ─────────────────────────────────────────
    const patchText=(key,val)=>{
        if(!selectedElement?.classList.contains('text-element')) return;
        saveState(); const inner=selectedElement.querySelector('.content-wrapper'); if(inner) inner.style[key]=val;
        syncPropsPanel(); renderSlideList();
    };
    bindClick('align-left-btn',   ()=>patchText('textAlign','left'));
    bindClick('align-center-btn', ()=>patchText('textAlign','center'));
    bindClick('align-right-btn',  ()=>patchText('textAlign','right'));
    ['bold-btn','float-bold'].forEach(id=>bindClick(id,()=>{
        const inner=selectedElement?.querySelector('.content-wrapper'); if(inner) patchText('fontWeight',window.getComputedStyle(inner).fontWeight==='700'?'400':'700');
    }));
    ['italic-btn','float-italic'].forEach(id=>bindClick(id,()=>{
        const inner=selectedElement?.querySelector('.content-wrapper'); if(inner) patchText('fontStyle',window.getComputedStyle(inner).fontStyle==='italic'?'normal':'italic');
    }));
    document.getElementById('font-family')?.addEventListener('change',e=>patchText('fontFamily',e.target.value));
    document.getElementById('font-size')?.addEventListener('input',e=>patchText('fontSize',e.target.value+'px'));

    // フロートアニメーション
    document.getElementById('float-anim-select')?.addEventListener('change',e=>setAnimation(e.target.value));

    // ── レイヤー・複製・削除 ─────────────────────────────────
    ['bring-front-btn','float-layer-front'].forEach(id=>bindClick(id,()=>{if(selectedElement){saveState();selectedElement.style.zIndex=maxZIndex++;}}));
    ['send-back-btn','float-send-back'].forEach(id=>bindClick(id,()=>{if(selectedElement){saveState();selectedElement.style.zIndex=1;}}));
    bindClick('duplicate-btn',()=>{
        if(!selectedElement) return; saveState();
        const clone=selectedElement.cloneNode(true); clone.classList.remove('selected');
        clone.style.left=(parseInt(selectedElement.style.left)+20)+'px';
        clone.style.top=(parseInt(selectedElement.style.top)+20)+'px';
        clone.style.zIndex=maxZIndex++; canvas.appendChild(clone); initElementEvents(clone); selectElement(clone); renderSlideList();
    });
    const removeSelected=()=>{if(!selectedElement)return;saveState();selectedElement.remove();deselect();renderSlideList();};
    ['delete-btn','float-delete'].forEach(id=>bindClick(id,removeSelected));

    // ── Designタブ ───────────────────────────────────────────
    document.querySelectorAll('.theme-swatch').forEach(sw=>{
        sw.onclick=()=>{ saveState(); applySlideBackground(sw.dataset.bg, sw.dataset.bg.includes('gradient')); };
    });
    function applySlideBackground(bg, isGrad) {
        if(!canvas) return;
        const s=slides[currentSlideIndex];
        s.bg=bg; s.bgStyle=isGrad?'gradient':'color';
        if(isGrad){canvas.style.background=bg;canvas.style.backgroundImage=bg;}
        else{canvas.style.background=bg;canvas.style.backgroundImage='none';}
        document.getElementById('bg-color-preview').style.background=bg;
        renderSlideList();
    }

    let elemOpacity=100;
    bindClick('opacity-up-btn',()=>{if(!selectedElement)return;elemOpacity=Math.min(100,elemOpacity+10);selectedElement.style.opacity=elemOpacity/100;document.getElementById('opacity-label').textContent=elemOpacity+'%';syncPropsPanel();});
    bindClick('opacity-down-btn',()=>{if(!selectedElement)return;elemOpacity=Math.max(10,elemOpacity-10);selectedElement.style.opacity=elemOpacity/100;document.getElementById('opacity-label').textContent=elemOpacity+'%';syncPropsPanel();});

    // ── Transitionタブ ───────────────────────────────────────
    document.querySelectorAll('.trans-btn').forEach(btn=>{
        btn.onclick=()=>{
            slides[currentSlideIndex].transition=btn.dataset.trans;
            document.querySelectorAll('.trans-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
        };
    });

    // ── Animationタブ ────────────────────────────────────────
    function setAnimation(name) {
        if(!selectedElement) return; saveState();
        selectedElement.setAttribute('data-animation',name);
        const delay=parseFloat(document.getElementById('anim-delay')?.value||0);
        selectedElement.setAttribute('data-anim-delay',delay);
        selectedElement.style.animationDelay=delay+'s';
        document.querySelectorAll('.anim-set-btn').forEach(b=>b.classList.toggle('active',b.dataset.anim===name));
        const fa=document.getElementById('float-anim-select'); if(fa) fa.value=name;
        selectedElement.classList.remove('play-anim'); void selectedElement.offsetWidth; selectedElement.classList.add('play-anim');
    }
    document.querySelectorAll('.anim-set-btn').forEach(b=>{b.onclick=()=>setAnimation(b.dataset.anim);});
    document.getElementById('anim-delay')?.addEventListener('change',()=>{
        if(!selectedElement) return;
        const v=parseFloat(document.getElementById('anim-delay').value)||0;
        selectedElement.setAttribute('data-anim-delay',v); selectedElement.style.animationDelay=v+'s';
    });

    // ── Display ──────────────────────────────────────────────
    let showGrid=false;
    bindClick('toggle-grid-btn',()=>{showGrid=!showGrid;canvas?.classList.toggle('show-grid',showGrid);document.getElementById('toggle-grid-btn')?.classList.toggle('active-toggle',showGrid);});
    let showRuler=false;
    bindClick('toggle-ruler-btn',()=>{
        showRuler=!showRuler;
        document.getElementById('ruler-h')?.classList.toggle('hidden',!showRuler);
        document.getElementById('ruler-v')?.classList.toggle('hidden',!showRuler);
        document.getElementById('toggle-ruler-btn')?.classList.toggle('active-toggle',showRuler);
        redrawRulers();
    });
    document.getElementById('snap-toggle')?.addEventListener('change',e=>{snapEnabled=e.target.checked;});

    // ── ルーラー描画 ─────────────────────────────────────────
    function redrawRulers() {
        if (!showRuler) return;
        drawHRuler(); drawVRuler();
    }
    function drawHRuler() {
        const c=document.getElementById('ruler-h'); if(!c||c.classList.contains('hidden')) return;
        const w=c.offsetWidth; const h=c.offsetHeight;
        c.width=w; c.height=h;
        const ctx=c.getContext('2d'); ctx.clearRect(0,0,w,h);
        ctx.fillStyle='#f8fafc'; ctx.fillRect(0,0,w,h);
        ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,h); ctx.lineTo(w,h); ctx.stroke();
        ctx.fillStyle='#94a3b8'; ctx.font='9px system-ui';
        const scale=currentZoom;
        const step=getTickStep(scale);
        const offsetLeft=canvas.getBoundingClientRect().left - c.getBoundingClientRect().left;
        for(let v=0;v<=currentWidth;v+=step){
            const sx=offsetLeft+v*scale;
            if(sx<0||sx>w) continue;
            ctx.beginPath(); ctx.moveTo(sx,h); ctx.lineTo(sx,h/2); ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1; ctx.stroke();
            if(v%(step*5)===0) ctx.fillText(v,sx+2,h-2);
        }
        // ガイド位置マーク
        SNAP_PERCENTS.forEach(p=>{
            const v=Math.round(p*currentWidth); const sx=offsetLeft+v*scale;
            if(sx<0||sx>w) return;
            ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,h); ctx.strokeStyle='rgba(37,99,235,0.4)'; ctx.lineWidth=1; ctx.setLineDash([2,2]); ctx.stroke(); ctx.setLineDash([]);
        });
    }
    function drawVRuler() {
        const c=document.getElementById('ruler-v'); if(!c||c.classList.contains('hidden')) return;
        const w=c.offsetWidth; const h=c.offsetHeight;
        c.width=w; c.height=h;
        const ctx=c.getContext('2d'); ctx.clearRect(0,0,w,h);
        ctx.fillStyle='#f8fafc'; ctx.fillRect(0,0,w,h);
        ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(w,0); ctx.lineTo(w,h); ctx.stroke();
        ctx.fillStyle='#94a3b8'; ctx.font='9px system-ui';
        const scale=currentZoom;
        const step=getTickStep(scale);
        const offsetTop=canvas.getBoundingClientRect().top - c.getBoundingClientRect().top;
        for(let v=0;v<=currentHeight;v+=step){
            const sy=offsetTop+v*scale;
            if(sy<0||sy>h) continue;
            ctx.save(); ctx.translate(w/2,sy); ctx.rotate(-Math.PI/2);
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-w/2); ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1; ctx.stroke();
            if(v%(step*5)===0) ctx.fillText(v,-18,3);
            ctx.restore();
        }
    }
    function getTickStep(scale) {
        if(scale>1.5) return 50; if(scale>0.8) return 100; if(scale>0.4) return 200; return 400;
    }
    window.addEventListener('resize',()=>redrawRulers());

    // ── Proofreading ─────────────────────────────────────────
    function getTextContent(){const a=[];canvas?.querySelectorAll('.text-element .content-wrapper').forEach(el=>{if(el.innerText?.trim())a.push(el.innerText.trim());});return a;}
    bindClick('word-count-btn',()=>{
        const t=getTextContent(),all=t.join(' ');
        const w=all.trim().split(/\s+/).filter(w=>w).length;
        const r=document.getElementById('proofread-result'),txt=document.getElementById('proofread-text');
        if(txt) txt.textContent=`Slides: ${slides.length}  Words: ${w}  Chars: ${all.replace(/\s/g,'').length}`;
        if(r) r.style.display='flex';
    });
    bindClick('spellcheck-btn',()=>{
        const t=getTextContent();
        const r=document.getElementById('proofread-result'),txt=document.getElementById('proofread-text');
        if(txt) txt.textContent=t.length?`${t.length} text elements / ${t.join('').length} chars`:'No text elements found';
        if(r) r.style.display='flex';
    });

    // ── スライド管理 ─────────────────────────────────────────
    function renderSlideList() {
        const list=document.getElementById('slide-list'); if(!list) return;
        list.innerHTML='';
        slides.forEach((s,i)=>{
            const thumb=document.createElement('div');
            thumb.className=`slide-thumb ${i===currentSlideIndex?'active':''}`;
            thumb.style.aspectRatio=`${currentWidth}/${currentHeight}`;
            const preview=document.createElement('div');
            preview.className='thumb-preview-container';
            preview.style.width=currentWidth+'px'; preview.style.height=currentHeight+'px';
            preview.innerHTML=(i===currentSlideIndex)?canvas.innerHTML:s.html;
            if(s.bgStyle==='gradient'){preview.style.background=s.bg;}
            else{preview.style.backgroundColor=s.bg||'#fff';preview.style.backgroundImage='none';}
            const cw=list.clientWidth-4||168;
            preview.style.transform=`scale(${cw/currentWidth})`;
            const num=document.createElement('div'); num.className='slide-thumb-number'; num.textContent=i+1;
            thumb.appendChild(preview); thumb.appendChild(num);
            thumb.onclick=()=>switchSlide(i);
            list.appendChild(thumb);
        });
    }

    function switchSlide(idx, applyTrans=false) {
        if(!canvas||idx<0||idx>=slides.length) return;
        slides[currentSlideIndex].html=canvas.innerHTML;
        const cur=slides[currentSlideIndex];
        cur.bgStyle=canvas.style.backgroundImage&&canvas.style.backgroundImage!=='none'?'gradient':'color';
        cur.bg=cur.bgStyle==='gradient'?canvas.style.backgroundImage:(canvas.style.backgroundColor||'#fff');

        currentSlideIndex=idx; const s=slides[idx]; canvas.innerHTML=s.html;
        if(s.bgStyle==='gradient'){canvas.style.background=s.bg;canvas.style.backgroundImage=s.bg;}
        else{canvas.style.background=s.bg||'#fff';canvas.style.backgroundImage='none';}

        if(applyTrans&&s.transition&&s.transition!=='none'){
            const area=document.getElementById('canvas-area');
            area?.classList.remove('trans-fade','trans-slide','trans-zoom'); void area?.offsetWidth;
            const cls=`trans-${s.transition}`; area?.classList.add(cls);
            const spd=parseFloat(document.getElementById('trans-speed')?.value||0.7);
            setTimeout(()=>area?.classList.remove(cls),spd*1000+50);
        }
        reattachEvents(); renderSlideList(); updateUndoRedoUI();
        const sn=document.getElementById('slide-number'); if(sn) sn.textContent=`${idx+1}/${slides.length}`;
    }

    bindClick('add-slide-btn',()=>{
        slides[currentSlideIndex].html=canvas.innerHTML;
        slides.push({html:'',bg:'#ffffff',bgStyle:'color',transition:'none',undoStack:[],redoStack:[]});
        switchSlide(slides.length-1);
    });
    bindClick('delete-slide-btn',()=>{
        if(slides.length<=1){alert('最後のスライドは削除できません。');return;}
        if(!confirm('このスライドを削除しますか？')) return;
        slides.splice(currentSlideIndex,1);
        const next=Math.max(0,currentSlideIndex-1); currentSlideIndex=next;
        const s=slides[next]; canvas.innerHTML=s.html;
        if(s.bgStyle==='gradient'){canvas.style.background=s.bg;canvas.style.backgroundImage=s.bg;}
        else{canvas.style.background=s.bg||'#fff';canvas.style.backgroundImage='none';}
        reattachEvents(); renderSlideList(); updateUndoRedoUI();
    });

    function reattachEvents() {
        if(!canvas) return;
        Array.from(canvas.children).forEach(el=>{if(el.id!=='floating-menu') initElementEvents(el);});
        deselect();
    }

    // ── PDF インポート ────────────────────────────────────────
    const pdfInput=document.getElementById('pdf-file-input');
    if (pdfInput) {
        bindClick('btn-import-pdf',()=>pdfInput.click());
        pdfInput.onchange=async e=>{
            const file=e.target.files[0]; if(!file||!window.pdfjsLib) return;
            const reader=new FileReader();
            reader.onload=async ev=>{
                try{
                    const pdf=await pdfjsLib.getDocument({data:new Uint8Array(ev.target.result)}).promise;
                    const imported=[];
                    for(let i=1;i<=pdf.numPages;i++){
                        const page=await pdf.getPage(i);
                        const vp=page.getViewport({scale:2.0});
                        const rc=document.createElement('canvas'); rc.width=vp.width; rc.height=vp.height;
                        await page.render({canvasContext:rc.getContext('2d'),viewport:vp}).promise;
                        imported.push({html:`<div class="canvas-element image-element" style="width:${currentWidth}px;height:${currentHeight}px;left:0;top:0;z-index:50;"><img class="content-wrapper" src="${rc.toDataURL('image/png')}" style="width:100%;height:100%;object-fit:contain;pointer-events:none;"></div>`,bg:'#ffffff',bgStyle:'color',transition:'none',undoStack:[],redoStack:[]});
                    }
                    if(imported.length>0){
                        if(slides.length===1&&!slides[0].html) slides=imported; else slides=slides.concat(imported);
                        currentSlideIndex=0; switchSlide(0);
                    }
                }catch(err){alert('PDF import failed: '+err.message);}
            };
            reader.readAsArrayBuffer(file); pdfInput.value='';
        };
    }

    // ── PPTX インポート ──────────────────────────────────────
    const pptxInput=document.getElementById('pptx-file-input');
    if (pptxInput) {
        bindClick('btn-import-pptx',()=>pptxInput.click());
        pptxInput.onchange=async e=>{
            const file=e.target.files[0]; if(!file||!window.JSZip) return;
            const reader=new FileReader();
            reader.onload=async ev=>{
                try{
                    const zip=await JSZip.loadAsync(ev.target.result);
                    // スライドXMLを列挙
                    const slideFiles=Object.keys(zip.files)
                        .filter(n=>n.match(/^ppt\/slides\/slide\d+\.xml$/))
                        .sort((a,b)=>{
                            const na=parseInt(a.match(/slide(\d+)/)[1]);
                            const nb=parseInt(b.match(/slide(\d+)/)[1]);
                            return na-nb;
                        });
                    if(!slideFiles.length){alert('スライドが見つかりませんでした。');return;}
                    // スライドリレーション（背景画像用）
                    const imported=[];
                    for(const sf of slideFiles){
                        const xml=await zip.file(sf).async('text');
                        const parser=new DOMParser();
                        const doc=parser.parseFromString(xml,'text/xml');
                        const ns='http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
                        // EMU→px変換 (914400 EMU = 1 inch = 96px)
                        const emu2px=v=>Math.round(v/914400*96);
                        // テキストとシェイプを抽出
                        let html='';
                        const spTree=doc.querySelector('spTree')||doc.querySelector('*|spTree');
                        if(spTree){
                            const shapes=spTree.querySelectorAll('sp');
                            shapes.forEach(sp=>{
                                try{
                                    // 位置・サイズ
                                    const xfrm=sp.querySelector('xfrm')||sp.querySelector('*|xfrm');
                                    const off=xfrm?.querySelector('off')||xfrm?.querySelector('*|off');
                                    const ext=xfrm?.querySelector('ext')||xfrm?.querySelector('*|ext');
                                    if(!off||!ext) return;
                                    const x=emu2px(parseInt(off.getAttribute('x')||0));
                                    const y=emu2px(parseInt(off.getAttribute('y')||0));
                                    const w=emu2px(parseInt(ext.getAttribute('cx')||0));
                                    const h=emu2px(parseInt(ext.getAttribute('cy')||0));
                                    // スケール補正（PPTXの標準は12192000×6858000 EMU = 12192/914400*96 ≈ 1280px / 720px相当）
                                    const scaleX=currentWidth/1280; const scaleY=currentHeight/720;
                                    const sx=Math.round(x*scaleX), sy=Math.round(y*scaleY);
                                    const sw=Math.round(w*scaleX), sh=Math.round(h*scaleY);
                                    if(sw<4||sh<4) return;
                                    // テキスト
                                    const txBody=sp.querySelector('txBody')||sp.querySelector('*|txBody');
                                    const paras=txBody?txBody.querySelectorAll('p'):[]; let textContent='';
                                    paras.forEach(p=>{
                                        const runs=p.querySelectorAll('r'); runs.forEach(r=>{const t=r.querySelector('t'); if(t) textContent+=t.textContent;});
                                        textContent+='\n';
                                    });
                                    textContent=textContent.trimEnd();
                                    // 色
                                    const solidFill=sp.querySelector('solidFill')||sp.querySelector('*|solidFill');
                                    let fillColor='#2563eb';
                                    if(solidFill){const srgb=solidFill.querySelector('srgbClr'); if(srgb) fillColor='#'+(srgb.getAttribute('val')||'2563eb');}
                                    if(textContent){
                                        const rPr=txBody?.querySelector('rPr'); let fontSize=24;
                                        if(rPr){const sz=rPr.getAttribute('sz'); if(sz) fontSize=Math.round(parseInt(sz)/100);}
                                        html+=`<div class="canvas-element text-element" style="left:${sx}px;top:${sy}px;width:${sw}px;height:${sh}px;z-index:${maxZIndex++};touch-action:none;" data-animation="none" data-anim-delay="0"><div class="resize-handle nw"></div><div class="resize-handle ne"></div><div class="resize-handle sw"></div><div class="resize-handle se"></div><div class="content-wrapper" contenteditable="true" style="font-size:${fontSize}px;color:#0f172a;font-family:'Noto Sans JP',sans-serif;text-align:left;">${textContent}</div></div>`;
                                    } else {
                                        html+=`<div class="canvas-element rect-element" style="left:${sx}px;top:${sy}px;width:${sw}px;height:${sh}px;z-index:${maxZIndex++};touch-action:none;" data-animation="none" data-anim-delay="0"><div class="resize-handle nw"></div><div class="resize-handle ne"></div><div class="resize-handle sw"></div><div class="resize-handle se"></div><div class="content-wrapper" style="background-color:${fillColor};border-radius:3px;"></div></div>`;
                                    }
                                }catch(_){}
                            });
                        }
                        // 背景色（bgClr）
                        const bgClrEl=doc.querySelector('bgClr')||doc.querySelector('*|bgClr');
                        let bg='#ffffff';
                        if(bgClrEl){const srgb=bgClrEl.querySelector('srgbClr'); if(srgb) bg='#'+(srgb.getAttribute('val')||'ffffff');}
                        imported.push({html,bg,bgStyle:'color',transition:'none',undoStack:[],redoStack:[]});
                    }
                    if(imported.length>0){
                        if(slides.length===1&&!slides[0].html) slides=imported; else slides=slides.concat(imported);
                        currentSlideIndex=0; switchSlide(0);
                        alert(`${imported.length} スライドをインポートしました。`);
                    }
                }catch(err){alert('PPTXのインポートに失敗しました: '+err.message);}
            };
            reader.readAsArrayBuffer(file); pptxInput.value='';
        };
    }

    // ── PDF エクスポート（グレー帯対策） ────────────────────
    bindClick('export-pdf-btn', async ()=>{
        if(!window.jspdf||!window.html2canvas){alert('ライブラリが不足しています。');return;}
        deselect(); // 選択解除
        const{jsPDF}=window.jspdf;
        const pdf=new jsPDF({orientation:'landscape',unit:'px',format:[currentWidth,currentHeight]});
        const orig=currentSlideIndex; slides[orig].html=canvas.innerHTML;

        // ズーム・transform を完全にリセット
        const prevTransform=canvas.style.transform;
        const prevOrigin=canvas.style.transformOrigin;
        canvas.style.transform='none';
        canvas.style.transformOrigin='top left';
        // canvas-containerのスクロール位置をリセット
        const area=document.getElementById('canvas-area');
        const prevSL=area.scrollLeft, prevST=area.scrollTop;
        area.scrollLeft=0; area.scrollTop=0;

        for(let i=0;i<slides.length;i++){
            if(i>0) pdf.addPage([currentWidth,currentHeight],'landscape');
            canvas.innerHTML=slides[i].html;
            const s=slides[i];
            if(s.bgStyle==='gradient'){canvas.style.background=s.bg;}
            else{canvas.style.backgroundColor=s.bg||'#fff';canvas.style.backgroundImage='none';}
            // キャンバスを正確なサイズで書き出し
            const cap=await html2canvas(canvas,{
                width:currentWidth,height:currentHeight,
                scale:1,useCORS:true,logging:false,
                x:0,y:0,
                scrollX:0,scrollY:0,
                windowWidth:currentWidth,windowHeight:currentHeight
            });
            pdf.addImage(cap.toDataURL('image/jpeg',0.95),'JPEG',0,0,currentWidth,currentHeight);
        }
        canvas.style.transform=prevTransform;
        canvas.style.transformOrigin=prevOrigin;
        area.scrollLeft=prevSL; area.scrollTop=prevST;
        switchSlide(orig); pdf.save('presentation.pdf');
    });

    // ── PPTX エクスポート（黒背景バグ修正） ─────────────────
    bindClick('export-pptx-btn',()=>{
        if(!window.PptxGenJS){alert('PPTXライブラリが読み込まれていません。');return;}
        deselect(); // 選択解除
        const pptx=new PptxGenJS(); pptx.layout='LAYOUT_16x9';
        slides[currentSlideIndex].html=canvas.innerHTML;
        slides.forEach(s=>{
            const sl=pptx.addSlide();
            // 背景色を確実にセット（未設定は白）
            const bgColor=(s.bgStyle==='color'&&s.bg)?s.bg.replace('#',''):'FFFFFF';
            sl.background={fill:bgColor};
            const tmp=document.createElement('div'); tmp.innerHTML=s.html;
            const fx=currentWidth/10, fy=currentHeight/5.625;
            tmp.querySelectorAll('.canvas-element').forEach(el=>{
                const inner=el.querySelector('.content-wrapper'); if(!inner) return;
                const x=(parseInt(el.style.left)||0)/fx;
                const y=(parseInt(el.style.top)||0)/fy;
                const w=(parseInt(el.style.width)||100)/fx;
                const h=(parseInt(el.style.height)||50)/fy;
                if(el.classList.contains('text-element')){
                    const ff=(inner.style.fontFamily||'Arial').split(',')[0].replace(/['"]/g,'').trim();
                    const color=rgbToHex(window.getComputedStyle(inner).color).replace('#','');
                    sl.addText(inner.innerText||'',{x,y,w,h,fontSize:(parseInt(inner.style.fontSize)||24)*0.75,color,fontFace:ff,align:inner.style.textAlign||'left'});
                } else if(el.classList.contains('image-element')){
                    const img=el.querySelector('img'); if(img?.src) sl.addImage({data:img.src,x,y,w,h});
                } else if(el.classList.contains('rect-element')){
                    const bgc=rgbToHex(window.getComputedStyle(inner).backgroundColor).replace('#','');
                    const shape=el.classList.contains('circle-element')?pptx.ShapeType.oval:pptx.ShapeType.rectangle;
                    sl.addShape(shape,{x,y,w,h,fill:{color:bgc||'2563eb'}});
                }
            });
        });
        pptx.writeFile({fileName:'presentation.pptx'});
    });

    // ── プレゼンテーション ───────────────────────────────────
    let presenterSlideEl=null;
    let swipeStartX=0, swipeStartY=0;

    function buildPresenterSlide(idx) {
        const s=slides[idx];
        if(!presenterSlideEl){
            presenterSlideEl=document.createElement('div');
            presenterSlideEl.id='presenter-slide';
            presenterSlideEl.className='slide-canvas';
            document.getElementById('presenter-canvas-wrap').appendChild(presenterSlideEl);
        }
        presenterSlideEl.innerHTML=s.html;
        presenterSlideEl.style.width=currentWidth+'px';
        presenterSlideEl.style.height=currentHeight+'px';
        if(s.bgStyle==='gradient'){presenterSlideEl.style.background=s.bg;}
        else{presenterSlideEl.style.background=s.bg||'#fff';presenterSlideEl.style.backgroundImage='none';}
        // 全リサイズハンドル非表示
        presenterSlideEl.querySelectorAll('.resize-handle').forEach(h=>h.style.display='none');
        presenterSlideEl.querySelectorAll('.selected').forEach(e=>e.classList.remove('selected'));
        layoutPresenterSlide();
        playPresenterAnimations();
        document.getElementById('slide-number').textContent=`${idx+1}/${slides.length}`;
    }

    function layoutPresenterSlide() {
        if(!presenterSlideEl) return;
        const vw=window.innerWidth, vh=window.innerHeight;
        const scale=Math.min(vw/currentWidth, vh/currentHeight);
        presenterSlideEl.style.transform=`scale(${scale})`;
        presenterSlideEl.style.transformOrigin='center center';
    }

    function playPresenterAnimations() {
        if(!presenterSlideEl) return;
        Array.from(presenterSlideEl.children).forEach(el=>{
            const delay=parseFloat(el.getAttribute('data-anim-delay')||0);
            el.classList.remove('play-anim'); void el.offsetWidth;
            el.style.animationDelay=delay+'s'; el.classList.add('play-anim');
        });
    }

    function startPresent(fromStart=false) {
        deselect();
        if(fromStart) currentSlideIndex=0;
        // 現在スライドを保存
        slides[currentSlideIndex].html=canvas.innerHTML;
        const overlay=document.getElementById('presenter-overlay');
        overlay.classList.remove('hidden');
        buildPresenterSlide(currentSlideIndex);
        // 自動進行
        const sec=parseFloat(document.getElementById('auto-advance')?.value||0);
        if(sec>0){
            clearInterval(autoAdvanceTimer);
            autoAdvanceTimer=setInterval(()=>{
                if(currentSlideIndex<slides.length-1) presGoNext();
                else clearInterval(autoAdvanceTimer);
            },sec*1000);
        }
    }

    function presGoNext() {
        if(currentSlideIndex<slides.length-1){ currentSlideIndex++; buildPresenterSlide(currentSlideIndex); }
    }
    function presGoPrev() {
        if(currentSlideIndex>0){ currentSlideIndex--; buildPresenterSlide(currentSlideIndex); }
    }

    bindClick('present-btn',           ()=>startPresent(false));
    bindClick('present-from-start-btn',()=>startPresent(true));
    bindClick('next-slide',  presGoNext);
    bindClick('prev-slide',  presGoPrev);
    bindClick('exit-present-btn',()=>{
        clearInterval(autoAdvanceTimer);
        document.getElementById('presenter-overlay').classList.add('hidden');
        // 編集ビューのスライドを更新（currentSlideIndexが変わっている可能性）
        switchSlide(currentSlideIndex);
    });

    // プレゼンター スワイプ対応
    const presOverlay=document.getElementById('presenter-overlay');
    presOverlay.addEventListener('touchstart', e=>{
        if(e.touches.length===1){ swipeStartX=e.touches[0].clientX; swipeStartY=e.touches[0].clientY; }
    }, {passive:true});
    presOverlay.addEventListener('touchend', e=>{
        if(e.changedTouches.length===1){
            const dx=e.changedTouches[0].clientX-swipeStartX;
            const dy=Math.abs(e.changedTouches[0].clientY-swipeStartY);
            if(Math.abs(dx)>50&&dy<60){ if(dx<0) presGoNext(); else presGoPrev(); }
        }
    }, {passive:true});
    window.addEventListener('resize',()=>layoutPresenterSlide());

    // ── キーボードショートカット ─────────────────────────────
    document.addEventListener('keydown', e=>{
        const tag=document.activeElement.tagName;
        const inText=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||document.activeElement.isContentEditable;
        const presenting=!document.getElementById('presenter-overlay').classList.contains('hidden');
        if(presenting){
            if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();presGoNext();}
            if(e.key==='ArrowLeft'){e.preventDefault();presGoPrev();}
            if(e.key==='Escape') document.getElementById('exit-present-btn')?.click();
            return;
        }
        if(inText) return;
        if(e.ctrlKey||e.metaKey){
            if(e.key==='z'){e.preventDefault();document.getElementById('undo-btn')?.click();return;}
            if(e.key==='y'){e.preventDefault();document.getElementById('redo-btn')?.click();return;}
            if(e.key==='d'){e.preventDefault();document.getElementById('duplicate-btn')?.click();return;}
        }
        if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();return;}
        if(selectedElement){
            const pace=e.shiftKey?1:10;
            if(e.key==='ArrowLeft'){e.preventDefault();selectedElement.style.left=(parseInt(selectedElement.style.left)||0)-pace+'px';}
            if(e.key==='ArrowRight'){e.preventDefault();selectedElement.style.left=(parseInt(selectedElement.style.left)||0)+pace+'px';}
            if(e.key==='ArrowUp'){e.preventDefault();selectedElement.style.top=(parseInt(selectedElement.style.top)||0)-pace+'px';}
            if(e.key==='ArrowDown'){e.preventDefault();selectedElement.style.top=(parseInt(selectedElement.style.top)||0)+pace+'px';}
            repositionFloatMenu(); updatePropsPosition(); renderSlideList();
        }
    });

    // ── ユーティリティ ───────────────────────────────────────
    function rgbToHex(rgb){
        if(!rgb||rgb==='transparent') return '#000000';
        const m=rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m?'#'+m.slice(1).map(v=>parseInt(v).toString(16).padStart(2,'0')).join(''):'#000000';
    }

    // ── 初期化 ───────────────────────────────────────────────
    updateCanvasResolution();
    renderSlideList();
    updateUndoRedoUI();
});
