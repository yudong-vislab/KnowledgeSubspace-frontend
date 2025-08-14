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
html, body, #app { height: 100%; margin: 0; }
.app-shell {
  height: 100%;
  display: grid;
  grid-template-columns: 260px 1fr 300px; /* 左中右 */
  grid-template-rows: 100%;
  gap: 0;
}
.col { height: 100%; overflow: hidden; }
.col-left  { border-right: 1px solid #eee; background: #fafafa; }
.col-right { border-left: 1px solid #eee; background: #fafafa; }
.col-center{ background: #f0f0f0; }
</style>
