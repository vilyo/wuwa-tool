import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { GachaRecord } from '@/domain/records'
import PityLinesPanel from './PityLinesPanel.vue'

let seq = 0

/** 单调递增时间戳,保证种子流水时间正序 */
function stamp(n: number): string {
  const rest = n % 86400
  const hh = String(Math.floor(rest / 3600)).padStart(2, '0')
  const mm = String(Math.floor((rest % 3600) / 60)).padStart(2, '0')
  const ss = String(rest % 60).padStart(2, '0')
  return `2025-05-01 ${hh}:${mm}:${ss}`
}

function record(overrides: Partial<GachaRecord> = {}): GachaRecord {
  seq += 1
  return {
    cardPoolType: 1,
    cardPoolId: 100074,
    time: stamp(seq),
    name: '远行者佩枪·瞭望',
    qualityLevel: 3,
    resourceId: '21050001',
    resourceType: '武器',
    ...overrides,
  }
}

function fillers(n: number, poolCode = 1): GachaRecord[] {
  return Array.from({ length: n }, () => record({ cardPoolType: poolCode }))
}

function mountPanel(records: GachaRecord[]) {
  return mount(PityLinesPanel, { props: { records: [...records].reverse() } })
}

describe('保底引线栏(#10)', () => {
  it('三条引线:池名 + 已垫/还差计数 + 0–80 刻度 + 说明', () => {
    const wrapper = mountPanel([...fillers(17, 1), ...fillers(5, 2), ...fillers(24, 3)])

    const items = wrapper.findAll('.fuse-item')
    expect(items).toHaveLength(3)
    expect(items[0]!.find('.fuse-head').text()).toContain('角色精准调谐')
    expect(items[0]!.find('.cnt').text()).toBe('已垫 17 · 还差 63 抽')
    expect(items[1]!.find('.cnt').text()).toBe('已垫 5 · 还差 75 抽')
    expect(items[2]!.find('.cnt').text()).toBe('已垫 24 · 还差 56 抽')
    // 0–80 刻度尺:0 / 中点 / 硬保底
    expect(items[0]!.find('.fuse-scale').text()).toBe('04080')
    // 刻度条填充与菱形游标位置一致
    expect(items[0]!.find('.fuse-track .fill').attributes('style')).toContain('width: 21%')
    expect(items[0]!.find('.fuse-track .knob').attributes('style')).toContain('left: 21%')
  })

  it('角色精准引线标注大保底(上个五星歪了),武器/常驻无标注', () => {
    const records = [
      ...fillers(3, 1),
      record({ name: '维里奈', qualityLevel: 5, resourceType: '角色' }),
      ...fillers(17, 1),
      ...fillers(5, 2),
      ...fillers(24, 3),
    ]
    const wrapper = mountPanel(records)

    const badges = wrapper.findAll('.fuse-item .badge')
    expect(badges).toHaveLength(1)
    expect(badges[0]!.classes()).toContain('badge-hard')
    expect(badges[0]!.text()).toBe('大保底')
    const notes = wrapper.findAll('.fuse-note')
    expect(notes[0]!.text()).toBe('上一个五星歪了，下一个必为当期 UP')
    expect(notes[1]!.text()).toBe('没有 50/50，出货即 UP')
    expect(notes[2]!.text()).toBe('常驻池无 UP 概念')
  })

  it('角色精准引线标注小保底', () => {
    const records = [
      ...fillers(3, 1),
      record({ name: '忌炎', qualityLevel: 5, resourceType: '角色' }),
      ...fillers(9, 1),
    ]
    const wrapper = mountPanel(records)
    expect(wrapper.find('.fuse-item .badge').text()).toBe('小保底')
  })

  it('空态:某池无记录时该引线不出现;三池全无记录时整栏给占位说明', () => {
    const partial = mountPanel([...fillers(17, 1)])
    expect(partial.findAll('.fuse-item')).toHaveLength(1)
    expect(partial.text()).toContain('角色精准调谐')

    const noviceOnly = mountPanel([...fillers(4, 5)])
    expect(noviceOnly.findAll('.fuse-item')).toHaveLength(0)
    expect(noviceOnly.find('.rail-empty').exists()).toBe(true)
  })
})
