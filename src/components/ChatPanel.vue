<script setup>
import { ref } from 'vue'
import ChatDock from './chatdock.vue'
import { chatOnce } from '@/api/chat'

const messages = ref([
  { role: 'system', content: '你是科研助手。' }
])

const loading = ref(false)
const errorMsg = ref('')

async function onSend(userText){
  errorMsg.value = ''
  loading.value = true
  messages.value.push({ role: 'user', content: userText })

  try {
    // 你可以把 full history 传给后端，也可以只传最后几条
    const { answer } = await chatOnce({ messages: messages.value })
    messages.value.push({ role: 'assistant', content: answer })
  } catch (e) {
    errorMsg.value = e.message || '对话失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="chat-panel">
    <div class="msg-list">
      <div v-for="(m, idx) in messages" :key="idx" class="msg" :class="m.role">
        <div class="bubble">{{ m.content }}</div>
      </div>
      <div v-if="loading" class="msg assistant">
        <div class="bubble">思考中...</div>
      </div>
      <div v-if="errorMsg" class="error">{{ errorMsg }}</div>
    </div>

    <ChatDock @send="onSend" />
  </div>
</template>

<style scoped>
.chat-panel{ display:flex; flex-direction:column; height:100%; }
.msg-list{ flex:1; overflow:auto; padding:12px; }
.msg{ display:flex; margin-bottom:8px; }
.msg.user{ justify-content:flex-end; }
.msg.assistant{ justify-content:flex-start; }
.bubble{
  max-width:70%;
  padding:8px 10px; border-radius:10px;
  background:#f5f5f5;
}
.msg.user .bubble{ background:#dbeafe; }
.error{ color:#c00; padding:8px; }
</style>
