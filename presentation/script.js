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
    '#f0fdf4','#dcfce7','#86efac','#4ade80','#22c55e','#16a34a','#15803d','#14... ' // ※パレットの続きは元のコードを維持します
];

// 状態管理
let slides = [{ id: 'slide_0', elements: [] }];
let currentSlideIndex = 0;
let elements = [];
let selectedElement = null;
let isDragging = false;
let isResizing = false;
let resizeHandle = null;
let startX, startY, startLeft, startTop, startWidth, startHeight;
let history = [];
let historyIndex = -1;

function saveState() {
    if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
    }
    history.push(JSON.stringify(slides));
    historyIndex++;
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        slides = JSON.parse(history[historyIndex]);
        elements = slides[currentSlideIndex].elements;
        renderSlideList();
        renderCurrentSlide();
        clearSelection();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        slides = JSON.parse(history[historyIndex]);
        elements = slides[currentSlideIndex].elements;
        renderSlideList();
        renderCurrentSlide();
        clearSelection();
    }
}

// === 🚀 ここからAI連携の修正統合処理 🚀 ===

async function callAI(systemPrompt, userContent) {
    try {
        const response = await fetch("https://leaslide-ai.bockring-scratcher.workers.dev/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openrouter/free", // 無料の自動選択ルーターモデル
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ]
            })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const content = data.choices[0].message.content;
        
        // マークダウンの ```json の囲みを安全に除去する処理
        const match = content.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
        return JSON.parse(content);
    } catch (e) {
        console.error("AI connection or parsing error:", e);
        throw e;
    }
}

function initAiAssistant() {
    // 1. 自動レイアウト配置ボタン
    bindClick('ai-layout-btn', async function() {
        const origBtnText = this.innerHTML;
        this.innerHTML = 'Analyzing Layout...';
        this.disabled = true;

        try {
            const cWidth = 960;
            const cHeight = 540;

            const layoutData = elements.map((el, index) => ({
                id: `el_${index}`,
                type: el.type,
                x: el.x,
                y: el.y,
                w: el.w,
                h: el.h,
                content: el.content
            }));

            // 英語に自動翻訳されてしまうのを強固に防ぐプロンプト
            const systemPrompt = `You are an expert presentation designer.
The user provides a JSON array of slide elements. The slide canvas size is ${cWidth}x${cHeight} pixels.
Arrange these elements logically without overlapping. Do not change 'id' or 'type'.
CRITICAL: Keep the 'content' string exactly as it is. Do NOT translate it to English. Respond ONLY with a raw JSON array.
Example: [{"id":"el_0","x":100,"y":100,"w":500,"h":80,"content":"元の日本語"}]`;

            const result = await callAI(systemPrompt, JSON.stringify(layoutData));

            if (result && Array.isArray(result)) {
                saveState();
                
                // データオブジェクトの座標を更新する
                result.forEach(newLayout => {
                    const index = parseInt(newLayout.id.split('_')[1]);
                    const el = elements[index];
                    if (el) {
                        el.x = Number(newLayout.x);
                        el.y = Number(newLayout.y);
                        el.w = Number(newLayout.w);
                        el.h = Number(newLayout.h);
                        // 万が一書き換えられても元の内容を維持する安全策
                        el.content = newLayout.content || el.content;
                    }
                });

                // 描画関数を呼び出して画面とプロパティパネルを最新データにリフレッシュ！
                renderCurrentSlide(); 
                syncPropsPanel();
                renderSlideList();
                
                // 配置後に要素を滑らかにギュインと動かすCSSアニメーションの演出を追加
                document.querySelectorAll('.slide-element').forEach(domEl => {
                    domEl.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
                    setTimeout(() => domEl.style.transition = '', 500);
                });
            }
        } catch (e) {
            console.error(e);
            alert("AI Layout Error: " + e.message);
        } finally {
            this.innerHTML = origBtnText;
            this.disabled = false;
        }
    });

    // 2. テキスト自動修正ボタン（もし必要であればHTML側に対応するid="ai-fix-btn"を追加すると動きます）
    bindClick('ai-fix-btn', async function() {
        const origBtnText = this.innerHTML;
        this.innerHTML = 'Fixing Text...';
        this.disabled = true;

        try {
            const layoutData = elements.map((el, index) => ({
                id: `el_${index}`,
                type: el.type,
                x: el.x, y: el.y, w: el.w, h: el.h,
                content: el.content
            }));

            const systemPrompt = `You are an expert presentation editor.
Fix typos, improve clarity, and professionalize the 'content' text of each element.
CRITICAL: Keep the output language exactly the same as the input (e.g., if input is Japanese, reply in Japanese). Do not change 'id', 'type', 'x', 'y', 'w', or 'h'. Respond ONLY with a raw JSON array.`;

            const result = await callAI(systemPrompt, JSON.stringify(layoutData));

            if (result && Array.isArray(result)) {
                saveState();
                result.forEach(newLayout => {
                    const index = parseInt(newLayout.id.split('_')[1]);
                    const el = elements[index];
                    if (el && newLayout.content) {
                        el.content = newLayout.content;
                    }
                });
                renderCurrentSlide();
                syncPropsPanel();
                renderSlideList();
            }
        } catch (e) {
            console.error(e);
            alert("AI Text Fix Error: " + e.message);
        } finally {
            this.innerHTML = origBtnText;
            this.disabled = false;
        }
    });
}

