<script setup lang="ts">
import { computed } from 'vue'
import AvatarBadge from './AvatarBadge.vue'
import { elementColor, resolveAvatarUrl } from '@/domain/avatars'
import { poolLabel } from '@/domain/pools'
import type { RosterCardVM } from '@/domain/roster'

/**
 * 详情条(定稿原型 .detail-strip):选中五星的完整信息——头像、歪/UP/重复徽章、
 * 名字 + 类型、出货抽数大数字(歪压暗,同原型)、时间与池、资源 ID、
 * 「不完整」标识与说明、出货长度微条。随选中卡片联动,aria-live 播报。
 */
const props = defineProps<{
  card: RosterCardVM
  poolCode: number
}>()

const src = computed(() =>
  resolveAvatarUrl({ resourceId: props.card.record.resourceId, name: props.card.record.name }),
)

// 类型小字随属性色标(同卡片小标口径;角色等未知色回退 text-2)
const elColor = computed(() => elementColor(props.card.record.resourceType))
const elStyle = computed(() => (elColor.value ? { color: elColor.value } : undefined))

const badge = computed(() => {
  if (props.card.duplicate) return { text: '重复', cls: 'badge-dup' }
  if (props.card.outcome === 'up') return { text: 'UP', cls: 'badge-up' }
  if (props.card.outcome === 'off') return { text: '歪', cls: 'badge-off' }
  return null
})

const degreeClass = computed(() =>
  props.card.degree === 'lucky' ? 'n-lucky' : props.card.degree === 'unlucky' ? 'n-unlucky' : '',
)

// 微条着色随结局(同原型:UP 青 / 歪灰),中性走 UP 色
const fillClass = computed(() => (props.card.outcome === 'off' ? 'off' : 'up'))
</script>

<template>
  <div
    class="detail-strip"
    aria-live="polite"
    aria-label="选中五星详情"
  >
    <AvatarBadge
      :name="card.record.name"
      :src="src"
      :element="card.record.resourceType"
    />
    <span
      v-if="badge"
      class="badge"
      :class="badge.cls"
    ><span>{{ badge.text }}</span></span>
    <span
      v-if="card.incomplete"
      class="badge badge-dup"
    ><span>不完整</span></span>
    <span class="detail-name">
      {{ card.record.name }}
      <small
        class="detail-el"
        :style="elStyle"
      >{{ card.record.resourceType || '—' }}</small>
    </span>
    <span
      class="detail-pulls"
      :class="{ dim: card.outcome === 'off' }"
    >
      <span
        class="n num"
        :class="degreeClass"
      >{{ card.pulls }}</span>
      <span class="u">抽出货</span>
    </span>
    <span class="detail-meta">
      <span><span class="num">{{ card.record.time }}</span> · {{ poolLabel(poolCode) }}</span>
      <span>
        资源 ID <span class="num">{{ card.record.resourceId || '—' }}</span>
        <template v-if="card.incomplete"> · 池内最早记录即五星，按 1 抽计</template>
      </span>
    </span>
    <span class="mini-track">
      <span
        class="mini-fill"
        :class="fillClass"
        :style="{ width: card.barPercent + '%' }"
      />
    </span>
  </div>
</template>

<style scoped>
.detail-strip {
  flex: none;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  border: 1px solid var(--hairline);
  background: var(--panel-2);
  padding: 9px 16px;
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

.badge-dup {
  border: 1px solid var(--hairline);
  color: var(--text-3);
  background: transparent;
}

.detail-name {
  font-weight: 700;
  font-size: 18px;
  letter-spacing: 0.06em;
}

.detail-el {
  font-size: 11px;
  color: var(--text-2);
  margin-left: 7px;
  font-weight: 600;
}

.detail-pulls {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.detail-pulls .n {
  font: 700 27px/1 var(--font-num);
  color: var(--text);
}

.detail-pulls .n.n-lucky {
  color: var(--lucky);
}

.detail-pulls .n.n-unlucky {
  color: var(--danger);
}

/* 歪的出货数字压暗(同原型),程度色让位于冷灰身份色 */
.detail-pulls.dim .n {
  color: var(--off);
}

.detail-pulls .u {
  font-size: 11px;
  color: var(--text-3);
}

.detail-meta {
  font-size: 12px;
  color: var(--text-2);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mini-track {
  flex: 1;
  min-width: 110px;
  height: 6px;
  background: var(--panel);
  border: 1px solid var(--hairline);
  position: relative;
  display: block;
}

.mini-fill {
  display: block;
  height: 100%;
  transition: width 0.3s ease;
}

.mini-fill.up {
  background: var(--win);
}

.mini-fill.off {
  background: var(--off);
}
</style>
