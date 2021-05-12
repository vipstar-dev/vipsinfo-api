import { ContextStateBase, ContextStateForPagination, Service } from 'egg'
import { col, Op, QueryTypes, where } from 'sequelize'
import {
  Address as RawAddress,
  IAddress,
  IEVMContractCallBySenderScript,
  IEVMContractCallScript,
  IMethodABI,
  IOutputScript,
  OutputScript,
  qrc20ABIs,
} from 'vipsinfo/lib'
import Contract from 'vipsinfo/node/models/contract'
import EVMReceipt from 'vipsinfo/node/models/evm-receipt'
import EVMReceiptLog from 'vipsinfo/node/models/evm-receipt-log'
import Header, { HeaderCreationAttributes } from 'vipsinfo/node/models/header'
import QRC20, { Qrc20CreationAttributes } from 'vipsinfo/node/models/qrc20'
import QRC20Statistics from 'vipsinfo/node/models/qrc20-statistics'
import QRC721 from 'vipsinfo/node/models/qrc721'
import Transaction from 'vipsinfo/node/models/transaction'
import TransactionOutput from 'vipsinfo/node/models/transaction-output'
import { sql } from 'vipsinfo/node/utils'
import RpcClient, { CallContractResult } from 'vipsinfo/rpc'

import { Qrc20Data } from '@/app/service/qrc20'
import { AllQRC721Balances } from '@/app/service/qrc721'

const { in: $in } = Op

interface ContractSummaryDb
  extends Pick<Contract, 'addressString' | 'vm' | 'type'> {
  qrc20: Pick<
    Qrc20CreationAttributes,
    'name' | 'symbol' | 'decimals' | 'totalSupply' | 'version'
  > & {
    statistics: QRC20Statistics
  }
  qrc721: Pick<QRC721, 'name' | 'symbol' | 'totalSupply'>
}

export interface ContractSummaryObject {
  address: string
  addressHex: Buffer
  vm: Contract['vm']
  type: Contract['type']
  qrc20?: Omit<
    Qrc20CreationAttributes,
    'contractAddress' | 'contract' | 'logs' | 'statistics'
  > &
    Pick<QRC20Statistics, 'holders' | 'transactions'>
  qrc721?: Pick<QRC721, 'name' | 'symbol' | 'totalSupply'>
  balance: bigint
  totalReceived: bigint
  totalSent: bigint
  unconfirmed: bigint
  qrc20Balances: Qrc20Data[]
  qrc721Balances: AllQRC721Balances[]
  transactionCount: number
}

export interface ContractTxsObject {
  totalCount: number
  transactions: Buffer[]
}

interface ContractBasicTxsReceiptDb
  extends Omit<
    EVMReceipt,
    'header' | 'transaction' | 'output' | 'logs' | 'contract'
  > {
  header: Pick<HeaderCreationAttributes, 'hash' | 'timestamp'>
  transaction: Pick<Transaction, 'id'>
  output: Pick<TransactionOutput, 'scriptPubKey' | 'value'>
  logs: (Omit<EVMReceiptLog, 'contract'> & {
    contract: Pick<Contract, 'addressString'>
  })[]
  contract: Pick<Contract, 'addressString'>
}

export interface ContractBasicTx {
  transactionId: Buffer
  outputIndex: number
  blockHeight?: number
  blockHash?: Buffer
  timestamp?: number
  confirmations: number
  scriptPubKey: IEVMContractCallScript | IEVMContractCallBySenderScript
  value: bigint
  sender: IAddress
  gasUsed: number
  contractAddress: string
  contractAddressHex: Buffer
  excepted: string
  exceptedMessage: string
  evmLogs: {
    address: string
    addressHex: Buffer
    topics: Buffer[]
    data: Buffer
  }[]
}

export interface ContractBasicTxsObject {
  totalCount: number
  transactions: ContractBasicTx[]
}

export type SearchLogsArgs = Partial<
  {
    [key in
      | 'contract'
      | 'topic1'
      | 'topic2'
      | 'topic3'
      | 'topic4']: Buffer | null
  }
>

interface SearchLogsDb
  extends Pick<
    EVMReceiptLog,
    'topic1' | 'topic2' | 'topic3' | 'topic4' | 'data'
  > {
  receipt: Pick<
    EVMReceipt,
    | 'transactionId'
    | 'outputIndex'
    | 'blockHeight'
    | 'senderType'
    | 'senderData'
  > & {
    transaction: Pick<Transaction, 'id'> & {
      header: Pick<Header, 'hash' | 'height' | 'timestamp'>
    }
    contract: Pick<Contract, 'address' | 'addressString'>
  }
  contract: Pick<Contract, 'address' | 'addressString'>
}

