import { describe, expect, it } from 'vitest'
import { buildUidChoices, type ArchiveSummary } from './archives'
import type { ExtractedLink } from './probe'

function archive(playerId: string, count: number): ArchiveSummary {
  return {
    playerId,
    count,
    firstTime: '2025-05-01 10:00:00',
    lastTime: '2025-05-05 10:00:00',
  }
}

describe('buildUidChoices', () => {
  it('按 player_id 把库内档案对到检测出的链接上,已有档案可辨识', () => {
    const links: ExtractedLink[] = [
      { playerId: '106485288', url: 'https://a.example/1' },
      { playerId: '882210234', url: 'https://b.example/2' },
    ]

    const choices = buildUidChoices(links, [archive('882210234', 130)])

    expect(choices).toEqual([
      { playerId: '106485288', url: 'https://a.example/1', archive: null },
      { playerId: '882210234', url: 'https://b.example/2', archive: archive('882210234', 130) },
    ])
  })

  it('库里没有任何档案时全部标为新档案,顺序保持检测顺序', () => {
    const links: ExtractedLink[] = [
      { playerId: '42', url: 'https://a.example/1' },
      { playerId: '43', url: 'https://b.example/2' },
    ]

    const choices = buildUidChoices(links, [])

    expect(choices.map((choice) => choice.playerId)).toEqual(['42', '43'])
    expect(choices.every((choice) => choice.archive === null)).toBe(true)
  })
})
