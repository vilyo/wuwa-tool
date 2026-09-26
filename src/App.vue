<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppStatusBar from '@/components/AppStatusBar.vue'
import AppTitleBar from '@/components/AppTitleBar.vue'
import ArchiveListDialog from '@/components/ArchiveListDialog.vue'
import FiveStarRoster from '@/components/FiveStarRoster.vue'
import HighlightMoments from '@/components/HighlightMoments.vue'
import PasteImport from '@/components/PasteImport.vue'
import PityLinesPanel from '@/components/PityLinesPanel.vue'
import PoolTabBar from '@/components/PoolTabBar.vue'
import PoolVerdictLine from '@/components/PoolVerdictLine.vue'
import RecordList from '@/components/RecordList.vue'
import SwitchConfirmDialog from '@/components/SwitchConfirmDialog.vue'
import UidSelectDialog from '@/components/UidSelectDialog.vue'
import { poolTabs } from '@/domain/poolTabs'
import type { PoolCategory } from '@/domain/pools'
import { useRecordsStore } from '@/stores/records'

const recordsStore = useRecordsStore()

// 池页签状态(#09):单画面 UI 状态,App 本地持有,评语行/名册/详情条/汇总行共用一个联动源。
// 二级选择仅在「该类别实际有数据的 code」中生效,否则回落首个有数据的 code;
// 类别完全无数据时回退类别主池(= T07 默认池假设的收口),内容区呈现空态。
const activeCategory = ref<PoolCategory>('limitedChar')
const selectedCode = ref<number | null>(null)

const tabs = computed(() => poolTabs(recordsStore.records))
// activeCategory 指向的页签不存在时(如未知池记录随档案切换消失)回落到首个页签
const activeTab = computed(
  () => tabs.value.find((tab) => tab.category === activeCategory.value) ?? tabs.value[0]!,
)
const currentPoolCode = computed(() => {
  const codes = activeTab.value.codesWithData
  if (selectedCode.value !== null && codes.includes(selectedCode.value)) return selectedCode.value
  return codes[0] ?? activeTab.value.fallbackCode
})

// 档案切换后页签集合可能缩小(未知池页签消失):归一化选中类别,避免残留指向已消失的页签
watch(tabs, (list) => {
  if (!list.some((tab) => tab.category === activeCategory.value)) {
    activeCategory.value = list[0]!.category
    selectedCode.value = null
  }
})

function selectCategory(category: PoolCategory): void {
  activeCategory.value = category
  selectedCode.value = null // 二级选择随页签重置,回落首个有数据的池
}

function selectPool(code: number): void {
  selectedCode.value = code
}

// 启动时恢复最近档案(重启后数据完整可读)
onMounted(() => {
  void recordsStore.init()
})
</script>

<template>
  <div class="app">
    <AppTitleBar />
    <main class="main-area">
      <PasteImport />
      <section
        v-if="recordsStore.records.length === 0"
        class="empty-state"
        aria-label="唤取档案空态"
      >
        <span
          class="dia lg empty-dia"
          aria-hidden="true"
        />
        <h2 class="empty-title">
          尚无唤取档案
        </h2>
        <p class="empty-hint">
          在游戏内打开一次「唤取记录」页,然后点击顶栏「一键获取」,即可导入你的唤取记录。
        </p>
      </section>
      <template v-else>
        <!-- 池页签栏(#09):四固定类别 + 类别内二级切换 + 未知池兜底页签,右侧汇总指标随池联动 -->
        <PoolTabBar
          :records="recordsStore.records"
          :active-category="activeCategory"
          :pool-code="currentPoolCode"
          @select-category="selectCategory"
          @select-pool="selectPool"
        />
        <!-- 主区两栏(#10,定稿原型 .work):左 = 评语行 + 名册 + 流水过渡件,右 = 保底引线 + 高光时刻 -->
        <div class="work">
          <section class="col-main">
            <!-- 本池评语行(#07):随页签状态联动 -->
            <PoolVerdictLine
              :records="recordsStore.records"
              :pool-code="currentPoolCode"
            />
            <!-- 五星编年史名册(#08/#10):随页签状态联动,名册区域内部滚动 -->
            <FiveStarRoster
              :records="recordsStore.records"
              :pool-code="currentPoolCode"
            />
            <!-- 极简流水(#02 过渡件):正式流水抽屉在 #11,暂以限高滚动收纳在名册下方 -->
            <div class="record-list-wrap">
              <RecordList :records="recordsStore.records" />
            </div>
          </section>
          <aside
            class="rail"
            aria-label="保底与高光"
          >
            <PityLinesPanel :records="recordsStore.records" />
            <HighlightMoments :records="recordsStore.records" />
          </aside>
        </div>
      </template>
    </main>
    <AppStatusBar />
    <!-- 多 UID 选择 / 切换确认 / 档案列表(#05):无待办状态时不渲染 -->
    <UidSelectDialog />
    <SwitchConfirmDialog />
    <ArchiveListDialog />
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.main-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  /* 不整体滚动:名册(flex:1)内部滚动,流水过渡件限高滚动 */
  overflow: hidden;
}

/* 主区两栏(#10,定稿原型 .work):左名册列自适应,右栏固定宽内部滚动 */
.work {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 316px;
  gap: 16px;
}

.col-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 右栏(保底引线 + 高光时刻):自身滚动,栏盒不随内容压扁名册 */
.rail {
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scrollbar-width: thin;
  scrollbar-color: var(--hairline-2) transparent;
}

.rail::-webkit-scrollbar {
  width: 8px;
}

.rail::-webkit-scrollbar-thumb {
  background: var(--hairline-2);
}

/* 窄窗口退化为单列(定稿原型 ≤1080px 断点),右栏随内容展开 */
@media (max-width: 1080px) {
  .work {
    grid-template-columns: 1fr;
  }

  .rail {
    overflow: visible;
  }
}

/* 极简流水过渡件(#02):限高内部滚动,待 #11 流水抽屉替换后移除 */
.record-list-wrap {
  flex: none;
  max-height: 200px;
  overflow-y: auto;
}

.empty-state {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  max-width: 460px;
}

.empty-dia {
  margin-bottom: 6px;
}

.empty-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text);
}

.empty-hint {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.8;
}
</style>
