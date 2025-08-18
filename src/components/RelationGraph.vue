<template>
  <div ref="host" class="relg-host">
    <svg ref="svg" class="relg-svg">
      <g ref="layer"></g>
    </svg>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

// —— 与 MainView/semanticMap 保持一致的可视化常量（如后续改动，请同步这里） ——
const TOKENS = {
  HEX_RADIUS: 10,                             // 你不在模板里传，默认这里即可
  HEX_STROKE: '#ffffff',
  HEX_STROKE_W: 1.2,
  HEX_FILL_TEXT: '#a9d08d',                   // text
  HEX_FILL_IMAGE: '#a6cee3',                  // image
  HEX_FILL_DEFAULT: '#ffffff',

  LINK: {
    road:   { color: '#e9c46b', width: 1.2, opacity: 0.88, dash: null },
    river:  { color: '#a6cee3', width: 1.2, opacity: 0.88, dash: null },
    flight: { color: '#4a5f7e', width: 1.2, opacity: 0.98, dash: '3,2' },
  },
}

// 输入数据：{ nodes:[], links:[], rootId?:string }
const props = defineProps({
  data: { type: Object, required: true }
})

const host = ref(null)
const svg  = ref(null)
const layer= ref(null)
let ro = null

// 六边形路径
function hexPath(r){
  const a = Math.PI/3
  const pts = Array.from({length:6},(_,i)=>[r*Math.cos(a*i), r*Math.sin(a*i)])
  pts.push(pts[0])
  return 'M'+pts.map(p=>p.join(',')).join('L')+'Z'
}
const HEX_D = hexPath(TOKENS.HEX_RADIUS)

function getFillByModality(m){
  if (m === 'text')  return TOKENS.HEX_FILL_TEXT
  if (m === 'image') return TOKENS.HEX_FILL_IMAGE
  return TOKENS.HEX_FILL_DEFAULT
}

// —— 把 selection 的 links 规范化成边（sourceId/targetId） ——
// 支持两种格式：
// 1) { source:'1:2,2', target:'1:2,3', type:'road' }
// 2) { type:'road'|'river'|'flight', panelIdx, path:[{q,r,(panelIdx?)}, ...] }
function normalizeEdges(rawLinks = [], nodeIndex = new Map()){
  const edges = []
  for (const e of rawLinks || []) {
    if (e.source && e.target) {
      edges.push({ source: e.source, target: e.target, type: e.type || 'road' })
      continue
    }
    // path 形式
    const defPanel = typeof e.panelIdx === 'number' ? e.panelIdx : 0
    const path = Array.isArray(e.path) ? e.path : []
    for (let i=0; i<path.length-1; i++){
      const a = path[i], b = path[i+1]
      const ap = (typeof a.panelIdx === 'number') ? a.panelIdx : defPanel
      const bp = (typeof b.panelIdx === 'number') ? b.panelIdx : defPanel
      const aid = `${ap}:${a.q},${a.r}`
      const bid = `${bp}:${b.q},${b.r}`
      // 只连存在于 nodes 的点（避免空引用）
      if (nodeIndex.has(aid) && nodeIndex.has(bid)){
        edges.push({ source: aid, target: bid, type: e.type || 'road' })
      }
    }
  }
  return edges
}

function draw(){
  const hostEl = host.value, svgEl = svg.value, g = layer.value
  if (!hostEl || !svgEl || !g) return

  const W = hostEl.clientWidth || 0
  const H = hostEl.clientHeight || 0
  if (W === 0 || H === 0) return

  svgEl.setAttribute('width',  W)
  svgEl.setAttribute('height', H)

  const nodes = Array.isArray(props.data?.nodes) ? props.data.nodes : []
  const nodeIndex = new Map(nodes.map(n=>[n.id, n]))

  // 兼容两种 link 结构 -> 边
  const edges = normalizeEdges(props.data?.links || [], nodeIndex)

   // === 有向层次布局：根在最左，根的 y = 第一层孩子 y 的平均值 ===
   const pos = layoutDirected(
    nodes,
    edges,
    W,
    H,
    props.data?.rootId ?? null   // 可选：外部显式指定根
   )


  // 清空并重绘
  g.innerHTML = ''

  // 画线（保持颜色/样式一致）
  for (const e of edges){
    const a = pos.get(e.source), b = pos.get(e.target)
    if (!a || !b) continue
    const style = TOKENS.LINK[e.type] || TOKENS.LINK.road
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y)
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y)
    line.setAttribute('stroke', style.color)
    line.setAttribute('stroke-width', style.width)
    line.setAttribute('stroke-opacity', style.opacity)
    if (style.dash) line.setAttribute('stroke-dasharray', style.dash)
    g.appendChild(line)
  }

  // 画点（六边形）
  const a = Math.PI / 3
  const r = TOKENS.HEX_RADIUS
  const hexD = 'M' + Array.from({length:7},(_,i)=>{
    const ii = i%6; return [r*Math.cos(a*ii), r*Math.sin(a*ii)].join(',')
  }).join('L') + 'Z'

  nodes.forEach(n => {
    const p = pos.get(n.id)
    if (!p) return
    const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    grp.setAttribute('transform', `translate(${p.x},${p.y})`)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', hexD)
    path.setAttribute('fill', getFillByModality(n.modality))
    path.setAttribute('fill-opacity', 0.95)
    path.setAttribute('stroke', TOKENS.HEX_STROKE)
    path.setAttribute('stroke-width', TOKENS.HEX_STROKE_W)
    grp.appendChild(path)
    g.appendChild(grp)
  })
}


