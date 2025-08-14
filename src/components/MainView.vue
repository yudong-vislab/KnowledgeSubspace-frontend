<!-- src/components/MainView.vue（只展示需要改的部分） -->
<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick } from 'vue'
import { initSemanticMap } from '../lib/semanticMap'
import { fetchSemanticMap, createSubspace, renameSubspace } from '../lib/api'

const outerRef = ref(null)
const playgroundRef = ref(null)
const globalOverlayRef = ref(null)
const mainTitleRef = ref(null)          // ✅ 新增：主标题的 ref
let controller = null

onMounted(async () => {
  await nextTick()
  const data = await fetchSemanticMap()

  controller = await initSemanticMap({
    outerEl: outerRef.value,
    playgroundEl: playgroundRef.value,
    globalOverlayEl: globalOverlayRef.value,
    mainTitleEl: mainTitleRef.value,     // ✅ 把标题 DOM 传进去
    initialData: data
  })

  // 子空间重命名
  controller.setOnSubspaceRename(async (idx, newName) => {
    await renameSubspace(idx, newName)
  })

  // 主标题重命名（可选：同步到后端）
  controller.setOnMainTitleRename(async (newTitle) => {
    // TODO: 在这里调用你的 API 保存主标题
    // await saveMainTitle(newTitle)
    console.log('[MainView] main title renamed to:', newTitle)
  })
})

onBeforeUnmount(() => controller?.cleanup?.())
</script>

<template>
  <div class="mainview">
    <header class="mv-header">
      <h2 class="mv-title" ref="mainTitleRef">Semantic Map</h2>  <!-- ✅ 绑定 ref -->
      <div class="mv-actions">
        <button class="add-btn" @click="onAddSubspace" title="Add subspace">＋</button>
        <button class="filter-btn" title="Filter">F</button>
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

/* playground 占满滚动容器宽度，最小高度保证背景铺满 */
#playground {
  position: relative;
  min-height: 100%;
  width: 100%;
  padding: 32px;
  background: #fff;  /* 背景跟随滚动区 */
  box-sizing: border-box;
}

/* 覆盖层要绝对定位到 playground 内 */
#global-overlay {
  position: absolute;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
}

/* ====== 子空间（跟你现有的 style.css 一致，如需要可以保留） ====== */
#playground .subspace {
  position: absolute;
  min-width: 360px;
  min-height: 400px;
  max-width: 1000px;
  max-height: 1000px;
  left: 0; top: 0;
  resize: both;
  overflow: auto;
  background: #fff;
  border: 1.5px solid #aaa;
  border-radius: 10px;
  box-shadow: 0 2px 10px #0001;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  user-select: none;
  z-index: 1;
}

#playground .subspace-title {
  cursor: move;
  font-size: 14px;
  color: #666;
  text-align: center;
  margin: 5px 0 2px 0;
  pointer-events: auto;
  user-select: none;
  position: relative;
  z-index: 20;
}

#playground .hex-container {
  position: relative;
  width: 100%;
  height: 92%;
  flex: 1;
}

#playground .hex-svg,
#playground .overlay-svg {
  position: absolute;
  left: 0; top: 0;
  width: 100%;
  height: 100%;
}

#playground .overlay-svg {
  pointer-events: none;
}

/* ====== 顶部按钮样式（居中、大小可调） ====== */
.add-btn,
.filter-btn {
  display: inline-flex;        /* 用 flex 保证字符始终在正中 */
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: 14px;             /* 调整按钮内字的大小 */
  line-height: 1;              /* 避免受行高影响 */
  border: 1px solid #ddd;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  box-shadow: 0 2px 2px rgba(0,0,0,.08);
}

.add-btn:hover,
.filter-btn:hover {
  background: #f7f7f7;
}
</style>
