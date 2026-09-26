import { describe, expect, it } from 'vitest'
import { DomainError, NetworkError } from '@/domain/errors'
import { toGachaError } from './tauriPorts'

describe('gacha_query 错误映射', () => {
  it('kind=network 的命令错误映射为可重试的 NetworkError', () => {
    const error = toGachaError({ kind: 'network', message: '官方接口响应异常(HTTP 502)' })

    expect(error).toBeInstanceOf(NetworkError)
    expect(error.message).toBe('官方接口响应异常(HTTP 502)')
  })

  it('kind=fatal 的命令错误映射为确定性 DomainError,不参与重试', () => {
    const error = toGachaError({ kind: 'fatal', message: '未知的服区标识:jp' })

    expect(error).toBeInstanceOf(DomainError)
    expect(error).not.toBeInstanceOf(NetworkError)
    expect(error.message).toBe('未知的服区标识:jp')
  })

  it('形状不明的拒绝(命令缺失等)按确定性失败处理,不误重试', () => {
    const error = toGachaError('Command gacha_query not found')

    expect(error).toBeInstanceOf(DomainError)
    expect(error).not.toBeInstanceOf(NetworkError)
  })
})
