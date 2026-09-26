<script setup lang="ts">
import { computed } from 'vue'

/**
 * 名册首位「进行中」虚线卡(#10,定稿原型 .ftile.ghost):
 * 当前池这一抽还在进行——已垫抽数大数字 + 0–80 虚线微条 + 距必得剩余。
 * 非交互占位卡(原型中可选中查看的「编年史尚未写完」详情态不在本任务范围),
 * 该池无任何记录时由名册不渲染此卡。强调色系与脉冲菱形,同虚线微条母语。
 */
const props = defineProps<{
  /** 当前垫抽数 */
  current: number
  /** 五星硬保底(0–80 刻度;新手池为 50) */
  hard: number
  /** 池名 */
  label: string
}>()

const remain = computed(() => Math.max(0, props.hard - props.current))
const percent = computed(() => Math.min(100, Math.round((props.current / props.hard) * 100)))
</script>

<template>
  <div
    class="ipcard"
    :aria-label="`这一抽还在进行，已垫 ${current} 抽，距必得还差 ${remain} 抽`"
  >
    <span class="ft-top">
      <span
        class="ip-ava"
        aria-hidden="true"
      ><i class="gdia" /></span>
      <span class="ft-info">
        <span class="ft-head">
          <span class="ft-name">进行中</span>
        </span>
        <span class="ft-sub"><span>{{ label }}</span></span>
      </span>
    </span>
    <span class="ft-pulls">
      <b class="num">{{ current }}</b>
      <span>已垫</span>
    </span>
    <span class="ft-bar">
      <i
        class="ip-fill"
        :style="{ width: percent + '%' }"
      />
    </span>
    <span class="ip-note">距必得五星还差 {{ remain }} 抽</span>
  </div>
</template>

<style scoped>
/* 虚线强调色卡(定稿原型 .ftile.ghost):与实卡的盒形一致,状态全部走强调色 */
.ipcard {
  border: 1px dashed var(--accent);
  border-top: 2px dashed var(--accent);
  background: transparent;
  padding: 9px 11px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ft-top {
  display: flex;
  gap: 9px;
  align-items: center;
  min-width: 0;
}

/* 头像位:虚线框 + 脉冲菱形(「这一抽还在进行」的动效表达) */
.ip-ava {
  flex: none;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px dashed var(--accent);
}

.gdia {
  width: 11px;
  height: 11px;
  border: 1.5px solid var(--accent);
  transform: rotate(45deg);
  animation: ip-pulse 1.8s ease-in-out infinite;
}

@keyframes ip-pulse {
  0%,
  100% {
    opacity: 0.35;
  }

  50% {
    opacity: 1;
  }
}

.ft-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ft-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
}

.ft-name {
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.02em;
}

.ft-sub {
  font-size: 10px;
  color: var(--text-3);
}

.ft-pulls {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 2px;
}

.ft-pulls b {
  font: 700 24px/1.05 var(--font-num);
  color: var(--accent-ink);
}

.ft-pulls > span {
  font-size: 11px;
  color: var(--text-3);
}

.ft-bar {
  height: 4px;
  background: var(--panel);
  border: 1px solid var(--hairline);
  margin-top: 3px;
}

.ip-fill {
  display: block;
  height: 100%;
  background: repeating-linear-gradient(90deg, var(--accent) 0 5px, transparent 5px 9px);
}

.ip-note {
  font-size: 10.5px;
  color: var(--accent-ink);
}
</style>
