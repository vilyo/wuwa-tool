import { LinkParseError } from './errors'

export type ServerRegion = 'cn' | 'oversea'

/** 抽卡(唤取)链接的 9 个 URL 参数(无签名参数,research §1.4) */
export interface GachaLinkParams {
  svrId: string
  playerId: string
  lang: string
  gachaId: string
  gachaType: string
  svrArea: string
  recordId: string
  resourcesId: string
  platform: string
}

export interface ParsedGachaLink extends GachaLinkParams {
  region: ServerRegion
}

type RequiredKey =
  | 'svr_id'
  | 'player_id'
  | 'lang'
  | 'gacha_id'
  | 'gacha_type'
  | 'svr_area'
  | 'record_id'
  | 'resources_id'
  | 'platform'

// 日志里 `&` 可能被转义成 `\u0026`(juliy819 decoder.rs),链接前后可能带杂讯文本
const ESCAPED_AMPERSAND = /\\u0026/gi
const URL_PATTERN = /https:\/\/[^\s"'<>]+/i

// 结尾标点杂讯:这些字符能被 URL_PATTERN 吞入且 new URL 仍解析成功,
// 但会污染最后一个参数值(如 record_id),导致有效链接被误判失效
const TRAILING_NOISE = new Set([
  '。', '，', '、', '；', '：', '？', '！',
  '（', '）', '「', '」', '『', '』', '【', '】', '《', '》', '“', '”', '‘', '’',
  '(', ')', '[', ']', '{', '}', ',', '.', ';', ':', '?', '!',
])

/** 匹配后剔除结尾的标点杂讯字符 */
function trimTrailingNoise(candidate: string): string {
  let end = candidate.length
  while (end > 0 && TRAILING_NOISE.has(candidate.charAt(end - 1))) end -= 1
  return candidate.slice(0, end)
}

/** 解析玩家粘贴的唤取链接:提取 9 参数并判定国服/国际服 */
export function parseGachaLink(raw: string): ParsedGachaLink {
  const normalized = raw.replaceAll(ESCAPED_AMPERSAND, '&')
  const match = URL_PATTERN.exec(normalized)
  if (!match) {
    throw new LinkParseError('未在输入中找到唤取链接,请粘贴完整链接后重试')
  }

  let url: URL
  try {
    url = new URL(trimTrailingNoise(match[0]))
  } catch {
    throw new LinkParseError('唤取链接格式不正确,请重新复制完整链接')
  }

  // 云鸣潮把参数同时放在顶层 query 与 hash 各一份,hash 优先(research §1.4)
  const hashQuery = url.hash.includes('?') ? url.hash.slice(url.hash.indexOf('?') + 1) : ''
  const merged = new URLSearchParams(url.search)
  for (const [key, value] of new URLSearchParams(hashQuery)) {
    merged.set(key, value)
  }

  const missing: string[] = []
  const read = (key: RequiredKey): string => {
    const value = (merged.get(key) ?? '').trim()
    if (!value) missing.push(key)
    return value
  }
  const params = {
    svrId: read('svr_id'),
    playerId: read('player_id'),
    lang: read('lang'),
    gachaId: read('gacha_id'),
    gachaType: read('gacha_type'),
    svrArea: read('svr_area'),
    recordId: read('record_id'),
    resourcesId: read('resources_id'),
    platform: read('platform'),
  }
  if (missing.length > 0) {
    throw new LinkParseError(`唤取链接缺少参数:${missing.join('、')},请重新复制完整链接`)
  }

  return { ...params, region: detectRegion(url.hostname, params.svrArea) }
}

/** 判服以 host 为先(research §5);host 无法识别时(云鸣潮等)退回 svr_area */
function detectRegion(hostname: string, svrArea: string): ServerRegion {
  if (hostname.includes('aki-gm-resources-oversea') || hostname.includes('aki-game.net')) {
    return 'oversea'
  }
  if (hostname.includes('aki-gm-resources') || hostname.includes('aki-game.com')) {
    return 'cn'
  }
  if (svrArea === 'cn') return 'cn'
  if (svrArea) return 'oversea'
  throw new LinkParseError('无法识别链接所属服务器(国服/国际服)')
}
