import { Application } from 'egg'

/* eslint-disable @typescript-eslint/unbound-method */
export default (app: Application) => {
  const { router, controller, io, middleware, config } = app
  const apiType = config.api.type
  const originalAddressMiddleware = middleware.original.address()
  const originalBlockFilterMiddleware = middleware.original.blockFilter()
  const originalContractMiddleware = middleware.original.contract()
  const originalPaginationMiddleware = middleware.original.pagination()
  const insightAddressMiddleware = middleware.insight.address()
  const insightPaginationMiddleware = (defaultPageSize: number = 1000) =>
    middleware.insight.pagination({ defaultPageSize })

  if (apiType === 'original') {
    router.get('/info', controller.original.info.index)
    router.get('/supply', controller.original.info.supply)
    router.get('/total-max-supply', controller.original.info.totalMaxSupply)
    router.get(
      '/circulating-supply',
      controller.original.info.circulatingSupply
    )
    router.get('/feerates', controller.original.info.feeRates)

    router.get('/blocks', controller.original.block.list)
    router.get(
      '/block/list',
      originalPaginationMiddleware,
      controller.original.block.blockList
    )
    router.get('/block/:block', controller.original.block.block)
    router.get('/raw-block/:block', controller.original.block.rawBlock)
    router.get('/recent-blocks', controller.original.block.recent)

    router.get(
      '/tx/list',
      originalPaginationMiddleware,
      controller.original.transaction.list
    )
    router.get('/tx/:id', controller.original.transaction.transaction)
    router.get('/txs/:ids', controller.original.transaction.transactions)
    router.get('/raw-tx/:id', controller.original.transaction.rawTransaction)
    router.get('/recent-txs', controller.original.transaction.recent)
    router.post('/tx/send', controller.original.transaction.send)

    router.get(
      '/address/:address',
      originalAddressMiddleware,
      controller.original.address.summary
    )
    router.get(
      '/address/:address/balance',
      originalAddressMiddleware,
      controller.original.address.balance
    )
    router.get(
      '/address/:address/balance/total-received',
      originalAddressMiddleware,
      controller.original.address.totalReceived
    )
    router.get(
      '/address/:address/balance/total-sent',
      originalAddressMiddleware,
      controller.original.address.totalSent
    )
    router.get(
      '/address/:address/balance/unconfirmed',
      originalAddressMiddleware,
      controller.original.address.unconfirmedBalance
    )
    router.get(
      '/address/:address/balance/staking',
      originalAddressMiddleware,
      controller.original.address.stakingBalance
    )
    router.get(
      '/address/:address/balance/mature',
      originalAddressMiddleware,
      controller.original.address.matureBalance
    )
    router.get(
      '/address/:address/qrc20-balance/:token',
      originalAddressMiddleware,
      middleware.original.contract('token'),
      controller.original.address.qrc20TokenBalance
    )
    router.get(
      '/address/:address/txs',
      originalAddressMiddleware,
      originalPaginationMiddleware,
      originalBlockFilterMiddleware,
      controller.original.address.transactions
    )
    router.get(
      '/address/:address/basic-txs',
      originalAddressMiddleware,
      originalPaginationMiddleware,
      originalBlockFilterMiddleware,
      controller.original.address.basicTransactions
    )
    router.get(
      '/address/:address/contract-txs',
      originalAddressMiddleware,
      originalPaginationMiddleware,
      originalBlockFilterMiddleware,
      controller.original.address.contractTransactions
    )
    router.get(
      '/address/:address/contract-txs/:contract',
      originalAddressMiddleware,
      originalContractMiddleware,
      originalPaginationMiddleware,
      controller.original.address.contractTransactions
    )
    router.get(
      '/address/:address/qrc20-txs/:token',
      originalAddressMiddleware,
      middleware.original.contract('token'),
      originalPaginationMiddleware,
      controller.original.address.qrc20TokenTransactions
    )
    router.get(
      '/address/:address/qrc20-mempool-txs/:token',
      originalAddressMiddleware,
      middleware.original.contract('token'),
      controller.original.address.qrc20TokenMempoolTransactions
    )
    router.get(
      '/address/:address/utxo',
      originalAddressMiddleware,
      controller.original.address.utxo
    )
    router.get(
      '/address/:address/balance-history',
      originalAddressMiddleware,
      originalPaginationMiddleware,
      controller.original.address.balanceHistory
    )
    router.get(
      '/address/:address/qrc20-balance-history',
      originalAddressMiddleware,
      originalPaginationMiddleware,
      controller.original.address.qrc20BalanceHistory
    )
    router.get(
      '/address/:address/qrc20-balance-history/:token',
      originalAddressMiddleware,
      middleware.original.contract('token'),
      originalPaginationMiddleware,
      controller.original.address.qrc20BalanceHistory
    )

    router.get(
      '/contract/:contract',
      originalContractMiddleware,
      controller.original.contract.summary
    )
    router.get(
      '/contract/:contract/txs',
      originalContractMiddleware,
      originalPaginationMiddleware,
      originalBlockFilterMiddleware,
      controller.original.contract.transactions
    )
    router.get(
      '/contract/:contract/basic-txs',
      originalContractMiddleware,
      originalPaginationMiddleware,
      originalBlockFilterMiddleware,
      controller.original.contract.basicTransactions
    )
    router.get(
      '/contract/:contract/balance-history',
      originalContractMiddleware,
      originalPaginationMiddleware,
      controller.original.contract.balanceHistory
    )
    router.get(
      '/contract/:contract/qrc20-balance-history',
      originalContractMiddleware,
      originalPaginationMiddleware,
      controller.original.contract.qrc20BalanceHistory
    )
    router.get(
      '/contract/:contract/qrc20-balance-history/:token',
      originalContractMiddleware,
      middleware.original.contract('token'),
      originalPaginationMiddleware,
      controller.original.contract.qrc20BalanceHistory
    )
    router.get(
      '/contract/:contract/call',
      originalContractMiddleware,
      controller.original.contract.callContract
    )
    router.get(
      '/searchlogs',
      originalPaginationMiddleware,
      originalBlockFilterMiddleware,
      controller.original.contract.searchLogs
    )
    router.get(
      '/qrc20',
      originalPaginationMiddleware,
      controller.original.qrc20.list
    )
    router.get(
      '/qrc20/txs',
      originalPaginationMiddleware,
      controller.original.qrc20.allTransactions
    )
    router.get(
      '/qrc20/:token/txs',
      middleware.original.contract('token'),
      originalPaginationMiddleware,
      originalBlockFilterMiddleware,
      controller.original.qrc20.transactions
    )
    router.get(
      '/qrc20/:token/rich-list',
      middleware.original.contract('token'),
      originalPaginationMiddleware,
      controller.original.qrc20.richList
    )
    router.get(
      '/qrc721',
      originalPaginationMiddleware,
      controller.original.qrc721.list
    )

    router.get(`/search`, controller.original.misc.classify)
    router.get(
      '/misc/rich-list',
      originalPaginationMiddleware,
      controller.original.misc.richList
    )
    router.get(
      '/misc/biggest-miners',
      originalPaginationMiddleware,
      controller.original.misc.biggestMiners
    )
    router.get('/misc/prices', controller.original.misc.prices)

    router.get(
      '/stats/daily-transactions',
      controller.original.statistics.dailyTransactions
    )
    router.get(
      '/stats/block-interval',
      controller.original.statistics.blockInterval
    )
    router.get(
      '/stats/address-growth',
      controller.original.statistics.addressGrowth
    )
  } else if (apiType === 'insight') {
    router.get('/blocks', controller.insight.block.list)
    router.get('/block/:block', controller.insight.block.block)
    router.get('/block-index/:block', controller.insight.block.blockIndex)
    router.get('/rawblock/:block', controller.insight.block.rawBlock)

    router.get('/tx/:id', controller.insight.transaction.transaction)
    router.get('/txs', controller.insight.transaction.list)
    router.get('/txs/:id/receipt', controller.insight.transaction.receipt)
    router.get('/rawtx/:id', controller.insight.transaction.rawTransaction)
    router.post('/tx/send', controller.insight.transaction.send)

    router.get(
      '/addr/:address',
      insightAddressMiddleware,
      insightPaginationMiddleware(),
      controller.insight.address.summary
    )
    router.get(
      '/addr/:address/utxo',
      insightAddressMiddleware,
      controller.insight.address.utxo
    )
    router.get(
      '/addrs/:address/utxo',
      originalAddressMiddleware,
      controller.insight.address.utxo
    )
    router.get(
      '/addrs/:address/unspent',
      originalAddressMiddleware,
      controller.insight.address.unspent
    )

    router.get(
      '/addr/:address/balance',
      insightAddressMiddleware,
      controller.insight.address.balance
    )
    router.get(
      '/addr/:address/totalReceived',
      insightAddressMiddleware,
      controller.insight.address.totalReceived
    )
    router.get(
      '/addr/:address/totalSent',
      insightAddressMiddleware,
      controller.insight.address.totalSent
    )
    router.get(
      '/addr/:address/unconfirmedBalance',
      insightAddressMiddleware,
      controller.insight.address.unconfirmedBalance
    )
    router.get(
      '/addrs/:address/txs',
      originalAddressMiddleware,
      insightPaginationMiddleware(10),
      controller.insight.address.transactions
    )
    router.post(
      '/addrs/txs',
      insightPaginationMiddleware(10),
      controller.insight.address.postTransactions
    )

    router.get('/status', controller.insight.info.index)
    router.get('/sync', controller.insight.info.sync)
    router.get('/peer', controller.insight.info.peer)
    router.get('/version', controller.insight.info.version)
  } else if (apiType === 'blockbook') {
    router.get('/', controller.blockbook.info.index)
    router.get('/block-index/:block', controller.insight.block.blockIndex)
    router.get('/v1/block-index/:block', controller.insight.block.blockIndex)
    router.get('/v2/block-index/:block', controller.insight.block.blockIndex)
    router.get('/block/:block', controller.blockbook.block.blockV1)
    router.get('/v1/block/:block', controller.blockbook.block.blockV1)
    router.get('/v2/block/:block', controller.blockbook.block.blockV2)

    router.get('/tx/:id', controller.blockbook.transaction.transactionV1)
    router.get('/v1/tx/:id', controller.blockbook.transaction.transactionV1)
    router.get('/v2/tx/:id', controller.blockbook.transaction.transactionV2)
    router.get('/tx-specific/:id', controller.blockbook.transaction.txSpecific)
    router.get(
      '/v1/tx-specific/:id',
      controller.blockbook.transaction.txSpecific
    )
    router.get(
      '/v2/tx-specific/:id',
      controller.blockbook.transaction.txSpecific
    )
    router.get('/sendtx/:id', controller.blockbook.transaction.sendTxByGet)
    router.post('/sendtx', controller.blockbook.transaction.sendTxByPost)
    router.get('/v1/sendtx/:id', controller.blockbook.transaction.sendTxByGet)
    router.post('/v1/sendtx', controller.blockbook.transaction.sendTxByPost)
    router.get('/v2/sendtx/:id', controller.blockbook.transaction.sendTxByGet)
    router.post('/v2/sendtx', controller.blockbook.transaction.sendTxByPost)
  }

  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  io.route('subscribe', io.controller.default.subscribe)
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  io.route('unsubscribe', io.controller.default.unsubscribe)
}
