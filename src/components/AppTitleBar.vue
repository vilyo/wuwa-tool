<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useThemeStore } from '@/stores/theme'

const theme = useThemeStore()
const appWindow = getCurrentWindow()
</script>

<template>
  <header
    class="titlebar"
    data-tauri-drag-region
  >
    <div
      class="brand"
      data-tauri-drag-region
    >
      <span
        class="dia"
        aria-hidden="true"
      />
      <span class="brand-name">鸣潮工具箱</span>
      <span class="brand-tag">V1</span>
    </div>
    <div
      class="titlebar-spacer"
      data-tauri-drag-region
    />
    <!-- 占位入口:一键同步 #03 / 记录 #11 / 设置 #12 接线 -->
    <button
      type="button"
      class="tbtn gold"
    >
      <span>一键同步</span>
    </button>
    <button
      type="button"
      class="tbtn"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 14 14"
        aria-hidden="true"
      ><path
        d="M1.5 3h11M1.5 7h8M1.5 11h11"
        stroke="currentColor"
        stroke-width="1.5"
      /></svg>
      <span>记录</span>
    </button>
    <button
      type="button"
      class="tbtn"
      aria-label="打开设置"
      title="设置"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        aria-hidden="true"
      ><path
        d="M2 4.5h8M12.5 4.5H14M12 2.5v4M2 11.5h2M6.5 11.5H14M6 9.5v4"
        stroke="currentColor"
        stroke-width="1.5"
      /></svg>
    </button>
    <button
      type="button"
      class="tbtn"
      aria-label="切换明暗主题"
      title="切换明暗主题"
      @click="theme.toggle()"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 15 15"
        aria-hidden="true"
      ><path
        d="M9.5 1.5a6 6 0 1 0 4 10A6.5 6.5 0 0 1 9.5 1.5z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
      /></svg>
    </button>
    <div class="win-ctl">
      <button
        type="button"
        class="win-btn"
        aria-label="最小化"
        @click="appWindow.minimize()"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 6h9" stroke="currentColor" stroke-width="1.4" /></svg>
      </button>
      <button
        type="button"
        class="win-btn"
        aria-label="最大化或还原"
        @click="appWindow.toggleMaximize()"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.2" y="2.2" width="7.6" height="7.6" fill="none" stroke="currentColor" stroke-width="1.3" /></svg>
      </button>
      <button
        type="button"
        class="win-btn is-close"
        aria-label="关闭"
        @click="appWindow.close()"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.4" /></svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 0 14px;
  height: 48px;
  background: var(--ink);
  color: var(--ink-text);
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.14em;
}

.brand .dia {
  background: var(--accent);
  width: 8px;
  height: 8px;
}

.brand-tag {
  font: 500 10px/1 var(--font-num);
  color: var(--ink-text-faint);
  border: 1px solid var(--ink-line);
  padding: 3px 7px;
  letter-spacing: 0.1em;
}

.titlebar-spacer {
  flex: 1;
}

.tbtn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 13px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-text-dim);
  transition: color var(--t-fast), background var(--t-fast);
}

.tbtn:hover {
  color: var(--ink-text);
  background: var(--ink-wash);
}

.tbtn:active {
  transform: scale(0.97);
}

.tbtn.gold {
  background: var(--btn);
  color: var(--btn-ink);
  font-weight: 700;
  transform: skewX(var(--skew));
  padding: 0 17px;
}

.tbtn.gold > * {
  transform: skewX(calc(-1 * var(--skew)));
}

.tbtn.gold:hover {
  filter: brightness(1.06);
}

/* 按压态缩放不得丢失斜切(形状母语) */
.tbtn.gold:active {
  transform: skewX(var(--skew)) scale(0.97);
}

.win-ctl {
  display: flex;
  margin-left: 6px;
}

.win-btn {
  width: 34px;
  height: 28px;
  display: grid;
  place-items: center;
  color: var(--ink-text-faint);
  transition: background var(--t-fast), color var(--t-fast);
}

.win-btn:hover {
  background: var(--ink-wash-strong);
  color: var(--ink-text);
}

.win-btn.is-close:hover {
  background: var(--danger);
  color: #fff;
}
</style>
