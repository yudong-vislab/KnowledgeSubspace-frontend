// src/lib/miniPathRenderer.js
import * as d3 from 'd3';

/**
 * 渲染一条 link 的“迷你路径概览”（横向一排 hex + 折线）
 * 会根据 path 长度自适应 svg 宽度；高度固定；六边形大小固定。
 *
 * @param {SVGElement} svgEl - 目标 <svg>
 * @param {Object} link - { type:'road'|'river'|'flight', path:[{panelIdx,q,r}] }
 * @param {Array} nodes - [{ id, panelIdx,q,r, modality, ... }]
 * @param {Object} opts
 *   - height {number}    : 画布高度（默认 30）
 *   - paddingX {number}  : 左右内边距（默认 10）
 *   - hexR {number}      : 六边形半径（默认 8）
 *   - dx {number}        : 相邻 hex 的水平间距（默认 52）
 *   - strokeWidth {number}: 线宽（默认 1.4）
 *   - yAdjust {number}   : 纵向微调（默认 0；>0 往下，<0 往上）
 */
export function renderMiniPath(svgEl, link, nodes, opts = {}) {
  const STYLE = {
    H: opts.height ?? 30,
    PADX: opts.paddingX ?? 10,
    HEX_R: opts.hexR ?? 8,
    DX: opts.dx ?? 52,
    STROKE_W: opts.strokeWidth ?? 1.4,
    Y_ADJUST: opts.yAdjust ?? 0,
    COLOR_TEXT: opts.baseTextColor  ?? '#DCDCDC',
    COLOR_IMAGE: opts.baseImageColor?? '#DCDCDC',
    COLOR_DEFAULT: opts.baseDefault ?? '#ffffff',
    ROAD:   { stroke:'#e9c46b', width:(opts.strokeWidth ?? 1.4), dash:null,  opacity:0.95 },
    RIVER:  { stroke:'#8fbadf', width:(opts.strokeWidth ?? 1.4), dash:null,  opacity:0.95 },
    FLIGHT: { stroke:'#4a5f7e', width:(opts.strokeWidth ?? 1.4), dash:'4,4', opacity:0.95 },
  };

   //  新增：从 opts 里拿映射（保存时传入）
  const colorByCountry = opts.colorByCountry || null;
  const colorByPanelCountry = opts.colorByPanelCountry || null;

  // ★ NEW：透明度映射
  const alphaByNode = opts.alphaByNode || null;        // Map|Object，key "panelIdx:q,r"
  const defaultAlpha = (typeof opts.defaultAlpha === 'number') ? opts.defaultAlpha : 1;

  // 如果你文件里还没有 pick 辅助函数，加一个非常小的：
  const pick = (mapLike, key) => {
    if (!mapLike) return null;
    const k1 = key, k2 = String(key);
    if (mapLike instanceof Map) return mapLike.get(k1) ?? mapLike.get(k2) ?? null;
    if (typeof mapLike === 'object') return (mapLike[k1] ?? mapLike[k2] ?? null);
    return null;
  };


  const idOf = (p,q,r) => `${p}:${q},${r}`;
  const normalize = (cid) => cid; // 若你有同名函数可直接用

  const resolveNodeColor = (n) => {
    if (n && n.country_id != null && Number.isInteger(n.panelIdx)) {
      const key = `${n.panelIdx}|${normalize(n.country_id)}`;
      if (colorByPanelCountry && (key in colorByPanelCountry)) {
        return colorByPanelCountry[key];
      }
    }
    if (n && n.country_id != null) {
      const cid = normalize(n.country_id);
      if (colorByCountry && (cid in colorByCountry)) {
        return colorByCountry[cid];
      }
    }
    if (n?.modality === 'text')  return STYLE.COLOR_TEXT;
    if (n?.modality === 'image') return STYLE.COLOR_IMAGE;
    return STYLE.COLOR_DEFAULT;
  };
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const path = Array.isArray(link?.path) ? link.path : [];
  if (path.length === 0) {
    svg.attr('width', 0).attr('height', STYLE.H);
    return;
  }


  // ⭐ 修改：颜色解析（面板|国家 → 全局国家 → modality）
  const colorOfNode = (n) => {
    if (!n) return STYLE.COLOR_DEFAULT;
    const pid = Number.isInteger(n.panelIdx) ? n.panelIdx : null;
    const cid = n.country_id ?? null;

    if (pid != null && cid != null && colorByPanelCountry) {
      const key = `${pid}|${cid}`;
      if (key in colorByPanelCountry) return colorByPanelCountry[key];
    }
    if (cid != null && colorByCountry && (cid in colorByCountry)) {
      return colorByCountry[cid];
    }
    if (n.modality === 'text')  return STYLE.COLOR_TEXT;
    if (n.modality === 'image') return STYLE.COLOR_IMAGE;
    return STYLE.COLOR_DEFAULT;
  };

  const styleOfLink = (t) =>
    t === 'flight' ? STYLE.FLIGHT : (t === 'river' ? STYLE.RIVER : STYLE.ROAD);

  const hexPathD = (r) => {
    const a = Math.PI / 3;
    const pts = d3.range(6).map(i => [r*Math.cos(a*i), r*Math.sin(a*i)]);
    return d3.line()(pts.concat([pts[0]]));
  };

  // —— 垂直对齐：强制以 H/2 为纵向中心，外加少量可调偏移 —— //
  const yMid = STYLE.H / 2 + STYLE.Y_ADJUST;
  const coords = path.map((p, i) => ({ ...p, x: STYLE.PADX + i*STYLE.DX, y: yMid }));

  // 画布宽度 = 最后一点 x + 右侧 padding + 一点余量
  const lastX = coords[coords.length - 1].x;
  const contentW = lastX + STYLE.PADX + STYLE.HEX_R * 1.2;
  svg.attr('width', contentW).attr('height', STYLE.H);

  const g = svg.append('g');

  // 折线
  const s = styleOfLink(link?.type);
  g.append('polyline')
    .attr('points', coords.map(d => `${d.x},${d.y}`).join(' '))
    .attr('fill', 'none')
    .attr('stroke', s.stroke)
    .attr('stroke-width', s.width)
    .attr('stroke-opacity', s.opacity)
    .attr('stroke-dasharray', s.dash);

  // 六边形
  const hexD = hexPathD(STYLE.HEX_R);
  const nodeMap = new Map(nodes.map(n => [idOf(n.panelIdx, n.q, n.r), n]));

  g.selectAll('g.hex')
    .data(coords, d => idOf(d.panelIdx, d.q, d.r))
    .join(enter => {
      const gg = enter.append('g').attr('class', 'hex')
        .attr('transform', d => `translate(${d.x},${d.y})`);
      gg.append('path')
        .attr('d', hexD)
        .attr('fill', d => {
          const n = nodeMap.get(idOf(d.panelIdx,d.q,d.r));
          return colorOfNode(n);              // 你原来的颜色解析保持不变
        })
        .attr('fill-opacity', d => {          // ★ NEW：节点透明度
          const key = idOf(d.panelIdx, d.q, d.r);      // "panelIdx:q,r"
          const a = pick(alphaByNode, key);
          return (typeof a === 'number' && a >= 0 && a <= 1) ? a : defaultAlpha;
        })
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1);
      return gg;
    });
}


