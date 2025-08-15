<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import ChatDock from './ChatDock.vue'

const messages = ref([{ role:'system', text:'First...' }])

// === 新增：消息容器引用 & 状态 ===
const msgBoxRef = ref(null)
const atBottom = ref(true)   // 仅当用户在底部时，才自动滚动

function isNearBottom(el, threshold = 80) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}

function scrollToBottom(behavior = 'smooth') {
  const el = msgBoxRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior })
}

function onMsgsScroll(e) {
  const el = e.target
  atBottom.value = isNearBottom(el)
}

// 初次挂载：如果内容超出则滚到底（用 instant 避免首次动画）
onMounted(() => nextTick(() => scrollToBottom('instant')))

// 监听消息变更：仅在 atBottom 时滚到最新
watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    if (atBottom.value) scrollToBottom('smooth')
  }
)

// 你原来的发送/上传占位逻辑
function handleSend(msg){
  messages.value.push({ role:'user', text: msg })
  // mock 回复
  setTimeout(() => {
    messages.value.push({ role:'assistant', text: 'Received...' })
  }, 300)
}
function handleUploadFiles(files){ 

  /* ... */ 
}

</script>


<template>
  <div class="lp-shell">
    <!-- 1) 标题 -->
    <section class="lp-card lp-title">
      <div class="lp-title__text">Visual Analytics</div>
    </section>

    <!-- 2) 上传区 -->
    <section class="lp-card">
      <header class="lp-card__title">Parameters</header>
      <div class="lp-card__body">
        <!-- 这里放上传控件（占位） -->
        <p>…</p>
      </div>
    </section>

    <!-- 3) 论文列表 -->
    <section class="lp-card">
      <header class="lp-card__title">Paper List</header>
      <!-- 给滚动容器加自动隐藏类 -->
      <div class="lp-card__body scroll-auto-hide">
        <ul class="fake-list">
          <li v-for="i in 12" :key="i">Paper #{{ i }}</li>
        </ul>
      </div>
    </section>

    <!-- 4) 对话区（消息 + 输入条） -->
    <section class="lp-card lp-chat">
      <header class="lp-card__title">Chat with LLM</header>
      <!-- 消息区也加自动隐藏类 -->
      <div
        ref="msgBoxRef"
        class="lp-msgs"
        @scroll="onMsgsScroll"
      >
        <div
          v-for="(m, i) in messages"
          :key="i"
          class="msg"
          :class="m.role"
        >
          <div class="msg-bubble">{{ m.text }}</div>
        </div>
      </div>
      <ChatDock @send="handleSend" @upload-files="handleUploadFiles" />
    </section>

  </div>
</template>

<style scoped>
/* 灰底 + 竖直 4 行布局（标题固定高，其余自适应） */
.lp-shell{
  height:100%;
  display:grid;
  grid-template-rows: auto 1fr 1.2fr 2fr; /* 你可以微调比例 */
  gap:6px;
  background:#f3f4f6;
  box-sizing:border-box;
  overflow:hidden;
}

/* 卡片通用 */
.lp-card{
  background:#fff;
  border-radius:10px;
  display:flex;
  flex-direction:column;
  min-height:0; /* 允许内部滚动 */
}

.lp-card__title{
  font-size:14px;
  font-weight:600;
  color:#333;
  border-bottom:1px solid #eee;
  padding:8px 10px;
}

.lp-card__body{
  padding:10px;
  overflow:auto;
  min-height:0;
}

/* 仅标题卡：更紧凑一点 */
.lp-title{
  display:flex; align-items:center;
  padding:8px 10px;
}
.lp-title__text{ font-weight:700; }

/* 假列表占位 */
.fake-list{ margin:0; padding-left:18px; }
.fake-list li{ line-height:1.8; }

/* —— 对话卡 —— */
.lp-chat{
  /* 让消息区 + 输入条竖向排列 */
  display:grid;
  grid-template-rows: auto 1fr auto; /* 头、消息、输入条 */
  overflow:hidden;
}

/* 消息区可滚动；与输入条分离 */
.lp-msgs{
  padding: 10px;
  overflow: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;

  /* 关键：即便滚动条隐藏也预留槽位，避免元素抖动 */
  scrollbar-gutter: stable both-edges;   /* 现代浏览器 */
  scrollbar-width: none;                 /* Firefox 隐藏滚动条 */
}
.lp-msgs::-webkit-scrollbar { width: 0; height: 0; }  /* WebKit 隐藏滚动条 */

/* 气泡样式占位 */
.msg{ display:flex; }
.msg.user{ justify-content:flex-end; }
.msg .msg-bubble{
  max-width: 90%;
  padding:8px 10px;
  border-radius: 10px;
  font-size: 11px;
  background:#f3f4f6;
}
.msg.user .msg-bubble{ background:#111; color:#fff; }

/* 卡片统一圆角，并用 overflow: hidden 让内部滚动条被圆角裁切 */
.lp-card{
  --r: 12px;                  /* 可调圆角半径 */
  background:#fff;
  border-radius: var(--r);
  overflow: hidden;           /* 关键：让子元素滚动条不“外溢”圆角 */
  display:flex;
  flex-direction:column;
  min-height:0;
}

/* 标题区保持不滚动 */
.lp-card__title{
  font-size:14px;
  font-weight:600;
  color:#333;
  border-bottom:1px solid #eee;
  padding:8px 10px;
}

/* 内容区滚动；把底部两个角设置成与卡片一致（进一步保证裁剪） */
.lp-card__body{
  padding:10px;
  overflow:auto;
  min-height:0;
  border-bottom-left-radius: var(--r);
  border-bottom-right-radius: var(--r);
  background-clip: padding-box; /* 某些浏览器下更贴合圆角 */
}

/* Paper 列表简单排版 */
.fake-list{ margin:0; padding-left:18px; }
.fake-list li{ line-height:1.8; }

/* —— 对话卡仍按你原来的 —— */
.lp-chat{
  display:grid;
  grid-template-rows: auto 1fr auto;
  overflow:hidden;
}
/* 消息区可滚动；修复滚动条抖动 */
.lp-msgs{
  padding: 10px;
  overflow: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;

  /* 关键：始终预留滚动槽位 */
  scrollbar-gutter: stable both-edges;

  /* Firefox：固定为细滚动条，但默认透明 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

/* WebKit：固定宽度，但默认透明 */
.lp-msgs::-webkit-scrollbar{
  width: 8px;           /* 宽度固定，避免布局变化 */
  height: 8px;
}
.lp-msgs::-webkit-scrollbar-thumb{
  background: transparent;  /* 默认隐形 */
  border-radius: 4px;
}
.lp-msgs::-webkit-scrollbar-track{
  background: transparent;
}
/* 仅改变“可见度”，不改变宽度 */
.lp-msgs:hover{
  scrollbar-color: rgba(0,0,0,.25) transparent;   /* Firefox */
}
.lp-msgs:hover::-webkit-scrollbar-thumb{
  background: rgba(0,0,0,.25);                     /* WebKit */
}
</style>
