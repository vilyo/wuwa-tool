<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { poolLabel } from '@/domain/pools'
import {
  RECORD_ROW_HEIGHT,
  filterRecords,
  poolCodesIn,
  type RecordFilter,
} from '@/domain/recordFilter'
import { recordKey, type GachaRecord } from '@/domain/records'

const props = defineProps<{ open: boolean; records: GachaRecord[] }>()
const emit = defineEmits<{ close: [] }>()

// —— 筛选(#11,原型 .rec-filter):稀有度芯片单选 + 卡池下拉(档案中出现过的池) ——
const quality = ref<number | null>(null)
const poolCode = ref<number | null>(null)
const filter = computed<RecordFilter>(() => ({
  qualityLevel: quality.value,
  poolCode: poolCode.value,
}))
const poolOptions = computed(() => poolCodesIn(props.records))
const rows = computed(() => filterRecords(props.records, filter.value))

/** 稀有度芯片档位(全部 + 5/4/3 三档) */
const QUALITY_CHIPS: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: null, label: '全部' },
  { value: 5, label: '五星' },
  { value: 4, label: '四星' },
  { value: 3, label: '三星' },
]

function clearFilters(): void {
  quality.value = null
  poolCode.value = null
}

// 筛选变化后回到顶部,避免深滚动位置悬在缩短后的列表之外
watch(filter, () => {
  scrollTop.value = 0
  if (listEl.value) listEl.value.scrollTop = 0
})
// 档案切换后选中池可能已不存在:归一化为「全部卡池」
watch(poolOptions, (codes) => {
  if (poolCode.value !== null && !codes.includes(poolCode.value)) poolCode.value = null
})

// —— 虚拟滚动(#11,自实现窗口化):只渲染可视区 ± 缓冲的行,占位高度撑出真实滚动条 ——
const VIEWPORT_BUFFER = 10
/** 测量失败(jsdom/隐藏)时的兜底视口高度,保证列表不空白 */
const FALLBACK_VIEWPORT = 480
const scrollTop = ref(0)
const viewportH = ref(FALLBACK_VIEWPORT)
const listEl = ref<HTMLElement | null>(null)

const totalHeight = computed(() => rows.value.length * RECORD_ROW_HEIGHT)
/** 渲染窗口:start = 首个可见行向上扩缓冲 */
const rendered = computed(() => {
  const start = Math.max(0, Math.floor(scrollTop.value / RECORD_ROW_HEIGHT) - VIEWPORT_BUFFER)
  const count = Math.ceil(viewportH.value / RECORD_ROW_HEIGHT) + VIEWPORT_BUFFER * 2
  const window_ = rows.value.slice(start, start + count)
  return window_.map((record, offset) => ({ record, top: (start + offset) * RECORD_ROW_HEIGHT }))
})

function onScroll(event: Event): void {
  scrollTop.value = (event.target as HTMLElement).scrollTop
}

function measure(): void {
  const height = listEl.value?.clientHeight ?? 0
  viewportH.value = height > 0 ? height : FALLBACK_VIEWPORT
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  document.removeEventListener('keydown', onKeydown)
})

// —— 浮层无障碍(#11):ESC 关闭 + 焦点往返(打开进抽屉、关闭回触发按钮) ——
let lastFocused: HTMLElement | null = null
const closeBtn = ref<HTMLButtonElement | null>(null)

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      closeBtn.value?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown)
      lastFocused?.focus()
      lastFocused = null
    }
  },
  { immediate: true },
)
</script>

<template>
  <template v-if="open">
    <div
      class="drawer-backdrop"
      @click="emit('close')"
    />
    <aside
      class="drawer"
      role="dialog"
      aria-modal="true"
      aria-label="唤取记录"
    >
      <div class="drawer-head">
        <span class="drawer-title"><span
          class="dia sm"
          aria-hidden="true"
        />唤取记录</span>
        <button
          ref="closeBtn"
          type="button"
          class="drawer-close"
          aria-label="关闭记录抽屉"
          @click="emit('close')"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            aria-hidden="true"
          ><path
            d="M2 2l9 9M11 2l-9 9"
            stroke="currentColor"
            stroke-width="1.6"
          /></svg>
        </button>
      </div>
      <div class="drawer-filter">
        <button
          v-for="chip in QUALITY_CHIPS"
          :key="chip.label"
          type="button"
          class="r-chip"
          :class="{ 'is-active': quality === chip.value }"
          @click="quality = chip.value"
        >
          <span
            v-if="chip.value !== null"
            class="dot"
            :class="`q${chip.value}`"
            aria-hidden="true"
          />{{ chip.label }}
        </button>
        <select
          v-model="poolCode"
          class="pool-sel"
          aria-label="筛选卡池"
        >
          <option :value="null">全部卡池</option>
          <option
            v-for="code in poolOptions"
            :key="code"
            :value="code"
          >
            {{ poolLabel(code) }}
          </option>
        </select>
        <span class="rec-count num">共 {{ rows.length }} 条</span>
      </div>
      <div
        ref="listEl"
        class="rec-list"
        @scroll.passive="onScroll"
      >
        <div
          class="rec-spacer"
          :style="{ height: `${totalHeight}px` }"
        >
          <div
            v-for="item in rendered"
            :key="recordKey(item.record)"
            class="rec-row"
            :class="`q${item.record.qualityLevel}`"
            :style="{ top: `${item.top}px` }"
          >
            <span class="t num">{{ item.record.time }}</span>
            <span class="pool">{{ poolLabel(item.record.cardPoolType) }}</span>
            <span
              class="rec-name"
              :class="`q${item.record.qualityLevel}`"
            >{{ item.record.name }}</span>
            <span class="rarity-cell">
              <span
                class="dot"
                :class="`q${item.record.qualityLevel}`"
                aria-hidden="true"
              />{{ item.record.qualityLevel }}星
            </span>
          </div>
        </div>
        <div
          v-if="rows.length === 0"
          class="rec-empty"
        >
          <template v-if="records.length === 0">
            <p>暂无唤取记录</p>
            <p class="rec-empty-hint">完成一次唤取同步后,这里会展示全部流水</p>
          </template>
          <template v-else>
            <p>没有符合筛选条件的记录</p>
            <button
              type="button"
              class="btn rec-clear"
              @click="clearFilters"
            >
              清除筛选
            </button>
          </template>
        </div>
      </div>
      <div class="drawer-foot">新记录约 30 分钟延迟 · 官方仅保留近 6 个月记录</div>
    </aside>
  </template>
