<script setup lang="ts">
import { useRecordsStore } from '@/stores/records'

const records = useRecordsStore()
const version = __APP_VERSION__
</script>

<template>
  <footer class="statusbar">
    <!-- 自动同步静默失败的温和提示(#13):被动文字、不打扰,出现时替代常驻提示位 -->
    <span
      v-if="records.autoSyncNote"
      role="status"
    >{{ records.autoSyncNote }}</span>
    <template v-else>
      <span>新唤取记录约 <span class="num">30</span> 分钟后可同步</span>
      <span aria-hidden="true">·</span>
      <span>官方仅保留近 6 个月记录,更早已存于本地档案</span>
    </template>
    <span class="right">所有数据仅保存在本机 · <span class="num">v{{ version }}</span></span>
  </footer>
</template>

<style scoped>
/* 文字用 --text-2 而非原型的 --text-3:状态栏底为 --bg-raise,
   --text-3 对比度 ≈3.9:1 不满足设计系统「双主题文字对比 ≥4.5:1」交付检查 */
.statusbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 18px;
  height: 32px;
  padding: 0 26px;
  border-top: 1px solid var(--hairline);
  background: var(--bg-raise);
  font-size: 11.5px;
  color: var(--text-2);
}

.statusbar .num {
  color: var(--text);
}

.statusbar .right {
  margin-left: auto;
}
</style>
