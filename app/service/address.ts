import { ContextStateBase, ContextStateForPagination, Service } from 'egg'
import { col, Op, QueryTypes, where } from 'sequelize'
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
import BalanceChange from 'vipsinfo/node/models/balance-change'
import Block from 'vipsinfo/node/models/block'
import Contract from 'vipsinfo/node/models/contract'
import EVMReceipt from 'vipsinfo/node/models/evm-receipt'
import EVMReceiptLog from 'vipsinfo/node/models/evm-receipt-log'
import Transaction from 'vipsinfo/node/models/transaction'
import TransactionOutput from 'vipsinfo/node/models/transaction-output'
import { sql } from 'vipsinfo/node/utils'
import RpcClient, {
  GetDelegationInfoForAddressResult,
  GetDelegationsForStakerResult,
} from 'vipsinfo/rpc'

import { ContractObject } from '@/app/middleware/contract'
import { TransformedHexAddressObject } from '@/app/service/contract'
import {
  Qrc20Data,
  TokenTransaction,
  TokenTransactionDb,
} from '@/app/service/qrc20'
import { AllQRC721Balances } from '@/app/service/qrc721'
import {
  BasicTransactionObject,
  ContractTransactionObject,
} from '@/app/service/transaction'

const { in: $in, gt: $gt, or: $or } = Op

export interface Delegator {
  delegator: string
  fee: number
}

export interface AddressSummaryObject {
  balance: bigint
  totalReceived: bigint
  totalSent: bigint
  unconfirmed: bigint
  staking: bigint
  mature: bigint
  qrc20Balances: Qrc20Data[]
  qrc721Balances: AllQRC721Balances[]
  ranking: number | null
  transactionCount: number
  blocksMined: number
  superStaker?: string
  fee?: number
  delegations?: Delegator[]
}

export interface AddressTransactionsObject {
  totalCount: number
  transactions: Buffer[]
}

export interface AddressBasicTransactionsObject {
  totalCount: number
  transactions: (BasicTransactionObject & { confirmations: number })[]
}

export interface AddressContractTransactionsObject {
  totalCount: number
  transactions: (ContractTransactionObject & { confirmations: number })[]
}

export interface AddressTokenTransactionObject {
  totalCount: number
  transactions: (TokenTransaction & {
    confirmations: number
    amount: bigint
  })[]
}

interface AddressTokenMempoolTransactionsDb
  extends Pick<EVMReceipt, 'outputIndex' | 'senderData'> {
  transaction: Pick<Transaction, 'id'>
  output: Pick<TransactionOutput, 'scriptPubKey'>
}

export interface AddressTokenMempoolTransactionsObject
  extends Pick<EVMReceipt, 'outputIndex'> {
  transactionId: Buffer
  from: string
  fromHex?: Buffer
  to: string
  toHex?: Buffer
  value: bigint
  amount: bigint
}

interface UTXODb
  extends Pick<
    TransactionOutput,
    | 'transactionId'
    | 'outputIndex'
    | 'blockHeight'
    | 'scriptPubKey'
    | 'value'
    | 'isStake'
  > {
  outputTransaction: Pick<Transaction, 'id'>
  address: Pick<Address, 'string'>
}

interface UTXOObject {
  transactionId: Buffer
  outputIndex: number
  scriptPubKey: Buffer
  address: string
  value: bigint
  isStake: boolean
  blockHeight: number
  confirmations: number
}

export interface IAddressService extends Service {
  getAddressSummary(
    addressIds: bigint[],
    p2pkhAddressIds: bigint[],
    rawAddresses: IAddress[]
  ): Promise<AddressSummaryObject>
  getAddressTransactionCount(
    addressIds: bigint[],
    rawAddresses: IAddress[]
  ): Promise<number>
  getAddressTransactions(
    addressIds: bigint[],
    rawAddresses: IAddress[]
  ): Promise<AddressTransactionsObject>
  getAddressBasicTransactionCount(addressIds: bigint[]): Promise<number>
  getAddressBasicTransactions(
    addressIds: bigint[]
  ): Promise<AddressBasicTransactionsObject>
  getAddressContractTransactionCount(
    rawAddresses: IAddress[],
    contract: ContractObject
  ): Promise<number>
  getAddressContractTransactions(
    rawAddresses: IAddress[],
    contract: ContractObject
  ): Promise<AddressContractTransactionsObject>
  getAddressQRC20TokenTransactionCount(
    rawAddresses: IAddress[],
    token: ContractObject
  ): Promise<number>
  getAddressQRC20TokenTransactions(
    rawAddresses: IAddress[],
    token: ContractObject
  ): Promise<AddressTokenTransactionObject>
  getAddressQRC20TokenMempoolTransactions(
    rawAddresses: IAddress[],
    token: ContractObject
  ): Promise<AddressTokenMempoolTransactionsObject[]>
  getUTXO(ids: bigint[]): Promise<UTXOObject[]>
}

