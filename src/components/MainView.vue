<!-- src/components/MainView.vue（只展示需要改的部分） -->
<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick } from 'vue'
import { initSemanticMap } from '../lib/semanticMap'
import { fetchSemanticMap, createSubspace, renameSubspace } from '../lib/api'
import { emitSelectionSaved } from '../lib/selectionBus'

const outerRef = ref(null)
const playgroundRef = ref(null)
const globalOverlayRef = ref(null)
const mainTitleRef = ref(null)
let controller = null
const ready = ref(false)

onMounted(async () => {
  await nextTick()
  if (!outerRef.value || !playgroundRef.value || !globalOverlayRef.value) return
  const data = await fetchSemanticMap()
  controller = await initSemanticMap({
    outerEl: outerRef.value,
    playgroundEl: playgroundRef.value,
    globalOverlayEl: globalOverlayRef.value,
    mainTitleEl: mainTitleRef.value,
    initialData: data
  })
  controller.setOnSubspaceRename(async (idx, newName) => {
    await renameSubspace(idx, newName)
  })
  ready.value = true
})

onBeforeUnmount(() => controller?.cleanup?.())

async function onAddSubspace() {
  if (!ready.value || !controller) return
  const created = await createSubspace({})
  controller.addSubspace?.(created?.subspace || { subspaceName: 'New Subspace', hexList: [] })
}

/* 点击 Save 时，打印当前选择的节点 */
function onSave() {
  if (!ready.value || !controller) return

  // 获取带 connected:true 的快照
  const snap = controller.getSelectionSnapshot?.() || { nodes: [], links: [] }

  // —— 打印筛选结果 —— //
  console.groupCollapsed('[SemanticMap] Selection Snapshot')
  console.log('nodes:', snap.nodes)
  console.log('links:', snap.links)
  console.groupEnd()

  // —— 广播给右侧 —— //
  emitSelectionSaved(snap)
}


</script>

<template>
  <div class="mainview">
    <header class="mv-header">
      <h2 class="mv-title editable-title" ref="mainTitleRef">Semantic Map</h2>
      <div class="mv-actions">
        <button class="add-btn" @click="onAddSubspace" title="Add subspace">＋</button>
        <button class="filter-btn" title="Filter">Filter</button>
        <!-- 把 save 按钮绑上 onSave -->
        <button class="save-btn" title="Save" @click="onSave">Save</button>
      </div>
    </header>

    <div ref="outerRef" class="mv-scroller">
      <div ref="playgroundRef" id="playground">
        <svg ref="globalOverlayRef" id="global-overlay"></svg>
      </div>
    </div>
  </div>
</template>


<style scoped>
/* 根容器：上下布局，header 固定在上，下面是滚动区 */
.mainview {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;  /* 顶部自适应高度 + 下方占满 */
  grid-template-columns: 100%;
}

/* 顶部标题栏 */
.mv-header {
  position: sticky;     /* 如果你希望它在大容器滚动时仍吸顶，可以 sticky；当前父容器不滚，fixed/relative 都行 */
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between; /* 左侧标题 & 右侧按钮 */
  padding: 8px 12px;
  background: #fff;     /* 固定栏底色 */
  border-bottom: 1px solid #eee;
}

/* 标题文字 */
.mv-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

/* 右侧按钮容器：横向排列、保持右对齐 */
.mv-actions {
  display: flex;
  align-items: center;
  gap: 8px;             /* 两个按钮间距 */
}

/* 让中间区域成为滚动容器；滚动条自动隐藏（兼容 Chrome/Edge/Safari/Firefox） */
.mv-scroller {
  position: relative;
  height: 100%;
  overflow: auto;
  background: #fff;
  /* 让出现滚动条也不挤压布局（现代浏览器） */
  scrollbar-gutter: stable both-edges;
}

/* WebKit 自动隐藏滚动条（仍可滚动） */
.mv-scroller::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.mv-scroller::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
}
.mv-scroller:hover::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,.15);
}
.mv-scroller::-webkit-scrollbar-track {
  background: transparent;
}

/* Firefox 自动隐藏风格 */
.mv-scroller {
  scrollbar-width: thin;          /* 细滚动条 */
  scrollbar-color: transparent transparent;
}
.mv-scroller:hover {
  scrollbar-color: rgba(0,0,0,.25) transparent;
}



</style>
