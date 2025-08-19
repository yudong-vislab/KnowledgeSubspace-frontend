<template>
  <div ref="host" class="relg-host">
    <svg ref="svg" class="relg-svg">
      <g ref="layer"></g>
    </svg>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

// —— 可视化常量 —— //
const TOKENS = {
  HEX_RADIUS: 10,
  HEX_STROKE: '#ffffff',
  HEX_STROKE_W: 1.2,
  HEX_FILL_TEXT: '#a9d08d',
  HEX_FILL_IMAGE: '#a6cee3',
  HEX_FILL_DEFAULT: '#ffffff',
  LINK: {
    road:   { color: '#e9c46b', width: 1.2, opacity: 0.88, dash: null },
    river:  { color: '#a6cee3', width: 1.2, opacity: 0.88, dash: null },
    flight: { color: '#4a5f7e', width: 1.2, opacity: 0.98, dash: '3,2' },
  },
}
// —— 固定列距/行距（控制“连线长度恒定”与竖向排布）——
const COL_STEP  = 50;   // 父子固定水平距离（像素）
const ROW_H_MIN = 22;    // 每列最小行高（像素）

// 输入数据：{ nodes:[], links:[], rootId?:string }
const props = defineProps({ data: { type: Object, required: true } })

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

// —— 兼容两种 link 结构 -> 边（source/target 都是 node.id）——
function normalizeEdges(rawLinks = [], nodeIndex = new Map()){
  const edges = []
  for (const e of rawLinks || []) {
    if (e.source && e.target) {
      // 直接形式
      if (nodeIndex.has(e.source) && nodeIndex.has(e.target)) {
        edges.push({ source: e.source, target: e.target, type: e.type || 'road' })
      }
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
      if (nodeIndex.has(aid) && nodeIndex.has(bid)){
        edges.push({ source: aid, target: bid, type: e.type || 'road' })
      }
    }
  }
  return edges
}

// —— 把 path 点转 id —— //
function pointToId(p, link) {
  if (typeof p === 'string') return p
  const panelIdx =
    typeof p.panelIdx === 'number' ? p.panelIdx :
    typeof link?.panelIdx === 'number' ? link.panelIdx :
    typeof link?.panelIdxFrom === 'number' ? link.panelIdxFrom :
    typeof link?.panelIdxTo === 'number' ? link.panelIdxTo : 0
  return `${panelIdx}:${p.q},${p.r}`
}

