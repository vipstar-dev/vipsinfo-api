import { Application } from 'egg'

/* eslint-disable @typescript-eslint/unbound-method */
export default (app: Application) => {
  const { router, controller, io, middleware } = app
  const addressMiddleware = middleware.address()
  const blockFilterMiddleware = middleware.blockFilter()
  const contractMiddleware = middleware.contract()
  const paginationMiddleware = middleware.pagination()

  router.get('/info', controller.original.info.index)
  router.get('/supply', controller.original.info.supply)
  router.get('/total-max-supply', controller.original.info.totalMaxSupply)
  router.get('/circulating-supply', controller.original.info.circulatingSupply)
  router.get('/feerates', controller.original.info.feeRates)

  router.get('/blocks', controller.original.block.list)
  router.get('/block/list', paginationMiddleware, controller.original.block.blockList)
  router.get('/block/:block', controller.original.block.block)
  router.get('/raw-block/:block', controller.original.block.rawBlock)
  router.get('/recent-blocks', controller.original.block.recent)

  router.get('/tx/list', paginationMiddleware, controller.original.transaction.list)
  router.get('/tx/:id', controller.original.transaction.transaction)
  router.get('/txs/:ids', controller.original.transaction.transactions)
  router.get('/raw-tx/:id', controller.original.transaction.rawTransaction)
  router.get('/recent-txs', controller.original.transaction.recent)
  router.post('/tx/send', controller.original.transaction.send)

  router.get('/address/:address', addressMiddleware, controller.original.address.summary)
  router.get(
    '/address/:address/balance',
    addressMiddleware,
    controller.original.address.balance
  )
  router.get(
    '/address/:address/balance/total-received',
    addressMiddleware,
    controller.original.address.totalReceived
  )
  router.get(
    '/address/:address/balance/total-sent',
    addressMiddleware,
    controller.original.address.totalSent
  )
  router.get(
    '/address/:address/balance/unconfirmed',
    addressMiddleware,
    controller.original.address.unconfirmedBalance
  )
  router.get(
    '/address/:address/balance/staking',
    addressMiddleware,
    controller.original.address.stakingBalance
  )
  router.get(
    '/address/:address/balance/mature',
    addressMiddleware,
    controller.original.address.matureBalance
  )
  router.get(
    '/address/:address/qrc20-balance/:token',
    addressMiddleware,
    middleware.contract('token'),
    controller.original.address.qrc20TokenBalance
  )
  router.get(
    '/address/:address/txs',
    addressMiddleware,
    paginationMiddleware,
    blockFilterMiddleware,
    controller.original.address.transactions
  )
  router.get(
    '/address/:address/basic-txs',
    addressMiddleware,
    paginationMiddleware,
    blockFilterMiddleware,
    controller.original.address.basicTransactions
  )
  router.get(
    '/address/:address/contract-txs',
    addressMiddleware,
    paginationMiddleware,
    blockFilterMiddleware,
    controller.original.address.contractTransactions
  )
  router.get(
    '/address/:address/contract-txs/:contract',
    addressMiddleware,
    contractMiddleware,
    paginationMiddleware,
    controller.original.address.contractTransactions
  )
  router.get(
    '/address/:address/qrc20-txs/:token',
    addressMiddleware,
    middleware.contract('token'),
    paginationMiddleware,
    controller.original.address.qrc20TokenTransactions
  )
  router.get(
    '/address/:address/qrc20-mempool-txs/:token',
    addressMiddleware,
    middleware.contract('token'),
    controller.original.address.qrc20TokenMempoolTransactions
  )
  router.get(
    '/address/:address/utxo',
    addressMiddleware,
    controller.original.address.utxo
  )
  router.get(
    '/address/:address/balance-history',
    addressMiddleware,
    paginationMiddleware,
    controller.original.address.balanceHistory
  )
  router.get(
    '/address/:address/qrc20-balance-history',
    addressMiddleware,
    paginationMiddleware,
    controller.original.address.qrc20BalanceHistory
  )
  router.get(
    '/address/:address/qrc20-balance-history/:token',
    addressMiddleware,
    middleware.contract('token'),
    paginationMiddleware,
    controller.original.address.qrc20BalanceHistory
  )

  router.get(
    '/contract/:contract',
    contractMiddleware,
    controller.original.contract.summary
  )
  router.get(
    '/contract/:contract/txs',
    contractMiddleware,
    paginationMiddleware,
    blockFilterMiddleware,
    controller.original.contract.transactions
  )
  router.get(
    '/contract/:contract/basic-txs',
    contractMiddleware,
    paginationMiddleware,
    blockFilterMiddleware,
    controller.original.contract.basicTransactions
  )
  router.get(
    '/contract/:contract/balance-history',
    contractMiddleware,
    paginationMiddleware,
    controller.original.contract.balanceHistory
  )
  router.get(
    '/contract/:contract/qrc20-balance-history',
    contractMiddleware,
    paginationMiddleware,
    controller.original.contract.qrc20BalanceHistory
  )
  router.get(
    '/contract/:contract/qrc20-balance-history/:token',
    contractMiddleware,
    middleware.contract('token'),
    paginationMiddleware,
    controller.original.contract.qrc20BalanceHistory
  )
  router.get(
    '/contract/:contract/call',
    contractMiddleware,
    controller.original.contract.callContract
  )
  router.get(
    '/searchlogs',
    paginationMiddleware,
    blockFilterMiddleware,
    controller.original.contract.searchLogs
  )
  router.get('/qrc20', paginationMiddleware, controller.original.qrc20.list)
  router.get(
    '/qrc20/txs',
    paginationMiddleware,
    controller.original.qrc20.allTransactions
  )
  router.get(
    '/qrc20/:token/txs',
    middleware.contract('token'),
    paginationMiddleware,
    blockFilterMiddleware,
    controller.original.qrc20.transactions
  )
  router.get(
    '/qrc20/:token/rich-list',
    middleware.contract('token'),
    paginationMiddleware,
    controller.original.qrc20.richList
  )
  router.get('/qrc721', paginationMiddleware, controller.original.qrc721.list)

  router.get(`/search`, controller.original.misc.classify)
  router.get('/misc/rich-list', paginationMiddleware, controller.original.misc.richList)
  router.get(
    '/misc/biggest-miners',
    paginationMiddleware,
    controller.original.misc.biggestMiners
  )
  router.get('/misc/prices', controller.original.misc.prices)

  router.get(
    '/stats/daily-transactions',
    controller.original.statistics.dailyTransactions
  )
  router.get('/stats/block-interval', controller.original.statistics.blockInterval)
  router.get('/stats/address-growth', controller.original.statistics.addressGrowth)

  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  io.route('subscribe', io.controller.default.subscribe)
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  io.route('unsubscribe', io.controller.default.unsubscribe)
}
