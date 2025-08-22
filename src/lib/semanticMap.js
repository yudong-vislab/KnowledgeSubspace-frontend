// src/lib/semanticMap.js
import * as d3 from 'd3';

/* =========================
 * 样式与常量（集中）
 * ========================= */
const STYLE = {
  HEX_RADIUS: 16,
  HEX_BORDER_WIDTH: 1.2,
  HEX_BORDER_COLOR: '#ffffff',
  HEX_FILL_TEXT: '#a9d08d',
  HEX_FILL_IMAGE: '#a6cee3',
  HEX_FILL_DEFAULT: '#ffffff',

  OPACITY_DEFAULT: 0.3,
  OPACITY_HOVER: 0.8,
  OPACITY_SELECTED: 1.0,
  OPACITY_NEIGHBOR: 0.6,

  CITY_RADIUS: 3.5,
  CITY_BORDER_WIDTH: 1.2,
  CITY_FILL: '#ffffff',     // 城市填充：白色
  CAPITAL_FILL: '#000',     // 首都内圆：黑色
  CITY_BORDER_COLOR: '#777777',

  FLIGHT_COLOR: '#4a5f7e',
  FLIGHT_WIDTH: 1.2,
  FLIGHT_OPACITY: 0.98,
  FLIGHT_DASH: '3,2',
  FLIGHT_CONTROL_RATIO: 0.18,
  FLIGHT_TEMP_WIDTH: 2,
  FLIGHT_TEMP_OPACITY: 0.55,
  FLIGHT_TEMP_DASH: '8,6',

  ROAD_COLOR: '#e9c46b',
  ROAD_WIDTH: 1.2,
  ROAD_OPACITY: 0.88,
  ROAD_DASH: null,

  RIVER_COLOR: '#a6cee3',
  RIVER_WIDTH: 1.2,
  RIVER_OPACITY: 0.88,
  RIVER_DASH: null,

  COUNTRY_BORDER_COLOR: '#000000',
  COUNTRY_BORDER_WIDTH: 1.5,

  PLAYGROUND_PADDING: 12,
  CLICK_DELAY: 350,

  SUBSPACE_MIN_W: 360,
  SUBSPACE_MIN_H: 400,
  SUBSPACE_GAP: 20,
  SUBSPACE_DEFAULT_LEFT: 30,
  SUBSPACE_DEFAULT_TOP: 30,
};

/* =========================
 * 初始化入口
 * ========================= */
