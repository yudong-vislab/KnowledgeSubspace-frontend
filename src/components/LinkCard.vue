<!-- src/components/LinkCard.vue -->
<template>
  <section class="subcard">
    <!-- ⓪ Subspace(s) 标签 -->
    <div class="subcard__meta" v-if="(props.link?.panelNames?.length || 0) > 0">
      <span class="meta-label">{{ props.link.panelNames.length > 1 ? 'Subspaces' : 'Subspace' }}:</span>
      <span class="meta-names">{{ props.link.panelNames.join(' -> ') }}</span>
    </div>

    <!-- ① Hex 概览 -->
    <div class="subcard__hex">
      <div class="hex-scroll">
        <svg ref="svgRef" class="mini" />
      </div>
    </div>

    <!-- ② 原文句子 -->
    <div class="subcard__source">
      <div class="placeholder">Raw sentences (占位)</div>
    </div>

    <!-- ③ 大模型总结 -->
    <div class="subcard__llm">
      <div class="placeholder">LLM summary (占位)</div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, watch, ref } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  link:  { type: Object, required: true }, // 里头已有 panelNames（由 semanticMap.js 注入）
  nodes: { type: Array,  default: () => [] }
})

const svgRef = ref(null)

/** 小概览样式（更矮、更紧凑、六边形固定大小、左对齐、可横向滚动） */
const STYLE = {
  H: 30,
  PADX: 10,
  PADY: 6,
  HEX_R: 8,
  DX: 52,
  COLOR_TEXT: '#a9d08d',
  COLOR_IMAGE: '#a6cee3',
  COLOR_DEFAULT: '#ffffff',
  ROAD:   { stroke:'#e9c46b', width:1.4, dash:null, opacity:0.95 },
  RIVER:  { stroke:'#8fbadf', width:1.4, dash:null, opacity:0.95 },
  FLIGHT: { stroke:'#4a5f7e', width:1.4, dash:'4,4', opacity:0.95 },
}

const hexPathD = (r) => {
  const a = Math.PI/3
  const pts = d3.range(6).map(i => [r*Math.cos(a*i), r*Math.sin(a*i)])
  return d3.line()(pts.concat([pts[0]]))
}

const colorOfNode = (n) => {
  if (n?.modality === 'text')  return STYLE.COLOR_TEXT
  if (n?.modality === 'image') return STYLE.COLOR_IMAGE
  return STYLE.COLOR_DEFAULT
}
const styleOfLink = (t) => t === 'flight' ? STYLE.FLIGHT : (t==='river' ? STYLE.RIVER : STYLE.ROAD)
const idOf = (p,q,r) => `${p}:${q},${r}`

function render() {
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const path = Array.isArray(props.link?.path) ? props.link.path : []
  if (path.length === 0) {
    svg.attr('width', 0).attr('height', STYLE.H)
    return
  }

  // —— 垂直居中：做 0.5px 的像素对齐微调，让视觉居中更自然 ——
  const innerHeight = STYLE.H - 2*STYLE.PADY
  const yMid = Math.round(STYLE.PADY + innerHeight / 2) + 0.5    // ← 改这里
  const coords = path.map((p, i) => ({ ...p, x: STYLE.PADX + i*STYLE.DX, y: yMid }))

  const lastX = coords[coords.length - 1].x
  const contentW = lastX + STYLE.PADX + STYLE.HEX_R * 1.2
  svg.attr('width', contentW).attr('height', STYLE.H)

  const g = svg.append('g')

  const s = styleOfLink(props.link?.type)
  g.append('polyline')
    .attr('points', coords.map(d => `${d.x},${d.y}`).join(' '))
    .attr('fill', 'none')
    .attr('stroke', s.stroke)
    .attr('stroke-width', s.width)
    .attr('stroke-opacity', s.opacity)
    .attr('stroke-dasharray', s.dash)

  const nodeMap = new Map(props.nodes.map(n => [idOf(n.panelIdx, n.q, n.r), n]))
  const hexD = hexPathD(STYLE.HEX_R)

  g.selectAll('g.hex')
    .data(coords, d => idOf(d.panelIdx, d.q, d.r))
    .join(enter => {
      const gg = enter.append('g').attr('class', 'hex')
        .attr('transform', d => `translate(${d.x},${d.y})`)
      gg.append('path')
        .attr('d', hexD)
        .attr('fill', d => colorOfNode(nodeMap.get(idOf(d.panelIdx,d.q,d.r))))
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1)
      return gg
    })
}

onMounted(render)
watch(() => [props.link, props.nodes], render, { deep:true })
</script>

<style scoped>
.subcard{
  border:1px dashed #e5e7eb; border-radius:10px;
  display:grid; gap:4px;
  grid-template-rows:auto auto auto auto; /* 多了一行 meta */
  padding:4px;
  background:#fff;
}

/* ⓪ 新增：子空间标签（无边框） */
.subcard__meta{
  padding: 2px 2px 0 2px;
  line-height: 1;
  font-size: 12px;
  color:#6b7280;   /* 微灰 */
}
.meta-label{ font-weight:600; margin-right: 4px; }
.meta-names{ font-weight:500; }

/* 三个块 */
.subcard__hex, .subcard__source, .subcard__llm{
  border:1px dashed #e5e7eb; border-radius:8px; padding:6px;
  min-height:40px;
}

/* 概览更矮，横向滚动隐藏条 */
.subcard__hex{
  height:30px;
  overflow:hidden;
  position:relative;
}
.hex-scroll{
  max-width:100%;
  height:100%;
  display:flex;
  justify-content:flex-start; /* 左对齐 */
  align-items:center;         /* 垂直居中 */
  overflow-x:auto;
  overflow-y:hidden;
  scrollbar-width:none;
}
.hex-scroll::-webkit-scrollbar{ height:0; }

.placeholder{ color:#9ca3af; font-size:12px; }

.mini{ height:100%; display:block; }
</style>
