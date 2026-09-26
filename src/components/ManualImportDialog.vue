<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRecordsStore } from '@/stores/records'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const store = useRecordsStore()
const link = ref('')

/** 一键获取的探测/提取期间(probing)与全池同步期间(syncing)都不可导入,避免管线互相踩踏 */
const busy = computed(() => store.syncing || store.probing)
const buttonLabel = computed(() => {
  if (store.syncing) return '同步中…'
  if (store.probing) return '获取中…'
  return '导入'
})
const fileButtonLabel = computed(() => (store.probing ? '解析中…' : '从日志文件导入'))

/** 管线转交其它浮层接管(多 UID 选择/切换确认)时,本弹窗让位关闭 */
function handoffToOverlay(): boolean {
  return store.pendingUids !== null || store.pendingSwitch !== null
}

async function submit(): Promise<void> {
  const raw = link.value.trim()
  if (!raw || busy.value) return
  const ok = await store.importLink(raw)
  // 成功后清空输入便于再次粘贴;失败保留输入与错误消息在弹窗内,便于修改重试
  if (ok) link.value = ''
  if (ok || handoffToOverlay()) emit('close')
}

async function importLogFile(): Promise<void> {
  if (busy.value) return
  const ok = await store.importFromLogFile()
  if (ok || handoffToOverlay()) emit('close')
}

// —— 浮层无障碍(沿用 #12 设置弹窗约定):ESC 关闭 + 焦点往返,打开时聚焦输入框 ——
let lastFocused: HTMLElement | null = null
const linkInput = ref<HTMLTextAreaElement | null>(null)

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      linkInput.value?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown)
      lastFocused?.focus()
      lastFocused = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <template v-if="open">
    <div
      class="manual-backdrop"
      @click="emit('close')"
    />
    <div
      class="manual-modal"
      role="dialog"
      aria-modal="true"
      aria-label="手动导入"
    >
      <div class="manual-head">
        <span class="manual-title"><span
          class="dia sm"
          aria-hidden="true"
        />手动导入</span>
        <button
          type="button"
          class="manual-close"
          aria-label="关闭手动导入"
          @click="emit('close')"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            aria-hidden="true"
          ><path
            d="M2 2l9 9M11 2l-9 9"
            stroke="currentColor"
            stroke-width="1.6"
          /></svg>
        </button>
      </div>
      <div class="manual-body">
        <p class="manual-hint">
          在游戏内打开「唤取记录」页后,从日志或浏览器地址栏复制完整链接粘贴到下面;也可以直接选择已拷出的日志文件。
        </p>
        <textarea
          ref="linkInput"
          v-model="link"
          class="manual-input"
          rows="3"
          placeholder="粘贴唤取链接"
        />
        <div class="manual-actions">
          <button
            type="button"
            class="manual-file-btn"
            :disabled="busy"
            title="已把游戏日志文件复制出来?直接选择文件,自动解析其中的唤取链接开始导入"
            @click="importLogFile"
          >
            <span>{{ fileButtonLabel }}</span>
          </button>
          <button
            type="button"
            class="manual-submit"
            :disabled="busy || !link.trim()"
            @click="submit"
          >
            <span>{{ buttonLabel }}</span>
          </button>
        </div>
        <p
          v-if="store.syncing && store.syncProgress"
          class="manual-progress"
          role="status"
        >
          正在获取 卡池 {{ store.syncProgress.index }}/{{ store.syncProgress.total }}
        </p>
        <p
          v-if="store.message"
          class="manual-message"
          :class="store.message.kind === 'success' ? 'is-success' : 'is-error'"
          role="status"
        >
          {{ store.message.text }}
        </p>
      </div>
    </div>
  </template>
</template>

<style scoped>
/* 遮罩与弹窗壳(与设置弹窗同款浮层规格) */
.manual-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--backdrop);
}

.manual-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 110;
  transform: translate(-50%, -50%);
  width: min(560px, 94vw);
  display: flex;
  flex-direction: column;
  background: var(--bg-raise);
  border: 1px solid var(--hairline);
  box-shadow: var(--shadow-pop);
}

.manual-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  background: var(--ink);
  color: var(--ink-text);
}

.manual-title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.18em;
}

.manual-close {
  margin-left: auto;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: var(--ink-text-faint);
  cursor: pointer;
}

.manual-close:hover {
  color: var(--ink-text);
  background: var(--ink-wash);
}

.manual-body {
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.manual-hint {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
}

.manual-input {
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

.manual-input:focus {
  outline: 2px solid var(--accent-soft);
  outline-offset: -1px;
}

.manual-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.manual-submit,
.manual-file-btn {
  border: none;
  background: var(--btn);
  color: var(--btn-ink);
  font-size: 13px;
  font-weight: 700;
  padding: 8px 22px;
  transform: skewX(var(--skew));
  cursor: pointer;
}

.manual-submit > *,
.manual-file-btn > * {
  display: inline-block;
  transform: skewX(calc(-1 * var(--skew)));
}

/* 次级入口:描边弱化,主操作(粘贴导入)保持金色实心 */
.manual-file-btn {
  background: transparent;
  color: var(--text-2);
  border: 1px solid var(--hairline-2);
  font-weight: 600;
}

.manual-file-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--text-2);
}

.manual-submit:disabled,
.manual-file-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.manual-progress {
  font-size: 12.5px;
  color: var(--text-2);
}

.manual-message {
  font-size: 12.5px;
  line-height: 1.7;
}

.manual-message.is-success {
  color: var(--lucky);
}

.manual-message.is-error {
  color: var(--danger);
}
</style>
