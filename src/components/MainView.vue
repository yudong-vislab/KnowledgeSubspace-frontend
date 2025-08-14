<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick } from 'vue'
import { initSemanticMap } from '../lib/semanticMap'
import { fetchSemanticMap, createSubspace, renameSubspace } from '../lib/api' // 路径按你项目调整

const outerRef = ref(null)
const playgroundRef = ref(null)
const globalOverlayRef = ref(null)
let controller = null

onMounted(async () => {
  await nextTick() // ← 关键：等 DOM 渲染完成

  if (!outerRef.value || !playgroundRef.value || !globalOverlayRef.value) {
    console.error('[MainView] refs not ready', {
      outer: !!outerRef.value, play: !!playgroundRef.value, overlay: !!globalOverlayRef.value
    })
    return
  }

  const data = await fetchSemanticMap()
  controller = await initSemanticMap({
    outerEl: outerRef.value,
    playgroundEl: playgroundRef.value,
    globalOverlayEl: globalOverlayRef.value,
    initialData: data
  })

  // 把重命名回调装进去（内部会挂到 App.onSubspaceRename）
  controller.setOnSubspaceRename(async (idx, newName) => {
    await renameSubspace(idx, newName)
  })
})

onBeforeUnmount(() => controller?.cleanup?.())

async function onAddSubspace() {
  const created = await createSubspace({})
  controller?.addSubspace?.(created.subspace)
}
</script>

<template>
  <div class="root">
    <div ref="outerRef" id="outer-container">
      <button class="add-btn" @click="onAddSubspace">＋</button>
      <div ref="playgroundRef" id="playground">
        <svg ref="globalOverlayRef" id="global-overlay"></svg>
      </div>
    </div>
  </div>
</template>
