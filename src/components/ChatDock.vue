<script setup>
import { ref, onMounted, nextTick } from 'vue'

const emit = defineEmits(['send', 'upload-files', 'upload-images'])

const taRef = ref(null)
const text = ref('')

const MIN_ROWS = 1
const MAX_ROWS = 8

function autoResize() {
  const ta = taRef.value
  if (!ta) return            // ✅ 先 return，再操作
  ta.style.height = 'auto'
  const lineHeight = parseFloat(getComputedStyle(ta).lineHeight || '20')
  const maxH = lineHeight * MAX_ROWS
  ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px'

  // 达到最大高度时允许内部滚动；否则不滚（但滚动条仍按“隐藏样式”显示）
  if (ta.scrollHeight > maxH) {
    ta.classList.add('is-scrollable')
  } else {
    ta.classList.remove('is-scrollable')
  }
}

function onInput() { autoResize() }

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    doSend()
  }
}

async function doSend() {
  const msg = text.value.trim()
  if (!msg) return
  emit('send', msg)
  text.value = ''
  await nextTick()
  autoResize()
}

/* 上传占位 */
const fileInputRef = ref(null)
const imgInputRef = ref(null)
function openFilePicker(){ fileInputRef.value?.click() }
function openImgPicker(){ imgInputRef.value?.click() }
function onPickFiles(e){ emit('upload-files', Array.from(e.target.files || [])) }
function onPickImages(e){ emit('upload-images', Array.from(e.target.files || [])) }

onMounted(() => nextTick(autoResize))
</script>

<template>
  <div class="chat-dock">
    <div class="dock-tools">
      <button class="tool-btn" title="上传文件" @click="openFilePicker">📎</button>
      <input ref="imgInputRef" type="file" accept="image/*" multiple class="hidden-input" @change="onPickImages" />
      <input ref="fileInputRef" type="file" multiple class="hidden-input" @change="onPickFiles" />
    </div>

    <div class="dock-editor">
      <textarea
        ref="taRef"
        v-model="text"
        :rows="MIN_ROWS"
        class="dock-textarea"
        placeholder="Say something..."
        @input="onInput"
        @keydown="onKeydown"
      />
      <button class="send-btn" :disabled="!text.trim()" @click="doSend">↑</button>
    </div>
  </div>
</template>

<style scoped>
.chat-dock{
  position: sticky; bottom: 0;
  display: grid; grid-template-rows: auto auto; gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border-top: 1px solid #eee;
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -2px 10px rgba(0,0,0,.04);
}

/* 工具条 */
.dock-tools{ display:flex; align-items:center; gap:8px; }
/* .tool-btn{
  width: 30px; height: 30px;
  display:inline-flex; align-items:center; justify-content:center;
  border:1px solid #e5e7eb; border-radius:999px; background:#fff; cursor:pointer;
}
.tool-btn:hover{ background:#f7f7f7; } */
.hidden-input{ display:none; }

/* 编辑区 */
.dock-editor{ display:grid; grid-template-columns: 1fr auto; gap:8px; align-items:end; }

/* 关键：textarea 初始不出现滚条；到上限时可滚动，但滚动条符合“自动隐藏”风格 */
.dock-textarea{
  width:100%;
  resize:none;
  border:1px solid #e5e7eb; border-radius:10px;
  padding:8px 10px; font:inherit; line-height:1.4; background:#fff;
  /* 让滚条“隐藏”但仍可滚 */
  overflow-y:auto;
  scrollbar-width: none;                    /* Firefox 默认隐藏 */
}
.dock-textarea.is-scrollable{ scrollbar-width: thin; }  /* 到达上限时，Firefox 变细 */
.dock-textarea:focus{ outline:none; border-color:#cbd5e1; box-shadow:0 0 0 3px #e5e7eb; }

/* .send-btn{
  width: 34px; height: 34px;
  border:1px solid #e5e7eb; border-radius:999px; background:#111; color:#fff; cursor:pointer;
}
.send-btn:disabled{ opacity:.4; cursor:not-allowed; } */

/* —— 处理 scoped 下的滚动条 —— */
/* WebKit：默认隐藏；达到上限且 hover 时显示细滚条 */
.dock-textarea{
  width: 100%;
  resize: none;
  overflow-y: auto;
  font-size: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 4px 4px;
  font: inherit;
  background: #fff;
  line-height: 1.4;

  /* 关键：固定滚动槽位 */
  scrollbar-gutter: stable both-edges;
  scrollbar-width: thin;                         /* Firefox 固定细 */
  scrollbar-color: transparent transparent;      /* 默认透明 */
}
/* WebKit 固定宽度 + 默认透明 */
.dock-textarea::-webkit-scrollbar{ width: 8px; height: 8px; }
.dock-textarea::-webkit-scrollbar-thumb{
  background: transparent;
  border-radius: 4px;
}
.dock-textarea::-webkit-scrollbar-track{ background: transparent; }
/* 仅在 hover 时让拇指可见，不改宽度 */
.dock-textarea:hover{ scrollbar-color: rgba(0,0,0,.25) transparent; }
.dock-textarea:hover::-webkit-scrollbar-thumb{ background: rgba(0,0,0,.25); }
</style>
