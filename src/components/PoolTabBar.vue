<script setup lang="ts">
import { computed } from 'vue'
import { poolTabs } from '@/domain/poolTabs'
import { poolLabel, type PoolCategory } from '@/domain/pools'
import type { GachaRecord } from '@/domain/records'
import { poolStats } from '@/domain/stats'

/**
 * 池页签栏(定稿原型 .tabsrow):四固定类别页签 + 类别内二级池切换 + 未知池动态兜底页签,
 * 右侧汇总指标行(总唤取/五星/平均出货/歪率)随当前池联动;歪率仅角色系限定池有值(stats 口径)。
 * 选中状态由 App 持有(评语行/名册/详情条/汇总行共用一个联动源),本组件只回传选择事件。
 */
const props = defineProps<{
  /** 当前档案的全部流水(时间倒序,统计口径自行排序) */
  records: GachaRecord[]
  /** 当前激活的类别页签 */
  activeCategory: PoolCategory
  /** 当前选中的池 code(类别内有数据时为实际数据池,否则类别主池兜底) */
  poolCode: number
}>()

const emit = defineEmits<{
  'select-category': [category: PoolCategory]
  'select-pool': [code: number]
}>()

const tabs = computed(() => poolTabs(props.records))
// activeCategory 指向的页签不存在时(如未知池记录随档案切换消失)回落到首个页签
const activeTab = computed(
  () => tabs.value.find((tab) => tab.category === props.activeCategory) ?? tabs.value[0]!,
)

const stats = computed(() => poolStats(props.records, props.poolCode))
</script>

<template>
  <div
    class="tabs-row"
    aria-label="卡池页签"
  >
    <div class="pool-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.category"
        type="button"
        class="pool-tab"
        :class="{ 'is-active': tab.category === activeTab.category }"
        :aria-pressed="tab.category === activeTab.category"
        @click="emit('select-category', tab.category)"
      >
        <span>{{ tab.label }}</span>
      </button>
    </div>
    <!-- 二级池切换:同类别多个池 code 时出现,只列档案中实际有数据的 code -->
    <div
      v-if="activeTab.codesWithData.length > 0"
      class="pool-sub"
    >
      <button
        v-for="code in activeTab.codesWithData"
        :key="code"
        type="button"
        class="pool-sub-tab"
        :class="{ 'is-active': code === poolCode }"
        :aria-pressed="code === poolCode"
        @click="emit('select-pool', code)"
      >
        <span>{{ poolLabel(code) }}</span>
      </button>
    </div>
    <p
      class="tabs-status"
      aria-label="当前池汇总"
    >
      总唤取 <b class="num">{{ stats.totalPulls.toLocaleString() }}</b>
      · 五星 <b class="num">{{ stats.fives.length }}</b>
      · 平均出货 <b class="num">{{ stats.avgPulls === null ? '—' : stats.avgPulls.toFixed(1) }}</b>
      <template v-if="stats.offRate !== null"> · 歪率 <b class="num">{{ Math.round(stats.offRate * 100) }}%</b></template>
    </p>
  </div>
</template>

<style scoped>
/* 与定稿原型 .tabsrow 同构:斜切页签,激活态黑底反白 */
.tabs-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.pool-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.pool-tab {
  position: relative;
  padding: 9px 20px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-2);
  transform: skewX(var(--skew));
  border: 1px solid var(--hairline);
  background: var(--panel);
  transition:
    color var(--t-fast),
    background var(--t-fast),
    border-color var(--t-fast);
}

.pool-tab > span {
  transform: skewX(calc(-1 * var(--skew)));
  display: inline-block;
}

.pool-tab:hover {
  color: var(--text);
  border-color: var(--hairline-2);
}

.pool-tab:active {
  transform: skewX(var(--skew)) scale(0.97);
}

.pool-tab.is-active {
  background: var(--ink);
  color: var(--ink-text);
  border-color: var(--ink);
}

/* 二级池切换:小号斜切芯片,同构弱一档 */
.pool-sub {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.pool-sub-tab {
  padding: 4px 12px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-3);
  transform: skewX(var(--skew));
  border: 1px solid var(--hairline);
  background: var(--panel);
  transition:
    color var(--t-fast),
    border-color var(--t-fast),
    background var(--t-fast);
}

.pool-sub-tab > span {
  transform: skewX(calc(-1 * var(--skew)));
  display: inline-block;
}

.pool-sub-tab:hover {
  color: var(--text);
  border-color: var(--hairline-2);
}

.pool-sub-tab.is-active {
  color: var(--accent-ink);
  border-color: var(--accent);
  background: var(--panel);
}

.tabs-status {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
}

.tabs-status .num {
  color: var(--text-2);
}
</style>
