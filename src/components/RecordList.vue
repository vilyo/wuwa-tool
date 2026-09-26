<script setup lang="ts">
import { computed } from 'vue'
import { poolLabel } from '@/domain/pools'
import type { GachaRecord } from '@/domain/records'
import { recordKey } from '@/domain/records'

const props = defineProps<{ records: GachaRecord[] }>()

// API 返回即时间倒序;合并追加后重排,保证列表始终倒序
const sorted = computed(() => [...props.records].sort((a, b) => b.time.localeCompare(a.time)))

function rarityClass(qualityLevel: number): string {
  return `is-q${qualityLevel}`
}

function rarityText(qualityLevel: number): string {
  return '★'.repeat(Math.max(0, Math.min(qualityLevel, 5)))
}
</script>

<template>
  <section
    class="record-list"
    aria-label="唤取流水"
  >
    <p class="record-count">
      全部流水 共 <span class="num">{{ records.length }}</span> 条
    </p>
    <table class="record-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>卡池</th>
          <th>物品</th>
          <th>稀有度</th>
          <th>类型</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="record in sorted"
          :key="recordKey(record)"
        >
          <td class="num">{{ record.time }}</td>
          <td>{{ poolLabel(record.cardPoolType) }}</td>
          <td class="record-name">{{ record.name }}</td>
          <td :class="rarityClass(record.qualityLevel)">{{ rarityText(record.qualityLevel) }}</td>
          <td>{{ record.resourceType || '—' }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.record-list {
  border: 1px solid var(--hairline);
  background: var(--bg-raise);
  padding: 16px 20px;
}

.record-count {
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 10px;
}

.record-count .num {
  font: 600 14px/1 var(--font-num);
  color: var(--text);
}

.record-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.record-table th {
  text-align: left;
  font-weight: 600;
  color: var(--text-2);
  border-bottom: 1px solid var(--hairline);
  padding: 6px 10px;
}

.record-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--hairline);
  color: var(--text);
}

.record-table tbody tr:hover {
  background: var(--row-hover);
}

.record-table .num {
  font: 500 12px/1.4 var(--font-num);
  color: var(--text-2);
  white-space: nowrap;
}

.record-name {
  font-weight: 600;
}

.is-q5 {
  color: var(--rarity);
}

.is-q4 {
  color: var(--purple);
}

.is-q3 {
  color: var(--blue);
}
</style>
