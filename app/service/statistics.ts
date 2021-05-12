import { ContextStateBase, Service } from 'egg'
import { QueryTypes } from 'sequelize'
import Address from 'vipsinfo/node/models/address'
import { sql } from 'vipsinfo/node/utils'

interface DailyTransactionsDb {
  date: number
  transactionsCount: number
  contractTransactionsCount: number
}

export interface DailyTransactionsObject
  extends Omit<DailyTransactionsDb, 'date'> {
  timestamp: number
}

interface BlockIntervalStatisticsDb {
  blockInterval: number
  count: number
}

export interface BlockIntervalStatisticsObject {
  interval: number
  count: number
  percentage: number
}

interface AddressGrowthDb {
  date: number
  count: number
}

export interface AddressGrowthObject {
  timestamp: number
  count: number
}

export interface IStatisticsService extends Service {
  getDailyTransactions(): Promise<DailyTransactionsObject[]>
  getBlockIntervalStatistics(): Promise<BlockIntervalStatisticsObject[]>
  getAddressGrowth(): Promise<AddressGrowthObject[]>
}

class StatisticsService extends Service implements IStatisticsService {
  async getDailyTransactions(): Promise<DailyTransactionsObject[]> {
    const db = this.ctx.model
    const result: DailyTransactionsDb[] = await db.query(
      sql`
      SELECT
        FLOOR(header.timestamp / 86400) AS date,
        SUM(block.transactions_count) AS transactionsCount,
        SUM(block.contract_transactions_count) AS contractTransactionsCount
      FROM header, block
      WHERE header.height = block.height
      GROUP BY date
      ORDER BY date ASC
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    return result.map(
      ({ date, transactionsCount, contractTransactionsCount }) => ({
        timestamp: date * 86400,
        transactionsCount,
        contractTransactionsCount,
      })
    )
  }

  async getBlockIntervalStatistics(): Promise<BlockIntervalStatisticsObject[]> {
    const db = this.ctx.model
    const result: BlockIntervalStatisticsDb[] = await db.query(
      sql`
      SELECT CAST(header.timestamp AS SIGNED) - CAST(prev_header.timestamp AS SIGNED) AS blockInterval, COUNT(*) AS count FROM header
      INNER JOIN header prev_header ON prev_header.height = CAST(header.height AS SIGNED) - 1
      GROUP BY blockInterval
      ORDER BY blockInterval ASC
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    const total = this.app.blockchainInfo.tip?.height as number
    return result.map(({ blockInterval, count }) => ({
      interval: blockInterval,
      count,
      percentage: count / total,
    }))
  }

  async getAddressGrowth(): Promise<AddressGrowthObject[]> {
    const db = this.ctx.model
    const result: AddressGrowthDb[] = await db.query(
      sql`
      SELECT FLOOR(header.timestamp / 86400) AS date, COUNT(*) AS count FROM address, header
      WHERE address.create_height = header.height AND address.type < ${Address.parseType(
        'contract'
      )}
      GROUP BY date
      ORDER BY date ASC
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    let sum = 0
    return result.map(({ date, count }) => {
      sum += count
      return {
        timestamp: date * 86400,
        count: sum,
      }
    })
  }
}

export default StatisticsService
