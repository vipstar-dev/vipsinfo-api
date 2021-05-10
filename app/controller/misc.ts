import { Controller } from 'egg'

import { PricesObject } from '@/app/service/misc'

export interface IMiscController extends Controller {
  classify(): Promise<void>
  richList(): Promise<void>
  biggestMiners(): Promise<void>
  prices(): Promise<void>
}

class MiscController extends Controller implements IMiscController {
  async classify(): Promise<void> {
    const { ctx } = this
    ctx.body = await ctx.service.misc.classify(ctx.query.query)
  }

  async richList(): Promise<void> {
    const { ctx } = this
    const { totalCount, list } = await ctx.service.balance.getRichList()
    ctx.body = {
      totalCount,
      list: list.map((item) => ({
        address: item.address,
        balance: item.balance.toString(),
      })),
    }
  }

  async biggestMiners(): Promise<void> {
    const { ctx } = this
    let lastNBlocks = null
    if (ctx.query.blocks && /^[1-9]\d*$/.test(ctx.query.blocks)) {
      lastNBlocks = Number.parseInt(ctx.query.blocks)
    }
    const { totalCount, list } = await ctx.service.block.getBiggestMiners(
      lastNBlocks
    )
    ctx.body = {
      totalCount,
      list: list.map((item) => ({
        address: item.address,
        blocks: item.blocks,
        balance: item.balance.toString(),
      })),
    }
  }

  async prices(): Promise<void> {
    this.ctx.body = JSON.parse(
      (await this.app.redis.hget(this.app.name, 'vips-price')) as string
    ) as PricesObject
  }
}

export default MiscController
