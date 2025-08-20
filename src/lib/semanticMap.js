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

  OPACITY_DEFAULT: 0.2,
  OPACITY_HOVER: 0.8,
  OPACITY_SELECTED: 1.0,
  OPACITY_NEIGHBOR: 0.8,

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
  CLICK_DELAY: 250,

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

    // 选中与快照
    persistentHexKeys: new Set(),
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
  const pointId = (panelIdx, q, r) => `${panelIdx}:${q},${r}`;

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
            event.preventDefault(); event.stopPropagation();
            if (App._clickTimer) clearTimeout(App._clickTimer);
            App._clickTimer = setTimeout(() => handleSingleClick(panelIdx, d.q, d.r), STYLE.CLICK_DELAY);
          }).on('dblclick', (event, d) => {
            event.preventDefault(); event.stopPropagation();
            if (App._clickTimer) { clearTimeout(App._clickTimer); App._clickTimer = null; }
            handleDoubleClick(panelIdx, d.q, d.r, event);
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

    // 遍历所有连线
    (links || []).forEach(link => {
      const type  = link.type || 'road';
      const style = styleOf(type);
      const pts = (link.path || []).map((p, i) => ({
        panelIdx: resolvePanelIdxForPathPoint(p, link, i),
        q: p.q, r: p.r
      }));
      if (pts.length < 2) return;

      // 起点计数（用于城市/首都）
      const p0 = pts[0];
      bump(p0.panelIdx, p0.q, p0.r);

      if (type === 'flight') {
        // 仅当两端可见时，才绘制 flight
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
        // road/river：各自 panel 的 links 层（在城市层下方）
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

    // 城市/首都（中层）
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
          // 城市：单圆（白填充、灰描边）
          gCities.append('circle')
            .attr('cx', cx).attr('cy', cy)
            .attr('r', baseR)
            .attr('fill', App.config.city.fill)
            .attr('stroke', App.config.city.borderColor)
            .attr('stroke-width', App.config.city.borderWidth)
            .attr('vector-effect', 'non-scaling-stroke')
            .style('pointer-events', 'none');
        } else if (count >= 2) {
          // 首都：外圆（白填充） + 内实心圆（黑填充），均灰描边
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

      // 提升城市层（仍在 flight 以下，因为 flight 在全局 overlay）
      gCities.raise();
    });

    // 临时 flight（最高层，且仅当起点可见）
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
    App.neighborKeySet.clear();
    for (const k of App.persistentHexKeys) {
      const [panelStr, qr] = k.split('|');
      const [qStr, rStr] = qr.split(',');
      const panelIdx = +panelStr, q = +qStr, r = +rStr;
      const ns = getConnectedHexKeys(panelIdx, q, r);
      ns.forEach(hk => App.neighborKeySet.add(`${panelIdx}|${hk}`));
      addFlightNeighbors(panelIdx, q, r);
    }

    App.subspaceSvgs.forEach((svg, panelIdx) => {
      svg.selectAll('g.hex').each(function(d) {
        const path = d3.select(this).select('path');
        let opacity = STYLE.OPACITY_DEFAULT;

        const isPersistent = App.persistentHexKeys.has(pkey(panelIdx, d.q, d.r));
        const isNeighbor   = App.neighborKeySet.has(pkey(panelIdx, d.q, d.r));
        const isHovered    = App.hoveredHex?.panelIdx === panelIdx && App.hoveredHex.q === d.q && App.hoveredHex.r === d.r;
        const isFlightStart = App.flightStart?.panelIdx === panelIdx && App.flightStart.q === d.q && App.flightStart.r === d.r;
        const isFlightHover = App.flightHoverTarget?.panelIdx === panelIdx && App.flightHoverTarget.q === d.q && App.flightHoverTarget.r === d.r;

        if (isPersistent || isFlightStart || isFlightHover || isHovered) {
          opacity = STYLE.OPACITY_HOVER;
        } else if (isNeighbor) {
          opacity = STYLE.OPACITY_NEIGHBOR;
        }
        path.attr('fill-opacity', opacity);
      });
    });
  }

  /* =========================
   * 交互/快照
   * ========================= */
  function buildUndirectedAdjacency() {
    const adj = new Map(); // key -> Set<key>
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

    for (const e of (App._lastLinks || [])) {
      const rawPts = Array.isArray(e.path) ? e.path : [];
      if (rawPts.length < 2) continue;

      const normPts = rawPts.map((p, i) => ({
        panelIdx: resolvePanelIdxForPathPoint(p, e, i),
        q: p.q, r: p.r
      }));
      const filtered = normPts.filter(inSet);
      if (filtered.length < 2) continue;

      links.push({
        id: e.id || `${filtered[0].panelIdx}:${filtered[0].q},${filtered[0].r}->${filtered.at(-1).panelIdx}:${filtered.at(-1).q},${filtered.at(-1).r}`,
        type: e.type || 'road',
        path: filtered.map(pt => ({ panelIdx: pt.panelIdx, q: pt.q, r: pt.r }))
      });
    }

    return { nodes, links };
  }

  function publishToStepAnalysis() {
    App._lastSnapshot = snapshotFromKeySet(App.persistentHexKeys || new Set());
  }

  function handleSingleClick(panelIdx, q, r) {
    const k = pkey(panelIdx, q, r);

    // 已高亮：移除
    if (App.persistentHexKeys.has(k)) {
      App.persistentHexKeys.delete(k);
      if (App.selectedHex?.panelIdx === panelIdx && App.selectedHex.q === q && App.selectedHex.r === r) {
        App.selectedHex = null;
      }
      updateHexStyles();
      publishToStepAnalysis();
      return;
    }

    // 未高亮：加入该无向连通分量
    const adj = buildUndirectedAdjacency();
    const visited = new Set([k]);
    const qBFS = [k];
    while (qBFS.length) {
      const cur = qBFS.shift();
      const nbs = adj.get(cur) || new Set();
      for (const nb of nbs) if (!visited.has(nb)) { visited.add(nb); qBFS.push(nb); }
    }
    for (const kk of visited) App.persistentHexKeys.add(kk);

    App.selectedHex = { panelIdx, q, r };
    updateHexStyles();
    publishToStepAnalysis();
  }

  function handleDoubleClick(panelIdx, q, r, event) {
    const here = { panelIdx, q, r };

    // 设置/取消起点
    if (!App.flightStart) {
      App.flightStart = here;
      const rect = App.playgroundEl.getBoundingClientRect();
      App.currentMouse.x = event.clientX - rect.left;
      App.currentMouse.y = event.clientY - rect.top;
      App.persistentHexKeys.add(pkey(panelIdx, q, r));
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

    // 建立连线
    addCustomFlightLink(App.flightStart, here);

    // 两端加入持久高亮
    App.persistentHexKeys.add(pkey(App.flightStart.panelIdx, App.flightStart.q, App.flightStart.r));
    App.persistentHexKeys.add(pkey(panelIdx, q, r));

    App.flightStart = null;
    drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
    updateHexStyles();
    publishToStepAnalysis();
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
      // 统一以“当前高亮集”导出
      const keySet = App.persistentHexKeys;
      return snapshotFromKeySet(keySet || new Set());
    },
  };

  return controller;
}

export function destroySemanticMap(cleanup) {
  if (typeof cleanup === 'function') cleanup();
}
