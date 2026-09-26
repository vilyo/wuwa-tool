/**
 * 常驻五星名单与「歪」判定(ADR-0002:常驻名单反向判定)。
 *
 * 口径:抽到名单内的五星 = 歪(true);名单外 = 当期 UP(false);
 * 名单与映射都无法识别(无可比对名称等)= 'unknown',标「未知」不计入歪率。
 * 歪率仅对角色系限定池(1/8/10/12)计算;武器系限定池(2/9/11/13)必中 UP。
 *
 * 更新口径:仅在官方把角色/武器并入常驻池时增补条目(条目随应用分发,
 * 与 #01 应用版本一同更新);不确定的条目宁缺勿滥,勿凭印象添加。
 */
import type { GachaRecord } from './records'
import { normNameKey } from './avatars'

/** 常驻名单条目:名称双语对照;resourceId 仅在来源可靠时填(当前社区无可靠对应数据) */
export interface StandardRosterEntry {
  /** 官方物品资源 ID(数字字符串)。判定时 resourceId 精确比对优先 */
  resourceId?: string
  /** 中文名(链接 lang 为中文时 API 返回名) */
  zh: string
  /** 英文名(链接 lang 为英文时 API 返回名) */
  en: string
  /** 类别:与记录 resourceType(「角色」/「武器」)比对,不符不命中 */
  kind: 'resonator' | 'weapon'
}

/**
 * 当前常驻调谐池(code 3 角色常驻 / code 4 武器常驻)可获得的五星。
 *
 * - 角色 6 名:维里奈/安可/卡卡罗/凌阳/鉴心(开服常驻)+ 相里要(官方后续并入;
 *   定稿原型 BASE_CHAR/SIM_POOL.standard 名单即按此六人标注「歪 · 常驻名单」)。
 *   中英文名为社区通识对照。
 * - 武器 5 把:开服常驻五星武器,中英文对照经 wuthering.gg 武器库
 *   slug 核对(emerald-of-genesis / lustrous-razor / static-mist / abyss-surges /
 *   cosmic-ripples ↔ 千古洑流/浩境粼光/停驻之烟/漪澜浮录/擎渊怒涛)。
 * - resourceId 字段:社区开源素材仓库不含 resourceId↔名称数据(2026-09-26 查证),
 *   为避免错误数据污染判定,暂不填;官方/可靠社区数据可得后补录。
 */
export const STANDARD_ROSTER: readonly StandardRosterEntry[] = [
  { zh: '维里奈', en: 'Verina', kind: 'resonator' },
  { zh: '安可', en: 'Encore', kind: 'resonator' },
  { zh: '卡卡罗', en: 'Calcharo', kind: 'resonator' },
  { zh: '凌阳', en: 'Lingyang', kind: 'resonator' },
  { zh: '鉴心', en: 'Jianxin', kind: 'resonator' },
  { zh: '相里要', en: 'Xiangli Yao', kind: 'resonator' },
  { zh: '千古洑流', en: 'Emerald of Genesis', kind: 'weapon' },
  { zh: '浩境粼光', en: 'Lustrous Razor', kind: 'weapon' },
  { zh: '停驻之烟', en: 'Static Mist', kind: 'weapon' },
  { zh: '擎渊怒涛', en: 'Abyss Surges', kind: 'weapon' },
  { zh: '漪澜浮录', en: 'Cosmic Ripples', kind: 'weapon' },
]

/** 判定结论:名单内 = true(歪)/ 名单外 = false(当期 UP)/ 无法识别 = 'unknown' */
export type StandardRosterVerdict = true | false | 'unknown'

/** 记录 resourceType(「角色」/「武器」)→ 名单类别;未知 resourceType 不设限 */
const KIND_BY_RESOURCE_TYPE: Record<string, StandardRosterEntry['kind']> = {
  角色: 'resonator',
  武器: 'weapon',
}

/**
 * 常驻名单反向判定(供 #07 统计消费)。
 * 名称可比对时给确定性结论;名称缺失且 resourceId 无对应时一律 'unknown',
 * 不武断判 UP(错误数据会让歪率失真,宁标未知)。
 */
export function isStandardRosterItem(
  record: Pick<GachaRecord, 'resourceId' | 'name' | 'resourceType'>,
): StandardRosterVerdict {
  const expectedKind = KIND_BY_RESOURCE_TYPE[record.resourceType]
  const nameKey = normNameKey(record.name)
  for (const entry of STANDARD_ROSTER) {
    if (expectedKind && entry.kind !== expectedKind) continue
    if (entry.resourceId && record.resourceId && entry.resourceId === record.resourceId) return true
    if (nameKey && (normNameKey(entry.zh) === nameKey || normNameKey(entry.en) === nameKey)) {
      return true
    }
  }
  // 名单内无命中:名称可比对 → 名单外(UP);否则信息不足 → 未知
  return nameKey ? false : 'unknown'
}