export async function initSemanticMap({
  outerEl,
  playgroundEl,
  globalOverlayEl,
  mainTitleEl,
  initialData
}) {
  playgroundEl = playgroundEl || document.getElementById('playground');
  globalOverlayEl = globalOverlayEl || document.getElementById('global-overlay');
  if (!playgroundEl || !globalOverlayEl) {
    throw new Error('[semanticMap] playgroundEl/globalOverlayEl is missing.');
  }

  /* =========================
   * App 状态
   * ========================= */
  const App = {
    config: {
      hex: {
        radius: STYLE.HEX_RADIUS,
        fillOpacity: STYLE.OPACITY_DEFAULT,
        borderWidth: STYLE.HEX_BORDER_WIDTH,
        borderColor: STYLE.HEX_BORDER_COLOR,
        textFill: STYLE.HEX_FILL_TEXT,
        imageFill: STYLE.HEX_FILL_IMAGE,
        zIndex: 1,
      },
      city: {
        radius: STYLE.CITY_RADIUS,
        borderWidth: STYLE.CITY_BORDER_WIDTH,
        fill: STYLE.CITY_FILL,
        capitalFill: STYLE.CAPITAL_FILL,
        borderColor: STYLE.CITY_BORDER_COLOR,
        zIndex: 3,
      },
      flight: {
        color: STYLE.FLIGHT_COLOR,
        width: STYLE.FLIGHT_WIDTH,
        opacity: STYLE.FLIGHT_OPACITY,
        dash: STYLE.FLIGHT_DASH,
        tempWidth: STYLE.FLIGHT_TEMP_WIDTH,
        tempOpacity: STYLE.FLIGHT_TEMP_OPACITY,
        tempDash: STYLE.FLIGHT_TEMP_DASH,
        zIndex: 100,
        controlCurveRatio: STYLE.FLIGHT_CONTROL_RATIO,
      },
      road:  { color: STYLE.ROAD_COLOR,  width: STYLE.ROAD_WIDTH,  opacity: STYLE.ROAD_OPACITY,  dash: STYLE.ROAD_DASH,  zIndex: 2 },
      river: { color: STYLE.RIVER_COLOR, width: STYLE.RIVER_WIDTH, opacity: STYLE.RIVER_OPACITY, dash: STYLE.RIVER_DASH, zIndex: 2 },
      countryBorder: { color: STYLE.COUNTRY_BORDER_COLOR, width: STYLE.COUNTRY_BORDER_WIDTH },
      background: STYLE.HEX_FILL_DEFAULT,
      playground: { padding: STYLE.PLAYGROUND_PADDING },
    },

    // 渲染缓存
    subspaceSvgs: [],
    overlaySvgs: [],
    hexMapsByPanel: [],
    allHexDataByPanel: [],
    zoomStates: [],
    panelStates: [],

    // 交互状态
    _lastLinks: [],
    currentMouse: { x: 0, y: 0 },
    selectedHex: null,
    neighborKeySet: new Set(),
    flightStart: null,
    flightHoverTarget: null,
    hoveredHex: null,
    _clickTimer: null,
    _awaitingSingle: false,   // ★ NEW：是否在等待触发单击处理
    _lastClickAt: 0,          // ★ NEW：最近一次 click 的时间戳（非必须，但留作需要）
    insertMode: null, 

    // 选中与快照
    persistentHexKeys: new Set(),
    excludedHexKeys: new Set(),
    selectedRouteIds: new Set(),   // ★ 新增：当前被选中的“整条线路”的 id 集合（统计 road/river/flight）
    modKeys: { ctrl: false, meta: false, shift: false },
    _lastSnapshot: null,

    // 回调 & 容器
    onSubspaceRename: null,
    onMainTitleRename: null,
    playgroundEl,
    globalOverlayEl,

    // 数据
    currentData: null
  };

  const cleanupFns = [];

  /* =========================
   * 小工具
   * ========================= */
  const pkey = (panelIdx, q, r) => `${panelIdx}|${q},${r}`;
  // const pointId = (panelIdx, q, r) => `${panelIdx}:${q},${r}`;
  const isCtrlLike = (e) => !!(e.metaKey || e.ctrlKey);

  const styleOf = (t) =>
    (t === 'flight') ? App.config.flight
    : (t === 'river') ? App.config.river
    : App.config.road;

  const getHexFillColor = (d) =>
    d.modality === 'text'   ? App.config.hex.textFill
    : d.modality === 'image'? App.config.hex.imageFill
    : App.config.background;

  const hexPoints = (radius) => {
    const angle = Math.PI / 3;
    return d3.range(6).map(i => [radius * Math.cos(angle * i), radius * Math.sin(angle * i)])
      .concat([[radius, 0]]);
  };

  const safeNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const isFiniteTransform = (t) => t && Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.k);

  function getPanelRect(panelIdx) {
    const panelDom = App.playgroundEl.querySelectorAll('.subspace')[panelIdx];
    if (!panelDom) return null;
    const container = panelDom.querySelector('.hex-container');
    if (!container) return null;
    const playgroundRect = App.playgroundEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
      left: containerRect.left - playgroundRect.left,
      top: containerRect.top - playgroundRect.top,
      right: containerRect.right - playgroundRect.left,
      bottom: containerRect.bottom - playgroundRect.top
    };
  }
  const pointInRect = (x, y, rect) =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

  function getHexGlobalXY(panelIdx, q, r) {
    const hexMap = App.hexMapsByPanel[panelIdx];
    if (!hexMap) return null;
    const hex = hexMap.get(`${q},${r}`);
    if (!hex) return null;
    const panelDom = App.playgroundEl.querySelectorAll('.subspace')[panelIdx];
    const container = panelDom.querySelector('.hex-container');
    const playgroundRect = App.playgroundEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const offsetX = containerRect.left - playgroundRect.left;
    const offsetY = containerRect.top - playgroundRect.top;
    const t = App.zoomStates[panelIdx] || d3.zoomIdentity;
    const [tx, ty] = [t.applyX(hex.x), t.applyY(hex.y)];
    return [tx + offsetX, ty + offsetY];
  }

  // flight 端点可见性（用于“端点不可见则不画”）
  const isPointVisible = (panelIdx, q, r) => {
    const pt = getHexGlobalXY(panelIdx, q, r);
    const rect = getPanelRect(panelIdx);
    return !!(pt && rect && pointInRect(pt[0], pt[1], rect));
  };
  const flightEndpointsVisible = (pStart, pEnd) =>
    isPointVisible(pStart.panelIdx, pStart.q, pStart.r) &&
    isPointVisible(pEnd.panelIdx,   pEnd.q,   pEnd.r);

  // 解析 path 点的 panelIdx（兼容 flight 的 From/To）
  function resolvePanelIdxForPathPoint(p, link, i) {
    if (typeof p.panelIdx === 'number') return p.panelIdx;
    if (link?.type === 'flight') {
      if (i === 0 && typeof link.panelIdxFrom === 'number') return link.panelIdxFrom;
      if (i === (link.path?.length || 1) - 1 && typeof link.panelIdxTo === 'number') return link.panelIdxTo;
    }
    if (typeof link?.panelIdx === 'number') return link.panelIdx;
    return 0;
  }

  function findLinkById(routeId){
    return (App._lastLinks || []).find(l => linkKey(l) === routeId) || null;
  }
  function findSelectedRouteContaining(panelIdx, q, r){
    // 在已选路线中找包含这个点的路线
    for (const l of (App._lastLinks || [])) {
      if (!App.selectedRouteIds.has(linkKey(l))) continue;
      if (linkContainsNode(l, panelIdx, q, r)) return l;
    }
    return null;
  }
  function indexOfPointInLink(link, panelIdx, q, r){
    const path = Array.isArray(link?.path) ? link.path : [];
    for (let i=0;i<path.length;i++){
      const p = path[i];
      const pIdx = resolvePanelIdxForPathPoint(p, link, i);
      if (pIdx === panelIdx && p.q === q && p.r === r) return i;
    }
    return -1;
  }
  // 插入一个点到 link.path 的 anchorIndex 之后
  function insertPointAfter(link, anchorIndex, panelIdx, q, r){
    if (!link || !Array.isArray(link.path)) return;
    // 已存在就跳过
    if (indexOfPointInLink(link, panelIdx, q, r) >= 0) return;

    const newPt = { q, r, panelIdx };
    // 注意：保留 flight 的两端 panelIdxFrom/To，不需要改动
    const insertAt = Math.max(0, Math.min(anchorIndex + 1, link.path.length));
    link.path.splice(insertAt, 0, newPt);
    // anchor 往后移动一个，方便继续“顺序加点”
    App.insertMode.anchorIndex = insertAt; 
  }

  // —— Mode UI：按钮状态（绿色=active，黄色=armed），无 HUD/Chip —— //
  const ModeUI = (() => {
    const btnSel   = document.getElementById('mode-btn-select');
    const btnRoute = document.getElementById('mode-btn-route');
    const btnConn  = document.getElementById('mode-btn-insert'); // Connect

    // 统一清理三个按钮的状态类
    function clearAll() {
      [btnSel, btnRoute, btnConn].forEach(b => {
        if (!b) return;
        b.classList.remove('is-active', 'is-armed');
      });
    }

    /**
     * setVisualState 根据当前“事实状态”上色：
     *  - connectActive：已进入插入/连线（insertMode 或 flightStart）
     *  - connectArmed：Ctrl+Shift 按下，但尚未点第一个点
     *  - routeActive：Ctrl/⌘ 按下（且不在 connect 状态）
     *  - 其余默认：Cluster Select 绿色
     */
    function setVisualState({ connectActive=false, connectArmed=false, routeActive=false } = {}) {
      clearAll();
      if (connectActive) {
        btnConn?.classList.add('is-active');       // 绿
        return;
      }
      if (connectArmed) {
        btnConn?.classList.add('is-armed');        // 黄
        return;
      }
      if (routeActive) {
        btnRoute?.classList.add('is-active');      // 绿
        return;
      }
      btnSel?.classList.add('is-active');          // 绿（默认）
    }

    /**
     * computeAndApply 从“键盘/应用状态”推导视觉态：
     *  - armed：CtrlLike + Shift（且没进入 active）
     *  - active：insertMode 存在 或 flightStart 存在
     *  - route：CtrlLike（且不 armed/active）
     */
    function computeAndApply(overrides = null) {
     // 允许显式覆盖（极少用），否则默认读取 App.modKeys
      const { ctrl, meta, shift } = overrides || App.modKeys;
      const ctrlLike = !!(ctrl || meta);
      const connectActive = !!(App.insertMode || App.flightStart);
      const connectArmed = !connectActive && ctrlLike && !!shift;
      const routeActive  = !connectActive && !connectArmed && ctrlLike;
      setVisualState({ connectActive, connectArmed, routeActive });
    }

    return { setVisualState, computeAndApply };
  })();




  function beginInsertMode(route, anchorIdx){
    App.insertMode = { routeId: linkKey(route), anchorIndex: anchorIdx, inserting: true };
    ModeUI.computeAndApply();   // 让 Connect 变绿
  }

  function endInsertMode(commit = true){
    App.insertMode = null;

    if (commit) {
      // 成功提交后刷新
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
      recomputePersistentFromRoutes();
      updateHexStyles();
      publishToStepAnalysis();
    }
    ModeUI.computeAndApply({});   // 根据当前修饰键/状态回落到 Route 或 Cluster
  }


  // === 路线级选择：辅助 ===
  function linkKey(link){
    return link?.id || link?._uid || '';
  }
  
  // 统一的“可选择的整条线路类型”判断：road / river / flight 都计入
  function isSelectableRoute(link){
    const t = (link?.type || 'road');
    return t === 'road' || t === 'river' || t === 'flight';
  }

  function linkContainsNode(link, panelIdx, q, r){
    const path = Array.isArray(link?.path) ? link.path : [];
    for (let i=0;i<path.length;i++){
      const p = path[i];
      const pIdx = resolvePanelIdxForPathPoint(p, link, i);
      if (pIdx === panelIdx && p.q === q && p.r === r) return true;
    }
    return false;
  }
  function isStartOfLink(link, panelIdx, q, r){
    const path = Array.isArray(link?.path) ? link.path : [];
    if (path.length < 1) return false;
    const p0 = path[0];
    const pIdx0 = resolvePanelIdxForPathPoint(p0, link, 0);
    return (pIdx0 === panelIdx && p0.q === q && p0.r === r);
  }

  // === 根据当前选中的“整条线路 + 排除点”，重建节点选集 App.persistentHexKeys ===
  function recomputePersistentFromRoutes(){
    App.persistentHexKeys.clear();
    (App._lastLinks || []).forEach(link => {
      if (!isSelectableRoute(link)) return;
      const k = linkKey(link);
      if (!App.selectedRouteIds.has(k)) return;

      const path = Array.isArray(link.path) ? link.path : [];
      for (let i=0;i<path.length;i++){
        const p = path[i];
        const pIdx = resolvePanelIdxForPathPoint(p, link, i);
        const key = `${pIdx}|${p.q},${p.r}`;
        if (!App.excludedHexKeys.has(key)) {
          App.persistentHexKeys.add(key);
        }
      }
    });
    // ★ 集合变更后立即重画
    drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
   
  }


  /* =========================
   * DOM/子空间
   * ========================= */
  function ensureOverlayRoot(svgSel) {
    if (svgSel.select('g.overlay-root').empty()) {
      const root = svgSel.append('g').attr('class', 'overlay-root');
      root.append('g').attr('class', 'links');   // road/river OR flight（global）
      root.append('g').attr('class', 'cities');  // 仅 panel：城市/首都
    }
    return {
      root: svgSel.select('g.overlay-root'),
      links: svgSel.select('g.overlay-root').select('g.links'),
      cities: svgSel.select('g.overlay-root').select('g.cities'),
    };
  }

  // —— 全局键盘监听：键盘抬起后的自动切换 —— //
  function wireKeyboardHints() {
    const setFromEvent = (e, down) => {
      // 只认修饰键，其他键忽略
      if (e.key === 'Control') App.modKeys.ctrl = down;
      if (e.key === 'Meta')    App.modKeys.meta = down;
      if (e.key === 'Shift')   App.modKeys.shift = down;
      ModeUI.computeAndApply();  // ← 读取 App.modKeys，自动回落
    };
 
    const onKeyDown = (e) => setFromEvent(e, true);
    const onKeyUp   = (e) => setFromEvent(e, false);
 
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    cleanupFns.push(() => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    });
 
    // 窗口失焦时重置（防止“卡住 Ctrl/Shift”）
    const onBlur = () => { App.modKeys = { ctrl:false, meta:false, shift:false }; ModeUI.computeAndApply(); };
    window.addEventListener('blur', onBlur);
    cleanupFns.push(() => window.removeEventListener('blur', onBlur));
 
    // 初始化：默认 Cluster 绿
    App.modKeys = { ctrl:false, meta:false, shift:false };
    ModeUI.computeAndApply();
  }

  wireKeyboardHints();

  function createSubspaceElement(space, i) {
    const div = document.createElement('div');
    div.className = 'subspace';
    div.style.position = 'absolute';
    div.style.boxSizing = 'border-box';
    div.style.margin = '0';
    div.dataset.index = String(i);

    // 默认网格位置
    const offsetX = STYLE.SUBSPACE_MIN_W + STYLE.SUBSPACE_GAP;
    const offsetY = STYLE.SUBSPACE_MIN_H + STYLE.SUBSPACE_GAP;
    const defaultLeft = STYLE.SUBSPACE_DEFAULT_LEFT + offsetX * (i % 3);
    const defaultTop  = STYLE.SUBSPACE_DEFAULT_TOP  + offsetY * Math.floor(i / 3);

    // 读取持久化位置/尺寸
    const st = App.panelStates[i] || {};
    const w = Math.max(STYLE.SUBSPACE_MIN_W, st.width  ?? STYLE.SUBSPACE_MIN_W);
    const h = Math.max(STYLE.SUBSPACE_MIN_H, st.height ?? STYLE.SUBSPACE_MIN_H);
    const l = Math.max(0, st.left ?? defaultLeft);
    const t = Math.max(0, st.top  ?? defaultTop);

    Object.assign(div.style, {
      left: `${l}px`,
      top: `${t}px`,
      width: `${w}px`,
      height: `${h}px`,
      resize: 'both',
      overflow: 'hidden',
    });

    const title = document.createElement('div');
    title.className = 'subspace-title';
    title.innerText = space.subspaceName || `Subspace ${i + 1}`;
    div.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'subspace-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Delete Subspace';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idxNow = Number(div.dataset.index ?? i);
      _deleteSubspaceByIndex(idxNow);
    });
    div.appendChild(closeBtn);

    // 标题双击重命名
    title.addEventListener('dblclick', (evt) => {
      evt.stopPropagation();
      const idx = Number(div.dataset.index || i);
      const placeholder = `Subspace ${idx + 1}`;
      title.setAttribute('contenteditable', 'plaintext-only');
      title.focus();

      const range = document.createRange();
      range.selectNodeContents(title);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);

      const commit = async () => {
        const newName = (title.textContent || '').trim() || placeholder;
        title.textContent = newName;
        title.removeAttribute('contenteditable');
        if (App.currentData?.subspaces?.[idx]) {
          App.currentData.subspaces[idx].subspaceName = newName;
        }
        if (typeof App.onSubspaceRename === 'function') {
          try { await App.onSubspaceRename(idx, newName); } catch (e) { console.warn(e); }
        }
        syncContainerHeight(div, title);
      };
      const cancel = () => {
        title.removeAttribute('contenteditable');
        const old = App.currentData?.subspaces?.[idx]?.subspaceName || placeholder;
        title.textContent = old;
        syncContainerHeight(div, title);
      };

      const onBlur = () => { title.removeEventListener('keydown', onKey); commit(); };
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); title.removeEventListener('blur', onBlur); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); title.removeEventListener('blur', onBlur); cancel(); }
      };

      title.addEventListener('blur', onBlur, { once: true });
      title.addEventListener('keydown', onKey);
    });

    // 内容容器 + 两层 SVG
    const container = document.createElement('div');
    container.className = 'hex-container';
    Object.assign(container.style, { position: 'relative', width: '100%' });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'hex-svg');
    container.appendChild(svg);

    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.setAttribute('class', 'overlay-svg');
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = App.config.road.zIndex;
    container.appendChild(overlay);

    div.appendChild(container);
    App.playgroundEl.appendChild(div);

    // 根据标题高度扣减内容高度
    syncContainerHeight(div, title);

    // 缓存 d3 选择
    App.subspaceSvgs.push(d3.select(svg));
    App.overlaySvgs.push(d3.select(overlay));

    // 激活拖拽（标题栏）
    enableSubspaceDrag(div, i);
  }

  function syncContainerHeight(subspaceDiv, titleEl) {
    const th = (titleEl || subspaceDiv.querySelector('.subspace-title'))?.offsetHeight || 0;
    const container = subspaceDiv.querySelector('.hex-container');
    const svg = subspaceDiv.querySelector('svg.hex-svg');
    const overlay = subspaceDiv.querySelector('svg.overlay-svg');
    const cs = getComputedStyle(subspaceDiv);
    const w = parseFloat(cs.width);
    const h = parseFloat(cs.height);
    const ch = Math.max(0, h - th);
    if (container) container.style.height = `calc(100% - ${th}px)`;
    if (svg)     { svg.setAttribute('width',  w); svg.setAttribute('height', ch); }
    if (overlay) { overlay.setAttribute('width', w); overlay.setAttribute('height', ch); }
  }

  function renderPanels(subspaces) {
    Array.from(App.playgroundEl.querySelectorAll('.subspace')).forEach(el => el.remove());
    App.subspaceSvgs = [];
    App.overlaySvgs = [];
    App.hexMapsByPanel = [];
    App.allHexDataByPanel = [];
    subspaces.forEach((space, i) => createSubspaceElement(space, i));
  }

  /* =========================
   * Hex 网格渲染（每面板）
   * ========================= */
  function renderHexGridFromData(panelIdx, space, hexRadius) {
    const svg = App.subspaceSvgs[panelIdx];
    const overlay = App.overlaySvgs[panelIdx];
    if (!svg || svg.empty() || !overlay || overlay.empty()) return;

    const { root: overlayRoot } = ensureOverlayRoot(overlay);

    // 尺寸计算
    const parent = svg.node().parentNode; // .hex-container
    const pcs = getComputedStyle(parent);
    let width  = pcs ? safeNum(pcs.width)  : 0;
    let height = pcs ? safeNum(pcs.height) : 0;
    if (!width)  width  = safeNum(parent?.clientWidth,  svg.node().clientWidth || 1);
    if (!height) height = safeNum(parent?.clientHeight, svg.node().clientHeight || 1);

    svg.attr('width', width).attr('height', height);
    overlay.attr('width', width).attr('height', height);

    // 容器组
    let container = svg.select('g');
    if (container.empty()) container = svg.append('g');

    // 数据坐标（平顶六边形）
    const rawHexList = (space.hexList || []).map(h => {
      const x = (3 / 4) * 2 * hexRadius * h.q;
      const y = Math.sqrt(3) * hexRadius * (h.r + h.q / 2);
      return { ...h, rawX: x, rawY: y };
    });

    const xs = rawHexList.map(h => h.rawX);
    const ys = rawHexList.map(h => h.rawY);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2 || 0;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2 || 0;

    const hexList = rawHexList.map(h => ({ ...h, x: h.rawX, y: h.rawY, panelIdx }));
    App.allHexDataByPanel[panelIdx] = hexList;

    // 初始/持久化变换
    const savedZoom = App.panelStates[panelIdx]?.zoom;
    const defaultTransform = d3.zoomIdentity
      .translate((width / 2) - centerX, (height / 2) - centerY)
      .scale(1);

    let lastTransform =
      savedZoom && isFiniteTransform(savedZoom)
        ? d3.zoomIdentity.translate(savedZoom.x, savedZoom.y).scale(savedZoom.k)
        : (isFiniteTransform(App.zoomStates[panelIdx]) ? App.zoomStates[panelIdx] : defaultTransform);

    if (!isFiniteTransform(lastTransform)) lastTransform = defaultTransform;
    if (!savedZoom && !App.zoomStates[panelIdx]) {
      App.panelStates[panelIdx] = { ...(App.panelStates[panelIdx] || {}), zoom: { k: 1, x: defaultTransform.x, y: defaultTransform.y } };
      App.zoomStates[panelIdx] = defaultTransform;
    }

    const zoom = d3.zoom()
      .scaleExtent([0.4, 3])
      .on('zoom', (event) => {
        const t = event?.transform;
        if (!isFiniteTransform(t)) return;
        container.attr('transform', t);
        overlayRoot.attr('transform', t);
        App.zoomStates[panelIdx] = t;
        App.panelStates[panelIdx] = { ...(App.panelStates[panelIdx] || {}), zoom: { k: t.k, x: t.x, y: t.y } };
        drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
        updateHexStyles();
      });

    svg.on('dblclick.zoom', null).call(zoom);
    const applyTransform = (t) => {
      if (!isFiniteTransform(t)) return;
      container.attr('transform', t);
      overlayRoot.attr('transform', t);
      svg.call(zoom.transform, t);
    };
    applyTransform(lastTransform);

    // 绑定 hex
    container.selectAll('g.hex')
      .data(hexList, d => `${d.panelIdx}_${d.q}_${d.r}`)
      .join(
        enter => {
          const g = enter.append('g').attr('class', 'hex');
          g.append('path')
            .attr('d', d3.line()(hexPoints(hexRadius)))
            .attr('fill', d => getHexFillColor(d))
            .attr('stroke', App.config.hex.borderColor)
            .attr('stroke-width', App.config.hex.borderWidth)
            .attr('fill-opacity', App.config.hex.fillOpacity);

          g.on('mouseover', (event, d) => {
            App.hoveredHex = { panelIdx, q: d.q, r: d.r };
            if (App.flightStart) App.flightHoverTarget = { panelIdx, q: d.q, r: d.r };
            updateHexStyles();
          }).on('mouseout', (event, d) => {
            if (App.hoveredHex?.panelIdx === panelIdx && App.hoveredHex.q === d.q && App.hoveredHex.r === d.r) {
              App.hoveredHex = null;
            }
            if (App.flightStart &&
                App.flightHoverTarget?.panelIdx === panelIdx &&
                App.flightHoverTarget.q === d.q &&
                App.flightHoverTarget.r === d.r) {
              App.flightHoverTarget = null;
            }
            updateHexStyles();
          }).on('click', (event, d) => {
            event.preventDefault();
            event.stopPropagation();
            // 阻断双击序列里的单击
            if (event.detail && event.detail > 1) return;
            if (App._clickTimer) clearTimeout(App._clickTimer);

            const withCtrl = isCtrlLike(event);
            const withShift = !!event.shiftKey;
            App._clickTimer = setTimeout(() => {
              handleSingleClick(panelIdx, d.q, d.r, withCtrl, withShift);
            }, STYLE.CLICK_DELAY);

          }).on('dblclick', (event, d) => {
            event.preventDefault(); event.stopPropagation();
            if (App._clickTimer) { clearTimeout(App._clickTimer); App._clickTimer = null; }
            handleDoubleClick(panelIdx, d.q, d.r, event);
          }).on('contextmenu', (event) => {
            // Mac 的 ctrl-click 会触发 contextmenu；阻止它以保证 click 能正常走逻辑
            event.preventDefault();
          });

          return g.attr('transform', d => `translate(${d.x},${d.y})`);
        },
        update => update.attr('transform', d => `translate(${d.x},${d.y})`),
        exit => exit.remove()
      );

    // 国家边界
    drawCountries(space, svg, hexRadius);

    // 构建 map
    const hexMap = new Map();
    hexList.forEach(d => hexMap.set(`${d.q},${d.r}`, d));
    App.hexMapsByPanel[panelIdx] = hexMap;

    updateHexStyles();
  }

  function drawCountries(space, svg, hexRadius) {
    const container = svg.select('g');
    container.selectAll('.country-border').remove();

    (space.countries || []).forEach(country => {
      const hexList = [];
      container.selectAll('g.hex').each(function(d) {
        if (country.hexes?.some(hx => hx.q === d.q && hx.r === d.r)) {
          hexList.push({ ...d });
        }
      });
      if (!hexList.length) return;

      const keySet = new Set(hexList.map(h => `${h.panelIdx}_${h.q}_${h.r}`));
      const dirs = [[+1,0],[0,+1],[-1,+1],[-1,0],[0,-1],[+1,-1]];
      const hexPoint = i => {
        const angle = Math.PI/3 * i;
        return [hexRadius * Math.cos(angle), hexRadius * Math.sin(angle)];
      };
      let borderEdges = [];
      hexList.forEach(h => {
        const cx = h.x, cy = h.y;
        dirs.forEach(([dq, dr], i) => {
          const nKey = `${h.panelIdx}_${h.q+dq}_${h.r+dr}`;
          if (!keySet.has(nKey)) {
            const p1 = hexPoint(i);
            const p2 = hexPoint((i+1)%6);
            borderEdges.push([[cx+p1[0], cy+p1[1]], [cx+p2[0], cy+p2[1]]]);
          }
        });
      });
      const uniq = {};
      const edgeKey = (a, b) => `${a[0]},${a[1]}_${b[0]},${b[1]}`;
      borderEdges.forEach(([a,b]) => {
        const k1 = edgeKey(a,b), k2 = edgeKey(b,a);
        if (!uniq[k1] && !uniq[k2]) uniq[k1]=[a,b];
      });

      Object.values(uniq).forEach(([a,b]) => {
        container.append('line')
          .attr('class', 'country-border')
          .attr('x1', a[0]).attr('y1', a[1])
          .attr('x2', b[0]).attr('y2', b[1])
          .attr('stroke', App.config.countryBorder.color)
          .attr('stroke-width', App.config.countryBorder.width)
          .attr('pointer-events', 'none');
      });
    });
  }

  /* =========================
   * Overlay（roads / rivers / cities / flights）
   * ========================= */
  function drawOverlayLinesFromLinks(links, allHexDataByPanel, hexMapsByPanel, showTempFlight=false) {
    // 清空每个 panel 的 overlay-root
    App.overlaySvgs.forEach(overlaySvg => {
      const { links, cities } = ensureOverlayRoot(overlaySvg);
      links.selectAll('*').remove();
      cities.selectAll('*').remove();
    });

    // 全局 overlay（flight 最高层）
    const gGlobal = d3.select(App.globalOverlayEl);
    const gG = ensureOverlayRoot(gGlobal);
    gG.links.selectAll('*').remove();   // flight 曲线层

    // 起点计数（城市/首都）
    const startCountPerPanel = new Map();
    const ensureCountMap = (idx) => {
      if (!startCountPerPanel.has(idx)) startCountPerPanel.set(idx, new Map());
      return startCountPerPanel.get(idx);
    };
    const bump = (idx, q, r) => {
      const m = ensureCountMap(idx);
      const k = `${q},${r}`;
      m.set(k, (m.get(k) || 0) + 1);
    };

    const getLocalXY = (panelIdx, q, r) => {
      const hex = App.hexMapsByPanel[panelIdx]?.get(`${q},${r}`);
      return hex ? [hex.x, hex.y] : null;
    };

    (links || []).forEach(link => {
      const type  = link.type || 'road';
      const style = styleOf(type);

      // 1) 原始路径 → 标准化 panelIdx
      const ptsRaw = (link.path || []).map((p, i) => ({
        panelIdx: resolvePanelIdxForPathPoint(p, link, i),
        q: p.q, r: p.r
      }));

      // 2) 若这条线路被选中：按排除点过滤（关键改动）
      let pts = ptsRaw;
      const lk = linkKey(link);
      if (App.selectedRouteIds.has(lk)) {
        pts = ptsRaw.filter(p => !App.excludedHexKeys.has(`${p.panelIdx}|${p.q},${p.r}`));
      }

      // 3) 过滤后不足两点，不画
      if (pts.length < 2) return;

      // 4) 起点计数（用于城市/首都，基于过滤后的首点）
      const p0 = pts[0];
      bump(p0.panelIdx, p0.q, p0.r);

      if (type === 'flight') {
        // flight：仍用端点绘制；不受中间点排除影响
        const a = pts[0];
        const b = pts[pts.length - 1];
        if (!flightEndpointsVisible(a, b)) return;

        const g0 = getHexGlobalXY(a.panelIdx, a.q, a.r);
        const g1 = getHexGlobalXY(b.panelIdx, b.q, b.r);
        if (!g0 || !g1) return;

        const dx = g1[0] - g0[0], dy = g1[1] - g0[1];
        const mx = (g0[0] + g1[0]) / 2, my = (g0[1] + g1[1]) / 2;
        const curveOffset = Math.sign(dx) * style.controlCurveRatio * Math.sqrt(dx*dx + dy*dy);
        const c1x = mx + curveOffset, c1y = my - curveOffset;

        gG.links.append('path')
          .attr('d', `M${g0[0]},${g0[1]} Q${c1x},${c1y} ${g1[0]},${g1[1]}`)
          .attr('stroke', style.color)
          .attr('stroke-width', style.width)
          .attr('stroke-opacity', style.opacity)
          .attr('fill', 'none')
          .attr('stroke-dasharray', style.dash || null);
      } else {
        // road/river：按过滤后的 pts 直接画，跳过被排除的中间点
        const panelIdx = pts[0].panelIdx;
        const overlaySvg = App.overlaySvgs[panelIdx];
        if (!overlaySvg) return;
        const gLines = ensureOverlayRoot(overlaySvg).links;

        const xy = pts.map(p => getLocalXY(p.panelIdx, p.q, p.r)).filter(Boolean);
        if (xy.length < 2) return;

        if (xy.length === 2) {
          gLines.append('line')
            .attr('x1', xy[0][0]).attr('y1', xy[0][1])
            .attr('x2', xy[1][0]).attr('y2', xy[1][1])
            .attr('stroke', style.color).attr('stroke-width', style.width)
            .attr('stroke-opacity', style.opacity).attr('fill', 'none')
            .attr('stroke-dasharray', style.dash || null);
        } else {
          gLines.append('polyline')
            .attr('points', xy.map(p => p.join(',')).join(' '))
            .attr('stroke', style.color).attr('stroke-width', style.width)
            .attr('stroke-opacity', style.opacity).attr('fill', 'none')
            .attr('stroke-dasharray', style.dash || null);
        }
      }
    });

    // 城市/首都（中层）—保持不变
    startCountPerPanel.forEach((map, pIdx) => {
      const overlay = App.overlaySvgs[pIdx];
      if (!overlay) return;
      const gCities = ensureOverlayRoot(overlay).cities;
      const baseR = App.config.city.radius;

      map.forEach((count, key) => {
        const [qStr, rStr] = key.split(',');
        const q = +qStr, r = +rStr;
        const hex = App.hexMapsByPanel[pIdx]?.get(`${q},${r}`);
        if (!hex) return;

        const cx = hex.x, cy = hex.y;

        if (count === 1) {
          gCities.append('circle')
            .attr('cx', cx).attr('cy', cy)
            .attr('r', baseR)
            .attr('fill', App.config.city.fill)
            .attr('stroke', App.config.city.borderColor)
            .attr('stroke-width', App.config.city.borderWidth)
            .attr('vector-effect', 'non-scaling-stroke')
            .style('pointer-events', 'none');
        } else if (count >= 2) {
          const outerR = baseR * 1.4;
          const innerR = baseR * 0.8;
          gCities.append('circle')
            .attr('cx', cx).attr('cy', cy)
            .attr('r', outerR)
            .attr('fill', App.config.city.fill)
            .attr('stroke', App.config.city.borderColor)
            .attr('stroke-width', App.config.city.borderWidth)
            .attr('vector-effect', 'non-scaling-stroke')
            .style('pointer-events', 'none');
          gCities.append('circle')
            .attr('cx', cx).attr('cy', cy)
            .attr('r', innerR)
            .attr('fill', App.config.city.capitalFill)
            .attr('stroke', App.config.city.borderColor)
            .attr('stroke-width', App.config.city.borderWidth)
            .attr('vector-effect', 'non-scaling-stroke')
            .style('pointer-events', 'none');
        }
      });

      gCities.raise();
    });

    // 临时 flight（保持不变）
    if (showTempFlight && App.flightStart) {
      const a = App.flightStart;
      const startVisible = isPointVisible(a.panelIdx, a.q, a.r);
      if (startVisible) {
        const p0 = getHexGlobalXY(a.panelIdx, a.q, a.r);
        const p1 = [App.currentMouse.x, App.currentMouse.y];
        if (p0 && p1) {
          const style = App.config.flight;
          const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
          const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
          const curveOffset = Math.sign(dx) * style.controlCurveRatio * Math.sqrt(dx*dx + dy*dy);
          const c1x = mx + curveOffset, c1y = my - curveOffset;

          gG.links.append('path')
            .attr('d', `M${p0[0]},${p0[1]} Q${c1x},${c1y} ${p1[0]},${p1[1]}`)
            .attr('stroke', style.color)
            .attr('stroke-width', style.tempWidth)
            .attr('stroke-opacity', style.tempOpacity)
            .attr('fill', 'none')
            .attr('stroke-dasharray', style.tempDash);
        }
      }
    }
  }

  /* =========================
   * 选中/高亮样式
   * ========================= */
  function getConnectedHexKeys(panelIdx, q, r) {
    const out = new Set();
    for (const link of (App._lastLinks || [])) {
      if (link.type !== 'road' && link.type !== 'river') continue;
      const pts = (link.path || []).map((p, i) => ({
        panelIdx: resolvePanelIdxForPathPoint(p, link, i),
        q: p.q, r: p.r
      })).filter(p => p.panelIdx === panelIdx);
      if (!pts.length) continue;
      if (pts.some(p => p.q === q && p.r === r)) {
        pts.forEach(p => out.add(`${p.q},${p.r}`));
      }
    }
    return out;
  }

  function addFlightNeighbors(panelIdx, q, r) {
    for (const link of App._lastLinks || []) {
      if (link.type !== 'flight') continue;
      const a = link.path?.[0];
      const b = link.path?.[link.path.length - 1];
      if (!a || !b) continue;

      const aPanel = resolvePanelIdxForPathPoint(a, link, 0);
      const bPanel = resolvePanelIdxForPathPoint(b, link, (link.path?.length || 1) - 1);
      const isA = (a.q === q && a.r === r && aPanel === panelIdx);
      const isB = (b.q === q && b.r === r && bPanel === panelIdx);

      if (isA) App.neighborKeySet.add(`${bPanel}|${b.q},${b.r}`);
      if (isB) App.neighborKeySet.add(`${aPanel}|${a.q},${a.r}`);
    }
  }

  function updateHexStyles() {
    // 不再做邻居扩散：仅根据 persistent / excluded / hover / flight 来设透明度
    App.subspaceSvgs.forEach((svg, panelIdx) => {
      svg.selectAll('g.hex').each(function(d) {
        const path = d3.select(this).select('path');
        let opacity = STYLE.OPACITY_DEFAULT;

        const key = pkey(panelIdx, d.q, d.r);
        const isExcluded    = App.excludedHexKeys.has(key);
        const isSelected    = App.persistentHexKeys.has(key);
        const isHovered     = App.hoveredHex?.panelIdx === panelIdx && App.hoveredHex.q === d.q && App.hoveredHex.r === d.r;
        const isFlightStart = App.flightStart?.panelIdx === panelIdx && App.flightStart.q === d.q && App.flightStart.r === d.r;
        const isFlightHover = App.flightHoverTarget?.panelIdx === panelIdx && App.flightHoverTarget.q === d.q && App.flightHoverTarget.r === d.r;

        if (isHovered || isFlightStart || isFlightHover || isSelected) {
          opacity = STYLE.OPACITY_HOVER;
        } else {
          // 其余情况都按默认；被排除只是在“非交互态”时保持默认不亮
          opacity = STYLE.OPACITY_DEFAULT;
        }

        path.attr('fill-opacity', opacity);
      });
    });
  }

  // 仅取“一跳”邻居（不做整片扩展），返回 Set<"panelIdx|q,r">
  function starKeys(panelIdx, q, r) {
    const adj = buildUndirectedAdjacency();
    const me = `${panelIdx}|${q},${r}`;
    const out = new Set([me]);

    // 邻居：来自无向邻接表（roads/rivers，跨 panel 时也会带 panelIdx）
    const nbs = adj.get(me);
    if (nbs && nbs.size) nbs.forEach(k => out.add(k));

    // 若需要把 flight 端点也视为“一跳”，加上这段：
    for (const link of (App._lastLinks || [])) {
      if (link.type !== 'flight') continue;
      const a = link.path?.[0];
      const b = link.path?.[link.path.length - 1];
      if (!a || !b) continue;
      const aPanel = resolvePanelIdxForPathPoint(a, link, 0);
      const bPanel = resolvePanelIdxForPathPoint(b, link, (link.path?.length || 1) - 1);
      if (aPanel === panelIdx && a.q === q && a.r === r) out.add(`${bPanel}|${b.q},${b.r}`);
      if (bPanel === panelIdx && b.q === q && b.r === r) out.add(`${aPanel}|${a.q},${a.r}`);
    }

    return out;
}


  /* =========================
   * 交互/快照
   * ========================= */
  function buildUndirectedAdjacency() {
    const adj = new Map();
    const key = (panelIdx, q, r) => `${panelIdx}|${q},${r}`;
    const ensure = (k) => { if (!adj.has(k)) adj.set(k, new Set()); return adj.get(k); };

    for (const e of (App._lastLinks || [])) {
      const path = Array.isArray(e.path) ? e.path : [];
      if (path.length < 2) continue;
      const pts = path.map((p, i) => ({
        panelIdx: resolvePanelIdxForPathPoint(p, e, i),
        q: p.q, r: p.r
      }));
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i+1];
        const ka = key(a.panelIdx, a.q, a.r);
        const kb = key(b.panelIdx, b.q, b.r);
        ensure(ka).add(kb);
        ensure(kb).add(ka);
      }
    }
    return adj;
  }

  // ==== NEW: 基于“整条线路”的 star：返回所有“包含 (panelIdx,q,r)” 的线路上所有点 ====
  function lineStarKeys(panelIdx, q, r, opts = { includeFlight: true }) {
    const result = new Set();
    const matchAt = (pt, link, i) => {
      const pIdx = resolvePanelIdxForPathPoint(pt, link, i);
      return pIdx === panelIdx && pt.q === q && pt.r === r;
    };

    (App._lastLinks || []).forEach(link => {
      if (!opts.includeFlight && link.type === 'flight') return; // 如需把航线也纳入一跳，改为 true
      const path = Array.isArray(link.path) ? link.path : [];
      if (!path.length) return;

      // 该线路是否包含点击点
      const hit = path.some((pt, i) => matchAt(pt, link, i));
      if (!hit) return;

      // 把该线路全路径上的点加入选中集
      path.forEach((pt, i) => {
        const pIdx = resolvePanelIdxForPathPoint(pt, link, i);
        result.add(pkey(pIdx, pt.q, pt.r));
      });
    });

    return result; // Set<"panelIdx|q,r">
  }


  // 计算某点的一跳邻居（含自身）
  function computeOneHopStar(panelIdx, q, r) {
    const center = pkey(panelIdx, q, r);
    const adj = buildUndirectedAdjacency();      // 基于全部 links（road/river/flight）构建无向图
    const star = new Set([center]);
    const nbs = adj.get(center);
    if (nbs && nbs.size) {
      nbs.forEach(nb => star.add(nb));
    }
    return star;  // Set<"panel|q,r">
  }


  // 基于当前边集，返回 “以 (panelIdx,q,r) 为中心的一跳星选集合（含自身）”
  function getStarKeys(panelIdx, q, r) {
    const adj = buildUndirectedAdjacency();
    const k = `${panelIdx}|${q},${r}`;
    const star = new Set([k]);
    const nbs = adj.get(k);
    if (nbs && nbs.size) {
      for (const nb of nbs) star.add(nb);
    }
    return star;
  }


  function findEndpointMate(panelIdx, q, r) {
    const k = (p, q, r) => `${p}|${q},${r}`;
    for (const e of (App._lastLinks || [])) {
      const path = Array.isArray(e.path) ? e.path : [];
      if (path.length < 2) continue;
      const pts = path.map((p, i) => ({
        panelIdx: resolvePanelIdxForPathPoint(p, e, i), q: p.q, r: p.r
      }));
      const idx = pts.findIndex(p => p.panelIdx === panelIdx && p.q === q && p.r === r);
      if (idx < 0) continue;

      if (idx === 0) {
        const nb = pts[1];
        return { found: true, mateKey: k(nb.panelIdx, nb.q, nb.r) };
      }
      if (idx === pts.length - 1) {
        const nb = pts[pts.length - 2];
        return { found: true, mateKey: k(nb.panelIdx, nb.q, nb.r) };
      }
      // 中间点返回 not-found
    }
    return { found: false };
  }

  function removeSingleNode(panelIdx, q, r) {
    const key = pkey(panelIdx, q, r);
    App.persistentHexKeys.delete(key);
    App.excludedHexKeys.add(key);
  }


  // ★ NEW：从某个 key 出发，拿到“整条连通分量”（Set<key>）
   function getComponentKeysFrom(adj, startKey) {
     const visited = new Set([startKey]);
     const q = [startKey];
     while (q.length) {
       const cur = q.shift();
       for (const nb of (adj.get(cur) || new Set())) {
         if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
       }
     }
     return visited;
   }
 
   // ★ NEW：批量选中/取消一个点所在的整条连通分量
   function selectComponent(panelIdx, q, r) {
      const k = pkey(panelIdx, q, r);
      const adj = buildUndirectedAdjacency();
      const comp = getComponentKeysFrom(adj, k);
      comp.forEach(kk => {
        App.persistentHexKeys.add(kk);
        App.excludedHexKeys.delete(kk);   // ★ NEW：被选中的点不应再保留“排除”标记
      });
    }

    function deselectComponent(panelIdx, q, r) {
      const k = pkey(panelIdx, q, r);
      const adj = buildUndirectedAdjacency();
      const comp = getComponentKeysFrom(adj, k);
      comp.forEach(kk => {
        App.persistentHexKeys.delete(kk);
        //（可选）也可以把 comp 内的排除清掉，看你的需求：
        // App.excludedHexKeys.delete(kk);
      });
    }

  function snapshotFromKeySet(keySet) {
    if (!keySet || keySet.size === 0) return { nodes: [], links: [] };

    const nodes = [];
    for (const k of keySet) {
      const [pStr, qr] = k.split('|');
      const [qStr, rStr] = qr.split(',');
      const panelIdx = +pStr, q = +qStr, r = +rStr;
      const hex = App.hexMapsByPanel[panelIdx]?.get(`${q},${r}`);
      if (!hex) continue;
      nodes.push({
        id: `${panelIdx}:${q},${r}`,
        panelIdx, q, r,
        label: hex.label || `${q},${r}`,
        modality: hex.modality || ''
      });
    }

    const links = [];
    const inSet = (p) => keySet.has(`${p.panelIdx}|${p.q},${p.r}`);
    const usedKeys = new Set(); // 被任何“片段”消费的点

    for (const e of (App._lastLinks || [])) {
      const rawPts = Array.isArray(e.path) ? e.path : [];
      if (rawPts.length < 2) continue;
      const norm = rawPts.map((p, i) => ({
        panelIdx: resolvePanelIdxForPathPoint(p, e, i), q: p.q, r: p.r
      }));

      // 按“在选集中”的连续片段切
      let run = [];
      const flush = () => {
        if (run.length >= 2) {
          run.forEach(pt => usedKeys.add(`${pt.panelIdx}|${pt.q},${pt.r}`));
          const panels = Array.from(new Set(run.map(pt => pt.panelIdx)));
          const panelNames = panels.map(idx => App.currentData?.subspaces?.[idx]?.subspaceName || `Subspace ${idx+1}`);
          const first = run[0], last = run[run.length-1];
          links.push({
            id: `${e.type || 'road'}:${first.panelIdx}:${first.q},${first.r}->${last.panelIdx}:${last.q},${last.r}`,
            type: e.type || 'road',
            path: run.map(pt => ({ panelIdx: pt.panelIdx, q: pt.q, r: pt.r })),
            panels, panelNames
          });
        }
        run = [];
      };

      for (let i = 0; i < norm.length; i++) {
        if (inSet(norm[i])) run.push(norm[i]); else flush();
      }
      flush();
    }

    // 把未被任何片段消费的“孤点”也作为单点 link 传出去
    for (const k of keySet) {
      if (usedKeys.has(k)) continue;
      const [pStr, qr] = k.split('|'); const [qStr, rStr] = qr.split(',');
      const panelIdx = parseInt(pStr, 10); const q = parseInt(qStr, 10); const r = parseInt(rStr, 10);
      const panels = [panelIdx];
      const panelNames = [App.currentData?.subspaces?.[panelIdx]?.subspaceName || `Subspace ${panelIdx+1}`];
      links.push({
        id: `single:${panelIdx}:${q},${r}`,
        type: 'single',
        path: [{ panelIdx, q, r }],
        panels, panelNames
      });
    }

    return { nodes, links };
  }


  function snapshotFromSelectedRoutes() {
    const nodesSet = new Set();  // 收集被选路线中“未被排除”的节点 key
    const linksOut = [];

    (App._lastLinks || []).forEach(link => {
      if (!isSelectableRoute(link)) return;
      const lk = linkKey(link);
      if (!App.selectedRouteIds.has(lk)) return;

      const raw = Array.isArray(link.path) ? link.path : [];
      // 过滤掉被排除点，同时保留原始顺序
      const filtered = [];
      for (let i=0;i<raw.length;i++){
        const p = raw[i];
        const pIdx = resolvePanelIdxForPathPoint(p, link, i);
        const key = `${pIdx}|${p.q},${p.r}`;
        if (!App.excludedHexKeys.has(key)) {
          filtered.push({ panelIdx: pIdx, q: p.q, r: p.r });
          nodesSet.add(key);
        }
      }
      if (filtered.length >= 2) {
        const panels = Array.from(new Set(filtered.map(pt => pt.panelIdx)));
        const panelNames = panels.map(idx => App.currentData?.subspaces?.[idx]?.subspaceName || `Subspace ${idx+1}`);

        linksOut.push({
          id: `${(link.type || 'road')}:${linkKey(link)}`,
          type: link.type || 'road',
          path: filtered,
          panels, panelNames
        });
      }
    });

    // nodes：从 nodesSet 萃取
    const nodes = [];
    nodesSet.forEach(k => {
      const [pStr, qr] = k.split('|');
      const [qStr, rStr] = qr.split(',');
      const panelIdx = +pStr, q = +qStr, r = +rStr;
      const hex = App.hexMapsByPanel[panelIdx]?.get(`${q},${r}`);
      if (hex) {
        nodes.push({
          id: `${panelIdx}:${q},${r}`,
          panelIdx, q, r,
          label: hex.label || `${q},${r}`,
          modality: hex.modality || ''
        });
      }
    });

    // 若完全没有选中路线（比如只点了一个且被排除），退回原有方案
    if (!linksOut.length && nodes.length) {
      return snapshotFromKeySet(App.persistentHexKeys);
    }
    return { nodes, links: linksOut };
  }


  function publishToStepAnalysis() {
    // 优先使用“按路线”的快照
    if (App.selectedRouteIds.size > 0) {
      App._lastSnapshot = snapshotFromSelectedRoutes();
    } else {
      App._lastSnapshot = snapshotFromKeySet(App.persistentHexKeys || new Set());
    }
  }


  function handleSingleClick(panelIdx, q, r, withCtrl = false, withShift = false) {
    const k = pkey(panelIdx, q, r);

    // —— 插入模式：优先处理 ——————————————————————————————
    if (App.insertMode) {
      const link = findLinkById(App.insertMode.routeId);
      if (!link) { App.insertMode = null; } 
      else {
        // 如果点到的是“另一端终点”（或你规定的结束点），就结束并提交
        const isEndpoint =
          indexOfPointInLink(link, panelIdx, q, r) === 0 ||
          indexOfPointInLink(link, panelIdx, q, r) === link.path.length - 1;
        // 中间过程：Shift 点击添加，允许不按 Ctrl
        if (withShift && !isEndpoint) {
          insertPointAfter(link, App.insertMode.anchorIndex, panelIdx, q, r);
          // 每次添加立即重绘
          drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
          recomputePersistentFromRoutes();
          updateHexStyles();
          publishToStepAnalysis();
          return;
        }
        // 以 Ctrl Shift 点击终点（或任意你定义的“结束动作”）结束
        if (withCtrl && withShift && isEndpoint) {
          endInsertMode(true);
          return;
        }
      }
      // 插入模式存在但没命中规则，继续走普通分支
    }


    if (!withCtrl) {
      // 普通单击：整片切（连通分量切换）
      if (App.persistentHexKeys.has(k)) {
        deselectComponent(panelIdx, q, r);
        if (App.selectedHex?.panelIdx === panelIdx && App.selectedHex.q === q && App.selectedHex.r === r) {
          App.selectedHex = null;
        }
      } else {
        selectComponent(panelIdx, q, r);
        App.selectedHex = { panelIdx, q, r };
      }
    } else {
      // === Ctrl   Shift：如果当前选中了路线，并在其某个点（常用：起点）上，进入插入模式
      if (withShift) {
        // 从已选路线中，找包含当前点击点的那条（常见：只有 1 条）
        const route = findSelectedRouteContaining(panelIdx, q, r);
        if (route) {
          const idx = indexOfPointInLink(route, panelIdx, q, r);
          if (idx >= 0) {
            beginInsertMode(route, idx);
            // 把这条路线的所有节点加入高亮，避免视觉混乱
            App.selectedHex = { panelIdx, q, r };
            recomputePersistentFromRoutes();
            updateHexStyles();
            return; // 进入模式后返回
          }
        }
        // 没找到包含该点的已选路线，就继续走下面的“整条路线选择/排除”逻辑
      }
  
    // ★★★ Ctrl / ⌘：按“整条线路”选择；若该点已在高亮里 => 仅排除此点
    const key = pkey(panelIdx, q, r);

    if (App.persistentHexKeys.has(key)) {
      // 已在选集中：只把这个点排除（视觉恢复默认），不动 selectedRouteIds
      App.excludedHexKeys.add(key);
      App.persistentHexKeys.delete(key);
      } else {
        // 不在选集中：按规则把“整条线路”加入 selectedRouteIds
        let added = false;

        // 规则一：若这个点是某条线路的“起点”，选中所有以它为起点的线路
        (App._lastLinks || []).forEach(link => {
          if (!isSelectableRoute(link)) return;
          if (isStartOfLink(link, panelIdx, q, r)) {
            App.selectedRouteIds.add(linkKey(link));
            added = true;
          }
        });

        // 规则二：否则，选中所有“包含此点”的线路
        if (!added) {
          (App._lastLinks || []).forEach(link => {
            if (!isSelectableRoute(link)) return;
            if (linkContainsNode(link, panelIdx, q, r)) {
              App.selectedRouteIds.add(linkKey(link));
              added = true;
            }
          });
        }

        // 这次把该点加入选集（若之前被排除则撤销排除）
        App.excludedHexKeys.delete(key);
      }

      // ★ 依据“所选线路 + 排除点”重建节点高亮
      recomputePersistentFromRoutes();
      App.selectedHex = { panelIdx, q, r };
      // ★ 立刻重绘 Overlay（让被排除的点立刻从折线中剔除）
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
     
    }

    updateHexStyles();
    publishToStepAnalysis();
  }
  
  function handleDoubleClick(panelIdx, q, r, event) {
    const here = { panelIdx, q, r };

    if (!App.flightStart) {
      App.flightStart = here;
      const rect = App.playgroundEl.getBoundingClientRect();
      App.currentMouse.x = event.clientX - rect.left;
      App.currentMouse.y = event.clientY - rect.top;
      // 双击也把所在连通分量选上
      selectComponent(panelIdx, q, r);
      updateHexStyles();
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, true);
      publishToStepAnalysis();
      return;
    }

    const same = App.flightStart.panelIdx === panelIdx && App.flightStart.q === q && App.flightStart.r === r;
    if (same) {
      App.flightStart = null;
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
      updateHexStyles();
      publishToStepAnalysis();
      return;
    }

    // 建立 flight
    addCustomFlightLink(App.flightStart, here);

    // 两端固定为已选（保持选中）
    App.persistentHexKeys.add(pkey(App.flightStart.panelIdx, App.flightStart.q, App.flightStart.r));
    App.persistentHexKeys.add(pkey(panelIdx, q, r));

    App.flightStart = null;
    drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
    updateHexStyles();
    publishToStepAnalysis();

    ModeUI.computeAndApply({});
  }


  function addCustomFlightLink(a, b) {
    const flight = {
      type: 'flight',
      panelIdxFrom: a.panelIdx,
      panelIdxTo: b.panelIdx,
      from: { q: a.q, r: a.r, panelIdx: a.panelIdx },
      to:   { q: b.q, r: b.r, panelIdx: b.panelIdx },
      path: [
        { q: a.q, r: a.r, panelIdx: a.panelIdx },
        { q: b.q, r: b.r, panelIdx: b.panelIdx }
      ]
    };
    App._lastLinks.push(flight);
    drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
    publishToStepAnalysis();
  }

  /* =========================
   * 面板拖拽/尺寸变化/全局事件
   * ========================= */
  function enableSubspaceDrag(subspaceDiv, idxInitial) {
    const title = subspaceDiv.querySelector('.subspace-title');
    let startX, startY, origLeft, origTop;
    let isDragging = false;

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      subspaceDiv.style.left = (origLeft + dx) + 'px';
      subspaceDiv.style.top  = (origTop  + dy) + 'px';
      requestAnimationFrame(() => {
        drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
      });
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.userSelect = '';
      const idx = Number(subspaceDiv.dataset.index ?? idxInitial);
      const left = parseFloat(subspaceDiv.style.left || '0');
      const top  = parseFloat(subspaceDiv.style.top  || '0');
      App.panelStates[idx] = { ...(App.panelStates[idx] || {}), left, top };
    };

    title.addEventListener('mousedown', (e) => {
      if (e.detail === 2) return; // 双击时不拖拽
      if (title.isContentEditable) return;
      isDragging = true;
      startX = e.clientX; startY = e.clientY;
      origLeft = parseFloat(subspaceDiv.style.left || '0');
      origTop  = parseFloat(subspaceDiv.style.top  || '0');
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    const onKeyDownGlobal = (e) => {
      if (!App.insertMode) return;
      if (e.key === 'Escape') { endInsertMode(false); }
      if (e.key === 'Enter')  { endInsertMode(true);  }
    };
    document.addEventListener('keydown', onKeyDownGlobal);
    cleanupFns.push(() => document.removeEventListener('keydown', onKeyDownGlobal));


    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    cleanupFns.push(() => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    });
  }

  function observePanelResize() {
    App.playgroundEl.querySelectorAll('.subspace').forEach((subspaceDiv) => {
      if (subspaceDiv._resizeObserver) return;
      const ro = new ResizeObserver(() => {
        const idx = Number(subspaceDiv.dataset.index ?? -1);
        const cs = getComputedStyle(subspaceDiv);
        const w = parseFloat(cs.width);
        const h = parseFloat(cs.height);
        if (idx >= 0) {
          App.panelStates[idx] = { ...(App.panelStates[idx] || {}), width: w, height: h };
        }
        syncContainerHeight(subspaceDiv);
        drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
        updateHexStyles();
      });
      subspaceDiv._resizeObserver = ro;
      ro.observe(subspaceDiv);
      cleanupFns.push(() => ro.disconnect());
    });
  }

  // 确保全局 overlay 有根节点
  ensureOverlayRoot(d3.select(App.globalOverlayEl));

  // 初始化渲染
  function renderSemanticMapFromData(data) {
    App.currentData = data;
    App._lastLinks = data.links || [];

    // ★ 给每条 link 分配稳定 id（若已有 id 则复用，否则生成 _uid）
    let _uidSeq = 0;
    (App._lastLinks || []).forEach(link => {
      if (!link) return;
      if (!link.id) link._uid = `L${_uidSeq++}`;     // 没有 id 用 _uid
    });

    renderPanels(data.subspaces || []);
    (data.subspaces || []).forEach((space, i) => renderHexGridFromData(i, space, App.config.hex.radius));
    drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
    observePanelResize();
    updateHexStyles();
    publishToStepAnalysis();
    ModeUI.computeAndApply({});
    const resizeHandler = () => {
      (data.subspaces || []).forEach((space, i) => renderHexGridFromData(i, space, App.config.hex.radius));
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
      updateHexStyles();
      App.globalOverlayEl.setAttribute('width', App.playgroundEl.clientWidth);
      App.globalOverlayEl.setAttribute('height', App.playgroundEl.clientHeight);
    };
    window.addEventListener('resize', resizeHandler);
    cleanupFns.push(() => window.removeEventListener('resize', resizeHandler));

    const ro = new ResizeObserver(() => {
      App.globalOverlayEl.setAttribute('width', App.playgroundEl.clientWidth);
      App.globalOverlayEl.setAttribute('height', App.playgroundEl.clientHeight);
    });
    ro.observe(App.playgroundEl);
    cleanupFns.push(() => ro.disconnect());
  }

  // 全局鼠标（临时航线）
  const onMouseMoveGlobal = (event) => {
    if (!App.flightStart) return;
    const rect = App.playgroundEl.getBoundingClientRect();
    App.currentMouse.x = event.clientX - rect.left;
    App.currentMouse.y = event.clientY - rect.top;
    drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, true);
    updateHexStyles();
  };
  document.addEventListener('mousemove', onMouseMoveGlobal);
  cleanupFns.push(() => document.removeEventListener('mousemove', onMouseMoveGlobal));

  // 点击空白：取消选中；双击空白：取消起点
  const onBlankClick = (e) => {
    if (e.target === App.playgroundEl) {
      App.selectedHex = null;
      App.neighborKeySet.clear();
      App.selectedRouteIds.clear();   // ★ 新增
      App.excludedHexKeys.clear();    // ★ 新增
      App.persistentHexKeys.clear();  // ★ 新增
      // ★ 清空后也要重画，恢复默认线路形态
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
      updateHexStyles();
      publishToStepAnalysis();

      // UI 复位
      ModeUI.computeAndApply({});
    }
  };
  const onBlankDblClick = (e) => {
    if (e.target === App.playgroundEl) {
      App.flightStart = null;
      App.flightHoverTarget = null;
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
      updateHexStyles();
      publishToStepAnalysis();
    }
  };
  App.playgroundEl.addEventListener('click', onBlankClick);
  App.playgroundEl.addEventListener('dblclick', onBlankDblClick);
  cleanupFns.push(() => {
    App.playgroundEl.removeEventListener('click', onBlankClick);
    App.playgroundEl.removeEventListener('dblclick', onBlankDblClick);
  });

  // 首次渲染
  renderSemanticMapFromData(initialData || { subspaces: [], links: [] });
  App.globalOverlayEl.setAttribute('width', App.playgroundEl.clientWidth);
  App.globalOverlayEl.setAttribute('height', App.playgroundEl.clientHeight);

  // 主标题：双击可编辑
  if (mainTitleEl) {
    setupInlineEditableTitle(mainTitleEl, {
      getInitial: () => (
        (App.currentData?.title ?? (mainTitleEl.textContent || '').trim()) || 'Semantic Map'
      ),
      placeholder: 'Semantic Map',
      onRename: async (newText) => {
        if (!App.currentData) App.currentData = {};
        App.currentData.title = newText;
        if (typeof App.onMainTitleRename === 'function') {
          await App.onMainTitleRename(newText);
        }
      }
    });
  }

  function setupInlineEditableTitle(el, { getInitial, placeholder, onRename }) {
    if (!el) return;
    el.addEventListener('dblclick', () => {
      el.setAttribute('contenteditable', 'true');
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);

      const finish = async (commit = true) => {
        el.removeAttribute('contenteditable');
        if (commit) {
          const txt = (el.textContent || '').trim() || placeholder;
          el.textContent = txt;
          try { await onRename(txt); } catch (e) { console.warn(e); }
        } else {
          el.textContent = getInitial();
        }
      };
      const onBlur = () => finish(true);
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      };
      el.addEventListener('blur', onBlur, { once: true });
      el.addEventListener('keydown', onKey, { once: true });
    });
  }

  /* =========================
   * 删除子空间（重建索引/连线）
   * ========================= */
  function _rebuildLinksAfterRemove(links, removedIdx) {
    const out = [];
    for (const link of links || []) {
      const touchesRemoved =
        link.panelIdx === removedIdx ||
        link.panelIdxFrom === removedIdx ||
        link.panelIdxTo === removedIdx ||
        (link.path || []).some(p => p.panelIdx === removedIdx);

      if (touchesRemoved) continue;

      const copy = JSON.parse(JSON.stringify(link));
      if (typeof copy.panelIdxFrom === 'number' && copy.panelIdxFrom > removedIdx) copy.panelIdxFrom--;
      if (typeof copy.panelIdxTo   === 'number' && copy.panelIdxTo   > removedIdx) copy.panelIdxTo--;
      if (typeof copy.panelIdx     === 'number' && copy.panelIdx     > removedIdx) copy.panelIdx--;
      if (Array.isArray(copy.path)) {
        copy.path.forEach(p => {
          if (typeof p.panelIdx === 'number' && p.panelIdx > removedIdx) p.panelIdx--;
        });
      }
      out.push(copy);
    }
    return out;
  }

  function _deleteSubspaceByIndex(idx) {
    if (!App.currentData || !Array.isArray(App.currentData.subspaces)) return;
    if (idx < 0 || idx >= App.currentData.subspaces.length) return;

    // 1) 数据删除
    App.currentData.subspaces.splice(idx, 1);

    // 1.1) 同步删掉持久化状态与缩放状态
    App.panelStates.splice(idx, 1);
    App.zoomStates.splice(idx, 1);

    // 2) 链路重建
    App._lastLinks = _rebuildLinksAfterRemove(App._lastLinks, idx);

    // 清理持久集合中属于被删面板的 key
    for (const k of Array.from(App.persistentHexKeys)) {
      const [panelStr] = k.split('|');
      if (+panelStr === idx) App.persistentHexKeys.delete(k);
    }

    // 3) 全量重绘
    renderPanels(App.currentData.subspaces || []);
    (App.currentData.subspaces || []).forEach((space, i) => {
      renderHexGridFromData(i, space, App.config.hex.radius);
    });
    drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
    updateHexStyles();
    observePanelResize();

    publishToStepAnalysis();
  }

  /* =========================
   * 对外 API
   * ========================= */
  const controller = {
    cleanup() {
      cleanupFns.forEach(fn => fn && fn());
      d3.select(App.globalOverlayEl).selectAll('*').remove();
      App.playgroundEl.querySelectorAll('.subspace').forEach(n => n.remove());
    },
    addSubspace(space = {}) {
      if (!App.currentData) App.currentData = { subspaces: [], links: [] };
      const newIndex = App.currentData.subspaces.length;

      // 初始化面板状态
      if (!Array.isArray(App.panelStates)) App.panelStates = [];
      App.panelStates.push({});

      const newSpace = {
        subspaceName: space.subspaceName || `Subspace ${newIndex + 1}`,
        hexList: Array.isArray(space.hexList) ? space.hexList : [],
        countries: Array.isArray(space.countries) ? space.countries : []
      };
      App.currentData.subspaces.push(newSpace);
      createSubspaceElement(newSpace, newIndex);
      renderHexGridFromData(newIndex, newSpace, App.config.hex.radius);
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
      updateHexStyles();
      observePanelResize();
    },
    setOnSubspaceRename(fn) {
      App.onSubspaceRename = typeof fn === 'function' ? fn : null;
    },
    deleteSubspace(idx) {
      _deleteSubspaceByIndex(idx);
    },
    setOnMainTitleRename(fn) {
      App.onMainTitleRename = typeof fn === 'function' ? fn : null;
    },
    pulseSelection() { publishToStepAnalysis(); },
    getSelectionSnapshot() {
      // 当存在“整条线路选择”时，优先使用路线快照（会把被排除点跨过去，得到 A-C 这样的新边）
      let snap;
      if (App.selectedRouteIds && App.selectedRouteIds.size > 0) {
        snap = snapshotFromSelectedRoutes();
      } else {
        const keySet = (App.highlightedHexKeys && App.highlightedHexKeys.size)
          ? App.highlightedHexKeys
          : App.persistentHexKeys;
        snap = snapshotFromKeySet(keySet || new Set());
      }

      // 保持原有的 focusId 行为
      const focusId = App.selectedHex
        ? `${App.selectedHex.panelIdx}:${App.selectedHex.q},${App.selectedHex.r}`
        : null;

      return { ...snap, meta: { focusId } };
    },


  };

  return controller;
}

export function destroySemanticMap(cleanup) {
  if (typeof cleanup === 'function') cleanup();
}


