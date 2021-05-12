import { Application } from 'egg'
import { ITip } from 'vipsinfo/node/services/db'

/* eslint-disable @typescript-eslint/no-misused-promises */
export default (app: Application) => {
  app.beforeStart(async () => {
    await Promise.resolve('egg + ts')
  })

  app.blockchainInfo = {
    tip: null,
  }
  const namespace = app.io.of('/')

  app.messenger.on('egg-ready', () => {
    app.messenger.sendToAgent('blockchain-info', undefined)
  })

  app.messenger.on('update-richlist', async () => {
    const ctx = app.createAnonymousContext()
    await ctx.service.balance.updateRichList()
  })

  app.messenger.on('update-qrc20-statistics', async () => {
    const ctx = app.createAnonymousContext()
    await ctx.service.qrc20.updateQRC20Statistics()
  })

  app.messenger.on('update-daily-transactions', async () => {
    const ctx = app.createAnonymousContext()
    const dailyTransactions = await ctx.service.statistics.getDailyTransactions()
    await app.redis.hset(
      app.name,
      'daily-transactions',
      JSON.stringify(dailyTransactions)
    )
  })

  app.messenger.on('update-block-interval', async () => {
    const ctx = app.createAnonymousContext()
    const blockInterval = await ctx.service.statistics.getBlockIntervalStatistics()
    await app.redis.hset(
      app.name,
      'block-interval',
      JSON.stringify(blockInterval)
    )
  })

  app.messenger.on('update-address-growth', async () => {
    const ctx = app.createAnonymousContext()
    const addressGrowth = await ctx.service.statistics.getAddressGrowth()
    await app.redis.hset(
      app.name,
      'address-growth',
      JSON.stringify(addressGrowth)
    )
  })

  app.messenger.on('update-stakeweight', async () => {
    const ctx = app.createAnonymousContext()
    const stakeWeight = await ctx.service.info.getStakeWeight()
    await app.redis.hset(app.name, 'stakeweight', JSON.stringify(stakeWeight))
    namespace.to('blockchain').emit('stakeweight', stakeWeight)
  })

  app.messenger.on('update-feerate', async () => {
    await app.runSchedule('update-feerate')
  })

  app.messenger.on('update-dgpinfo', async () => {
    const ctx = app.createAnonymousContext()
    const dgpInfo = await ctx.service.info.getDGPInfo()
    await app.redis.hset(app.name, 'dgpinfo', JSON.stringify(dgpInfo))
    namespace.to('blockchain').emit('dgpinfo', dgpInfo)
  })

  app.messenger.on('blockchain-info', (info: { tip: ITip }) => {
    app.blockchainInfo = info
  })
  app.messenger.on('block-tip', (tip: ITip) => {
    app.blockchainInfo.tip = tip
  })
  app.messenger.on('new-block', (block: ITip) => {
    app.blockchainInfo.tip = block
  })
  app.messenger.on('reorg-to-block', (block: ITip) => {
    app.blockchainInfo.tip = block
  })

  app.messenger.on('socket/block-tip', async (tip: ITip) => {
    app.blockchainInfo.tip = tip
    namespace.emit('tip', tip)
    const ctx = app.createAnonymousContext()
    const transactions = (
      await ctx.service.block.getBlockTransactions(tip.height)
    ).map((id) => id.toString('hex'))
    for (const id of transactions) {
      namespace.to(`transaction/${id}`).emit('transaction/confirm', id)
    }
    const list = await ctx.service.block.getBlockAddressTransactions(tip.height)
    for (let i = 0; i < transactions.length; ++i) {
      for (const address of list[i] || []) {
        namespace
          .to(`address/${address}`)
          .emit('address/transaction', { address, id: transactions[i] })
      }
    }
  })

  app.messenger.on('socket/reorg/block-tip', (tip: ITip) => {
    app.blockchainInfo.tip = tip
    namespace.emit('reorg', tip)
  })

  app.messenger.on('socket/mempool-transaction', async (id: Buffer) => {
    id = Buffer.from(id)
    const ctx = app.createAnonymousContext()
    const transaction = await ctx.service.transaction.getTransaction(id)
    if (!transaction) {
      return
    }
    namespace.to('mempool').emit(
      'mempool/transaction',
      await ctx.service.transaction.transformTransaction(transaction, {
        brief: true,
      })
    )
    const addresses = await ctx.service.transaction.getMempoolTransactionAddresses(
      id
    )
    for (const address of addresses) {
      namespace
        .to(`address/${address}`)
        .emit('address/transaction', { address, id: id.toString('hex') })
    }
  })
}
