import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import InProgressCard from './InProgressCard.vue'

describe('进行中卡(#10):当前垫抽数与距必得剩余', () => {
  it('显示「进行中」、池名、已垫大数字与距必得剩余', () => {
    const wrapper = mount(InProgressCard, {
      props: { current: 17, hard: 80, label: '角色精准调谐' },
    })

    expect(wrapper.find('.ft-name').text()).toBe('进行中')
    expect(wrapper.find('.ft-sub').text()).toBe('角色精准调谐')
    expect(wrapper.find('.ft-pulls b').text()).toBe('17')
    expect(wrapper.find('.ft-pulls').text()).toContain('已垫')
    expect(wrapper.find('.ip-note').text()).toBe('距必得五星还差 63 抽')
  })

  it('微条为强调色虚线填充,宽度按已垫/硬保底折算', () => {
    const wrapper = mount(InProgressCard, {
      props: { current: 40, hard: 80, label: '角色精准调谐' },
    })

    const fill = wrapper.find('.ip-fill')
    expect(fill.attributes('style')).toContain('width: 50%')
  })

  it('可访问名描述进行中状态;垫抽达到硬保底时剩余钳为 0', () => {
    const wrapper = mount(InProgressCard, {
      props: { current: 80, hard: 80, label: '角色精准调谐' },
    })

    expect(wrapper.attributes('aria-label')).toBe('这一抽还在进行，已垫 80 抽，距必得还差 0 抽')
    expect(wrapper.find('.ip-note').text()).toBe('距必得五星还差 0 抽')
  })
})
