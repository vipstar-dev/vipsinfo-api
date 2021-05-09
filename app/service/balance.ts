import { ContextStateBase, ContextStateForPagination, Service } from 'egg'
import { Op, Optional, QueryTypes } from 'sequelize'
import Address from 'vipsinfo/node/models/address'
import BalanceChange from 'vipsinfo/node/models/balance-change'
import Header from 'vipsinfo/node/models/header'
import RichList from 'vipsinfo/node/models/rich-rist'
import Transaction from 'vipsinfo/node/models/transaction'
import TransactionOutput from 'vipsinfo/node/models/transaction-output'
import { sql } from 'vipsinfo/node/utils'
const { between: $between, in: $in, ne: $ne, gt: $gt } = Op

interface TotalBalanceChangesObjectFromDb {
  totalReceived: string
  totalSent: string
}

export interface TotalBalanceChangesObject {
  totalReceived: bigint
  totalSent: bigint
}

export interface BalanceHistoryObject {
  totalCount: number
  transactions: TransactionHistory[]
}

export interface RichListObject {
  totalCount: number
  list: {
    address: string
    balance: bigint
  }[]
}

interface BalanceHistory1
  extends Pick<
    BalanceChange,
    'transactionId' | 'blockHeight' | 'indexInBlock' | 'value'
  > {
  header: Pick<Header, 'hash' | 'timestamp'>
  transaction: Pick<Transaction, 'id'>
}

interface BalanceHistory2
  extends Pick<Transaction, 'id' | 'blockHeight' | 'indexInBlock'>,
    Pick<Header, 'timestamp'> {
  transactionId: bigint
  blockHash: Buffer
  value: bigint
}

export interface TransactionHistory {
  amount: bigint
  block: {
    hash: Buffer
    height: number
    timestamp: number
  }
  id: Buffer
  balance: bigint
}

interface RichListDb {
  address: string
  balance: bigint
}

interface UpdateRichListDb {
  addressId: bigint
  balance: bigint
}

export interface IBalanceService extends Service {
  getBalance(ids: bigint[]): Promise<bigint>
  getTotalBalanceChanges(ids: bigint[]): Promise<TotalBalanceChangesObject>
  getUnconfirmedBalance(ids: bigint[]): Promise<bigint>
  getStakingBalance(ids: bigint[]): Promise<bigint>
  getMatureBalance(ids: bigint[]): Promise<bigint>
  getBalanceHistory(
    ids: bigint[],
    object: { nonZero: boolean }
  ): Promise<BalanceHistoryObject>
  getRichList(): Promise<RichListObject>
  updateRichList(): Promise<void>
  getBalanceRanking(addressIds: bigint[]): Promise<number | null>
}

