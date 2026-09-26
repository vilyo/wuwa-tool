<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { recordKey, type GachaRecord } from '@/domain/records'
import { poolCategory } from '@/domain/pools'
import { rosterCards, rosterSummary, type RosterCardVM } from '@/domain/roster'
import { poolStats } from '@/domain/stats'
import { DEFAULT_VERDICT_POOL_CODE } from '@/domain/verdict'
import FiveStarCard from './FiveStarCard.vue'
import FiveStarDetailStrip from './FiveStarDetailStrip.vue'

/**
 * 五星编年史名册(ADR-0007,定稿原型 .roster-head + .roster + .detail-strip):
 * 头部(标题 + 五星计数 + 汇总芯片 + 62 抽期望图例)、时间倒序卡片网格、底部详情条。
 * 当前池 V1 默认角色精准调谐,页签联动由 #09 接管;名册区域内部滚动,主画面布局不随卡数增长。
 */
const props = withDefaults(
  defineProps<{
    /** 当前档案的全部流水(时间倒序,统计口径自行排序) */
    records: GachaRecord[]
    /** 当前池 code */
    poolCode?: number
  }>(),
  { poolCode: DEFAULT_VERDICT_POOL_CODE },
)

const cards = computed(() => rosterCards(poolStats(props.records, props.poolCode)))
const summary = computed(() => rosterSummary(cards.value))

const selectedKey = ref<string | null>(null)
// 档案/池切换后默认选中最新五星;原选中不在当前列表时同样回落到最新
watch(
  cards,
  (list) => {
    const current = selectedKey.value
    selectedKey.value =
      current !== null && list.some((card) => recordKey(card.record) === current)
        ? current
        : list.length > 0
          ? recordKey(list[0]!.record)
          : null
  },
  { immediate: true },
)

const selected = computed(
  () => cards.value.find((card) => recordKey(card.record) === selectedKey.value) ?? null,
)

function select(card: RosterCardVM): void {
  selectedKey.value = recordKey(card.record)
}

// 汇总芯片按池类别取态(定稿原型):常驻池只计重复,新手·感恩池规则特殊不给芯片
const category = computed(() => poolCategory(props.poolCode))
const showOutcomeChips = computed(
  () => category.value !== 'standard' && category.value !== 'noviceGratitude',
)
const showDupChip = computed(() => category.value === 'standard')
// 62 抽期望图例仅角色系限定池(与卡片刻线同源)
const showRefLegend = computed(() => cards.value.some((card) => card.refPercent !== null))
</script>

<template>
  <section
    class="roster-section"
    aria-label="五星编年史名册"
  >
    <div class="roster-head">
      <span class="roster-title">
        <span
          class="dia sm"
          aria-hidden="true"
        />五星编年史</span>
      <span class="roster-count">共 <span class="num">{{ cards.length }}</span> 个五星</span>
      <span class="roster-sum">
        <template v-if="showDupChip">
          <span class="sum sum-plain">重复 {{ summary.duplicate }}</span>
        </template>
        <template v-else-if="showOutcomeChips">
          <span class="sum up">UP {{ summary.up }}</span>
          <span class="sum off">歪 {{ summary.off }}</span>
          <span class="sum lucky">超欧 {{ summary.lucky }}</span>
          <span class="sum unlucky">超非 {{ summary.unlucky }}</span>
        </template>
      </span>
      <span
        v-if="showRefLegend"
        class="leg ref-leg"
      ><i
        class="ref-mark"
        aria-hidden="true"
      />62 抽期望（社区口径）</span>
    </div>
    <div
      v-if="cards.length > 0"
      class="roster"
      role="listbox"
      aria-label="五星名册，按时间倒序"
    >
      <FiveStarCard
        v-for="card in cards"
        :key="recordKey(card.record)"
        :card="card"
        :selected="recordKey(card.record) === selectedKey"
        @select="select(card)"
      />
    </div>
    <p
      v-else
      class="roster-empty"
    >
      本池暂无五星记录
    </p>
    <FiveStarDetailStrip
      v-if="selected"
      :card="selected"
      :pool-code="poolCode"
    />
  </section>
</template>

<style scoped>
.roster-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.roster-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 11px 0 9px;
}

.roster-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: var(--text-3);
}

.roster-count {
  font-size: 12px;
  color: var(--text-2);
}

.roster-count .num {
  color: var(--text);
}

.roster-sum {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.sum {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border: 1px solid var(--hairline);
  background: var(--panel);
}

.sum.up {
  background: var(--win-wash);
  border-color: var(--win);
  color: var(--win-ink);
}

.sum.off {
  border-color: var(--off);
  color: var(--off);
}

.sum.lucky {
  color: var(--lucky);
  border-color: var(--lucky);
}

.sum.unlucky {
  color: var(--danger);
  border-color: var(--danger);
}

.sum-plain {
  color: var(--text-3);
}

/* 62 抽期望图例:竖刻线样式与卡片内 .ft-ref 同形 */
.ref-leg {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--text-3);
  margin-left: auto;
}

.ref-mark {
  width: 1px;
  height: 10px;
  background: var(--text-3);
  flex: none;
}

/* 网格自动换行 + 名册内部滚动:主画面布局不随五星数增长(50+ 场景) */
.roster {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
  align-content: start;
  padding: 2px 2px 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--hairline-2) transparent;
}

.roster::-webkit-scrollbar {
  width: 8px;
}

.roster::-webkit-scrollbar-thumb {
  background: var(--hairline-2);
}

.roster-empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--text-3);
  font-size: 13px;
}
</style>
