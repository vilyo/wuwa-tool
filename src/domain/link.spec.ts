import { describe, expect, it } from 'vitest'
import { LinkParseError } from './errors'
import { parseGachaLink } from './link'

const CN_URL =
  'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?svr_id=76402e5bd7&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=acdf99a1abc&resources_id=c9fbcd24def&platform=PC'

const OVERSEA_URL =
  'https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html#/record?svr_id=8a1cb6e2&player_id=5001&lang=en-US&gacha_id=100074&gacha_type=2&svr_area=oversea&record_id=f00dbeef&resources_id=baadf00d&platform=PC'

describe('唤取链接解析', () => {
  it('解析国服链接的全部 9 个参数,按 host 判为国服', () => {
    const link = parseGachaLink(CN_URL)

    expect(link.svrId).toBe('76402e5bd7')
    expect(link.playerId).toBe('106485288')
    expect(link.lang).toBe('zh-Hans')
    expect(link.gachaId).toBe('100074')
    expect(link.gachaType).toBe('1')
    expect(link.svrArea).toBe('cn')
    expect(link.recordId).toBe('acdf99a1abc')
    expect(link.resourcesId).toBe('c9fbcd24def')
    expect(link.platform).toBe('PC')
    expect(link.region).toBe('cn')
  })

  it('国际服 host(.net / -oversea)判为国际服', () => {
    const link = parseGachaLink(OVERSEA_URL)

    expect(link.region).toBe('oversea')
  })

  it('`&` 被转义成 `\\u0026` 时仍可解析', () => {
    const escaped = CN_URL.replaceAll('&', '\\u0026')
    const link = parseGachaLink(escaped)

    expect(link.playerId).toBe('106485288')
    expect(link.recordId).toBe('acdf99a1abc')
    expect(link.region).toBe('cn')
  })

  it('云鸣潮 URL 顶层 query 与 hash 各一份参数时 hash 优先;host 无法识别时按 svr_area 判服', () => {
    const cloudUrl =
      'https://closera.example.com/aki/gacha/index.html?svr_id=topsvr&player_id=1&lang=zh-Hans&gacha_id=200000&gacha_type=3&svr_area=cn&record_id=topRecordId&resources_id=topRes&platform=WINSTORY#/record?svr_id=76402e5bd7&player_id=106485288&lang=zh-Hans&gacha_id=100074&gacha_type=1&svr_area=cn&record_id=hashRecordId&resources_id=hashRes&platform=PC'

    const link = parseGachaLink(cloudUrl)

    expect(link.recordId).toBe('hashRecordId')
    expect(link.resourcesId).toBe('hashRes')
    expect(link.gachaType).toBe('1')
    expect(link.gachaId).toBe('100074')
    expect(link.platform).toBe('PC')
    expect(link.region).toBe('cn')
  })

  it('host 无法识别且 svr_area 非 cn 时判为国际服', () => {
    const url = OVERSEA_URL.replace(
      'aki-gm-resources-oversea.aki-game.net',
      'closera.example.com',
    )

    expect(parseGachaLink(url).region).toBe('oversea')
  })

  it('从日志行等含杂讯文本中提取链接(带引号与转义 &)', () => {
    const logLine = `[2026.07.30-12.00.00:000][  23]LogPakoraSDK: OpenWebView url= sdkJson: {"url":"${CN_URL.replaceAll('&', '\\u0026')}","from":"client"}`

    const link = parseGachaLink(logLine)

    expect(link.playerId).toBe('106485288')
    expect(link.region).toBe('cn')
  })

  it('剔除链接结尾的中文标点杂讯,末位参数不被污染', () => {
    const inSentence = parseGachaLink(`链接在这里：${CN_URL}。`)
    expect(inSentence.recordId).toBe('acdf99a1abc')
    expect(inSentence.platform).toBe('PC')
    expect(inSentence.region).toBe('cn')

    const inParens = parseGachaLink(`（${CN_URL}）`)
    expect(inParens.recordId).toBe('acdf99a1abc')

    const withComma = parseGachaLink(`${CN_URL},`)
    expect(withComma.platform).toBe('PC')
  })

  it('缺少任一参数时报链接解析错误并指明缺失项', () => {
    const missing = CN_URL.replace('&record_id=acdf99a1abc', '')

    expect(() => parseGachaLink(missing)).toThrow(LinkParseError)
    expect(() => parseGachaLink(missing)).toThrow(/record_id/)
  })

  it('非链接文本报链接解析错误', () => {
    expect(() => parseGachaLink('随便一段文字')).toThrow(LinkParseError)
    expect(() => parseGachaLink('')).toThrow(LinkParseError)
  })
})
