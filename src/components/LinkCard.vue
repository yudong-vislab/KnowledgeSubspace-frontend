<!-- src/components/LinkCard.vue -->
<template>
  <section class="subcard" :class="{ 'expanded': showOriginal }">
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

    <!-- ② 原文句子 - 显示当前link关联的MSU句子 -->
    <div class="subcard__source">
      <div v-if="linkMsuSentences.length > 0" class="msu-sentences">
        <div v-for="(msu, index) in linkMsuSentences" :key="index" class="msu-sentence">
          <div class="msu-meta">
            <span class="msu-id">MSU {{ msu.id }}</span>
            <button 
              class="show-original-btn" 
              @click="toggleOriginal"
            >
              {{ showOriginal ? 'Hide Details' : 'Show Details' }}
            </button>
          </div>
          <div class="msu-text">{{ msu.sentence }}</div>
          
          <!-- 展开显示的para_info -->
          <div v-if="showOriginal && msu.para_info" class="para-info">
            <div class="para-info-content">{{ msu.para_info }}</div>
          </div>
        </div>
      </div>
      <div v-else class="placeholder">No MSU sentences for this link</div>
    </div>

    <!-- ③ 大模型总结 -->
    <div class="subcard__llm">
      <div v-if="llmSummary" class="llm-content">
        {{ llmSummary }}
      </div>
      <div v-else-if="llmLoading" class="llm-loading">
        LLM is summarizing...
      </div>
      <div v-else-if="llmError" class="llm-error">
        {{ llmError }}
      </div>
      <div v-else class="placeholder">LLM summary</div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, watch, ref, onBeforeUnmount, computed } from 'vue'
import { mountMiniLink } from '@/lib/useLinkCard'
import { summarizeMsuSentences } from '@/lib/api'

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
const showOriginal = ref(false)
const llmSummary = ref('')
const llmLoading = ref(false)
const llmError = ref('')

// 切换显示/隐藏原文
const toggleOriginal = () => {
  showOriginal.value = !showOriginal.value
}

// 计算当前link关联的MSU句子
const linkMsuSentences = computed(() => {
  if (!props.link?.path || !Array.isArray(props.nodes)) return []
  
  // 创建节点映射：key -> node
  const nodeMap = new Map()
  props.nodes.forEach(node => {
    const key = `${node.panelIdx}:${node.q},${node.r}`
    nodeMap.set(key, node)
  })

  // 收集当前link path中所有节点的MSU数据
  const allMsus = []
  const path = Array.isArray(props.link.path) ? props.link.path : []
  
  path.forEach(point => {
    const pointKey = `${point.panelIdx}:${point.q},${point.r}`
    const node = nodeMap.get(pointKey)
    
    // 直接使用node.msu（已解析的完整MSU数据）
    if (node?.msu && Array.isArray(node.msu)) {
      allMsus.push(...node.msu)
    }
  })

  // 去重（基于MSU ID）
  const uniqueMsus = []
  const seenIds = new Set()
  
  allMsus.forEach(msu => {
    if (msu?.MSU_id && !seenIds.has(msu.MSU_id)) {
      seenIds.add(msu.MSU_id)
      uniqueMsus.push({
        id: msu.MSU_id,
        sentence: msu.sentence || 'No sentence available',
        category: msu.category || 'Unknown',
        para_info: msu.para_info || null,
        ...msu
      })
    }
  })

  return uniqueMsus
})

// 生成LLM总结
const generateSummary = async () => {
  if (linkMsuSentences.value.length === 0) {
    llmSummary.value = '暂无内容可总结';
    return;
  }

  llmLoading.value = true;
  llmError.value = '';
  
  try {
    const sentences = linkMsuSentences.value.map(msu => msu.sentence);
    const summary = await summarizeMsuSentences(sentences);
    llmSummary.value = summary;
  } catch (error) {
    console.error('生成总结失败:', error);
    llmError.value = '总结生成失败，请重试';
  } finally {
    llmLoading.value = false;
  }
}

// 监听MSU句子变化，自动生成总结
watch(linkMsuSentences, (newSentences) => {
  if (newSentences && newSentences.length > 0) {
    generateSummary();
  } else {
    llmSummary.value = '';
    llmError.value = '';
  }
}, { immediate: true })

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
  transition: all 0.3s ease;
}

.subcard.expanded {
  grid-template-rows: auto auto auto auto;
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

/* MSU句子显示样式 */
.subcard__source {
  max-height: 200px;
  overflow-y: auto;
  transition: all 0.3s ease;
}
.subcard.expanded .subcard__source {
  max-height: 500px;
}
.msu-sentences {
  font-size: 11px;
  line-height: 1.4;
}
.msu-sentence {
  margin-bottom: 8px;
  padding: 6px;
  background: #f9fafb;
  border-radius: 4px;
  border-left: 3px solid #e5e7eb;
}
.msu-sentence:last-child {
  margin-bottom: 0;
}
.msu-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.msu-id {
  font-weight: 600;
  color: #374151;
  font-size: 10px;
}
.show-original-btn {
  font-size: 9px;
  padding: 2px 8px;
  border-radius: 12px;
  background: #3b82f6;
  color: white;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
}
.show-original-btn:hover {
  background: #2563eb;
}
.msu-text {
  color: #374151;
  font-size: 11px;
  line-height: 1.5;
}

/* para_info 样式 */
.para-info {
  margin-top: 8px;
  padding: 8px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}
.para-info-content {
  color: #4b5563;
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-wrap;
}

/* LLM总结样式 */
.subcard__llm {
  max-height: 100px;
  overflow-y: auto;
}
.llm-content {
  font-size: 11px;
  line-height: 1.4;
  color: #374151;
  padding: 6px;
  background: #f0f9ff;
  border-radius: 4px;
  border-left: 3px solid #0ea5e9;
}
.llm-loading {
  font-size: 11px;
  color: #6b7280;
  font-style: italic;
  padding: 6px;
}
.llm-error {
  font-size: 11px;
  color: #ef4444;
  padding: 6px;
}

.placeholder{ color:#9ca3af; font-size:12px; }
.mini{ height:100%; display:block; }
</style>
