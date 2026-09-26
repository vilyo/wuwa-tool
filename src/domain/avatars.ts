/**
 * 头像/武器图标资产映射与缺图回退(ADR-0005)。
 *
 * 资产来源 ryanbenson/wuthering-waves-assets,构建期打包进 src/assets/roster/(256px PNG),
 * 文件名为 API 英文名的 PascalCase(如 `XiangliYao.png`);不在运行时请求远程图片。
 * 查找口径:resourceId(语言无关首选键)→ 名称兜底(中/英)→ null(组件回退字牌)。
 *
 * resourceId 来源说明:社区素材仓库不提供 resourceId 对应关系(2026-09-26 查证,
 * 仓库内无任何 ID↔名称数据文件),为避免错误数据污染显示,本表只收录有可靠出处的
 * resourceId;其余条目留空该字段,走名称兜底。取得可靠数据后在 AVATAR_ASSET_ENTRIES 补录。
 */

/** 构建期枚举打包资产(file 名 → 打包后 URL),由 import.meta.glob 保证文件真实存在 */
const modules = import.meta.glob('../assets/roster/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** 文件名 → 资产 URL(随包分发,离线可用) */
export const ROSTER_FILES: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([path, url]) => [path.replace(/^.*\//, ''), url]),
)

/** 单条头像映射:文件名 + 名称对照(+ 可靠 resourceId,若有) */
export interface AvatarAssetEntry {
  /** 官方返回的物品资源 ID(数字字符串,语言无关)。仅在来源可靠时填 */
  resourceId?: string
  /** 英文名(与资产文件名对应,大小写/空格不敏感匹配) */
  en: string
  /** 中文名;出处:定稿原型数据表或社区通识 */
  zh?: string
  /** 打包资产文件名(src/assets/roster/ 下) */
  file: string
}

/**
 * 打包资产映射表(26 项 = 21 张原型资产 + 5 张常驻武器图标)。
 * 中文名对照出处:docs/prototype/index.html 的 BASE_CHAR/武器演示数据表(项目内基准);
 * resourceId 一律留空(社区无可靠对应数据,宁缺勿滥,缺失走名称兜底)。
 */
export const AVATAR_ASSET_ENTRIES: readonly AvatarAssetEntry[] = [
  // ---- 角色(定稿原型 BASE_CHAR 全表) ----
  { en: 'Calcharo', zh: '卡卡罗', file: 'Calcharo.png' },
  { en: 'Chisa', zh: '千咲', file: 'Chisa.png' },
  { en: 'Denia', zh: '达妮娅', file: 'Denia.png' },
  { en: 'Encore', zh: '安可', file: 'Encore.png' },
  { en: 'Galbrena', zh: '嘉贝莉娜', file: 'Galbrena.png' },
  { en: 'Hsin', zh: '心', file: 'Hsin.png' },
  { en: 'Iuno', zh: '尤诺', file: 'Iuno.png' },
  { en: 'Jianxin', zh: '鉴心', file: 'Jianxin.png' },
  { en: 'Jingran', zh: '景燃', file: 'Jingran.png' },
  { en: 'Lingyang', zh: '凌阳', file: 'Lingyang.png' },
  { en: 'LuukHerssen', zh: '陆·赫斯', file: 'LuukHerssen.png' },
  { en: 'Lynae', zh: '琳奈', file: 'Lynae.png' },
  { en: 'Phrolova', zh: '弗洛洛', file: 'Phrolova.png' },
  { en: 'Qingxiao', zh: '清宵', file: 'Qingxiao.png' },
  { en: 'Sigrika', zh: '西格莉卡', file: 'Sigrika.png' },
  { en: 'Suoming', zh: '锁暝', file: 'Suoming.png' },
  { en: 'Verina', zh: '维里奈', file: 'Verina.png' },
  { en: 'XiangliYao', zh: '相里要', file: 'XiangliYao.png' },
  // ---- 武器(千般渡/存帧/碎骨出自原型武器池演示数据;常驻五星 2026-09-26 补齐,
  //      中文名对照 wuthering.gg 武器库 slug:emerald-of-genesis 等) ----
  { en: 'ThousandfoldDeliverance', zh: '千般渡', file: 'ThousandfoldDeliverance.png' },
  { en: 'FreezeFrame', zh: '存帧', file: 'FreezeFrame.png' },
  { en: 'SkullThrasher', zh: '碎骨', file: 'SkullThrasher.png' },
  { en: 'EmeraldOfGenesis', zh: '千古洑流', file: 'EmeraldOfGenesis.png' },
  { en: 'LustrousRazor', zh: '浩境粼光', file: 'LustrousRazor.png' },
  { en: 'StaticMist', zh: '停驻之烟', file: 'StaticMist.png' },
  { en: 'AbyssSurges', zh: '擎渊怒涛', file: 'AbyssSurges.png' },
  { en: 'CosmicRipples', zh: '漪澜浮录', file: 'CosmicRipples.png' },
]

/** 名称归一化键:小写、去除空格/分隔符/撇号等,供中英文名比对共用 */
export function normNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9一-鿿]/g, '')
}

/** 头像查询:与官方返回对齐的标识(resourceId 语言无关首选,name 兜底) */
export interface AvatarQuery {
  resourceId: string
  name: string
}

/** 建索引:resourceId 与归一化名称 → 资产文件名 */
export function avatarIndex(entries: readonly AvatarAssetEntry[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const entry of entries) {
    if (entry.resourceId) index.set(`id:${entry.resourceId}`, entry.file)
    index.set(`n:${normNameKey(entry.en)}`, entry.file)
    if (entry.zh) index.set(`n:${normNameKey(entry.zh)}`, entry.file)
  }
  return index
}

/** 查文件名:resourceId 命中优先,否则名称兜底;都查不到返回 null(缺图回退字牌) */
export function resolveAvatarFile(index: Map<string, string>, query: AvatarQuery): string | null {
  if (query.resourceId) {
    const byId = index.get(`id:${query.resourceId}`)
    if (byId) return byId
  }
  const name = query.name.trim()
  if (name) {
    const byName = index.get(`n:${normNameKey(name)}`)
    if (byName) return byName
  }
  return null
}

const SHIPPED_INDEX = avatarIndex(AVATAR_ASSET_ENTRIES)

/** 查打包资产 URL:查得到返回 URL,查不到返回 null(组件据此回退字牌) */
export function resolveAvatarUrl(query: AvatarQuery): string | null {
  const file = resolveAvatarFile(SHIPPED_INDEX, query)
  return file ? (ROSTER_FILES[file] ?? null) : null
}

/**
 * 属性/武器类型色标:取定稿原型 docs/prototype/index.html 的 EL 表
 * (v11 设计系统未定义逐属性 token,视觉基准以原型为准;非属性色一律走 v11 tokens)。
 * 未知属性返回 undefined,组件回退到 --accent。
 */
const ELEMENT_COLORS: Record<string, string> = {
  衍射: '#C29A3A',
  气动: '#3FA383',
  湮灭: '#B85A72',
  热熔: '#CE6435',
  冷凝: '#5493CC',
  导电: '#9273D6',
  长刃: '#7E8B99',
  迅刀: '#7E8B99',
  佩枪: '#7E8B99',
  臂铠: '#7E8B99',
  音感仪: '#7E8B99',
  武器: '#7E8B99',
}

/** 已知属性/武器类型 → 色值;未知 → undefined */
export function elementColor(element: string | undefined): string | undefined {
  if (!element) return undefined
  return ELEMENT_COLORS[element.trim()]
}
