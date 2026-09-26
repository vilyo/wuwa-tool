/** 卡池 code → 官方池名(仅展示用)。code 为开放式枚举 1..=13,未知 code 容错兜底(D3) */
const POOL_LABELS: Record<number, string> = {
  1: '角色精准调谐',
  2: '武器精准调谐',
  3: '角色常驻调谐',
  4: '武器常驻调谐',
  5: '新手调谐',
  6: '新手自选调谐',
  7: '感恩定向调谐',
  8: '角色新旅调谐',
  9: '武器新旅调谐',
  10: '角色联动调谐',
  11: '武器联动调谐',
  12: '角色忆旅调谐',
  13: '武器忆旅调谐',
}

export function poolLabel(code: number): string {
  return POOL_LABELS[code] ?? `未收录调谐池 ${code}`
}
