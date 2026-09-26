<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { elementColor } from '@/domain/avatars'

/** 名册头像位(DESIGN-SYSTEM 关键组件):有图显示图,缺图回退属性色菱形 + 名字首字字牌 */
const props = defineProps<{
  /** 物品名(API 返回名,随链接 lang 变化);缺图时取首字作字牌 */
  name: string
  /** 映射出的打包资产 URL;null/undefined = 缺图,直接显示字牌 */
  src?: string | null
  /** 属性/武器类型(如 衍射/佩枪);决定菱形与字牌的属性色,未知时回退主题色 */
  element?: string
}>()

// 资产加载失败同样回退字牌(回退是必做项,不是摆设)
const imgBroken = ref(false)
// 实例被复用切换物品时(详情条),恢复新资产的展示资格
watch(
  () => props.src,
  () => {
    imgBroken.value = false
  },
)

const elColor = computed(() => elementColor(props.element))
const style = computed(() => (elColor.value ? { '--el': elColor.value } : undefined))
</script>

<template>
  <span class="avatar-badge" :style="style">
    <i class="avatar-fb">{{ name.charAt(0) }}</i>
    <img v-if="src && !imgBroken" :src="src" alt="" @error="imgBroken = true">
  </span>
</template>

<style scoped>
/* 42px 头像位:与定稿原型 .ft-ava 同构,色彩走 v11 tokens,属性色经 --el 注入 */
.avatar-badge {
  flex: none;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--hairline-2);
}

.avatar-badge::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  border: 1px solid var(--el, var(--accent));
  opacity: 0.3;
  transform: rotate(45deg);
}

.avatar-fb {
  font-style: normal;
  font-weight: 700;
  font-size: 19px;
  line-height: 1;
  color: var(--el, var(--text));
}

.avatar-badge img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 1;
}
</style>
