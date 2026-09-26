<script setup lang="ts">
import { ref } from 'vue'
import { useRecordsStore } from '@/stores/records'

const store = useRecordsStore()
const link = ref('')

async function submit(): Promise<void> {
  const raw = link.value.trim()
  if (!raw || store.syncing) return
  const ok = await store.importLink(raw)
  // 成功后清空输入便于再次粘贴;失败保留便于修改重试
  if (ok) link.value = ''
}
</script>

<template>
  <section
    class="paste-import"
    aria-label="手动粘贴唤取链接"
  >
    <h3 class="paste-title">手动粘贴</h3>
    <textarea
      v-model="link"
      class="paste-input"
      rows="3"
      placeholder="粘贴唤取链接:在游戏内打开「唤取记录」页后,从日志或浏览器地址栏复制完整链接"
    />
    <div class="paste-actions">
      <button
        type="button"
        class="paste-btn"
        :disabled="store.syncing || !link.trim()"
        @click="submit"
      >
        <span>{{ store.syncing ? '同步中…' : '导入' }}</span>
      </button>
    </div>
    <p
      v-if="store.syncing && store.syncProgress"
      class="paste-progress"
      role="status"
    >
      正在获取 卡池 {{ store.syncProgress.index }}/{{ store.syncProgress.total }}
    </p>
    <p
      v-if="store.message"
      class="paste-message"
      :class="store.message.kind === 'success' ? 'is-success' : 'is-error'"
      role="status"
    >
      {{ store.message.text }}
    </p>
  </section>
</template>

<style scoped>
.paste-import {
  border: 1px solid var(--hairline);
  background: var(--bg-raise);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.paste-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text);
}

.paste-input {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--hairline-2);
  background: var(--panel);
  color: var(--text);
  font-size: 12.5px;
  line-height: 1.6;
  padding: 8px 10px;
}

.paste-input:focus {
  outline: 2px solid var(--accent-soft);
  outline-offset: -1px;
}

.paste-actions {
  display: flex;
  justify-content: flex-end;
}

.paste-btn {
  border: none;
  background: var(--btn);
  color: var(--btn-ink);
  font-size: 13px;
  font-weight: 700;
  padding: 8px 22px;
  transform: skewX(var(--skew));
  cursor: pointer;
}

.paste-btn > * {
  display: inline-block;
  transform: skewX(calc(-1 * var(--skew)));
}

.paste-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.paste-progress {
  font-size: 12.5px;
  color: var(--text-2);
}

.paste-message {
  font-size: 12.5px;
  line-height: 1.7;
}

.paste-message.is-success {
  color: var(--lucky);
}

.paste-message.is-error {
  color: var(--danger);
}
</style>
