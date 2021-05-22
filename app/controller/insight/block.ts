import { Controller, CustomContextForBlockFilter } from 'egg'
import { Block } from 'vipsinfo/lib'

import { BlockObject } from '@/app/service/block'

export interface IInsightBlockController extends Controller {
  block(): Promise<void>
  blockIndex(): Promise<void>
  rawBlock(): Promise<void>
  list(): Promise<void>
}

const DEFAULT_LIMIT = 200

class BlockController extends Controller implements IInsightBlockController {
  async block(): Promise<void> {
    const ctx = this.ctx as CustomContextForBlockFilter
    let arg: Buffer | string = ctx.params.block
    ctx.assert(arg, 404)
    if (/^[0-9a-f]{64}$/i.test(arg)) {
      arg = Buffer.from(arg, 'hex')
    } else {
      ctx.throw(400)
    }
    let block = await ctx.service.block.getBlock(arg)
    ctx.assert(block, 404)
    block = block as BlockObject
    ctx.body = {
      hash: block.hash.toString('hex'),
      size: block.size,
      height: block.height,
      version: block.version,
      merkleroot: block.merkleRoot.toString('hex'),
      tx: block.transactions.map((id) => id.toString('hex')),
      time: block.timestamp,
      nonce: block.nonce,
      bits: block.bits.toString(16),
      difficulty: block.difficulty,
      chainwork: block.chainwork.toString(16).padStart(64, '0'),
      confirmations:
        (this.app.blockchainInfo.tip?.height as number) - block.height + 1,
      previousblockhash: block.prevHash.toString('hex'),
      ...(block.nextHash ? { nextblockhash: block.nextHash.toString('hex') } : {}),
      hashStateRoot: block.hashStateRoot.toString('hex'),
      hashUTXORoot: block.hashUTXORoot.toString('hex'),
      prevOutStakeHash: block.stakePrevTxId.toString('hex'),
      prevOutStakeN: block.stakeOutputIndex,
      signature: block.signature.toString('hex'),
      flags: block.proofOfStake ? 'proof-of-stake' : 'proof-of-work',
      reward: Number(block.reward) / 1e8,
      minedBy: block.miner,
    }
  }

  async blockIndex(): Promise<void> {
    const ctx = this.ctx as CustomContextForBlockFilter
    let arg: string | number = ctx.params.block
    ctx.assert(arg, 404)
    if (/^(0|[1-9]\d{0,9})$/.test(arg)) {
      arg = Number.parseInt(arg)
    } else {
      ctx.throw(400)
    }
    let block = await ctx.service.block.getBlock(arg)
    ctx.assert(block, 404)
    block = block as BlockObject
    ctx.body = {
      blockHash: block.hash.toString('hex'),
    }
  }

  async rawBlock(): Promise<void> {
    const ctx = this.ctx as CustomContextForBlockFilter
    let arg: Buffer | string | number = ctx.params.block
    ctx.assert(arg, 404)
    if (/^[0-9a-f]{64}$/i.test(arg)) {
      arg = Buffer.from(arg, 'hex')
    } else {
      ctx.throw(400)
    }
    let block = await ctx.service.block.getRawBlock(arg)
    ctx.assert(block, 404)
    block = block as Block
    ctx.body = {
      rawblock: block.toBuffer().toString('hex'),
    }
  }

  async list(): Promise<void> {
    const { ctx } = this
    let dateStr = ctx.query.blockDate
    const limit = parseInt(ctx.query.limit || `${DEFAULT_LIMIT}`)

    const d = new Date()
    const yyyy = d.getUTCFullYear().toString()
    const mm = (d.getUTCMonth() + 1).toString()
    const dd = d.getUTCDate().toString()
    const todayStr = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
    let isToday: boolean
    if (dateStr) {
      const datePattern = /[0-9]{4}-[0-1][0-9]-[0-3][0-9]/
      if (!datePattern.test(dateStr)) {
        ctx.throw('Please use yyyy-mm-dd format and valid date', 400)
        return
      }
      isToday = dateStr === todayStr
    } else {
      isToday = true
      dateStr = todayStr
    }

    const min = Math.floor(Date.parse(dateStr) / 1000)
    const max = parseInt(ctx.query.startTimestamp) || min + 86400 // 24 * 60 * 60
    const prev = new Date((min - 86400) * 1000)
    const next = max ? new Date(max * 1000) : null

    const { blocks } = await ctx.service.block.listBlocks({ min, max })
    const more = blocks.length > limit
    const moreTs = max

    ctx.body = {
      blocks: blocks
        .map((block) => ({
          height: block.height,
          size: block.size,
          hash: block.hash.toString('hex'),
          time: block.timestamp,
          txlength: block.transactionsCount,
          minedBy: block.miner,
        }))
        .slice(0, limit),
      length: blocks.length < limit ? blocks.length : limit,
      pagination: {
        next,
        prev,
        currentTs: max - 1,
        current: dateStr,
        isToday,
        more,
        ...(more ? { moreTs } : {}),
      },
    }
  }
}

export default BlockController
