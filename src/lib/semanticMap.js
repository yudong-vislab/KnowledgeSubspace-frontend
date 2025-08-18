// src/lib/semanticMap.js
import * as d3 from 'd3';
// import { emitSelection } from './selectionBus'

/** =========================
 *  可配置样式与常量（集中声明）
 *  ========================= */
const STYLE = {
  // hex 尺寸与默认外观
  HEX_RADIUS: 15,
  HEX_BORDER_WIDTH: 1.2,
  HEX_BORDER_COLOR: '#ffffff',
  HEX_FILL_TEXT: '#a9d08d',
  HEX_FILL_IMAGE: '#a6cee3',
  HEX_FILL_DEFAULT: '#ffffff',

  // 透明度（高亮语义）
  OPACITY_DEFAULT: 0.2,
  OPACITY_HOVER: 0.8,
  OPACITY_SELECTED: 1.0,
  OPACITY_NEIGHBOR: 0.8, // 选中点的 road/river 邻居

  // city 小圆点（如果有）
  CITY_RADIUS: 3,
  CITY_BORDER_WIDTH: 1,
  CITY_FILL: '#ffffff',
  CITY_BORDER_COLOR: '#777777',

  // 航线（flight）样式
  FLIGHT_COLOR: '#4a5f7e',
  FLIGHT_WIDTH: 1.2,
  FLIGHT_OPACITY: 0.98,
  FLIGHT_DASH: '3,2',
  FLIGHT_CONTROL_RATIO: 0.18,
  // 临时航线（跟随鼠标）
  FLIGHT_TEMP_WIDTH: 2,
  FLIGHT_TEMP_OPACITY: 0.55,
  FLIGHT_TEMP_DASH: '8,6',

  // road / river
  ROAD_COLOR: '#e9c46b',
  ROAD_WIDTH: 1.2,
  ROAD_OPACITY: 0.88,
  ROAD_DASH: null,

  RIVER_COLOR: '#a6cee3',
  RIVER_WIDTH: 1.2,
  RIVER_OPACITY: 0.88,
  RIVER_DASH: null,

  // 国家边界
  COUNTRY_BORDER_COLOR: '#000000',
  COUNTRY_BORDER_WIDTH: 1.5,

  // 画布 padding
  PLAYGROUND_PADDING: 12,

  // 单击与双击分离延时
  CLICK_DELAY: 250,

  // 子空间布局（避免重叠）
  SUBSPACE_MIN_W: 360,
  SUBSPACE_MIN_H: 400,
  SUBSPACE_GAP: 20,
  SUBSPACE_DEFAULT_LEFT: 30,
  SUBSPACE_DEFAULT_TOP: 30,
};

