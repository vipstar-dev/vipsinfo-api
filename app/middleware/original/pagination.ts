import { CustomContextForPagination } from 'egg'

export interface PaginationObject {
  limit?: string
  offset?: string
  pageSize?: string
  pageIndex?: string
  page?: string
  from?: string
  to?: string
  reversed: boolean | string | number
  [key: string]: any
}

export interface PaginationConstructor {
  defaultPageSize: number
}

export default function pagination(
  { defaultPageSize }: PaginationConstructor = { defaultPageSize: 100 }
) {
  return async (ctx: CustomContextForPagination, next: CallableFunction) => {
    if (!['GET', 'POST'].includes(ctx.method)) {
      await next()
      return
    }
    const paginationObject: PaginationObject = {
      GET: ctx.query as PaginationObject,
      POST: ctx.request.body as PaginationObject,
    }[ctx.method as 'GET' | 'POST']
    let limit = defaultPageSize
    let offset = 0
    let reversed: boolean | undefined
    if ('limit' in paginationObject && 'offset' in paginationObject) {
      limit = Number.parseInt(paginationObject.limit as string)
      offset = Number.parseInt(paginationObject.offset as string)
    }
    if ('pageSize' in paginationObject && 'pageIndex' in paginationObject) {
      const pageSize = Number.parseInt(paginationObject.pageSize as string)
      const pageIndex = Number.parseInt(paginationObject.pageIndex as string)
      limit = pageSize
      offset = pageSize * pageIndex
    }
    if ('pageSize' in paginationObject && 'page' in paginationObject) {
      const pageSize = Number.parseInt(paginationObject.pageSize as string)
      const pageIndex = Number.parseInt(paginationObject.page as string)
      limit = pageSize
      offset = pageSize * pageIndex
    }
    if ('from' in paginationObject && 'to' in paginationObject) {
      const from = Number.parseInt(paginationObject.from as string)
      const to = Number.parseInt(paginationObject.to as string)
      limit = to - from + 1
      offset = from
    }
    ctx.assert(limit > 0 && offset >= 0, 400)
    if ('reversed' in paginationObject) {
      reversed = ![false, 'false', 0, '0'].includes(paginationObject.reversed)
    }
    ctx.state.pagination = { limit, offset, reversed }
    await next()
  }
}
