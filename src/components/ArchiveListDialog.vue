<script setup lang="ts">
import { useRecordsStore } from '@/stores/records'

const store = useRecordsStore()

/** 时间戳取日期部分(列表展示精度到天) */
function shortDate(time: string | null): string {
  return time === null ? '未知' : time.slice(0, 10)
}
</script>

<template>
  <div
    v-if="store.archiveListOpen"
    class="dialog-backdrop"
  >
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label="选择档案"
    >
      <h3 class="dialog-title">选择档案</h3>
      <p
        v-if="store.archives.length === 0"
        class="dialog-hint"
      >
        本地还没有唤取档案。
      </p>
      <ul
        v-else
        class="archive-list"
      >
        <li
          v-for="archive in store.archives"
          :key="archive.playerId"
        >
          <button
            type="button"
            class="archive-row"
            :class="{ 'is-current': archive.playerId === store.playerId }"
            :disabled="archive.playerId === store.playerId"
            @click="store.switchArchive(archive.playerId)"
          >
            <span class="row-name">UID {{ archive.playerId }}</span>
            <span
              v-if="archive.playerId === store.playerId"
              class="row-tag is-known"
            >当前</span>
            <span class="row-meta">{{ archive.count }} 条记录 · 最近 {{ shortDate(archive.lastTime) }}</span>
          </button>
        </li>
      </ul>
      <div class="dialog-actions">
        <button
          type="button"
          class="dialog-cancel"
          @click="store.closeArchiveList()"
        >
          关闭
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
  max-height: calc(100vh - 64px);
  overflow-y: auto;
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
  line-height: 1.7;
  color: var(--text-2);
}

.archive-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.archive-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--panel);
  border: 1px solid var(--hairline);
  text-align: left;
  cursor: pointer;
  transition: background var(--t-fast), border-color var(--t-fast);
}

.archive-row:hover:not(:disabled) {
  background: var(--row-hover);
  border-color: var(--hairline-2);
}

.archive-row.is-current {
  border-color: var(--accent-soft);
  cursor: default;
}

.row-name {
  font-family: var(--font-num);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text);
}

.row-tag {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border: 1px solid var(--hairline-2);
}

.row-tag.is-known {
  color: var(--accent-ink);
  border-color: var(--accent-soft);
}

.row-meta {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-2);
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
</style>
