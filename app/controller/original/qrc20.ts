import { Controller, CustomContextForContract } from 'egg'

export interface IQRC20Controller extends Controller {
  list(): Promise<void>
  allTransactions(): Promise<void>
  transactions(): Promise<void>
  richList(): Promise<void>
}

class QRC20Controller extends Controller implements IQRC20Controller {
  async list(): Promise<void> {
    const ctx = this.ctx as CustomContextForContract
    const { totalCount, tokens } = await ctx.service.qrc20.listQRC20Tokens()
    ctx.body = {
      totalCount,
      tokens: tokens.map((item) => ({
        address: item.addressHex.toString('hex'),
        addressHex: item.addressHex.toString('hex'),
        name: item.name,
        symbol: item.symbol,
        decimals: item.decimals,
        totalSupply: item.totalSupply.toString(),
        version: item.version,
        holders: item.holders,
        transactions: item.transactions,
      })),
    }
  }

  async allTransactions(): Promise<void> {
    const ctx = this.ctx as CustomContextForContract
    const {
      totalCount,
      transactions,
    } = await ctx.service.qrc20.getAllQRC20TokenTransactions()
    ctx.body = {
      totalCount,
      transactions: transactions.map((transaction) => ({
        transactionId: transaction.transactionId.toString('hex'),
        outputIndex: transaction.outputIndex,
        blockHeight: transaction.blockHeight,
        blockHash: transaction.blockHash.toString('hex'),
        timestamp: transaction.timestamp,
        token: {
          name: transaction.token.name,
          symbol: transaction.token.symbol,
          decimals: transaction.token.decimals,
        },
        from: transaction.from,
        fromHex: transaction.fromHex && transaction.fromHex.toString('hex'),
        to: transaction.to,
        toHex: transaction.toHex && transaction.toHex.toString('hex'),
        value: transaction.value.toString(),
      })),
    }
  }

  async transactions(): Promise<void> {
    const ctx = this.ctx as CustomContextForContract
    ctx.assert(ctx.state.token.type === 'qrc20', 404)
    const {
      totalCount,
      transactions,
    } = await ctx.service.qrc20.getQRC20TokenTransactions(
      ctx.state.token.contractAddress
    )
    ctx.body = {
      totalCount,
      transactions: transactions.map((transaction) => ({
        transactionId: transaction.transactionId.toString('hex'),
        outputIndex: transaction.outputIndex,
        blockHeight: transaction.blockHeight,
        blockHash: transaction.blockHash.toString('hex'),
        timestamp: transaction.timestamp,
        from: transaction.from,
        fromHex: transaction.fromHex && transaction.fromHex.toString('hex'),
        to: transaction.to,
        toHex: transaction.toHex && transaction.toHex.toString('hex'),
        value: transaction.value.toString(),
      })),
    }
  }

  async richList(): Promise<void> {
    const ctx = this.ctx as CustomContextForContract
    ctx.assert(ctx.state.token.type === 'qrc20', 404)
    const { totalCount, list } = await ctx.service.qrc20.getQRC20TokenRichList(
      ctx.state.token.contractAddress
    )
    ctx.body = {
      totalCount,
      list: list.map((item) => ({
        address: item.address,
        addressHex: item.addressHex,
        balance: item.balance?.toString() as string,
      })),
    }
  }
}

export default QRC20Controller
