import { Controller, CustomContextForAddress } from 'egg'
import { Address } from 'vipsinfo/lib'

import { ContractObject } from '@/app/middleware/contract'
import { Qrc20BalanceObject } from '@/app/service/qrc20'

export interface IAddressController extends Controller {
  summary(): Promise<void>
  balance(): Promise<void>
  totalReceived(): Promise<void>
  totalSent(): Promise<void>
  unconfirmedBalance(): Promise<void>
  stakingBalance(): Promise<void>
  matureBalance(): Promise<void>
  qrc20TokenBalance(): Promise<void>
  transactions(): Promise<void>
  basicTransactions(): Promise<void>
  contractTransactions(): Promise<void>
  qrc20TokenTransactions(): Promise<void>
  qrc20TokenMempoolTransactions(): Promise<void>
  utxo(): Promise<void>
  balanceHistory(): Promise<void>
  qrc20BalanceHistory(): Promise<void>
}

class AddressController extends Controller implements IAddressController {
  async summary(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const { address } = ctx.state
    const summary = await ctx.service.address.getAddressSummary(
      address.addressIds,
      address.p2pkhAddressIds,
      address.rawAddresses
    )
    ctx.body = {
      balance: summary.balance.toString(),
      totalReceived: summary.totalReceived.toString(),
      totalSent: summary.totalSent.toString(),
      unconfirmed: summary.unconfirmed.toString(),
      staking: summary.staking.toString(),
      mature: summary.mature.toString(),
      qrc20Balances: summary.qrc20Balances.map((item) => ({
        address: item.addressHex.toString('hex'),
        addressHex: item.addressHex.toString('hex'),
        name: item.name,
        symbol: item.symbol,
        decimals: item.decimals,
        balance: item.balance.toString(),
        unconfirmed: {
          received: item.unconfirmed.received.toString(),
          sent: item.unconfirmed.sent.toString(),
        },
        isUnconfirmed: item.isUnconfirmed,
      })),
      qrc721Balances: summary.qrc721Balances.map((item) => ({
        address: item.addressHex.toString('hex'),
        addressHex: item.addressHex.toString('hex'),
        name: item.name,
        symbol: item.symbol,
        count: item.count,
      })),
      ranking: summary.ranking,
      transactionCount: summary.transactionCount,
      blocksMined: summary.blocksMined,
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

  async stakingBalance(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const unconfirmed = await ctx.service.balance.getStakingBalance(
      ctx.state.address.addressIds
    )
    ctx.body = unconfirmed.toString()
  }

  async matureBalance(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const unconfirmed = await ctx.service.balance.getMatureBalance(
      ctx.state.address.p2pkhAddressIds
    )
    ctx.body = unconfirmed.toString()
  }

  async qrc20TokenBalance(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const { address } = ctx.state
    const token = ctx.state.token as ContractObject
    if (token.type !== 'qrc20') {
      ctx.body = {}
    }
    const {
      name,
      symbol,
      decimals,
      balance,
      unconfirmed,
    } = (await ctx.service.qrc20.getQRC20Balance(
      address.rawAddresses,
      token.contractAddress
    )) as Qrc20BalanceObject
    ctx.body = {
      name,
      symbol,
      decimals,
      balance: balance.toString(),
      unconfirmed: {
        received: unconfirmed.received.toString(),
        sent: unconfirmed.sent.toString(),
      },
    }
  }

  async transactions(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const { address } = ctx.state
    const {
      totalCount,
      transactions,
    } = await ctx.service.address.getAddressTransactions(
      address.addressIds,
      address.rawAddresses
    )
    ctx.body = {
      totalCount,
      transactions: transactions.map((id) => id.toString('hex')),
    }
  }

  async basicTransactions(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const {
      totalCount,
      transactions,
    } = await ctx.service.address.getAddressBasicTransactions(
      ctx.state.address.addressIds
    )
    ctx.body = {
      totalCount,
      transactions: transactions.map((transaction) => ({
        id: transaction.id.toString('hex'),
        blockHeight: transaction.blockHeight,
        blockHash:
          transaction.blockHash && transaction.blockHash.toString('hex'),
        timestamp: transaction.timestamp,
        confirmations: transaction.confirmations,
        amount: transaction.amount.toString(),
        inputValue: transaction.inputValue.toString(),
        outputValue: transaction.outputValue.toString(),
        refundValue: transaction.refundValue.toString(),
        fees: transaction.fees.toString(),
        type: transaction.type,
      })),
    }
  }

  async contractTransactions(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const { address } = ctx.state
    const contract = ctx.state.contract as ContractObject
    const {
      totalCount,
      transactions,
    } = await ctx.service.address.getAddressContractTransactions(
      address.rawAddresses,
      contract
    )
    ctx.body = {
      totalCount,
      transactions: transactions.map((transaction) => ({
        transactionId: transaction.transactionId.toString('hex'),
        outputIndex: transaction.outputIndex,
        blockHeight: transaction.blockHeight,
        blockHash:
          transaction.blockHash && transaction.blockHash.toString('hex'),
        timestamp: transaction.timestamp,
        confirmations: transaction.confirmations,
        type: transaction.scriptPubKey.type,
        gasLimit: transaction.scriptPubKey.gasLimit,
        gasPrice: transaction.scriptPubKey.gasPrice,
        byteCode: transaction.scriptPubKey.byteCode?.toString('hex'),
        outputValue: transaction.value.toString(),
        outputAddress: transaction.outputAddressHex.toString('hex'),
        outputAddressHex: transaction.outputAddressHex.toString('hex'),
        sender: transaction.sender.toString(),
        gasUsed: transaction.gasUsed,
        contractAddress: transaction.contractAddressHex.toString('hex'),
        contractAddressHex: transaction.contractAddressHex.toString('hex'),
        excepted: transaction.excepted,
        exceptedMessage: transaction.exceptedMessage,
        evmLogs: transaction.evmLogs.map((log) => ({
          address: log.addressHex.toString('hex'),
          addressHex: log.addressHex.toString('hex'),
          topics: log.topics.map((topic) => topic.toString('hex')),
          data: log.data.toString('hex'),
        })),
      })),
    }
  }

  async qrc20TokenTransactions(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const { address } = ctx.state
    const token = ctx.state.token as ContractObject
    const {
      totalCount,
      transactions,
    } = await ctx.service.address.getAddressQRC20TokenTransactions(
      address.rawAddresses,
      token
    )
    ctx.body = {
      totalCount,
      transactions: transactions.map((transaction) => ({
        transactionId: transaction.transactionId.toString('hex'),
        outputIndex: transaction.outputIndex,
        blockHeight: transaction.blockHeight,
        blockHash: transaction.blockHash.toString('hex'),
        timestamp: transaction.timestamp,
        confirmations: transaction.confirmations,
        from: transaction.from,
        fromHex: transaction.fromHex && transaction.fromHex.toString('hex'),
        to: transaction.to,
        toHex: transaction.toHex && transaction.toHex.toString('hex'),
        value: transaction.value.toString(),
        amount: transaction.amount.toString(),
      })),
    }
  }

  async qrc20TokenMempoolTransactions(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const { address } = ctx.state
    const token = ctx.state.token as ContractObject
    const transactions = await ctx.service.address.getAddressQRC20TokenMempoolTransactions(
      address.rawAddresses,
      token
    )
    ctx.body = transactions.map((transaction) => ({
      transactionId: transaction.transactionId.toString('hex'),
      outputIndex: transaction.outputIndex,
      from: transaction.from,
      fromHex: transaction.fromHex && transaction.fromHex.toString('hex'),
      to: transaction.to,
      toHex: transaction.toHex && transaction.toHex.toString('hex'),
      value: transaction.value.toString(),
      amount: transaction.amount.toString(),
    }))
  }

  async utxo(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const utxos = await ctx.service.address.getUTXO(
      ctx.state.address.addressIds
    )
    ctx.body = utxos.map((utxo) => ({
      transactionId: utxo.transactionId.toString('hex'),
      outputIndex: utxo.outputIndex,
      scriptPubKey: utxo.scriptPubKey.toString('hex'),
      address: utxo.address,
      value: utxo.value.toString(),
      isStake: utxo.isStake,
      blockHeight: utxo.blockHeight,
      confirmations: utxo.confirmations,
    }))
  }

  async balanceHistory(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const {
      totalCount,
      transactions,
    } = await ctx.service.balance.getBalanceHistory(
      ctx.state.address.addressIds
    )
    ctx.body = {
      totalCount,
      transactions: transactions.map((tx) => ({
        id: tx.id.toString('hex'),
        ...(tx.block
          ? {
              blockHash: tx.block.hash.toString('hex'),
              blockHeight: tx.block.height,
              timestamp: tx.block.timestamp,
            }
          : {}),
        amount: tx.amount.toString(),
        balance: tx.balance.toString(),
      })),
    }
  }

  async qrc20BalanceHistory(): Promise<void> {
    const ctx = this.ctx as CustomContextForAddress
    const token = ctx.state.token as ContractObject | null
    let tokenAddress = null
    if (token) {
      if (token.type === 'qrc20') {
        tokenAddress = token.contractAddress
      } else {
        ctx.body = {
          totalCount: 0,
          transactions: [],
        }
        return
      }
    } else {
      ctx.body = {
        totalCount: 0,
        transactions: [],
      }
      return
    }
    const hexAddresses = ctx.state.address.rawAddresses
      .filter((address) => address.type === Address.PAY_TO_PUBLIC_KEY_HASH)
      .map((address) => address.data as Buffer)
    const {
      totalCount,
      transactions,
    } = await ctx.service.qrc20.getQRC20BalanceHistory(
      hexAddresses,
      tokenAddress
    )
    ctx.body = {
      totalCount,
      transactions: transactions.map((tx) => ({
        id: tx.id.toString('hex'),
        blockHash: tx.block.hash.toString('hex'),
        blockHeight: tx.block.height,
        timestamp: tx.block.timestamp,
        tokens: tx.tokens.map((item) => ({
          address: item.addressHex.toString('hex'),
          addressHex: item.addressHex.toString('hex'),
          name: item.name,
          symbol: item.symbol,
          decimals: item.decimals,
          amount: item.amount.toString(),
          balance: item.balance.toString(),
        })),
      })),
    }
  }
}

export default AddressController
