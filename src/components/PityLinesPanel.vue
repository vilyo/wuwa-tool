<script setup lang="ts">
import { computed } from 'vue'
import type { GachaRecord } from '@/domain/records'
import { pityLines } from '@/domain/pityLines'

/**
 * 右栏「保底引线」栏(#10,定稿原型 .rail-box + .fuse-*):
 * 角色精准 / 武器精准 / 角色常驻三条引线式倒计时——池名 + 大小保底章、
 * 「已垫 N · 还差 M 抽」、强调色刻度条(菱形游标)+ 0–硬保底刻度尺、规则说明。
 * 引线池与文案由 domain 纯函数给出,某池无记录时该引线不出现。
 */
const props = defineProps<{
  /** 当前档案的全部流水(时间倒序,统计口径自行排序) */
  records: GachaRecord[]
}>()

const lines = computed(() => pityLines(props.records))

function percent(current: number, hard: number): number {
  return Math.min(100, Math.round((current / hard) * 100))
}
</script>

<template>
  <section
    class="rail-box"
    aria-label="保底引线"
  >
    <div class="rail-title">
      <span
        class="dia sm"
        aria-hidden="true"
      />保底引线
    </div>
    <template v-if="lines.length > 0">
      <div
        v-for="line in lines"
        :key="line.poolCode"
        class="fuse-item"
      >
        <div class="fuse-head">
          <span>{{ line.label }}</span>
          <span
            v-if="line.badge"
            class="badge"
            :class="line.badge === '大保底' ? 'badge-hard' : 'badge-soft'"
          ><span>{{ line.badge }}</span></span>
          <span class="cnt">已垫 <b class="num">{{ line.current }}</b> · 还差 <b class="num">{{ line.remain }}</b> 抽</span>
        </div>
        <div
          class="fuse-track"
          role="img"
          :aria-label="`${line.label}保底进度 ${line.current}/${line.hard}`"
        >
          <i
            class="fill"
            :style="{ width: percent(line.current, line.hard) + '%' }"
          />
          <i
            class="knob"
            :style="{ left: percent(line.current, line.hard) + '%' }"
          />
        </div>
        <div class="fuse-scale">
          <span>0</span>
          <span>{{ line.hard / 2 }}</span>
          <span>{{ line.hard }}</span>
        </div>
        <div class="fuse-note">
          {{ line.note }}
        </div>
      </div>
    </template>
    <p
      v-else
      class="rail-empty"
    >
      三条引线对应卡池尚无唤取记录
    </p>
  </section>
</template>

<style scoped>
/* 栏盒与栏题(定稿原型 .rail-box / .rail-title;与高光时刻栏同构) */
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

.rail-empty {
  font-size: 12px;
  color: var(--text-3);
}

.fuse-item {
  padding: 9px 0;
  border-bottom: 1px solid var(--hairline);
}

.fuse-item:last-child {
  border-bottom: none;
  padding-bottom: 2px;
}

/* 栏题之后的首页贴住标题(原型 .fuse-item:first-of-type;此处栏题同为 div,改用相邻选择) */
.rail-title + .fuse-item {
  padding-top: 2px;
}

.fuse-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 600;
  flex-wrap: wrap;
}

.fuse-head .cnt {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
}

.fuse-head .cnt b {
  font: 700 15px var(--font-num);
  color: var(--accent-ink);
}

/* 大小保底章:大保底黑底金字(强调),小保底描边弱化 */
.badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  line-height: 1;
  padding: 2.5px 6px;
  transform: skewX(var(--skew));
  font-weight: 600;
}

.badge > span {
  display: inline-block;
  transform: skewX(calc(-1 * var(--skew)));
}

.badge-hard {
  background: var(--ink);
  color: var(--gold-bright);
  font-weight: 700;
}

.badge-soft {
  border: 1px solid var(--hairline);
  color: var(--text-2);
  background: transparent;
}

/* 刻度条:强调色填充 + 菱形游标(定稿原型 .fuse-track) */
.fuse-track {
  margin-top: 7px;
  height: 6px;
  background: var(--panel-2);
  border: 1px solid var(--hairline);
  position: relative;
}

.fuse-track .fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--accent);
}

.fuse-track .knob {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 8px;
  background: var(--accent);
  transform: translate(-50%, -50%) rotate(45deg);
  box-shadow: 0 0 0 2px var(--panel);
}

.fuse-scale {
  display: flex;
  justify-content: space-between;
  font: 500 9px var(--font-num);
  color: var(--text-3);
  margin-top: 3px;
}

.fuse-note {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 5px;
}
</style>
