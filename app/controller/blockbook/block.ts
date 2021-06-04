import { Controller, CustomContextForBlockFilter } from 'egg'

import { BlockObject } from '@/app/service/block'
import { TransactionObject } from '@/app/service/transaction'

export interface IBlockbookBlockController extends Controller {
  block(v2?: boolean): Promise<void>
  blockV1(): Promise<void>
  blockV2(): Promise<void>
}

class BlockController extends Controller implements IBlockbookBlockController {
  async block(v2: boolean = false): Promise<void> {
    const ctx = this.ctx as CustomContextForBlockFilter
    let arg: number | Buffer | string = ctx.params.block
    ctx.assert(arg, 404)
    if (/^(0|[1-9]\d{0,9})$/.test(arg)) {
      arg = Number.parseInt(arg)
    } else if (/^[0-9a-f]{64}$/i.test(arg)) {
      arg = Buffer.from(arg, 'hex')
    } else {
      ctx.throw(400)
    }
    let block = await ctx.service.block.getBlock(arg)
    ctx.assert(block, 404)
    block = block as BlockObject
    const txs = await Promise.all(
      block.transactions.map(async (id) => {
        const tx = (await ctx.service.transaction.getTransaction(
          id
        )) as TransactionObject
        const transformedTransaction = await ctx.service.transaction.transformBlockbookTransaction(
          tx
        )
        return {
          txid: transformedTransaction.txid,
          hash: transformedTransaction.hash,
          vin: transformedTransaction.vin.map((input) => {
            if (v2) {
              return {
                n: input.n,
                addresses: input.addresses.length ? input.addresses : undefined,
                isAddress: input.isAddress,
                value: input.value.toString(),
              }
            } else {
              return {
                txid: input.txid,
                vout: input.vout,
                n: input.n,
                scriptSig: {
                  hex: input.scriptSig.hex,
                },
                addresses: input.addresses,
                value: (input.value / 1e8).toString(),
              }
            }
          }),
          vout: transformedTransaction.vout.map((output) => {
            if (v2) {
              return {
                value: output.value.toString(),
                n: output.n,
                spent: output.spent,
                addresses: output.scriptPubKey.addresses.length
                  ? output.scriptPubKey.addresses
                  : [output.scriptPubKey.asm],
                isAddress: output.scriptPubKey.addresses.length === 1,
              }
            } else {
              return {
                value: (output.value / 1e8).toString(),
                n: output.n,
                scriptPubKey: {
                  addresses: output.scriptPubKey.addresses.length
                    ? output.scriptPubKey.addresses
                    : [output.scriptPubKey.asm],
                },
                spent: output.spent,
              }
            }
          }),
          blockhash: transformedTransaction.blockhash,
          blockheight: transformedTransaction.blockheight,
          confirmations: transformedTransaction.confirmations,
          time: !v2 ? transformedTransaction.time : undefined,
          blockTime: transformedTransaction.blockTime,
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
          hex: !v2 ? '' : undefined,
        }
      })
    )
    ctx.body = {
      page: 1,
      totalPages: 1,
      itemsOnPage: 1000,
      hash: block.hash.toString('hex'),
      previousBlockHash: block.prevHash.toString('hex'),
      ...(block.nextHash
        ? { nextBlockHash: block.nextHash.toString('hex') }
        : {}),
      hashStateRoot: block.hashStateRoot.toString('hex'),
      hashUTXORoot: block.hashUTXORoot.toString('hex'),
      prevOutStakeHash: block.stakePrevTxId.toString('hex'),
      prevOutStakeN: block.stakeOutputIndex,
      signature: block.signature.toString('hex'),
      flags: block.proofOfStake ? 'proof-of-stake' : 'proof-of-work',
      height: block.height,
      confirmations:
        (this.app.blockchainInfo.tip?.height as number) - block.height + 1,
      size: block.size,
      time: block.timestamp,
      version: block.version,
      merkleRoot: block.merkleRoot.toString('hex'),
      nonce: block.nonce.toString(),
      bits: block.bits.toString(16),
      difficulty: block.difficulty.toString(),
      txCount: block.transactions.length,
      txs,
    }
  }

  async blockV1(): Promise<void> {
    await this.block()
  }

  async blockV2(): Promise<void> {
    await this.block(true)
  }
}

export default BlockController