// === 🚀 AI連携処理 ここまで 🚀 ===

function renderCurrentSlide() {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    canvas.querySelectorAll('.slide-element').forEach(el => el.remove());

    elements.forEach((el, index) => {
        const div = document.createElement('div');
        div.className = `slide-element ${el.type}-element`;
        div.style.left = el.x + 'px';
        div.style.top = el.y + 'px';
        div.style.width = el.w + 'px';
        div.style.height = el.h + 'px';
        div.style.backgroundColor = el.bg || (el.type === 'rect' ? '#3b82f6' : 'transparent');
        div.style.color = el.color || '#000000';
        div.style.fontSize = (el.fontSize || 16) + 'px';
        div.style.zIndex = el.zIndex || 1;
        
        if (el.type === 'text') {
            div.innerText = el.content || 'Text Element';
        }

        div.addEventListener('mousedown', (e) => selectElementHandler(e, el, div));
        canvas.appendChild(div);
        
        if (selectedElement && selectedElement.id === el.id) {
            createResizeHandles(div, el);
            div.classList.add('selected');
        }
    });
}

// 既存のイベントバインド（DOMContentLoaded等）を統合
document.addEventListener('DOMContentLoaded', () => {
    saveState();
    renderSlideList();
    renderCurrentSlide();
    initColorPalettes();
    initAiAssistant(); // AIボタンの初期化を呼び出す

    bindClick('add-text-btn', () => {
        saveState();
        const newEl = {
            id: 'el_' + Date.now(),
            type: 'text',
            x: 100, y: 100, w: 200, h: 50,
            content: 'Double click to edit',
            fontSize: 24, color: '#000000', zIndex: elements.length + 1
        };
        elements.push(newEl);
        selectedElement = newEl;
        renderCurrentSlide();
        syncPropsPanel();
        renderSlideList();
    });

    bindClick('add-rect-btn', () => {
        saveState();
        const newEl = {
            id: 'el_' + Date.now(),
            type: 'rect',
            x: 150, y: 150, w: 150, h: 150,
            bg: '#3b82f6', zIndex: elements.length + 1
        };
        elements.push(newEl);
        selectedElement = newEl;
        renderCurrentSlide();
        syncPropsPanel();
        renderSlideList();
    });

    bindClick('delete-btn', () => {
        if (selectedElement) {
            saveState();
            elements = elements.filter(el => el.id !== selectedElement.id);
            slides[currentSlideIndex].elements = elements;
            selectedElement = null;
            renderCurrentSlide();
            syncPropsPanel();
            renderSlideList();
        }
    });

    bindClick('add-slide-btn', () => {
        saveState();
        const newSlide = { id: 'slide_' + Date.now(), elements: [] };
        slides.push(newSlide);
        currentSlideIndex = slides.length - 1;
        elements = newSlide.elements;
        selectedElement = null;
        renderSlideList();
        renderCurrentSlide();
        clearSelection();
    });

    bindClick('delete-slide-btn', () => {
        if (slides.length > 1) {
            saveState();
            slides.splice(currentSlideIndex, 1);
            currentSlideIndex = Math.max(0, currentSlideIndex - 1);
            elements = slides[currentSlideIndex].elements;
            selectedElement = null;
            renderSlideList();
            renderCurrentSlide();
            clearSelection();
        }
    });

    bindClick('export-btn', () => {
        const json = JSON.stringify(slides, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'presentation.json';
        a.click();
    });

    bindClick('undo-btn', undo);
    bindClick('redo-btn', redo);

    // プロパティインプットの同期
    ['prop-x', 'prop-y', 'prop-w', 'prop-h', 'prop-fs', 'prop-text'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', (e) => {
            if (!selectedElement) return;
            const val = e.target.value;
            if (id === 'prop-x') selectedElement.x = parseInt(val) || 0;
            if (id === 'prop-y') selectedElement.y = parseInt(val) || 0;
            if (id === 'prop-w') selectedElement.w = parseInt(val) || 10;
            if (id === 'prop-h') selectedElement.h = parseInt(val) || 10;
            if (id === 'prop-fs') selectedElement.fontSize = parseInt(val) || 12;
            if (id === 'prop-text') selectedElement.content = val;
            renderCurrentSlide();
        });
        document.getElementById(id)?.addEventListener('change', () => {
            saveState();
            renderSlideList();
        });
    });
});

