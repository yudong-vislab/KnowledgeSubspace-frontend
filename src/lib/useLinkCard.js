import * as d3 from 'd3';
import { onRightHover, emitRightHover } from './rightHoverBus';

/** —— 小卡片风格 —— */
const STYLE = {
  H: 30,
  PADX: 10, PADY: 6,
  HEX_R: 10,
  DX: 52,
  COLOR_TEXT: '#a9d08d',
  COLOR_IMAGE: '#a6cee3',
  COLOR_DEFAULT: '#ffffff',
  ROAD:   { stroke:'#e9c46b', width:1.4, dash:null,  opacity:0.95 },
  RIVER:  { stroke:'#8fbadf', width:1.4, dash:null,  opacity:0.95 },
  FLIGHT: { stroke:'#4a5f7e', width:1.4, dash:'4,4', opacity:0.95 },

  // 与 semanticMap 保持一致的城市样式（按小卡比例缩放）
  CITY: {
    r: 2.6,                      // baseR ~ 3.5 * 0.75
    fill: '#ffffff',
    capitalInnerFill: '#000000',
    stroke: '#777777',
    strokeWidth: 1.0
  },

  HOVER_DIM: 0.25                // 非相关元素淡化
};

const hexPathD = (r) => {
  const a = Math.PI / 3;
  const pts = d3.range(6).map(i => [r * Math.cos(a * i), r * Math.sin(a * i)]);
  return d3.line()(pts.concat([pts[0]]));
};

const colorOfNode = (n) => (
  n?.modality === 'text'  ? STYLE.COLOR_TEXT :
  n?.modality === 'image' ? STYLE.COLOR_IMAGE : STYLE.COLOR_DEFAULT
);
const styleOfLink = (t) => (t === 'flight' ? STYLE.FLIGHT : (t === 'river' ? STYLE.RIVER : STYLE.ROAD));
const idOf = (p, q, r) => `${p}:${q},${r}`;

/** 统计各条线路“起点”的出现次数（用于 city/capital） */
export function buildStartCountMap(links = []) {
  const m = new Map();
  for (const l of (links || [])) {
    // ★ 新增：忽略单点卡（single）与无效路径
    if (!l || l.type === 'single') continue;

    const path = Array.isArray(l.path) ? l.path : [];
    if (path.length < 1) continue;

    const p0 = path[0];
    const key = idOf(p0.panelIdx, p0.q, p0.r);
    m.set(key, (m.get(key) || 0) + 1);
  }
  return m;
}


/** 给一个节点组画 city/capital（组已定位到该点） */
function drawCityOrCapital(g, count) {
  if (!count || count < 1) return; // 没有任何线路以它为起点就不画
  const { r, fill, capitalInnerFill, stroke, strokeWidth } = STYLE.CITY;

  if (count === 1) {
    g.append('circle')
      .attr('class', 'city')
      .attr('r', r)
      .attr('fill', fill)
      .attr('stroke', stroke)
      .attr('stroke-width', strokeWidth)
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');
  } else {
    const outer = r * 1.4, inner = r * 0.85;
    g.append('circle')
      .attr('class', 'city capital-outer')
      .attr('r', outer)
      .attr('fill', fill)
      .attr('stroke', stroke)
      .attr('stroke-width', strokeWidth)
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');
    g.append('circle')
      .attr('class', 'city capital-inner')
      .attr('r', inner)
      .attr('fill', capitalInnerFill)
      .attr('stroke', stroke)
      .attr('stroke-width', strokeWidth)
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');
  }
}

/**
 * 挂载一个 Link 小预览到 <svg> 元素上
 *  - 支持 city/capital
 *  - 支持“全局同 id 联动 hover，高亮 = 降低其它透明度”
 */
export function mountMiniLink(svgEl, { link, nodes = [], startCountMap = new Map() }) {
  const svg = d3.select(svgEl);
  const hexD = hexPathD(STYLE.HEX_R);
  let offHover = null;
  let hoveredId = null; // 当前全局 hover id

  function applyHover(id) {
    hoveredId = id;
    const nodesSel = svg.selectAll('g.node');
    if (!hoveredId) {
      nodesSel.attr('opacity', 1);
    } else {
      nodesSel.attr('opacity', function() {
        return this.dataset.id === hoveredId ? 1 : STYLE.HOVER_DIM;
      });
    }
  }

  function render({ link, nodes, startCountMap }) {
    svg.selectAll('*').remove();

    const path = Array.isArray(link?.path) ? link.path : [];
    if (path.length === 0) {
      svg.attr('width', 0).attr('height', STYLE.H);
      return;
    }

    // ★ 新增：识别“单点卡”（single）
    const isSingleCard = (link?.type === 'single') || (path.length < 2);

    // 基础尺寸
    const innerH = STYLE.H - 2 * STYLE.PADY;
    const yMid = Math.round(STYLE.PADY + innerH / 2) + 0.5;
    const coords = path.map((p, i) => ({
      ...p, x: STYLE.PADX + i * STYLE.DX, y: yMid, _id: idOf(p.panelIdx, p.q, p.r)
    }));

    const lastX = coords[coords.length - 1].x;
    const contentW = lastX + STYLE.PADX + STYLE.HEX_R * 1.2;
    svg.attr('width', contentW).attr('height', STYLE.H);

    const g = svg.append('g');

    // 线路
    const s = styleOfLink(link?.type);
    g.append('polyline')
      .attr('points', coords.map(d => `${d.x},${d.y}`).join(' '))
      .attr('fill', 'none')
      .attr('stroke', s.stroke)
      .attr('stroke-width', s.width)
      .attr('stroke-opacity', s.opacity)
      .attr('stroke-dasharray', s.dash);

    // 结点（六边形 + city/capital）—— 每个结点包一层 g.node，统一控制透明度
    const nodeMap = new Map(nodes.map(n => [idOf(n.panelIdx, n.q, n.r), n]));

    const enter = g.selectAll('g.node')
      .data(coords, d => d._id)
      .join(enter => {
        const gg = enter.append('g')
          .attr('class', 'node')
          .attr('data-id', d => d._id)
          .attr('transform', d => `translate(${d.x},${d.y})`)
          .style('cursor', 'pointer');

        // 六边形
        gg.append('path')
          .attr('class', 'hex')
          .attr('d', hexD)
          .attr('fill', d => colorOfNode(nodeMap.get(d._id)))
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1);

        // city / capital（与 semanticMap 规则一致：同一 Step 中“以它为起点”的条数）
        gg.append('g').attr('class', 'city-wrap')
            .each(function(d) {
            const count = isSingleCard ? 0 : (startCountMap.get(d._id) || 0);
            drawCityOrCapital(d3.select(this), count);
            });

        // hover 联动：广播自己；其他卡片会收到并降透明度
        gg.on('mouseenter', (_, d) => emitRightHover(d._id))
          .on('mouseleave', () => emitRightHover(null));

        return gg;
      });

    // 应用当前 hover 状态（如果刚好有）
    applyHover(hoveredId);
  }

  // 初次渲染
  render({ link, nodes, startCountMap });
  // 订阅总线
  offHover = onRightHover(applyHover);

  return {
    update(next) { render(next); },
    destroy() { offHover && offHover(); }
  };
}