// —— 多根/多分量的严格层次布局（固定列距） —— //
function layoutMultiRoots(nodes = [], edges = [], W = 800, H = 180, rootHint = null) {
  const nodesById = new Map(nodes.map(n => [n.id, n]))

  // 有向出边/入度（仅限 nodes 集合内）
  const out = new Map(), indeg = new Map()
  nodes.forEach(n => { out.set(n.id, new Set()); indeg.set(n.id, 0) })
  for (const e of edges) {
    if (!nodesById.has(e.source) || !nodesById.has(e.target)) continue
    out.get(e.source).add(e.target)
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1)
  }

  // 无向邻接（连通分量 + 从根到任一点的无向距离）
  const undirected = new Map()
  const ensure = (m, k) => (m.has(k) ? m.get(k) : (m.set(k, new Set()), m.get(k)))
  for (const e of edges) {
    if (!nodesById.has(e.source) || !nodesById.has(e.target)) continue
    ensure(undirected, e.source).add(e.target)
    ensure(undirected, e.target).add(e.source)
  }
  nodes.forEach(n => { ensure(undirected, n.id) }) // 孤点也初始化

  // 统计 links.path[0] 频次：选根的第一优先级
  const startCounts = new Map()
  for (const l of (props.data?.links || [])) {
    const p0 = Array.isArray(l.path) ? l.path[0] : null
    if (!p0) continue
    const id0 = pointToId(p0, l)
    if (!nodesById.has(id0)) continue
    startCounts.set(id0, (startCounts.get(id0) || 0) + 1)
  }

  // —— 拆连通分量（无向 BFS） —— //
  const comps = []
  const seen = new Set()
  for (const id of nodesById.keys()) {
    if (seen.has(id)) continue
    const ids = new Set([id]); seen.add(id)
    const q = [id]
    while (q.length) {
      const u = q.shift()
      for (const v of (undirected.get(u) || [])) {
        if (!seen.has(v)) { seen.add(v); ids.add(v); q.push(v) }
      }
    }
    comps.push({ ids })
  }

  // 每个分量选根：rootHint 命中其分量 > path[0] 最高 > 入度最小
  function pickRootForComp(compIds) {
    if (rootHint && compIds.has(rootHint)) return rootHint
    let best = null, bestCnt = -1
    for (const id of compIds) {
      const c = startCounts.get(id) || 0
      if (c > bestCnt) { bestCnt = c; best = id }
    }
    if (bestCnt > 0) return best
    let minIn = Infinity, minId = null
    for (const id of compIds) {
      const d = indeg.get(id) || 0
      if (d < minIn) { minIn = d; minId = id }
    }
    return minId ?? [...compIds][0] ?? null
  }

  // —— 分量分层（严格从左到右） —— //
  const compLayers = [];   // { layers: string[][], maxDepth:number, root:string }
  let globalMaxCols = 1;

  for (const comp of comps) {
    const root = pickRootForComp(comp.ids);

    // 1) 无向最短距离：保证所有点至少位于从根出发的右侧某一层
    const distU = new Map();
    if (root) {
      const q = [root]; distU.set(root, 0);
      while (q.length) {
        const u = q.shift();
        for (const v of (undirected.get(u) || [])) {
          if (!comp.ids.has(v)) continue;
          if (!distU.has(v)) { distU.set(v, distU.get(u) + 1); q.push(v); }
        }
      }
    }

    // 2) 用无向距离初始化 depth（不可达的先放 0 列）
    const depth = new Map();
    for (const id of comp.ids) depth.set(id, distU.get(id) ?? 0);

    // 3) 方向约束：对所有有向边 u->v，强制 depth[v] >= depth[u] + 1
    const E = [];
    for (const u of comp.ids) {
      for (const v of (out.get(u) || [])) {
        if (comp.ids.has(v)) E.push([u, v]);
      }
    }
    const N = Math.max(1, comp.ids.size);
    for (let it = 0; it < N; it++) {
      let changed = false;
      for (const [u, v] of E) {
        const need = (depth.get(u) || 0) + 1;
        if ((depth.get(v) || 0) < need) { depth.set(v, need); changed = true; }
      }
      if (!changed) break;
    }

    // 4) 以该分量的最小深度归零（确保根及其同层在最左列）
    let minD = Infinity;
    depth.forEach(d => { if (d < minD) minD = d; });
    if (minD !== Infinity && minD !== 0) {
      depth.forEach((d, id) => depth.set(id, d - minD));
    }

    // 5) 聚成列（列索引必须是非负整数）
    let maxD = 0;
    depth.forEach(d => { if (d > maxD) maxD = d; });
    const layers = Array.from({ length: Math.max(1, Math.floor(maxD) + 1) }, () => []);
    for (const [id, dRaw] of depth.entries()) {
      const d = Math.max(0, Math.floor(dRaw));   // ← 防止负数/小数
      layers[d].push(id);
    }

    compLayers.push({ layers, maxDepth: Math.floor(maxD), root });
    globalMaxCols = Math.max(globalMaxCols, Math.floor(maxD) + 1);
  }


  // —— 列坐标（固定列距；若画布不足才压缩） —— //
  const margin = { l: 5, r: 5, t: 4, b: 4 }
  const innerW = Math.max(0, W - margin.l - margin.r)
  const innerH = Math.max(0, H - margin.t - margin.b)
  // const colW = Math.min(COL_STEP, innerW / Math.max(globalMaxCols, 1))
  const colW = COL_STEP;

  // —— 多分量竖向堆叠 —— //
  const compBandH = innerH / Math.max(compLayers.length, 1)
  const vPad = 6
  const pos = new Map()

  compLayers.forEach((comp, compIdx) => {
    const { layers, root } = comp
    const bandTop = margin.t + compIdx * compBandH + vPad
    const bandH   = Math.max(0, compBandH - 2 * vPad)

    // 用“最拥挤的一列”的数量确定行距，保证每列使用相同行距
    const maxRows = Math.max(...layers.map(col => col.length || 1), 1)
    const rowH = Math.max(ROW_H_MIN, bandH / maxRows)

    // 逐列放点（严格按列 -> x 固定 = margin.l + j*colW + colW/2）
    layers.forEach((col, j) => {
      const x = margin.l + colW * (j + 0.5)
      col.sort() // 稳定性
      col.forEach((id, i) => {
        const y = bandTop + rowH * (i + 0.5)
        pos.set(id, { x, y })
      })
    })

    // 把根对齐到第一层孩子 y 的平均值（若存在孩子）
    if (root && layers[1] && layers[1].length) {
      const ys = layers[1].map(id => pos.get(id)?.y).filter(v => typeof v === 'number')
      if (ys.length) {
        const avg = ys.reduce((a,b)=>a+b,0) / ys.length
        const p = pos.get(root); if (p) pos.set(root, { x: p.x, y: avg })
      }
    }
  })

  return pos
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

  // links -> edges
  const edges = normalizeEdges(props.data?.links || [], nodeIndex)

  // —— 计算布局（严格左→右 + 固定列距） —— //
  const pos = layoutMultiRoots(nodes, edges, W, H, props.data?.rootId ?? null)

  // 清空并重绘
  g.innerHTML = ''

  // 画线
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

function schedule(){ requestAnimationFrame(draw) }

onMounted(async () => {
  await nextTick()
  ro = new ResizeObserver(schedule)
  ro.observe(host.value)
  schedule()
})

onBeforeUnmount(() => { ro?.disconnect?.() })

watch(() => props.data, schedule, { deep: true })
</script>

<style scoped>
.relg-host{ width:100%; height:100%; position:relative; }
.relg-svg{  display:block; width:100%; height:100%; }
</style>
