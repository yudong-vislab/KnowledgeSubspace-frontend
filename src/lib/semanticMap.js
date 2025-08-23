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
  OPACITY_PREVIEW: 0.6,      // 预览（待选）态透明度
  HATCH_ID: 'preview-hatch', // 预览斜线填充的 <pattern> id

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
  
   // --- preview 透明度 ---
  OPACITY_PREVIEW_CENTER: 0.85,   // 鼠标所在 hex（中心）
  OPACITY_PREVIEW_NEIGHBOR: 0.7,  // 与中心点“有关系”的预览邻居

  // --- 斜线阴影样式 ---
  HATCH_SPACING: 5,               // 斜线间距（px）
  HATCH_STROKE: '#000',           // 斜线颜色（可依据主题调）
  HATCH_STROKE_WIDTH: 0.8,          // 斜线粗细
  HATCH_OPACITY: 0.6,            // 斜线透明度
  HATCH_ANGLE: 45,                // 斜线角度（度）

};

// src/lib/semanticMap.js（在 STYLE 下方添加）
const LAYOUT = {
  TARGET_COLS: 3,          // 目标列数（默认 3）
  MAX_COLS: 5,             // 大屏最多 4 列（可按需改）
  MIN_COLS: 1,
  GAP: 20,                 // 卡片间距，沿用你已有的 SUBSPACE_GAP 也可
  PAD_H: 12,               // playground 水平内边距
  ASPECT: 0.72,            // 高/宽，决定子空间纵横比（可调 0.7~0.8）
  MIN_W: STYLE.SUBSPACE_MIN_W,
  MIN_H: STYLE.SUBSPACE_MIN_H,
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
    highlightedHexKeys: new Set(),  // ★ NEW：仅用于 hover 预览
    _clickTimer: null,
    _awaitingSingle: false,   // ★ NEW：是否在等待触发单击处理
    _lastClickAt: 0,          // ★ NEW：最近一次 click 的时间戳（非必须，但留作需要）
    insertMode: null, 
    uiPref: {
      route: false,          // 按钮想保持“Route Select 绿色”
      connectArmed: false,   // 按钮想保持“Connect 黄色（armed）”
    },
    //程序性布局/尺寸调整时，静默 RO 标记
    _squelchResize: false,
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

  // 在指定 svg 里确保存在一个用于“预览态”的斜线填充 pattern
  function ensureHatchPattern(svgSel) {
    if (!svgSel || svgSel.empty && svgSel.empty()) return;
    const defs = svgSel.select('defs').empty() ? svgSel.append('defs') : svgSel.select('defs');
    if (defs.select(`#${STYLE.HATCH_ID}`).empty()) {
      const pat = defs.append('pattern')
        .attr('id', STYLE.HATCH_ID)
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 6).attr('height', 6)
        .attr('patternTransform', 'rotate(45)');
      pat.append('line')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', 0).attr('y2', 6)
        .attr('stroke', '#444')        // 阴影线的颜色（可按需调整）
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.6);  // 线条稍微淡一些
    }
  }

  const safeNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  function isConnectActive() {
    return !!(App.insertMode || App.flightStart);
  }
  function isConnectArmedNow(withCtrl, withShift) {
    // 只要“键盘 Ctrl+Shift” 或 “按钮黄灯 connectArmed”为真，即判定为 armed
    return (!!withCtrl && !!withShift) || App.uiPref.connectArmed;
  }

  // ★ 新增：Route 模式是否开启（键盘 Ctrl/⌘ 或 按钮 Route 绿灯）
  function isRouteMode(withCtrlLike) {
    return !!withCtrlLike || App.uiPref.route;
  }

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

    // 为每个 panel 的 <svg> 确保一个斜线填充 pattern
    function ensureHatchDefs(svgSel, panelIdx) {
      let defs = svgSel.select('defs');
      if (defs.empty()) defs = svgSel.append('defs');

      const pid = `hex-hatch-${panelIdx}`;
      let pat = defs.select(`#${pid}`);
      if (pat.empty()) {
        pat = defs.append('pattern')
          .attr('id', pid)
          .attr('patternUnits', 'userSpaceOnUse')
          .attr('width', STYLE.HATCH_SPACING)
          .attr('height', STYLE.HATCH_SPACING)
          .attr('patternTransform', `rotate(${STYLE.HATCH_ANGLE})`);

        // 只画线，不画背景；“空白”区域透明 → 下方的底色可见
        pat.append('line')
          .attr('x1', 0).attr('y1', 0)
          .attr('x2', 0).attr('y2', STYLE.HATCH_SPACING)
          .attr('stroke', STYLE.HATCH_STROKE)
          .attr('stroke-width', STYLE.HATCH_STROKE_WIDTH)
          .attr('opacity', STYLE.HATCH_OPACITY);
      }
      return `url(#${pid})`;
    }


  // === 坐标/变换工具：把 axial(0,0) 精准放到容器中心 =================
  function axialToXY(q, r, radius = App.config.hex.radius) {
    // 平顶六边形（flat-top）轴坐标 → 像素
    // x = 1.5R * q,  y = sqrt(3)R * (r + q/2)
    return [1.5 * radius * q, Math.sqrt(3) * radius * (r + q / 2)];
  }

  // 从当前已选节点集合（persistentHexKeys）推导出涉及到的整条线路，灌入 selectedRouteIds
  function seedSelectedRoutesFromPersistent() {
    if (!App.persistentHexKeys || App.persistentHexKeys.size === 0) return false;
    if (App.selectedRouteIds && App.selectedRouteIds.size > 0) return false;

    let added = false;
    (App._lastLinks || []).forEach(link => {
      if (!isSelectableRoute(link)) return;
      const path = Array.isArray(link.path) ? link.path : [];
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        const pIdx = resolvePanelIdxForPathPoint(p, link, i);
        const key = `${pIdx}|${p.q},${p.r}`;
        if (App.persistentHexKeys.has(key)) {
          App.selectedRouteIds.add(linkKey(link));
          added = true;
          break;
        }
      }
    });

    if (added) {
      // 用路线+排除点重算一次持久选集，保证后续操作都在“路线视角”上进行
      recomputePersistentFromRoutes();
    }
    return added;
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

  function computeColsAndItemSize(containerW) {
    const pad = (LAYOUT.PAD_H || 0) * 2;
    const usable = Math.max(0, containerW - pad);
    // 基于最小宽度+间距估算最大可放列数
    const maxByWidth = Math.max(
      LAYOUT.MIN_COLS,
      Math.min(
        LAYOUT.MAX_COLS,
        Math.floor((usable + LAYOUT.GAP) / (LAYOUT.MIN_W + LAYOUT.GAP))
      )
    );
    const cols = Math.min(LAYOUT.TARGET_COLS, Math.max(LAYOUT.MIN_COLS, maxByWidth));
    // 计算卡片宽度（夹在 MIN_W 与平均可用宽度之间）
    const itemW = Math.max(
      LAYOUT.MIN_W,
      Math.floor((usable - (cols - 1) * LAYOUT.GAP) / cols)
    );
    const itemH = Math.max(LAYOUT.MIN_H, Math.floor(itemW * LAYOUT.ASPECT));
    const totalW = cols * itemW + (cols - 1) * LAYOUT.GAP;
    const leftPad = Math.max(LAYOUT.PAD_H, Math.floor((containerW - totalW) / 2)); // 居中
    return { cols, itemW, itemH, leftPad };
  }

  function applyResponsiveLayout(force = false) {
    if (!App.playgroundEl) return;

    // 找到滚动容器并保存滚动位置
    const scroller = App.playgroundEl.closest('.mv-scroller') || App.playgroundEl.parentElement;
    const prevTop  = scroller ? scroller.scrollTop  : 0;
    const prevLeft = scroller ? scroller.scrollLeft : 0;

    const containerW = App.playgroundEl.clientWidth || 0;
    if (!containerW) return;

    const { cols, itemW, itemH, leftPad } = computeColsAndItemSize(containerW);
    const subspaces = Array.from(App.playgroundEl.querySelectorAll('.subspace'));

    // 程序性布局：屏蔽 RO 的“用户调整”标记
    App._squelchResize = true;

    subspaces.forEach((div, i) => {
      const st = App.panelStates[i] || {};
      const moved   = !!st.userMoved;
      const resized = !!st.userResized;

      // 非 force 模式，尊重用户拖拽/手动改尺寸过的卡片
      if (!force && (moved || resized)) return;

      const row = Math.floor(i / cols);
      const col = i % cols;
      const left = leftPad + col * (itemW + LAYOUT.GAP);
      const top  = STYLE.SUBSPACE_DEFAULT_TOP + row * (itemH + LAYOUT.GAP);

      Object.assign(div.style, {
        left: `${left}px`,
        top:  `${top}px`,
        width: `${itemW}px`,
        height:`${itemH}px`,
      });

      // 同步状态；force 时顺便清掉用户标记（使后续响应式还能继续生效）
      App.panelStates[i] = {
        ...(st || {}),
        left, top, width: itemW, height: itemH,
        ...(force ? { userMoved: false, userResized: false } : {})
      };

      syncContainerHeight(div);
    });

    // 估算整体高度，更新全局 overlay 尺寸
    const rows = Math.ceil(subspaces.length / cols);
    const approxHeight = STYLE.SUBSPACE_DEFAULT_TOP + rows * (itemH + LAYOUT.GAP) + 40;
    App.globalOverlayEl.setAttribute('width', App.playgroundEl.clientWidth);
    App.globalOverlayEl.setAttribute('height', Math.max(approxHeight, App.playgroundEl.clientHeight));

    // 重画连线与透明度
    drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
    updateHexStyles();

    // 释放静默标记并还原滚动位置
    requestAnimationFrame(() => {
      App._squelchResize = false;
      if (scroller) scroller.scrollTo({ top: prevTop, left: prevLeft, behavior: 'auto' });
    });
  }


  // —— Mode UI：按钮状态（绿色=active，黄色=armed），无 HUD/Chip —— //
  const ModeUI = (() => {
    // 放在 ModeUI IIFE 里
    const TIPS = {
      select:       'Select connected region',
      routeIdle:    'Select an entire route',
      routeActive:  'Route mode (click a node to pick whole line)',
      connIdle:     'Insert custom segment',
      connArmed:    'Armed: click a route node to start inserting',
      connActive:   'Insert mode: Shift-click to add; Ctrl+Shift endpoint to finish (Esc cancel, Enter commit)',
    };


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

    // —— NEW：强制默认 = Group Select（无修饰键、无路由/连线偏好） —— //
    function forceGroupDefault() {
      App.uiPref.route = false;
      App.uiPref.connectArmed = false;
      App.insertMode = null;
      App.flightStart = null;
      App.modKeys = { ctrl:false, meta:false, shift:false };
      // 显示：Group 按钮绿；行为：单击走 Group 选择
      computeAndApply({ ctrl:false, meta:false, shift:false });
    }


    // —— 预览工具：根据当前模式，计算鼠标悬停点应该高亮的 key 集 —— //
    function computeHoverPreview(panelIdx, q, r, { withCtrl=false, withShift=false } = {}) {
      const ctrlLike   = !!withCtrl;
      const armedNow   = isConnectArmedNow(withCtrl, withShift);   // 键盘(Ctrl+Shift) 或 按钮黄灯
      const routeMode  = isRouteMode(ctrlLike);                    // 键盘(Ctrl/⌘) 或 按钮 Route 绿灯

      const result = new Set();

      // —— Connect Active（已进入插入）优先 —— //
      if (App.insertMode) {
        // 尚未选锚点：提示“可作为锚点”的整条路线
        if (App.insertMode.awaitingAnchor) {
          (App._lastLinks || []).forEach(link => {
            if (!isSelectableRoute(link)) return;
            if (linkContainsNode(link, panelIdx, q, r)) {
              (link.path||[]).forEach((p,i) => {
                const pIdx = resolvePanelIdxForPathPoint(p, link, i);
                result.add(pkey(pIdx, p.q, p.r));
              });
            }
          });
          return result;
        }

        // 已有锚点：高亮当前 route 全路径；并依据 armed/端点给出暗示
        const link = findLinkById(App.insertMode.routeId);
        if (link && Array.isArray(link.path)) {
          link.path.forEach((p,i) => {
            const pIdx = resolvePanelIdxForPathPoint(p, link, i);
            result.add(pkey(pIdx, p.q, p.r));
          });

          const iIn = indexOfPointInLink(link, panelIdx, q, r);
          if (iIn >= 0) {
            const isEnd = (iIn === 0 || iIn === link.path.length - 1);
            if (isEnd && (armedNow || (withCtrl && withShift))) {
              const mate = findEndpointMate(panelIdx, q, r);
              if (mate.found) result.add(mate.mateKey);
            } else {
              const aIdx = App.insertMode.anchorIndex;
              if (aIdx >= 0) {
                const anchor = link.path[aIdx];
                const pIdxA  = resolvePanelIdxForPathPoint(anchor, link, aIdx);
                starKeys(pIdxA, anchor.q, anchor.r).forEach(k => result.add(k));
              }
              starKeys(panelIdx, q, r).forEach(k => result.add(k));
            }
          }
        }
        return result;
      }

      // —— Connect Armed（黄灯但未进入 active） —— //
      if (armedNow && !isConnectActive()) {
        (App._lastLinks || []).forEach(link => {
          if (!isSelectableRoute(link)) return;
          if (linkContainsNode(link, panelIdx, q, r)) {
            (link.path||[]).forEach((p,i) => {
              const pIdx = resolvePanelIdxForPathPoint(p, link, i);
              result.add(pkey(pIdx, p.q, p.r));
            });
          }
        });
        return result;
      }

      // —— Route 模式 —— //
      if (routeMode) {
        // 若是从 Group 模式切过来且还没选线路，把现有选中的节点映射成整条线路
        seedSelectedRoutesFromPersistent();
        let added = false;
        (App._lastLinks || []).forEach(link => {
          if (!isSelectableRoute(link)) return;
          if (isStartOfLink(link, panelIdx, q, r)) {
            (link.path||[]).forEach((p,i) => {
              const pIdx = resolvePanelIdxForPathPoint(p, link, i);
              result.add(pkey(pIdx, p.q, p.r));
            });
            added = true;
          }
        });
        if (!added) {
          (App._lastLinks || []).forEach(link => {
            if (!isSelectableRoute(link)) return;
            if (linkContainsNode(link, panelIdx, q, r)) {
              (link.path||[]).forEach((p,i) => {
                const pIdx = resolvePanelIdxForPathPoint(p, link, i);
                result.add(pkey(pIdx, p.q, p.r));
              });
            }
          });
        }
        return result;
      }

      // —— Group（默认）：整条连通分量 —— //
      getComponentKeysFrom(buildUndirectedAdjacency(), pkey(panelIdx, q, r))
        .forEach(k => result.add(k));

      return result;
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

      // 默认 tooltip
      btnSel  && (btnSel.title  = TIPS.select);
      btnRoute&& (btnRoute.title= TIPS.routeIdle);
      btnConn && (btnConn.title = TIPS.connIdle);

      if (connectActive) {
        btnConn?.classList.add('is-active');    // 绿
        if (btnConn) btnConn.title = TIPS.connActive;
        return;
      }
      if (connectArmed) {
        btnConn?.classList.add('is-armed');     // 黄
        if (btnConn) btnConn.title = TIPS.connArmed;
        return;
      }
      if (routeActive) {
        btnRoute?.classList.add('is-active');   // 绿
        if (btnRoute) btnRoute.title = TIPS.routeActive;
        return;
      }
      btnSel?.classList.add('is-active');       // 绿（默认）
    }

    /**
     * computeAndApply 从“键盘/应用状态”推导视觉态：
     *  - armed：CtrlLike + Shift（且没进入 active）
     *  - active：insertMode 存在 或 flightStart 存在
     *  - route：CtrlLike（且不 armed/active）
     */
    function computeAndApply(overrides = null) {
      // 键盘态（优先读 overrides，否则读 App.modKeys）
      const { ctrl, meta, shift } = overrides || App.modKeys;
      const ctrlLike = !!(ctrl || meta);

      // 事实 active：插入模式 or 航线选择进行中
      const connectActive = !!(App.insertMode || App.flightStart);

      // 允许“按钮黄灯”（armed）在没有 Shift 的情况下保持黄色
      const connectArmed = !connectActive && ( (ctrlLike && !!shift) || App.uiPref.connectArmed );

      // 允许“按钮绿灯 Route”在没有 Ctrl 的情况下保持绿色
      const routeActive  = !connectActive && !connectArmed && ( ctrlLike || App.uiPref.route );

      setVisualState({ connectActive, connectArmed, routeActive });

      // ★ 模式视觉态变化后，如有悬停，刷新一次预览
      if (App.hoveredHex) {
        const { panelIdx, q, r } = App.hoveredHex;
        const ctrlLike = overrides ? !!(overrides.ctrl || overrides.meta) : !!(App.modKeys.ctrl || App.modKeys.meta);
        const shift    = overrides ? !!overrides.shift : !!App.modKeys.shift;
        App.highlightedHexKeys = ModeUI.computeHoverPreview(panelIdx, q, r, { withCtrl: ctrlLike, withShift: shift });
        updateHexStyles();
      }

    }

    // 鼠标状态
    function wireButtons() {
      if (btnSel) {
        btnSel.addEventListener('click', () => {
          forceGroupDefault();
        });
      }
      if (btnRoute) {
        btnRoute.addEventListener('click', () => {
          //若 Connect 正在 active（绿灯），先退出（等价 Esc）
          if (App.insertMode) {
            endInsertMode(false); // 取消插入，回落
          }
          if (App.flightStart) {
            App.flightStart = null; // 取消航线起点
            drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
            updateHexStyles();
            publishToStepAnalysis();
          }
          // 点 Route：关掉 Connect 黄灯，点亮 Route 绿灯
          App.uiPref.connectArmed = false;
          App.uiPref.route = true;
          seedSelectedRoutesFromPersistent();
          computeAndApply();
        });
      }

      if (btnConn) {
        btnConn.addEventListener('click', () => {
          const active = isConnectActive();
          const armed  = App.uiPref.connectArmed;

          if (!armed && !active) {
            // ① 空 → 黄（armed）
            App.uiPref.connectArmed = true;
            App.uiPref.route = false;        // 黄灯时不和 Route 抢态
            computeAndApply();
            return;
          }

          if (armed && !active) {
            // ② 黄 → 绿（active：进入插入模式，但先等待锚点）
            App.uiPref.connectArmed = false;
            // ★ 进入“等待锚点”的插入态（先点到一条路线上的节点作为锚点）
            App.insertMode = { routeId: null, anchorIndex: -1, inserting: true, awaitingAnchor: true };
            computeAndApply();
            return;
          }

          // ③ 绿（active） → 回到 Group（退出 Connect）
          if (active) {
            endInsertMode(false);    // 取消提交
            App.flightStart = null;
            App.uiPref.connectArmed = false;
            App.uiPref.route = false;
            drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
            computeAndApply();
            return;
          }
        });
      }
    }
    wireButtons();

    // 让页面一进来就是 Group 绿灯（默认态）
    forceGroupDefault();

    return { setVisualState, computeAndApply, forceGroupDefault, computeHoverPreview };
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

      // ★ 若正在悬停，重算预览
      if (App.hoveredHex) {
        const { panelIdx, q, r } = App.hoveredHex;
        App.highlightedHexKeys = computeHoverPreview(panelIdx, q, r, {
          withCtrl: (App.modKeys.ctrl || App.modKeys.meta),
          withShift: App.modKeys.shift
        });
        updateHexStyles();
      }

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
    // 窗口失焦时：清干净修饰键 + 关闭 Route/Connect 偏好，并回到 Group
    const onBlur = () => {
      App.modKeys = { ctrl:false, meta:false, shift:false };
      App.uiPref.route = false;
      App.uiPref.connectArmed = false;
      ModeUI.forceGroupDefault();
    };

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
    // 确保当前面板 svg 拥有用于预览态的斜线填充
    ensureHatchPattern(svg);

    const { root: overlayRoot } = ensureOverlayRoot(overlay);
    // >>> 新增：为当前 panel 的 svg 定义斜线 pattern
    ensureHatchDefs(svg, panelIdx);

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

          // >>> 新增：顶层“斜线阴影”覆盖，默认不显示（fill:none）
          g.append('path')
            .attr('class', 'hex-hatch')
            .attr('d', d3.line()(hexPoints(hexRadius)))
            .attr('fill', 'none')                 // 需要时再切到 pattern
            .style('pointer-events', 'none');     // 阴影不截获事件

          g.on('mouseover', (event, d) => {
            App.hoveredHex = { panelIdx, q: d.q, r: d.r };
            if (App.flightStart) App.flightHoverTarget = { panelIdx, q: d.q, r: d.r };
            // ★ 根据当前键位/按钮状态计算预览
            const withCtrl  = isCtrlLike(event);
            const withShift = !!event.shiftKey;
            App.highlightedHexKeys = ModeUI.computeHoverPreview(panelIdx, d.q, d.r, { withCtrl, withShift });
  
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
            // ★ 清空预览
            App.highlightedHexKeys.clear();
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
        const gSel = d3.select(this);
        const path = gSel.select('path');               // 底色 path（已有）
        const hatch = gSel.select('path.hex-hatch');    // 斜线 path（新加）
        let opacity = STYLE.OPACITY_DEFAULT;
        let useHatch = false; // 预览态使用斜线填充
        const baseFill = getHexFillColor(d);

        const key = pkey(panelIdx, d.q, d.r);
        const isSelected    = App.persistentHexKeys.has(key);
        const isExcluded    = App.excludedHexKeys.has(key);
        const isHovered     = App.hoveredHex?.panelIdx === panelIdx && App.hoveredHex.q === d.q && App.hoveredHex.r === d.r;
        const isFlightStart = App.flightStart?.panelIdx === panelIdx && App.flightStart.q === d.q && App.flightStart.r === d.r;
        const isFlightHover = App.flightHoverTarget?.panelIdx === panelIdx && App.flightHoverTarget.q === d.q && App.flightHoverTarget.r === d.r;

        // 预览集合（App.highlightedHexKeys 里既有中心也有邻居）
        const isPreview = App.highlightedHexKeys.has(key);
        const isPreviewCenter =
          isPreview && (App.hoveredHex?.panelIdx === panelIdx) &&
          (App.hoveredHex.q === d.q) && (App.hoveredHex.r === d.r);
        const isPreviewNeighbor = isPreview && !isPreviewCenter;

        // —— 透明度：优先级（选中/中心/邻居/其他）
        if (isSelected) {
          opacity = STYLE.OPACITY_SELECTED;                     // 已选：最亮
        } else if (isHovered || isFlightStart || isFlightHover) {
          opacity = STYLE.OPACITY_HOVER;                        // 鼠标/航班端点：亮
        } else if (isPreviewCenter) {
          opacity = STYLE.OPACITY_PREVIEW_CENTER;               // 待选中心：较亮
        } else if (isPreviewNeighbor) {
          opacity = STYLE.OPACITY_PREVIEW_NEIGHBOR;             // 待选邻居：略暗
        } else {
          opacity = STYLE.OPACITY_DEFAULT;                      // 其他：默认
        }
        path.attr('fill-opacity', opacity);

        // —— 斜线阴影：仅给“预览邻居”加阴影，其它都不画
        const needHatch = isPreviewNeighbor;
        hatch.attr('fill', needHatch ? `url(#hex-hatch-${panelIdx})` : 'none');

 
        // 应用填充（预览态用斜线 pattern，其它用原有颜色）
        if (useHatch) {
          path.attr('fill', `url(#${STYLE.HATCH_ID})`);
        } else {
          path.attr('fill', baseFill);
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
    const ctrlLike = !!withCtrl;
    const armed = isConnectArmedNow(withCtrl, withShift); // 键盘(Ctrl+Shift) 或 按钮黄灯
    const routeMode = isRouteMode(ctrlLike);              // 键盘(Ctrl/⌘) 或 按钮 Route 绿灯

    // —— Connect Active：插入模式优先（含“等待锚点”的绿灯）——————————————
    if (App.insertMode) {
      // 4.1 还没有锚点：先确定锚点所在的路线与 index
      if (App.insertMode.awaitingAnchor) {
        // 先优先在“已选路线”中找，找不到再在全部路线中找
        let route = findSelectedRouteContaining(panelIdx, q, r);
        if (!route) {
          route = (App._lastLinks || []).find(l => isSelectableRoute(l) && linkContainsNode(l, panelIdx, q, r));
          if (route) App.selectedRouteIds.add(linkKey(route)); // 若没选过该路，则顺带选中它
        }
        if (route) {
          const idx = indexOfPointInLink(route, panelIdx, q, r);
          if (idx >= 0) {
            App.insertMode.routeId = linkKey(route);
            App.insertMode.anchorIndex = idx;
            App.insertMode.awaitingAnchor = false;
            App.selectedHex = { panelIdx, q, r };
            recomputePersistentFromRoutes();
            updateHexStyles();
            ModeUI.computeAndApply();
            return; // 锚点确定后，下一次点击再走“添加/结束”
          }
        }
        // 点击不在任何路线节点上：不处理，回退到后续模式（比如 Route/Group）
        // 不 return
      }

      // 4.2 已有 routeId（真正的插入过程）
      const link = findLinkById(App.insertMode.routeId);
      if (!link) {
        App.insertMode = null; // 安全兜底
      } else {
        const isEndpoint =
          indexOfPointInLink(link, panelIdx, q, r) === 0 ||
          indexOfPointInLink(link, panelIdx, q, r) === link.path.length - 1;

        // 添加点：Shift 或 黄灯（armed）都能加
        if (armed && !isEndpoint) {
          insertPointAfter(link, App.insertMode.anchorIndex, panelIdx, q, r);
          drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
          recomputePersistentFromRoutes();
          updateHexStyles();
          publishToStepAnalysis();
          return;
        }
        // 结束：Ctrl+Shift 点到终点，或“按钮黄灯”下点到终点
        if ((withCtrl && withShift && isEndpoint) || (App.uiPref.connectArmed && isEndpoint)) {
          endInsertMode(true);
          return;
        }
        // 其余落空：不 return，让后续 Route/Group 还能工作（例如误点到别的地方）
      }
    }

    // —— Connect Armed（黄灯）：未进入 active 时，点击路线节点 = 开始插入 —— //
    if (armed && !isConnectActive()) {
      let route = findSelectedRouteContaining(panelIdx, q, r);
      if (!route) {
        route = (App._lastLinks || []).find(l => isSelectableRoute(l) && linkContainsNode(l, panelIdx, q, r));
        if (route) App.selectedRouteIds.add(linkKey(route));
      }
      if (route) {
        const idx = indexOfPointInLink(route, panelIdx, q, r);
        if (idx >= 0) {
          beginInsertMode(route, idx);
          App.selectedHex = { panelIdx, q, r };
          recomputePersistentFromRoutes();
          updateHexStyles();
          return;
        }
      }
      // armed 但没点在路线节点上 → 忽略，让后续 Route/Group 执行
    }

    // —— Route 模式（键盘 Ctrl/⌘ 或 按钮 Route 绿灯）———————————————
    if (routeMode) {
      // 与你原来的 Ctrl 分支一致（仅去掉对 withCtrl 的强制）
      const key = pkey(panelIdx, q, r);

      if (App.persistentHexKeys.has(key)) {
        // 已在选集中：只排除此点
        App.excludedHexKeys.add(key);
        App.persistentHexKeys.delete(key);
      } else {
        let added = false;

        // 规则一：若该点是某条线的起点，选所有以它为起点的线
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

      recomputePersistentFromRoutes();
      App.selectedHex = { panelIdx, q, r };
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
      updateHexStyles();
      publishToStepAnalysis();
      return;
    }

    // —— Group 模式（默认）———————————————————————————————
    if (App.persistentHexKeys.has(k)) {
      deselectComponent(panelIdx, q, r);
      if (App.selectedHex?.panelIdx === panelIdx && App.selectedHex.q === q && App.selectedHex.r === r) {
        App.selectedHex = null;
      }
    } else {
      selectComponent(panelIdx, q, r);
      App.selectedHex = { panelIdx, q, r };
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
      App.panelStates[idx] = { ...(App.panelStates[idx] || {}), left, top, userMoved: true };
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
        const base = App.panelStates[idx] || {};
        // ★ 程序性布局期间只同步宽高，不打“用户”标记
        App.panelStates[idx] = {
          ...base,
          width: w,
          height: h,
          ...(App._squelchResize ? {} : { userResized: true })
        };
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

    // 初次渲染后
    applyResponsiveLayout(true);

    const resizeHandler = () => {
      (data.subspaces || []).forEach((space, i) => renderHexGridFromData(i, space, App.config.hex.radius));
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
      updateHexStyles();
      App.globalOverlayEl.setAttribute('width', App.playgroundEl.clientWidth);
      App.globalOverlayEl.setAttribute('height', App.playgroundEl.clientHeight);
      applyResponsiveLayout(false);   // ← 新增：窗口变化时重新排布
    };
    window.addEventListener('resize', resizeHandler);
    cleanupFns.push(() => window.removeEventListener('resize', resizeHandler));

    const ro = new ResizeObserver(() => {
      App.globalOverlayEl.setAttribute('width', App.playgroundEl.clientWidth);
      App.globalOverlayEl.setAttribute('height', App.playgroundEl.clientHeight);
      applyResponsiveLayout(false);   // ← 新增
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
      // ModeUI.computeAndApply({});
      ModeUI.forceGroupDefault();
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
      // 与 subspace-title 一致：使用 plaintext-only
      el.setAttribute('contenteditable', 'plaintext-only');
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

  // ★ 保存滚动位置
  const scroller = App.playgroundEl.closest('.mv-scroller') || App.playgroundEl.parentElement;
  const prevTop  = scroller ? scroller.scrollTop  : 0;
  const prevLeft = scroller ? scroller.scrollLeft : 0;

  // 1) 删除数据与状态
  App.currentData.subspaces.splice(idx, 1);
  App.panelStates.splice(idx, 1);
  App.zoomStates.splice(idx, 1);

  // 2) 重建连线
  App._lastLinks = _rebuildLinksAfterRemove(App._lastLinks, idx);

  // 清理选集
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

  // ★ 强制响应式重排（忽略 userMoved/userResized）
  applyResponsiveLayout(true);

  // ★ 恢复滚动位置（下一帧，待高度稳定后）
  requestAnimationFrame(() => {
    if (scroller) scroller.scrollTo({ top: prevTop, left: prevLeft, behavior: 'auto' });
  });
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
      applyResponsiveLayout(true);     // ← 新增：加了卡片要重排

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


