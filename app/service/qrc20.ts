import { ContextStateBase, ContextStateForPagination, Service } from 'egg'
import { col, literal, Op, QueryTypes, where } from 'sequelize'
import {
  Address as RawAddress,
  EVMContractCallBySenderScript,
  EVMContractCallScript,
  IAddress,
  IMethodABI,
  OutputScript,
  qrc20ABIs,
} from 'vipsinfo/lib'
import Address from 'vipsinfo/node/models/address'
import Contract from 'vipsinfo/node/models/contract'
import EVMReceipt from 'vipsinfo/node/models/evm-receipt'
import EVMReceiptLog from 'vipsinfo/node/models/evm-receipt-log'
import Header from 'vipsinfo/node/models/header'
import QRC20 from 'vipsinfo/node/models/qrc20'
import QRC20Balance from 'vipsinfo/node/models/qrc20-balance'
import QRC20Statistics, {
  Qrc20StatisticsCreationAttributes,
} from 'vipsinfo/node/models/qrc20-statistics'
import Transaction from 'vipsinfo/node/models/transaction'
import TransactionOutput from 'vipsinfo/node/models/transaction-output'
import { sql } from 'vipsinfo/node/utils'

const { gt: $gt, ne: $ne, and: $and, or: $or, in: $in } = Op

interface Qrc20Db {
  address: string
  addressHex: Buffer
  name: Buffer
  symbol: Buffer
  decimals: number
  totalSupply: Buffer
  version: Buffer
  holders: number
  transactions: number
}

export interface Qrc20Tokens {
  address: string
  addressHex: Buffer
  name: string
  symbol: string
  decimals: number
  totalSupply: bigint
  version: string | undefined
  holders: number
  transactions: number
}

export interface ListQrc20Tokens {
  totalCount: number
  tokens: Qrc20Tokens[]
}

interface Qrc20ListDb
  extends Pick<QRC20, 'contractAddress' | 'name' | 'symbol' | 'decimals'> {
  contract: Pick<Contract, 'addressString'> & {
    qrc20Balances: Pick<QRC20Balance, 'balance'>[]
  }
}
export interface UnconfirmedObject {
  received: bigint
  sent: bigint
}

export interface Qrc20Data {
  address: string
  addressHex: Buffer
  name: string
  symbol: string
  decimals: number
  balance: bigint
  unconfirmed: UnconfirmedObject
  isUnconfirmed?: true
  isNew?: true
}

interface AllBalanceUnconfirmedListDb extends Pick<EVMReceipt, 'senderData'> {
  output: Pick<TransactionOutput, 'scriptPubKey'> & {
    address: Pick<Address, '_id'> & {
      contract: Pick<Contract, 'address' | 'addressString'> & {
        qrc20: Pick<QRC20, 'name' | 'symbol' | 'decimals'>
      }
    }
  }
}

interface BalanceUnconfirmedListDb extends Pick<EVMReceipt, 'senderData'> {
  output: Pick<TransactionOutput, 'scriptPubKey'> & {
    address: Pick<Address, '_id'>
  }
}

export interface Qrc20BalanceObject {
  name: string
  symbol: string
  decimals: number
  balance: bigint
  unconfirmed: UnconfirmedObject
}

interface Qrc20BalanceHistoryListDb
  extends Pick<EVMReceipt, 'blockHeight' | 'indexInBlock'> {
  header: Pick<Header, 'hash' | 'timestamp'>
  transaction: Pick<Transaction, 'id'>
  logs: (Pick<EVMReceiptLog, 'address' | 'topic2' | 'topic3' | 'data'> & {
    contract: Pick<Contract, 'addressString'>
    qrc20: Pick<QRC20, 'name' | 'symbol' | 'decimals'>
  })[]
}

interface InitialBalanceListDb extends Pick<QRC20Balance, 'balance'> {
  contract: Pick<Contract, 'addressString'>
}

interface LatestLogDb
  extends Pick<
    EVMReceiptLog,
    'address' | 'topic2' | 'topic3' | 'data' | 'receipt'
  > {
  contract: Pick<Contract, 'addressString'>
}

