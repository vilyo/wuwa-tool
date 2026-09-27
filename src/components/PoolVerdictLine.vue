<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GachaRecord } from '@/domain/records'
import { poolStats } from '@/domain/stats'
import { poolVerdict, TIER_LADDER } from '@/domain/verdict'

/**
 * 本池评语行(定稿原型 .verdictline):评级菱章字母 + 评语 + 平均出货 + 歪率(+ 修正项徽章)。
 * 当前池由 #09 页签状态给定(App 传入),统计与评语全部来自 domain 纯函数。
 * 悬停/聚焦「菱章 + 评语」展开档位表弹层,当前档高亮(#17)。
 */
const props = defineProps<{
  /** 当前档案的全部流水(时间倒序,组件内按口径自行排序) */
  records: GachaRecord[]
  /** 当前池 code(#09 页签联动) */
  poolCode: number
}>()

const verdict = computed(() => poolVerdict(poolStats(props.records, props.poolCode)))

/** 有评级(非「—」)才可交互:样本不足/新手池/未知池没有档位可言 */
const ranked = computed(() => verdict.value.rank !== '—')

/** 档位弹层开合:hover/focus 展开,mouseleave/blur 收起 */
const ladderOpen = ref(false)

function openLadder(): void {
  if (ranked.value) ladderOpen.value = true
}

function closeLadder(): void {
  ladderOpen.value = false
}

/** 行阈值文案:有上限为「≤N」;末档无上限,按上一档上限显示「>N」 */
function maxLabel(index: number): string {
  const rung = TIER_LADDER[index]
  if (rung.max !== null) return `≤${rung.max}`
  return `>${TIER_LADDER[index - 1]!.max}`
}
</script>

<template>
  <div
    class="verdict-line"
    aria-label="本池评语"
  >
    <span
      class="tier-trigger"
      :class="{ ranked }"
      :tabindex="ranked ? 0 : undefined"
      @mouseenter="openLadder"
      @mouseleave="closeLadder"
      @focus="openLadder"
      @blur="closeLadder"
    >
      <span
        class="rank-mini"
        :class="{ none: verdict.rank === '—' }"
        role="img"
        :aria-label="`欧非评级 ${verdict.rank}`"
      ><span>{{ verdict.rank }}</span></span>
      <b class="vtext">{{ verdict.text }}</b>
      <span
        v-if="ladderOpen"
        class="tier-ladder"
        role="tooltip"
      >
        <span
          v-for="(rung, i) in TIER_LADDER"
          :key="rung.rank"
          class="tl-row"
          :class="{ cur: rung.rank === verdict.rank }"
        >
          <span class="tl-rank">{{ rung.rank }}</span>
          <span class="tl-max">{{ maxLabel(i) }}</span>
          <span class="tl-text">{{ rung.text }}</span>
        </span>
      </span>
    </span>
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

/* 档位弹层触发器(#17):自身 gap 与 .verdict-line 的 13px 一致,包裹后视觉间距不变 */
.tier-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 13px;
}

/* 有评级才提示可悬停:评语点状下划线 + help 光标;「—」态保持原样 */
.tier-trigger.ranked .vtext {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 4px;
}

/* 六行档位表(单一来源 TIER_LADDER):z-index 高于名册内容、低于各弹窗 */
.tier-ladder {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 30;
  background: var(--panel);
  border: 1px solid var(--hairline);
  box-shadow: var(--shadow-pop);
  padding: 10px 14px;
  display: grid;
  gap: 6px;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--text-2);
}

.tl-row {
  display: grid;
  grid-template-columns: 28px 44px 1fr;
}

/* 当前档:左侧强调色竖线 + 强调色加粗 */
.tl-row.cur {
  box-shadow: inset 2px 0 0 var(--accent);
  color: var(--accent-ink);
  font-weight: 700;
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
