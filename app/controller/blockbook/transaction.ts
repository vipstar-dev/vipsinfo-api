import { Controller, CustomContextForTransaction } from 'egg'
import { Error } from 'sequelize'

import { TransactionObject } from '@/app/service/transaction'

export interface IBlockbookTransactionController {
  transaction(v2?: boolean): Promise<void>
  transactionV1(): Promise<void>
  transactionV2(): Promise<void>
  txSpecific(): Promise<void>
  sendTx(tx: string): Promise<void>
  sendTxByPost(): Promise<void>
  sendTxByGet(): Promise<void>
}

class TransactionController
  extends Controller
  implements IBlockbookTransactionController {
  async transaction(v2: boolean = false): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    ctx.assert(ctx.params.id && /^[0-9a-f]{64}$/i.test(ctx.params.id), 404)
    const id = Buffer.from(ctx.params.id as string, 'hex')
    const transaction = await ctx.service.transaction.getTransaction(id)
    ctx.assert(transaction, 404)
    const transformedTransaction = await ctx.service.transaction.transformBlockbookTransaction(
      transaction as TransactionObject
    )
    ctx.body = {
      txid: transformedTransaction.txid,
      hash: transformedTransaction.hash,
      version: transformedTransaction.version,
      vin: transformedTransaction.vin.map((input) => {
        if (v2 && input.coinbase) {
          return {
            sequence: input.sequence,
            n: input.n,
            isAddress: input.isAddress,
            coinbase: input.coinbase,
          }
        } else if (v2) {
          return {
            txid: input.txid,
            vout: input.vout,
            sequence: input.sequence,
            n: input.n,
            addresses: input.addresses,
            isAddress: input.isAddress,
          }
        } else {
          return {
            txid: input.txid,
            vout: input.vout,
            sequence: input.sequence,
            n: input.n,
            scriptSig: {
              hex: input.scriptSig.hex || undefined,
            },
            addresses: input.addresses || null,
            value: input.value ? (input.value / 1e8).toString() : '',
          }
        }
      }),
      vout: transformedTransaction.vout.map((output) => {
        if (v2) {
          return {
            value: output.value.toString(),
            n: output.n,
            spent: output.spent,
            hex: output.scriptPubKey.hex,
            addresses: output.scriptPubKey.addresses,
            isAddress: !!output.scriptPubKey.addresses.length,
          }
        }
        return {
          value: (output.value / 1e8).toString(),
          n: output.n,
          scriptPubKey: {
            hex: output.scriptPubKey.hex,
            addresses: output.scriptPubKey.addresses,
          },
          spent: output.spent,
        }
      }),
      ...(v2
        ? {
            blockHash: transformedTransaction.blockhash,
            blockHeight: transformedTransaction.blockheight,
            blockTime: transformedTransaction.blockTime,
          }
        : {
            blockhash: transformedTransaction.blockhash,
            blockheight: transformedTransaction.blockheight,
            blocktime: transformedTransaction.blockTime,
          }),
      confirmations: transformedTransaction.confirmations,
      time: !v2 ? transformedTransaction.time : undefined,
      valueOut: !v2
        ? (transformedTransaction.valueOut / 1e8).toString()
        : undefined,
      value: v2 ? transformedTransaction.valueOut.toString() : undefined,
      valueIn: !v2
        ? (transformedTransaction.valueIn / 1e8).toString()
        : transformedTransaction.valueIn.toString(),
      fees: !v2
        ? (transformedTransaction.fees / 1e8).toString()
        : transformedTransaction.fees.toString(),
      hex: transformedTransaction.hex,
    }
  }

  async transactionV1(): Promise<void> {
    await this.transaction()
  }

  async transactionV2(): Promise<void> {
    await this.transaction(true)
  }

  async txSpecific(): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    ctx.assert(ctx.params.id && /^[0-9a-f]{64}$/i.test(ctx.params.id), 404)
    const id = Buffer.from(ctx.params.id as string, 'hex')
    const transaction = await ctx.service.transaction.getTransaction(id)
    ctx.assert(transaction, 404)
    const transformedTransaction = await ctx.service.transaction.transformBlockbookTransaction(
      transaction as TransactionObject
    )
    ctx.body = {
      txid: transformedTransaction.txid,
      hash: transformedTransaction.hash,
      version: transformedTransaction.version,
      size: transformedTransaction.size,
      vsize: transformedTransaction.vsize,
      weight: transformedTransaction.weight,
      locktime: transformedTransaction.locktime,
      vin: transformedTransaction.vin.map((input) => {
        if (input.coinbase) {
          return {
            sequence: input.sequence,
            coinbase: input.coinbase,
          }
        } else {
          return {
            txid: input.txid,
            vout: input.vout,
            sequence: input.sequence,
            scriptSig: {
              hex: input.scriptSig.hex,
              asm: input.scriptSig.asm,
            },
            txinwitness: input.txinwitness,
          }
        }
      }),
      vout: transformedTransaction.vout.map((output) => {
        return {
          value: output.value / 1e8,
          n: output.n,
          scriptPubKey: output.scriptPubKey,
        }
      }),
      hex: transformedTransaction.hex,
      blockhash: transformedTransaction.blockhash,
      confirmations: transformedTransaction.confirmations,
      time: transformedTransaction.time,
      blocktime: transformedTransaction.blockTime,
    }
  }

  async sendTx(tx: string): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    try {
      const id = await ctx.service.transaction.sendRawTransaction(
        Buffer.from(tx, 'hex')
      )
      ctx.body = {
        result: (id as Buffer).toString('hex'),
      }
    } catch (err) {
      ctx.body = { error: { message: (err as Error).message } }
      ctx.status = 400
    }
  }

  async sendTxByPost(): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    const data = ctx.request.body as string
    if (!/^([0-9a-f][0-9a-f])+$/i.test(data)) {
      ctx.body = { error: { message: 'Missing tx blob' } }
      ctx.status = 400
      return
    }
    await this.sendTx(data)
  }

  async sendTxByGet(): Promise<void> {
    const ctx = this.ctx as CustomContextForTransaction
    const data = ctx.params.id as string
    if (!/^([0-9a-f][0-9a-f])+$/i.test(data)) {
      ctx.body = { error: { message: 'Missing tx blob' } }
      ctx.status = 400
      return
    }
    await this.sendTx(data)
  }
}

export default TransactionController
