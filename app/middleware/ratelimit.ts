import { Application } from 'egg'
import Ratelimit, { MiddlewareOptions } from 'koa-ratelimit'

interface WhiteListAnyMiddlewareOptions extends MiddlewareOptions {
  whitelist: any
}

export interface CustomMiddlewareOptions extends WhiteListAnyMiddlewareOptions {
  whitelist: string[]
}

export default function ratelimit(
  options: CustomMiddlewareOptions,
  app: Application
) {
  return Ratelimit({
    ...options,
    id: (ctx) =>
      `${app.name}-${
        ctx.get('cf-conecting-ip') || ctx.get('x-forwarded-for') || ctx.ip
      }`,
    whitelist:
      options.whitelist &&
      ((ctx) =>
        options.whitelist.includes(
          ctx.get('cf-connecting-ip') || ctx.get('x-forwarded-for') || ctx.ip
        ) || options.whitelist.includes(ctx.get('application-id'))),
  })
}
