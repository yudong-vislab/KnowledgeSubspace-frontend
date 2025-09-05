// useLinkCard.js
import * as d3 from 'd3';
import { onRightHover, emitRightHover } from './rightHoverBus'

const STYLE = {
  H: 30,
  PADX: 10, PADY: 6,
  HEX_R: 10,
  DX: 52,
  COLOR_TEXT: '#DCDCDC',
  COLOR_IMAGE: '#DCDCDC',
  COLOR_DEFAULT: '#ffffff',
  ROAD:   { stroke:'#e9c46b', width:1.4, dash:null,  opacity:0.95 },
  RIVER:  { stroke:'#8fbadf', width:1.4, dash:null,  opacity:0.95 },
  FLIGHT: { stroke:'#4a5f7e', width:1.4, dash:'4,4', opacity:0.95 },
  CITY: { r: 2.6, fill: '#ffffff', capitalInnerFill: '#000000', stroke: '#777777', strokeWidth: 1.0 },
  HOVER_DIM: 0.25
};

const hexPathD = (r) => {
  const a = Math.PI/3;
  const pts = d3.range(6).map(i => [r*Math.cos(a*i), r*Math.sin(a*i)]);
  return d3.line()(pts.concat([pts[0]]));
};
const styleOfLink = (t) => (t === 'flight' ? STYLE.FLIGHT : (t === 'river' ? STYLE.RIVER : STYLE.ROAD));
const idOf = (p, q, r) => `${p}:${q},${r}`;

/** 兼容 Map / 对象，并且容忍数字/字符串键 */
function pick(mapLike, key) {
  if (!mapLike) return null;
  const k1 = key;
  const k2 = String(key);
  if (mapLike instanceof Map) return mapLike.get(k1) ?? mapLike.get(k2) ?? null;
  if (typeof mapLike === 'object') return (mapLike[k1] ?? mapLike[k2] ?? null);
  return null;
}

/** 节点着色：先 panel+country 覆盖 → 再全局 country → 最后 modality 回退 */
function resolveNodeColor(
  n,
  { colorByCountry, colorByPanelCountry, normalizeCountryId = (x)=>x } = {}
) {
  if (!n) return STYLE.COLOR_DEFAULT;
  const cidRaw = n.country_id;
  const cid = (cidRaw == null) ? null : normalizeCountryId(cidRaw);

  if (cid != null && Number.isInteger(n.panelIdx)) {
    const k = `${n.panelIdx}|${cid}`;
    const p = pick(colorByPanelCountry, k);
    if (p) return p;
  }
  if (cid != null) {
    const g = pick(colorByCountry, cid);
    if (g) return g;
  }
  return n.modality === 'text' ? STYLE.COLOR_TEXT
       : n.modality === 'image' ? STYLE.COLOR_IMAGE
       : STYLE.COLOR_DEFAULT;
}

/** 统计起点次数（city/capital 用） */
export function buildStartCountMap(links = []) {
  const m = new Map();
  for (const l of (links || [])) {
    if (!l || l.type === 'single') continue;
    const path = Array.isArray(l.path) ? l.path : [];
    if (!path.length) continue;
    const p0 = path[0];
    const key = idOf(p0.panelIdx, p0.q, p0.r);
    m.set(key, (m.get(key) || 0) + 1);
  }
  return m;
}

function drawCityOrCapital(g, count) {
  if (!count || count < 1) return;
  const { r, fill, capitalInnerFill, stroke, strokeWidth } = STYLE.CITY;
  if (count === 1) {
    g.append('circle').attr('class','city').attr('r',r)
      .attr('fill',fill).attr('stroke',stroke).attr('stroke-width',strokeWidth)
      .attr('vector-effect','non-scaling-stroke').style('pointer-events','none');
  } else {
    const outer = r * 1.4, inner = r * 0.85;
    g.append('circle').attr('class','city capital-outer').attr('r',outer)
      .attr('fill',fill).attr('stroke',stroke).attr('stroke-width',strokeWidth)
      .attr('vector-effect','non-scaling-stroke').style('pointer-events','none');
    g.append('circle').attr('class','city capital-inner').attr('r',inner)
      .attr('fill',capitalInnerFill).attr('stroke',stroke).attr('stroke-width',strokeWidth)
      .attr('vector-effect','non-scaling-stroke').style('pointer-events','none');
  }
}

