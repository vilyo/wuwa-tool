<script setup lang="ts">
import { computed } from 'vue'
import type { GachaRecord } from '@/domain/records'
import { poolStats } from '@/domain/stats'
import { DEFAULT_VERDICT_POOL_CODE, poolVerdict } from '@/domain/verdict'

/**
 * 本池评语行(定稿原型 .verdictline):评级菱章字母 + 评语 + 平均出货 + 歪率(+ 修正项徽章)。
 * V1 当前池默认角色精准调谐(code 1),页签联动由 #09 接管;统计与评语全部来自 domain 纯函数。
 */
const props = withDefaults(
  defineProps<{
    /** 当前档案的全部流水(时间倒序,组件内按口径自行排序) */
    records: GachaRecord[]
    /** 当前池 code;V1 默认角色精准调谐 */
    poolCode?: number
  }>(),
  { poolCode: DEFAULT_VERDICT_POOL_CODE },
)

const verdict = computed(() => poolVerdict(poolStats(props.records, props.poolCode)))
</script>

<template>
  <div
    class="verdict-line"
    aria-label="本池评语"
  >
    <span
      class="rank-mini"
      :class="{ none: verdict.rank === '—' }"
      role="img"
      :aria-label="`欧非评级 ${verdict.rank}`"
    ><span>{{ verdict.rank }}</span></span>
    <b class="vtext">{{ verdict.text }}</b>
    <span
      v-if="verdict.note || verdict.avgPulls !== null"
      class="vsub"
    >
      <template v-if="verdict.note">{{ verdict.note }}</template>
      <template v-else>平均出货 <span class="num">{{ verdict.avgPulls!.toFixed(1) }}</span> 抽<template v-if="verdict.offRate !== null"> · 歪率 <span class="num">{{ Math.round(verdict.offRate * 100) }}%</span></template></template>
    </span>
    <span
      v-for="modifier in verdict.modifiers"
      :key="modifier.text"
      class="badge"
      :class="modifier.tone === 'up' ? 'badge-up' : 'badge-off'"
    ><span>{{ modifier.text }}</span></span>
  </div>
</template>

<style scoped>
/* 与定稿原型 .verdictline 同构:34px 菱章旋转 45°,色彩走 v11 tokens */
.verdict-line {
  flex: none;
  display: flex;
  align-items: center;
  gap: 13px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--hairline);
}

.rank-mini {
  flex: none;
  width: 34px;
  height: 34px;
  border: 1.5px solid var(--rarity);
  transform: rotate(45deg);
  display: grid;
  place-items: center;
  background: var(--rarity-wash);
}

.rank-mini span {
  transform: rotate(-45deg);
  font: 700 16px/1 var(--font-num);
  color: var(--rarity-ink);
}

/* 无评级(—)时菱章隐藏但占位,与原型 .rank-mini.none 一致 */
.rank-mini.none {
  visibility: hidden;
}

.vtext {
  font-weight: 700;
  font-size: 24px;
  letter-spacing: 0.1em;
}

.vsub {
  font-size: 12.5px;
  color: var(--text-2);
}

.vsub .num {
  color: var(--text);
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  line-height: 1;
  padding: 4px 9px;
  white-space: nowrap;
  transform: skewX(var(--skew));
}

.badge > span {
  transform: skewX(calc(-1 * var(--skew)));
}

.badge-up {
  background: var(--win-wash);
  color: var(--win-ink);
  border: 1px solid var(--win);
}

.badge-off {
  background: transparent;
  border: 1px solid var(--off);
  color: var(--off);
}
</style>
