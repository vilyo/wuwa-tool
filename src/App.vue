<script setup lang="ts">
import { onMounted } from 'vue'
import AppStatusBar from '@/components/AppStatusBar.vue'
import AppTitleBar from '@/components/AppTitleBar.vue'
import ArchiveListDialog from '@/components/ArchiveListDialog.vue'
import FiveStarRoster from '@/components/FiveStarRoster.vue'
import PasteImport from '@/components/PasteImport.vue'
import PoolVerdictLine from '@/components/PoolVerdictLine.vue'
import RecordList from '@/components/RecordList.vue'
import SwitchConfirmDialog from '@/components/SwitchConfirmDialog.vue'
import UidSelectDialog from '@/components/UidSelectDialog.vue'
import { useRecordsStore } from '@/stores/records'

const recordsStore = useRecordsStore()

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
        <!-- 本池评语行(#07):V1 默认角色精准调谐池,页签联动由 #09 接管 -->
        <PoolVerdictLine :records="recordsStore.records" />
        <!-- 五星编年史名册(#08):名册区域内部滚动 -->
        <FiveStarRoster :records="recordsStore.records" />
        <!-- 极简流水(#02 过渡件):正式流水抽屉在 #11,暂以限高滚动收纳在名册下方 -->
        <div class="record-list-wrap">
          <RecordList :records="recordsStore.records" />
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