export async function initSemanticMap({
  outerEl,
  playgroundEl,
  globalOverlayEl,
  mainTitleEl, 
  initialData
}) {
  // ---- 兜底：允许用 ID 获取，且必须校验 ----
  playgroundEl = playgroundEl || document.getElementById('playground');
  globalOverlayEl = globalOverlayEl || document.getElementById('global-overlay');
  if (!playgroundEl || !globalOverlayEl) {
    throw new Error('[semanticMap] playgroundEl/globalOverlayEl is missing. Call after nextTick() and ensure refs exist.');
  }
  /** =========
   * App 状态
   * ========= */
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
    hexMapsByPanel: [],     // Map<"q,r", {q,r,x,y,...}>
    allHexDataByPanel: [],
    zoomStates: [],
    panelStates: [],   // 每个子空间的UI状态：{ left, top, width, height, zoom }

    // 交互状态
    _lastLinks: [],
    currentMouse: { x: 0, y: 0 },
    selectedHex: null,        // 单击选中
    neighborKeySet: new Set(),// 选中时的 road/river 邻居
    flightStart: null,        // 双击起点
    flightHoverTarget: null,  // 起点后，鼠标悬停到的另一个 hex（让两端高亮）
    hoveredHex: null,         // 当前 hover 的 hex（用于 hover 高亮）
    _clickTimer: null,
    onSubspaceRename: null,
    onMainTitleRename: null,   // 主标题重命名回调
    
    // 新增：最近一次完成连线的两端，用来保留高亮
    flightEndpointsHighlight: null, // { a:{panelIdx,q,r}, b:{panelIdx,q,r} } or null
    persistentHexKeys: new Set(),

    playgroundEl,
    globalOverlayEl,
    currentData: null,
    onSubspaceRename: null,
  };

  // 所有清理回调的集中管理
  const cleanupFns = [];

  /** =========
   * 小工具函数
   * ========= */
  // const keyOf = (q, r) => `${q},${r}`;
  const pkey = (panelIdx, q, r) => `${panelIdx}|${q},${r}`; // 持久集合用的 key

  function panelOfPoint(p, linkDefault, fallback) {
    return (p && typeof p.panelIdx === 'number') ? p.panelIdx
         : (typeof linkDefault === 'number' ? linkDefault : fallback);
  }

  //id / key 互转
  // node.id 形如 "panelIdx:q,r"；persistent 集合里的 key 形如 "panelIdx|q,r"
  function idToKey(id) {
    // 容错：若不含 ":" 则直接返回（不会被加入集合）
    if (typeof id !== 'string' || !id.includes(':')) return id;
    const [p, qr] = id.split(':');
    return `${p}|${qr}`;
  }
  function keyOf(panelIdx, q, r) {
    return `${panelIdx}|${q},${r}`;
  }
  function pointId(panelIdx, q, r) {
    return `${panelIdx}:${q},${r}`;
  }

  // —— 解析 path 上点的 panelIdx（和前文保持一致）——
  function resolvePanelIdxForPathPoint(p, link, i) {
    if (typeof p.panelIdx === 'number') return p.panelIdx;
    if (link?.type === 'flight') {
      if (i === 0 && typeof link.panelIdxFrom === 'number') return link.panelIdxFrom;
      if (i === (link.path?.length || 1) - 1 && typeof link.panelIdxTo === 'number') return link.panelIdxTo;
    }
    if (typeof link?.panelIdx === 'number') return link.panelIdx;
    return 0;
  }

  // —— 从当前 App._lastLinks 构图：有向出边 out（按 path 顺序），以及无向邻接 undirected ——
  // 仅保留“确实存在的 hex 节点”的边（避免脏数据）
  function buildAdjacency(App) {
    const out = new Map();         // id -> Set(nextId)  （有向：按 path[i] -> path[i+1]）
    const undirected = new Map();  // id -> Set(nbId)    （无向：相邻段两端互为邻居）

    const ensure = (m, id) => (m.has(id) ? m.get(id) : (m.set(id, new Set()), m.get(id)));

    // 当前存在的节点集合（用来过滤）
    const hasId = (id) => {
      const [panelStr, qr] = (id || '').split(':');
      const [qStr, rStr] = (qr || '').split(',');
      const panelIdx = +panelStr, q = +qStr, r = +rStr;
      const ok = Number.isFinite(panelIdx) && Number.isFinite(q) && Number.isFinite(r);
      if (!ok) return false;
      return !!App.hexMapsByPanel?.[panelIdx]?.get?.(`${q},${r}`);
    };

    for (const link of (App._lastLinks || [])) {
      const raw = Array.isArray(link.path) ? link.path : [];
      if (raw.length < 2) continue;

      // 将 path 规范成 id 列表
      const ids = raw.map((p, i) => {
        const panelIdx = resolvePanelIdxForPathPoint(p, link, i);
        return pointId(panelIdx, p.q, p.r);
      });

      for (let i = 0; i < ids.length - 1; i++) {
        const a = ids[i], b = ids[i + 1];
        if (!hasId(a) || !hasId(b)) continue;

        // 有向：a -> b
        ensure(out, a).add(b);

        // 无向邻接：a <-> b
        ensure(undirected, a).add(b);
        ensure(undirected, b).add(a);

        // 确保孤立端也被初始化（防后面访问 undefined）
        ensure(out, b);
        ensure(undirected, a);
        ensure(undirected, b);
      }
    }

    return { out, undirected };
  }

  function getConnectedHexKeys(panelIdx, q, r) {
    const out = new Set();
    const links = App._lastLinks || [];
    for (const link of links) {
      if (link.type !== 'road' && link.type !== 'river') continue;
      const defPanel = link.panelIdx;
      const pts = (link.path || []).filter(p => panelOfPoint(p, defPanel, panelIdx) === panelIdx);
      if (!pts.length) continue;
      const hasSelected = pts.some(p => p.q === q && p.r === r);
      if (!hasSelected) continue;
      pts.forEach(p => out.add(keyOf(p.q, p.r)));
    }
    return out;
  }

  // —— 新增：构建“无向邻接表”（以 panelIdx|q,r 为 key），用于连通分量 BFS —— //
  function buildUndirectedAdjacency() {
    const adj = new Map(); // key -> Set<key>

    const key = (panelIdx, q, r) => `${panelIdx}|${q},${r}`;
    const ensure = (k) => {
      if (!adj.has(k)) adj.set(k, new Set());
      return adj.get(k);
    };

    const resolvePanelIdx = (p, link, i) => {
      if (typeof p.panelIdx === 'number') return p.panelIdx;
      if (link.type === 'flight') {
        if (i === 0) {
          return (typeof link.panelIdxFrom === 'number')
            ? link.panelIdxFrom
            : (typeof link.panelIdx === 'number' ? link.panelIdx : 0);
        } else {
          return (typeof link.panelIdxTo === 'number')
            ? link.panelIdxTo
            : (typeof link.panelIdx === 'number' ? link.panelIdx : 0);
        }
      }
      return (typeof link.panelIdx === 'number') ? link.panelIdx : (p.panelIdx ?? 0);
    };

    for (const e of (App._lastLinks || [])) {
      const path = Array.isArray(e.path) ? e.path : [];
      if (path.length < 2) continue;

      // 解析每个点的 panelIdx
      const pts = path.map((p, i) => ({
        panelIdx: resolvePanelIdx(p, e, i),
        q: p.q, r: p.r
      }));

      // 连成无向边（两两相邻）
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


  // 根据一个已选中的点，把与它 flight 相连的另一端加入邻居集合（支持跨 panel）
  function addFlightNeighbors(panelIdx, q, r) {
    for (const link of App._lastLinks || []) {
      if (link.type !== 'flight') continue;
      const a = link.path?.[0];
      const b = link.path?.[link.path.length - 1];
      if (!a || !b) continue;

      // 解析两端的 panel（兼容 a/b 上带 panelIdx、以及 link.panelIdxFrom/To、或退化到 link.panelIdx）
      const aPanel = (typeof a.panelIdx === 'number')
        ? a.panelIdx
        : (typeof link.panelIdxFrom === 'number')
          ? link.panelIdxFrom
          : (typeof link.panelIdx === 'number' ? link.panelIdx : 0);

      const bPanel = (typeof b.panelIdx === 'number')
        ? b.panelIdx
        : (typeof link.panelIdxTo === 'number')
          ? link.panelIdxTo
          : (typeof link.panelIdx === 'number' ? link.panelIdx : 0);

      const isA = (a.q === q && a.r === r && aPanel === panelIdx);
      const isB = (b.q === q && b.r === r && bPanel === panelIdx);

      if (isA) {
        App.neighborKeySet.add(`${bPanel}|${b.q},${b.r}`);
      }
      if (isB) {
        App.neighborKeySet.add(`${aPanel}|${a.q},${a.r}`);
      }
    }
  }


  function getHexFillColor(d) {
    if (d.modality === 'text')  return App.config.hex.textFill;
    if (d.modality === 'image') return App.config.hex.imageFill;
    return App.config.background;
  }

  function hexPoints(radius) {
    const angle = Math.PI / 3;
    return d3.range(6).map(i => [radius * Math.cos(angle * i), radius * Math.sin(angle * i)]).concat([[radius, 0]]);
  }

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

  function pointInRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

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

  function setupInlineEditableTitle(el, {
    getInitial = () => el?.textContent?.trim() || '',
    placeholder = 'Untitled',
    onRename = async (newText) => {}
  } = {}) {
    if (!el) return;

    el.addEventListener('dblclick', () => {
      // 进入可编辑
      el.setAttribute('contenteditable', 'true');
      el.focus();

      // 全选当前文字
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);

      const finish = async (commit = true) => {
        el.removeAttribute('contenteditable');

        if (commit) {
          const txt = (el.textContent || '').trim() || placeholder;
          el.textContent = txt;
          try { await onRename(txt); } catch(e) { console.warn(e); }
        } else {
          // 取消编辑还原
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


  function safeNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function isFiniteTransform(t) {
    return t && Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.k);
  }


  /** ==================
   *  DOM 构建/子空间
   *  ================== */
 function createSubspaceElement(space, i) {
    const div = document.createElement('div');
    div.className = 'subspace';
    div.style.position = 'absolute';
    div.style.boxSizing = 'border-box';   // 防止宽高重复计算导致的像素漂移
    div.style.margin = '0';

    div.dataset.index = String(i);

    // 计算默认网格位置
    const offsetX = STYLE.SUBSPACE_MIN_W + STYLE.SUBSPACE_GAP;
    const offsetY = STYLE.SUBSPACE_MIN_H + STYLE.SUBSPACE_GAP;
    const defaultLeft = STYLE.SUBSPACE_DEFAULT_LEFT + offsetX * (i % 3);
    const defaultTop  = STYLE.SUBSPACE_DEFAULT_TOP  + offsetY * Math.floor(i / 3);

    // 读取持久化状态（若有）
    const st = App.panelStates[i] || {};
    const w = Math.max(STYLE.SUBSPACE_MIN_W, st.width  ?? STYLE.SUBSPACE_MIN_W);
    const h = Math.max(STYLE.SUBSPACE_MIN_H, st.height ?? STYLE.SUBSPACE_MIN_H);
    const l = Math.max(0, st.left ?? defaultLeft);
    const t = Math.max(0, st.top  ?? defaultTop);

    // 应用位置/尺寸
    div.style.left = l + 'px';
    div.style.top = t + 'px';
    div.style.width = w + 'px';
    div.style.height = h + 'px';
    div.style.resize = 'both';
    div.style.overflow = 'hidden';

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

    // 双击重命名（保持原逻辑）
    title.addEventListener('dblclick', (evt) => {
      evt.stopPropagation(); // 避免冒泡到空白双击逻辑
      const idx = Number(div.dataset.index || i);
      const placeholder = `Subspace ${idx + 1}`;

      // 进入编辑态：使用 plaintext-only 以匹配 RightPane 样式
      title.setAttribute('contenteditable', 'plaintext-only');
      title.focus();

      // 全选现有文本
      const range = document.createRange();
      range.selectNodeContents(title);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);

      const commit = async () => {
        // 读取并清理编辑态
        const newName = (title.textContent || '').trim() || placeholder;
        title.textContent = newName;
        title.removeAttribute('contenteditable');

        // 同步数据
        if (App.currentData?.subspaces?.[idx]) {
          App.currentData.subspaces[idx].subspaceName = newName;
        }
        if (typeof App.onSubspaceRename === 'function') {
          try { await App.onSubspaceRename(idx, newName); } catch (e) { console.warn(e); }
        }

        // 标题高度可能变化：更新容器高度扣减
        const th = title.offsetHeight || 0;
        const container = div.querySelector('.hex-container');
        if (container) container.style.height = `calc(100% - ${th}px)`;
      };

      const cancel = () => {
        title.removeAttribute('contenteditable');
        const old = App.currentData?.subspaces?.[idx]?.subspaceName || placeholder;
        title.textContent = old;

        // 同步一次容器高度
        const th = title.offsetHeight || 0;
        const container = div.querySelector('.hex-container');
        if (container) container.style.height = `calc(100% - ${th}px)`;
      };

      // 结束编辑：blur/Enter 提交，Escape 取消
      const onBlur = () => {
        title.removeEventListener('keydown', onKey);
        commit();
      };
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); title.removeEventListener('blur', onBlur); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); title.removeEventListener('blur', onBlur); cancel(); }
      };

      title.addEventListener('blur', onBlur, { once: true });
      title.addEventListener('keydown', onKey);
    });

    const container = document.createElement('div');
    container.className = 'hex-container';
    container.style.position = 'relative';
    container.style.width = '100%';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'hex-svg');
    container.appendChild(svg);

    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    overlay.setAttribute('class', 'overlay-svg');
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = App.config.road.zIndex;
    container.appendChild(overlay);

    const overlayD3 = d3.select(overlay);
    if (overlayD3.select('g').empty()) overlayD3.append('g');

    div.appendChild(container);
    App.playgroundEl.appendChild(div);

    // 现在节点已进 DOM，可以拿到标题真实高度，用它精准扣除
    const th = title.offsetHeight || 0;
    container.style.height = `calc(100% - ${th}px)`;

    App.subspaceSvgs.push(d3.select(svg));
    App.overlaySvgs.push(overlayD3);

    enableSubspaceDrag(div, i);
  }


  function renderPanels(subspaces) {

    Array.from(App.playgroundEl.querySelectorAll('.subspace')).forEach(el => el.remove());
    App.subspaceSvgs = [];
    App.overlaySvgs = [];
    App.hexMapsByPanel = [];
    App.allHexDataByPanel = [];
    
    subspaces.forEach((space, i) => createSubspaceElement(space, i));
  }

  /** =========
   * Hex 渲染
   * ========= */
  function renderHexGridFromData(panelIdx, space, hexRadius) {
    const svg = App.subspaceSvgs[panelIdx];
    const overlay = App.overlaySvgs[panelIdx];

    if (!svg || svg.empty()) return;           // 容错：SVG 不存在就跳过
    if (!overlay || overlay.empty()) return;

    // 初始尺寸：优先来自父div实际尺寸（已在 createSubspaceElement 根据缓存设置）
    const parent = svg.node().parentNode; // .hex-container
    const pcs = getComputedStyle(parent);
    // 尝试多种来源拿宽高；任何一步失败都用前一步兜底
    let width  = pcs ? safeNum(pcs.width)  : 0;
    let height = pcs ? safeNum(pcs.height) : 0;
    if (!width)  width  = safeNum(parent?.clientWidth,  svg.node().clientWidth || 0);
    if (!height) height = safeNum(parent?.clientHeight, svg.node().clientHeight || 0);
    if (!width || !height) { width = 1; height = 1; } // 最后一层兜底，避免 0/NaN

    svg.attr("width", width).attr("height", height);
    overlay.attr("width", width).attr("height", height);

    let container = svg.select("g");
    if (container.empty()) container = svg.append("g");
    let overlayG = overlay.select("g");
    if (overlayG.empty()) overlayG = overlay.append("g");

    const rawHexList = (space.hexList || []).map(h => {
      const x = (3/4) * 2 * hexRadius * h.q;
      const y = Math.sqrt(3) * hexRadius * (h.r + h.q / 2);
      return { ...h, rawX: x, rawY: y };
    });
    const xs = rawHexList.map(h => h.rawX), ys = rawHexList.map(h => h.rawY);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const hexList = rawHexList.map(h => ({
      ...h,
      x: h.rawX,
      y: h.rawY,
      panelIdx
    }));
    App.allHexDataByPanel[panelIdx] = hexList;

    // ---- 读取缓存 transform ----
    const savedZoom = App.panelStates[panelIdx]?.zoom;

    // 基于“数据中心点”算一个默认的居中 transform（只作为第一次渲染兜底）
    const defaultTransform =
      d3.zoomIdentity.translate(
        // 让数据中心点移动到容器中心：容器中心(宽/2, 高/2) - 数据中心(centerX, centerY)
        (width / 2) - centerX,
        (height / 2) - centerY
      ).scale(1);

    let lastTransform =
    savedZoom && isFiniteTransform(savedZoom)
      ? d3.zoomIdentity.translate(savedZoom.x, savedZoom.y).scale(savedZoom.k)
      : (isFiniteTransform(App.zoomStates[panelIdx]) ? App.zoomStates[panelIdx] : defaultTransform);
    if (!isFiniteTransform(lastTransform)) {
        lastTransform = defaultTransform; // 再兜底一次
    }

    // —— 如果既没有 savedZoom 也没有 runtime 的 zoom 状态，说明是第一次 ——
    // 立刻把 defaultTransform 持久化，这样以后任何重渲染都不会“重新算中心”
    if (!savedZoom && !App.zoomStates[panelIdx]) {
      App.panelStates[panelIdx] = {
        ...(App.panelStates[panelIdx] || {}),
        zoom: { k: 1, x: defaultTransform.x, y: defaultTransform.y }
      };
      App.zoomStates[panelIdx] = defaultTransform;
    }
    
    const zoom = d3.zoom()
      .scaleExtent([0.6, 2])
      .on("zoom", (event) => {
        const t = event?.transform;
        if (!isFiniteTransform(t)) return;               // ← 关键：丢弃非法事件
        container.attr("transform", t);
        overlayG.attr("transform", t);
        App.zoomStates[panelIdx] = t;

        // 同步持久化
        const z = { k: t.k, x: t.x, y: t.y };
        if (isFiniteTransform(z)) {
          App.panelStates[panelIdx] = { ...(App.panelStates[panelIdx] || {}), zoom: z };
        }

        if (App._lastLinks) {
          drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
        }
        updateHexStyles();
      });

    svg.on("dblclick.zoom", null).call(zoom);
    const applyTransform = (t) => {
      if (!isFiniteTransform(t)) return;
      container.attr("transform", t);
      overlayG.attr("transform", t);
      svg.call(zoom.transform, t);
    };

    if (isFiniteTransform(lastTransform)) {
      applyTransform(lastTransform);
    } else {
      // 有些情况下（容器刚插入/尚未布局），一帧后尺寸就稳定了
      requestAnimationFrame(() => applyTransform(defaultTransform));
    }

    // 绑定 hex
    const sel = container.selectAll("g.hex")
      .data(hexList, d => `${d.panelIdx}_${d.q}_${d.r}`)
      .join(
        enter => {
          const g = enter.append("g").attr("class", "hex");
          g.append("path")
            .attr("d", d3.line()(hexPoints(hexRadius)))
            .attr("fill", d => getHexFillColor(d))
            .attr("stroke", App.config.hex.borderColor)
            .attr("stroke-width", App.config.hex.borderWidth)
            .attr("fill-opacity", App.config.hex.fillOpacity);

          g.on("mouseover", (event, d) => {
              App.hoveredHex = { panelIdx, q: d.q, r: d.r };
              if (App.flightStart) App.flightHoverTarget = { panelIdx, q: d.q, r: d.r };
              updateHexStyles();
            })
          .on("mouseout", (event, d) => {
              if (App.hoveredHex &&
                  App.hoveredHex.panelIdx === panelIdx &&
                  App.hoveredHex.q === d.q && App.hoveredHex.r === d.r) {
                App.hoveredHex = null;
              }
              if (App.flightStart &&
                  App.flightHoverTarget &&
                  App.flightHoverTarget.panelIdx === panelIdx &&
                  App.flightHoverTarget.q === d.q &&
                  App.flightHoverTarget.r === d.r) {
                App.flightHoverTarget = null;
              }
              updateHexStyles();
            })
          .on("click", (event, d) => {
              event.preventDefault(); event.stopPropagation();
              if (App._clickTimer) clearTimeout(App._clickTimer);
              App._clickTimer = setTimeout(() => {
                handleSingleClick(panelIdx, d.q, d.r);
              }, STYLE.CLICK_DELAY);
            })
          .on("dblclick", (event, d) => {
              event.preventDefault(); event.stopPropagation();
              if (App._clickTimer) { clearTimeout(App._clickTimer); App._clickTimer = null; }
              // 把 event 一起传进去
              handleDoubleClick(panelIdx, d.q, d.r, event);
            });

          return g.attr("transform", d => `translate(${d.x},${d.y})`);
        },
        update => update.attr("transform", d => `translate(${d.x},${d.y})`),
        exit => exit.remove()
      );


    // 国家边界（按 hexList 绘）
    container.selectAll(".country-border").remove();
    (space.countries || []).forEach(country => {
      let hexListCountry = [];
      container.selectAll("g.hex").each(function(d) {
        if (country.hexes?.some(hx => hx.q === d.q && hx.r === d.r)) {
          hexListCountry.push({...d});
        }
      });
      if (hexListCountry.length > 0) {
        drawCountryBorder(hexListCountry, svg, App.config.hex.radius, App.config.countryBorder.color, App.config.countryBorder.width);
      }
    });

    // 构建 map
    const hexMap = new Map();
    hexList.forEach(d => hexMap.set(`${d.q},${d.r}`, d));
    App.hexMapsByPanel[panelIdx] = hexMap;

    // 初次渲染后统一更新样式（确保状态反映到 UI）
    updateHexStyles();
  }

  /** =========
   * 城市点用于别处（保留）
   * ========= */
  function renderCityCircles(cityHexSet, allHexDataByPanel, cityRadius) {
    App.overlaySvgs.forEach((overlaySvg, panelIdx) => {
      const g = overlaySvg.select("g");
      const cityHexes = allHexDataByPanel[panelIdx]?.filter(h => cityHexSet[`${panelIdx}_${h.q}_${h.r}`]) || [];
      const circles = g.selectAll("circle.city-circle").data(cityHexes, d => `${d.q},${d.r}`);
      circles.enter()
        .append("circle")
        .attr("class", "city-circle")
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("r", cityRadius)
        .attr("fill", App.config.city.fill)
        .attr("stroke", App.config.city.borderColor)
        .attr("stroke-width", App.config.city.borderWidth)
        .style("pointer-events", "auto");
      circles.attr("cx", d => d.x).attr("cy", d => d.y).attr("r", cityRadius);
      circles.exit().remove();
      g.selectAll("circle.city-circle").raise();
    });
  }

  /** =========
   * 航线与 overlay
   * ========= */
  function drawOverlayLinesFromLinks(links, allHexDataByPanel, hexMapsByPanel, showTempFlight=false) {
    App.overlaySvgs.forEach(overlaySvg => overlaySvg.select("g").selectAll("polyline, line, path").remove());
    d3.select(App.globalOverlayEl).selectAll("polyline, line, path").remove();

    links.forEach(link => {
      if (link.type === "flight") {
        const style = App.config.flight;
        const points = link.path.map((p, i) => {
          const panelIdx = p.panelIdx ?? (i === 0 ? link.panelIdxFrom : link.panelIdxTo) ?? link.panelIdx ?? 0;
          return getHexGlobalXY(panelIdx, p.q, p.r);
        }).filter(Boolean);

        const allRects = link.path.map((p, i) => {
          const panelIdx = p.panelIdx ?? (i === 0 ? link.panelIdxFrom : link.panelIdxTo) ?? link.panelIdx ?? 0;
          return getPanelRect(panelIdx);
        });
        const allInRect = points.every((pt, i) => pt && pointInRect(pt[0], pt[1], allRects[i]));
        if (!allInRect) return;

        if (points.length === 2) {
          const [p0, p1] = points;
          const dx = p1[0] - p0[0];
          const dy = p1[1] - p0[1];
          const mx = (p0[0] + p1[0]) / 2;
          const my = (p0[1] + p1[1]) / 2;
          const curveOffset = Math.sign(dx) * style.controlCurveRatio * Math.sqrt(dx*dx + dy*dy);
          const c1x = mx + curveOffset;
          const c1y = my - curveOffset;
          d3.select(App.globalOverlayEl).append("path")
            .attr("d", `M${p0[0]},${p0[1]} Q${c1x},${c1y} ${p1[0]},${p1[1]}`)
            .attr("stroke", style.color)
            .attr("stroke-width", style.width)
            .attr("stroke-opacity", style.opacity)
            .attr("fill", "none")
            .attr("stroke-dasharray", style.dash || null);
        }
      } else {
        const style = App.config[link.type] || App.config.road;
        const panelIdx = link.panelIdx ?? (link.path && link.path[0].panelIdx) ?? 0;
        const overlaySvg = App.overlaySvgs[panelIdx];
        const g = overlaySvg.select("g");
        const hexMap = App.hexMapsByPanel[panelIdx];
        const points = link.path.map(p => {
          const hex = hexMap && hexMap.get(`${p.q},${p.r}`);
          return hex ? [hex.x, hex.y] : null;
        }).filter(Boolean);
        if (points.length < 2) return;
        if (points.length === 2) {
          g.append("line")
            .attr("x1", points[0][0]).attr("y1", points[0][1])
            .attr("x2", points[1][0]).attr("y2", points[1][1])
            .attr("stroke", style.color).attr("stroke-width", style.width)
            .attr("stroke-opacity", style.opacity).attr("fill", "none")
            .attr("stroke-dasharray", style.dash || null);
        } else {
          g.append("polyline")
            .attr("points", points.map(p => p.join(",")).join(" "))
            .attr("stroke", style.color).attr("stroke-width", style.width)
            .attr("stroke-opacity", style.opacity).attr("fill", "none")
            .attr("stroke-dasharray", style.dash || null);
        }
      }
    });

    // 临时航线（起点已设后）
    if (showTempFlight && App.flightStart) {
      const a = App.flightStart;
      const p0 = getHexGlobalXY(a.panelIdx, a.q, a.r);
      const p1 = [App.currentMouse.x, App.currentMouse.y];
      if (p0 && p1) {
        const style = App.config.flight;
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
        const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
        const curveOffset = Math.sign(dx) * style.controlCurveRatio * Math.sqrt(dx*dx + dy*dy);
        const c1x = mx + curveOffset, c1y = my - curveOffset;
        d3.select(App.globalOverlayEl).append("path")
          .attr("d", `M${p0[0]},${p0[1]} Q${c1x},${c1y} ${p1[0]},${p1[1]}`)
          .attr("stroke", style.color)
          .attr("stroke-width", style.tempWidth)
          .attr("stroke-opacity", style.tempOpacity)
          .attr("fill", "none")
          .attr("stroke-dasharray", style.tempDash);
        }
      }
    }

    /** =========
     * 选中/高亮样式统一更新（核心）
     * ========= */
    function updateHexStyles() {
      // 1) 仅由 “持久选中” 计算邻居合集
      App.neighborKeySet.clear();
      for (const k of App.persistentHexKeys) {
        const [panelStr, qr] = k.split('|');
        const [qStr, rStr] = qr.split(',');
        const panelIdx = +panelStr, q = +qStr, r = +rStr;
        const ns = getConnectedHexKeys(panelIdx, q, r);
        ns.forEach(hk => App.neighborKeySet.add(`${panelIdx}|${hk}`));
        // flight 对端邻居（可能跨 panel）
        addFlightNeighbors(panelIdx, q, r);
      }
    
      // 2) 应用样式（保持你原来的优先级逻辑）
      App.subspaceSvgs.forEach((svg, panelIdx) => {
        svg.selectAll('g.hex').each(function(d) {
          const path = d3.select(this).select('path');
          let opacity = STYLE.OPACITY_DEFAULT;
    
          const isPersistent = App.persistentHexKeys.has(pkey(panelIdx, d.q, d.r));
          const isNeighbor   = App.neighborKeySet.has(pkey(panelIdx, d.q, d.r));
          const isHovered    =
            App.hoveredHex &&
            App.hoveredHex.panelIdx === panelIdx &&
            App.hoveredHex.q === d.q &&
            App.hoveredHex.r === d.r;
    
          const isFlightStart =
            App.flightStart &&
            App.flightStart.panelIdx === panelIdx &&
            App.flightStart.q === d.q &&
            App.flightStart.r === d.r;
    
          const isFlightHoverTarget =
            App.flightHoverTarget &&
            App.flightHoverTarget.panelIdx === panelIdx &&
            App.flightHoverTarget.q === d.q &&
            App.flightHoverTarget.r === d.r;
    
          if (isPersistent || isFlightStart || isFlightHoverTarget) {
            opacity = STYLE.OPACITY_HOVER;
          } else if (isHovered) {
            opacity = STYLE.OPACITY_HOVER;
          } else if (isNeighbor) {
            opacity = STYLE.OPACITY_NEIGHBOR;
          } else {
            opacity = STYLE.OPACITY_DEFAULT;
          }
    
          path.attr('fill-opacity', opacity);
        });
      });
    }
    

  // —— 生成保存/右侧用的快照 ——
  // 只用已“持久选中”的 hex（App.persistentHexKeys）做 nodes；
  // links 来自 App._lastLinks，但会把 panelIdx 解析正确。
  // —— 新的：基于当前“持久选中”的点，取到所有与之相连的路径点和对应连线 —— //
  function buildSelectionSnapshot() {
    // 选中种子集合（panelIdx|q,r）
    const selectedKeys = new Set(App.persistentHexKeys || []);

    // 如果什么都没选，也要返回一个空快照，避免报错
    if (!selectedKeys.size) {
      return { nodes: [], links: [] };
    }

    // 收集到的节点 key（包含选中 + 由连接扩展出来的）
    const nodeKeySet = new Set(selectedKeys);
    const linksOut = [];

    // 小工具：规范化一个点的 panelIdx（兼容 link 上的 panelIdxFrom/To 或 panelIdx）
    const resolvePanelIdx = (p, link, i) => {
      if (typeof p.panelIdx === 'number') return p.panelIdx;
      if (link.type === 'flight') {
        // flight 两端可在不同 panel
        if (i === 0) {
          return (typeof link.panelIdxFrom === 'number')
            ? link.panelIdxFrom
            : (typeof link.panelIdx === 'number' ? link.panelIdx : 0);
        } else {
          return (typeof link.panelIdxTo === 'number')
            ? link.panelIdxTo
            : (typeof link.panelIdx === 'number' ? link.panelIdx : 0);
        }
      }
      // road/river：通常整条线在同一 panel
      return (typeof link.panelIdx === 'number') ? link.panelIdx : (p.panelIdx ?? 0);
    };

    // 规范化 path（加上 panelIdx），并判断是否“与选中相连”
    const touchesSelection = (pts) =>
      pts.some(pt => selectedKeys.has(`${pt.panelIdx}|${pt.q},${pt.r}`));

    for (const e of App._lastLinks || []) {
      const rawPts = e.path || [];
      if (!rawPts.length) continue;

      // 解决每个点的 panelIdx
      const normPts = rawPts.map((p, i) => ({
        panelIdx: resolvePanelIdx(p, e, i),
        q: p.q, r: p.r
      }));

      // 如果这条连线任意一点与“选中集合”相连，则整条连线纳入
      if (touchesSelection(normPts)) {
        // 累计所有路径点到节点集合
        normPts.forEach(pt => nodeKeySet.add(`${pt.panelIdx}|${pt.q},${pt.r}`));

        // 链路对象：保留 type + 规范化后的 path（这样右侧需要画小预览也好处理）
        const a = normPts[0], b = normPts[normPts.length - 1];
        linksOut.push({
          id: e.id || `${a.panelIdx}:${a.q},${a.r}->${b.panelIdx}:${b.q},${b.r}`,
          type: e.type || 'road',
          path: normPts.map(pt => ({ panelIdx: pt.panelIdx, q: pt.q, r: pt.r }))
        });
      }
    }

    // 最终 nodes：把 nodeKeySet 里的每个点做成结构化节点，尽量带上 label/modality
    const nodes = [];
    for (const k of nodeKeySet) {
      const [pStr, qr] = k.split('|');
      const [qStr, rStr] = qr.split(',');
      const panelIdx = +pStr, q = +qStr, r = +rStr;
      const hex = App.hexMapsByPanel[panelIdx]?.get(`${q},${r}`);
      nodes.push({
        id: `${panelIdx}:${q},${r}`,
        panelIdx, q, r,
        label: hex?.label || `${q},${r}`,
        modality: hex?.modality || ''
      });
    }

    return { nodes, links: linksOut };
  }

  // —— 通用：从一组 "panelIdx|q,r" keys 生成快照 ——
  // 规则：nodes = 这些 key 对应的 hex；
  //       links = _lastLinks 中 “全部 path 点都在 keySet 内”的连线（避免引入外部点）
  function snapshotFromKeySet(keySet) {
    if (!keySet || keySet.size === 0) return { nodes: [], links: [] };

    // 1) nodes
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

    // 2) links：只保留 path 的每个点都在 keySet 内的连线
    const links = [];
    for (const e of (App._lastLinks || [])) {
      const rawPts = Array.isArray(e.path) ? e.path : [];
      if (rawPts.length < 2) continue;

      const normPts = rawPts.map((p, i) => {
        // 统一解析 panelIdx
        let panelIdx = p.panelIdx;
        if (typeof panelIdx !== 'number') {
          if (e.type === 'flight') {
            panelIdx = (i === 0 && typeof e.panelIdxFrom === 'number') ? e.panelIdxFrom
                    : (i === rawPts.length - 1 && typeof e.panelIdxTo === 'number') ? e.panelIdxTo
                    : (typeof e.panelIdx === 'number' ? e.panelIdx : 0);
          } else {
            panelIdx = (typeof e.panelIdx === 'number') ? e.panelIdx : 0;
          }
        }
        return { panelIdx, q: p.q, r: p.r };
      });

      const allInside = normPts.every(pt => keySet.has(`${pt.panelIdx}|${pt.q},${pt.r}`));
      if (!allInside) continue;

      const a = normPts[0], b = normPts[normPts.length - 1];
      links.push({
        id: e.id || `${a.panelIdx}:${a.q},${a.r}->${b.panelIdx}:${b.q},${b.r}`,
        type: e.type || 'road',
        path: normPts.map(pt => ({ panelIdx: pt.panelIdx, q: pt.q, r: pt.r }))
      });
    }

    return { nodes, links };
  }


  // —— 基于“当前选中点”的一跳筛选：返回这些点 + 与它们直接相连的所有连线（road/river/flight）——
  function buildOneHopSnapshotFromSeeds() {
    // 1) 选种子：优先用持久集合；为空就用当前单选
    const seedSet = new Set(App.persistentHexKeys);
    if (seedSet.size === 0 && App.selectedHex) {
      seedSet.add(`${App.selectedHex.panelIdx}|${App.selectedHex.q},${App.selectedHex.r}`);
    }
    if (seedSet.size === 0) {
      // 没选中任何点 -> 返回空
      return { nodes: [], links: [] };
    }

    // 工具：把 (panelIdx,q,r) 变成和 seedSet 一致的 key
    const kOf = (panelIdx, q, r) => `${panelIdx}|${q},${r}`;
    const addIfHex = (accSet, panelIdx, q, r) => {
      if (typeof panelIdx === 'number' && Number.isFinite(q) && Number.isFinite(r)) {
        accSet.add(kOf(panelIdx, q, r));
      }
    };

    // 2) 扫描所有连线，挑出“与任一 seed 同在一条 path 上”的连线
    const pickedLinks = [];
    const neighborKeySet = new Set(); // 与种子直接相连的一跳点（包含种子本身）

    for (const link of (App._lastLinks || [])) {
      const copy = JSON.parse(JSON.stringify(link)); // 深拷贝一份作为输出

      // 把 path 里所有点的 panelIdx 解析到位，方便判断
      const pathPoints = (copy.path || []).map((p, i) => {
        const panelIdx =
          (typeof p.panelIdx === 'number') ? p.panelIdx
            : (i === 0 && typeof copy.panelIdxFrom === 'number') ? copy.panelIdxFrom
            : (i === copy.path.length - 1 && typeof copy.panelIdxTo === 'number') ? copy.panelIdxTo
            : (typeof copy.panelIdx === 'number') ? copy.panelIdx
            : 0;
        return { panelIdx, q: p.q, r: p.r };
      });

      // 这条连线的 path 是否包含 seed？
      const touchesSeed = pathPoints.some(pt => seedSet.has(kOf(pt.panelIdx, pt.q, pt.r)));
      if (!touchesSeed) continue; // 严格一跳：仅保留包含种子的连线

      // 收集：这条连线上的所有端点 + 种子，形成“一跳范围内”的节点集合
      pathPoints.forEach(pt => addIfHex(neighborKeySet, pt.panelIdx, pt.q, pt.r));

      pickedLinks.push(copy); // 完整连线对象
    }

    // 3) 生成 nodes：只取“一跳范围内”的点（从 hexMaps 拿 label/modality）
    const nodes = [];
    for (const key of neighborKeySet) {
      const [pStr, qr] = key.split('|');
      const [qStr, rStr] = qr.split(',');
      const panelIdx = +pStr, q = +qStr, r = +rStr;
      const hex = App.hexMapsByPanel[panelIdx]?.get(`${q},${r}`);
      if (!hex) continue;
      nodes.push({
        id: `${panelIdx}:${q},${r}`,
        label: hex.label || `${q},${r}`,
        modality: hex.modality || '',
        panelIdx, q, r
      });
    }

    // 4) 返回“具体的连线对象 + 一跳内节点”
    return { nodes, links: pickedLinks };
  }


  /** =========
   * 单/双击处理
   * ========= */
  function handleSingleClick(panelIdx, q, r) {
    const k = pkey(panelIdx, q, r);
  
    // 已高亮：只移除此点
    if (App.persistentHexKeys.has(k)) {
      App.persistentHexKeys.delete(k);
      if (App.selectedHex &&
          App.selectedHex.panelIdx === panelIdx &&
          App.selectedHex.q === q &&
          App.selectedHex.r === r) {
        App.selectedHex = null;
      }
      updateHexStyles();
      publishToStepAnalysis();
      return;
    }
  
    // 未高亮：把它所在的“无向连通分量”全部加入
    const adj = buildUndirectedAdjacency();
    const visited = new Set();
    const qBFS = [k];
    visited.add(k);
  
    while (qBFS.length) {
      const cur = qBFS.shift();
      const nbs = adj.get(cur) || new Set();
      for (const nb of nbs) {
        if (!visited.has(nb)) {
          visited.add(nb);
          qBFS.push(nb);
        }
      }
    }
  
    // 把这个分量的所有点都点亮
    for (const kk of visited) App.persistentHexKeys.add(kk);
  
    // 记一下最近点击点（可选）
    App.selectedHex = { panelIdx, q, r };
  
    updateHexStyles();
    publishToStepAnalysis();
  }
  

  function handleDoubleClick(panelIdx, q, r, event) {
    const here = { panelIdx, q, r };

    if (!App.flightStart) {
      App.flightStart = here;
      // 立即更新鼠标坐标，避免临时线从 (0,0) 开始
      const rect = App.playgroundEl.getBoundingClientRect();
      App.currentMouse.x = event.clientX - rect.left;
      App.currentMouse.y = event.clientY - rect.top;

      // 起点本身也加入“持久高亮”
      App.persistentHexKeys.add(pkey(panelIdx, q, r));
      updateHexStyles();

      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, true);
      publishToStepAnalysis();
      return;
    }

    const same = App.flightStart.panelIdx === panelIdx &&
                App.flightStart.q === q &&
                App.flightStart.r === r;

    if (same) {
      App.flightStart = null;
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
      updateHexStyles();
      publishToStepAnalysis();
      return;
    }

    // 建立连线
    addCustomFlightLink(App.flightStart, here);

    // 两端都加入“持久高亮”
    App.persistentHexKeys.add(pkey(App.flightStart.panelIdx, App.flightStart.q, App.flightStart.r));
    App.persistentHexKeys.add(pkey(panelIdx, q, r));

    App.flightStart = null;
    drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
    updateHexStyles();

    publishToStepAnalysis(); 

  }


  function addCustomFlightLink(a, b) {
    const flight = {
      type: "flight",
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
    // 画永久航线
    drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
    publishToStepAnalysis(); 

  }

  /** =========
   * 响应选择交互
   * ========= */
  function publishToStepAnalysis() {
    App._lastSnapshot = snapshotFromKeySet(App.persistentHexKeys || new Set());
  }

  /** =========
   * 版式辅助
   * ========= */
  function drawCountryBorder(hexList, svg, hexRadius, color, strokeWidth) {
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
    const container = svg.select("g");
    Object.values(uniq).forEach(([a,b]) => {
      container.append("line")
        .attr("class", "country-border")
        .attr("x1", a[0]).attr("y1", a[1])
        .attr("x2", b[0]).attr("y2", b[1])
        .attr("stroke", color)
        .attr("stroke-width", strokeWidth)
        .attr("pointer-events", "none");
    });
  }

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
      const left = parseFloat(subspaceDiv.style.left || '0'); // 改
      const top  = parseFloat(subspaceDiv.style.top  || '0'); // 改
      App.panelStates[idx] = { ...(App.panelStates[idx] || {}), left, top }; // <—— 持久化位置
    };

    title.addEventListener('mousedown', (e) => {

      // 如果是双击（e.detail===2），或标题处于可编辑态，直接跳过拖拽
      if (e.detail === 2) return;
      if (title.isContentEditable) return;
      isDragging = true;
      startX = e.clientX; startY = e.clientY;
      origLeft = parseFloat(subspaceDiv.style.left || '0');  // 改
      origTop  = parseFloat(subspaceDiv.style.top  || '0');  // 改
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    cleanupFns.push(() => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    });
  }


  function observePanelResize() {
    App.playgroundEl.querySelectorAll('.subspace').forEach((subspaceDiv) => {
      if (!subspaceDiv._resizeObserver) {
        const ro = new ResizeObserver(() => {
        const idx = Number(subspaceDiv.dataset.index ?? -1);
        const cs = getComputedStyle(subspaceDiv);
        const w = parseFloat(cs.width);
        const h = parseFloat(cs.height);
        if (idx >= 0) {
          App.panelStates[idx] = { ...(App.panelStates[idx] || {}), width: w, height: h };
        }

        const container = subspaceDiv.querySelector('.hex-container');
        const title = subspaceDiv.querySelector('.subspace-title');
        const th = title ? title.offsetHeight : 0;
        const svg = subspaceDiv.querySelector('svg.hex-svg');
        const overlay = subspaceDiv.querySelector('svg.overlay-svg');
        const ch = Math.max(0, h - th);   // 用标题像素扣减后的内容高度
        if (container) container.style.height = `calc(100% - ${th}px)`;

        if (svg)     { svg.setAttribute('width',  w); svg.setAttribute('height', ch); }
        if (overlay) { overlay.setAttribute('width', w); overlay.setAttribute('height', ch); }

        drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
        updateHexStyles();
      });
        subspaceDiv._resizeObserver = ro;
        ro.observe(subspaceDiv);
        cleanupFns.push(() => ro.disconnect());
      }
    });
  }


  /** =========
   * 初始化与全局事件
   * ========= */
  function renderSemanticMapFromData(data) {
    App.currentData = data;
    App._lastLinks = data.links || [];
    renderPanels(data.subspaces || []);
    (data.subspaces || []).forEach((space, i) => renderHexGridFromData(i, space, App.config.hex.radius));
    drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
    observePanelResize();
    updateHexStyles();
    publishToStepAnalysis();

    const resizeHandler = () => {
      (data.subspaces || []).forEach((space, i) => renderHexGridFromData(i, space, App.config.hex.radius));
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
      updateHexStyles();
      App.globalOverlayEl.setAttribute('width', App.playgroundEl.clientWidth);
      App.globalOverlayEl.setAttribute('height', App.playgroundEl.clientHeight);
    };
    window.addEventListener("resize", resizeHandler);
    cleanupFns.push(() => window.removeEventListener("resize", resizeHandler));

    const ro = new ResizeObserver(() => {
      App.globalOverlayEl.setAttribute('width', App.playgroundEl.clientWidth);
      App.globalOverlayEl.setAttribute('height', App.playgroundEl.clientHeight);
    });
    ro.observe(App.playgroundEl);
    cleanupFns.push(() => ro.disconnect());
  }

  // 鼠标移动：若已设起点，画临时航线；并尝试用 hover 目标强化高亮
  const onMouseMoveGlobal = (event) => {
    if (App.flightStart) {
      const rect = App.playgroundEl.getBoundingClientRect();
      App.currentMouse.x = event.clientX - rect.left;
      App.currentMouse.y = event.clientY - rect.top;
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, true);
      updateHexStyles();
    }
  };
  document.addEventListener("mousemove", onMouseMoveGlobal);
  cleanupFns.push(() => document.removeEventListener("mousemove", onMouseMoveGlobal));

  // 点击空白：取消选中；双击空白：取消起点
  const onBlankClick = (e) => {
    if (e.target === App.playgroundEl) {
      App.selectedHex = null;
      App.neighborKeySet.clear();
      updateHexStyles();
      publishToStepAnalysis();
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

  // ====== 初始化：用外部传入数据 ======
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
        App.currentData.title = newText;            // 本地状态同步
        if (typeof App.onMainTitleRename === 'function') {
          await App.onMainTitleRename(newText);     // 对外回调（交给上层保存）
        }
      }
    });
  }

  // 初始同步一次全局 overlay 尺寸（防 0 宽高）
  App.globalOverlayEl.setAttribute('width', App.playgroundEl.clientWidth);
  App.globalOverlayEl.setAttribute('height', App.playgroundEl.clientHeight);

  /** =========
   * 删除子空间（保持索引与连线一致）
   * ========= */
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

  /** =========
   * 对外 API
   * ========= */
  const controller = {
    cleanup() {
      cleanupFns.forEach(fn => fn && fn());
      d3.select(App.globalOverlayEl).selectAll('*').remove();
      App.playgroundEl.querySelectorAll('.subspace').forEach(n => n.remove());
    },
    addSubspace(space = {}) {
      if (!App.currentData) App.currentData = { subspaces: [], links: [] };
      const newIndex = App.currentData.subspaces.length;

      // ---- 新增：为新面板初始化状态，占位 ----
      if (!Array.isArray(App.panelStates)) App.panelStates = [];
      App.panelStates.push({}); // 允许之后由拖拽/缩放/resize 写入

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
      // 直接使用当前“持久高亮集合”生成快照
      return snapshotFromKeySet(App.persistentHexKeys || new Set());
    },
    

  };

  return controller;
}


export function destroySemanticMap(cleanup) {
  if (typeof cleanup === 'function') cleanup();
}
