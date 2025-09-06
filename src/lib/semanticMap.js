// src/lib/semanticMap.js
import * as d3 from 'd3';

/* =========================
 * 样式与常量（集中）
 * ========================= */
const STYLE = {
  HEX_RADIUS: 16,
  HEX_BORDER_WIDTH: 1.2,
  HEX_BORDER_COLOR: '#ffffff',
  // HEX_FILL_TEXT: '#a9d08d',
  // HEX_FILL_IMAGE: '#a6cee3',
  HEX_FILL_TEXT: '#DCDCDC',
  HEX_FILL_IMAGE: '#DCDCDC',
  HEX_FILL_DEFAULT: '#ffffff',

  OPACITY_DEFAULT: 0.2,
  OPACITY_HOVER: 1.0,
  OPACITY_SELECTED: 1.0,
  OPACITY_NEIGHBOR: 0.6,
  OPACITY_PREVIEW: 0.5,      // 预览（待选）态透明度
  HATCH_ID: 'preview-hatch', // 预览斜线填充的 <pattern> id

  // --- ALT（国家预览）态 ---
  OPACITY_ALT_ACTIVE: 0.95,     // 当前国家的格子
  OPACITY_ALT_OTHER:  0.08,     // 其它国家/无归属格子
  BORDER_ALT_ACTIVE:  0.95,     // 当前国家的边界线透明度
  BORDER_ALT_OTHER:   0,      // 其它国家的边界线透明度（含虚线）

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

  COUNTRY_BORDER_COLOR: '#292929ff',
  COUNTRY_BORDER_WIDTH: 1,
  COUNTRY_BORDER_DASH: "2,1",

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
  OPACITY_ALT_FADE: 0.08,   // Alt 国家聚焦时：非该国家的 hex 统一降到这层透明度

  // --- 斜线阴影样式 ---
  HATCH_SPACING: 5,               // 斜线间距（px）
  HATCH_STROKE: '#000',           // 斜线颜色（可依据主题调）
  HATCH_STROKE_WIDTH: 0.8,          // 斜线粗细
  HATCH_OPACITY: 0.6,            // 斜线透明度
  HATCH_ANGLE: 45,                // 斜线角度（度）

  FOCUS_COUNTRY_FILL: '#FCFCFC',   // Alt 聚焦国家的统一填充色（不区分 modality）
  OPACITY_NONFOCUS: 0.08,          // Alt 聚焦时，非该国家 hex 的压暗透明度


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
        altOtherOpacity: STYLE.OPACITY_ALT_OTHER,
        borderWidth: STYLE.HEX_BORDER_WIDTH,
        borderColor: STYLE.HEX_BORDER_COLOR,
        textFill: STYLE.HEX_FILL_TEXT,
        imageFill: STYLE.HEX_FILL_IMAGE,
        zIndex: 1,
        borderDash: STYLE.COUNTRY_BORDER_DASH,
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
    modKeys: { ctrl: false, meta: false, shift: false, alt: false },
    _lastSnapshot: null,
    activeAltCountry: null,

    // 每个 panel 的 { country_id -> Set<"panel|q,r"> }
    countryKeysByPanel: [],

    // 回调 & 容器
    onSubspaceRename: null,
    onMainTitleRename: null,
    // ★ FIX: 点击 hex 时把完整 MSU 数据抛给上层（可选）
    onHexClick: null,
    playgroundEl,
    globalOverlayEl,

    // 数据
    currentData: null,
    countryKeysGlobal: new Map(),   // ★ 新增：全局 { country_id -> Set("panel|q,r") }
    focusCountryId: null,   // ★ 当前 Alt 高亮的国家（跨面板生效）
    focusMode: 'filled',      // ★ 新增：'filled' | 'outline'

    // —— Alt 聚焦隔离 & 面板级聚焦覆盖 —— //
    altIsolatedPanels: new Set(),     // 被隔离 Alt 聚焦的面板索引集合（复制面板会加入）
    panelFocusOverrides: new Map(),   // panelIdx -> { countryId, mode: 'filled'|'outline' }


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

    // —— 统一键名 —— //
  const keyHexColon = (panelIdx,q,r) => `${panelIdx}:${q},${r}`;   // 给右卡片/miniPathRenderer
  const keyHexPipe  = (panelIdx,q,r) => `${panelIdx}|${q},${r}`;   // 你当前面板内 alphaByKey 可能用这个
  const keyPanelCountry = (panelIdx,cid) => `${panelIdx}|${normalizeCountryId(cid)}`;

  // —— 容忍 Map/对象 —— //
  function pick(mapLike, key) {
    if (!mapLike) return null;
    const k1 = key, k2 = String(key);
    if (mapLike instanceof Map) return mapLike.get(k1) ?? mapLike.get(k2) ?? null;
    if (typeof mapLike === 'object') return (mapLike[k1] ?? mapLike[k2] ?? null);
    return null;
  }


  function getCountryKeys(panelIdx, countryId) {
    const m = App.countryKeysByPanel?.[panelIdx];
    if (!m) return new Set();
    return new Set(m.get(countryId) || []);
  }

  function collectCountryKeysAllPanels(countryId) {
    const out = new Set();
    (App.countryKeysByPanel || []).forEach((map, pIdx) => {
      if (!map) return;
      const set = map.get(countryId);
      if (set && set.size) {
        set.forEach(k => out.add(k)); // k 已是 "panelIdx|q,r"
      }
    });
    return out;
  }

  function clearAltFocusForPanelOnNormalClick(panelIdx) {
    let changed = false;

    // 全局 Alt 聚焦关掉（不影响你已确认的颜色表）
    if (App.focusCountryId) {
      setCountryFocus(null, null);   // 会清 App.highlightedHexKeys
      changed = true;
    }

    // 本面板若有本地聚焦也一并关掉
    const local = App.panelFocusOverrides.get(panelIdx);
    if (local && local.countryId) {
      App.panelFocusOverrides.set(panelIdx, { countryId: null, mode: null });
      changed = true;
    }

    if (changed) updateHexStyles();  // 让整国涂色立刻消失
  }


  // —— 简易防抖 —— //
  function debounce(fn, wait = 240) {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { t = null; fn(...args); }, wait);
    };
  }

  function setCountryFocus(countryId, mode = 'filled') {
    const normId = countryId ? normalizeCountryId(countryId) : null;
    App.focusCountryId = normId;
    App.focusMode = normId ? mode : null;
    // 预览集合可不强依赖（保持或清空均可）
    if (normId && mode === 'filled') App.highlightedHexKeys = getCountryKeysAllPanels(normId);
    else App.highlightedHexKeys.clear();
    updateHexStyles();
  }


  // ★ FIX: 访问全量 msu_index 并解析
  function getMSUIndex() {
    // 允许 key 是字符串或数字；JS 访问时会自动转字符串
    return (App.currentData && App.currentData.msu_index) || {};
  }
  function resolveMSUs(msuIds) {
    const idx = getMSUIndex();
    const out = [];
    (msuIds || []).forEach((id) => {
      // 兼容字符串/数字 id
      const rec = idx[id] ?? idx[String(id)];
      if (rec) out.push(rec);
    });
    return out;
  }


  // ★ 可选：国家 ID 归一化（当不同面板用不同 id 表示同一国家时）
  // 用 controller.setCountryIdAlias(...) 可注入 { "p0_c1":"CN", "p1_c01":"CN" } 这样的映射
  App.countryIdAlias = new Map();
  function normalizeCountryId(cid) {
    return App.countryIdAlias.get(cid) || cid;
  }

  // 仅取单面板（原有逻辑保留，如需）
  function getCountryKeysInPanel(panelIdx, countryIdRaw) {
    const m = App.countryKeysByPanel?.[panelIdx];
    if (!m) return new Set();
    const cid = normalizeCountryId(countryIdRaw);
    return new Set(m.get(cid) || []);
  }

  // ★ 新增：跨所有面板，取同一国家（规范 id 后）的全部 hex key
  function getCountryKeysAllPanels(countryIdRaw) {
    const out = new Set();
    const cid = normalizeCountryId(countryIdRaw);
    (App.countryKeysByPanel || []).forEach((m) => {
      if (!m) return;
      const s = m.get(cid);
      if (s && s.size) s.forEach(k => out.add(k));
    });
    return out;
  }

  // —— 颜色快照工具：把面板级国家改色拍扁成两个映射 ——
  // 1) colorByCountry: { [normCountryId]: "#RRGGBB" }（跨面板统一色，取第一次出现为主）
  // 2) colorByPanelCountry: { ["panelIdx|normCountryId"]: "#RRGGBB" }（面板内覆盖）
  // —— 小工具：把 "p|q,r" 统一成 "p:q,r" —— //
  const _keyPipeToColon = (k) => {
    if (typeof k !== 'string') return String(k);
    const i = k.indexOf('|');
    return i >= 0 ? `${k.slice(0,i)}:${k.slice(i+1)}` : k;
  };

  // —— 从 App 中构造小卡用的颜色 & 透明度快照 —— //
  function _buildMiniSnapshot() {
    const colorByCountry = {};
    const colorByPanelCountry = {};
    const alphaByNode = {}; // key: "panelIdx:q,r" → 0~1

    // 颜色：来自 App.panelCountryColors（你的存储结构）
    if (App && App.panelCountryColors instanceof Map) {
      App.panelCountryColors.forEach((m, panelIdx) => {
        if (!(m instanceof Map)) return;
        m.forEach((rec, rawCid) => {
          const cid = App.countryIdAlias?.get?.(rawCid) || rawCid;
          const hex = rec?.color || null;
          if (hex) {
            colorByPanelCountry[`${panelIdx}|${cid}`] = hex;
            if (!(cid in colorByCountry)) colorByCountry[cid] = hex;
          }

          // 透明度：优先 rec.alphaByKey（Map 或对象）
          const abk = rec?.alphaByKey;
          if (abk instanceof Map) {
            abk.forEach((a, k) => {
              if (typeof a === 'number' && a >= 0 && a <= 1) {
                alphaByNode[_keyPipeToColon(k)] = a;
              }
            });
          } else if (abk && typeof abk === 'object') {
            Object.entries(abk).forEach(([k, a]) => {
              if (typeof a === 'number' && a >= 0 && a <= 1) {
                alphaByNode[_keyPipeToColon(k)] = a;
              }
            });
          }
        });
      });
    }

    // 透明度兜底：渲染时缓存（updateHexStyles 写入）
    if (App && App.alphaCacheByHex) {
      if (App.alphaCacheByHex instanceof Map) {
        App.alphaCacheByHex.forEach((a, k) => {
          const kc = _keyPipeToColon(k);
          if (alphaByNode[kc] == null && typeof a === 'number' && a >= 0 && a <= 1) {
            alphaByNode[kc] = a;
          }
        });
      } else if (typeof App.alphaCacheByHex === 'object') {
        Object.entries(App.alphaCacheByHex).forEach(([k, a]) => {
          const kc = _keyPipeToColon(k);
          if (alphaByNode[kc] == null && typeof a === 'number' && a >= 0 && a <= 1) {
            alphaByNode[kc] = a;
          }
        });
      }
    }

    const normalizeCountryId = (cid) => App.countryIdAlias?.get?.(cid) || cid;
    return { colorByCountry, colorByPanelCountry, alphaByNode, normalizeCountryId };
  }


  function _buildColorMapsSnapshot() {
    const colorByCountry = {};
    const colorByPanelCountry = {};
    const alphaByNode = {}; // ★ 新增

    // 颜色：保持你原有逻辑
    if (App && App.panelCountryColors instanceof Map) {
      App.panelCountryColors.forEach((m, panelIdx) => {
        if (!(m instanceof Map)) return;
        m.forEach((rec, rawCid) => {
          const cid = normalizeCountryId ? normalizeCountryId(rawCid) : rawCid;
          const hex = rec?.color || null;
          if (hex) {
            colorByPanelCountry[`${panelIdx}|${cid}`] = hex;
            if (!(cid in colorByCountry)) colorByCountry[cid] = hex;
          }

          // 透明度优先来源：覆盖记录里的 alphaByKey
          const abk = rec?.alphaByKey;
          if (abk instanceof Map) {
            abk.forEach((a, k) => {
              const keyColon = _keyPipeToColon(k);
              if (typeof a === 'number' && a >= 0 && a <= 1) alphaByNode[keyColon] = a;
            });
          } else if (abk && typeof abk === 'object') {
            Object.entries(abk).forEach(([k, a]) => {
              const keyColon = _keyPipeToColon(k);
              if (typeof a === 'number' && a >= 0 && a <= 1) alphaByNode[keyColon] = a;
            });
          }
        });
      });
    }

    // 透明度次级来源：渲染缓存（updateHexStyles 写入的最终透明度）
    if (App && App.alphaCacheByHex) {
      if (App.alphaCacheByHex instanceof Map) {
        App.alphaCacheByHex.forEach((a, k) => {
          const keyColon = _keyPipeToColon(k);
          if (alphaByNode[keyColon] == null && typeof a === 'number' && a >= 0 && a <= 1) {
            alphaByNode[keyColon] = a;
          }
        });
      } else if (typeof App.alphaCacheByHex === 'object') {
        Object.entries(App.alphaCacheByHex).forEach(([k, a]) => {
          const keyColon = _keyPipeToColon(k);
          if (alphaByNode[keyColon] == null && typeof a === 'number' && a >= 0 && a <= 1) {
            alphaByNode[keyColon] = a;
          }
        });
      }
    }

    return { colorByCountry, colorByPanelCountry, alphaByNode }; // ★ 返回多一个
  }

    function degradeFocusToOutlineFor(panelIdx) {
      // 面板级优先：如果该面板有本地聚焦，改成 outline
      const local = App.panelFocusOverrides.get(panelIdx);
      if (local && local.countryId && local.mode !== 'outline') {
        App.panelFocusOverrides.set(panelIdx, { countryId: local.countryId, mode: 'outline' });
        return true;
      }
      // 否则退全局：有全局聚焦就把模式改成 outline（不清 countryId）
      if (App.focusCountryId && App.focusMode !== 'outline') {
        App.focusMode = 'outline';
        return true;
      }
      return false;
    }


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

    // —— 从 App.panelCountryColors 构建小卡片可用的颜色映射 —— //
    // 返回 { colorByCountry: {...}, colorByPanelCountry: {...} }
    function _buildMiniColorMaps() {
      const colorByPanelCountry = {};
      const colorByCountry = {}; // 目前你主图没有“全局国家改色”，先留空对象

      // 1) 面板级改色（右键调色存这里）：App.panelCountryColors: Map(panelIdx -> Map(countryId -> { color, alphaByKey }))
      App.panelCountryColors.forEach((countryMap, panelIdx) => {
        countryMap.forEach((entry, rawCid) => {
          const cid = normalizeCountryId(rawCid);
          if (!entry || !entry.color) return;

          // 主键：用“规范化 id”
          colorByPanelCountry[`${panelIdx}|${cid}`] = entry.color;

          // 兼容：如果你有别名（raw -> canonical），把“原始 id”也一并写入，防止小卡片节点用的是 rawCid
          // App.countryIdAlias: Map(raw -> canonical)
          App.countryIdAlias?.forEach((to, from) => {
            if (to === cid) {
              colorByPanelCountry[`${panelIdx}|${from}`] = entry.color;
            }
          });
        });
      });

      // 2) 若以后你做了“全局国家改色”，在这里把 { canonicalCid: color } 写到 colorByCountry 即可

      return { colorByCountry, colorByPanelCountry };
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


  /* =========================
 * Alt 改色：状态与工具
 * ========================= */

// 面板级颜色覆盖：panelIdx -> (countryId -> { color: '#RRGGBB', alphaByKey: Map<'p|q,r', number> })
App.panelCountryColors = new Map();

// 临时预览态（打开菜单时用）
App._pendingColorEdit = null; 
// { panelIdx, countryId, color, keys:Set<"p|q,r">, alphaByKey:Map }

// —— 统一的内部归一化 —— //
function _normCid(cid) {
  try {
    return (typeof normalizeCountryId === 'function') ? normalizeCountryId(cid) : cid;
  } catch { return cid; }
}

// —— 覆盖色：写入 —— //
function setCountryColorOverride(panelIdx, countryId, color, alphaByKey) {
  if (!App.panelCountryColors) App.panelCountryColors = new Map();

  let perPanel = App.panelCountryColors.get(panelIdx);
  if (!perPanel) {
    perPanel = new Map();
    App.panelCountryColors.set(panelIdx, perPanel);
  }

  const cid = _normCid(countryId);

  // 统一 alphaByKey 的 key 形态 -> `${panelIdx}|${q},${r}`
  let alphaMap = new Map();
  if (alphaByKey instanceof Map) {
    alphaMap = new Map(
      Array.from(alphaByKey.entries()).map(([k, v]) => {
        const kk = (typeof k === 'string')
          ? (k.includes('|') ? k : k.replace(':', '|'))    // "p:q,r" -> "p|q,r"
          : String(k);
        return [kk, v];
      })
    );
  } else if (alphaByKey && typeof alphaByKey === 'object') {
    for (const [k, v] of Object.entries(alphaByKey)) {
      const kk = k.includes('|') ? k : k.replace(':', '|');
      alphaMap.set(kk, v);
    }
  }

  perPanel.set(cid, { color, alphaByKey: alphaMap });
}

// —— 覆盖色：读取 —— //
function getCountryColorOverride(panelIdx, countryId) {
  const perPanel = App.panelCountryColors?.get(panelIdx);
  if (!perPanel) return null;
  const cid = _normCid(countryId);
  return perPanel.get(cid) || null;
}


// 依据“该面板 + 国家”的实际 hex 集合，生成一条透明度比例尺（层次感）
// 策略：按 y 再按 x 排序，做一个从 0.65 → 1.0 的线性渐变
function buildAlphaRampFor(panelIdx, countryId) {
  const cid = normalizeCountryId(countryId);
  const keys = getCountryKeysInPanel(panelIdx, cid); // Set<"p|q,r">
  const arr = Array.from(keys).map(k => {
    const [pStr, qr] = k.split('|');
    const [qs, rs] = qr.split(',');
    const p = +pStr, q = +qs, r = +rs;
    const hex = App.hexMapsByPanel[p]?.get(`${q},${r}`);
    return { k, x: hex?.x ?? 0, y: hex?.y ?? 0 };
  });
  arr.sort((a,b) => (a.y - b.y) || (a.x - b.x));
  const n = Math.max(1, arr.length);
  const a0 = 0.65, a1 = 1.0;
  const alphaByKey = new Map();
  arr.forEach((it, i) => {
    const t = n === 1 ? 1 : i / (n - 1);
    const alpha = a0 + (a1 - a0) * t;
    alphaByKey.set(it.k, alpha);
  });
  return { keys: new Set(arr.map(d => d.k)), alphaByKey };
}

/* =========================
 * 右键菜单（全局唯一）
 * ========================= */
function ensureColorMenu() {
  let menu = document.getElementById('alt-color-menu');
  if (menu) return menu;

  menu = document.createElement('div');
  menu.id = 'alt-color-menu';
  Object.assign(menu.style, {
    position: 'fixed',
    display: 'none',
    zIndex: 9999,
    minWidth: '220px',
    padding: '10px 12px',
    borderRadius: '12px',
    background: 'rgba(30,30,32,0.98)',
    color: '#fff',
    boxShadow: '0 8px 18px rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(6px)',
  });
  menu.innerHTML = `
    <div style="font-size:13px;opacity:.85;margin-bottom:8px">Adjust country color</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <input id="alt-color-input" type="color" style="width:36px;height:28px;border:none;background:transparent;cursor:pointer" />
      <input id="alt-color-hex" type="text" placeholder="#AABBCC" style="flex:1;height:28px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;padding:0 8px;font-size:12px;outline:none" />
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button id="alt-color-cancel" style="height:28px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:transparent;color:#fff;cursor:pointer">Cancel</button>
      <button id="alt-color-confirm" style="height:28px;padding:0 12px;border-radius:8px;border:none;background:#3b82f6;color:#fff;cursor:pointer">Confirm</button>
    </div>
  `;
  document.body.appendChild(menu);

  const pick = () => {
    const inp = /** @type {HTMLInputElement} */(menu.querySelector('#alt-color-input'));
    const hex = /** @type {HTMLInputElement} */(menu.querySelector('#alt-color-hex'));
    return { inp, hex };
  };

  // 同步：色盘 <-> 文本
  menu.querySelector('#alt-color-input').addEventListener('input', () => {
    const { inp, hex } = pick();
    hex.value = inp.value.toUpperCase();
    // 预览
    if (App._pendingColorEdit) {
      App._pendingColorEdit.color = inp.value;
      debouncedPreview();          // ← 用防抖替代即时预览
    }
  });
  menu.querySelector('#alt-color-hex').addEventListener('input', () => {
    const { inp, hex } = pick();
    const v = hex.value.trim();
    if (/^#([0-9a-f]{6})$/i.test(v)) {
      inp.value = v;
      if (App._pendingColorEdit) {
        App._pendingColorEdit.color = v;
        debouncedPreview();        // ← 防抖
      }
    }
  });

  // 确认 / 取消
  menu.querySelector('#alt-color-confirm').addEventListener('click', () => {
    if (!App._pendingColorEdit) return;

    // 兜底取最新的颜色（文本框 > 取色器 > pending）
    const colorInp = /** @type {HTMLInputElement} */(menu.querySelector('#alt-color-input'));
    const colorHex = /** @type {HTMLInputElement} */(menu.querySelector('#alt-color-hex'));
    let chosen = (colorHex?.value || colorInp?.value || App._pendingColorEdit.color || '').trim();
    if (!/^#([0-9a-f]{6})$/i.test(chosen)) {
      // 非法则直接不要存，避免污染
      chosen = null;
    }

    const { panelIdx, countryId, alphaByKey } = App._pendingColorEdit;
    if (chosen) {
      setCountryColorOverride(panelIdx, countryId, chosen, alphaByKey);
    }

    App._pendingColorEdit = null;
    hideColorMenu();
    updateHexStyles();
  });


  menu.querySelector('#alt-color-cancel').addEventListener('click', () => {
    App._pendingColorEdit = null; // 丢弃预览
    hideColorMenu();
    updateHexStyles();
  });

  // 点击菜单外关闭
  document.addEventListener('click', (e) => {
    if (menu.style.display === 'none') return;
    if (!menu.contains(e.target)) {
      App._pendingColorEdit = null;
      hideColorMenu();
      updateHexStyles();
    }
  });

  // 防抖的预览更新：仅在有 pending 编辑时才预览
  const debouncedPreview = debounce(() => {
    if (App._pendingColorEdit) updateHexStyles();
  }, 160); // 可调：120~200ms

  return menu;
}

function showColorMenu(x, y, initColor = '#a9d08d') {
  const menu = ensureColorMenu();
  const { inp, hex } = {
    inp: /** @type {HTMLInputElement} */(menu.querySelector('#alt-color-input')),
    hex: /** @type {HTMLInputElement} */(menu.querySelector('#alt-color-hex')),
  };
  inp.value = initColor;
  hex.value = initColor.toUpperCase();

  // 避免出屏
  const pad = 8;
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.display = 'block';
  menu.style.left = Math.min(x, vw - menu.offsetWidth - pad) + 'px';
  menu.style.top  = Math.min(y, vh - menu.offsetHeight - pad) + 'px';
}
function hideColorMenu() {
  const menu = document.getElementById('alt-color-menu');
  if (menu) menu.style.display = 'none';
}

// —— Hover Tooltip（与改色菜单同级的小组件）——
function ensureHexTooltip() {
  let tip = document.getElementById('hex-tip');
  if (tip) return tip;

  tip = document.createElement('div');
  tip.id = 'hex-tip';
  Object.assign(tip.style, {
    position: 'fixed',
    display: 'none',
    zIndex: 9998,
    maxWidth: '420px',
    padding: '10px 12px',
    borderRadius: '12px',
    background: 'rgba(30,30,32,0.98)',
    color: '#fff',
    boxShadow: '0 8px 18px rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(6px)',
    fontSize: '12.5px',
    lineHeight: '1.45',
    pointerEvents: 'none' // 绝不截获事件
  });
  tip.innerHTML = ''; // 动态填充
  document.body.appendChild(tip);
  return tip;
}

function renderHexTooltipHTML({ color = '#999', msuCount = 0, summary = '' }) {
  const safeSummary = (summary || '').toString().trim();
  // 根据数量决定显示 "MSU" 还是 "MSUs"
  const label = msuCount === 1 ? 'MSU' : 'MSUs';
  console.log('renderHexTooltipHTML', color, msuCount, summary);
  return `
    <div style="display:flex;align-items:center;gap:8px">
      <span style="
        display:inline-block;width:10px;height:10px;border-radius:50%;
        background:${color};flex:none;border:1px solid rgba(255,255,255,0.25)
      "></span>
      <span style="opacity:.9;flex:none"><b>${msuCount}</b> ${label}: </span>
      <span style="opacity:.95;flex:1">${safeSummary || '<i style="opacity:.6">No summary</i>'}</span>
    </div>
  `;
}

function showHexTooltip(clientX, clientY, payload) {
  const tip = ensureHexTooltip();
  tip.innerHTML = renderHexTooltipHTML(payload);

  const pad = 10;
  tip.style.display = 'block';
  // 初步定位在鼠标右下角
  tip.style.left = (clientX + 14) + 'px';
  tip.style.top  = (clientY + 14) + 'px';

  // 防溢出：靠右/靠下时往回收
  const vw = window.innerWidth, vh = window.innerHeight;
  const rect = tip.getBoundingClientRect();
  if (rect.right > vw - pad) tip.style.left = (vw - rect.width - pad) + 'px';
  if (rect.bottom > vh - pad) tip.style.top = (vh - rect.height - pad) + 'px';
}

function moveHexTooltip(clientX, clientY) {
  const tip = document.getElementById('hex-tip');
  if (!tip || tip.style.display === 'none') return;
  const pad = 10;
  tip.style.left = (clientX + 14) + 'px';
  tip.style.top  = (clientY + 14) + 'px';

  const vw = window.innerWidth, vh = window.innerHeight;
  const rect = tip.getBoundingClientRect();
  if (rect.right > vw - pad) tip.style.left = (vw - rect.width - pad) + 'px';
  if (rect.bottom > vh - pad) tip.style.top = (vh - rect.height - pad) + 'px';
}

function hideHexTooltip() {
  const tip = document.getElementById('hex-tip');
  if (tip) tip.style.display = 'none';
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

  function computeHoverOrCountryPreview(panelIdx, q, r, { withCtrl=false, withShift=false, withAlt=false } = {}) {
    if (withAlt) {
      const hex = App.hexMapsByPanel[panelIdx]?.get(`${q},${r}`);
      const cid = hex?.country_id ? normalizeCountryId(hex.country_id) : null;
      if (!cid) return new Set();

      // 复制面板：只在本面板预览
      if (App.altIsolatedPanels.has(panelIdx)) {
        return getCountryKeysInPanel(panelIdx, cid);
      }
      // 其它面板：保持原逻辑，跨面板
      return getCountryKeysAllPanels(cid);
    }

    return ModeUI.computeHoverPreview(panelIdx, q, r, { withCtrl, withShift });
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

      // ★ 新增：彻底清理悬停预览与路线/排除态，避免回到 Group 后残影
      App.selectedRouteIds.clear();
      App.excludedHexKeys.clear();
      App.highlightedHexKeys.clear();
      recomputePersistentFromRoutes();   // 会把 persistent 与路线状态同步一遍（此时为空集）
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
      updateHexStyles();
      publishToStepAnalysis();


      // 显示：Group 按钮绿；行为：单击走 Group 选择
      computeAndApply({ ctrl:false, meta:false, shift:false });
    }

    // 路线的可见点（已被排除的点不参与高亮/预览）
    function visiblePathKeys(link) {
      const out = [];
      const path = Array.isArray(link?.path) ? link.path : [];
      for (let i = 0; i < path.length; i++) {
        const p = path[i];
        const pIdx = resolvePanelIdxForPathPoint(p, link, i);
        const k = pkey(pIdx, p.q, p.r);
        if (!App.excludedHexKeys.has(k)) out.push(k);
      }
      return out; // Array<"panelIdx|q,r">
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
              visiblePathKeys(link).forEach(k => result.add(k));
            }
          });
          return result;
        }

        // 已有锚点：高亮当前 route 全路径；并依据 armed/端点给出暗示
        const link = findLinkById(App.insertMode.routeId);
        if (link) {
          visiblePathKeys(link).forEach(k => result.add(k));

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
            visiblePathKeys(link).forEach(k => result.add(k));
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
            visiblePathKeys(link).forEach(k => result.add(k));
            added = true;
          }
        });
        if (!added) {
          (App._lastLinks || []).forEach(link => {
            if (!isSelectableRoute(link)) return;
            if (linkContainsNode(link, panelIdx, q, r)) {
              visiblePathKeys(link).forEach(k => result.add(k));
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
        const alt      = overrides ? !!overrides.alt   : !!App.modKeys.alt;
        App.highlightedHexKeys = alt
          ? computeHoverOrCountryPreview(panelIdx, q, r, { withCtrl: ctrlLike, withShift: shift, withAlt: alt })
          : ModeUI.computeHoverPreview(panelIdx, q, r, { withCtrl: ctrlLike, withShift: shift });
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
      App.highlightedHexKeys.clear();
      App.hoveredHex = null;
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
      if (e.key === 'Alt')     App.modKeys.alt  = down;

      ModeUI.computeAndApply();  // ← 读取 App.modKeys，自动回落

      // ★ 若正在悬停，重算预览
      if (App.hoveredHex) {
          const { panelIdx, q, r } = App.hoveredHex;
          App.highlightedHexKeys = computeHoverOrCountryPreview(panelIdx, q, r, {
            withCtrl: (App.modKeys.ctrl || App.modKeys.meta),
            withShift: App.modKeys.shift,
            withAlt:  App.modKeys.alt
          });
          updateHexStyles();
        }

      if (!down && e.key === 'Alt') {
        App.activeAltCountry = null;   // ★ 退出 ALT，清掉当前国家
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
      App.modKeys = { ctrl:false, meta:false, shift:false, alt:false };
      App.uiPref.route = false;
      App.uiPref.connectArmed = false;
      ModeUI.forceGroupDefault();
    };

    window.addEventListener('blur', onBlur);
    cleanupFns.push(() => window.removeEventListener('blur', onBlur));
 
    // 初始化：默认 Cluster 绿
    App.modKeys = { ctrl:false, meta:false, shift:false, alt:false };
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

    // ... 现有 addBtn 之后
    const releaseBtn = document.createElement('button');
    releaseBtn.className = 'subspace-release';
    releaseBtn.textContent = '↺';                   // 或者 'R'
    releaseBtn.title = 'Release selections in this subspace';
    releaseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idxNow = Number(div.dataset.index ?? i);
      releaseSubspaceSelections(idxNow);            // ← 调用下面的新函数
    });
    div.appendChild(releaseBtn);


    const addBtn = document.createElement('button');
    addBtn.className = 'subspace-add';
    addBtn.textContent = '+';
    addBtn.title = 'Duplicate Subspace';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idxNow = Number(div.dataset.index ?? i);
      _duplicateSubspaceByIndex(idxNow);
    });
    div.appendChild(addBtn);

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

    // ★ 新增：panel 背景点击捕获（空白处点击=回到 Group 并清理选集）
    let bg = svg.select('rect.bg-capture');
    if (bg.empty()) {
      bg = svg.insert('rect', ':first-child')   // 放在最底层
        .attr('class', 'bg-capture')
        .attr('x', 0).attr('y', 0)
        .attr('fill', 'transparent')
        .on('click', (evt) => {
          // Alt + 空白：只清国家聚焦（其他逻辑照旧）
          if (evt && evt.altKey) {
            setCountryFocus(null, null);
          }

          App.selectedHex = null;
          App.neighborKeySet.clear();
          App.selectedRouteIds.clear();
          App.excludedHexKeys.clear();
          App.persistentHexKeys.clear();
          App.highlightedHexKeys.clear();

          drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
          App.hoveredHex = null;
          updateHexStyles();
          publishToStepAnalysis();
          ModeUI.forceGroupDefault();
        });
    }
    // 保持尺寸同步
    bg.attr('width', width).attr('height', height);

    // 容器组
    let container = svg.select('g');
    if (container.empty()) container = svg.append('g');

    console.log('=== DEBUG space.hexList ===', {
      panelIdx,
      hexListLength: space.hexList?.length || 0,
      firstHex: space.hexList?.[0],
      hasSummary: space.hexList?.[0]?.summary !== undefined,
      summaryValue: space.hexList?.[0]?.summary
    });
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

    // 为当前 panel 建立国家索引
    const cmap = new Map(); // country_id -> Set(keys)
    hexList.forEach(h => {
      if (!h.country_id) return;
      const normId = normalizeCountryId(h.country_id);  // ★ 归一化
      const k = `${panelIdx}|${h.q},${h.r}`;
      if (!cmap.has(normId)) cmap.set(normId, new Set());
      cmap.get(normId).add(k);
    });
    App.countryKeysByPanel[panelIdx] = cmap;

    // ★ 新增：合并到全局索引
    cmap.forEach((set, cid) => {
      if (!App.countryKeysGlobal.has(cid)) App.countryKeysGlobal.set(cid, new Set());
      const gset = App.countryKeysGlobal.get(cid);
      set.forEach(k => gset.add(k));   // k 形如 "panel|q,r"
    });

    // 初始/持久化变换
    const savedZoom = App.panelStates[panelIdx]?.zoom;
    const defaultTransform = d3.zoomIdentity
      .translate((width / 2) - centerX, (height / 2) - centerY/2)
      .scale(0.6);

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
            // // 若已经处于“国家聚焦”锁定，悬停不再改写高亮集合
            App.hoveredHex = { panelIdx, q: d.q, r: d.r };
            if (App.flightStart) App.flightHoverTarget = { panelIdx, q: d.q, r: d.r };

            const withCtrl  = isCtrlLike(event);
            const withShift = !!event.shiftKey;
            const withAlt   = !!event.altKey;

            App.highlightedHexKeys = computeHoverOrCountryPreview(
              panelIdx, d.q, d.r,
              { withCtrl, withShift, withAlt }
            );
            updateHexStyles();

            // —— Tooltip: 读取 msu 数、summary、国家颜色 —— //
            const hex = App.hexMapsByPanel?.[panelIdx]?.get(`${d.q},${d.r}`) || d;

            // 1) 统计 MSU 数
            const msuCount = Array.isArray(hex?.msu_ids) ? hex.msu_ids.length : 0;

            // 2) 读取 summary（后端放在 hex 对象上；没有就为空字符串）
            // console.log('renderHexgridfromdata', hex);    //这里就没有summary
            const summary = (hex && typeof hex.summary === 'string') ? hex.summary : '';

            // 3) 取当前“国家色”（优先用面板内覆盖色；否则用聚焦色；最后兜底基础填充）
            let color = '#A0A0A0';
            const rawCid = hex?.country_id || null;
            if (rawCid) {
              const cid = normalizeCountryId(rawCid); // 你已有
              // 你项目里面板级颜色存储在 App.panelCountryColors（Map）
              // 先查面板覆盖色
              const panelMap = App.panelCountryColors?.get(panelIdx);
              const rec = panelMap?.get?.(cid);
              if (rec?.color) {
                color = rec.color;
              } else if (App.focusCountryId && normalizeCountryId(App.focusCountryId) === cid) {
                // 聚焦中的国家就用默认聚焦色（与改色菜单默认一致）
                color = (STYLE.FOCUS_COUNTRY_FILL || '#FCFCFC');
              } else {
                // 最后兜底：按该 hex 的 modality 取基础色
                color = (hex?.modality === 'image') ? App.config.hex.imageFill
                    : (hex?.modality === 'text')  ? App.config.hex.textFill
                    : (App.config.background || '#ffffff');
              }
            }
            // 4) 显示 tooltip（用 client 坐标）
            console.log('renderHexgridfromdata', color, msuCount, summary);
            showHexTooltip(event.clientX, event.clientY, { color, msuCount, summary });

          })

          .on('mousemove', (event) => {
            moveHexTooltip(event.clientX, event.clientY);
          })

          .on('mouseout', (event, d) => {
            if (App.hoveredHex?.panelIdx === panelIdx && App.hoveredHex.q === d.q && App.hoveredHex.r === d.r) {
              App.hoveredHex = null;
            }
            // 无论是否有国家聚焦，都清理预览集合
            App.highlightedHexKeys.clear();
            updateHexStyles();
            hideHexTooltip();
          })
          
          .on('click', (event, d) => {
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
            // ★ FIX: 立即把这格的完整数据抛给上层（不等状态机完成）
            if (typeof App.onHexClick === 'function') {
              const hex = App.hexMapsByPanel?.[panelIdx]?.get(`${d.q},${d.r}`) || d;
              const msu_ids = Array.isArray(hex?.msu_ids) ? hex.msu_ids : [];
              const msu = resolveMSUs(msu_ids);
              try {
                App.onHexClick({
                  panelIdx,
                  q: d.q, r: d.r,
                  modality: hex?.modality || '',
                  country_id: hex?.country_id || null,
                  label: hex?.label || `${d.q},${d.r}`,
                  msu_ids,
                  msu
                });
              } catch (e) { console.warn(e); }
            }

          }).on('dblclick', (event, d) => {
            event.preventDefault(); event.stopPropagation();
            if (App._clickTimer) { clearTimeout(App._clickTimer); App._clickTimer = null; }
            handleDoubleClick(panelIdx, d.q, d.r, event);
          }).on('contextmenu', (event, d) => {
              event.preventDefault(); // 屏蔽系统右键
              // 仅在 Alt 聚焦语义下启用右键菜单（并且这个 hex 有 country_id）
              const hex = App.hexMapsByPanel?.[panelIdx]?.get(`${d.q},${d.r}`) || d;
              const rawCid = hex?.country_id || null;
              if (!App.modKeys.alt || !rawCid) return;

              const cid = normalizeCountryId(rawCid);

              // 决定改“本面板”还是“跨面板”
              // 按你的语义：如果这个面板在 altIsolatedPanels 里 → 只作用于本面板；
              // 否则我们也只对“当前面板”改色（避免误改其它面板）。
              const targetPanel = panelIdx;

              // 准备 ramp（基于该面板内的该国全部 hex）
              const { keys, alphaByKey } = buildAlphaRampFor(targetPanel, cid);

              // 选择初始色：已有覆盖色 > 默认聚焦色
              const curOv = getCountryColorOverride(targetPanel, cid);
              const initColor = curOv?.color || STYLE.FOCUS_COUNTRY_FILL || '#FCFCFC';

              // 保存为“临时预览”
              App._pendingColorEdit = {
                panelIdx: targetPanel,
                countryId: cid,
                color: initColor,
                keys,
                alphaByKey
              };

              // 打开菜单到鼠标处
              showColorMenu(event.clientX, event.clientY, initColor);
              updateHexStyles(); // 让预览立即生效
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
    // hexList.forEach(d => hexMap.set(`${d.q},${d.r}`, d));
    hexList.forEach(d => {
      // console.log('Building hexMap:', d.q, d.r, 'summary:', d.summary, 'full object:', d);
      hexMap.set(`${d.q},${d.r}`, d);
    });
    App.hexMapsByPanel[panelIdx] = hexMap;

    updateHexStyles();
  }

  function drawCountries(space, svg, hexRadius, opts = {}) {
    const focusId  = opts.focusCountryId || null;
    const focusMode= opts.focusMode || null; // 'filled'|'outline'|null
    const container = svg.select('g');
    container.selectAll('.country-border').remove();

    // 1) claimMap: (q,r) -> Set(country_id)
    const claimMap = new Map();
    (space.countries || []).forEach(cn => {
      const cid = normalizeCountryId(cn.country_id);
      (cn.hexes || []).forEach(h => {
        const k = `${h.q},${h.r}`;
        if (!claimMap.has(k)) claimMap.set(k, new Set());
        claimMap.get(k).add(cid);
      });
    });

    // 2) 像素位置索引
    const hexDict = new Map();
    container.selectAll('g.hex').each(function(d){
      hexDict.set(`${d.q},${d.r}`, { x: d.x, y: d.y });
    });
    const dirs = [[+1,0],[0,+1],[-1,+1],[-1,0],[0,-1],[+1,-1]];
    const hexCorner = (i) => {
      const ang = Math.PI/3 * i;
      return [hexRadius*Math.cos(ang), hexRadius*Math.sin(ang)];
    };
    const edgeKey = (ax,ay,bx,by) => {
      const k1 = `${ax},${ay}`, k2 = `${bx},${by}`;
      return (k1 < k2) ? `${k1}_${k2}` : `${k2}_${k1}`;
    };
    const edgeEndpoints = (cx, cy, i) => {
      const p1 = hexCorner(i);
      const p2 = hexCorner((i+1)%6);
      return [[cx+p1[0], cy+p1[1]], [cx+p2[0], cy+p2[1]]];
    };

    // 3) 两类边：otherEdges（很浅） 与 focusEdges（正常）
    const focusCid = focusId; 
    const otherEdges = new Map(); // key -> {a,b,dashed}
    const focusEdges = new Map();

    claimMap.forEach((currSet, qr) => {
      const [qStr, rStr] = qr.split(',');
      const q = +qStr, r = +rStr;
      const hex = hexDict.get(qr);
      if (!hex) return;

      for (let i=0; i<6; i++) {
        const [dq, dr] = dirs[i];
        const nq = q + dq, nr = r + dr;
        const nKey = `${nq},${nr}`;
        const nbSet = claimMap.get(nKey) || new Set(); // 邻居可为空（外部）

        // 内部边（集合相同）跳过
        const same =
          currSet.size === nbSet.size &&
          [...currSet].every(c => nbSet.has(c));
        if (same) continue;

        // 冲突：任一侧多国认领
        const dashed = (currSet.size > 1) || (nbSet.size > 1);
        const [a,b] = edgeEndpoints(hex.x, hex.y, i);
        const k = edgeKey(a[0],a[1], b[0],b[1]);

        if (!focusCid) {
          // ★ 非 Alt：如你之前的逻辑（全部国家一起画）
          const prev = otherEdges.get(k);
          if (prev) prev.dashed = prev.dashed || dashed;
          else otherEdges.set(k, { a, b, dashed });
        } else {
          // ★ Alt：只把“focus 国家格子与非 focus 邻居”的边划到 focusEdges；
          // 其余边归 other（很浅显示）
          const currHasFocus = currSet.has(focusCid);
          const nbHasFocus   = nbSet.has(focusCid);

          // 只要 curr 有 focus，且邻居“不完全相同”，且（邻居里不含 focus 或为空/他国），就是焦点外边
          if (currHasFocus && !nbHasFocus) {
            const prev = focusEdges.get(k);
            if (prev) prev.dashed = prev.dashed || dashed;
            else focusEdges.set(k, { a, b, dashed });
          } else {
            const prev = otherEdges.get(k);
            if (prev) prev.dashed = prev.dashed || dashed;
            else otherEdges.set(k, { a, b, dashed });
          }
        }
      }
    });

    // 4) 绘制
    // other：outline 模式下，其他边界完全隐藏；filled / 无聚焦则按原逻辑
    otherEdges.forEach(({a,b,dashed}) => {
      const show = focusId
        ? (focusMode === 'filled' ? true : false) // outline 不画 other
        : true;
      if (!show) return;

      container.append('line')
        .attr('class', 'country-border country-border-other')
        .attr('x1', a[0]).attr('y1', a[1])
        .attr('x2', b[0]).attr('y2', b[1])
        .attr('stroke', App.config.countryBorder.color)
        .attr('stroke-width', App.config.countryBorder.width)
        .attr('stroke-opacity', focusId ? STYLE.BORDER_ALT_OTHER : 1)
        .attr('stroke-dasharray', dashed ? '6,4' : null)
        .attr('pointer-events', 'none');
    });

    // focus：outline/filled 都画，但在 outline 下更突出
    if (focusId) {
      focusEdges.forEach(({a,b,dashed}) => {
        container.append('line')
          .attr('class', 'country-border country-border-focus')
          .attr('x1', a[0]).attr('y1', a[1])
          .attr('x2', b[0]).attr('y2', b[1])
          .attr('stroke', App.config.countryBorder.color)
          .attr('stroke-width', App.config.countryBorder.width)
          .attr('stroke-opacity', 1) // 聚焦边界始终清晰
          .attr('stroke-dasharray', dashed ? '6,4' : null)
          .attr('pointer-events', 'none');
      });
    }
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
    App.subspaceSvgs.forEach((svg, panelIdx) => {
      const override = App.panelFocusOverrides.get(panelIdx);
      const focusCid  = override && override.countryId ? normalizeCountryId(override.countryId)
                                                      : (App.focusCountryId ? normalizeCountryId(App.focusCountryId) : null);
      const focusMode = override && override.mode ? override.mode : (App.focusMode || null);

      svg.selectAll('g.hex').each(function(d) {
        const gSel  = d3.select(this);
        const path  = gSel.select('path');
        const hatch = gSel.select('path.hex-hatch');
        const key   = `${panelIdx}|${d.q},${d.r}`;
        const baseFill = getHexFillColor(d);

        // —— 国家与 Alt 焦点 —— //
        const thisCid = d.country_id ? normalizeCountryId(d.country_id) : null;
        const isFocusHex = !!(focusCid && thisCid === focusCid);

        // Alt=filled 时你的原底层
        let focusBaseFill    = baseFill;
        let focusBaseOpacity = STYLE.OPACITY_DEFAULT;
        if (focusCid && focusMode === 'filled') {
          focusBaseFill    = isFocusHex ? STYLE.FOCUS_COUNTRY_FILL : baseFill;
          focusBaseOpacity = isFocusHex ? STYLE.OPACITY_SELECTED   : STYLE.OPACITY_NONFOCUS;
        }

        // —— 已确认颜色覆盖（面板级按国家） —— //
        const ov = thisCid ? getCountryColorOverride(panelIdx, thisCid) : null;
        const confirmedColor = ov ? ov.color : null;
        const confirmedAlpha = ov ? (ov.alphaByKey.get(key) ?? null) : null;

        // —— 临时预览（仅 Alt 焦点的 pending） —— //
        let previewColor = null;
        let previewAlpha = null;
        if (App._pendingColorEdit && isFocusHex) {
          const p = App._pendingColorEdit;
          if (p.panelIdx === panelIdx && p.countryId === thisCid && p.keys.has(key)) {
            previewColor = p.color;
            previewAlpha = p.alphaByKey.get(key) ?? null;
          }
        }

        // —— 交互态 —— //
        const isSelected    = App.persistentHexKeys.has(key);
        const isHovered     = !!(App.hoveredHex && App.hoveredHex.panelIdx === panelIdx && App.hoveredHex.q === d.q && App.hoveredHex.r === d.r);
        const isFlightStart = !!(App.flightStart  && App.flightStart.panelIdx  === panelIdx && App.flightStart.q === d.q && App.flightStart.r === d.r);
        const isFlightHover = !!(App.flightHoverTarget && App.flightHoverTarget.panelIdx === panelIdx && App.flightHoverTarget.q === d.q && App.flightHoverTarget.r === d.r);

        const inPreview         = App.highlightedHexKeys.has(key);
        const isPreviewCenter   = inPreview && isHovered;
        const isPreviewNeighbor = inPreview && !isPreviewCenter;

        // —— 计算：是否此刻应使用覆盖色 —— //
        const hasAnyOverride = !!(previewColor || confirmedColor);
        const inActiveInteraction = isSelected || isHovered || isPreviewCenter || isPreviewNeighbor || isFlightStart || isFlightHover;
        const useOverrideColorNow =
          hasAnyOverride && ( (focusMode === 'filled' && isFocusHex) || inActiveInteraction );

        // 1) 最终填充色
        let finalFill = useOverrideColorNow
          ? (previewColor || confirmedColor)
          : ((focusCid && focusMode === 'filled') ? focusBaseFill : baseFill);

        // 2) 基底透明度（优先使用每个 hex 保存的 alpha 渐变）
        let baseOpacity = (focusCid && focusMode === 'filled') ? focusBaseOpacity : STYLE.OPACITY_DEFAULT;
        if (useOverrideColorNow) {
          const a = (previewAlpha != null) ? previewAlpha
                : (confirmedAlpha != null) ? confirmedAlpha
                : null;
          if (a != null) baseOpacity = a;
        } else if (isSelected && !hasAnyOverride) {
          // 没有覆盖色时，选中态维持老逻辑更亮一些
          baseOpacity = Math.max(baseOpacity, STYLE.OPACITY_SELECTED);
        }

        // 3) 交互叠加透明度（不要把有覆盖色的选中态硬拉到 1）
        let overlayOpacity = STYLE.OPACITY_DEFAULT;
        if (isHovered || isFlightStart || isFlightHover) {
          overlayOpacity = STYLE.OPACITY_HOVER;
        } else if (isPreviewCenter) {
          overlayOpacity = STYLE.OPACITY_PREVIEW_CENTER;
        } else if (isPreviewNeighbor) {
          overlayOpacity = STYLE.OPACITY_PREVIEW_NEIGHBOR;
        } else if (isSelected && !useOverrideColorNow) {
          overlayOpacity = STYLE.OPACITY_SELECTED;
        }

        const finalOpacity = Math.max(baseOpacity, overlayOpacity);

        // 预览邻居的斜线填充
        const needHatch = isPreviewNeighbor;
        hatch.attr('fill', needHatch ? `url(#hex-hatch-${panelIdx})` : 'none');
        path .attr('fill', finalFill).attr('fill-opacity', finalOpacity);
      });
    });

    // —— 边界重绘（保持你的原逻辑）—— //
    App.currentData?.subspaces?.forEach((space, i) => {
      const svg = App.subspaceSvgs[i];
      if (!svg || svg.empty()) return;

      const override = App.panelFocusOverrides.get(i);
      const focusCid  = override && override.countryId ? normalizeCountryId(override.countryId)
                                                      : (App.focusCountryId ? normalizeCountryId(App.focusCountryId) : null);
      const focusMode = override && override.mode ? override.mode : (App.focusMode || null);

      drawCountries(space, svg, App.config.hex.radius, {
        focusCountryId: focusCid,
        focusMode: focusMode
      });
    });
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

        // ★ 关键：如果任一端被排除了，就不要把这条边放进连通图
        if (App.excludedHexKeys.has(ka) || App.excludedHexKeys.has(kb)) continue;

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
      const msu_ids = Array.isArray(hex.msu_ids) ? hex.msu_ids : [];
      const msu = resolveMSUs(msu_ids);
      nodes.push({
        id: `${panelIdx}:${q},${r}`,
        panelIdx, q, r,
        label: hex.label || `${q},${r}`,
        modality: hex.modality || '',
        country_id: hex.country_id || null,
        msu_ids,            // ★ FIX
        msu                 // ★ FIX
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
        const msu_ids = Array.isArray(hex.msu_ids) ? hex.msu_ids : [];
        const msu = resolveMSUs(msu_ids);
        nodes.push({
          id: `${panelIdx}:${q},${r}`,
          panelIdx, q, r,
          label: hex.label || `${q},${r}`,
          modality: hex.modality || '',
          country_id: hex.country_id || null,
          msu_ids,            // ★ FIX
          msu                 // ★ FIX
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

    // ★★★ Alt：国家聚焦/切换
    // ★ Alt：国家聚焦（支持面板隔离）
    if (App.modKeys.alt) {
      const hex = App.hexMapsByPanel[panelIdx]?.get(`${q},${r}`);
      const raw = hex?.country_id || null;
      const isolated = App.altIsolatedPanels.has(panelIdx); // ← 是否隔离面板

      if (!raw) {
        // 点在无国家处：清聚焦
        if (isolated) {
          App.panelFocusOverrides.set(panelIdx, { countryId: null, mode: null });
        } else {
          setCountryFocus(null, null); // 你已有的全局函数
        }
        updateHexStyles();
        return;
      }

      const cid = normalizeCountryId(raw);

      if (isolated) {
        // ★ 面板级：只切换当前面板的 focus
        const cur = App.panelFocusOverrides.get(panelIdx);
        if (!cur || cur.countryId !== cid) {
          App.panelFocusOverrides.set(panelIdx, { countryId: cid, mode: 'filled' });
        } else {
          const next = (cur.mode === 'filled') ? 'outline' : 'filled';
          App.panelFocusOverrides.set(panelIdx, { countryId: cid, mode: next });
        }
      } else {
        // 原行为：全局联动
        if (!App.focusCountryId) {
          setCountryFocus(cid, 'filled');
        } else if (App.focusCountryId === cid) {
          setCountryFocus(cid, App.focusMode === 'filled' ? 'outline' : 'filled');
        } else {
          setCountryFocus(cid, 'filled');
        }
      }

      updateHexStyles(); // 关键：让边框与填充同步
      return;
    }

    // ★★★ 非 Alt 点击：先把“Alt 整国着色”关掉（仅关视觉聚焦，不清你的颜色记录）
    // clearAltFocusForPanelOnNormalClick(panelIdx);
    degradeFocusToOutlineFor(panelIdx);

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
          App.highlightedHexKeys.clear();
          App.hoveredHex = null;
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
      const key = pkey(panelIdx, q, r);
      let needsRecompute = false;  // 只有涉及“整条线路”时才重算

      if (App.persistentHexKeys.has(key)) {
        // 已选 → 标记为排除（仅当存在路线选择时才需要重算）
        App.excludedHexKeys.add(key);
        App.persistentHexKeys.delete(key);
        needsRecompute = (App.selectedRouteIds.size > 0);
      } else {
        let addedRoute = false;

        // 规则一：优先选“以该点为起点”的所有线路
        (App._lastLinks || []).forEach(link => {
          if (!isSelectableRoute(link)) return;
          if (isStartOfLink(link, panelIdx, q, r)) {
            App.selectedRouteIds.add(linkKey(link));
            addedRoute = true;
          }
        });

        // 规则二：否则，选中所有“包含该点”的线路
        if (!addedRoute) {
          (App._lastLinks || []).forEach(link => {
            if (!isSelectableRoute(link)) return;
            if (linkContainsNode(link, panelIdx, q, r)) {
              App.selectedRouteIds.add(linkKey(link));
              addedRoute = true;
            }
          });
        }

        // 规则三（兜底）：如果数据里根本没有命中任何线路，至少选中“当前点”
        App.excludedHexKeys.delete(key);
        if (addedRoute) {
          needsRecompute = true;
        } else {
          // 兜底直接落到节点集合，不重算（避免被清空）
          App.persistentHexKeys.add(key);
        }
      }

      if (needsRecompute) {
        recomputePersistentFromRoutes();
      }

      App.selectedHex = { panelIdx, q, r };
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
      App.highlightedHexKeys.clear();
      App.hoveredHex = null;
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
    App.highlightedHexKeys.clear();
    App.hoveredHex = null;
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
    console.log("flight:", flight);
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
      if (e.key === 'Escape') {
        // 先退插入模式
        if (App.insertMode) { endInsertMode(false); }
        // 再退国家聚焦
        if (App.focusCountryId) { setCountryFocus(null); }
      }
      if (e.key === 'Enter')  { if (App.insertMode) endInsertMode(true); }
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
    App.countryKeysGlobal = new Map();   // ★ 新增：全量重建前清空

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
    moveHexTooltip(event.clientX, event.clientY);
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
      App.highlightedHexKeys.clear(); // ★ 新增：把悬停预览也清掉
      // ★ 清空后也要重画，恢复默认线路形态
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
      App.highlightedHexKeys.clear();
      App.hoveredHex = null;
      // App.focusCountryId = null;    // ★ 退出国家聚焦
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

      // 双击空白才取消国家聚焦
      App.focusCountryId = null;
      App.highlightedHexKeys.clear();

      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
      App.highlightedHexKeys.clear();
      App.panelFocusOverrides.clear();   // 如果不想清，删掉这行

      App.hoveredHex = null;  
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

function releaseSubspaceSelections(panelIdx) {
  // 1) 清掉本面板的节点选择/预览/排除
  const dropKeysOfPanel = (set) => {
    for (const k of Array.from(set)) {
      const [p] = k.split('|');
      if (+p === panelIdx) set.delete(k);
    }
  };
  dropKeysOfPanel(App.persistentHexKeys);
  dropKeysOfPanel(App.highlightedHexKeys);
  dropKeysOfPanel(App.excludedHexKeys);

  // 如果当前“悬停点/起点/临时目标”在本面板，也一并清理
  if (App.hoveredHex?.panelIdx === panelIdx) App.hoveredHex = null;
  if (App.flightStart?.panelIdx === panelIdx) App.flightStart = null;
  if (App.flightHoverTarget?.panelIdx === panelIdx) App.flightHoverTarget = null;
  if (App.selectedHex?.panelIdx === panelIdx) App.selectedHex = null;

  // 2) 若存在“整条线路选择”，把这条线路中属于本面板的点全部标记为排除，
  //    这样路线仍可在其它面板高亮，但本面板将“回到未选择态”
  (App._lastLinks || []).forEach(link => {
    if (!isSelectableRoute(link)) return;
    const lk = linkKey(link);
    if (!App.selectedRouteIds.has(lk)) return;          // 只处理被选中的线路
    const path = Array.isArray(link.path) ? link.path : [];
    for (let i = 0; i < path.length; i++) {
      const pIdx = resolvePanelIdxForPathPoint(path[i], link, i);
      if (pIdx === panelIdx) {
        App.excludedHexKeys.add(`${panelIdx}|${path[i].q},${path[i].r}`);
      }
    }
  });

  // 3) 清掉本面板的 Alt 聚焦（不影响其它面板，也不影响全局）
  //    这样“release”后就不会继续因为全局 focusCountryId 而显示边框/底色
  App.panelFocusOverrides.set(panelIdx, { countryId: null, mode: null });

  // 4) 重绘
  recomputePersistentFromRoutes();  // 用“选中线路-排除点”重算一次持久集
  drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
  updateHexStyles();
  publishToStepAnalysis();
}


function _duplicateSubspaceByIndex(srcIdx) {
  if (!App.currentData?.subspaces?.[srcIdx]) return;
  const src = App.currentData.subspaces[srcIdx];

  // 1) 深拷贝整个子空间（包含 hexList & countries）
  const cloned = JSON.parse(JSON.stringify(src));

  // ★ 在标题后追加 Copy
  cloned.subspaceName = (src.subspaceName || `Subspace${srcIdx}`) + ' Copy';

  // 2) 挂到数据上
  const newIndex = App.currentData.subspaces.length;
  App.currentData.subspaces.push(cloned);

  // 3) 渲染这个新面板
  createSubspaceElement(cloned, newIndex);
  renderHexGridFromData(newIndex, cloned, App.config.hex.radius);

  // ★ 新增：复制出来的面板 Alt 只影响自己
  App.altIsolatedPanels.add(newIndex);
  // ★ 新增：给该面板准备本地聚焦容器
  App.panelFocusOverrides.set(newIndex, { countryId: null, mode: null });

  // 4) 正常刷新
  drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
  updateHexStyles();
  observePanelResize();
  applyResponsiveLayout(true);
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
  App.highlightedHexKeys.clear();
  App.hoveredHex = null;
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

// 把当前主视图里“面板级国家颜色覆盖”整理成两张映射表：
// - byPanel: { "panelIdx|countryId": "#RRGGBB", ... }（优先）
// - byCountry: { countryId: "#RRGGBB", ... }（可留空/备用）
function exportMiniColorMaps() {
  const byPanel = {};   // 面板+国家 优先映射
  App.panelCountryColors.forEach((countryMap, panelIdx) => {
    countryMap.forEach((rec, countryIdRaw) => {
      const cid = normalizeCountryId(countryIdRaw);
      byPanel[`${panelIdx}|${cid}`] = rec?.color || '#FFFFFF';
    });
  });

  // 如果你暂时没有“全局国家色”，可以先留空对象
  const byCountry = {};
  return { byPanel, byCountry };
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
    duplicateSubspace(idx) { 
      _duplicateSubspaceByIndex(idx); 
    },
    setOnMainTitleRename(fn) {
      App.onMainTitleRename = typeof fn === 'function' ? fn : null;
    },
    setCountryIdAlias(aliasObj = {}) {
      App.countryIdAlias = new Map(Object.entries(aliasObj || {}));
      // 重新基于现有渲染数据构建索引，让别名立刻生效
      (App.currentData?.subspaces || []).forEach((space, i) => {
        renderHexGridFromData(i, space, App.config.hex.radius);
      });
      updateHexStyles();
    },

    pulseSelection() { publishToStepAnalysis(); },
    getSelectionSnapshot() {
        let snap;
        if (App.selectedRouteIds && App.selectedRouteIds.size > 0) {
          snap = snapshotFromSelectedRoutes();
        } else {
          const keySet = (App.highlightedHexKeys && App.highlightedHexKeys.size)
            ? App.highlightedHexKeys
            : App.persistentHexKeys;
          snap = snapshotFromKeySet(keySet || new Set());
        }
        const focusId = App.selectedHex
          ? `${App.selectedHex.panelIdx}:${App.selectedHex.q},${App.selectedHex.r}`
          : null;

        // 想一起返回也可以（可选）
        const mini = _buildMiniSnapshot();
        return { ...snap, meta: { focusId, miniPalette: mini } };
      },

      // ✅ 单独提供 getMiniColorMaps 给 MainView.vue 用
      getMiniColorMaps() {
        return _buildMiniSnapshot();
      },

      // 可选
      getCountryIdNormalizer() {
        return (cid) => App.countryIdAlias?.get?.(cid) || cid;
      },

      // ★ FIX: 通过坐标直接拿该格完整信息
      getHexDetail(panelIdx, q, r) {
        const hex = App.hexMapsByPanel?.[panelIdx]?.get(`${q},${r}`);
        if (!hex) return null;
        const msu_ids = Array.isArray(hex.msu_ids) ? hex.msu_ids : [];
        const msu = resolveMSUs(msu_ids);
        return {
          panelIdx, q, r,
          modality: hex.modality || '',
          country_id: hex.country_id || null,
          label: hex.label || `${q},${r}`,
          msu_ids,
          msu
        };
      },

      // ★ FIX: 设置点击回调
      setOnHexClick(fn) {
        App.onHexClick = (typeof fn === 'function') ? fn : null;
      },

      // ① 给右侧卡片或外部调用：取当前的颜色映射快照
      getColorMaps() {
        return _buildColorMapsSnapshot();
      },

      // ②（可选）暴露基础填充，做兜底
      getBaseFillColors() {
        return {
          text:   App.config?.hex?.textFill   || '#DCDCDC',
          image:  App.config?.hex?.imageFill  || '#DCDCDC',
          def:    App.config?.background      || '#ffffff'
        };
      },


  };

  return controller;
}

export function destroySemanticMap(cleanup) {
  if (typeof cleanup === 'function') cleanup();
}