function selectElementHandler(e, el, div) {
    e.stopPropagation();
    selectedElement = el;
    renderCurrentSlide();
    syncPropsPanel();

    if (e.detail === 2 && el.type === 'text') {
        // ダブルクリック編集
        const input = document.createElement('textarea');
        input.value = el.content || '';
        input.style.position = 'absolute';
        input.style.left = div.style.left;
        input.style.top = div.style.top;
        input.style.width = div.style.width;
        input.style.height = div.style.height;
        input.style.fontSize = div.style.fontSize;
        input.style.zIndex = 1000;
        
        input.addEventListener('blur', () => {
            saveState();
            el.content = input.value;
            input.remove();
            renderCurrentSlide();
            renderSlideList();
        });
        
        div.parentNode.appendChild(input);
        input.focus();
        return;
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = el.x;
    startTop = el.y;

    const mouseMoveHandler = (me) => {
        if (!isDragging) return;
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;
        el.x = startLeft + dx;
        el.y = startTop + dy;
        renderCurrentSlide();
        syncPropsPanel();
    };

    const mouseUpHandler = () => {
        if (isDragging) {
            isDragging = false;
            saveState();
            renderSlideList();
        }
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
    };

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
}

function createResizeHandles(div, el) {
    const handles = ['tl', 'tr', 'bl', 'br'];
    handles.forEach(h => {
        const handle = document.createElement('div');
        handle.className = `resize-handle handle-${h}`;
        
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isResizing = true;
            resizeHandle = h;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = el.x;
            startTop = el.y;
            startWidth = el.w;
            startHeight = el.h;

            const mouseMoveHandler = (me) => {
                if (!isResizing) return;
                const dx = me.clientX - startX;
                const dy = me.clientY - startY;

                if (resizeHandle === 'br') {
                    el.w = Math.max(10, startWidth + dx);
                    el.h = Math.max(10, startHeight + dy);
                } else if (resizeHandle === 'bl') {
                    const newW = startWidth - dx;
                    if (newW > 10) { el.w = newW; el.x = startLeft + dx; }
                    el.h = Math.max(10, startHeight + dy);
                } else if (resizeHandle === 'tr') {
                    el.w = Math.max(10, startWidth + dx);
                    const newH = startHeight - dy;
                    if (newH > 10) { el.h = newH; el.y = startTop + dy; }
                } else if (resizeHandle === 'tl') {
                    const newW = startWidth - dx;
                    const newH = startHeight - dy;
                    if (newW > 10) { el.w = newW; el.x = startLeft + dx; }
                    if (newH > 10) { el.h = newH; el.y = startTop + dy; }
                }
                renderCurrentSlide();
                syncPropsPanel();
            };

            const mouseUpHandler = () => {
                if (isResizing) {
                    isResizing = false;
                    saveState();
                    renderSlideList();
                }
                document.removeEventListener('mousemove', mouseMoveHandler);
                document.removeEventListener('mouseup', mouseUpHandler);
            };

            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
        });
        div.appendChild(handle);
    });
}

