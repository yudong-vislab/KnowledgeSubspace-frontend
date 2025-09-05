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
import { onMounted, watch, ref, onBeforeUnmount } from 'vue'
import { mountMiniLink } from '@/lib/useLinkCard'

const props = defineProps({
  link:  { type: Object, required: true },
  nodes: { type: Array,  default: () => [] },
  startCountMap: { type: Object, default: () => new Map() },

  // 颜色映射（已有）
  colorByCountry: { type: [Object, Map], default: () => ({}) },
  colorByPanelCountry: { type: [Object, Map], default: () => ({}) },
  normalizeCountryId: { type: Function, default: (x) => x },

  // ★ NEW：透明度映射，key = "panelIdx:q,r"；既支持 Map 也支持普通对象
  alphaByNode: { type: [Object, Map], default: () => ({}) },
  // ★ NEW：默认透明度（没有命中 alphaByNode 时用）
  defaultAlpha: { type: Number, default: 1 }
})

const svgRef = ref(null)
let mini = null

onMounted(() => {
  mini = mountMiniLink(svgRef.value, {
    link: props.link,
    nodes: props.nodes,
    startCountMap: props.startCountMap,

    colorByCountry: props.colorByCountry,
    colorByPanelCountry: props.colorByPanelCountry,
    normalizeCountryId: props.normalizeCountryId,

    // ★ 透传透明度
    alphaByNode: props.alphaByNode,
    defaultAlpha: props.defaultAlpha
  })
})

watch(
  () => [
    props.link,
    props.nodes,
    props.startCountMap,
    props.colorByCountry,
    props.colorByPanelCountry,
    props.normalizeCountryId,
    // ★ 监听这两个
    props.alphaByNode,
    props.defaultAlpha
  ],
  () => {
    mini?.update({
      link: props.link,
      nodes: props.nodes,
      startCountMap: props.startCountMap,

      colorByCountry: props.colorByCountry,
      colorByPanelCountry: props.colorByPanelCountry,
      normalizeCountryId: props.normalizeCountryId,

      // ★ 透传透明度
      alphaByNode: props.alphaByNode,
      defaultAlpha: props.defaultAlpha
    })
  },
  { deep: true }
)

onBeforeUnmount(() => mini?.destroy())
</script>

<style scoped>
/* 原样保留你的样式 */
.subcard{
  border:1px dashed #e5e7eb; border-radius:10px;
  display:grid; gap:4px;
  grid-template-rows:auto auto auto auto;
  padding:4px; background:#fff;
}
.subcard__meta{ padding:2px 2px 0 2px; line-height:1; font-size:12px; color:#6b7280; }
.meta-label{ font-weight:600; margin-right:4px; }
.meta-names{ font-weight:500; }
.subcard__hex, .subcard__source, .subcard__llm{
  border:1px dashed #e5e7eb; border-radius:8px; padding:6px; min-height:40px;
}
.subcard__hex{ height:30px; overflow:hidden; position:relative; }
.hex-scroll{
  max-width:100%; height:100%; display:flex; justify-content:flex-start; align-items:center;
  overflow-x:auto; overflow-y:hidden; scrollbar-width:none;
}
.hex-scroll::-webkit-scrollbar{ height:0; }
.placeholder{ color:#9ca3af; font-size:12px; }
.mini{ height:100%; display:block; }
</style>