class AddressService extends Service implements IAddressService {
  async getAddressSummary(
    addressIds: bigint[],
    p2pkhAddressIds: bigint[],
    rawAddresses: IAddress[]
  ): Promise<AddressSummaryObject> {
    const {
      balance: balanceService,
      qrc20: qrc20Service,
      qrc721: qrc721Service,
    } = this.ctx.service
    const hexAddresses = rawAddresses
      .filter((address) => address.type === RawAddress.PAY_TO_PUBLIC_KEY_HASH)
      .map((address) => address.data as Buffer)
    const client = new RpcClient(this.app.config.vipsinfo.rpc)
    let delegationInfoForAddress: GetDelegationInfoForAddressResult | undefined
    let delegationsForStaker: GetDelegationsForStakerResult[] | undefined
    const promiseDelegationInfoForAddress = client.rpcMethods.getdelegationinfoforaddress?.(
      rawAddresses[0].toString() as string
    )
    if (promiseDelegationInfoForAddress) {
      try {
        delegationInfoForAddress = await promiseDelegationInfoForAddress
        if (!delegationInfoForAddress.staker) {
          delegationInfoForAddress = undefined
        }
      } catch (e) {}
    }
    const promiseDelegationsForStaker = client.rpcMethods.getdelegationsforstaker?.(
      rawAddresses[0].toString() as string
    )
    if (promiseDelegationsForStaker) {
      try {
        delegationsForStaker = await promiseDelegationsForStaker
        if (delegationsForStaker.length === 0) {
          delegationsForStaker = undefined
        }
      } catch (e) {}
    }
    const [
      { totalReceived, totalSent },
      unconfirmed,
      staking,
      mature,
      qrc20Balances,
      qrc721Balances,
      ranking,
      blocksMined,
      transactionCount,
    ] = await Promise.all([
      balanceService.getTotalBalanceChanges(addressIds),
      balanceService.getUnconfirmedBalance(addressIds),
      balanceService.getStakingBalance(addressIds),
      balanceService.getMatureBalance(p2pkhAddressIds),
      qrc20Service.getAllQRC20Balances(hexAddresses),
      qrc721Service.getAllQRC721Balances(hexAddresses),
      balanceService.getBalanceRanking(addressIds),
      Block.count({
        where: { minerId: { [$in]: p2pkhAddressIds }, height: { [$gt]: 0 } },
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }),
      this.getAddressTransactionCount(addressIds, rawAddresses),
    ])
    return {
      balance: totalReceived - totalSent,
      totalReceived,
      totalSent,
      unconfirmed,
      staking,
      mature,
      qrc20Balances,
      qrc721Balances,
      ranking,
      transactionCount,
      blocksMined,
      superStaker: delegationInfoForAddress?.staker,
      fee: delegationInfoForAddress?.fee,
      delegations: delegationsForStaker?.map((delegation) => {
        return {
          delegator: delegation.staker,
          fee: delegation.fee,
        }
      }),
    }
  }