export interface SearchLog {
  transactionId: Buffer
  outputIndex: number
  blockHeight: number
  blockHash: Buffer
  timestamp: number
  sender: IAddress
  contractAddress: string
  contractAddressHex: Buffer
  address: string
  addressHex: Buffer
  topics: Buffer[]
  data: Buffer
}

export interface SearchLogsObject {
  totalCount: number
  logs: SearchLog[]
}

export interface TransformedHexAddressObject {
  string: string
  hex: Buffer
}

export interface IContractService extends Service {
  getContractAddresses(list: string[]): Promise<Buffer[]>
  getContractSummary(
    contractAddress: Buffer,
    addressIds: bigint[]
  ): Promise<ContractSummaryObject>
  getContractTransactionCount(
    contractAddress: Buffer,
    addressIds: bigint[]
  ): Promise<number>
  getContractTransactions(
    contractAddress: Buffer,
    addressIds: bigint[]
  ): Promise<ContractTxsObject>
  getContractBasicTransactionCount(contractAddress: Buffer): Promise<number>
  getContractBasicTransactions(
    contractAddress: Buffer
  ): Promise<ContractBasicTxsObject>
  callContract(
    contract: Buffer,
    data: Buffer,
    sender: Buffer | null
  ): Promise<CallContractResult | undefined>
  searchLogs(object: SearchLogsArgs): Promise<SearchLogsObject>
  transformHexAddresses(
    addresses: Buffer[]
  ): Promise<(TransformedHexAddressObject | string)[]>
}

class ContractService extends Service implements IContractService {
  async getContractAddresses(list: string[]): Promise<Buffer[]> {
    const chain = this.app.chain()

    const result: Buffer[] = []
    for (const item of list) {
      let rawAddress: IAddress
      try {
        rawAddress = RawAddress.fromString(item, chain) as IAddress
      } catch (err) {
        this.ctx.throw(400)
      }
      let filter
      if (rawAddress.type === RawAddress.CONTRACT) {
        filter = { address: Buffer.from(item, 'hex') }
      } else if (rawAddress.type === RawAddress.EVM_CONTRACT) {
        filter = { addressString: item }
      } else {
        this.ctx.throw(400)
      }
      const contractResult: Pick<
        Contract,
        'address' | 'addressString' | 'vm' | 'type'
      > | null = await Contract.findOne({
        where: filter,
        attributes: ['address', 'addressString', 'vm', 'type'],
        transaction: (this.ctx.state as ContextStateBase).transaction,
      })
      this.ctx.assert(contractResult, 404)
      result.push(contractResult?.address as Buffer)
    }
    return result
  }

