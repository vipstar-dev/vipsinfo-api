import { Controller } from 'egg'

import {
  AddressGrowthObject,
  BlockIntervalStatisticsObject,
  DailyTransactionsObject,
} from '@/app/service/statistics'

export interface IStatisticsController extends Controller {
  dailyTransactions(): Promise<void>
  blockInterval(): Promise<void>
  addressGrowth(): Promise<void>
}

class StatisticsController extends Controller implements IStatisticsController {
  async dailyTransactions(): Promise<void> {
    const { app, ctx } = this
    const dailyTransactions = JSON.parse(
      (await app.redis.hget(app.name, 'daily-transactions')) || '[]'
    ) as DailyTransactionsObject[]
    ctx.body = dailyTransactions.map(
      ({ timestamp, transactionsCount, contractTransactionsCount }) => ({
        time: new Date(timestamp * 1000),
        transactionCount: transactionsCount,
        contractTransactionCount: contractTransactionsCount,
      })
    )
  }

  async blockInterval(): Promise<void> {
    const { app, ctx } = this
    ctx.body = JSON.parse(
      (await app.redis.hget(app.name, 'block-interval')) || '[]'
    ) as BlockIntervalStatisticsObject[]
  }

  async addressGrowth(): Promise<void> {
    const { app, ctx } = this
    const addressGrowth = JSON.parse(
      (await app.redis.hget(app.name, 'address-growth')) || '[]'
    ) as AddressGrowthObject[]
    ctx.body = addressGrowth.map(({ timestamp, count }) => ({
      time: new Date(timestamp * 1000),
      addresses: count,
    }))
  }
}

export default StatisticsController
