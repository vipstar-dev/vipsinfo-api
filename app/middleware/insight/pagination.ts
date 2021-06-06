import { CustomContextForPagination } from 'egg'

import {
  PaginationConstructor,
  PaginationObject,
} from '@/app/middleware/original/pagination'

export default function pagination(
  { defaultPageSize }: PaginationConstructor = { defaultPageSize: 1000 }
) {
  return async (ctx: CustomContextForPagination, next: CallableFunction) => {
    if (!['GET', 'POST'].includes(ctx.method)) {
      await next()
      return
    }
    const paginationObject: Pick<PaginationObject, 'from' | 'to'> = {
      GET: ctx.query as Pick<PaginationObject, 'from' | 'to'>,
      POST: ctx.request.body as Pick<PaginationObject, 'from' | 'to'>,
    }[ctx.method as 'GET' | 'POST']
    let offset: number, limit: number
    if (paginationObject.from && paginationObject.to) {
      offset = parseInt(paginationObject.from) || 0
      limit = parseInt(paginationObject.to) - offset || defaultPageSize
      if (offset < 0) offset = 0
      if (limit < 0) limit = defaultPageSize
    } else {
      offset = 0
      limit = defaultPageSize
    }
    ctx.state.pagination = { limit, offset, reversed: undefined }
    await next()
  }
}