// === 把 path 点转 id（复用你已有的） ===
function pointToId(p, link) {
  if (typeof p === 'string') return p;
  const panelIdx =
    typeof p.panelIdx === 'number' ? p.panelIdx :
    typeof link?.panelIdx === 'number' ? link.panelIdx :
    typeof link?.panelIdxFrom === 'number' ? link.panelIdxFrom :
    typeof link?.panelIdxTo === 'number' ? link.panelIdxTo : 0;
  return `${panelIdx}:${p.q},${p.r}`;
}

// === 选根：links[].path[0] 出现频次最高者；兜底用最小入度节点 ===
function chooseRootFromLinks(data, nodesById, indegMap) {
  // 统计每条 link 的 path[0]
  const counts = new Map();
  for (const l of (data?.links || [])) {
    const p0 = Array.isArray(l.path) ? l.path[0] : null;
    if (!p0) continue;
    const id = pointToId(p0, l);
    if (!nodesById.has(id)) continue;     // 只认可见节点
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  if (counts.size) {
    // 频次最高的 path[0] = 根
    return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0];
  }
  // 没有 path 的情况：用最小入度（更像“起点”）
  return [...indegMap.entries()].sort((a,b)=>a[1]-b[1])[0]?.[0] || (data?.nodes?.[0]?.id ?? null);
}

// —— 有向层次布局（从 root 出发，path 顺序决定方向） ——
// 返回：Map<nodeId, {x,y}>
function layoutDirected(nodes = [], edges = [], W = 800, H = 180, rootId = null) {
  const nodesById = new Map(nodes.map(n => [n.id, n]));
  const out = new Map();          // id -> Set(nextId)
  const indeg = new Map();        // id -> in-degree
  nodes.forEach(n => { out.set(n.id, new Set()); indeg.set(n.id, 0); });

  // 建图（有向）
  for (const e of edges) {
    if (!nodesById.has(e.source) || !nodesById.has(e.target)) continue;
    out.get(e.source).add(e.target);
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
  }

  // 选 root：优先 props.data.rootId；其次 links[].path[0] 频次最高；兜底入度最小
  const pickRoot = () => {
    if (rootId && nodesById.has(rootId)) return rootId;
    const idFromLinks = chooseRootFromLinks({ nodes, links: props.data?.links || [] }, nodesById, indeg);
    if (idFromLinks && nodesById.has(idFromLinks)) return idFromLinks;
    // 兜底：入度最小的一个
    return [...indeg.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? nodes[0]?.id ?? null;
  };

  const visited = new Set();
  const columns = [];            // 全局列（包含后续分量）
  const components = [];         // 每个分量的列范围，用于后面 x 计算
  const placeComponent = (startId) => {
    if (!startId) return;
    // 有向 BFS，记录深度
    const depth = new Map();     // id -> depth (从 start 起)
    const q = [startId];
    depth.set(startId, 0);
    visited.add(startId);

    while (q.length) {
      const u = q.shift();
      for (const v of (out.get(u) || [])) {
        if (!depth.has(v)) {
          depth.set(v, depth.get(u) + 1);
          visited.add(v);
          q.push(v);
        }
      }
    }
    // 把这个分量的点按 depth 填入列
    const maxD = Math.max(...depth.values());
    const startCol = columns.length;     // 该分量在全局列中的起始列
    for (let d = 0; d <= maxD; d++) columns.push([]);
    for (const [id, d] of depth.entries()) columns[startCol + d].push(id);

    // 记录该分量的列范围
    components.push({ startCol, endCol: startCol + maxD, root: startId, depth });
  };

  // 先放主分量（以 root 开始）
  const root = pickRoot();
  placeComponent(root);

  // 再把未访问节点作为新分量，一个个追加在右边
  for (const id of nodesById.keys()) {
    if (!visited.has(id)) placeComponent(id);
  }

  // 计算坐标
  const margin = { l: 5, r: 5, t: 2, b: 2 };
  const innerW = Math.max(0, W - margin.l - margin.r);
  const innerH = Math.max(0, H - margin.t - margin.b);
  const totalCols = Math.max(columns.length, 1);
  const colW = innerW / totalCols;

  const pos = new Map(); // id -> {x,y}

  // 先按列均匀排好 y（临时），稍后对每个分量修正 root 的 y
  columns.forEach((col, j) => {
    const rows = col.length || 1;
    const rowH = Math.min(26, innerH / rows);
    col.forEach((id, i) => {
      const x = margin.l + colW * (j + 0.5);
      const y = margin.t + rowH * (i + 0.5);
      pos.set(id, { x, y });
    });
  });

  // 根的 y 居中：对每个分量，把根的 y 设置为其第一层孩子的 y 平均值
  for (const comp of components) {
    const { root, depth, startCol } = comp;
    if (!root) continue;
    // 第一层孩子 = 出边深度为 1 的点
    const children = [];
    for (const v of (out.get(root) || [])) {
      if (depth.get(v) === 1) children.push(v);
    }
    if (children.length) {
      const ys = children.map(id => pos.get(id)?.y).filter(v => typeof v === 'number');
      if (ys.length) {
        const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
        const p = pos.get(root);
        if (p) pos.set(root, { x: p.x, y: avgY });
      }
    }
  }

  return pos;
}


function schedule(){ requestAnimationFrame(draw) }

onMounted(async () => {
  await nextTick()
  // 监听父容器尺寸变化，自动重绘
  ro = new ResizeObserver(schedule)
  ro.observe(host.value)
  schedule()
})

onBeforeUnmount(() => {
  ro?.disconnect?.()
})

// 数据变化 -> 重绘
watch(() => props.data, schedule, { deep: true })
</script>

<style scoped>
.relg-host{
  width: 100%;
  height: 100%;
  position: relative;
}
.relg-svg{
  display: block;
  width: 100%;
  height: 100%;
}
</style>