class BalanceService extends Service implements IBalanceService {
  async getBalance(ids: bigint[]): Promise<bigint> {
    const result = await TransactionOutput.aggregate('value', 'SUM', {
      where: {
        addressId: { [$in]: ids },
        blockHeight: { [$gt]: 0 },
        inputId: 0,
      },
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    return BigInt(result || 0)
  }

  async getTotalBalanceChanges(
    ids: bigint[]
  ): Promise<TotalBalanceChangesObject> {
    if (ids.length === 0) {
      return { totalReceived: BigInt(0), totalSent: BigInt(0) }
    }

    const db = this.ctx.model
    let totalReceived
    let totalSent
    if (ids.length === 1) {
      const [result]: TotalBalanceChangesObjectFromDb[] = await db.query(
        sql`
        SELECT
          SUM(CAST(GREATEST(value, 0) AS DECIMAL(24))) AS totalReceived,
          SUM(CAST(GREATEST(-value, 0) AS DECIMAL(24))) AS totalSent
        FROM balance_change WHERE address_id = ${ids[0]} AND block_height > 0
      `,
        {
          type: QueryTypes.SELECT,
          transaction: (this.ctx.state as ContextStateBase).transaction,
        }
      )
      totalReceived = BigInt(
        result.totalReceived == null ? 0 : result.totalReceived
      )
      totalSent = BigInt(result.totalSent == null ? 0 : result.totalSent)
    } else {
      const [result]: TotalBalanceChangesObjectFromDb[] = await db.query(
        sql`
        SELECT
          SUM(CAST(GREATEST(value, 0) AS DECIMAL(24))) AS totalReceived,
          SUM(CAST(GREATEST(-value, 0) AS DECIMAL(24))) AS totalSent
        FROM (
          SELECT SUM(value) AS value FROM balance_change
          WHERE address_id IN ${ids} AND block_height > 0
          GROUP BY transaction_id
        ) AS temp
      `,
        {
          type: QueryTypes.SELECT,
          transaction: (this.ctx.state as ContextStateBase).transaction,
        }
      )
      totalReceived = BigInt(
        result.totalReceived == null ? 0 : result.totalReceived
      )
      totalSent = BigInt(result.totalSent == null ? 0 : result.totalSent)
    }
    return { totalReceived, totalSent }
  }

  async getUnconfirmedBalance(ids: bigint[]): Promise<bigint> {
    const result = await TransactionOutput.aggregate('value', 'SUM', {
      where: {
        addressId: { [$in]: ids },
        blockHeight: 0xffffffff,
        inputHeight: null,
      },
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    return BigInt(result || 0)
  }

  async getStakingBalance(ids: bigint[]): Promise<bigint> {
    const result = await TransactionOutput.aggregate('value', 'SUM', {
      where: {
        addressId: { [$in]: ids },
        blockHeight: {
          [$gt]: (this.app.blockchainInfo.tip?.height as number) - 500,
        },
        inputHeight: null,
        isStake: true,
      },
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    return BigInt(result || 0)
  }

  async getMatureBalance(ids: bigint[]): Promise<bigint> {
    const result = await TransactionOutput.aggregate('value', 'SUM', {
      where: {
        addressId: { [$in]: ids },
        blockHeight: {
          [$between]: [
            1,
            (this.app.blockchainInfo.tip?.height as number) - 500,
          ],
        },
        inputHeight: null,
      },
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    return BigInt(result || 0)
  }

  async getBalanceHistory(
    ids: bigint[],
    { nonZero = false }: { nonZero: boolean }
  ): Promise<BalanceHistoryObject> {
    if (ids.length === 0) {
      return { totalCount: 0, transactions: [] }
    }
    const db = this.ctx.model
    const { limit, offset, reversed = true } = (this.ctx
      .state as ContextStateForPagination).pagination
    const order = reversed ? 'DESC' : 'ASC'

    let totalCount: number
    let transactionIds: bigint[]
    let list: (BalanceHistory1 | BalanceHistory2)[]
    if (ids.length === 1) {
      const valueFilter = nonZero ? { value: { [$ne]: 0 } } : {}
      totalCount = await BalanceChange.count({
        where: {
          addressId: ids[0],
          blockHeight: { [$gt]: 0 },
          ...valueFilter,
        },
        distinct: true,
        col: 'transactionId',
        transaction: (this.ctx.state as ContextStateBase).transaction,
      })
      if (totalCount === 0) {
        return { totalCount: 0, transactions: [] }
      }
      transactionIds = (
        await BalanceChange.findAll({
          where: { addressId: ids[0], ...valueFilter },
          attributes: ['transactionId'],
          order: [
            ['blockHeight', order],
            ['indexInBlock', order],
            ['transactionId', order],
          ],
          limit,
          offset,
          transaction: (this.ctx.state as ContextStateBase).transaction,
        })
      ).map(({ transactionId }) => transactionId)
      list = (await BalanceChange.findAll({
        where: { transactionId: { [$in]: transactionIds }, addressId: ids[0] },
        attributes: ['transactionId', 'blockHeight', 'indexInBlock', 'value'],
        include: [
          {
            model: Header,
            as: 'header',
            required: false,
            attributes: ['hash', 'timestamp'],
          },
          {
            model: Transaction,
            as: 'transaction',
            required: true,
            attributes: ['id'],
          },
        ],
        order: [
          ['blockHeight', order],
          ['indexInBlock', order],
          ['transactionId', order],
        ],
        transaction: (this.ctx.state as ContextStateBase).transaction,
      })) as BalanceHistory1[]
    } else {
      const havingFilter = nonZero ? 'SUM(value) != 0' : null
      if (havingFilter) {
        const [{ count }]: { count: number }[] = await db.query(
          sql`
          SELECT COUNT(*) AS count FROM (
            SELECT transaction_id FROM balance_change
            WHERE address_id IN ${ids} AND block_height > 0
            GROUP BY transaction_id
            HAVING ${{ raw: havingFilter }}
          ) list
        `,
          {
            type: QueryTypes.SELECT,
            transaction: (this.ctx.state as ContextStateBase).transaction,
          }
        )
        totalCount = count
      } else {
        totalCount = await BalanceChange.count({
          where: { addressId: { [$in]: ids }, blockHeight: { [$gt]: 0 } },
          distinct: true,
          col: 'transactionId',
          transaction: (this.ctx.state as ContextStateBase).transaction,
        })
      }
      if (totalCount === 0) {
        return { totalCount: 0, transactions: [] }
      }
      if (havingFilter) {
        const balanceChanges: Pick<
          BalanceChange,
          'blockHeight' | 'indexInBlock' | 'transactionId'
        >[] = await db.query(
          sql`
          SELECT MIN(block_height) AS blockHeight, MIN(index_in_block) AS indexInBlock, transaction_id AS transactionId
          FROM balance_change
          WHERE address_id IN ${ids} AND block_height > 0
          GROUP BY transaction_id
          HAVING ${{ raw: havingFilter }}
          ORDER BY block_height ${{ raw: order }}, index_in_block ${{
            raw: order,
          }}, transaction_id ${{ raw: order }}
          LIMIT ${offset}, ${limit}
        `,
          {
            type: QueryTypes.SELECT,
            transaction: (this.ctx.state as ContextStateBase).transaction,
          }
        )
        transactionIds = balanceChanges.map(
          ({ transactionId }) => transactionId
        )
      } else {
        transactionIds = (
          await BalanceChange.findAll({
            where: { addressId: { [$in]: ids } },
            attributes: ['transactionId'],
            order: [
              ['blockHeight', order],
              ['indexInBlock', order],
              ['transactionId', order],
            ],
            limit,
            offset,
            transaction: (this.ctx.state as ContextStateBase).transaction,
          })
        ).map(({ transactionId }) => transactionId)
      }
      const dbQuery: Promise<BalanceHistory2[]> = db.query(
        sql`
        SELECT
          transaction.id AS id, transaction.block_height AS blockHeight,
          transaction.index_in_block AS indexInBlock, transaction._id AS transactionId,
          header.hash AS blockHash, header.timestamp AS timestamp,
          list.value AS value
        FROM (
          SELECT MIN(block_height) AS block_height, MIN(index_in_block) AS index_in_block, transaction_id, SUM(value) AS value
          FROM balance_change
          WHERE transaction_id IN ${transactionIds} AND address_id IN ${ids}
          GROUP BY transaction_id
          ORDER BY block_height ${{ raw: order }}, index_in_block ${{
          raw: order,
        }}, transaction_id ${{ raw: order }}
        ) list
        INNER JOIN transaction ON transaction._id = list.transaction_id
        LEFT JOIN header ON header.height = transaction.block_height
      `,
        {
          type: QueryTypes.SELECT,
          transaction: (this.ctx.state as ContextStateBase).transaction,
        }
      )
      list = await dbQuery
    }

    if (reversed) {
      list = list.reverse()
    }
    let initialBalance = BigInt(0)
    if (list.length > 0) {
      const { blockHeight, indexInBlock, transactionId } = list[0]
      const [{ value }]: { value: number }[] = await db.query(
        sql`
        SELECT SUM(value) AS value FROM balance_change
        WHERE address_id IN ${ids}
          AND (block_height, index_in_block, transaction_id) < (${blockHeight}, ${indexInBlock}, ${transactionId})
      `,
        {
          type: QueryTypes.SELECT,
          transaction: (this.ctx.state as ContextStateBase).transaction,
        }
      )
      initialBalance = BigInt(value || 0)
    }
    let transactions: Optional<
      TransactionHistory,
      'balance' | 'block'
    >[] = list.map((item) => ({
      id:
        (item as BalanceHistory2).id ||
        (item as BalanceHistory1).transaction.id,
      ...((item as BalanceHistory1).header
        ? {
            block: {
              hash: (item as BalanceHistory1).header.hash,
              height: (item as BalanceHistory1).blockHeight,
              timestamp: (item as BalanceHistory1).header.timestamp,
            },
          }
        : {}),
      ...((item as BalanceHistory2).blockHash
        ? {
            block: {
              hash: (item as BalanceHistory2).blockHash,
              height: (item as BalanceHistory2).blockHeight,
              timestamp: (item as BalanceHistory2).timestamp,
            },
          }
        : {}),
      amount: BigInt(item.value),
    }))
    for (const tx of transactions) {
      tx.balance = initialBalance += tx.amount
    }
    if (reversed) {
      transactions = transactions.reverse()
    }
    return { totalCount, transactions } as BalanceHistoryObject
  }

  async getRichList(): Promise<RichListObject> {
    const db = this.ctx.model
    const { limit, offset } = (this.ctx
      .state as ContextStateForPagination).pagination
    const totalCount = await RichList.count({
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const list: RichListDb[] = await db.query(
      sql`
      SELECT address.string AS address, rich_list.balance AS balance
      FROM (SELECT address_id FROM rich_list ORDER BY balance DESC LIMIT ${offset}, ${limit}) list
      INNER JOIN rich_list USING (address_id)
      INNER JOIN address ON address._id = list.address_id
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    return {
      totalCount,
      list: list.map((item) => ({
        address: item.address,
        balance: BigInt(item.balance),
      })),
    }
  }

  async updateRichList(): Promise<void> {
    const db = this.ctx.model
    const transaction = await db.transaction()
    try {
      const blockHeight = this.app.blockchainInfo.tip?.height as number
      const list: UpdateRichListDb[] = await db.query(
        sql`
        SELECT list.address_id AS addressId, list.balance AS balance
        FROM (
          SELECT address_id, SUM(value) AS balance
          FROM transaction_output
          WHERE
            address_id > 0
            AND (input_height IS NULL OR input_height > ${blockHeight})
            AND (block_height BETWEEN 1 AND ${blockHeight})
            AND value > 0
          GROUP BY address_id
        ) list
        INNER JOIN address ON address._id = list.address_id
        WHERE address.type < ${Address.parseType('contract')}
      `,
        { type: QueryTypes.SELECT, transaction }
      )
      await db.query(sql`DELETE FROM rich_list`, { transaction })
      await RichList.bulkCreate(
        list.map(({ addressId, balance }) => ({
          addressId,
          balance: BigInt(balance),
        })),
        { validate: false, transaction, logging: false }
      )
      await transaction.commit()
    } catch (err) {
      await transaction.rollback()
    }
  }

  async getBalanceRanking(addressIds: bigint[]): Promise<number | null> {
    if (addressIds.length !== 1) {
      return null
    }
    const item = await RichList.findOne({
      where: { addressId: addressIds[0] },
      attributes: ['balance'],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    if (item == null) {
      return null
    } else {
      return (
        (await RichList.count({
          where: { balance: { [$gt]: item.balance.toString() } },
          transaction: (this.ctx.state as ContextStateBase).transaction,
        })) + 1
      )
    }
  }
}

export default BalanceService