  async getAddressTransactionCount(
    addressIds: bigint[],
    rawAddresses: IAddress[]
  ): Promise<number> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const db = this.ctx.model
    const topics = rawAddresses
      .filter((address) => address.type === RawAddress.PAY_TO_PUBLIC_KEY_HASH)
      .map((address) =>
        Buffer.concat([Buffer.alloc(12), address.data as Buffer])
      )
    const [{ count }]: { count: number }[] = await db.query(
      sql`
      SELECT COUNT(*) AS count FROM (
        SELECT transaction_id FROM balance_change
        WHERE address_id IN ${addressIds} AND ${this.ctx.service.block.getRawBlockFilter()}
        UNION
        SELECT transaction_id FROM evm_receipt
        WHERE (sender_type, sender_data) IN ${rawAddresses.map((address) => [
          Address.parseType(address.type as string),
          address.data,
        ])}
          AND ${this.ctx.service.block.getRawBlockFilter()}
        UNION
        SELECT receipt.transaction_id AS transaction_id FROM evm_receipt receipt, evm_receipt_log log, contract
        WHERE receipt._id = log.receipt_id
          AND ${this.ctx.service.block.getRawBlockFilter(
            'receipt.block_height'
          )}
          AND contract.address = log.address AND contract.type IN ('qrc20', 'qrc721')
          AND log.topic1 = ${TransferABI.id}
          AND (log.topic2 IN ${topics} OR log.topic3 IN ${topics})
          AND (
            (contract.type = 'qrc20' AND log.topic3 IS NOT NULL AND log.topic4 IS NULL)
            OR (contract.type = 'qrc721' AND log.topic4 IS NOT NULL)
          )
      ) list
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    return count
  }

  async getAddressTransactions(
    addressIds: bigint[],
    rawAddresses: IAddress[]
  ): Promise<AddressTransactionsObject> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const db = this.ctx.model
    const { limit, offset, reversed = true } = (this.ctx
      .state as ContextStateForPagination).pagination
    const order = reversed ? 'DESC' : 'ASC'
    const topics = rawAddresses
      .filter((address) => address.type === RawAddress.PAY_TO_PUBLIC_KEY_HASH)
      .map((address) =>
        Buffer.concat([Buffer.alloc(12), address.data as Buffer])
      )
    const totalCount = await this.getAddressTransactionCount(
      addressIds,
      rawAddresses
    )
    const dbTransactions: { id: Buffer }[] = await db.query(
      sql`
          SELECT tx.id AS id FROM (
            SELECT _id FROM (
              SELECT block_height, index_in_block, transaction_id AS _id FROM balance_change
              WHERE address_id IN ${addressIds} AND ${this.ctx.service.block.getRawBlockFilter()}
              UNION
              SELECT block_height, index_in_block, transaction_id AS _id
              FROM evm_receipt
              WHERE (sender_type, sender_data) IN ${rawAddresses.map(
                (address) => [
                  Address.parseType(address.type as string),
                  address.data,
                ]
              )}
                AND ${this.ctx.service.block.getRawBlockFilter()}
              UNION
              SELECT receipt.block_height AS block_height, receipt.index_in_block AS index_in_block, receipt.transaction_id AS _id
              FROM evm_receipt receipt, evm_receipt_log log, contract
              WHERE receipt._id = log.receipt_id
                AND ${this.ctx.service.block.getRawBlockFilter(
                  'receipt.block_height'
                )}
                AND contract.address = log.address AND contract.type IN ('qrc20', 'qrc721')
                AND log.topic1 = ${TransferABI.id}
                AND (log.topic2 IN ${topics} OR log.topic3 IN ${topics})
                AND (
                  (contract.type = 'qrc20' AND log.topic3 IS NOT NULL AND log.topic4 IS NULL)
                  OR (contract.type = 'qrc721' AND log.topic4 IS NOT NULL)
                )
            ) list
            ORDER BY block_height ${{ raw: order }}, index_in_block ${{
        raw: order,
      }}, _id ${{ raw: order }}
            LIMIT ${offset}, ${limit}
          ) list, transaction tx
          WHERE tx._id = list._id
        `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    const transactions = dbTransactions.map(({ id }) => id)
    return { totalCount, transactions }
  }

  async getAddressBasicTransactionCount(addressIds: bigint[]): Promise<number> {
    return await BalanceChange.count({
      where: {
        ...this.ctx.service.block.getBlockFilter(),
        addressId: { [$in]: addressIds },
      },
      distinct: true,
      col: 'transactionId',
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
  }

  async getAddressBasicTransactions(
    addressIds: bigint[]
  ): Promise<AddressBasicTransactionsObject> {
    const db = this.ctx.model
    const { limit, offset, reversed = true } = (this.ctx
      .state as ContextStateForPagination).pagination
    const order = reversed ? 'DESC' : 'ASC'
    const totalCount = await this.getAddressBasicTransactionCount(addressIds)
    let dbTransactionIds: { _id: bigint }[] = []
    let transactionIds = []
    if (addressIds.length === 1) {
      dbTransactionIds = await db.query(
        sql`
        SELECT transaction_id AS _id
        FROM balance_change
        WHERE address_id = ${
          addressIds[0]
        } AND ${this.ctx.service.block.getRawBlockFilter()}
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
      transactionIds = dbTransactionIds.map(({ _id }) => _id)
    } else {
      dbTransactionIds = await db.query(
        sql`
        SELECT _id FROM (
          SELECT MIN(block_height) AS block_height, MIN(index_in_block) AS index_in_block, transaction_id AS _id
          FROM balance_change
          WHERE address_id IN ${addressIds} AND ${this.ctx.service.block.getRawBlockFilter()}
          GROUP BY _id
        ) list
        ORDER BY block_height ${{ raw: order }}, index_in_block ${{
          raw: order,
        }}, _id ${{ raw: order }}
        LIMIT ${offset}, ${limit}
      `,
        {
          type: QueryTypes.SELECT,
          transaction: (this.ctx.state as ContextStateBase).transaction,
        }
      )
      transactionIds = dbTransactionIds.map(({ _id }) => _id)
    }

