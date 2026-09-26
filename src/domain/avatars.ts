/**
 * 头像/武器图标资产映射与缺图回退(ADR-0005)。
 *
 * 资产来源 ryanbenson/wuthering-waves-assets,构建期打包进 src/assets/roster/(256px PNG),
 * 文件名为 API 英文名的 PascalCase(如 `XiangliYao.png`);不在运行时请求远程图片。
 * 查找口径:resourceId(语言无关首选键)→ 名称兜底(中/英)→ null(组件回退字牌)。
 *
 * 收录口径:全部可抽取五星(角色 + 武器)。头像仅用于五星卡面(FiveStarCard /
 * FiveStarDetailStrip),四星与不可抽取的漂泊者各属性形态不收录。
 *
 * resourceId / 中英文名来源:Encore API(api-v2.encore.moe,游戏数据快照,
 * 2026-09-27 查证)——其 Id 与抽卡记录 resourceId 同为游戏物品 Id(样本交叉验证:
 * 抽卡返回 resourceId 21010043 ↔ API 同 Id「远行者长刃·辟路」,稀有度口径 3/4/5 一致),
 * 全表按语言无关 Id 精确命中,名称兜底仅在记录缺 Id 时生效。
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

/** 单条头像映射:物品资源 ID + 名称对照 + 打包资产文件名 */
export interface AvatarAssetEntry {
  /** 官方返回的物品资源 ID(数字字符串,语言无关;与抽卡记录 resourceId 精确比对) */
  resourceId: string
  /** 英文名(Encore API 返回值,与资产文件名对应的归一化匹配) */
  en: string
  /** 中文名(Encore API zh-Hans 返回值,与链接 lang 为中文时的记录名匹配) */
  zh: string
  /** 打包资产文件名(src/assets/roster/ 下) */
  file: string
}

/**
 * 打包资产映射表(92 项 = 44 名五星角色 + 48 把五星武器)。
 * Id/中英文名来自 Encore API 游戏数据快照(2026-09-27),按物品 Id 排序。
 *
 * 已知缺口(暂无可用图源,走回退字牌,待上游更新后补录):
 * - 21020107 沉冥(Unspoken Rue)
 * - 21050116 玉阙玄华(Blooming Jadehaven)
 */
