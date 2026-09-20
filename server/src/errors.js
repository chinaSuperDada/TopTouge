/**
 * 业务错误。带上 HTTP 状态码与机器可读的 code，
 * 由 errorHandler 统一转成 { error: { code, message } }。
 */
class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
  }
}

const notFound = (message = '资源不存在') => new AppError('NOT_FOUND', message, 404)
const badRequest = (message, code = 'BAD_REQUEST') => new AppError(code, message, 400)
const validationFailed = (message) => new AppError('VALIDATION_FAILED', message, 400)

module.exports = { AppError, notFound, badRequest, validationFailed }
