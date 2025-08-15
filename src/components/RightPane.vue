<template>
  <div class="rp-shell">
    <!-- 上半卡片：Step Analysis -->
    <section class="rp-card">
      <header class="card__title">Step Analysis</header>
      <div class="rp-card__body">
        <div ref="visRef" class="stepvis-host"></div>
      </div>
    </section>

    <!-- 下半卡片：Details（原样） -->
    <section class="rp-card">
      <header class="card__title">Details</header>
      <div class="rp-card__body">
        <!-- 细节面板… -->
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { initStepVis } from '../lib/stepVis'
import { onSelectionChange } from '../lib/selectionBus'

const visRef = ref(null)
let vis = null
let off = null

onMounted(() => {
  vis = initStepVis({ container: visRef.value, initial: { nodes: [], links: [] } })
  // 订阅来自主视图的 selection
  off = onSelectionChange((payload) => {
    vis?.update(payload)
  })
})

onBeforeUnmount(() => {
  off?.()
  vis?.destroy?.()
})
</script>

<style scoped>
.rp-shell{
  height: 100%;
  display: grid;
  grid-template-rows: 1fr 1fr; /* 先均分，上下比例你可再调 */
  gap: 6px;
  background: #f3f4f6;
  box-sizing: border-box;
}

.rp-card{
  background:#fff; border-radius:12px;
  display:flex; flex-direction:column; min-height:0; overflow:hidden;
}

.rp-card__body{
  padding: 8px; min-height:0; overflow:auto;
}

/* 可视化容器占满 */
.stepvis-host{ width:100%; height:100%; }
.stepvis-svg{ display:block; }
</style>
