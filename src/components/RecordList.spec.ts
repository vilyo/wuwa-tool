import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { GachaRecord } from '@/domain/records'
import RecordList from './RecordList.vue'

function record(overrides: Partial<GachaRecord>): GachaRecord {
  return {
    cardPoolType: 1,
    cardPoolId: 100074,
    time: '2025-05-01 10:00:00',
    name: '长离',
    qualityLevel: 5,
    resourceId: '21010043',
    resourceType: '角色',
    ...overrides,
  }
}

describe('流水列表(极简全量)', () => {
  it('按时间倒序展示全部记录', () => {
    const wrapper = mount(RecordList, {
      props: {
        records: [
          record({ time: '2025-05-01 10:00:00', name: '较早' }),
          record({ time: '2025-05-03 09:00:00', name: '最新' }),
          record({ time: '2025-05-02 08:00:00', name: '居中' }),
        ],
      },
    })

    const names = wrapper.findAll('tbody tr').map((row) => row.find('.record-name').text())
    expect(names).toEqual(['最新', '居中', '较早'])
    expect(wrapper.find('.record-count').text()).toContain('3')
  })

  it('展示池名与稀有度;未知池 code 兜底展示', () => {
    const wrapper = mount(RecordList, {
      props: {
        records: [
          record({ cardPoolType: 5, name: '新手五星', qualityLevel: 5 }),
          record({ cardPoolType: 99, name: '未来池物品', qualityLevel: 3 }),
        ],
      },
    })

    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.text()).toContain('新手调谐')
    expect(rows[0]!.text()).toContain('★★★★★')
    expect(rows[1]!.text()).toContain('未收录调谐池 99')
    expect(rows[1]!.text()).toContain('★★★')
  })
})
