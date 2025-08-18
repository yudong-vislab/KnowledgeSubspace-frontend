<template>
  <section class="rp-card one">
    <header class="card__title">Steps</header>
    <div class="rp-card__body">
      <div class="steps-stack" ref="stackRef">
        <!-- 每个保存的步骤一张卡片 -->
        <article v-for="(step, i) in steps" :key="step.id" class="step-card">
          <!-- 1) 标题（可双击编辑） -->
          <div
            class="step__title"
            :data-index="i"
            @dblclick="beginEditTitle(i, $event)"
            @blur="finishEditTitle(i, $event)"
            @keydown="onTitleKey(i, $event)"
            :contenteditable="editingIdx === i ? 'plaintext-only' : 'false'"
            :title="editingIdx === i ? 'Enter to Save，Esc to Cancel' : 'Double click to'"
          >
            {{ step.title || defaultTitle(step, i) }}
          </div>

          <!-- 2) Hex 概览（预留：节点/连线统计或小预览） -->
          <div class="step__hex">
            <div class="mini-line">Nodes: {{ step.nodes?.length || 0 }}</div>
            <div class="mini-line">Links: {{ step.links?.length || 0 }}</div>
          </div>

          <!-- 3) 原文句子（预留占位） -->
          <div class="step__source">
            <div class="placeholder">Raw sentences / context (占位)</div>
          </div>

          <!-- 4) 大模型总结（预留占位） -->
          <div class="step__llm">
            <div class="placeholder">LLM summary (占位)</div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { onSelectionSaved } from '../lib/selectionBus'


const steps = ref([])        // 保存的步骤栈
const stackRef = ref(null)
const editingIdx = ref(-1)   // 正在编辑的标题索引

// 生成默认标题
const defaultTitle = (step, i) => {
  const t = step.createdAt ? new Date(step.createdAt) : new Date()
  const ts = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`
  return `Step ${i + 1} · ${ts}`
}

// 接收“保存步骤”，堆叠卡片
let offSaved = null
onMounted(() => {
  offSaved = onSelectionSaved((payload) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    steps.value.push({
      id,
      title: payload.title || '',
      createdAt: payload.createdAt || Date.now(),
      nodes: payload.nodes || [],
      links: payload.links || [],
      rawText: payload.rawText || '',
      summary: payload.summary || '',
      meta: payload.meta || {}
    })

    // 滚到最下（可选）
    requestAnimationFrame(() => {
      const el = stackRef.value
      if (el) el.scrollTop = el.scrollHeight
    })
  })
})

onBeforeUnmount(() => {
  offSaved?.()
})

/** ====== 标题编辑 ====== */
function beginEditTitle(i, evt) {
  editingIdx.value = i
  const el = evt.currentTarget
  if (!el) return
  // 选中全部文本
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  sel.removeAllRanges(); sel.addRange(range)
}

function finishEditTitle(i, evt) {
  if (editingIdx.value !== i) return
  const el = evt.currentTarget
  if (!el) { editingIdx.value = -1; return }
  const txt = (el.textContent || '').trim()
  steps.value[i].title = txt || ''
  editingIdx.value = -1
}

function onTitleKey(i, evt) {
  if (editingIdx.value !== i) return
  if (evt.key === 'Enter') {
    evt.preventDefault()
    evt.currentTarget?.blur()
  } else if (evt.key === 'Escape') {
    evt.preventDefault()
    // 取消：恢复显示内容
    const el = evt.currentTarget
    if (el) el.textContent = steps.value[i].title || defaultTitle(steps.value[i], i)
    editingIdx.value = -1
  }
}
</script>

<style scoped>
.rp-card.one{
  height:100%;
  background:#fff; border-radius:12px;
  display:flex; flex-direction:column; min-height:0; overflow:hidden;
}

.card__title{
  padding:10px 12px; font-weight:600; border-bottom:1px solid #eee;
}

.rp-card__body{
  padding:8px; min-height:0; overflow:auto;
}

/* 容器：隐藏滚动条但可滚动 */
.steps-stack{
  width:100%; height:100%; overflow:auto; min-height:0;
  scrollbar-width: none;           /* Firefox */
}
.steps-stack::-webkit-scrollbar{   /* WebKit */
  width:0; height:0;
}

/* 单个步骤卡片 */
.step-card{
  border:1px solid #e5e7eb; border-radius:10px;
  padding:8px; margin-bottom:10px;
  display:grid;
  grid-template-rows: auto auto auto auto; /* 标题 + hex + 原文 + LLM */
  gap:8px;
  background:#fff;
}

/* 1) 标题条：可双击编辑 */
.step__title{
  font-weight:600; line-height:1.4; padding:6px 8px; border-radius:8px;
  background:#f9fafb; user-select:text; cursor:text;
  outline:none; border:1px dashed transparent;
}
.step__title[contenteditable="plaintext-only"]{
  border-color:#c7d2fe; background:#eef2ff;
}

/* 2-4) 三个内容块（先放占位） */
.step__hex, .step__source, .step__llm{
  border:1px dashed #e5e7eb; border-radius:8px; padding:8px; min-height:44px;
}

.mini-line{ font-size:12px; color:#6b7280; }
.placeholder{ color:#9ca3af; font-size:12px; }
</style>
