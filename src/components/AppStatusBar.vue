<script setup lang="ts">
import { useRecordsStore } from '@/stores/records'

const records = useRecordsStore()
const version = __APP_VERSION__
</script>

<template>
  <footer class="statusbar">
    <!-- 结果消息(粘贴导入/一键获取/备份等共用出口)>同步进度>自动同步温和提示>常驻提示 -->
    <span
      v-if="records.message"
      class="msg"
      :class="records.message.kind === 'success' ? 'is-success' : 'is-error'"
      :title="records.message.text"
      role="status"
    >{{ records.message.text }}</span>
    <span
      v-else-if="records.syncing && records.syncProgress"
      role="status"
    >正在获取 卡池 {{ records.syncProgress.index }}/{{ records.syncProgress.total }}</span>
    <!-- 自动同步静默失败的温和提示(#13):被动文字、不打扰,出现时替代常驻提示位 -->
    <span
      v-else-if="records.autoSyncNote"
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

/* 消息单行收纳:超长省略号截断,完整内容经 title 悬停可读 */
.statusbar .msg {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.statusbar .msg.is-success {
  color: var(--lucky);
}

.statusbar .msg.is-error {
  color: var(--danger);
}

.statusbar .right {
  margin-left: auto;
}
</style>
