<!-- src/components/RightPane.vue -->
<template>
  <section class="rp-card one">
    <header class="card__title">In-process Analysis View</header>

    <div class="rp-card__body">
      <div class="steps-stack" ref="stackRef">
        <!-- 父卡片（一次保存） -->
        <article v-for="(step, i) in steps" :key="step.id" class="step-card">
          <!-- 标题（一次保存一个） -->
          <div
            class="step__title"
            :data-index="i"
            @dblclick="beginEditTitle(i, $event)"
            @blur="finishEditTitle(i, $event)"
            @keydown="onTitleKey(i, $event)"
            :contenteditable="editingIdx === i ? 'plaintext-only' : 'false'"
            :title="editingIdx === i ? 'Enter to Save，Esc to Cancel' : 'Double click to Edit'"
          >
            {{ step.title || defaultTitle(step, i) }}
          </div>

          <!-- 子卡片列表：每条 link 一张 -->
          <div class="subcards">
            <LinkCard
              v-for="(lk, j) in (step.links || [])"
              :key="j"
              :link="lk"
              :nodes="step.nodes || []"
            />
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { onSelectionSaved } from '../lib/selectionBus'
import LinkCard from './LinkCard.vue'

const steps = ref([])
const stackRef = ref(null)
const editingIdx = ref(-1)

const defaultTitle = (step, i) => {
  const t = step.createdAt ? new Date(step.createdAt) : new Date()
  const ts = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`
  return `Step ${i + 1} · ${ts}`
}

let offSaved = null
onMounted(() => {
  offSaved = onSelectionSaved((payload) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    // 直接用 semanticMap 的快照结构：{nodes, links}
    steps.value.push({
      id,
      title: payload.title || '',
      createdAt: payload.createdAt || Date.now(),
      nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
      links: Array.isArray(payload.links) ? payload.links : [],
      rawText: payload.rawText || '',
      summary: payload.summary || '',
      meta: payload.meta || {}
    })
    requestAnimationFrame(() => {
      const el = stackRef.value
      if (el) el.scrollTop = el.scrollHeight
    })
  })
})
onBeforeUnmount(() => offSaved?.())

/** ====== 标题编辑 ====== */
function beginEditTitle(i, evt) {
  editingIdx.value = i
  const el = evt.currentTarget
  if (!el) return
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
    const el = evt.currentTarget
    if (el) el.textContent = steps.value[i].title || defaultTitle(steps.value[i], i)
    editingIdx.value = -1
  }
}
</script>

<style scoped>
.rp-card.one{ height:100%; background:#fff; border-radius:12px;
  display:flex; flex-direction:column; min-height:0; overflow:hidden; }
/* .card__title{ padding:10px 12px; font-weight:800; font-size: 16px; border-bottom:1px solid #eee; } */
.rp-card__body{ padding:6px; min-height:0; overflow:auto; }

.steps-stack{ width:100%; height:100%; overflow:auto; min-height:0; scrollbar-width: none; }
.steps-stack::-webkit-scrollbar{ width:0; height:0; }

.step-card{
  border:1px solid #e5e7eb; border-radius:10px;
  padding:6px; margin-bottom:10px;
  display:grid; gap:4px;
  grid-template-rows: auto auto;  /* 标题 + 子卡片区 */
  background:#fff;
}
.step__title{
  font-weight:600; font-size: 14px;line-height:1; padding:6px 6px; border-radius:8px;
  background:#f9fafb; user-select:text; cursor:text;
  outline:none; border:1px dashed transparent;
}
.step__title[contenteditable="plaintext-only"]{ border-color:#c7d2fe; background:#eef2ff; }

.subcards{
  display:flex; flex-direction:column; gap:10px;
}
</style>