</template>

<style scoped>
/* 遮罩与抽屉(#11,定稿原型 .backdrop/.drawer):右侧滑入,浮于主画面之上 */
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: var(--backdrop);
}

.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  width: min(580px, 94vw);
  display: flex;
  flex-direction: column;
  background: var(--bg-raise);
  border-left: 1px solid var(--hairline-2);
  box-shadow: var(--shadow-pop);
}

.drawer-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 20px;
  background: var(--ink);
  color: var(--ink-text);
}

.drawer-title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.18em;
}

.drawer-close {
  margin-left: auto;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  color: inherit;
  opacity: 0.75;
  transition: opacity var(--t-fast), background var(--t-fast);
}

.drawer-close:hover {
  opacity: 1;
  background: rgba(127, 127, 127, 0.18);
}

/* 筛选行固定在列表上方(自实现窗口化需要专属滚动视口) */
.drawer-filter {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 14px 20px 12px;
  border-bottom: 1px solid var(--hairline);
}

.r-chip {
  padding: 5px 12px;
  border: 1px solid var(--hairline);
  background: var(--panel);
  font-size: 12.5px;
  color: var(--text-2);
  transition: color var(--t-fast), background var(--t-fast), border-color var(--t-fast);
}

.r-chip.is-active {
  background: var(--ink);
  color: var(--ink-text);
  border-color: var(--ink);
}

.r-chip .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  transform: rotate(45deg);
}

.pool-sel {
  font: inherit;
  font-size: 12.5px;
  color: var(--text-2);
  background: var(--panel);
  border: 1px solid var(--hairline);
  padding: 5px 9px;
}

.rec-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
}

/* 滚动视口:窗口化渲染,行绝对定位在占位层上 */
.rec-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 20px;
  scrollbar-width: thin;
  scrollbar-color: var(--hairline-2) transparent;
}

.rec-list::-webkit-scrollbar {
  width: 8px;
}

.rec-list::-webkit-scrollbar-thumb {
  background: var(--hairline-2);
}

.rec-spacer {
  position: relative;
}

.rec-row {
  position: absolute;
  left: 0;
  right: 0;
  /* 行高与 RECORD_ROW_HEIGHT 同源(虚拟滚动定位即此值) */
  height: 36px;
  display: grid;
  grid-template-columns: 126px 108px 1fr 62px;
  gap: 10px;
  align-items: center;
  padding: 0 6px;
  border-bottom: 1px solid var(--hairline);
  font-size: 12.5px;
  transition: background var(--t-fast);
}

.rec-row:hover {
  background: var(--row-hover);
}

.rec-row .t {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
  white-space: nowrap;
}

.rec-row .pool {
  color: var(--text-3);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rec-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rec-name.q5 {
  color: var(--rarity-ink);
}

.rec-name.q4 {
  color: var(--purple);
}

.rarity-cell {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-2);
  font-size: 12px;
}

.rarity-cell .dot {
  width: 7px;
  height: 7px;
  transform: rotate(45deg);
  flex: none;
}

.dot.q5 {
  background: var(--rarity);
}

.dot.q4 {
  background: var(--purple);
}

.dot.q3 {
  background: var(--blue);
}

.rec-row.q5 {
  background: var(--win-wash);
}

.rec-row.q5:hover {
  background: var(--row-hover);
}

.rec-empty {
  padding: 40px 0;
  text-align: center;
  color: var(--text-2);
}

.rec-empty p {
  margin-bottom: 12px;
}

.rec-empty-hint {
  font-size: 12px;
  color: var(--text-3);
}

.rec-clear {
  border: 1px solid var(--hairline-2);
  padding: 6px 15px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
  transition: color var(--t-fast), border-color var(--t-fast);
}

.rec-clear:hover {
  color: var(--text);
  border-color: var(--text-3);
}

.drawer-foot {
  flex: none;
  padding: 10px 20px;
  border-top: 1px solid var(--hairline);
  font-size: 11.5px;
  color: var(--text-3);
}
</style>
