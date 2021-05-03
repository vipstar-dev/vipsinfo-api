import { CustomContextForBlockFilter } from 'egg'
import { Op } from 'sequelize'
import Header from 'vipsinfo/node/models/header'
const { gte: $gte, lte: $lte } = Op

interface BlockFilterObject {
  fromBlock?: string
  toBlock?: string
  fromTime?: string
  toTime?: string
  [key: string]: any
}

export default function blockFilter() {
  return async (ctx: CustomContextForBlockFilter, next: CallableFunction) => {
    if (!['GET', 'POST'].includes(ctx.method)) {
      await next()
      return
    }
    let fromBlock: number = 1
    let toBlock: number | null = null
    const blockFilterObject: BlockFilterObject = {
      GET: ctx.query as BlockFilterObject,
      POST: ctx.request.body as BlockFilterObject,
    }[ctx.method as 'GET' | 'POST']
    if ('fromBlock' in blockFilterObject) {
      const height = Number.parseInt(blockFilterObject.fromBlock as string)
      ctx.assert(height >= 0 && height <= 0xffffffff, 400)
      if (height > fromBlock) {
        fromBlock = height
      }
    }
    if ('toBlock' in blockFilterObject) {
      const height = Number.parseInt(blockFilterObject.toBlock as string)
      ctx.assert(height >= 0 && height <= 0xffffffff, 400)
      toBlock = height
    }
    if ('fromTime' in blockFilterObject) {
      const timestamp = Math.floor(
        Date.parse(blockFilterObject.fromTime as string) / 1000
      )
      ctx.assert(timestamp >= 0 && timestamp <= 0xffffffff, 400)
      const header = await Header.findOne({
        where: { timestamp: { [$gte]: timestamp } },
        attributes: ['height'],
        order: [['timestamp', 'ASC']],
        transaction: ctx.state.transaction,
      })
      if (header && header.height > fromBlock) {
        fromBlock = header.height
      }
    }
    if ('toTime' in blockFilterObject) {
      const timestamp = Math.floor(Date.parse(blockFilterObject.toTime as string) / 1000)
      ctx.assert(timestamp >= 0 && timestamp <= 0xffffffff, 400)
      const header = await Header.findOne({
        where: { timestamp: { [$lte]: timestamp } },
        attributes: ['height'],
        order: [['timestamp', 'DESC']],
        transaction: ctx.state.transaction,
      })
      if (header && (toBlock == null || header.height < toBlock)) {
        toBlock = header.height
      }
    }
    ctx.state.fromBlock = fromBlock
    ctx.state.toBlock = toBlock
    await next()
  }
}
