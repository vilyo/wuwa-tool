import { describe, expect, it } from 'vitest'
import { diagnosisGuidance, fileOutcomeGuidance, pickLatestLink, type ExtractedLink } from './probe'

const CN_LINK: ExtractedLink = {
  playerId: '106485288',
  url: 'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?player_id=106485288',
}
const OVERSEA_LINK: ExtractedLink = {
  playerId: '882210234',
  url: 'https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html#/record?player_id=882210234',
}

describe('pickLatestLink', () => {
  it('多 UID 链接中取列表末位(日志里最后出现的一条)', () => {
    const latest = pickLatestLink([CN_LINK, OVERSEA_LINK])

    expect(latest).toEqual(OVERSEA_LINK)
  })

  it('空列表返回 null', () => {
    expect(pickLatestLink([])).toBeNull()
  })
})

describe('diagnosisGuidance', () => {
  it('四种失败诊断各配下一步指引(官方用语「唤取」)', () => {
    expect(diagnosisGuidance('no-game-dir')).toContain('游戏安装目录')
    expect(diagnosisGuidance('no-game-dir')).toContain('选择')

    expect(diagnosisGuidance('no-link')).toContain('唤取记录')

    expect(diagnosisGuidance('log-disabled')).toContain('Engine.ini')

    expect(diagnosisGuidance('log-denied')).toContain('只读')
  })
})

describe('fileOutcomeGuidance', () => {
  it('可读但无链接:引导确认文件来源与唤取记录页前置', () => {
    const text = fileOutcomeGuidance({ type: 'ok', urlCount: 0, decode: 'none' })

    expect(text).toContain('没有找到唤取链接')
    expect(text).toContain('Client.log')
    expect(text).toContain('唤取记录')
  })

  it('其余读取结果各配具体指引', () => {
    expect(fileOutcomeGuidance({ type: 'missing' })).toContain('不存在')
    expect(fileOutcomeGuidance({ type: 'denied' })).toContain('只读')
    expect(fileOutcomeGuidance({ type: 'io-error' })).toContain('读取文件失败')
  })
})