    const transactions = await Promise.all(
      transactionIds.map(async (transactionId) => {
        const transaction = (await this.ctx.service.transaction.getBasicTransaction(
          transactionId,
          addressIds
        )) as BasicTransactionObject
        return Object.assign(transaction, {
          confirmations:
            transaction.blockHeight == null
              ? 0
              : (this.app.blockchainInfo.tip?.height as number) -
                transaction.blockHeight +
                1,
        })
      })
    )
    return { totalCount, transactions }
  }

  async getAddressContractTransactionCount(
    rawAddresses: IAddress[],
    contract: ContractObject
  ): Promise<number> {
    const db = this.ctx.model
    let contractFilter = 'TRUE'
    if (contract) {
      contractFilter = sql`contract_address = ${contract.contractAddress}`
    }
    const [{ count }]: { count: number }[] = await db.query(
      sql`
      SELECT COUNT(DISTINCT(_id)) AS count FROM evm_receipt
      WHERE (sender_type, sender_data) IN ${rawAddresses.map((address) => [
        Address.parseType(address.type as string),
        address.data,
      ])}
        AND ${this.ctx.service.block.getRawBlockFilter()} AND ${{
        raw: contractFilter,
      }}
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    return count
  }

  async getAddressContractTransactions(
    rawAddresses: IAddress[],
    contract: ContractObject
  ): Promise<AddressContractTransactionsObject> {
    console.log(rawAddresses, contract)
    const db = this.ctx.model
    const { limit, offset, reversed = true } = (this.ctx
      .state as ContextStateForPagination).pagination
    const order = reversed ? 'DESC' : 'ASC'
    let contractFilter = 'TRUE'
    if (contract) {
      contractFilter = sql`contract_address = ${contract.contractAddress}`
    }
    const totalCount = await this.getAddressContractTransactionCount(
      rawAddresses,
      contract
    )
    const dbReceiptIds: { _id: bigint }[] = await db.query(
      sql`
      SELECT _id FROM evm_receipt
      WHERE (sender_type, sender_data) IN ${rawAddresses.map((address) => [
        Address.parseType(address.type as string),
        address.data,
      ])}
        AND ${this.ctx.service.block.getRawBlockFilter()} AND ${{
        raw: contractFilter,
      }}
      ORDER BY block_height ${{ raw: order }}, index_in_block ${{
        raw: order,
      }}, transaction_id ${{ raw: order }}, output_index ${{ raw: order }}
      LIMIT ${offset}, ${limit}
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    const receiptIds = dbReceiptIds.map(({ _id }) => _id)
    const transactions = await Promise.all(
      receiptIds.map(async (receiptId) => {
        const transaction = (await this.ctx.service.transaction.getContractTransaction(
          receiptId
        )) as ContractTransactionObject
        return Object.assign(transaction, {
          confirmations:
            transaction.blockHeight == null
              ? 0
              : (this.app.blockchainInfo.tip?.height as number) -
                transaction.blockHeight +
                1,
        })
      })
    )
    return { totalCount, transactions }
  }

  async getAddressQRC20TokenTransactionCount(
    rawAddresses: IAddress[],
    token: ContractObject
  ): Promise<number> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const topicAddresses = rawAddresses
      .filter((address) => address.type === RawAddress.PAY_TO_PUBLIC_KEY_HASH)
      .map((address) =>
        Buffer.concat([Buffer.alloc(12), address.data as Buffer])
      )
    return await EVMReceiptLog.count({
      where: {
        address: token.contractAddress,
        topic1: TransferABI.id,
        [$or]: [
          { topic2: { [$in]: topicAddresses } },
          { topic3: { [$in]: topicAddresses } },
        ],
      },
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
  }

  async getAddressQRC20TokenTransactions(
    rawAddresses: IAddress[],
    token: ContractObject
  ): Promise<AddressTokenTransactionObject> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const db = this.ctx.model
    const { limit, offset, reversed = true } = (this.ctx
      .state as ContextStateForPagination).pagination
    const order = reversed ? 'DESC' : 'ASC'
    const topicAddresses = rawAddresses
      .filter((address) => address.type === RawAddress.PAY_TO_PUBLIC_KEY_HASH)
      .map((address) =>
        Buffer.concat([Buffer.alloc(12), address.data as Buffer])
      )
    const totalCount = await this.getAddressQRC20TokenTransactionCount(
      rawAddresses,
      token
    )
    const transactions: TokenTransactionDb[] = await db.query(
      sql`
      SELECT
        transaction.id AS transactionId,
        receipt.output_index AS outputIndex,
        header.height AS blockHeight,
        header.hash AS blockHash,
        header.timestamp AS timestamp,
        log.topic2 AS topic2,
        log.topic3 AS topic3,
        log.data AS data
      FROM (
        SELECT _id FROM evm_receipt_log
        WHERE address = ${token.contractAddress} AND topic1 = ${TransferABI.id}
          AND ((topic2 IN ${topicAddresses}) OR (topic3 IN ${topicAddresses}))
        ORDER BY _id ${{ raw: order }}
        LIMIT ${offset}, ${limit}
      ) list
      INNER JOIN evm_receipt_log log USING (_id)
      INNER JOIN evm_receipt receipt ON receipt._id = log.receipt_id
      INNER JOIN header ON header.height = receipt.block_height
      INNER JOIN transaction ON transaction._id = receipt.transaction_id
      INNER JOIN qrc20 ON qrc20.contract_address = log.address
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
        let from: string | TransformedHexAddressObject = addresses[index * 2]
        let to: string | TransformedHexAddressObject = addresses[index * 2 + 1]
        const fromAddress = rawAddresses.find(
          (address) =>
            Buffer.compare(
              address.data as Buffer,
              transaction.topic2?.slice(12) as Buffer
            ) === 0
        )
        if (fromAddress) {
          from = fromAddress.toString() as string
        }
        const toAddress = rawAddresses.find(
          (address) =>
            Buffer.compare(
              address.data as Buffer,
              transaction.topic3?.slice(12) as Buffer
            ) === 0
        )
        if (toAddress) {
          to = toAddress.toString() as string
        }
        const value = BigInt(`0x${transaction.data.toString('hex')}`)
        return {
          transactionId: transaction.transactionId,
          outputIndex: transaction.outputIndex,
          blockHeight: transaction.blockHeight,
          blockHash: transaction.blockHash,
          timestamp: transaction.timestamp,
          confirmations:
            (this.app.blockchainInfo.tip?.height as number) -
            transaction.blockHeight +
            1,
          ...(from && typeof from === 'object'
            ? { from: from.hex.toString('hex'), fromHex: from.hex }
            : { from }),
          ...(to && typeof to === 'object'
            ? { to: to.hex.toString('hex'), toHex: to.hex }
            : { to }),
          value,
          amount:
            BigInt(Number(Boolean(toAddress)) - Number(Boolean(fromAddress))) *
            value,
        }
      }),
    }
  }

  async getAddressQRC20TokenMempoolTransactions(
    rawAddresses: IAddress[],
    token: ContractObject
  ): Promise<AddressTokenMempoolTransactionsObject[]> {
    const transferABI = qrc20ABIs.find(
      (abi) => abi.name === 'transfer'
    ) as IMethodABI
    const hexAddresses = rawAddresses
      .filter((address) => address.type === RawAddress.PAY_TO_PUBLIC_KEY_HASH)
      .map((address) => address.data)
    let transactions: AddressTokenMempoolTransactionsDb[] = await EVMReceipt.findAll(
      {
        where: { blockHeight: 0xffffffff },
        attributes: ['outputIndex', 'senderData'],
        include: [
          {
            model: Transaction,
            as: 'transaction',
            required: true,
            attributes: ['id'],
          },
          {
            model: TransactionOutput,
            as: 'output',
            on: {
              transactionId: where(
                col('output.transaction_id'),
                '=',
                col('EvmReceipt.transaction_id')
              ),
              outputIndex: where(
                col('output.output_index'),
                '=',
                col('EvmReceipt.output_index')
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
                    where: { address: token.contractAddress, type: 'qrc20' },
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

    transactions = transactions.filter((transaction) => {
      const scriptPubKey = OutputScript.fromBuffer(
        transaction.output.scriptPubKey
      )
      if (
        ![
          OutputScript.EVM_CONTRACT_CALL,
          OutputScript.EVM_CONTRACT_CALL_SENDER,
        ].includes(scriptPubKey.type)
      ) {
        return false
      }
      const byteCode = (scriptPubKey as
        | EVMContractCallScript
        | EVMContractCallBySenderScript).byteCode as Buffer
      if (
        byteCode.length !== 68 ||
        Buffer.compare(byteCode.slice(0, 4), transferABI.id) !== 0 ||
        Buffer.compare(byteCode.slice(4, 16), Buffer.alloc(12)) !== 0
      ) {
        console.log(byteCode.length, byteCode.slice(4, 16).toString('hex'))
        return false
      }
      const from = transaction.senderData
      const to = byteCode.slice(16, 36)
      const isFrom = hexAddresses.some(
        (address) => Buffer.compare(address as Buffer, from) === 0
      )
      const isTo = hexAddresses.some(
        (address) => Buffer.compare(address as Buffer, to) === 0
      )
      return isFrom || isTo
    })
    return await Promise.all(
      transactions.map(async (transaction) => {
        const scriptPubKey = OutputScript.fromBuffer(
          transaction.output.scriptPubKey
        )
        const byteCode = (scriptPubKey as
          | EVMContractCallScript
          | EVMContractCallBySenderScript).byteCode as Buffer
        const from = transaction.senderData
        const to = byteCode.slice(16, 36)
        const value = BigInt(`0x${byteCode.slice(36).toString('hex')}`)
        const isFrom = hexAddresses.some(
          (address) => Buffer.compare(address as Buffer, from) === 0
        )
        const isTo = hexAddresses.some(
          (address) => Buffer.compare(address as Buffer, to) === 0
        )
        const addresses = await this.ctx.service.contract.transformHexAddresses(
          [from, to]
        )
        return {
          transactionId: transaction.transaction.id,
          outputIndex: transaction.outputIndex,
          ...(from && typeof addresses[0] === 'object'
            ? {
                from: addresses[0].hex.toString('hex'),
                fromHex: addresses[0].hex,
              }
            : { from: addresses[0] as string }),
          ...(to && typeof addresses[1] === 'object'
            ? { to: addresses[1].hex.toString('hex'), toHex: addresses[1].hex }
            : { to: addresses[1] as string }),
          value,
          amount: BigInt(Number(isTo) - Number(isFrom)) * value,
        }
      })
    )
  }

  async getUTXO(ids: bigint[]): Promise<UTXOObject[]> {
    const blockHeight = this.app.blockchainInfo.tip?.height as number
    const utxos: UTXODb[] = await TransactionOutput.findAll({
      where: {
        addressId: { [$in]: ids },
        blockHeight: { [$gt]: 0 },
        inputHeight: null,
      },
      attributes: [
        'transactionId',
        'outputIndex',
        'blockHeight',
        'scriptPubKey',
        'value',
        'isStake',
      ],
      include: [
        {
          model: Transaction,
          as: 'outputTransaction',
          required: true,
          attributes: ['id'],
        },
        {
          model: Address,
          as: 'address',
          required: true,
          attributes: ['string'],
        },
      ],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    return utxos.map((utxo) => ({
      transactionId: utxo.outputTransaction.id,
      outputIndex: utxo.outputIndex,
      scriptPubKey: utxo.scriptPubKey,
      address: utxo.address.string,
      value: utxo.value,
      isStake: utxo.isStake,
      blockHeight: utxo.blockHeight,
      confirmations:
        utxo.blockHeight === 0xffffffff
          ? 0
          : blockHeight - utxo.blockHeight + 1,
    }))
  }
}

export default AddressService
