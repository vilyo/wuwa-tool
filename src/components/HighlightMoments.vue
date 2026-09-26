<script setup lang="ts">
import { computed } from 'vue'
import { highlights } from '@/domain/highlights'
import type { GachaRecord } from '@/domain/records'

/**
 * 右栏「高光时刻」纪念牌栏(#10,定稿原型 .rail-box + .moment):
 * 旅途总览(全档案口径的总抽数/五星数)、最欧「出手如电」、最非「漫长等待」(冷灰 slate)、
 * 大保底就绪牌(仅处于大保底时出现)。数据由 domain 纯函数给出,无对应高光时不占位。
 */
const props = defineProps<{
  /** 当前档案的全部流水(时间倒序,统计口径自行排序) */
  records: GachaRecord[]
}>()

const vm = computed(() => highlights(props.records))
</script>

<template>
  <section
    class="rail-box"
    aria-label="高光时刻"
  >
    <div class="rail-title">
      <span
        class="dia sm"
        aria-hidden="true"
      />高光时刻
    </div>
    <div class="moment">
      <span
        class="dia"
        aria-hidden="true"
      />
      <div>
        <div class="t">旅途</div>
        <div class="m"><span class="num">{{ vm.journey.totalPulls.toLocaleString() }}</span> 抽 · <span class="num">{{ vm.journey.fiveStars }}</span> 个五星</div>
        <div class="s"><template v-if="vm.journey.since">自 <span class="num">{{ vm.journey.since }}</span> · </template>全部卡池合计</div>
      </div>
    </div>
    <div
      v-if="vm.luckiest"
      class="moment"
    >
      <span
        class="dia"
        aria-hidden="true"
      />
      <div>
        <div class="t">出手如电</div>
        <div class="m">{{ vm.luckiest.name }} · <span class="num">{{ vm.luckiest.pulls }}</span> 抽</div>
        <div class="s"><span class="num">{{ vm.luckiest.date }}</span> · {{ vm.luckiest.pool }}<template v-if="vm.luckiest.outcome"> · {{ vm.luckiest.outcome }}</template></div>
      </div>
    </div>
    <div
      v-if="vm.longest"
      class="moment slate"
    >
      <span
        class="dia"
        aria-hidden="true"
      />
      <div>
        <div class="t">漫长等待</div>
        <div class="m">{{ vm.longest.name }} · <span class="num">{{ vm.longest.pulls }}</span> 抽</div>
        <div class="s"><span class="num">{{ vm.longest.date }}</span> · {{ vm.longest.pool }}<template v-if="vm.longest.outcome"> · {{ vm.longest.outcome }}</template></div>
      </div>
    </div>
    <div
      v-if="vm.guaranteed"
      class="moment"
    >
      <span
        class="dia"
        aria-hidden="true"
      />
      <div>
        <div class="t">大保底已就绪</div>
        <div class="m">下个五星必为当期 UP</div>
        <div class="s">{{ vm.guaranteed.pool }} · 当前垫 <span class="num">{{ vm.guaranteed.current }}</span> 抽</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 栏盒与栏题(定稿原型 .rail-box / .rail-title;与保底引线栏同构) */
.rail-box {
  background: var(--panel);
  border: 1px solid var(--hairline);
  box-shadow: var(--shadow-win);
  padding: 15px 17px;
}

.rail-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: var(--text-3);
  margin-bottom: 11px;
}

.moment {
  display: flex;
  gap: 11px;
  padding: 9px 0;
  border-bottom: 1px solid var(--hairline);
  align-items: flex-start;
}

.moment:last-child {
  border-bottom: none;
  padding-bottom: 2px;
}

/* 栏题之后的首牌贴住标题(原型 .moment:first-of-type;此处栏题同为 div,改用相邻选择) */
.rail-title + .moment {
  padding-top: 2px;
}

/* 纪念牌菱章:暖色(高光)/冷灰(漫长等待),略下沉对齐标题行 */
.moment .dia {
  margin-top: 7px;
  background: var(--win);
}

.moment .t {
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 0.14em;
}

.moment .m {
  font-size: 13px;
  font-weight: 600;
  margin-top: 1px;
}

.moment .m .num {
  font-size: 16px;
  color: var(--win-ink);
}

.moment.slate .m .num {
  color: var(--off);
}

.moment.slate .dia {
  background: var(--off);
}

.moment .s {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 1px;
}
</style>
