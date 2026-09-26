import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AvatarBadge from './AvatarBadge.vue'

describe('头像位 AvatarBadge', () => {
  it('有图时显示 <img>,src 为映射出的资产地址', () => {
    const wrapper = mount(AvatarBadge, {
      props: { name: '卡卡罗', src: '/assets/Calcharo-h123.png', element: '导电' },
    })
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('/assets/Calcharo-h123.png')
  })

  it('缺图时回退「属性色菱形 + 名字首字」字牌', () => {
    const wrapper = mount(AvatarBadge, {
      props: { name: '卡卡罗', src: null, element: '导电' },
    })
    expect(wrapper.find('img').exists()).toBe(false)
    const badge = wrapper.get('.avatar-fb')
    expect(badge.text()).toBe('卡')
    // 属性色经 --el 注入,菱形由 ::after 绘制(样式层),字牌文字色随属性色
    expect(wrapper.attributes('style')).toContain('--el')
  })

  it('英文名取首字母;无属性信息时不注入 --el(样式回退 accent)', () => {
    const wrapper = mount(AvatarBadge, { props: { name: 'Verina', src: null } })
    expect(wrapper.get('.avatar-fb').text()).toBe('V')
    expect(wrapper.attributes('style') ?? '').not.toContain('--el')
  })

  it('加载期 onerror 也回退字牌(映射有值但资产异常)', async () => {
    const wrapper = mount(AvatarBadge, {
      props: { name: '维里奈', src: '/broken/Verina.png', element: '衍射' },
    })
    expect(wrapper.find('img').exists()).toBe(true)
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('.avatar-fb').text()).toBe('维')
  })

  it('实例复用切换物品时,换新 src 恢复 <img> 展示资格(详情条场景)', async () => {
    const wrapper = mount(AvatarBadge, { props: { name: '维里奈', src: '/broken/a.png' } })
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    await wrapper.setProps({ name: '卡卡罗', src: '/assets/Calcharo.png' })
    expect(wrapper.find('img').exists()).toBe(true)
    expect(wrapper.find('img').attributes('src')).toBe('/assets/Calcharo.png')
  })
})
