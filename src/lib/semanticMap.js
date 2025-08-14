// src/lib/semanticMap.js
import * as d3 from 'd3';

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
  const keyOf = (q, r) => `${q},${r}`;
  const pkey = (panelIdx, q, r) => `${panelIdx}|${q},${r}`; // 持久集合用的 key

  function panelOfPoint(p, linkDefault, fallback) {
    return (p && typeof p.panelIdx === 'number') ? p.panelIdx
         : (typeof linkDefault === 'number' ? linkDefault : fallback);
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


  /** ==================
   *  DOM 构建/子空间
   *  ================== */
  function createSubspaceElement(space, i) {
    const div = document.createElement('div');
    div.className = 'subspace';
    div.style.position = 'absolute';

    const offsetX = STYLE.SUBSPACE_MIN_W + STYLE.SUBSPACE_GAP;   // 360 + 20 = 380
    const offsetY = STYLE.SUBSPACE_MIN_H + STYLE.SUBSPACE_GAP;   // 400 + 20 = 420

    div.style.left = (STYLE.SUBSPACE_DEFAULT_LEFT + offsetX * (i % 3)) + 'px';
    div.style.top  = (STYLE.SUBSPACE_DEFAULT_TOP  + offsetY * Math.floor(i / 3)) + 'px';
    div.style.resize = "both";
    div.style.overflow = "hidden";
    div.dataset.index = String(i);

    const title = document.createElement('div');
    title.className = 'subspace-title';
    title.innerText = space.subspaceName || `Subspace ${i + 1}`;
    div.appendChild(title);

    // 右上角删除按钮
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

    // 标题双击重命名（可回调后端）
    title.addEventListener('dblclick', () => {
      title.setAttribute('contenteditable', 'true');
      title.focus();
      const range = document.createRange();
      range.selectNodeContents(title);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);

      const finish = async () => {
        title.removeAttribute('contenteditable');
        const idx = Number(div.dataset.index || i);
        const newName = title.innerText.trim() || `Subspace ${idx + 1}`;
        title.innerText = newName;
        if (App.currentData?.subspaces?.[idx]) {
          App.currentData.subspaces[idx].subspaceName = newName;
        }
        if (typeof App.onSubspaceRename === 'function') {
          try { await App.onSubspaceRename(idx, newName); } catch(e) { console.warn(e); }
        }
      };
      title.addEventListener('blur', finish, { once: true });
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
        if (e.key === 'Escape') {
          e.preventDefault();
          title.removeAttribute('contenteditable');
          const idx = Number(div.dataset.index || i);
          title.innerText = App.currentData?.subspaces?.[idx]?.subspaceName || title.innerText;
        }
      }, { once: true });
    });

    const container = document.createElement('div');
    container.className = 'hex-container';
    container.style.position = "relative";
    container.style.width = "100%";
    container.style.height = "92%";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute('class', 'hex-svg');
    container.appendChild(svg);

    const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlay.setAttribute('class', 'overlay-svg');
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = App.config.road.zIndex;
    container.appendChild(overlay);

    const overlayD3 = d3.select(overlay);
    if (overlayD3.select("g").empty()) overlayD3.append("g");

    div.appendChild(container);
    App.playgroundEl.appendChild(div);
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
    App.zoomStates = [];
    subspaces.forEach((space, i) => createSubspaceElement(space, i));
  }

  /** =========
   * Hex 渲染
   * ========= */
  function renderHexGridFromData(panelIdx, space, hexRadius) {
    const svg = App.subspaceSvgs[panelIdx];
    const overlay = App.overlaySvgs[panelIdx];
    const width = svg.node().clientWidth || svg.node().parentNode.clientWidth;
    const height = svg.node().clientHeight || svg.node().parentNode.clientHeight;
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
      x: h.rawX - centerX + width / 2,
      y: h.rawY - centerY + height / 2,
      panelIdx
    }));
    App.allHexDataByPanel[panelIdx] = hexList;

    let lastTransform = App.zoomStates[panelIdx] || d3.zoomIdentity;
    const zoom = d3.zoom().scaleExtent([0.6, 2]).on("zoom", (event) => {
      container.attr("transform", event.transform);
      overlayG.attr("transform", event.transform);
      App.zoomStates[panelIdx] = event.transform;

      // 缩放时重绘 overlay 与高亮
      if (App._lastLinks) {
        drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
      }
      updateHexStyles();
    });
    svg.call(zoom).on("dblclick.zoom", null);
    container.attr("transform", lastTransform);
    overlayG.attr("transform", lastTransform);
    svg.call(zoom.transform, lastTransform);

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
      // 1) 预计算“邻居合集”（对所有持久高亮的点求 road/river 邻居并求并集）
      App.neighborKeySet.clear();
      for (const k of App.persistentHexKeys) {
        const [panelStr, qr] = k.split('|');
        const [qStr, rStr] = qr.split(',');
        const panelIdx = +panelStr, q = +qStr, r = +rStr;
        const ns = getConnectedHexKeys(panelIdx, q, r);
        ns.forEach(hk => App.neighborKeySet.add(`${panelIdx}|${hk}`));
      }

      // 如果你仍想保留“最近一次单击的点”的邻居高亮，也可以加上：
      if (App.selectedHex) {
        const ns2 = getConnectedHexKeys(App.selectedHex.panelIdx, App.selectedHex.q, App.selectedHex.r);
        ns2.forEach(hk => App.neighborKeySet.add(`${App.selectedHex.panelIdx}|${hk}`));
      }

      // 2) 应用样式
      App.subspaceSvgs.forEach((svg, panelIdx) => {
        svg.selectAll('g.hex').each(function(d) {
          const path = d3.select(this).select('path');
          let opacity = STYLE.OPACITY_DEFAULT;

          const isPersistent = App.persistentHexKeys.has(pkey(panelIdx, d.q, d.r));

          const isNeighbor =
            App.neighborKeySet.has(pkey(panelIdx, d.q, d.r));

          const isHovered =
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

          // 优先级：航线起点/目标/持久选中 > hover > 邻居 > 默认
          if (isPersistent || isFlightStart || isFlightHoverTarget) {
            opacity = STYLE.OPACITY_HOVER;   // or OPACITY_SELECTED
          } else if (isHovered) {
            opacity = STYLE.OPACITY_HOVER;      // 0.8
          } else if (isNeighbor) {
            opacity = STYLE.OPACITY_NEIGHBOR;   // 0.8（也可略低于 hover）
          } else {
            opacity = STYLE.OPACITY_DEFAULT;    // 0.2
          }

          path.attr('fill-opacity', opacity);
        });
      });
    }



  /** =========
   * 单/双击处理
   * ========= */
  function handleSingleClick(panelIdx, q, r) {
    const k = pkey(panelIdx, q, r);
    if (App.persistentHexKeys.has(k)) {
      App.persistentHexKeys.delete(k);   // 再点一次 -> 取消持久高亮
      // 若这也是当前 selectedHex，则清掉 selectedHex
      if (App.selectedHex &&
          App.selectedHex.panelIdx === panelIdx &&
          App.selectedHex.q === q &&
          App.selectedHex.r === r) {
        App.selectedHex = null;
      }
    } else {
      App.persistentHexKeys.add(k);      // 加入持久高亮
      App.selectedHex = { panelIdx, q, r };
    }
    updateHexStyles();
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
      return;
    }

    const same = App.flightStart.panelIdx === panelIdx &&
                App.flightStart.q === q &&
                App.flightStart.r === r;

    if (same) {
      App.flightStart = null;
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
      updateHexStyles();
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

  function enableSubspaceDrag(subspaceDiv, idx) {
    const title = subspaceDiv.querySelector('.subspace-title');
    let startX, startY, origLeft, origTop;
    let isDragging = false;
    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      subspaceDiv.style.left = (origLeft + dx) + "px";
      subspaceDiv.style.top  = (origTop  + dy) + "px";
      requestAnimationFrame(() => {
        drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, !!App.flightStart);
      });
    };
    const onMouseUp = () => { if (isDragging) { isDragging = false; document.body.style.userSelect = ""; } };
    title.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX; startY = e.clientY;
      origLeft = parseInt(subspaceDiv.style.left || 0);
      origTop  = parseInt(subspaceDiv.style.top  || 0);
      document.body.style.userSelect = "none";
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
          const svg = subspaceDiv.querySelector('svg.hex-svg');
          const overlay = subspaceDiv.querySelector('svg.overlay-svg');
          const width = subspaceDiv.clientWidth;
          const height = subspaceDiv.clientHeight * 0.92;
          if(svg) { svg.setAttribute('width', width); svg.setAttribute('height', height); }
          if(overlay){ overlay.setAttribute('width', width); overlay.setAttribute('height', height); }
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
    }
  };
  const onBlankDblClick = (e) => {
    if (e.target === App.playgroundEl) {
      App.flightStart = null;
      App.flightHoverTarget = null;
      drawOverlayLinesFromLinks(App._lastLinks, App.allHexDataByPanel, App.hexMapsByPanel, false);
      updateHexStyles();
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

  };

  return controller;
}


export function destroySemanticMap(cleanup) {
  if (typeof cleanup === 'function') cleanup();
}