function syncPropsPanel() {
    const panel = document.getElementById('props-panel');
    if (!selectedElement) {
        panel.querySelectorAll('input, textarea').forEach(i => i.disabled = true);
        return;
    }
    panel.querySelectorAll('input, textarea').forEach(i => i.disabled = false);
    
    document.getElementById('prop-x').value = selectedElement.x;
    document.getElementById('prop-y').value = selectedElement.y;
    document.getElementById('prop-w').value = selectedElement.w;
    document.getElementById('prop-h').value = selectedElement.h;
    
    const fsInput = document.getElementById('prop-fs');
    const textInput = document.getElementById('prop-text');
    
    if (selectedElement.type === 'text') {
        fsInput.disabled = false;
        textInput.disabled = false;
        fsInput.value = selectedElement.fontSize || 16;
        textInput.value = selectedElement.content || '';
    } else {
        fsInput.disabled = true;
        textInput.disabled = true;
        fsInput.value = '';
        textInput.value = '';
    }
}

function clearSelection() {
    selectedElement = null;
    syncPropsPanel();
    renderCurrentSlide();
}

function bindClick(id, callback) {
    document.getElementById(id)?.addEventListener('click', callback);
}

document.getElementById('canvas')?.addEventListener('mousedown', () => {
    clearSelection();
});

function initColorPalettes() {
    const bgPicker = document.getElementById('bg-color-picker');
    const textPicker = document.getElementById('text-color-picker');
    if (!bgPicker || !textPicker) return;

    PALETTE.forEach(color => {
        const btn1 = document.createElement('button');
        btn1.className = 'color-swatch';
        btn1.style.backgroundColor = color;
        btn1.addEventListener('click', () => {
            if (selectedElement) {
                saveState();
                selectedElement.bg = color;
                renderCurrentSlide();
                renderSlideList();
            }
        });
        bgPicker.appendChild(btn1);

        const btn2 = document.createElement('button');
        btn2.className = 'color-swatch';
        btn2.style.backgroundColor = color;
        btn2.addEventListener('click', () => {
            if (selectedElement && selectedElement.type === 'text') {
                saveState();
                selectedElement.color = color;
                renderCurrentSlide();
                renderSlideList();
            }
        });
        textPicker.appendChild(btn2);
    });
}

function renderSlideList() {
    const list = document.getElementById('slide-list');
    if (!list) return;
    list.innerHTML = '';

    slides.forEach((slide, index) => {
        const item = document.createElement('div');
        item.className = `slide-thumb ${index === currentSlideIndex ? 'active' : ''}`;
        
        const num = document.createElement('div');
        num.className = 'slide-num';
        num.innerText = index + 1;
        item.appendChild(num);

        const preview = document.createElement('div');
        preview.className = 'slide-preview';
        
        slide.elements.forEach(el => {
            const pEl = document.createElement('div');
            pEl.className = `preview-element ${el.type}-preview`;
            pEl.style.left = (el.x * 0.15) + 'px';
            pEl.style.top = (el.y * 0.15) + 'px';
            pEl.style.width = (el.w * 0.15) + 'px';
            pEl.style.height = (el.h * 0.15) + 'px';
            pEl.style.backgroundColor = el.bg || (el.type === 'rect' ? '#3b82f6' : 'transparent');
            preview.appendChild(pEl);
        });

        item.appendChild(preview);
        item.addEventListener('click', () => {
            currentSlideIndex = index;
            elements = slides[currentSlideIndex].elements;
            selectedElement = null;
            renderSlideList();
            renderCurrentSlide();
            syncPropsPanel();
        });
        list.appendChild(item);
    });
}
