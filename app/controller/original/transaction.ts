import { Controller, CustomContextForTransaction } from 'egg'
import { Error } from 'sequelize'
import { Transaction } from 'vipsinfo/lib'

import { TransactionObject } from '@/app/service/transaction'

export interface IOriginalTransactionController {
  transaction(): Promise<void>
  transactions(): Promise<void>
  rawTransaction(): Promise<void>
  recent(): Promise<void>
  list(): Promise<void>
  send(): Promise<void>
}

class TransactionController
  extends Controller
  implements IOriginalTransactionController {
  async transaction(): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    ctx.assert(ctx.params.id && /^[0-9a-f]{64}$/i.test(ctx.params.id), 404)
    const brief = 'brief' in ctx.query
    const id = Buffer.from(ctx.params.id as string, 'hex')
    const transaction = await ctx.service.transaction.getTransaction(id)
    ctx.assert(transaction, 404)
    ctx.body = await ctx.service.transaction.transformTransaction(
      transaction as TransactionObject,
      { brief }
    )
  }

  async transactions(): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    ctx.assert(ctx.params.ids, 404)
    const ids = (ctx.params.ids as string).split(',')
    ctx.assert(
      ids.length <= 100 && ids.every((id) => /^[0-9a-f]{64}$/i.test(id)),
      404
    )
    const brief = 'brief' in ctx.query
    const transactions = await Promise.all(
      ids.map((id) =>
        ctx.service.transaction.getTransaction(Buffer.from(id, 'hex'))
      )
    )
    ctx.assert(transactions.every(Boolean), 404)
    ctx.body = await Promise.all(
      transactions.map((tx) =>
        ctx.service.transaction.transformTransaction(tx as TransactionObject, {
          brief,
        })
      )
    )
  }

  async rawTransaction(): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    ctx.assert(ctx.params.id && /^[0-9a-f]{64}$/.test(ctx.params.id), 404)
    const id = Buffer.from(ctx.params.id as string, 'hex')
    const transaction = await ctx.service.transaction.getRawTransaction(id)
    ctx.assert(transaction, 404)
    ctx.body = (transaction as Transaction).toBuffer().toString('hex')
  }

  async recent(): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    const count = Number.parseInt(String(ctx.query.count || 10))
    const ids = await ctx.service.transaction.getRecentTransactions(count)
    const transactions = await Promise.all(
      ids.map((id) => ctx.service.transaction.getTransaction(Buffer.from(id)))
    )
    ctx.body = await Promise.all(
      transactions.map((tx) =>
        ctx.service.transaction.transformTransaction(tx as TransactionObject, {
          brief: true,
        })
      )
    )
  }

  async list(): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    const {
      totalCount,
      ids,
    } = await ctx.service.transaction.getAllTransactions()
    const transactions = await Promise.all(
      ids.map((id) => ctx.service.transaction.getTransaction(id))
    )
    ctx.body = {
      totalCount,
      transactions: await Promise.all(
        transactions.map((tx) =>
          ctx.service.transaction.transformTransaction(tx as TransactionObject)
        )
      ),
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
        id: (id as Buffer).toString('hex'),
        txid: (id as Buffer).toString('hex'),
      }
    } catch (err) {
      ctx.body = { status: 1, message: (err as Error).message }
    }
  }
}

export default TransactionController
