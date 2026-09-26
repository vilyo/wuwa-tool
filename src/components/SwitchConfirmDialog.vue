<script setup lang="ts">
import { useRecordsStore } from '@/stores/records'

const store = useRecordsStore()
</script>

<template>
  <div
    v-if="store.pendingSwitch !== null"
    class="dialog-backdrop"
  >
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label="切换档案确认"
    >
      <h3 class="dialog-title">切换档案</h3>
      <p class="dialog-hint">
        检测到 UID <span class="row-name">{{ store.pendingSwitch.playerId }}</span>
        的唤取记录,当前档案为 UID <span class="row-name">{{ store.playerId }}</span>。
        切换后将把记录导入 UID {{ store.pendingSwitch.playerId }} 的档案;
        当前档案的数据保留在本机,可随时切回。
      </p>
      <div class="dialog-actions">
        <button
          type="button"
          class="dialog-cancel"
          @click="store.cancelSwitch()"
        >
          取消
        </button>
        <button
          type="button"
          class="dialog-confirm"
          @click="store.confirmSwitch()"
        >
          <span>切换并导入</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: var(--backdrop);
}

.dialog {
  width: 460px;
  max-width: calc(100vw - 48px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 22px;
  background: var(--bg-raise);
  border: 1px solid var(--hairline);
  box-shadow: var(--shadow-pop);
}

.dialog-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text);
}

.dialog-hint {
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text-2);
}

.row-name {
  font-family: var(--font-num);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-cancel {
  border: 1px solid var(--hairline-2);
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  padding: 7px 18px;
  cursor: pointer;
  transition: color var(--t-fast), border-color var(--t-fast);
}

.dialog-cancel:hover {
  color: var(--text);
  border-color: var(--text-2);
}

/* 主按钮沿用形状母语:斜切,内容反向回正(与「导入」按钮一致) */
.dialog-confirm {
  border: none;
  background: var(--btn);
  color: var(--btn-ink);
  font-size: 13px;
  font-weight: 700;
  padding: 8px 22px;
  transform: skewX(var(--skew));
  cursor: pointer;
}

.dialog-confirm > span {
  display: inline-block;
  transform: skewX(calc(-1 * var(--skew)));
}

.dialog-confirm:hover {
  filter: brightness(1.06);
}
</style>
