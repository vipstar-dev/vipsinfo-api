import { Controller, CustomContextForContract } from 'egg'
import { Address } from 'vipsinfo/lib'

export interface IContractController extends Controller {
  summary(): Promise<void>
  transactions(): Promise<void>
  basicTransactions(): Promise<void>
  balanceHistory(): Promise<void>
  qrc20BalanceHistory(): Promise<void>
  callContract(): Promise<void>
  searchLogs(): Promise<void>
}

class ContractController extends Controller implements IContractController {
  async summary(): Promise<void> {
    const ctx = this.ctx as CustomContextForContract
    const summary = await ctx.service.contract.getContractSummary(
      ctx.state.contract.contractAddress,
      ctx.state.contract.addressIds
    )
    ctx.body = {
      address: summary.addressHex.toString('hex'),
      addressHex: summary.addressHex.toString('hex'),
      vm: summary.vm,
      type: summary.type,
      ...(summary.type === 'qrc20' && summary.qrc20
        ? {
            qrc20: {
              name: summary.qrc20.name,
              symbol: summary.qrc20.symbol,
              decimals: summary.qrc20.decimals,
              totalSupply: summary.qrc20.totalSupply?.toString(),
              version: summary.qrc20.version,
              holders: summary.qrc20.holders,
              transactions: summary.qrc20.transactions,
            },
          }
        : {}),
      ...(summary.type === 'qrc721' && summary.qrc721
        ? {
            qrc721: {
              name: summary.qrc721.name,
              symbol: summary.qrc721.symbol,
              totalSupply: summary.qrc721.totalSupply?.toString(),
            },
          }
        : {}),
      balance: summary.balance.toString(),
      totalReceived: summary.totalReceived.toString(),
      totalSent: summary.totalSent.toString(),
      unconfirmed: summary.unconfirmed.toString(),
      qrc20Balances: summary.qrc20Balances.map((item) => ({
        address: item.addressHex.toString('hex'),
        addressHex: item.addressHex.toString('hex'),
        name: item.name,
        symbol: item.symbol,
        decimals: item.decimals,
        balance: item.balance.toString(),
      })),
      qrc721Balances: summary.qrc721Balances.map((item) => ({
        address: item.addressHex.toString('hex'),
        addressHex: item.addressHex.toString('hex'),
        name: item.name,
        symbol: item.symbol,
        count: item.count,
      })),
      transactionCount: summary.transactionCount,
    }
  }

  async transactions(): Promise<void> {
    const ctx = this.ctx as CustomContextForContract
    const {
      totalCount,
      transactions,
    } = await ctx.service.contract.getContractTransactions(
      ctx.state.contract.contractAddress,
      ctx.state.contract.addressIds
    )
    ctx.body = {
      totalCount,
      transactions: transactions.map((id) => id.toString('hex')),
    }
  }

  async basicTransactions(): Promise<void> {
    const ctx = this.ctx as CustomContextForContract
    const {
      totalCount,
      transactions,
    } = await ctx.service.contract.getContractBasicTransactions(
      ctx.state.contract.contractAddress
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
        byteCode: transaction.scriptPubKey.byteCode?.toString('hex') as string,
        outputValue: transaction.value.toString(),
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

  async balanceHistory(): Promise<void> {
    const ctx = this.ctx as CustomContextForContract
    const {
      totalCount,
      transactions,
    } = await ctx.service.balance.getBalanceHistory(
      ctx.state.contract.addressIds,
      { nonZero: true }
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
    const ctx = this.ctx as CustomContextForContract
    let tokenAddress = null
    if (ctx.state.token) {
      if (ctx.state.token.type === 'qrc20') {
        tokenAddress = ctx.state.token.contractAddress
      } else {
        ctx.body = {
          totalCount: 0,
          transactions: [],
        }
        return
      }
    }
    const {
      totalCount,
      transactions,
    } = await ctx.service.qrc20.getQRC20BalanceHistory(
      [ctx.state.contract.contractAddress],
      tokenAddress as Buffer
    )
    ctx.body = {
      totalCount,
      transactions: transactions.map((tx) => ({
        id: tx.id.toString('hex'),
        hash: tx.block.hash.toString('hex'),
        height: tx.block.height,
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

  async callContract(): Promise<void> {
    const ctx = this.ctx as CustomContextForContract
    const { data } = ctx.query
    let { sender } = ctx.query
    ctx.assert(ctx.state.contract.vm === 'evm', 400)
    ctx.assert(/^([0-9a-f]{2})+$/i.test(data), 400)
    if (sender != null) {
      try {
        const address = Address.fromString(sender, this.app.chain())
        if (
          [
            Address.PAY_TO_PUBLIC_KEY_HASH,
            Address.CONTRACT,
            Address.EVM_CONTRACT,
          ].includes(address?.type as string)
        ) {
          sender = address?.data?.toString('hex') as string
        } else {
          ctx.throw(400)
        }
      } catch (err) {
        ctx.throw(400)
      }
    }
    ctx.body = await ctx.service.contract.callContract(
      ctx.state.contract.contractAddress,
      Buffer.from(data, 'hex'),
      Buffer.from(sender, 'hex')
    )
  }

  async searchLogs(): Promise<void> {
    const ctx = this.ctx as CustomContextForContract
    let {
      contract,
      topic1,
      topic2,
      topic3,
      topic4,
    }: { [key: string]: Buffer | string | null } = this.ctx.query
    if (contract != null) {
      contract = (
        await ctx.service.contract.getContractAddresses([contract])
      )[0]
    }
    if (topic1 != null) {
      if (/^[0-9a-f]{64}$/i.test(topic1)) {
        topic1 = Buffer.from(topic1, 'hex')
      } else {
        ctx.throw(400)
      }
    }
    if (topic2 != null) {
      if (/^[0-9a-f]{64}$/i.test(topic2)) {
        topic2 = Buffer.from(topic2, 'hex')
      } else {
        ctx.throw(400)
      }
    }
    if (topic3 != null) {
      if (/^[0-9a-f]{64}$/i.test(topic3)) {
        topic3 = Buffer.from(topic3, 'hex')
      } else {
        ctx.throw(400)
      }
    }
    if (topic4 != null) {
      if (/^[0-9a-f]{64}$/i.test(topic4)) {
        topic4 = Buffer.from(topic4, 'hex')
      } else {
        ctx.throw(400)
      }
    }

    const { totalCount, logs } = await ctx.service.contract.searchLogs({
      contract,
      topic1,
      topic2,
      topic3,
      topic4,
    } as { [key: string]: Buffer | null })
    ctx.body = {
      totalCount,
      logs: logs.map((log) => ({
        transactionId: log.transactionId.toString('hex'),
        outputIndex: log.outputIndex,
        blockHash: log.blockHash.toString('hex'),
        blockHeight: log.blockHeight,
        timestamp: log.timestamp,
        sender: log.sender.toString(),
        contractAddress: log.contractAddressHex.toString('hex'),
        contractAddressHex: log.contractAddressHex.toString('hex'),
        address: log.addressHex.toString('hex'),
        addressHex: log.addressHex.toString('hex'),
        topics: log.topics.map((topic) => topic.toString('hex')),
        data: log.data.toString('hex'),
      })),
    }
  }
}

export default ContractController