export const AVATAR_ASSET_ENTRIES: readonly AvatarAssetEntry[] = [
  // ---- 角色(五星共鸣者;漂泊者不可抽取故不收录) ----
  { resourceId: '1104', en: 'Lingyang', zh: '凌阳', file: 'Lingyang.png' },
  { resourceId: '1105', en: 'Zhezhi', zh: '折枝', file: 'Zhezhi.png' },
  { resourceId: '1107', en: 'Carlotta', zh: '珂莱塔', file: 'Carlotta.png' },
  { resourceId: '1108', en: 'Hiyuki', zh: '绯雪', file: 'Hiyuki.png' },
  { resourceId: '1109', en: 'Lucilla', zh: '洛瑟菈', file: 'Lucilla.png' },
  { resourceId: '1110', en: 'Suisui', zh: '穗穗', file: 'Suisui.png' },
  { resourceId: '1203', en: 'Encore', zh: '安可', file: 'Encore.png' },
  { resourceId: '1205', en: 'Changli', zh: '长离', file: 'Changli.png' },
  { resourceId: '1206', en: 'Brant', zh: '布兰特', file: 'Brant.png' },
  { resourceId: '1207', en: 'Lupa', zh: '露帕', file: 'Lupa.png' },
  { resourceId: '1208', en: 'Galbrena', zh: '嘉贝莉娜', file: 'Galbrena.png' },
  { resourceId: '1209', en: 'Mornye', zh: '莫宁', file: 'Mornye.png' },
  { resourceId: '1210', en: 'Aemeath', zh: '爱弥斯', file: 'Aemeath.png' },
  { resourceId: '1211', en: 'Denia', zh: '达妮娅', file: 'Denia.png' },
  { resourceId: '1212', en: 'Jingran', zh: '景燃', file: 'Jingran.png' },
  { resourceId: '1301', en: 'Calcharo', zh: '卡卡罗', file: 'Calcharo.png' },
  { resourceId: '1302', en: 'Yinlin', zh: '吟霖', file: 'Yinlin.png' },
  { resourceId: '1304', en: 'Jinhsi', zh: '今汐', file: 'Jinhsi.png' },
  { resourceId: '1305', en: 'Xiangli Yao', zh: '相里要', file: 'XiangliYao.png' },
  { resourceId: '1306', en: 'Augusta', zh: '奥古斯塔', file: 'Augusta.png' },
  { resourceId: '1308', en: 'Rebecca', zh: '丽贝卡', file: 'Rebecca.png' },
  { resourceId: '1311', en: 'Hsin', zh: '心', file: 'Hsin.png' },
  { resourceId: '1312', en: 'Suoming', zh: '锁暝', file: 'Suoming.png' },
  { resourceId: '1404', en: 'Jiyan', zh: '忌炎', file: 'Jiyan.png' },
  { resourceId: '1405', en: 'Jianxin', zh: '鉴心', file: 'Jianxin.png' },
  { resourceId: '1407', en: 'Ciaccona', zh: '夏空', file: 'Ciaccona.png' },
  { resourceId: '1409', en: 'Cartethyia', zh: '卡提希娅', file: 'Cartethyia.png' },
  { resourceId: '1410', en: 'Iuno', zh: '尤诺', file: 'Iuno.png' },
  { resourceId: '1411', en: 'Qiuyuan', zh: '仇远', file: 'Qiuyuan.png' },
  { resourceId: '1412', en: 'Sigrika', zh: '西格莉卡', file: 'Sigrika.png' },
  { resourceId: '1413', en: 'Qingxiao', zh: '清宵', file: 'Qingxiao.png' },
  { resourceId: '1503', en: 'Verina', zh: '维里奈', file: 'Verina.png' },
  { resourceId: '1505', en: 'Shorekeeper', zh: '守岸人', file: 'Shorekeeper.png' },
  { resourceId: '1506', en: 'Phoebe', zh: '菲比', file: 'Phoebe.png' },
  { resourceId: '1507', en: 'Zani', zh: '赞妮', file: 'Zani.png' },
  { resourceId: '1508', en: 'Chisa', zh: '千咲', file: 'Chisa.png' },
  { resourceId: '1509', en: 'Lynae', zh: '琳奈', file: 'Lynae.png' },
  { resourceId: '1510', en: 'Luuk Herssen', zh: '陆·赫斯', file: 'LuukHerssen.png' },
  { resourceId: '1511', en: 'Lucy', zh: '露西', file: 'Lucy.png' },
  { resourceId: '1603', en: 'Camellya', zh: '椿', file: 'Camellya.png' },
  { resourceId: '1606', en: 'Roccia', zh: '洛可可', file: 'Roccia.png' },
  { resourceId: '1607', en: 'Cantarella', zh: '坎特蕾拉', file: 'Cantarella.png' },
  { resourceId: '1608', en: 'Phrolova', zh: '弗洛洛', file: 'Phrolova.png' },
  { resourceId: '1610', en: 'Yangyang: Xuanling', zh: '秧秧·玄翎', file: 'YangyangXuanling.png' },
  // ---- 武器(五星;文件名沿用上游仓库实际大小写) ----
  { resourceId: '21010015', en: 'Lustrous Razor', zh: '浩境粼光', file: 'LustrousRazor.png' },
  { resourceId: '21010016', en: 'Verdant Summit', zh: '苍鳞千嶂', file: 'VerdantSummit.png' },
  { resourceId: '21010026', en: 'Ages of Harvest', zh: '时和岁稔', file: 'AgesOfHarvest.png' },
  { resourceId: '21010036', en: 'Wildfire Mark', zh: '焰痕', file: 'WildfireMark.png' },
  { resourceId: '21010045', en: 'Radiance Cleaver', zh: '源能机锋', file: 'RadianceCleaver.png' },
  { resourceId: '21010046', en: 'Thunderflare Dominion', zh: '驭冕铸雷之权', file: 'ThunderflareDominion.png' },
  { resourceId: '21010056', en: 'Kumokiri', zh: '昙切', file: 'Kumokiri.png' },
  { resourceId: '21010066', en: 'Starfield Calibrator', zh: '宙算仪轨', file: 'StarfieldCalibrator.png' },
  { resourceId: '21010076', en: 'Thousandfold Deliverance', zh: '千般渡', file: 'ThousandfoldDeliverance.png' },
  { resourceId: '21020015', en: 'Emerald of Genesis', zh: '千古洑流', file: 'EmeraldOfGenesis.png' },
  { resourceId: '21020016', en: 'Blazing Brilliance', zh: '赫奕流明', file: 'BlazingBrilliance.png' },
  { resourceId: '21020026', en: 'Red Spring', zh: '裁春', file: 'RedSpring.png' },
  { resourceId: '21020036', en: 'Unflickering Valor', zh: '不灭航路', file: 'UnflickeringValor.png' },
  { resourceId: '21020045', en: 'Laser Shearer', zh: '镭射切变', file: 'LaserShearer.png' },
  { resourceId: '21020046', en: "Bloodpact's Pledge", zh: '血誓盟约', file: 'BloodpactsPledge.png' },
  { resourceId: '21020056', en: "Defier's Thorn", zh: '不屈命定之冠', file: 'DefiersThorn.png' },
  { resourceId: '21020066', en: 'Emerald Sentence', zh: '裁竹', file: 'EmeraldSentence.png' },
  { resourceId: '21020076', en: 'Everbright Polestar', zh: '永远的启明星', file: 'EverbrightPolestar.png' },
  { resourceId: '21020086', en: 'Frostburn', zh: '灼霜', file: 'Frostburn.png' },
  { resourceId: '21020096', en: 'Azure Oath', zh: '天之苍苍', file: 'AzureOath.png' },
  { resourceId: '21020106', en: 'Glint of Clouds', zh: '云琅', file: 'GlintOfClouds.png' },
  { resourceId: '21030015', en: 'Static Mist', zh: '停驻之烟', file: 'StaticMist.png' },
  { resourceId: '21030016', en: 'The Last Dance', zh: '死与舞', file: 'TheLastDance.png' },
  { resourceId: '21030026', en: 'Woodland Aria', zh: '林间的咏叹调', file: 'WoodlandAria.png' },
  { resourceId: '21030036', en: 'Lux & Umbra', zh: '光影双生', file: 'LuxUmbra.png' },
  { resourceId: '21030045', en: 'Phasic Homogenizer', zh: '相位涟漪', file: 'PhasicHomogenizer.png' },
  { resourceId: '21030046', en: 'Spectrum Blaster', zh: '溢彩荧辉', file: 'SpectrumBlaster.png' },
  { resourceId: '21030056', en: 'Spectral Trigger', zh: '蜃影', file: 'SpectralTrigger.png' },
  { resourceId: '21030066', en: 'Skull Thrasher', zh: '碎骨', file: 'SkullThrasher.png' },
  { resourceId: '21040015', en: 'Abyss Surges', zh: '擎渊怒涛', file: 'AbyssSurges.png' },
  { resourceId: '21040016', en: "Verity's Handle", zh: '诸方玄枢', file: 'VeritysHandle.png' },
  { resourceId: '21040026', en: 'Tragicomedy', zh: '悲喜剧', file: 'Tragicomedy.png' },
  { resourceId: '21040036', en: 'Blazing Justice', zh: '焰光裁定', file: 'BlazingJustice.png' },
  { resourceId: '21040045', en: 'Pulsation Bracer', zh: '脉冲协臂', file: 'PulsationBracer.png' },
  { resourceId: '21040046', en: "Moongazer's Sigil", zh: '万物持存的注释', file: 'MoongazersSigil.png' },
  { resourceId: '21040056', en: "Daybreaker's Spine", zh: '白昼之脊', file: 'DaybreakersSpine.png' },
  { resourceId: '21040066', en: 'Solsworn Ciphers', zh: '昭日译注', file: 'SolswornCiphers.png' },
  { resourceId: '21050015', en: 'Cosmic Ripples', zh: '漪澜浮录', file: 'CosmicRipples.png' },
  { resourceId: '21050016', en: 'Stringmaster', zh: '掣傀之手', file: 'Stringmaster.png' },
  { resourceId: '21050026', en: 'Rime-Draped Sprouts', zh: '琼枝冰绡', file: 'RimeDrapedSprouts.png' },
  { resourceId: '21050036', en: 'Stellar Symphony', zh: '星序协响', file: 'StellarSymphony.png' },
  { resourceId: '21050045', en: 'Boson Astrolabe', zh: '玻色星仪', file: 'BosonAstrolabe.png' },
  { resourceId: '21050046', en: 'Luminous Hymn', zh: '和光回唱', file: 'LuminousHymn.png' },
  { resourceId: '21050056', en: 'Whispers of Sirens', zh: '海的呢喃', file: 'WhispersofSirens.png' },
  { resourceId: '21050066', en: 'Lethean Elegy', zh: '幽冥的忘忧章', file: 'LetheanElegy.png' },
  { resourceId: '21050076', en: 'Forged Dwarf Star', zh: '赝作的矮星', file: 'ForgedDwarfStar.png' },
  { resourceId: '21050086', en: 'Freeze Frame', zh: '存帧', file: 'FreezeFrame.png' },
  { resourceId: '21050096', en: "Firstlight's Herald", zh: '栖霞饮露', file: 'FirstlightsHerald.png' },
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
