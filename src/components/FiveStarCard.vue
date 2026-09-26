<script setup lang="ts">
import { computed } from 'vue'
import AvatarBadge from './AvatarBadge.vue'
import { elementColor, resolveAvatarUrl } from '@/domain/avatars'
import type { RosterCardVM } from '@/domain/roster'

/**
 * 名册单卡(定稿原型 .ftile):头像、名字 + 歪/UP/重复徽章、属性/武器类型小标 + 日期、
 * 出货抽数大数字 + 0–80 微条(+ 角色系 62 抽期望刻线)。
 * 结局两态经色温编码:UP 暖色洗底 + 顶边 + 实心徽章,歪冷灰底、名字压暗;
 * 程度经数字与微条着色。原生 button 保证 Tab 可达与 Enter/Space 激活。
 */
const props = defineProps<{
  card: RosterCardVM
  selected: boolean
}>()

const emit = defineEmits<{ select: [] }>()

const src = computed(() =>
  resolveAvatarUrl({ resourceId: props.card.record.resourceId, name: props.card.record.name }),
)
// 记录无属性字段,小标退而展示 resourceType(角色/武器),色标同源(武器灰/其余 accent 回退)
const elColor = computed(() => elementColor(props.card.record.resourceType))
const elStyle = computed(() => (elColor.value ? { '--el': elColor.value } : undefined))

const badge = computed(() => {
  if (props.card.duplicate) return { text: '重复', cls: 'dup' }
  if (props.card.outcome === 'up') return { text: 'UP', cls: 'up' }
  if (props.card.outcome === 'off') return { text: '歪', cls: 'off' }
  return null
})

const degreeClass = computed(() =>
  props.card.degree === 'lucky' ? 'n-lucky' : props.card.degree === 'unlucky' ? 'n-unlucky' : '',
)
const barClass = computed(() =>
  props.card.degree === 'lucky' ? 'bar-lucky' : props.card.degree === 'unlucky' ? 'bar-unlucky' : '',
)

/** 62 抽期望参考线(社区口径,仅供参考),刻线与图例共用文案 */
const REF_TITLE = '62 抽期望参考线（社区口径，仅供参考）'

const ariaLabel = computed(() => {
  const parts = [props.card.record.name, `${props.card.pulls} 抽出货`]
  if (badge.value) parts.push(badge.value.text)
  else if (props.card.off === 'unknown') parts.push('判定未知')
  parts.push(props.card.record.time.slice(0, 10))
  return parts.join('，')
})
</script>

<template>
  <button
    type="button"
    class="ftile"
    :class="[card.outcome !== 'neutral' ? card.outcome : '', { 'is-sel': selected }]"
    role="option"
    :aria-selected="selected"
    :aria-label="ariaLabel"
    @click="emit('select')"
    @keydown.enter.prevent="emit('select')"
    @keydown.space.prevent="emit('select')"
  >
    <span class="ft-top">
      <AvatarBadge
        :name="card.record.name"
        :src="src"
        :element="card.record.resourceType"
      />
      <span class="ft-info">
        <span class="ft-head">
          <span class="ft-name">{{ card.record.name }}</span>
          <span
            v-if="badge"
            class="ft-badge"
            :class="badge.cls"
          ><span>{{ badge.text }}</span></span>
        </span>
        <span class="ft-sub">
          <span
            class="ft-el"
            :style="elStyle"
          ><i
            aria-hidden="true"
          />{{ card.record.resourceType || '—' }}</span>
          <span class="ft-date num">{{ card.record.time.slice(0, 10) }}</span>
        </span>
      </span>
    </span>
    <span class="ft-pulls">
      <b
        class="num"
        :class="degreeClass"
      >{{ card.pulls }}</b>
      <span>抽出货</span>
    </span>
    <span class="ft-bar">
      <i
        class="ft-fill"
        :class="barClass"
        :style="{ width: card.barPercent + '%' }"
      />
      <i
        v-if="card.refPercent !== null"
        class="ft-ref"
        role="img"
        :title="REF_TITLE"
        :aria-label="REF_TITLE"
        :style="{ left: card.refPercent + '%' }"
      />
    </span>
  </button>
</template>

<style scoped>
.ftile {
  position: relative;
  text-align: left;
  background: var(--panel-2);
  border: 1px solid var(--hairline);
  border-top: 2px solid var(--hairline-2);
  padding: 9px 11px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition:
    border-color var(--t-fast),
    transform var(--t-fast),
    box-shadow var(--t-fast);
}

.ftile:hover {
  border-color: var(--hairline-2);
  transform: translateY(-1px);
}

.ftile.is-sel {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

/* 第一视觉层:UP 暖色调 / 歪冷灰调(色温对立 + 顶边 + 徽章三重编码) */
.ftile.up {
  border-top-color: var(--win);
  background: var(--win-wash);
}

.ftile.off {
  border-top-color: var(--off);
  background: var(--wash-off);
}

.ftile.off .ft-name {
  color: var(--text-2);
}

.ft-top {
  display: flex;
  gap: 9px;
  align-items: center;
  min-width: 0;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ft-badge {
  margin-left: auto;
  flex: none;
  font-size: 10px;
  line-height: 1;
  padding: 2.5px 6px;
  transform: skewX(var(--skew));
  font-weight: 600;
}

.ft-badge > span {
  display: inline-block;
  transform: skewX(calc(-1 * var(--skew)));
}

.ft-badge.up {
  background: var(--win);
  color: var(--on-win);
}

.ft-badge.off {
  background: var(--off);
  color: #fffdf6;
}

.ft-badge.dup {
  border: 1px solid var(--hairline);
  color: var(--text-3);
  background: transparent;
}

.ft-sub {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--text-3);
}

/* 第三视觉层:属性/武器类型(弱化为头像旁小字,菱形色随属性色标) */
.ft-el {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ft-el i {
  width: 5px;
  height: 5px;
  transform: rotate(45deg);
  background: var(--el, var(--accent));
  flex: none;
}

.ft-date {
  font: 500 10px var(--font-num);
}

/* 第二视觉层:欧非程度(数字与微条同色:绿=超欧,红=超非,中性=正常) */
.ft-pulls {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 2px;
}

.ft-pulls b {
  font: 700 24px/1.05 var(--font-num);
  color: var(--text);
}

.ft-pulls b.n-lucky {
  color: var(--lucky);
}

.ft-pulls b.n-unlucky {
  color: var(--danger);
}

.ft-pulls > span {
  font-size: 11px;
  color: var(--text-3);
}

.ft-bar {
  position: relative;
  height: 4px;
  background: var(--panel);
  border: 1px solid var(--hairline);
  margin-top: 3px;
}

.ft-bar .ft-fill {
  display: block;
  height: 100%;
  background: var(--hairline-2);
}

.ft-bar .ft-fill.bar-lucky {
  background: var(--lucky);
}

.ft-bar .ft-fill.bar-unlucky {
  background: var(--danger);
}

/* 62 抽期望参考线刻度(仅角色系限定池) */
.ft-bar .ft-ref {
  position: absolute;
  top: -3px;
  bottom: -3px;
  height: auto;
  width: 1px;
  background: var(--text-3);
}
</style>

<!-- 歪徽章文字对比度随主题翻转(原型定稿):scoped 选择器无法上溯 html[data-theme],
     用全局块补一条;.ft-badge.off 为本组件独有类名,不影响他处 -->
<style>
html[data-theme='dark'] .ft-badge.off {
  color: #15171b;
}
</style>
