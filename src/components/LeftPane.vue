<!-- src/components/LeftPane.vue -->
<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import ChatDock from './ChatDock.vue'

const selectedLLM = ref('ChatGPT')
const llmOptions = ['ChatGPT', 'QWen']

const messages = ref([{ role:'system', text:'First...' }])

const msgBoxRef = ref(null)
const atBottom = ref(true)

function isNearBottom(el, threshold = 80) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}
function scrollToBottom(behavior = 'smooth') {
  const el = msgBoxRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior })
}
function onMsgsScroll(e) {
  atBottom.value = isNearBottom(e.target)
}
onMounted(() => nextTick(() => scrollToBottom('instant')))
watch(() => messages.value.length, async () => {
  await nextTick()
  if (atBottom.value) scrollToBottom('smooth')
})

function handleSend(msg){
  messages.value.push({ role:'user', text: msg })
  setTimeout(() => messages.value.push({ role:'assistant', text: 'Received...' }), 300)
}
function handleUploadFiles(files){ /* … */ }
</script>

<template>
  <div class="lp-shell">
    <!-- 1) Parameters（包含 LLM 选择） -->
    <section class="lp-card">
      <header class="card__title">Parameters</header>

      <!-- 顶部工具条：选择大模型 -->
      <div class="param-toolbar">
        <span class="label">Selected LLM:</span>
        <select class="lp-select" v-model="selectedLLM">
          <option v-for="o in llmOptions" :key="o" :value="o">{{ o }}</option>
        </select>
      </div>

      <!-- 参数主体内容 -->
      <div class="lp-card__body">
        <p>…</p>
      </div>
    </section>

    <!-- 2) 论文列表 -->
    <section class="lp-card">
      <header class="card__title">Paper List</header>
      <div class="lp-card__body scroll-auto-hide">
        <ul class="fake-list">
          <li v-for="i in 12" :key="i">Paper #{{ i }}</li>
        </ul>
      </div>
    </section>

    <!-- 3) 对话区（消息 + 输入条） -->
    <section class="lp-card lp-chat">
      <header class="card__title">Chat with LLM</header>

      <div ref="msgBoxRef" class="lp-msgs" @scroll="onMsgsScroll">
        <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
          <div class="msg-bubble">{{ m.text }}</div>
        </div>
      </div>

      <ChatDock @send="handleSend" @upload-files="handleUploadFiles" />
    </section>
  </div>
</template>

<style scoped>
/* —— 布局：改为 3 行 —— */
.lp-shell{
  height:100%;
  display:grid;
  grid-template-rows: 1fr 1.2fr 2fr; /* Parameters / Paper / Chat */
  gap:6px;
  background:#f3f4f6;
  box-sizing:border-box;
  overflow:hidden;
}

/* —— 通用卡片 —— */
.lp-card{
  --r: 12px;
  background:#fff;
  border-radius: var(--r);
  display:flex;
  flex-direction:column;
  min-height:0;
  overflow:hidden;  /* 让内部滚动条被圆角裁切 */
}
/* .lp-card__title{
  font-size:14px;
  font-weight:600;
  color:#333;
  border-bottom:1px solid #eee;
  padding:8px 10px;
} */
.lp-card__body{
  padding:10px;
  overflow:auto;
  min-height:0;
  border-bottom-left-radius: var(--r);
  border-bottom-right-radius: var(--r);
  background-clip: padding-box;
}

/* —— Parameters 顶部工具条（替代原 lp-title） —— */
.param-toolbar{
  display:flex;
  align-items:center;
  gap:8px;
  padding:8px 10px 0; /* 与卡片边缘对齐，靠上放 */
}
.param-toolbar .label{
  font-size:11px;
  color:#555;
}
.lp-select{
  appearance:none;
  -webkit-appearance:none;
  -moz-appearance:none;
  font-size:11px;
  line-height:1;
  padding:6px 24px 6px 10px;
  border-radius:8px;
  border:1px solid #e5e7eb;
  background:#fff;
  color:#111;
  cursor:pointer;
}
.lp-select:focus{
  outline:none;
  box-shadow:0 0 0 3px #eef2ff;
  border-color:#c7d2fe;
}

/* —— Paper 列表占位 —— */
.fake-list{ margin:0; padding-left:18px; }
.fake-list li{ line-height:1.8; }

/* —— Chat 区域 —— */
.lp-chat{
  display:grid;
  grid-template-rows: auto 1fr auto;  /* 头 / 消息 / 输入条 */
  overflow:hidden;
}
.lp-msgs{
  padding:10px 2px;
  overflow:auto;
  min-height:0;
  display:flex;
  flex-direction:column;
  gap:8px;
  scrollbar-gutter: stable both-edges;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.lp-msgs::-webkit-scrollbar{ width:8px; height:8px; }
.lp-msgs::-webkit-scrollbar-thumb{ background:transparent; border-radius:4px; }
.lp-msgs::-webkit-scrollbar-track{ background:transparent; }
.lp-msgs:hover{ scrollbar-color: rgba(0,0,0,.25) transparent; }
.lp-msgs:hover::-webkit-scrollbar-thumb{ background: rgba(0,0,0,.25); }

/* 气泡 */
.msg{ display:flex; }
.msg.user{ justify-content:flex-end; }
.msg .msg-bubble{
  max-width:90%;
  padding:8px 10px;
  border-radius:10px;
  font-size:11px;
  background:#f3f4f6;
}
.msg.user .msg-bubble{ background:#111; color:#fff; }
</style>
