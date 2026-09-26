/** 领域错误基类:UI 层按类型决定文案与处理方式 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

/** 链接无法解析(输入中没有有效链接 / 参数缺失 / 不合法) */
export class LinkParseError extends DomainError {
  constructor(message: string) {
    super(message)
    this.name = 'LinkParseError'
  }
}

/** 官方接口 code != 0:唤取链接已失效,判定失败且不重试(research §3.2) */
export class LinkInvalidError extends DomainError {
  constructor(message = '唤取链接已失效,请重新打开游戏内「唤取记录」页后重试') {
    super(message)
    this.name = 'LinkInvalidError'
  }
}

/** 网络类失败(超时、断网、返回体异常),可按限次重试 */
export class NetworkError extends DomainError {
  constructor(message = '网络请求失败,请检查网络后重试') {
    super(message)
    this.name = 'NetworkError'
  }
}
