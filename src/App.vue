<!-- src/App.vue -->
<template>
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
</template>

<script setup>
import LeftPane from './components/LeftPane.vue'
import MainView from './components/MainView.vue'
import RightPane from './components/RightPane.vue'
</script>

<style>
html, body, #app { height: 100%; margin: 0; background: #f3f4f6; }

.app-shell {
  min-height: 100%;
  display: grid;
  grid-template-columns: 300px minmax(0,1fr) 400px; /* 左中右 */
  grid-auto-rows: 1fr;
  gap: 5px;                /* 左中右之间的“窄外边距” */
  padding: 5px 5px;       /* 上下左右的页面边距（让三列上下都有留白） */
  box-sizing: border-box;
  align-items: stretch;     /* 让三列等高 */
}

.col {
  background: #fff;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;   /* 允许内部元素做滚动 */
  overflow: hidden;/* 裁剪圆角内的内容/滚动条 */
}
/* 中间列 = 滚动容器 */
.col-center {
  position: relative;         /* 让内部的 sticky/fixed 以它为参照 */
  height: 100%;
  overflow: auto;             /* 只有这里滚动 */
  background: #fff;           /* 背景跟随高度，自适应 */
  scrollbar-gutter: stable;   /* 预留滚动槽，不会因出现滚动条而挤开内容 */
  /* 自动隐藏滚动条 */
  scrollbar-width: none;                      /* Firefox */
}
.col-center::-webkit-scrollbar { width: 0; height: 0; } /* WebKit */
</style>

