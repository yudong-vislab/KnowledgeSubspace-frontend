// 一个很薄的 D3 渲染器：把 nodes/links 画在小画布里
import * as d3 from 'd3';

export function initStepVis({ container, initial = {nodes:[], links:[]} }) {
  if (!container) throw new Error('[stepVis] container is required');

  // 容器尺寸
  const width  = container.clientWidth  || 360;
  const height = container.clientHeight || 240;

  // 建立 svg
  const svg = d3.select(container)
    .append('svg')
    .attr('class', 'stepvis-svg')
    .attr('width', width)
    .attr('height', height);

  const gLinks = svg.append('g').attr('class', 'stepvis-links');
  const gNodes = svg.append('g').attr('class', 'stepvis-nodes');

  // 力导（迷你布局，仅在右侧预览）
  const sim = d3.forceSimulation()
    .force('link', d3.forceLink().id(d => d.id).distance(40).strength(0.8))
    .force('charge', d3.forceManyBody().strength(-80))
    .force('center', d3.forceCenter(width/2, height/2));

  let state = { nodes: [], links: [] };

  function render(data) {
    state = {
      nodes: (data?.nodes || []).map((d, i) => ({ id: d.id ?? `${i}`, ...d })),
      links: (data?.links || []).map((l, i) => ({
        id: l.id ?? `e${i}`,
        source: l.source?.id ?? l.source, // 允许传字符串 id 或对象
        target: l.target?.id ?? l.target,
        ...l
      })),
    };

    // 绑定
    const linkSel = gLinks.selectAll('line')
      .data(state.links, d => d.id);

    linkSel.enter().append('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-opacity', 0.9)
      .attr('stroke-width', d => d.weight ? Math.max(1, Math.min(4, d.weight)) : 1.5)
      .attr('stroke-dasharray', d => d.type === 'flight' ? '4,3' : (d.type==='river' ? '2,2' : null))
      .merge(linkSel);

    linkSel.exit().remove();

    const nodeSel = gNodes.selectAll('circle')
      .data(state.nodes, d => d.id);

    nodeSel.enter().append('circle')
      .attr('r', d => d.r ? Math.max(3, Math.min(10, d.r)) : 5)
      .attr('fill', d => d.color || (d.modality === 'image' ? '#a6cee3' : d.modality === 'text' ? '#a9d08d' : '#e5e7eb'))
      .attr('stroke', '#334155')
      .attr('stroke-width', 0.8)
      .append('title').text(d => d.label || d.id);

    nodeSel.exit().remove();

    // 启动布局
    sim.nodes(state.nodes).on('tick', () => {
      gLinks.selectAll('line')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      gNodes.selectAll('circle')
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
    });

    sim.force('link').links(state.links);
    sim.alpha(0.9).restart();
  }

  // 尺寸响应
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth, h = container.clientHeight;
    svg.attr('width', w).attr('height', h);
    sim.force('center', d3.forceCenter(w/2, h/2));
    sim.alpha(0.2).restart();
  });
  ro.observe(container);

  // 首次渲染
  render(initial);

  return {
    update: (data) => render(data),
    destroy: () => { ro.disconnect(); sim.stop(); svg.remove(); }
  };
}