export interface BalanceHistoryToken {
  address: string
  addressHex: Buffer
  name: string
  symbol: string
  decimals: number
  amount: bigint
  balance: bigint
}

export interface BalanceHistoryResult {
  id: Buffer
  block: {
    hash: Buffer
    height: number
    timestamp: number
  }
  tokens: BalanceHistoryToken[]
}

export interface Qrc20BalanceHistoryObject {
  totalCount: number
  transactions: BalanceHistoryResult[]
}

interface TokenTransactionDb
  extends Pick<EVMReceipt, 'outputIndex' | 'blockHeight'>,
    Pick<Header, 'timestamp'>,
    Pick<QRC20, 'name' | 'symbol' | 'decimals'>,
    Pick<EVMReceiptLog, 'topic2' | 'topic3' | 'data'> {
  transactionId: Buffer
  blockHash: Buffer
}

export interface TokenTransaction
  extends Pick<EVMReceipt, 'outputIndex' | 'blockHeight'>,
    Pick<Header, 'timestamp'> {
  transactionId: Buffer
  blockHash: Buffer
  from: string
  fromHex?: Buffer
  to: string
  toHex?: Buffer
  value: bigint
}

export interface AllTokenTransactionsObject {
  totalCount: number
  transactions: (TokenTransaction & {
    token: Pick<Qrc20BalanceObject, 'name' | 'symbol' | 'decimals'>
  })[]
}

export interface TokenTransactionsObject {
  totalCount: number
  transactions: TokenTransaction[]
}

export interface TokenRichListObject {
  totalCount: number
  list: {
    address: string
    addressHex?: string
    balance: bigint | null
  }[]
}

interface StatisticsResultDb extends Pick<QRC20Balance, 'contractAddress'> {
  count: number
}

export interface IQRC20Service extends Service {
  listQRC20Tokens(): Promise<ListQrc20Tokens>
  getAllQRC20Balances(hexAddresses: Buffer[]): Promise<Qrc20Data[]>
  getQRC20Balance(
    rawAddresses: IAddress[],
    tokenAddress: Buffer
  ): Promise<Qrc20BalanceObject | void>
  getQRC20BalanceHistory(
    addresses: Buffer[],
    tokenAddress: Buffer
  ): Promise<Qrc20BalanceHistoryObject>
  getAllQRC20TokenTransactions(): Promise<AllTokenTransactionsObject>
  getQRC20TokenTransactions(
    contractAddress: Buffer
  ): Promise<TokenTransactionsObject>
  getQRC20TokenRichList(contractAddress: Buffer): Promise<TokenRichListObject>
  updateQRC20Statistics(): Promise<void>
}