  async getContractSummary(
    contractAddress: Buffer,
    addressIds: bigint[]
  ): Promise<ContractSummaryObject> {
    const {
      balance: balanceService,
      qrc20: qrc20Service,
      qrc721: qrc721Service,
    } = this.ctx.service
    let contract: ContractSummaryDb | null = await Contract.findOne({
      where: { address: contractAddress },
      attributes: ['addressString', 'vm', 'type'],
      include: [
        {
          model: QRC20,
          as: 'qrc20',
          required: false,
          attributes: ['name', 'symbol', 'decimals', 'totalSupply', 'version'],
          include: [
            {
              model: QRC20Statistics,
              as: 'statistics',
              required: true,
            },
          ],
        },
        {
          model: QRC721,
          as: 'qrc721',
          required: false,
          attributes: ['name', 'symbol', 'totalSupply'],
        },
      ],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    this.ctx.assert(contract, 400)
    contract = contract as ContractSummaryDb
    const [
      { totalReceived, totalSent },
      unconfirmed,
      qrc20Balances,
      qrc721Balances,
      transactionCount,
    ] = await Promise.all([
      balanceService.getTotalBalanceChanges(addressIds),
      balanceService.getUnconfirmedBalance(addressIds),
      qrc20Service.getAllQRC20Balances([contractAddress]),
      qrc721Service.getAllQRC721Balances([contractAddress]),
      this.getContractTransactionCount(contractAddress, addressIds),
    ])
    return {
      address: contractAddress.toString('hex'),
      addressHex: contractAddress,
      vm: contract.vm,
      type: contract.type,
      ...(contract.type === 'qrc20'
        ? {
            qrc20: {
              name: contract.qrc20.name,
              symbol: contract.qrc20.symbol,
              decimals: contract.qrc20.decimals,
              totalSupply: contract.qrc20.totalSupply,
              version: contract.qrc20.version,
              holders: contract.qrc20.statistics.holders,
              transactions: contract.qrc20.statistics.transactions,
            },
          }
        : {}),
      ...(contract.type === 'qrc721'
        ? {
            qrc721: {
              name: contract.qrc721.name,
              symbol: contract.qrc721.symbol,
              totalSupply: contract.qrc721.totalSupply,
            },
          }
        : {}),
      balance: totalReceived - totalSent,
      totalReceived,
      totalSent,
      unconfirmed,
      qrc20Balances,
      qrc721Balances,
      transactionCount,
    }
  }

  async getContractTransactionCount(
    contractAddress: Buffer,
    addressIds: bigint[]
  ): Promise<number> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const db = this.ctx.model
    const topic = Buffer.concat([Buffer.alloc(12), contractAddress])
    const [{ count }]: { count: number }[] = await db.query(
      sql`
      SELECT COUNT(*) AS count FROM (
        SELECT transaction_id FROM balance_change
        WHERE address_id IN ${addressIds} AND ${this.ctx.service.block.getRawBlockFilter()}
        UNION
        SELECT transaction_id FROM evm_receipt
        WHERE contract_address = ${contractAddress} AND ${this.ctx.service.block.getRawBlockFilter()}
        UNION
        SELECT receipt.transaction_id AS transaction_id FROM evm_receipt receipt, evm_receipt_log log
        WHERE log.receipt_id = receipt._id AND log.address = ${contractAddress}
          AND ${this.ctx.service.block.getRawBlockFilter(
            'receipt.block_height'
          )}
        UNION
        SELECT receipt.transaction_id AS transaction_id FROM evm_receipt receipt, evm_receipt_log log, contract
        WHERE log.receipt_id = receipt._id
          AND ${this.ctx.service.block.getRawBlockFilter(
            'receipt.block_height'
          )}
          AND contract.address = log.address AND contract.type IN ('qrc20', 'qrc721')
          AND log.topic1 = ${TransferABI.id}
          AND (log.topic2 = ${topic} OR log.topic3 = ${topic})
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

  async getContractTransactions(
    contractAddress: Buffer,
    addressIds: bigint[]
  ): Promise<ContractTxsObject> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const db = this.ctx.model
    const { limit, offset, reversed = true } = (this.ctx
      .state as ContextStateForPagination).pagination
    const order = reversed ? 'DESC' : 'ASC'
    const topic = Buffer.concat([Buffer.alloc(12), contractAddress])
    const totalCount = await this.getContractTransactionCount(
      contractAddress,
      addressIds
    )
    const dbTransactions: { id: Buffer }[] = await db.query(
      sql`
      SELECT tx.id AS id FROM (
        SELECT block_height, index_in_block, _id FROM (
          SELECT block_height, index_in_block, transaction_id AS _id FROM balance_change
          WHERE address_id IN ${addressIds} AND ${this.ctx.service.block.getRawBlockFilter()}
          UNION
          SELECT block_height, index_in_block, transaction_id AS _id FROM evm_receipt
          WHERE contract_address = ${contractAddress} AND ${this.ctx.service.block.getRawBlockFilter()}
          UNION
          SELECT receipt.block_height AS block_height, receipt.index_in_block AS index_in_block, receipt.transaction_id AS _id
          FROM evm_receipt receipt, evm_receipt_log log
          WHERE log.receipt_id = receipt._id AND log.address = ${contractAddress}
            AND ${this.ctx.service.block.getRawBlockFilter(
              'receipt.block_height'
            )}
          UNION
          SELECT receipt.block_height AS block_height, receipt.index_in_block AS index_in_block, receipt.transaction_id AS _id
          FROM evm_receipt receipt, evm_receipt_log log, contract
          WHERE log.receipt_id = receipt._id
            AND ${this.ctx.service.block.getRawBlockFilter(
              'receipt.block_height'
            )}
            AND contract.address = log.address AND contract.type IN ('qrc20', 'qrc721')
            AND log.topic1 = ${TransferABI.id}
            AND (log.topic2 = ${topic} OR log.topic3 = ${topic})
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
      ORDER BY list.block_height ${{ raw: order }}, list.index_in_block ${{
        raw: order,
      }}, list._id ${{ raw: order }}
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    const transactions: Buffer[] = dbTransactions.map(({ id }) => id)
    return { totalCount, transactions }
  }

  async getContractBasicTransactionCount(
    contractAddress: Buffer
  ): Promise<number> {
    return await EVMReceipt.count({
      where: {
        contractAddress,
        ...this.ctx.service.block.getBlockFilter(),
      },
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
  }

  async getContractBasicTransactions(
    contractAddress: Buffer
  ): Promise<ContractBasicTxsObject> {
    const { limit, offset, reversed = true } = (this.ctx
      .state as ContextStateForPagination).pagination
    const order = reversed ? 'DESC' : 'ASC'
    const totalCount = await this.getContractBasicTransactionCount(
      contractAddress
    )
    const receiptIds: bigint[] = (
      await EVMReceipt.findAll({
        where: {
          contractAddress,
          ...this.ctx.service.block.getBlockFilter(),
        },
        attributes: ['_id'],
        order: [
          ['blockHeight', order],
          ['indexInBlock', order],
          ['transactionId', order],
          ['outputIndex', order],
        ],
        limit,
        offset,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      })
    ).map((receipt) => receipt._id)
    const receipts: ContractBasicTxsReceiptDb[] = await EVMReceipt.findAll({
      where: { _id: { [$in]: receiptIds } },
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
          attributes: ['scriptPubKey', 'value'],
        },
        {
          model: EVMReceiptLog,
          as: 'logs',
          required: false,
          include: [
            {
              model: Contract,
              as: 'contract',
              required: true,
              attributes: ['addressString'],
            },
          ],
        },
        {
          model: Contract,
          as: 'contract',
          required: true,
          attributes: ['addressString'],
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
    const transactions: ContractBasicTx[] = receipts.map((receipt) => ({
      transactionId: receipt.transaction.id,
      outputIndex: receipt.outputIndex,
      ...(receipt.header
        ? {
            blockHeight: receipt.blockHeight,
            blockHash: receipt.header.hash,
            timestamp: receipt.header.timestamp,
            confirmations:
              (this.app.blockchainInfo.tip?.height as number) -
              receipt.blockHeight +
              1,
          }
        : { confirmations: 0 }),
      scriptPubKey: OutputScript.fromBuffer(receipt.output.scriptPubKey) as
        | IEVMContractCallScript
        | IEVMContractCallBySenderScript,
      value: receipt.output.value,
      sender: new RawAddress({
        type: receipt.senderType,
        data: receipt.senderData,
        chain: this.app.chain(),
      }) as IAddress,
      gasUsed: receipt.gasUsed,
      contractAddress: receipt.contractAddress.toString('hex'),
      contractAddressHex: receipt.contractAddress,
      excepted: receipt.excepted,
      exceptedMessage: receipt.exceptedMessage,
      evmLogs: receipt.logs
        .sort((x, y) => x.logIndex - y.logIndex)
        .map((log) => ({
          address: log.address.toString('hex'),
          addressHex: log.address,
          topics: this.ctx.service.transaction.transformTopics(log),
          data: log.data,
        })),
    }))
    return { totalCount, transactions }
  }

  async callContract(
    contract: Buffer,
    data: Buffer,
    sender: Buffer | null
  ): Promise<CallContractResult | undefined> {
    const client = new RpcClient(this.app.config.vipsinfo.rpc)
    const callContract = client.rpcMethods.callcontract?.(
      contract.toString('hex'),
      data.toString('hex'),
      ...(sender == null ? [] : [sender.toString('hex')])
    )
    if (callContract) return await callContract
  }

  async searchLogs({
    contract,
    topic1,
    topic2,
    topic3,
    topic4,
  }: SearchLogsArgs): Promise<SearchLogsObject> {
    const db = this.ctx.model
    const { limit, offset } = (this.ctx
      .state as ContextStateForPagination).pagination

    const blockFilter = this.ctx.service.block.getRawBlockFilter(
      'receipt.block_height'
    )
    const contractFilter = contract ? sql`log.address = ${contract}` : 'TRUE'
    const topic1Filter = topic1 ? sql`log.topic1 = ${topic1}` : 'TRUE'
    const topic2Filter = topic2 ? sql`log.topic2 = ${topic2}` : 'TRUE'
    const topic3Filter = topic3 ? sql`log.topic3 = ${topic3}` : 'TRUE'
    const topic4Filter = topic4 ? sql`log.topic4 = ${topic4}` : 'TRUE'

    const [{ count: totalCount }]: { count: number }[] = await db.query(
      sql`
      SELECT COUNT(DISTINCT(log._id)) AS count from evm_receipt receipt, evm_receipt_log log
      WHERE receipt._id = log.receipt_id AND ${blockFilter} AND ${{
        raw: contractFilter,
      }}
        AND ${{ raw: topic1Filter }} AND ${{ raw: topic2Filter }} AND ${{
        raw: topic3Filter,
      }} AND ${{ raw: topic4Filter }}
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    if (totalCount === 0) {
      return { totalCount, logs: [] }
    }

    const dbIds: { _id: bigint }[] = await db.query(
      sql`
      SELECT log._id AS _id from evm_receipt receipt, evm_receipt_log log
      WHERE receipt._id = log.receipt_id AND ${blockFilter} AND ${{
        raw: contractFilter,
      }}
        AND ${{ raw: topic1Filter }} AND ${{ raw: topic2Filter }} AND ${{
        raw: topic3Filter,
      }} AND ${{ raw: topic4Filter }}
      ORDER BY log._id ASC
      LIMIT ${offset}, ${limit}
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    const ids = dbIds.map((log) => log._id)

    const logs: SearchLogsDb[] = await EVMReceiptLog.findAll({
      where: { _id: { [$in]: ids } },
      attributes: ['topic1', 'topic2', 'topic3', 'topic4', 'data'],
      include: [
        {
          model: EVMReceipt,
          as: 'receipt',
          required: true,
          attributes: [
            'transactionId',
            'outputIndex',
            'blockHeight',
            'senderType',
            'senderData',
          ],
          include: [
            {
              model: Transaction,
              as: 'transaction',
              required: true,
              attributes: ['id'],
              include: [
                {
                  model: Header,
                  as: 'header',
                  required: true,
                  attributes: ['hash', 'height', 'timestamp'],
                },
              ],
            },
            {
              model: Contract,
              as: 'contract',
              required: true,
              attributes: ['address', 'addressString'],
            },
          ],
        },
        {
          model: Contract,
          as: 'contract',
          required: true,
          attributes: ['address', 'addressString'],
        },
      ],
      order: [['_id', 'ASC']],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })

    return {
      totalCount,
      logs: logs.map((log) => ({
        transactionId: log.receipt.transaction.id,
        outputIndex: log.receipt.outputIndex,
        blockHeight: log.receipt.transaction.header.height,
        blockHash: log.receipt.transaction.header.hash,
        timestamp: log.receipt.transaction.header.timestamp,
        sender: new RawAddress({
          type: log.receipt.senderType,
          data: log.receipt.senderData,
          chain: this.app.chain(),
        }),
        contractAddress: log.receipt.contract.address.toString('hex'),
        contractAddressHex: log.receipt.contract.address,
        address: log.contract.address.toString('hex'),
        addressHex: log.contract.address,
        topics: this.ctx.service.transaction.transformTopics(log),
        data: log.data,
      })),
    }
  }

  async transformHexAddresses(
    addresses: Buffer[]
  ): Promise<(TransformedHexAddressObject | string)[]> {
    if (addresses.length === 0) {
      return []
    }
    const mappedAddresses = addresses.map((address) =>
      Buffer.compare(address, Buffer.alloc(20)) === 0 ? null : address
    )

    const contracts: Pick<
      Contract,
      'address' | 'addressString'
    >[] = await Contract.findAll({
      where: {
        address: {
          [$in]: addresses.filter(
            (address) => Buffer.compare(address, Buffer.alloc(20)) !== 0
          ),
        },
      },
      attributes: ['address', 'addressString'],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const mapping = new Map(
      contracts.map(({ address, addressString }) => [
        address.toString('hex'),
        addressString,
      ])
    )
    const result: (TransformedHexAddressObject | string)[] = []
    for (const mappedAddress of mappedAddresses) {
      if (mappedAddress) {
        const string = mapping.get(mappedAddress.toString('hex'))
        if (string) {
          result.push({ string, hex: mappedAddress })
        } else {
          result.push(
            new RawAddress({
              type: RawAddress.PAY_TO_PUBLIC_KEY_HASH,
              data: mappedAddress,
              chain: this.app.chain(),
            }).toString() as string
          )
        }
      }
    }
    return result
  }
}

export default ContractService
