<!-- src/App.vue -->
<template>
  <div class="app-container">
    <TitleBar />

    <div class="app-shell">
      <aside class="col col-left">
        <LeftPane />
      </aside>

      <main class="col col-center">
        <MainView />
      </main>

      <aside class="col col-right">
        <RightPane />
      </aside>
    </div>
  </div>
</template>

<script setup>
import TitleBar from './components/TitleBar.vue'
import LeftPane from './components/LeftPane.vue'
import MainView from './components/MainView.vue'
import RightPane from './components/RightPane.vue'
</script>

<style>
html, body, #app { height: 100%; margin: 0; background: #f3f4f6; }

/* 固定一个 CSS 变量作为顶栏高度，方便后续统一改 */
:root{
  --titlebar-h: 40px;   /* 你要的“扁扁一条”高度 */
}

.app-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 关键：三栏容器高度 = 100% - 顶栏高度 */
.app-shell {
  height: calc(100% - var(--titlebar-h));
  /* 也可用 flex: 1;min-height:0; 但明确 height 更稳妥 */
  display: grid;
  grid-template-columns: 300px minmax(0,1fr) 400px;
  gap: 5px;
  padding: 5px;
  box-sizing: border-box;
  align-items: stretch;
  overflow: hidden;   /* 防止自身出现整体滚动条 */
}

/* 各列自己滚，不让外层滚动 */
.col {
  background: #fff;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;      /* 允许子元素成为滚动容器 */
  overflow: hidden;   /* 裁剪圆角内的滚动条 */
}

/* 中间列作为内容滚动容器 */
.col-center {
  position: relative;
  overflow: auto;
  background: #fff;
  scrollbar-width: none;
}
.col-center::-webkit-scrollbar { width: 0; height: 0; }

.card__title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  border-bottom: 1px solid #eee;
  padding: 8px;
}

</style>