class QRC20Service extends Service implements IQRC20Service {
  async listQRC20Tokens(): Promise<ListQrc20Tokens> {
    const db = this.ctx.model
    const { limit, offset } = (this.ctx
      .state as ContextStateForPagination).pagination

    const totalCount = await QRC20Statistics.count({
      where: { transactions: { [$gt]: 0 } },
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const list: Qrc20Db[] = await db.query(
      sql`
      SELECT
        contract.address_string AS address, contract.address AS addressHex,
        qrc20.name AS name, qrc20.symbol AS symbol, qrc20.decimals AS decimals, qrc20.total_supply AS totalSupply,
        qrc20.version AS version,
        list.holders AS holders,
        list.transactions AS transactions
      FROM (
        SELECT contract_address, holders, transactions FROM qrc20_statistics
        WHERE transactions > 0
        ORDER BY transactions DESC
        LIMIT ${offset}, ${limit}
      ) list
      INNER JOIN qrc20 USING (contract_address)
      INNER JOIN contract ON contract.address = list.contract_address
      ORDER BY transactions DESC
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )

    return {
      totalCount,
      tokens: list.map((item) => ({
        address: item.addressHex.toString('hex'),
        addressHex: item.addressHex,
        name: item.name.toString(),
        symbol: item.symbol.toString(),
        decimals: item.decimals,
        totalSupply: BigInt(`0x${item.totalSupply.toString('hex')}`),
        version: item.version && item.version.toString(),
        holders: item.holders,
        transactions: item.transactions,
      })),
    }
  }

  async getAllQRC20Balances(hexAddresses: Buffer[]): Promise<Qrc20Data[]> {
    if (hexAddresses.length === 0) {
      return []
    }
    const transferABI = qrc20ABIs.find(
      (abi) => abi.name === 'transfer'
    ) as IMethodABI
    const list: Qrc20ListDb[] = await QRC20.findAll({
      attributes: ['contractAddress', 'name', 'symbol', 'decimals'],
      include: [
        {
          model: Contract,
          as: 'contract',
          required: true,
          attributes: ['addressString'],
          include: [
            {
              model: QRC20Balance,
              as: 'qrc20Balances',
              required: true,
              where: { address: { [$in]: hexAddresses } },
              attributes: ['balance'],
            },
          ],
        },
      ],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const mapping = new Map<string, Qrc20Data>(
      list.map((item) => [
        item.contract.addressString,
        {
          address: item.contractAddress.toString('hex'),
          addressHex: item.contractAddress,
          name: item.name,
          symbol: item.symbol,
          decimals: item.decimals,
          balance: item.contract.qrc20Balances
            .map(({ balance }) => balance)
            .reduce((x, y) => (x || BigInt(0)) + (y || BigInt(0))) as bigint,
          unconfirmed: {
            received: BigInt(0),
            sent: BigInt(0),
          },
        },
      ])
    )
    const unconfirmedList: AllBalanceUnconfirmedListDb[] = await EVMReceipt.findAll(
      {
        where: { blockHeight: 0xffffffff },
        attributes: ['senderData'],
        include: [
          {
            model: TransactionOutput,
            as: 'output',
            on: {
              transactionId: where(
                col('output.transaction_id'),
                '=',
                col('evm_receipt.transaction_id')
              ),
              outputIndex: where(
                col('output.output_index'),
                '=',
                col('evm_receipt.output_index')
              ),
            },
            required: true,
            attributes: ['scriptPubKey'],
            include: [
              {
                model: Address,
                as: 'address',
                required: true,
                attributes: ['_id'],
                include: [
                  {
                    model: Contract,
                    as: 'contract',
                    required: true,
                    attributes: ['address', 'addressString'],
                    include: [
                      {
                        model: QRC20,
                        as: 'qrc20',
                        required: true,
                        attributes: ['name', 'symbol', 'decimals'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    for (const item of unconfirmedList) {
      const scriptPubKey = OutputScript.fromBuffer(item.output.scriptPubKey)
      if (
        ![
          OutputScript.EVM_CONTRACT_CALL,
          OutputScript.EVM_CONTRACT_CALL_SENDER,
        ].includes(scriptPubKey.type)
      ) {
        continue
      }
      const byteCode = (scriptPubKey as
        | EVMContractCallScript
        | EVMContractCallBySenderScript).byteCode as Buffer
      if (
        byteCode.length === 68 &&
        Buffer.compare(byteCode.slice(0, 4), transferABI.id) === 0 &&
        Buffer.compare(byteCode.slice(4, 16), Buffer.alloc(12)) === 0
      ) {
        let data: Qrc20Data
        if (mapping.has(item.output.address.contract.addressString)) {
          data = mapping.get(
            item.output.address.contract.addressString
          ) as Qrc20Data
        } else {
          data = {
            address: item.output.address.contract.address.toString('hex'),
            addressHex: item.output.address.contract.address,
            name: item.output.address.contract.qrc20.name,
            symbol: item.output.address.contract.qrc20.symbol,
            decimals: item.output.address.contract.qrc20.decimals,
            balance: BigInt(0),
            unconfirmed: {
              received: BigInt(0),
              sent: BigInt(0),
            },
            isUnconfirmed: true,
            isNew: true,
          }
          mapping.set(item.output.address.contract.addressString, data)
        }
        const from = item.senderData
        const to = byteCode.slice(16, 36)
        const value = BigInt(`0x${byteCode.slice(36).toString('hex')}`)
        const isFrom = hexAddresses.some(
          (address) => Buffer.compare(address, from) === 0
        )
        const isTo = hexAddresses.some(
          (address) => Buffer.compare(address, to) === 0
        )
        if (isFrom || isTo) {
          delete data.isNew
        }
        if (isFrom && !isTo) {
          data.unconfirmed.sent += value
        } else if (!isFrom && isTo) {
          data.unconfirmed.received += value
        }
      }
    }
    return [...mapping.values()].filter((item) => !item.isNew)
  }

  async getQRC20Balance(
    rawAddresses: IAddress[],
    tokenAddress: Buffer
  ): Promise<Qrc20BalanceObject | void> {
    const transferABI = qrc20ABIs.find(
      (abi) => abi.name === 'transfer'
    ) as IMethodABI
    const hexAddresses = rawAddresses
      .filter((address) =>
        [
          RawAddress.PAY_TO_PUBLIC_KEY_HASH,
          RawAddress.CONTRACT,
          RawAddress.EVM_CONTRACT,
        ].includes(address.type as string)
      )
      .map((address) => address.data as Buffer)
    if (hexAddresses.length === 0) {
      return
    }
    let token: Pick<
      QRC20,
      'name' | 'symbol' | 'decimals'
    > | null = await QRC20.findOne({
      where: { contractAddress: tokenAddress },
      attributes: ['name', 'symbol', 'decimals'],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    this.ctx.assert(token, 400)
    token = token as Pick<QRC20, 'name' | 'symbol' | 'decimals'>
    const list: Pick<QRC20Balance, 'balance'>[] = await QRC20Balance.findAll({
      where: {
        contractAddress: tokenAddress,
        address: { [$in]: hexAddresses },
      },
      attributes: ['balance'],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const unconfirmedList: BalanceUnconfirmedListDb[] = await EVMReceipt.findAll(
      {
        where: { blockHeight: 0xffffffff },
        attributes: ['senderData'],
        include: [
          {
            model: TransactionOutput,
            as: 'output',
            on: {
              transactionId: where(
                col('output.transaction_id'),
                '=',
                col('evm_receipt.transaction_id')
              ),
              outputIndex: where(
                col('output.output_index'),
                '=',
                col('evm_receipt.output_index')
              ),
            },
            required: true,
            attributes: ['scriptPubKey'],
            include: [
              {
                model: Address,
                as: 'address',
                required: true,
                attributes: [],
                include: [
                  {
                    model: Contract,
                    as: 'contract',
                    required: true,
                    where: { address: tokenAddress },
                    attributes: [],
                  },
                ],
              },
            ],
          },
        ],
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    const unconfirmed = {
      received: BigInt(0),
      sent: BigInt(0),
    }
    for (const item of unconfirmedList) {
      const scriptPubKey = OutputScript.fromBuffer(item.output.scriptPubKey)
      if (
        ![
          OutputScript.EVM_CONTRACT_CALL,
          OutputScript.EVM_CONTRACT_CALL_SENDER,
        ].includes(scriptPubKey.type)
      ) {
        continue
      }
      const byteCode = (scriptPubKey as
        | EVMContractCallScript
        | EVMContractCallBySenderScript).byteCode as Buffer
      if (
        byteCode.length === 68 &&
        Buffer.compare(byteCode.slice(0, 4), transferABI.id) === 0 &&
        Buffer.compare(byteCode.slice(4, 16), Buffer.alloc(12)) === 0
      ) {
        const from = item.senderData
        const to = byteCode.slice(16, 36)
        const value = BigInt(`0x${byteCode.slice(36).toString('hex')}`)
        const isFrom = hexAddresses.some(
          (address) => Buffer.compare(address, from) === 0
        )
        const isTo = hexAddresses.some(
          (address) => Buffer.compare(address, to) === 0
        )
        if (isFrom && !isTo) {
          unconfirmed.sent += value
        } else if (!isFrom && isTo) {
          unconfirmed.received += value
        }
      }
    }
    return {
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      balance: list
        .map(({ balance }) => balance)
        .reduce(
          (x, y) => (x || BigInt(0)) + (y || BigInt(0)),
          BigInt(0)
        ) as bigint,
      unconfirmed,
    }
  }

  async getQRC20BalanceHistory(
    addresses: Buffer[],
    tokenAddress: Buffer
  ): Promise<Qrc20BalanceHistoryObject> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const db = this.ctx.model
    if (addresses.length === 0) {
      return { totalCount: 0, transactions: [] }
    }
    const addressSet = new Set(
      addresses.map((address) => address.toString('hex'))
    )
    const topicAddresses = addresses.map((address) =>
      Buffer.concat([Buffer.alloc(12), address])
    )
    const { limit, offset, reversed = true } = (this.ctx
      .state as ContextStateForPagination).pagination
    const order = reversed ? 'DESC' : 'ASC'
    const logFilter = [
      ...(tokenAddress ? [sql`log.address = ${tokenAddress}`] : []),
      sql`log.topic1 = ${TransferABI.id}`,
      'log.topic3 IS NOT NULL',
      'log.topic4 IS NULL',
      sql`(log.topic2 IN ${topicAddresses} OR log.topic3 IN ${topicAddresses})`,
    ].join(' AND ')

    const [{ totalCount }]: { totalCount: number }[] = await db.query(
      sql`
      SELECT COUNT(DISTINCT(receipt.transaction_id)) AS totalCount
      FROM evm_receipt receipt, evm_receipt_log log, qrc20
      WHERE receipt._id = log.receipt_id AND log.address = qrc20.contract_address AND ${{
        raw: logFilter,
      }}
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    if (totalCount === 0) {
      return { totalCount: 0, transactions: [] }
    }
    const dbIds: { id: bigint }[] = await db.query(
      sql`
      SELECT transaction_id AS id FROM evm_receipt receipt
      INNER JOIN (
        SELECT DISTINCT(receipt.transaction_id) AS id FROM evm_receipt receipt, evm_receipt_log log, qrc20
        WHERE receipt._id = log.receipt_id AND log.address = qrc20.contract_address AND ${{
          raw: logFilter,
        }}
      ) list ON list.id = receipt.transaction_id
      ORDER BY receipt.block_height ${{
        raw: order,
      }}, receipt.index_in_block ${{ raw: order }},
        receipt.transaction_id ${{ raw: order }}, receipt.output_index ${{
        raw: order,
      }}
      LIMIT ${offset}, ${limit}
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    const ids: bigint[] = dbIds.map(({ id }) => id)

    let list: Qrc20BalanceHistoryListDb[] = await EVMReceipt.findAll({
      where: { transactionId: { [$in]: ids } },
      attributes: ['blockHeight', 'indexInBlock'],
      include: [
        {
          model: Header,
          as: 'header',
          required: true,
          attributes: ['hash', 'timestamp'],
        },
        {
          model: Transaction,
          as: 'transaction',
          required: true,
          attributes: ['id'],
        },
        {
          model: EVMReceiptLog,
          as: 'logs',
          required: true,
          where: {
            ...(tokenAddress ? { address: tokenAddress } : {}),
            topic1: TransferABI.id,
            topic3: { [$ne]: null },
            topic4: null,
            [$or]: [
              { topic2: { [$in]: topicAddresses } },
              { topic3: { [$in]: topicAddresses } },
            ],
          },
          attributes: ['address', 'topic2', 'topic3', 'data'],
          include: [
            {
              model: Contract,
              as: 'contract',
              required: true,
              attributes: ['addressString'],
            },
            {
              model: QRC20,
              as: 'qrc20',
              required: true,
              attributes: ['name', 'symbol', 'decimals'],
            },
          ],
        },
      ],
      order: [
        ['blockHeight', order],
        ['indexInBlock', order],
        ['transactionId', order],
        ['outputIndex', order],
      ],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })

    if (!reversed) {
      list = list.reverse()
    }
    const initialBalanceMap = new Map<string, bigint>()
    if (list.length > 0) {
      const initialBalanceList: InitialBalanceListDb[] = await QRC20Balance.findAll(
        {
          where: {
            ...(tokenAddress ? { contractAddress: tokenAddress } : {}),
            address: { [$in]: addresses },
          },
          attributes: ['balance'],
          include: [
            {
              model: Contract,
              as: 'contract',
              required: true,
              attributes: ['addressString'],
            },
          ],
          transaction: (this.ctx.state as ContextStateBase).transaction,
        }
      )
      for (const { balance, contract } of initialBalanceList) {
        const address = contract.addressString
        initialBalanceMap.set(
          address,
          (initialBalanceMap.get(address) || BigInt(0)) + (balance || BigInt(0))
        )
      }
      const { blockHeight, indexInBlock } = list[0]
      const latestLogs: LatestLogDb[] = await EVMReceiptLog.findAll({
        where: {
          ...(tokenAddress ? { address: tokenAddress } : {}),
          topic1: TransferABI.id,
          topic3: { [$ne]: null },
          topic4: null,
          [$or]: [
            { topic2: { [$in]: topicAddresses } },
            { topic3: { [$in]: topicAddresses } },
          ],
        },
        attributes: ['address', 'topic2', 'topic3', 'data'],
        include: [
          {
            model: EVMReceipt,
            as: 'receipt',
            required: true,
            where: {
              [$and]: literal(
                `(receipt.block_height, receipt.index_in_block) > (${blockHeight}, ${indexInBlock})`
              ),
            },
          },
          {
            model: Contract,
            as: 'contract',
            required: true,
            attributes: ['addressString'],
          },
        ],
        transaction: (this.ctx.state as ContextStateBase).transaction,
      })
      for (const log of latestLogs) {
        const address = log.contract.addressString
        const amount = BigInt(`0x${log.data.toString('hex')}`)
        let balance = initialBalanceMap.get(address) || BigInt(0)
        if (
          log.topic2 &&
          addressSet.has(log.topic2.slice(12).toString('hex'))
        ) {
          balance += amount
        }
        if (
          log.topic3 &&
          addressSet.has(log.topic3.slice(12).toString('hex'))
        ) {
          balance -= amount
        }
        initialBalanceMap.set(address, balance)
      }
    }

    let transactions = list.map(
      ({ blockHeight, header, transaction, logs }) => {
        const result: BalanceHistoryResult = {
          id: transaction.id,
          block: {
            hash: header.hash,
            height: blockHeight,
            timestamp: header.timestamp,
          },
          tokens: [],
        }
        for (const log of logs) {
          const address = log.contract.addressString
          let delta = BigInt(0)
          const amount = BigInt(`0x${log.data.toString('hex')}`)
          if (
            log.topic2 &&
            addressSet.has(log.topic2.slice(12).toString('hex'))
          ) {
            delta -= amount
          }
          if (
            log.topic3 &&
            addressSet.has(log.topic3.slice(12).toString('hex'))
          ) {
            delta += amount
          }
          const item = result.tokens.find((token) => token.address === address)
          if (item) {
            item.amount += delta
          } else {
            result.tokens.push({
              address,
              addressHex: log.address,
              name: log.qrc20.name.toString(),
              symbol: log.qrc20.symbol.toString(),
              decimals: log.qrc20.decimals,
              amount: delta,
              balance: BigInt(0),
            })
          }
        }
        for (const token of result.tokens) {
          let initial = initialBalanceMap.get(token.address) || BigInt(0)
          token.balance = initial
          initial -= token.amount
          initialBalanceMap.set(token.address, initial)
          token.address = token.addressHex.toString('hex')
        }
        return result
      }
    )
    if (!reversed) {
      transactions = transactions.reverse()
    }
    return { totalCount, transactions }
  }

  async getAllQRC20TokenTransactions(): Promise<AllTokenTransactionsObject> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const db = this.ctx.model
    const { limit, offset, reversed = true } = (this.ctx
      .state as ContextStateForPagination).pagination
    const order = reversed ? 'DESC' : 'ASC'

    const [{ totalCount }]: { totalCount: number }[] = await db.query(
      sql`
      SELECT COUNT(*) AS totalCount
      FROM qrc20, evm_receipt_log log
      WHERE qrc20.contract_address = log.address AND log.topic1 = ${TransferABI.id}
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    const transactions: TokenTransactionDb[] = await db.query(
      sql`
      SELECT
        transaction.id AS transactionId,
        evm_receipt.output_index AS outputIndex,
        evm_receipt.block_height AS blockHeight,
        header.hash AS blockHash,
        header.timestamp AS timestamp,
        qrc20.name AS name,
        qrc20.symbol AS symbol,
        qrc20.decimals AS decimals,
        evm_receipt_log.topic2 AS topic2,
        evm_receipt_log.topic3 AS topic3,
        evm_receipt_log.data AS data
      FROM (
        SELECT log._id AS _id FROM qrc20, evm_receipt_log log
        WHERE qrc20.contract_address = log.address AND log.topic1 = ${
          TransferABI.id
        }
        ORDER BY log._id ${{ raw: order }} LIMIT ${offset}, ${limit}
      ) list
      INNER JOIN evm_receipt_log ON evm_receipt_log._id = list._id
      INNER JOIN evm_receipt ON evm_receipt._id = evm_receipt_log.receipt_id
      INNER JOIN qrc20 ON qrc20.contract_address = evm_receipt_log.address
      INNER JOIN transaction ON transaction._id = evm_receipt.transaction_id
      INNER JOIN header ON header.height = evm_receipt.block_height
      ORDER BY list._id ${{ raw: order }}
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )

    const addresses = await this.ctx.service.contract.transformHexAddresses(
      transactions
        .map((transaction) => [
          transaction.topic2?.slice(12) as Buffer,
          transaction.topic3?.slice(12) as Buffer,
        ])
        .flat()
    )
    return {
      totalCount,
      transactions: transactions.map((transaction, index) => {
        const from = addresses[index * 2]
        const to = addresses[index * 2 + 1]
        return {
          transactionId: transaction.transactionId,
          outputIndex: transaction.outputIndex,
          blockHeight: transaction.blockHeight,
          blockHash: transaction.blockHash,
          timestamp: transaction.timestamp,
          token: {
            name: transaction.name.toString(),
            symbol: transaction.symbol.toString(),
            decimals: transaction.decimals,
          },
          ...(from && typeof from === 'object'
            ? { from: from.hex.toString('hex'), fromHex: from.hex }
            : { from }),
          ...(to && typeof to === 'object'
            ? { to: to.hex.toString('hex'), toHex: to.hex }
            : { to }),
          value: BigInt(`0x${transaction.data.toString('hex')}`),
        }
      }),
    }
  }

  async getQRC20TokenTransactions(
    contractAddress: Buffer
  ): Promise<TokenTransactionsObject> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const db = this.ctx.model
    const { limit, offset, reversed = true } = (this.ctx
      .state as ContextStateForPagination).pagination
    const order = reversed ? 'DESC' : 'ASC'

    const totalCount = await EVMReceiptLog.count({
      where: {
        ...this.ctx.service.block.getBlockFilter(),
        address: contractAddress,
        topic1: TransferABI.id,
      },
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const transactions: TokenTransactionDb[] = await db.query(
      sql`
      SELECT
        transaction.id AS transactionId,
        evm_receipt.output_index AS outputIndex,
        evm_receipt.block_height AS blockHeight,
        header.hash AS blockHash,
        header.timestamp AS timestamp,
        list.topic2 AS topic2,
        list.topic3 AS topic3,
        list.data AS data
      FROM (
        SELECT _id, receipt_id, topic2, topic3, data FROM evm_receipt_log
        WHERE address = ${contractAddress} AND topic1 = ${
        TransferABI.id
      } AND ${this.ctx.service.block.getRawBlockFilter()}
        ORDER BY _id ${{ raw: order }} LIMIT ${offset}, ${limit}
      ) list
      INNER JOIN evm_receipt ON evm_receipt._id = list.receipt_id
      INNER JOIN transaction ON transaction._id = evm_receipt.transaction_id
      INNER JOIN header ON header.height = evm_receipt.block_height
      ORDER BY list._id ${{ raw: order }}
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )

    const addresses = await this.ctx.service.contract.transformHexAddresses(
      transactions
        .map((transaction) => [
          transaction.topic2?.slice(12) as Buffer,
          transaction.topic3?.slice(12) as Buffer,
        ])
        .flat()
    )
    return {
      totalCount,
      transactions: transactions.map((transaction, index) => {
        const from = addresses[index * 2]
        const to = addresses[index * 2 + 1]
        return {
          transactionId: transaction.transactionId,
          outputIndex: transaction.outputIndex,
          blockHeight: transaction.blockHeight,
          blockHash: transaction.blockHash,
          timestamp: transaction.timestamp,
          ...(from && typeof from === 'object'
            ? { from: from.hex.toString('hex'), fromHex: from.hex }
            : { from }),
          ...(to && typeof to === 'object'
            ? { to: to.hex.toString('hex'), toHex: to.hex }
            : { to }),
          value: BigInt(`0x${transaction.data.toString('hex')}`),
        }
      }),
    }
  }

  async getQRC20TokenRichList(
    contractAddress: Buffer
  ): Promise<TokenRichListObject> {
    const { limit, offset } = (this.ctx
      .state as ContextStateForPagination).pagination

    const totalCount = await QRC20Balance.count({
      where: { contractAddress, balance: { [$ne]: Buffer.alloc(32) } },
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const list: Pick<
      QRC20Balance,
      'address' | 'balance'
    >[] = await QRC20Balance.findAll({
      where: { contractAddress, balance: { [$ne]: Buffer.alloc(32) } },
      attributes: ['address', 'balance'],
      order: [['balance', 'DESC']],
      limit,
      offset,
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const addresses = await this.ctx.service.contract.transformHexAddresses(
      list.map((item) => item.address)
    )
    return {
      totalCount,
      list: list.map(({ balance }, index) => {
        const address = addresses[index]
        return {
          ...(address && typeof address === 'object'
            ? {
                address: address.hex.toString('hex'),
                addressHex: address.hex.toString('hex'),
              }
            : { address }),
          balance,
        }
      }),
    }
  }

  async updateQRC20Statistics(): Promise<void> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const db = this.ctx.model
    const transaction = await db.transaction()
    try {
      const result: Qrc20StatisticsCreationAttributes[] = (
        await QRC20.findAll({ attributes: ['contractAddress'], transaction })
      ).map(({ contractAddress }) => ({
        contractAddress,
        holders: 0,
        transactions: 0,
      }))
      const balanceResults: StatisticsResultDb[] = await db.query(
        sql`
        SELECT contract_address AS contractAddress, COUNT(*) AS count FROM qrc20_balance
        WHERE balance != ${Buffer.alloc(32)}
        GROUP BY contractAddress ORDER BY contractAddress
      `,
        { type: QueryTypes.SELECT, transaction }
      )
      let i = 0
      for (const { contractAddress, count } of balanceResults) {
        while (true) {
          if (i >= result.length) {
            break
          }
          const comparison = Buffer.compare(
            contractAddress,
            result[i].contractAddress
          )
          if (comparison === 0) {
            result[i].holders = count
            break
          } else if (comparison < 0) {
            break
          } else {
            ++i
          }
        }
      }
      const transactionResults: StatisticsResultDb[] = await db.query(
        sql`
        SELECT address AS contractAddress, COUNT(*) AS count FROM evm_receipt_log USE INDEX (contract)
        WHERE topic1 = ${TransferABI.id}
        GROUP BY contractAddress ORDER BY contractAddress
      `,
        { type: QueryTypes.SELECT, transaction }
      )
      let j = 0
      for (const { contractAddress, count } of transactionResults) {
        while (true) {
          if (j >= result.length) {
            break
          }
          const comparison = Buffer.compare(
            contractAddress,
            result[j].contractAddress
          )
          if (comparison === 0) {
            result[j].transactions = count
            break
          } else if (comparison < 0) {
            break
          } else {
            ++j
          }
        }
      }
      await db.query(sql`DELETE FROM qrc20_statistics`, { transaction })
      await QRC20Statistics.bulkCreate(result, {
        validate: false,
        transaction,
        logging: false,
      })
      await transaction.commit()
    } catch (err) {
      await transaction.rollback()
    }
  }
}

export default QRC20Service