/**
 * 迷你预览（右卡片）
 * 新增支持：
 *   - alphaByNode: Map|Object，key 形如 "panelIdx:q,r"，值是 0~1
 *   - defaultAlpha: number，未命中时使用（默认 1）
 */
export function mountMiniLink(
  svgEl,
  {
    link,
    nodes = [],
    startCountMap = new Map(),
    colorByCountry = null,
    colorByPanelCountry = null,
    normalizeCountryId = (x)=>x,
    alphaByNode = null,              // ★ NEW
    defaultAlpha = 1                 // ★ NEW
  }
) {
  const svg = d3.select(svgEl);
  const hexD = hexPathD(STYLE.HEX_R);
  let offHover = null;
  let hoveredId = null;

  function applyHover(id) {
    hoveredId = id;
    const nodesSel = svg.selectAll('g.node');
    if (!hoveredId) nodesSel.attr('opacity', 1);
    else nodesSel.attr('opacity', function(){ return this.dataset.id === hoveredId ? 1 : STYLE.HOVER_DIM; });
  }

  function render({
    link, nodes, startCountMap,
    colorByCountry, colorByPanelCountry, normalizeCountryId,
    alphaByNode, defaultAlpha
  }) {
    svg.selectAll('*').remove();

    const path = Array.isArray(link?.path) ? link.path : [];
    if (!path.length) { svg.attr('width', 0).attr('height', STYLE.H); return; }

    const isSingleCard = (link?.type === 'single') || (path.length < 2);

    const innerH = STYLE.H - 2 * STYLE.PADY;
    const yMid = Math.round(STYLE.PADY + innerH / 2) + 0.5;
    const coords = path.map((p, i) => ({
      ...p, x: STYLE.PADX + i * STYLE.DX, y: yMid, _id: idOf(p.panelIdx, p.q, p.r)
    }));

    const lastX = coords[coords.length - 1].x;
    const contentW = lastX + STYLE.PADX + STYLE.HEX_R * 1.2;
    svg.attr('width', contentW).attr('height', STYLE.H);

    const g = svg.append('g');

    const s = styleOfLink(link?.type);
    g.append('polyline')
      .attr('points', coords.map(d => `${d.x},${d.y}`).join(' '))
      .attr('fill', 'none').attr('stroke', s.stroke)
      .attr('stroke-width', s.width).attr('stroke-opacity', s.opacity)
      .attr('stroke-dasharray', s.dash);

    const nodeMap = new Map(nodes.map(n => [idOf(n.panelIdx, n.q, n.r), n]));

    g.selectAll('g.node')
      .data(coords, d => d._id)
      .join(enter => {
        const gg = enter.append('g')
          .attr('class', 'node')
          .attr('data-id', d => d._id)
          .attr('transform', d => `translate(${d.x},${d.y})`)
          .style('cursor', 'pointer');

        gg.append('path')
          .attr('class', 'hex')
          .attr('d', hexD)
          .attr('fill', d => resolveNodeColor(nodeMap.get(d._id), { colorByCountry, colorByPanelCountry, normalizeCountryId }))
          .attr('fill-opacity', d => {                      // ★ NEW：节点透明度
            const a = pick(alphaByNode, d._id);
            return (typeof a === 'number' && a >= 0 && a <= 1) ? a : defaultAlpha;
          })
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1);

        gg.append('g')
          .attr('class', 'city-wrap')
          .each(function(d){
            const count = isSingleCard ? 0 : (startCountMap.get(d._id) || 0);
            drawCityOrCapital(d3.select(this), count);
          });

        gg.on('mouseenter', (_, d) => emitRightHover(d._id))
          .on('mouseleave', () => emitRightHover(null));
        return gg;
      });

    applyHover(hoveredId);
  }

  render({
    link, nodes, startCountMap,
    colorByCountry, colorByPanelCountry, normalizeCountryId,
    alphaByNode, defaultAlpha
  });
  offHover = onRightHover(applyHover);

  return {
    update(next) {
      render({
        ...next,
        normalizeCountryId: next?.normalizeCountryId || normalizeCountryId,
        alphaByNode: next?.alphaByNode ?? alphaByNode,
        defaultAlpha: next?.defaultAlpha ?? defaultAlpha
      });
    },
    destroy() { offHover && offHover(); }
  };
}
