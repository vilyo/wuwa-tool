import { describe, expect, it } from 'vitest'
import { DomainError } from './errors'
import type { GachaRecord } from './records'
import {
  BACKUP_FORMAT_VERSION,
  buildBackup,
  exportBackup,
  importBackup,
  parseBackup,
  serializeBackup,
  type BackupFilePort,
  type BackupStoragePort,
} from './backup'

function record(overrides: Partial<GachaRecord> = {}): GachaRecord {
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

/** 伪造文件端口:内存 Map 模拟磁盘(不测真实文件系统) */
function fakeFilePort() {
  const files = new Map<string, string>()
  const file: BackupFilePort = {
    async writeTextFile(path, contents) {
      files.set(path, contents)
    },
    async readTextFile(path) {
      const text = files.get(path)
      if (text === undefined) throw new Error(`文件不存在:${path}`)
      return text
    },
  }
  return { files, file }
}

/** 伪造存储端口:按 player_id 分桶的内存库,贴近真实 SQLite 档案隔离 */
function fakeStorage() {
  const db = new Map<string, GachaRecord[]>()
  const storage: BackupStoragePort = {
    async loadRecords(playerId) {
      return [...(db.get(playerId) ?? [])]
    },
    async insertRecords(playerId, batch) {
      const rows = db.get(playerId) ?? []
      rows.push(...batch)
      db.set(playerId, rows)
      return batch.length
    },
  }
  return { db, storage }
}

describe('备份文件格式(#12)', () => {
  const records = [
    record(),
    record({ cardPoolType: 2, cardPoolId: null, name: '千古洑流', qualityLevel: 5, resourceType: '武器', resourceId: '21050027' }),
  ]

  it('导出文件含版本号、UID、导出时间与全字段记录', () => {
    const file = buildBackup('106485288', records, '2026-09-26T08:00:00.000Z')
    const parsed = JSON.parse(serializeBackup(file)) as Record<string, unknown>

    expect(parsed['app']).toBe('wuwatool')
    expect(parsed['version']).toBe(BACKUP_FORMAT_VERSION)
    expect(parsed['playerId']).toBe('106485288')
    expect(parsed['exportedAt']).toBe('2026-09-26T08:00:00.000Z')
    const rows = parsed['records'] as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    // 全字段落盘(D2 口径):cardPoolType/cardPoolId/time/name/qualityLevel/resourceId/resourceType
    expect(rows[0]).toEqual({
      cardPoolType: 1,
      cardPoolId: 100074,
      time: '2025-05-01 10:00:00',
      name: '长离',
      qualityLevel: 5,
      resourceId: '21010043',
      resourceType: '角色',
    })
  })

  it('parseBackup:合法备份解析回来与原档案一致', () => {
    const text = serializeBackup(buildBackup('106485288', records, '2026-09-26T08:00:00.000Z'))
    const parsed = parseBackup(text)

    expect(parsed.playerId).toBe('106485288')
    expect(parsed.version).toBe(BACKUP_FORMAT_VERSION)
    expect(parsed.records).toEqual(records)
  })

  it('parseBackup:容错可选字段缺失(cardPoolId/resourceId/resourceType 兜底)', () => {
    const text = JSON.stringify({
      app: 'wuwatool',
      version: BACKUP_FORMAT_VERSION,
      playerId: '106485288',
      exportedAt: '2026-09-26T08:00:00.000Z',
      records: [{ cardPoolType: 1, time: '2025-05-01 10:00:00', name: '长离', qualityLevel: 5 }],
    })

    expect(parseBackup(text).records).toEqual([
      {
        cardPoolType: 1,
        cardPoolId: null,
        time: '2025-05-01 10:00:00',
        name: '长离',
        qualityLevel: 5,
        resourceId: '',
        resourceType: '',
      },
    ])
  })

  it.each([
    ['不是 JSON', 'not json', 'JSON'],
    [
      'app 标记不符',
      JSON.stringify({ app: 'other', version: 1, playerId: '1', records: [] }),
      '鸣潮工具箱',
    ],
    [
      '版本过新',
      JSON.stringify({ app: 'wuwatool', version: BACKUP_FORMAT_VERSION + 1, playerId: '1', records: [] }),
      '版本',
    ],
    [
      '缺 UID',
      JSON.stringify({ app: 'wuwatool', version: BACKUP_FORMAT_VERSION, records: [] }),
      'UID',
    ],
    [
      'records 非数组',
      JSON.stringify({ app: 'wuwatool', version: BACKUP_FORMAT_VERSION, playerId: '1', records: 'x' }),
      '记录',
    ],
    [
      '记录缺去重键字段',
      JSON.stringify({
        app: 'wuwatool',
        version: BACKUP_FORMAT_VERSION,
        playerId: '1',
        records: [{ time: '2025-05-01 10:00:00', name: '长离' }],
      }),
      '记录',
    ],
  ])('parseBackup 拒绝:%s', (_label, text, fragment) => {
    expect(() => parseBackup(text)).toThrow(DomainError)
    expect(() => parseBackup(text)).toThrow(fragment)
  })
})

describe('导入合并语义(#12):同一去重键 time+name+qualityLevel+cardPoolType', () => {
  it('按去重键只增不减:同键异 cardPoolId 的记录不算新增,只写新增部分', async () => {
    const { file } = fakeFilePort()
    const { db, storage } = fakeStorage()
    const existing = [record({ resourceId: '旧资源id' })]
    db.set('106485288', existing)
    // 备份含 1 条重复(同键、cardPoolId 不同)+ 1 条新记录
    const backupRecords = [
      record({ cardPoolId: 999999 }),
      record({ time: '2025-05-02 11:00:00', name: '折枝' }),
    ]
    await file.writeTextFile('/backup.json', serializeBackup(buildBackup('106485288', backupRecords, '2026-09-26T08:00:00.000Z')))

    const result = await importBackup({ file, storage }, '/backup.json')

    expect(result.playerId).toBe('106485288')
    expect(result.added).toEqual([record({ time: '2025-05-02 11:00:00', name: '折枝' })])
    expect(result.total).toBe(2)
    expect(db.get('106485288')).toHaveLength(2)
    // 既有记录不被备份内容覆盖
    expect(db.get('106485288')![0]!.resourceId).toBe('旧资源id')
  })

  it('导入合并入备份所属 UID 的档案,不污染其他档案', async () => {
    const { file } = fakeFilePort()
    const { db, storage } = fakeStorage()
    db.set('42', [record({ time: '2025-01-01 00:00:00', name: '他人' })])
    await file.writeTextFile('/backup.json', serializeBackup(buildBackup('106485288', [record()], '2026-09-26T08:00:00.000Z')))

    await importBackup({ file, storage }, '/backup.json')

    expect(db.get('106485288')).toHaveLength(1)
    expect(db.get('42')).toHaveLength(1)
    expect(db.get('42')![0]!.name).toBe('他人')
  })

  it('重复导入幂等:二次导入新增 0 条', async () => {
    const { file } = fakeFilePort()
    const { storage } = fakeStorage()
    await file.writeTextFile('/backup.json', serializeBackup(buildBackup('106485288', [record()], '2026-09-26T08:00:00.000Z')))

    const first = await importBackup({ file, storage }, '/backup.json')
    const second = await importBackup({ file, storage }, '/backup.json')

    expect(first.added).toHaveLength(1)
    expect(second.added).toHaveLength(0)
    expect(second.total).toBe(1)
  })
})

describe('往返一致(#12):导出 → 清库 → 导入 → 再导出,内容一致', () => {
  it('伪造端口下全流程记录无损', async () => {
    const files = new Map<string, string>()
    const file: BackupFilePort = {
      async writeTextFile(path, contents) {
        files.set(path, contents)
      },
      async readTextFile(path) {
        const text = files.get(path)
        if (text === undefined) throw new Error(`文件不存在:${path}`)
        return text
      },
    }
    const { db, storage } = fakeStorage()
    const original = [
      record(),
      record({ time: '2025-05-02 11:30:00', name: '折枝', qualityLevel: 4, resourceId: '21050012' }),
      record({ cardPoolType: 5, cardPoolId: null, time: '2025-05-03 09:00:00', name: '凌阳', resourceType: '角色' }),
    ]
    db.set('106485288', original)

    // 第一次导出
    await exportBackup({ file }, '/backup-1.json', '106485288', original, '2026-09-26T08:00:00.000Z')
    // 模拟数据丢失:清库后从备份恢复
    db.clear()
    const restored = await importBackup({ file, storage }, '/backup-1.json')
    expect(restored.playerId).toBe('106485288')
    expect(restored.added).toHaveLength(3)
    // 再导出:除导出时间外,UID 与记录内容与第一次完全一致
    const second = await storage.loadRecords('106485288')
    await exportBackup({ file }, '/backup-2.json', '106485288', second, '2026-09-27T08:00:00.000Z')

    const firstFile = parseBackup(files.get('/backup-1.json')!)
    const secondFile = parseBackup(files.get('/backup-2.json')!)
    expect(secondFile.playerId).toBe(firstFile.playerId)
    expect(secondFile.records).toEqual(firstFile.records)
  })
})
