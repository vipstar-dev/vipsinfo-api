import { Controller, CustomContextForTransaction } from 'egg'
import { Error, Transaction as SequelizeTransaction } from 'sequelize'
import { Address as RawAddress, IAddress, Transaction } from 'vipsinfo/lib'
import Address from 'vipsinfo/node/models/address'

import { BlockObject } from '@/app/service/block'
import {
  TransactionObject,
  TransformedInsightTransactionObject,
} from '@/app/service/transaction'

export interface IInsightTransactionController {
  transaction(): Promise<void>
  rawTransaction(): Promise<void>
  list(): Promise<void>
  send(): Promise<void>
}

class TransactionController
  extends Controller
  implements IInsightTransactionController {
  async transaction(): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    ctx.assert(ctx.params.id && /^[0-9a-f]{64}$/i.test(ctx.params.id), 404)
    const id = Buffer.from(ctx.params.id as string, 'hex')
    const transaction = await ctx.service.transaction.getTransaction(id)
    ctx.assert(transaction, 404)
    ctx.body = await ctx.service.transaction.transformInsightTransaction(
      transaction as TransactionObject
    )
  }

  async rawTransaction(): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    ctx.assert(ctx.params.id && /^[0-9a-f]{64}$/.test(ctx.params.id), 404)
    const id = Buffer.from(ctx.params.id as string, 'hex')
    const transaction = await ctx.service.transaction.getRawTransaction(id)
    ctx.assert(transaction, 404)
    ctx.body = {
      rawtx: (transaction as Transaction).toBuffer().toString('hex'),
    }
  }

  async list(): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    const blockHash = ctx.query.block
    const addressStr = ctx.query.address
    const page = parseInt(ctx.query.pageNum) || 0
    const pageLength = 10
    const start = page * pageLength
    let pagesTotal = 1
    let totalTxs = 0

    let txids: Buffer[] = []
    const txs: TransformedInsightTransactionObject[] = []

    if (blockHash) {
      let block = await ctx.service.block.getBlock(
        Buffer.from(blockHash, 'hex')
      )
      ctx.assert(block, 404, 'Not Found')
      block = block as BlockObject
      totalTxs = block.transactions.length
      txids = block.transactions.slice(start, start + pageLength)
    } else if (addressStr) {
      const rawAddresses: IAddress[] = []
      try {
        const chain = ctx.app.chain()
        const rawAddress = RawAddress.fromString(addressStr, chain) as IAddress
        if (!rawAddress) throw null
        rawAddresses.push(rawAddress)
      } catch (err) {
        ctx.throw('Not Found', 404)
        return
      }
      const result = await Address.findAll({
        where: { string: addressStr },
        attributes: ['_id'],
        transaction: ctx.state.transaction,
      })
      if (!result) {
        ctx.throw('Not Found', 404)
        return
      }
      const addressIds = result.map((address) => address._id)
      const transactions = (
        await ctx.service.address.getAddressTransactions(
          addressIds,
          rawAddresses
        )
      ).transactions
      totalTxs = transactions.length
      txids = transactions.slice(start, start + pageLength)
    } else {
      ctx.throw('Block hash or address expected', 400)
      return
    }
    pagesTotal = Math.ceil(totalTxs / pageLength)
    for (const txid of txids) {
      const tx = (await ctx.service.transaction.getTransaction(
        txid
      )) as TransactionObject
      txs.push(await ctx.service.transaction.transformInsightTransaction(tx))
    }
    ctx.body = {
      pagesTotal,
      txs,
    }
  }

  async send(): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    const { rawtx: data } = ctx.request.body as { rawtx: string }
    if (!/^([0-9a-f][0-9a-f])+$/i.test(data)) {
      ctx.body = { status: 1, message: 'TX decode failed' }
    }
    try {
      const id = await ctx.service.transaction.sendRawTransaction(
        Buffer.from(data, 'hex')
      )
      ctx.body = {
        status: 0,
        txid: (id as Buffer).toString('hex'),
      }
    } catch (err) {
      ctx.body = { status: 1, message: (err as Error).message }
    }
  }
}

export default TransactionController
