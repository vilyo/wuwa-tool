<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRecordsStore } from '@/stores/records'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const store = useRecordsStore()

/** 构建期注入的版本号(vite define,与状态栏同源) */
const appVersion = __APP_VERSION__

// —— 清空二次确认(#12):确认层写明将删除的 UID 与不可恢复,置于设置弹窗之上 ——
const confirmingClear = ref(false)
/** 数据区动作进行中:导出/导入/清空期间按钮不可重复触发;同步期间一并禁用(与顶栏 busy 门闩一致) */
const pending = ref(false)
const busy = computed(() => pending.value || store.syncing || store.probing)

function onBackdropClick(): void {
  if (!confirmingClear.value) emit('close')
}

function askClear(): void {
  confirmingClear.value = true
}

function cancelClear(): void {
  confirmingClear.value = false
}

async function confirmClear(): Promise<void> {
  if (pending.value) return
  pending.value = true
  try {
    await store.clearCurrentArchive()
    confirmingClear.value = false
  } finally {
    pending.value = false
  }
}

async function runExport(): Promise<void> {
  if (pending.value) return
  pending.value = true
  try {
    await store.exportBackup()
  } finally {
    pending.value = false
  }
}

async function runImport(): Promise<void> {
  if (pending.value) return
  pending.value = true
  try {
    await store.importBackup()
  } finally {
    pending.value = false
  }
}

// —— 浮层无障碍(#12,沿用 #11 抽屉约定):ESC 关闭 + 焦点往返 ——
// 确认层打开时 ESC 只关确认层,设置弹窗保持
let lastFocused: HTMLElement | null = null
const closeBtn = ref<HTMLButtonElement | null>(null)

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (confirmingClear.value) {
    confirmingClear.value = false
    return
  }
  emit('close')
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      confirmingClear.value = false
      lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      closeBtn.value?.focus()
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
      class="settings-backdrop"
      @click="onBackdropClick"
    />
    <!-- 弹窗壳与行式布局(#12,定稿原型 .modal/.m-panel/.set-row):本任务只放「数据」区,主题等偏好区留给 #13 -->
    <div
      class="settings-modal"
      role="dialog"
      aria-modal="true"
      aria-label="设置"
    >
      <div class="settings-head">
        <span class="settings-title"><span
          class="dia sm"
          aria-hidden="true"
        />设置</span>
        <button
          ref="closeBtn"
          type="button"
          class="settings-close"
          aria-label="关闭设置"
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
      <div class="settings-body">
        <div class="set-row">
          <div class="info">
            <div class="t">备份与恢复</div>
            <div class="d">导出包含全部记录的 JSON 文件;恢复时按去重键合并</div>
          </div>
          <button
            type="button"
            class="set-btn"
            :disabled="busy"
            @click="runExport"
          >
            导出备份
          </button>
          <button
            type="button"
            class="set-btn"
            :disabled="busy"
            @click="runImport"
          >
            导入恢复
          </button>
        </div>
        <div class="set-row">
          <div class="info">
            <div class="t">清空数据</div>
            <div class="d">删除当前档案的全部本地记录,不可恢复</div>
          </div>
          <button
            type="button"
            class="set-btn danger"
            :disabled="busy"
            @click="askClear"
          >
            清空数据
          </button>
        </div>
        <div class="about-line">
          鸣潮工具箱 · 版本 <span class="num">{{ appVersion }}</span>
        </div>
        <div class="privacy">
          所有唤取记录仅保存在你这台电脑上。除向官方服务器获取你自己的记录外,本软件不向任何地方发送数据。
        </div>
      </div>
    </div>
    <!-- 清空二次确认(嵌套浮层):明确 UID 与不可恢复,建议先备份 -->
    <template v-if="confirmingClear">
      <div
        class="settings-backdrop confirm-backdrop"
        @click="cancelClear"
      />
      <div
        class="settings-modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="清空数据确认"
      >
        <h3 class="confirm-title">清空数据</h3>
        <p class="confirm-hint">
          将删除 UID <span class="num confirm-uid">{{ store.playerId ?? '—' }}</span>
          档案的全部唤取记录,共 {{ store.records.length }} 条。此操作不可恢复,建议先「导出备份」。
        </p>
        <div class="confirm-actions">
          <button
            type="button"
            class="confirm-cancel"
            @click="cancelClear"
          >
            取消
          </button>
          <button
            type="button"
            class="confirm-danger"
            :disabled="busy"
            @click="confirmClear"
          >
            <span>确认清空</span>
          </button>
        </div>
      </div>
    </template>
  </template>
</template>

<style scoped>
/* 遮罩与面板(定稿原型 .modal .m-backdrop/.m-panel) */
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--backdrop);
}

.settings-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 110;
  transform: translate(-50%, -50%);
  width: min(600px, 94vw);
  max-height: 86vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--bg-raise);
  border: 1px solid var(--hairline);
  box-shadow: var(--shadow-pop);
}

.settings-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: var(--ink);
  color: var(--ink-text);
}

.settings-title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.18em;
}

.settings-close {
  margin-left: auto;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  color: inherit;
  opacity: 0.75;
  transition: opacity var(--t-fast), background var(--t-fast);
}

.settings-close:hover {
  opacity: 1;
  background: rgba(127, 127, 127, 0.18);
}

.settings-body {
  padding: 6px 22px 20px;
}

/* 行式设置项(定稿原型 .set-row) */
.set-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--hairline);
  flex-wrap: wrap;
}

.set-row:last-of-type {
  border-bottom: none;
}

.set-row .info {
  flex: 1;
  min-width: 200px;
}

.set-row .info .t {
  font-weight: 600;
  font-size: 13.5px;
  color: var(--text);
}

.set-row .info .d {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 2px;
}

.set-btn {
  flex: none;
  padding: 6px 15px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
  border: 1px solid var(--hairline-2);
  transition: color var(--t-fast), border-color var(--t-fast);
}

.set-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--text-3);
}

.set-btn.danger {
  color: var(--danger);
  border-color: var(--danger);
}

.set-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.about-line {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--text-2);
}

.privacy {
  margin-top: 14px;
  padding: 10px 13px;
  border-left: 3px solid var(--accent);
  background: var(--panel-2);
  font-size: 12.5px;
  color: var(--text-2);
}

/* 清空二次确认层:叠在设置弹窗之上 */
.confirm-backdrop {
  z-index: 120;
}

.confirm-modal {
  z-index: 130;
  width: min(420px, 94vw);
  gap: 12px;
  padding: 20px 22px;
}

.confirm-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text);
}

.confirm-hint {
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text-2);
}

.confirm-uid {
  font-weight: 600;
  color: var(--text);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.confirm-cancel {
  border: 1px solid var(--hairline-2);
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  padding: 7px 18px;
  cursor: pointer;
  transition: color var(--t-fast), border-color var(--t-fast);
}

.confirm-cancel:hover {
  color: var(--text);
  border-color: var(--text-2);
}

/* 危险主按钮沿用形状母语:斜切,内容反向回正 */
.confirm-danger {
  border: none;
  background: var(--danger);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 22px;
  transform: skewX(var(--skew));
  cursor: pointer;
}

.confirm-danger > span {
  display: inline-block;
  transform: skewX(calc(-1 * var(--skew)));
}

.confirm-danger:hover:not(:disabled) {
  filter: brightness(1.06);
}

.confirm-danger:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
