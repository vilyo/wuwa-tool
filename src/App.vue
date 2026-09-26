<script setup lang="ts">
import AppStatusBar from '@/components/AppStatusBar.vue'
import AppTitleBar from '@/components/AppTitleBar.vue'
</script>

<template>
  <div class="app">
    <AppTitleBar />
    <main class="main-area">
      <section
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
          在游戏内打开一次「唤取记录」页,然后点击顶栏「一键同步」,即可导入你的唤取记录。
        </p>
      </section>
    </main>
    <AppStatusBar />
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
  display: grid;
  place-items: center;
  padding: 24px;
}

.empty-state {
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
