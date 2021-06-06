import {
  Controller,
  CustomContextForAddress,
  CustomContextForPagination,
} from 'egg'
import { Op, Transaction as SequelizeTransaction } from 'sequelize'
import { Address as RawAddress, IAddress } from 'vipsinfo/lib'
import Address from 'vipsinfo/node/models/address'

import {
  TransactionObject,
  TransformedInsightTransactionObject,
} from '@/app/service/transaction'

const { in: $in } = Op

export interface IInsightAddressController extends Controller {
  summary(): Promise<void>
  balance(): Promise<void>
  totalReceived(): Promise<void>
  totalSent(): Promise<void>
  unconfirmedBalance(): Promise<void>
  transactions(): Promise<void>
  postTransactions(): Promise<void>
  utxo(): Promise<void>
  unspent(): Promise<void>
}

class AddressController
  extends Controller
  implements IInsightAddressController {
  async summary(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const { address } = ctx.state
    const summary = await ctx.service.address.getAddressSummary(
      address.addressIds,
      address.p2pkhAddressIds,
      address.rawAddresses
    )
    const { transactions } = await ctx.service.address.getAddressTransactions(
      address.addressIds,
      address.rawAddresses
    )
    const balanceSat = Number(summary.balance)
    const totalReceivedSat = Number(summary.totalReceived)
    const totalSentSat = Number(summary.totalSent)
    const unconfirmedBalanceSat = Number(summary.unconfirmed)
    ctx.body = {
      addrStr: address.rawAddresses[0].toString(),
      balance: balanceSat / 1e8,
      balanceSat,
      totalReceived: totalReceivedSat / 1e8,
      totalReceivedSat,
      totalSent: totalSentSat / 1e8,
      totalSentSat,
      unconfirmedBalance: unconfirmedBalanceSat / 1e8,
      unconfirmedBalanceSat,
      unconfirmedTxApperances: summary.unconfirmedTransactionCount,
      txApperances: summary.transactionCount,
      transactions: transactions.map((tx) => tx.toString('hex')),
    }
  }

  async balance(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const balance = await ctx.service.balance.getBalance(
      ctx.state.address.addressIds
    )
    ctx.body = balance.toString()
  }

  async totalReceived(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const { totalReceived } = await ctx.service.balance.getTotalBalanceChanges(
      ctx.state.address.addressIds
    )
    ctx.body = totalReceived.toString()
  }

  async totalSent(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const { totalSent } = await ctx.service.balance.getTotalBalanceChanges(
      ctx.state.address.addressIds
    )
    ctx.body = totalSent.toString()
  }

  async unconfirmedBalance(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const unconfirmed = await ctx.service.balance.getUnconfirmedBalance(
      ctx.state.address.addressIds
    )
    ctx.body = unconfirmed.toString()
  }

  async transactions(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress & CustomContextForPagination
    const { address } = ctx.state
    const {
      totalCount,
      transactions,
    } = await ctx.service.address.getAddressTransactions(
      address.addressIds,
      address.rawAddresses
    )
    const items: TransformedInsightTransactionObject[] = []
    for (const txid of transactions) {
      const tx = (await ctx.service.transaction.getTransaction(
        txid
      )) as TransactionObject
      items.push(await ctx.service.transaction.transformInsightTransaction(tx))
    }
    ctx.body = {
      totalItems: totalCount,
      from: ctx.state.pagination.offset,
      to: ctx.state.pagination.limit + ctx.state.pagination.offset,
      items,
    }
  }

  async postTransactions(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const { addrs } = ctx.request.body as { addrs: string }
    ctx.assert(addrs, 400)
    const chain = ctx.app.chain()
    const addresses: string[] = ctx.params.address.split(',')
    const rawAddresses: IAddress[] = []
    for (const address of addresses) {
      try {
        rawAddresses.push(RawAddress.fromString(address, chain) as IAddress)
      } catch (err) {
        ctx.throw(400)
      }
    }
    const result = await Address.findAll({
      where: { string: { [$in]: addresses } },
      attributes: ['_id', 'type', 'data'],
      transaction: ctx.state.transaction as SequelizeTransaction,
    })
    ctx.state.address = {
      rawAddresses,
      addressIds: result.map((address) => address._id),
      p2pkhAddressIds: result
        .filter((address) => address.type === RawAddress.PAY_TO_PUBLIC_KEY_HASH)
        .map((address) => address._id),
    }
    await this.transactions()
  }

  async utxo(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const utxos = await ctx.service.address.getUTXO(
      ctx.state.address.addressIds
    )
    ctx.body = utxos.map((utxo) => {
      const satoshis = Number(utxo.value)
      return {
        address: utxo.address,
        txid: utxo.transactionId.toString('hex'),
        vout: utxo.outputIndex,
        scriptPubKey: utxo.scriptPubKey.toString('hex'),
        amount: satoshis / 1e8,
        satoshis,
        ...(utxo.blockHeight !== 0xffffffff
          ? {
              height: utxo.blockHeight,
            }
          : {}),
        confirmations: utxo.confirmations,
      }
    })
  }

  async unspent(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const utxos = await ctx.service.address.getUTXO(
      ctx.state.address.addressIds
    )
    ctx.body = utxos
      .filter((utxo) => utxo.blockHeight !== 0xffffffff)
      .map((utxo) => {
        const satoshis = Number(utxo.value)
        return {
          address: utxo.address,
          txid: utxo.transactionId.toString('hex'),
          vout: utxo.outputIndex,
          scriptPubKey: utxo.scriptPubKey.toString('hex'),
          amount: satoshis / 1e8,
          satoshis,
          height: utxo.blockHeight,
          confirmations: utxo.confirmations,
        }
      })
  }
}

export default AddressController
