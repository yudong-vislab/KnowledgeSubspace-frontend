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
function onPickFiles(e){ emit('upload-files', Array.from(e.target.files || [])) }
function onPickImages(e){ emit('upload-images', Array.from(e.target.files || [])) }

onMounted(() => nextTick(autoResize))
</script>

<template>
  <div class="chat-dock">
    <div class="dock-tools">
      <button class="tool-btn" title="Upload File" @click="openFilePicker">📎</button>
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
      <button class="send-btn" :disabled="!text.trim()" @click="doSend">
        <svg class="icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8.99992 16V6.41407L5.70696 9.70704C5.31643 10.0976 4.68342 10.0976 4.29289 9.70704C3.90237 9.31652 3.90237 8.6835 4.29289 8.29298L9.29289 3.29298L9.36907 3.22462C9.76184 2.90427 10.3408 2.92686 10.707 3.29298L15.707 8.29298L15.7753 8.36915C16.0957 8.76192 16.0731 9.34092 15.707 9.70704C15.3408 10.0732 14.7618 10.0958 14.3691 9.7754L14.2929 9.70704L10.9999 6.41407V16C10.9999 16.5523 10.5522 17 9.99992 17C9.44764 17 8.99992 16.5523 8.99992 16Z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-dock{
  position: sticky; bottom: 0;
  display: grid; grid-template-rows: auto auto;
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
.dock-editor{
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  align-items: end;
}

/* 关键：textarea 初始不出现滚条；到上限时可滚动，但滚动条符合“自动隐藏”风格 */
/* —— 只保留这一份 textarea 样式 —— */
.dock-textarea{
  /* 布局与尺寸 */
  width: 100%;
  box-sizing: border-box;      /* 让高度计算包含 padding 与 border */
  resize: none;
  border: 1px solid #e5e7eb;
  border-radius: 8px;

  /* 字体与行高 */
  font: inherit;
  font-size: 12px;
  line-height: 1.4;

  /* 内边距尽量小，确保一行不触发滚动 */
  padding: 2px 2px;

  /* 初始不滚动，避免出现滚动条 */
  overflow-y: hidden;

  /* 自动隐藏风格：固定滚动槽位，hover 时才显拇指（到达上限才生效） */
  scrollbar-gutter: stable both-edges;
  scrollbar-width: thin;                 /* Firefox 固定细 */
  scrollbar-color: transparent transparent; /* 默认透明 */
  background: #fff;
}

/* 到达最大高度时才允许滚动（在 JS 中加/去 is-scrollable 类） */
.dock-textarea.is-scrollable{
  overflow-y: auto;
}

/* 焦点态 */
.dock-textarea:focus{
  outline: none;
  border-color: #cbd5e1;
  box-shadow: 0 0 0 3px #e5e7eb;
}

/* WebKit 滚动条：固定宽度，但默认透明；hover 时可见 */
.dock-textarea::-webkit-scrollbar{ width: 8px; height: 8px; }
.dock-textarea::-webkit-scrollbar-thumb{
  background: transparent;
  border-radius: 4px;
}
.dock-textarea::-webkit-scrollbar-track{ background: transparent; }
.dock-textarea:hover{ scrollbar-color: rgba(0,0,0,.25) transparent; }
.dock-textarea:hover::-webkit-scrollbar-thumb{ background: rgba(0,0,0,.25); }
</style>
