// src/lib/stepVis.js
import * as d3 from 'd3';

function hexPath(R = 12) {
  const a = Math.PI / 3;
  const pts = d3.range(6).map(i => [R * Math.cos(a * i), R * Math.sin(a * i)]);
  return d3.line()(pts.concat([pts[0]]));
}

export function initStepVis({ container, initial = { nodes: [], links: [] }, hexRadius = 12 }) {
  if (!container) throw new Error('[stepVis] container is required');

  const svg = d3.select(container).append('svg')
    .attr('class', 'stepvis-svg')
    .style('display', 'block');

  const gLinks = svg.append('g').attr('class', 'rg-links');
  const gNodes = svg.append('g').attr('class', 'rg-nodes');

  let W = 300, H = 200;
  measureAndResize();

  // 保存上次位置，update 时复用，减少抖动
  const lastPos = new Map();

  let nodes = [];
  let links = [];
  let sim = null;

  const ro = new ResizeObserver(() => {
    measureAndResize();
    if (sim) {
      sim.force('center', d3.forceCenter(W / 2, H / 2));
      sim.alpha(0.3).restart();
    }
  });
  ro.observe(container);

  function measureAndResize() {
    const r = container.getBoundingClientRect();
    W = Math.max(200, r.width || 0);
    H = Math.max(160, r.height || 0);
    svg.attr('width', W).attr('height', H);
  }

  function stashPositions() {
    nodes.forEach(n => {
      if (Number.isFinite(n.x) && Number.isFinite(n.y)) {
        lastPos.set(n.id, [n.x, n.y]);
      }
    });
  }

  function normalizeLinks(arr = []) {
    // 允许 source/target 为 id 字符串或对象；统一成 {source:id, target:id} 交给 forceLink().id 去解析
    return arr.map(l => {
      const s = typeof l.source === 'object' ? (l.source.id ?? l.source) : l.source;
      const t = typeof l.target === 'object' ? (l.target.id ?? l.target) : l.target;
      return { ...l, source: s, target: t };
    });
  }

  function seedXY(id) {
    const keep = lastPos.get(id);
    if (keep) return { x: keep[0], y: keep[1] };
    const ang = Math.random() * Math.PI * 2;
    const r = 80 + Math.random() * 40;
    return { x: W / 2 + Math.cos(ang) * r, y: H / 2 + Math.sin(ang) * r };
  }

  function dragstarted(event, d) {
    if (!event.active) sim.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event, d) {
    d.fx = event.x; d.fy = event.y;
  }
  function dragended(event, d) {
    if (!event.active) sim.alphaTarget(0);
    d.fx = null; d.fy = null;
  }

  function update(data = { nodes: [], links: [] }) {
    stashPositions();

    // 节点：补齐初始坐标
    const nextNodes = (data.nodes || []).map(n => {
      const seeded = seedXY(n.id);
      return { ...n, x: seeded.x, y: seeded.y };
    });

    // 连线：标准化为 id 形式，交给 forceLink 去解析到节点对象
    const nextLinks = normalizeLinks(data.links || []);

    nodes = nextNodes;
    links = nextLinks;

    // 绑定连线
    const linkSel = gLinks.selectAll('line.link')
      .data(links, d => `${d.source}->${d.target}`);

    linkSel.enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', '#9ca3af')
      .attr('stroke-opacity', 0.9)
      .attr('stroke-width', 1.2);

    linkSel.exit().remove();

    // 绑定节点
    const nodeSel = gNodes.selectAll('g.node')
      .data(nodes, d => d.id);

    const nodeEnter = nodeSel.enter()
      .append('g')
      .attr('class', 'node')
      .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended));

    nodeEnter.append('path')
      .attr('class', 'hex')
      .attr('d', hexPath(hexRadius))
      .attr('fill', '#a9d08d')
      .attr('fill-opacity', 0.9)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1.2);

    nodeEnter.append('text')
      .attr('class', 'label')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('font-size', 10)
      .attr('fill', '#333')
      .text(d => d.label || d.id);

    nodeSel.exit().remove();

    const mergedNodes = nodeEnter.merge(nodeSel);

    // 建立力导
    if (sim) sim.stop();
    sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(80).strength(0.7))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(hexRadius * 1.6));

    // 每一帧
    sim.on('tick', () => {
      // 注意：经过 forceLink().id 映射后，d.source/d.target 会变成“节点对象”
      gLinks.selectAll('line.link')
        .attr('x1', d => (typeof d.source === 'object' ? d.source.x : 0))
        .attr('y1', d => (typeof d.source === 'object' ? d.source.y : 0))
        .attr('x2', d => (typeof d.target === 'object' ? d.target.x : 0))
        .attr('y2', d => (typeof d.target === 'object' ? d.target.y : 0));

      mergedNodes.attr('transform', d => {
        // 防御：坐标异常时也不抛错
        const x = Number.isFinite(d.x) ? d.x : W / 2;
        const y = Number.isFinite(d.y) ? d.y : H / 2;
        return `translate(${x},${y})`;
      });
    });
  }

  function destroy() {
    ro.disconnect();
    sim?.stop();
    svg.remove();
  }

  // 初次渲染
  update(initial);

  return { update, destroy };
}
