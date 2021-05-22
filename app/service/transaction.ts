import { ContextStateBase, ContextStateForPagination, Service } from 'egg'
import { col, Op, QueryTypes, where } from 'sequelize'
import {
  Address as RawAddress,
  IAddress,
  ICoinbaseScript,
  IEVMContractCallBySenderScript,
  IEVMContractCallScript,
  IMethodABI,
  InputScript,
  IOutputScript,
  OutputScript,
  qrc20ABIs,
  Transaction as RawTransaction,
  TransactionInput as RawTransactionInput,
  TransactionOutput as RawTransactionOutput,
} from 'vipsinfo/lib'
import Address from 'vipsinfo/node/models/address'
import BalanceChange from 'vipsinfo/node/models/balance-change'
import Contract from 'vipsinfo/node/models/contract'
import ContractSpend from 'vipsinfo/node/models/contract-spend'
import EVMReceipt from 'vipsinfo/node/models/evm-receipt'
import EVMReceiptLog from 'vipsinfo/node/models/evm-receipt-log'
import GasRefund from 'vipsinfo/node/models/gas-refund'
import Header from 'vipsinfo/node/models/header'
import QRC20 from 'vipsinfo/node/models/qrc20'
import QRC721 from 'vipsinfo/node/models/qrc721'
import Transaction from 'vipsinfo/node/models/transaction'
import TransactionInput from 'vipsinfo/node/models/transaction-input'
import TransactionOutput from 'vipsinfo/node/models/transaction-output'
import Witness from 'vipsinfo/node/models/witness'
import { sql } from 'vipsinfo/node/utils'
import RpcClient from 'vipsinfo/rpc'

const { in: $in, or: $or, and: $and, gt: $gt } = Op

const COIN = 1e8

interface TransactionDb
  extends Omit<Transaction, 'header' | 'contractSpendSource'> {
  header: Pick<Header, 'hash' | 'timestamp'>
  contractSpendSource: Pick<ContractSpend, 'destId'> & {
    destTransaction: Pick<Transaction, 'id'>
  }
}

interface TransactionInputDb
  extends Omit<TransactionInput, 'outputTransaction' | 'output' | 'address'> {
  outputTransaction: Pick<Transaction, 'id'>
  output: Pick<TransactionOutput, 'outputIndex' | 'scriptPubKey'>
  address: Pick<Address, 'type' | 'string'> & {
    contract: Pick<Contract, 'address' | 'addressString'>
  }
}

interface TransactionOutputDb
  extends Omit<
    TransactionOutput,
    'inputTransaction' | 'address' | 'refund' | 'refundTo' | 'evmReceipt'
  > {
  inputTransaction: Pick<Transaction, 'id' | 'blockHeight'>
  address: Pick<Address, 'type' | 'string'> & {
    contract: Pick<Contract, 'address' | 'addressString'>
  }
  refund: Pick<GasRefund, 'refundIndex'> & {
    refundToTransaction: Pick<Transaction, 'id'>
    refundTo: Pick<TransactionOutput, 'value'>
  }
  refundTo: Pick<GasRefund, 'outputIndex'> & {
    transaction: Pick<Transaction, 'id'>
  }
  evmReceipt: Omit<EVMReceipt, 'contract'> & {
    contract: Pick<Contract, 'addressString'>
  }
}

interface EventLogDb
  extends Omit<EVMReceiptLog, 'contract' | 'qrc20' | 'qrc721'> {
  contract: Pick<Contract, 'addressString'>
  qrc20: Pick<QRC20, 'name' | 'symbol' | 'decimals'>
  qrc721: Pick<QRC721, 'name' | 'symbol'>
}

interface ContractSpendIODb {
  transactionId: bigint
  value: bigint
  address: Pick<Address, 'type' | 'string'> & {
    contract: Pick<Contract, 'address' | 'addressString'>
  }
}

interface ContractSpendIO {
  address?: string
  addressHex?: Buffer | undefined
  value: bigint
}

export interface ContractSpendIOString {
  address?: string
  addressHex?: string
  value: string
}

interface ContractSpendDb {
  inputs: ContractSpendIO[]
  outputs: ContractSpendIO[]
}

export interface TransactionInputObject
  extends Pick<
    TransactionInput,
    'outputIndex' | 'scriptSig' | 'sequence' | 'value'
  > {
  prevTxId: Buffer
  witness: Buffer[]
  scriptPubKey: Buffer
  address?: string
  addressHex?: Buffer
  isInvalidContract?: true
}

export interface TransactionOutputObject
  extends Pick<TransactionOutput, 'scriptPubKey' | 'value'> {
  address?: string
  addressHex?: Buffer
  isInvalidContract?: true
  spentTxId?: Buffer
  spentIndex?: number
  spentHeight?: number
  refundTxId?: Buffer
  refundIndex?: number
  refundValue?: bigint
  isRefund?: true
  evmReceipt?: Pick<EVMReceipt, 'gasUsed' | 'excepted' | 'exceptedMessage'> & {
    sender: string
    contractAddress: string
    contractAddressHex: Buffer
    logs: {
      address: string
      addressHex: Buffer
      topics: Buffer[]
      data: Buffer
      qrc20?: Pick<QRC20, 'name' | 'symbol' | 'decimals'>
      qrc721?: Pick<QRC721, 'name' | 'symbol'>
    }[]
  }
}

export interface TransactionObject
  extends Pick<
    Transaction,
    'id' | 'hash' | 'version' | 'flag' | 'lockTime' | 'size' | 'weight'
  > {
  inputs: TransactionInputObject[]
  outputs: TransactionOutputObject[]
  block?: Pick<Header, 'hash' | 'height' | 'timestamp'>
  contractSpendSource?: Buffer
  contractSpends: ContractSpendDb[]
}

export interface AllTransactionObject {
  totalCount: number
  ids: Buffer[]
}

export interface TransformedTransactionObject {
  id: string
  hash?: string
  version?: number
  lockTime?: number
  blockHash?: string
  inputs: TransformedTransactionInputObject[]
  outputs: TransformedTransactionOutputObject[]
  isCoinbase: boolean
  isCoinstake: boolean
  blockHeight?: number
  confirmations: number
  timestamp: number | undefined
  inputValue: string
  outputValue: string
  refundValue: string
  fees: string
  size?: number
  weight?: number
  contractSpendSource?: string
  contractSpends?: {
    inputs: ContractSpendIOString[]
    outputs: ContractSpendIOString[]
  }[]
  qrc20TokenTransfers: Qrc20TransferObject[] | undefined
  qrc20TokenUnconfirmedTransfers: Qrc20UnconfirmedTransferObject[] | undefined
  qrc721TokenTransfers: Qrc721TransferObject[] | undefined
}

export interface TransformedTransactionInputObject {
  index: number
  coinbase?: string
  prevTxId?: string
  outputIndex?: number
  value?: string
  address?: string
  addressHex?: string
  isInvalidContract?: true
  scriptSig: {
    type: string
    hex?: string
    asm?: string
  }
  sequence?: number
  witness: string[]
}

export interface TransformedTransactionOutputObject {
  index: number
  value: string
  address: string
  addressHex: string
  isInvalidContract: true
  scriptPubKey: {
    type: string
    hex?: string
    asm?: string
  }
  isRefund?: true
  spentTxId?: string
  spentIndex?: number
  spentHeight?: number
  receipt?: Pick<EVMReceipt, 'gasUsed' | 'excepted' | 'exceptedMessage'> & {
    sender: string
    contractAddress: string
    contractAddressHex: string
    logs: {
      address: string
      addressHex: string
      topics: string[]
      data: string
    }[]
  }
}

export interface Qrc20TransferObject
  extends Pick<QRC20, 'name' | 'symbol' | 'decimals'> {
  address: string
  addressHex: string
  from: string
  fromHex?: string
  to: string
  toHex?: string
  value: string
}

export interface Qrc20UnconfirmedTransferObject
  extends Pick<QRC20, 'name' | 'symbol' | 'decimals'> {
  address: string
  addressHex: string
  from: string
  to: string
  toHex?: string
  value: string
}

export interface Qrc721TransferObject extends Pick<QRC721, 'name' | 'symbol'> {
  address: string
  addressHex: string
  from: string
  fromHex?: string
  to: string
  toHex?: string
  tokenId: string
}

export interface TransformedInsightTransactionObject {
  txid: string
  hash: string
  version: number
  locktime: number
  receipt?: ReceiptInsightObject[]
  isqrc20Transfer: boolean
  vin: TransformedInsightTransactionInputObject[]
  vout: TransformedInsightTransactionOutputObject[]
  blockhash?: string
  blockheight?: number
  confirmations: number
  time?: number
  blocktime?: number
  isCoinbase?: boolean
  isCoinstake?: boolean
  valueOut: number
  size: number
  valueIn?: number
  fees?: number
}

export interface ReceiptInsightObject {
  blockHash: string
  blockNumber?: number
  transactionHash: string
  transactionIndex: number
  from: string
  to: string
  cumulativeGasUsed: number
  gasUsed: number
  contractAddress: string
  excepted: string
  log: ReceiptLogInsightObject[]
}

export interface ReceiptLogInsightObject {
  address: string
  topics: string[]
  data: string
}

export interface TransformedInsightTransactionInputObject {
  coinbase?: string
  txid?: string
  vout?: number
  sequence: number
  n: number
  scriptSig?: {
    hex: string
    asm: string
  }
  addr?: string
  valueSat?: number
  value?: number
  doubleSpentTxID?: null
}

export interface TransformedInsightTransactionOutputObject {
  value: string
  n: number
  scriptPubKey?: {
    hex: string
    asm: string
    addresses: string[]
    type: string
  }
  spentTxId: string | null
  spentIndex: number | null
  spentHeight: number | null
}

interface BasicTransactionDb
  extends Pick<Transaction, 'id' | 'blockHeight' | 'indexInBlock'> {
  header: Pick<Header, 'hash' | 'timestamp'>
}

interface BasicTransactionInputDb
  extends Pick<
    TransactionInput,
    'value' | 'addressId' | 'outputTransaction' | 'outputIndex'
  > {}

interface BasicTransactionOutputDb
  extends Pick<TransactionOutput, 'value' | 'addressId'> {
  evmReceipt: Pick<EVMReceipt, '_id'>
  refund: {
    refundTo: Pick<TransactionOutput, 'value'>
  }
  refundTo: Pick<GasRefund, 'transactionId'>
}

export interface ValueAndIdTxIO {
  value: bigint
  addressId: bigint
}

export interface BasicTransactionObject {
  id: Buffer
  inputs: ValueAndIdTxIO[]
  outputs: ValueAndIdTxIO[]
  blockHeight?: number
  blockHash?: Buffer
  timestamp?: number
  inputValue: bigint
  outputValue: bigint
  refundValue: bigint
  fees: bigint
  amount: bigint
  type: string
}

interface ContractTxReceiptDb
  extends Omit<EVMReceipt, 'header' | 'transaction' | 'output' | 'contract'> {
  header: Pick<Header, 'hash' | 'timestamp'>
  transaction: Pick<Transaction, 'id'>
  output: Pick<TransactionOutput, 'scriptPubKey' | 'value'> & {
    address: Pick<Address, 'type' | 'string'> & {
      contract: Pick<Contract, 'address' | 'addressString'>
    }
  }
  contract: Pick<Contract, 'addressString'>
}

interface ContractTxLogDb extends Omit<EVMReceiptLog, 'contract'> {
  contract: Pick<Contract, 'addressString'>
}

export interface ContractTransactionObject {
  transactionId: Buffer
  outputIndex: number
  blockHeight?: number
  blockHash?: Buffer
  timestamp?: number
  scriptPubKey: IEVMContractCallScript | IEVMContractCallBySenderScript
  value: bigint
  outputAddress: string
  outputAddressHex: Buffer
  isInvalidContract?: true
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

export interface BriefOption {
  brief: boolean
}

export interface ITransactionService extends Service {
  getTransaction(id: Buffer): Promise<TransactionObject | null>
  getRawTransaction(id: Buffer): Promise<RawTransaction | null>
  getRecentTransactions(count: number): Promise<Buffer[]>
  getAllTransactions(): Promise<AllTransactionObject>
  getMempoolTransactionAddresses(id: Buffer): Promise<string[]>
  sendRawTransaction(data: Buffer): Promise<Buffer | undefined>
  transformTransaction(
    transaction: TransactionObject,
    object?: BriefOption
  ): Promise<TransformedTransactionObject>
  transformInsightTransaction(
    transaction: TransactionObject
  ): Promise<TransformedInsightTransactionObject>
  transformInput(
    input: TransactionInputObject,
    index: number,
    transaction: TransactionObject,
    object: BriefOption
  ): TransformedTransactionInputObject
  transformOutput(
    output: TransactionOutputObject,
    index: number,
    object: BriefOption
  ): TransformedTransactionOutputObject
  transformQRC20Transfers(
    outputs: TransactionOutputObject[]
  ): Promise<Qrc20TransferObject[] | undefined>
  transformQRC20UnconfirmedTransfers(
    outputs: TransactionOutputObject[]
  ): Promise<Qrc20UnconfirmedTransferObject[] | undefined>
  transformQRC721Transfers(
    outputs: TransactionOutputObject[]
  ): Promise<Qrc721TransferObject[] | undefined>
  getBasicTransaction(
    transactionId: bigint,
    addressIds: bigint[]
  ): Promise<BasicTransactionObject | null>
  getContractTransaction(
    receiptId: bigint
  ): Promise<ContractTransactionObject | null>
  transformTopics(
    log: Pick<EVMReceiptLog, 'topic1' | 'topic2' | 'topic3' | 'topic4'> & {
      [key: string]: any
    }
  ): Buffer[]
}

class TransactionService extends Service implements ITransactionService {
  async getTransaction(id: Buffer): Promise<TransactionObject | null> {
    const transaction: TransactionDb | null = await Transaction.findOne({
      where: { id },
      include: [
        {
          model: Header,
          as: 'header',
          required: false,
          attributes: ['hash', 'timestamp'],
        },
        {
          model: ContractSpend,
          as: 'contractSpendSource',
          required: false,
          attributes: ['destId'],
          include: [
            {
              model: Transaction,
              as: 'destTransaction',
              required: true,
              attributes: ['id'],
            },
          ],
        },
      ],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    if (!transaction) {
      return null
    }
    const witnesses: Pick<
      Witness,
      'inputIndex' | 'script'
    >[] = await Witness.findAll({
      where: { transactionId: id },
      attributes: ['inputIndex', 'script'],
      order: [
        ['inputIndex', 'ASC'],
        ['witnessIndex', 'ASC'],
      ],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })

    const inputs: TransactionInputDb[] = await TransactionInput.findAll({
      where: { transactionId: transaction._id },
      include: [
        {
          model: Transaction,
          as: 'outputTransaction',
          required: false,
          attributes: ['id'],
        },
        {
          model: TransactionOutput,
          as: 'output',
          on: {
            transactionId: where(
              col('output.transaction_id'),
              '=',
              col('TransactionInput.output_id')
            ),
            outputIndex: where(
              col('output.output_index'),
              '=',
              col('TransactionInput.output_index')
            ),
          },
          required: false,
          attributes: ['outputIndex', 'scriptPubKey'],
        },
        {
          model: Address,
          as: 'address',
          required: false,
          attributes: ['type', 'string'],
          include: [
            {
              model: Contract,
              as: 'contract',
              required: false,
              attributes: ['address', 'addressString'],
            },
          ],
        },
      ],
      order: [['inputIndex', 'ASC']],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const outputs: TransactionOutputDb[] = await TransactionOutput.findAll({
      where: { transactionId: transaction._id },
      include: [
        {
          model: Transaction,
          as: 'inputTransaction',
          required: false,
          attributes: ['id', 'blockHeight'],
        },
        {
          model: TransactionInput,
          as: 'input',
          on: {
            transactionId: where(
              col('input.transaction_id'),
              '=',
              col('TransactionOutput.input_id')
            ),
            outputIndex: where(
              col('input.input_index'),
              '=',
              col('TransactionOutput.input_index')
            ),
          },
          required: false,
          attributes: [],
        },
        {
          model: Address,
          as: 'address',
          required: false,
          attributes: ['type', 'string'],
          include: [
            {
              model: Contract,
              as: 'contract',
              required: false,
              attributes: ['address', 'addressString'],
            },
          ],
        },
        {
          model: GasRefund,
          as: 'refund',
          on: {
            transactionId: where(
              col('refund.transaction_id'),
              '=',
              transaction._id.toString()
            ),
            outputIndex: where(
              col('refund.output_index'),
              '=',
              col('TransactionOutput.output_index')
            ),
          },
          required: false,
          attributes: ['refundIndex'],
          include: [
            {
              model: Transaction,
              as: 'refundToTransaction',
              required: true,
              attributes: ['id'],
            },
            {
              model: TransactionOutput,
              as: 'refundTo',
              on: {
                transactionId: where(
                  col('refund->refundTo.transaction_id'),
                  '=',
                  col('refund.refund_id')
                ),
                outputIndex: where(
                  col('refund->refundTo.output_index'),
                  '=',
                  col('refund.refund_index')
                ),
              },
              required: true,
              attributes: ['value'],
            },
          ],
        },
        {
          model: GasRefund,
          as: 'refundTo',
          on: {
            transactionId: where(
              col('refundTo.refund_id'),
              '=',
              transaction._id.toString()
            ),
            outputIndex: where(
              col('refundTo.refund_index'),
              '=',
              col('TransactionOutput.output_index')
            ),
          },
          required: false,
          attributes: ['outputIndex'],
          include: [
            {
              model: Transaction,
              as: 'transaction',
              required: true,
              attributes: ['id'],
            },
          ],
        },
        {
          model: EVMReceipt,
          as: 'evmReceipt',
          on: {
            transactionId: where(
              col('evmReceipt.transaction_id'),
              '=',
              transaction._id.toString()
            ),
            outputIndex: where(
              col('evmReceipt.output_index'),
              '=',
              col('TransactionOutput.output_index')
            ),
          },
          required: false,
          include: [
            {
              model: Contract,
              as: 'contract',
              required: false,
              attributes: ['addressString'],
            },
          ],
        },
      ],
      order: [['outputIndex', 'ASC']],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })

    let eventLogs: EventLogDb[] = []
    const contractSpends: ContractSpendDb[] = []

    if (outputs.some((output) => output.evmReceipt)) {
      eventLogs = await EVMReceiptLog.findAll({
        where: {
          receiptId: {
            [$in]: outputs
              .filter((output) => output.evmReceipt)
              .map((output) => output.evmReceipt._id),
          },
        },
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
            required: false,
            attributes: ['name', 'symbol', 'decimals'],
          },
          {
            model: QRC721,
            as: 'qrc721',
            required: false,
            attributes: ['name', 'symbol'],
          },
        ],
        order: [['_id', 'ASC']],
        transaction: (this.ctx.state as ContextStateBase).transaction,
      })
      const contractSpendIds: bigint[] = (
        await Transaction.findAll({
          attributes: ['_id'],
          include: [
            {
              model: ContractSpend,
              as: 'contractSpendSource',
              required: true,
              attributes: [],
              where: { destId: transaction._id },
            },
          ],
          order: [
            ['blockHeight', 'ASC'],
            ['indexInBlock', 'ASC'],
          ],
          transaction: (this.ctx.state as ContextStateBase).transaction,
        })
      ).map((item) => item._id)
      if (contractSpendIds.length) {
        const contractSpendInputs: ContractSpendIODb[] = await TransactionInput.findAll(
          {
            where: { transactionId: { [$in]: contractSpendIds } },
            attributes: ['transactionId', 'value'],
            include: [
              {
                model: Address,
                as: 'address',
                required: false,
                attributes: ['type', 'string'],
                include: [
                  {
                    model: Contract,
                    as: 'contract',
                    required: false,
                    attributes: ['address', 'addressString'],
                  },
                ],
              },
            ],
            order: [['inputIndex', 'ASC']],
            transaction: (this.ctx.state as ContextStateBase).transaction,
          }
        )
        const contractSpendOutputs: ContractSpendIODb[] = await TransactionOutput.findAll(
          {
            where: { transactionId: { [$in]: contractSpendIds } },
            attributes: ['transactionId', 'value'],
            include: [
              {
                model: Address,
                as: 'address',
                required: false,
                attributes: ['type', 'string'],
                include: [
                  {
                    model: Contract,
                    as: 'contract',
                    required: false,
                    attributes: ['address', 'addressString'],
                  },
                ],
              },
            ],
            order: [['outputIndex', 'ASC']],
            transaction: (this.ctx.state as ContextStateBase).transaction,
          }
        )
        for (const id of contractSpendIds) {
          contractSpends.push({
            inputs: contractSpendInputs
              .filter((input) => input.transactionId === id)
              .map((input) => {
                const result: Partial<ContractSpendIO> = {}
                if (input.address) {
                  result.address =
                    [RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(
                      input.address.type as string
                    ) && input.address.contract
                      ? input.address.contract.address.toString('hex')
                      : input.address.string
                  result.addressHex =
                    [RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(
                      input.address.type as string
                    ) && input.address.contract
                      ? input.address.contract.address
                      : undefined
                }
                result.value = input.value
                return result as ContractSpendIO
              }),
            outputs: contractSpendOutputs
              .filter((output) => output.transactionId === id)
              .map((output) => {
                const result: Partial<ContractSpendIO> = {}
                if (output.address) {
                  result.address =
                    [RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(
                      output.address.type as string
                    ) && output.address.contract
                      ? output.address.contract.address.toString('hex')
                      : output.address.string
                  result.addressHex =
                    [RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(
                      output.address.type as string
                    ) && output.address.contract
                      ? output.address.contract.address
                      : undefined
                }
                result.value = output.value
                return result as ContractSpendIO
              }),
          })
        }
      }
    }

    return {
      id: transaction.id,
      hash: transaction.hash,
      version: transaction.version,
      flag: transaction.flag,
      inputs: inputs.map((input, index) => {
        const inputObject: TransactionInputObject = {
          prevTxId: input.outputTransaction
            ? input.outputTransaction.id
            : Buffer.alloc(32),
          outputIndex: input.outputIndex,
          scriptSig: input.scriptSig,
          sequence: input.sequence,
          witness: witnesses
            .filter(({ inputIndex }) => inputIndex === index)
            .map(({ script }) => script),
          value: input.value,
          scriptPubKey: input.output && input.output.scriptPubKey,
        }
        if (input.address) {
          if (
            [RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(
              input.address.type as string
            )
          ) {
            if (input.address.contract) {
              inputObject.address = input.address.contract.address.toString(
                'hex'
              )
              inputObject.addressHex = input.address.contract.address
            } else {
              const address = RawAddress.fromString(
                input.address.string,
                this.app.chain()
              ) as IAddress
              inputObject.address = address.data?.toString('hex')
              inputObject.addressHex = address.data
              inputObject.isInvalidContract = true
            }
          } else {
            inputObject.address = input.address.string
          }
        }
        return inputObject
      }),
      outputs: outputs.map((output) => {
        const outputObject: TransactionOutputObject = {
          scriptPubKey: output.scriptPubKey,
          value: output.value,
        }
        if (output.address) {
          if (
            [RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(
              output.address.type as string
            )
          ) {
            if (output.address.contract) {
              outputObject.address = output.address.contract.address.toString(
                'hex'
              )
              outputObject.addressHex = output.address.contract.address
            } else {
              const address = RawAddress.fromString(
                output.address.string,
                this.app.chain()
              ) as IAddress
              outputObject.address = address.data?.toString('hex')
              outputObject.addressHex = address.data
              outputObject.isInvalidContract = true
            }
          } else {
            outputObject.address = output.address.string
          }
        }
        if (output.inputTransaction) {
          outputObject.spentTxId = output.inputTransaction.id
          outputObject.spentIndex = output.inputIndex
          outputObject.spentHeight = output.inputTransaction.blockHeight
        }
        if (output.refund) {
          outputObject.refundTxId = output.refund.refundToTransaction.id
          outputObject.refundIndex = output.refund.refundIndex
          outputObject.refundValue = output.refund.refundTo.value
        }
        if (output.refundTo) {
          outputObject.isRefund = true
        }
        if (output.evmReceipt) {
          outputObject.evmReceipt = {
            sender: new RawAddress({
              type: output.evmReceipt.senderType,
              data: output.evmReceipt.senderData,
              chain: this.app.chain(),
            }).toString() as string,
            gasUsed: output.evmReceipt.gasUsed,
            contractAddress: output.evmReceipt.contractAddress.toString('hex'),
            contractAddressHex: output.evmReceipt.contractAddress,
            excepted: output.evmReceipt.excepted,
            exceptedMessage: output.evmReceipt.exceptedMessage,
            logs: eventLogs
              .filter((log) => log.receiptId === output.evmReceipt._id)
              .map((log) => ({
                address: log.address.toString('hex'),
                addressHex: log.address,
                topics: this.transformTopics(log),
                data: log.data,
                ...(log.qrc20
                  ? {
                      qrc20: {
                        name: log.qrc20.name,
                        symbol: log.qrc20.symbol,
                        decimals: log.qrc20.decimals,
                      },
                    }
                  : {}),
                ...(log.qrc721
                  ? {
                      qrc721: {
                        name: log.qrc721.name,
                        symbol: log.qrc721.symbol,
                      },
                    }
                  : {}),
              })),
          }
        }
        return outputObject
      }),
      lockTime: transaction.lockTime,
      ...(transaction.header
        ? {
            block: {
              hash: transaction.header.hash,
              height: transaction.blockHeight,
              timestamp: transaction.header.timestamp,
            },
          }
        : {}),
      ...(transaction.contractSpendSource
        ? {
            contractSpendSource:
              transaction.contractSpendSource.destTransaction.id,
          }
        : {}),
      contractSpends,
      size: transaction.size,
      weight: transaction.weight,
    }
  }

  async getRawTransaction(id: Buffer): Promise<RawTransaction | null> {
    const transaction: Pick<
      Transaction,
      '_id' | 'version' | 'flag' | 'lockTime'
    > | null = await Transaction.findOne({
      where: { id },
      attributes: ['_id', 'version', 'flag', 'lockTime'],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    if (!transaction) {
      return null
    }
    const witnesses: Pick<
      Witness,
      'inputIndex' | 'script'
    >[] = await Witness.findAll({
      where: { transactionId: id },
      attributes: ['inputIndex', 'script'],
      order: [
        ['inputIndex', 'ASC'],
        ['witnessIndex', 'ASC'],
      ],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })

    const inputs: (Pick<
      TransactionInput,
      'outputIndex' | 'scriptSig' | 'sequence'
    > & {
      outputTransaction: Pick<Transaction, 'id'>
    })[] = await TransactionInput.findAll({
      where: { transactionId: transaction._id },
      attributes: ['outputIndex', 'scriptSig', 'sequence'],
      include: [
        {
          model: Transaction,
          as: 'outputTransaction',
          required: false,
          attributes: ['id'],
        },
      ],
      order: [['inputIndex', 'ASC']],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const outputs: Pick<
      TransactionOutput,
      'value' | 'scriptPubKey'
    >[] = await TransactionOutput.findAll({
      where: { transactionId: transaction._id },
      attributes: ['value', 'scriptPubKey'],
      order: [['outputIndex', 'ASC']],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })

    return new RawTransaction({
      version: transaction.version,
      flag: transaction.flag,
      inputs: inputs.map(
        (input, index) =>
          new RawTransactionInput({
            prevTxId: input.outputTransaction
              ? input.outputTransaction.id
              : Buffer.alloc(32),
            outputIndex: input.outputIndex,
            scriptSig: input.scriptSig,
            sequence: input.sequence,
            witness: witnesses
              .filter(({ inputIndex }) => inputIndex === index)
              .map(({ script }) => script),
          })
      ),
      outputs: outputs.map(
        (output) =>
          new RawTransactionOutput({
            value: output.value,
            scriptPubKey: OutputScript.fromBuffer(output.scriptPubKey),
          })
      ),
      lockTime: transaction.lockTime,
    })
  }

  async getRecentTransactions(count: number = 10): Promise<Buffer[]> {
    return (
      await Transaction.findAll({
        where: {
          [$or]: [
            {
              [$and]: [
                where(
                  col('header.stake_prev_transaction_id'),
                  '=',
                  sql`${Buffer.alloc(32)}`
                ),
                where(
                  col('header.stake_output_index'),
                  '=',
                  sql`${0xffffffff}`
                ),
                { indexInBlock: { [$gt]: 0 } },
              ],
            },
            {
              [$and]: [
                where(
                  col('header.stake_prev_transaction_id'),
                  '!=',
                  sql`${Buffer.alloc(32)}`
                ),
                where(
                  col('header.stake_output_index'),
                  '!=',
                  sql`${0xffffffff}`
                ),
                { indexInBlock: { [$gt]: 1 } },
              ],
            },
          ],
        },
        include: [
          {
            model: Header,
            as: 'header',
            attributes: ['stakePrevTxId', 'stakeOutputIndex'],
          },
        ],
        attributes: ['id'],
        order: [
          ['blockHeight', 'DESC'],
          ['indexInBlock', 'DESC'],
          ['_id', 'DESC'],
        ],
        limit: count,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      })
    ).map((tx) => tx.id)
  }

  async getAllTransactions(): Promise<AllTransactionObject> {
    const db = this.ctx.model
    const { limit, offset } = (this.ctx
      .state as ContextStateForPagination).pagination
    const dbPowBlocks: Pick<Header, 'height'>[] = await Header.findAll({
      where: {
        stakeOutputIndex: 0xffffffff,
        stakePrevTxId: Buffer.alloc(32),
      },
      attributes: ['height'],
    })
    const powBlocks = dbPowBlocks
      .map(({ height }) => height)
      .slice(dbPowBlocks.length - offset, dbPowBlocks.length - offset + limit)
    const list: { id: Buffer }[] = await db.query(
      sql`
      SELECT transaction.id AS id FROM transaction, (
        SELECT _id FROM transaction
        WHERE block_height > 0 AND (block_height IN ${powBlocks} OR index_in_block > 0)
        ORDER BY block_height DESC, index_in_block DESC, _id DESC
        LIMIT ${offset}, ${limit}
      ) list
      WHERE transaction._id = list._id
      ORDER BY transaction.block_height DESC, transaction.index_in_block DESC, transaction._id DESC
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    return { totalCount: list.length, ids: list.map(({ id }) => id) }
  }

  async getMempoolTransactionAddresses(id: Buffer): Promise<string[]> {
    const balanceChanges: {
      address: Pick<Address, 'string'>
    }[] = await BalanceChange.findAll({
      attributes: [],
      include: [
        {
          model: Transaction,
          as: 'transaction',
          required: true,
          where: { id },
          attributes: [],
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
    const receipts: Pick<
      EVMReceipt,
      'senderType' | 'senderData'
    >[] = await EVMReceipt.findAll({
      attributes: ['senderType', 'senderData'],
      include: [
        {
          model: Transaction,
          as: 'transaction',
          required: true,
          where: { id },
          attributes: [],
        },
      ],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const addresses = new Set(balanceChanges.map((item) => item.address.string))
    for (const receipt of receipts) {
      addresses.add(
        new RawAddress({
          type: receipt.senderType,
          data: receipt.senderData,
          chain: this.app.chain(),
        }).toString() as string
      )
    }
    return [...addresses]
  }

  async sendRawTransaction(data: Buffer): Promise<Buffer | undefined> {
    const client = new RpcClient(this.app.config.vipsinfo.rpc)
    const id = await client.rpcMethods.sendrawtransaction?.(
      data.toString('hex')
    )
    if (id) return Buffer.from(id, 'hex')
  }

  async transformTransaction(
    transaction: TransactionObject,
    { brief }: BriefOption = { brief: false }
  ): Promise<TransformedTransactionObject> {
    const confirmations = transaction.block
      ? (this.app.blockchainInfo.tip?.height as number) -
        transaction.block.height +
        1
      : 0
    const inputValue = transaction.inputs
      .map((input) => input.value)
      .reduce((x, y) => x + y)
    const outputValue = transaction.outputs
      .map((output) => output.value)
      .reduce((x, y) => x + y)
    const refundValue = transaction.outputs
      .map((output) => output.refundValue)
      .filter(Boolean)
      .reduce((x, y) => (x as bigint) + (y as bigint), BigInt(0)) as bigint
    const refundToValue = transaction.outputs
      .filter((output) => output.isRefund)
      .map((output) => output.value)
      .reduce((x, y) => x + y, BigInt(0))
    const inputs = transaction.inputs.map((input, index) =>
      this.transformInput(input, index, transaction, { brief })
    )
    const outputs = transaction.outputs.map((output, index) =>
      this.transformOutput(output, index, { brief })
    )

    const [
      qrc20TokenTransfers,
      qrc20TokenUnconfirmedTransfers,
      qrc721TokenTransfers,
    ] = await Promise.all([
      this.transformQRC20Transfers(transaction.outputs),
      confirmations === 0
        ? this.transformQRC20UnconfirmedTransfers(transaction.outputs)
        : undefined,
      this.transformQRC721Transfers(transaction.outputs),
    ])

    return {
      id: transaction.id.toString('hex'),
      ...(brief
        ? {}
        : {
            hash: transaction.hash.toString('hex'),
            version: transaction.version,
            lockTime: transaction.lockTime,
            blockHash:
              transaction.block && transaction.block.hash.toString('hex'),
          }),
      inputs,
      outputs,
      isCoinbase: isCoinbase(transaction.inputs[0]),
      isCoinstake: isCoinstake(transaction),
      blockHeight: transaction.block && transaction.block.height,
      confirmations,
      timestamp: transaction.block && transaction.block.timestamp,
      inputValue: inputValue.toString(),
      outputValue: outputValue.toString(),
      refundValue: refundValue.toString(),
      fees: (inputValue - outputValue - refundValue + refundToValue).toString(),
      ...(brief
        ? {}
        : {
            size: transaction.size,
            weight: transaction.weight,
            contractSpendSource:
              transaction.contractSpendSource &&
              transaction.contractSpendSource.toString('hex'),
            contractSpends: transaction.contractSpends.length
              ? transaction.contractSpends.map(({ inputs, outputs }) => ({
                  inputs: inputs.map((input) => ({
                    address: input.addressHex?.toString('hex'),
                    addressHex: input.addressHex?.toString('hex'),
                    value: input.value.toString(),
                  })),
                  outputs: outputs.map((output) => ({
                    address: output.addressHex
                      ? output.addressHex.toString('hex')
                      : output.address,
                    addressHex:
                      output.addressHex && output.addressHex.toString('hex'),
                    value: output.value.toString(),
                  })),
                }))
              : undefined,
          }),
      qrc20TokenTransfers,
      qrc20TokenUnconfirmedTransfers,
      qrc721TokenTransfers,
    }
  }

  async transformInsightTransaction(
    transaction: TransactionObject
  ): Promise<TransformedInsightTransactionObject> {
    const transformedTransaction = await this.transformTransaction(transaction)
    const hasReceiptOutputs = transformedTransaction.outputs.filter(
      (output) => output.receipt
    )
    let valueIn: number | undefined =
      parseInt(transformedTransaction.inputValue) / COIN
    let fees: number | undefined = parseInt(transformedTransaction.fees) / COIN
    if (fees < 0) {
      valueIn = undefined
      fees = undefined
    }
    return {
      txid: transformedTransaction.id,
      hash: transformedTransaction.hash as string,
      version: transformedTransaction.version as number,
      locktime: transformedTransaction.lockTime as number,
      receipt: hasReceiptOutputs.length
        ? hasReceiptOutputs.map((output) => {
            const receipt = output.receipt
            return {
              blockHash: transformedTransaction.blockHash as string,
              blockNumber: transformedTransaction.blockHeight,
              transactionHash: transformedTransaction.hash as string,
              transactionIndex: output.index,
              from: RawAddress.fromString(
                receipt?.sender as string,
                this.app.chain()
              )?.data?.toString('hex') as string,
              to: receipt?.contractAddress as string,
              cumulativeGasUsed: receipt?.gasUsed as number,
              gasUsed: receipt?.gasUsed as number,
              contractAddress: receipt?.contractAddress as string,
              excepted: receipt?.excepted as string,
              log: receipt?.logs.map((log) => {
                return {
                  address: log.address,
                  topics: log.topics,
                  data: log.data,
                }
              }) as ReceiptLogInsightObject[],
            }
          })
        : undefined,
      isqrc20Transfer: !!transformedTransaction.qrc20TokenTransfers,
      vin: transformedTransaction.inputs.map((input) => {
        const valueSat = parseInt(input.value as string)
        const value = valueSat / COIN
        const result = {
          sequence: input.sequence,
          n: input.index,
        } as TransformedInsightTransactionInputObject
        if (input.coinbase) {
          result.coinbase = input.coinbase
        } else {
          result.txid = input.prevTxId
          result.vout = input.outputIndex
          result.scriptSig = {
            hex: input.scriptSig.hex as string,
            asm: input.scriptSig.asm as string,
          }
          result.addr = input.address
          result.valueSat = valueSat
          result.value = value
          result.doubleSpentTxID = null
        }
        return result
      }),
      vout: transformedTransaction.outputs.map((output) => {
        const value = String(parseInt(output.value) / COIN)
        let addressStr: string | undefined
        const address = RawAddress.fromScript(
          // @ts-ignore
          OutputScript.fromBuffer(
            Buffer.from(output.scriptPubKey.hex as string, 'hex')
          ),
          this.app.chain(),
          Buffer.from(transformedTransaction.id, 'hex'),
          output.index
        )
        if (
          address &&
          output.receipt &&
          transformedTransaction.qrc20TokenTransfers
        ) {
          for (const tokenTransfers of transformedTransaction.qrc20TokenTransfers) {
            if (tokenTransfers.address === address.toString()) {
              addressStr = tokenTransfers.to
            }
          }
        } else if (address) {
          addressStr = address.toString()
        }
        return {
          value,
          n: output.index,
          scriptPubKey: Object.assign(
            output.scriptPubKey,
            addressStr
              ? {
                  addresses: [addressStr],
                }
              : {}
          ),
          spentTxId: output.spentTxId || null,
          spentIndex: output.spentIndex || null,
          spentHeight: output.spentHeight || null,
        } as TransformedInsightTransactionOutputObject
      }),
      blockhash: transformedTransaction.blockHash,
      blockheight: transformedTransaction.blockHeight,
      confirmations: transformedTransaction.confirmations,
      time: transformedTransaction.timestamp,
      blocktime: transformedTransaction.timestamp,
      isCoinbase: transformedTransaction.isCoinbase
        ? transformedTransaction.isCoinbase
        : undefined,
      isCoinstake: transformedTransaction.isCoinstake
        ? transformedTransaction.isCoinstake
        : undefined,
      valueOut: parseInt(transformedTransaction.outputValue) / COIN,
      size: transformedTransaction.size as number,
      valueIn,
      fees,
    }
  }

  transformInput(
    input: TransactionInputObject,
    index: number,
    transaction: TransactionObject,
    { brief }: BriefOption
  ): TransformedTransactionInputObject {
    const scriptSig = InputScript.fromBuffer(input.scriptSig, {
      scriptPubKey: OutputScript.fromBuffer(
        input.scriptPubKey || Buffer.alloc(0)
      ),
      witness: input.witness,
      isCoinbase: isCoinbase(input),
    })
    const result: Partial<TransformedTransactionInputObject> = {
      index,
    }
    if (scriptSig.type === InputScript.COINBASE) {
      result.coinbase = (scriptSig as ICoinbaseScript).buffer?.toString('hex')
    } else {
      result.prevTxId = input.prevTxId.toString('hex')
      result.outputIndex = input.outputIndex
      result.value = input.value.toString()
      result.address = input.addressHex
        ? input.addressHex.toString('hex')
        : input.address
      result.addressHex = input.addressHex && input.addressHex.toString('hex')
      result.isInvalidContract = input.isInvalidContract
    }
    result.scriptSig = { type: scriptSig.type }
    if (!brief) {
      result.scriptSig.hex = input.scriptSig.toString('hex')
      result.scriptSig.asm = scriptSig.toString()
      result.sequence = input.sequence
    }
    if (transaction.flag) {
      result.witness = input.witness.map((script) => script.toString('hex'))
    }
    return result as TransformedTransactionInputObject
  }

  transformOutput(
    output: TransactionOutputObject,
    index: number,
    { brief }: BriefOption
  ): TransformedTransactionOutputObject {
    const scriptPubKey = OutputScript.fromBuffer(output.scriptPubKey)
    const type = scriptPubKey.isEmpty() ? 'empty' : scriptPubKey.type
    const result = {
      index,
      value: output.value.toString(),
      address: output.addressHex
        ? output.addressHex.toString('hex')
        : output.address,
      addressHex: output.addressHex && output.addressHex.toString('hex'),
      isInvalidContract: output.isInvalidContract,
      scriptPubKey: { type },
    } as TransformedTransactionOutputObject
    if (!brief) {
      result.scriptPubKey.hex = output.scriptPubKey.toString('hex')
      result.scriptPubKey.asm = scriptPubKey.toString()
      result.isRefund = output.isRefund
    }
    if (output.spentTxId) {
      result.spentTxId = output.spentTxId.toString('hex')
      result.spentIndex = output.spentIndex
      result.spentHeight = output.spentHeight
    }
    if (!brief && output.evmReceipt) {
      result.receipt = {
        sender: output.evmReceipt.sender,
        gasUsed: output.evmReceipt.gasUsed,
        contractAddress: output.evmReceipt.contractAddressHex.toString('hex'),
        contractAddressHex: output.evmReceipt.contractAddressHex.toString(
          'hex'
        ),
        excepted: output.evmReceipt.excepted,
        exceptedMessage: output.evmReceipt.exceptedMessage,
        logs: output.evmReceipt.logs.map((log) => ({
          address: log.addressHex.toString('hex'),
          addressHex: log.addressHex.toString('hex'),
          topics: log.topics.map((topic) => topic.toString('hex')),
          data: log.data.toString('hex'),
        })),
      }
    }
    return result
  }

  async transformQRC20Transfers(
    outputs: TransactionOutputObject[]
  ): Promise<Qrc20TransferObject[] | undefined> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const result: Qrc20TransferObject[] = []
    for (const output of outputs) {
      if (output.evmReceipt) {
        for (const { addressHex, topics, data, qrc20 } of output.evmReceipt
          .logs) {
          if (
            qrc20 &&
            topics.length === 3 &&
            Buffer.compare(topics[0], TransferABI.id) === 0 &&
            data.length === 32
          ) {
            const [
              from,
              to,
            ] = await this.ctx.service.contract.transformHexAddresses([
              topics[1].slice(12),
              topics[2].slice(12),
            ])
            result.push({
              address: addressHex.toString('hex'),
              addressHex: addressHex.toString('hex'),
              name: qrc20.name,
              symbol: qrc20.symbol,
              decimals: qrc20.decimals,
              ...(from && typeof from === 'object'
                ? {
                    from: from.hex.toString('hex'),
                    fromHex: from.hex.toString('hex'),
                  }
                : { from }),
              ...(to && typeof to === 'object'
                ? { to: to.hex.toString('hex'), toHex: to.hex.toString('hex') }
                : { to }),
              value: BigInt(`0x${data.toString('hex')}`).toString(),
            })
          }
        }
      }
    }
    if (result.length) {
      return result
    }
  }

  async transformQRC20UnconfirmedTransfers(
    outputs: TransactionOutputObject[]
  ): Promise<Qrc20UnconfirmedTransferObject[] | undefined> {
    const transferABI = qrc20ABIs.find(
      (abi) => abi.name === 'transfer'
    ) as IMethodABI
    const result: Qrc20UnconfirmedTransferObject[] = []
    for (const output of outputs) {
      if (output.evmReceipt) {
        const qrc20 = await QRC20.findOne({
          where: { contractAddress: output.addressHex },
          attributes: ['name', 'symbol', 'decimals'],
          transaction: (this.ctx.state as ContextStateBase).transaction,
        })
        if (!qrc20) {
          continue
        }
        const scriptPubKey = OutputScript.fromBuffer(output.scriptPubKey)
        if (
          ![
            OutputScript.EVM_CONTRACT_CALL,
            OutputScript.EVM_CONTRACT_CALL_SENDER,
          ].includes(scriptPubKey.type)
        ) {
          continue
        }
        const byteCode = (scriptPubKey as
          | IEVMContractCallScript
          | IEVMContractCallBySenderScript).byteCode as Buffer
        if (
          byteCode.length !== 68 ||
          Buffer.compare(byteCode.slice(0, 4), transferABI.id) !== 0 ||
          Buffer.compare(byteCode.slice(4, 16), Buffer.alloc(12)) !== 0
        ) {
          continue
        }
        const from = output.evmReceipt.sender
        const [to] = await this.ctx.service.contract.transformHexAddresses([
          byteCode.slice(16, 36),
        ])
        const value = BigInt(`0x${byteCode.slice(36).toString('hex')}`)
        result.push({
          address: output.addressHex?.toString('hex') as string,
          addressHex: output.addressHex?.toString('hex') as string,
          name: qrc20.name,
          symbol: qrc20.symbol,
          decimals: qrc20.decimals,
          from,
          ...(to && typeof to === 'object'
            ? { to: to.string, toHex: to.hex.toString('hex') }
            : { to }),
          value: value.toString(),
        })
      }
    }
    if (result.length) {
      return result
    }
  }

  async transformQRC721Transfers(
    outputs: TransactionOutputObject[]
  ): Promise<Qrc721TransferObject[] | undefined> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const result: Qrc721TransferObject[] = []
    for (const output of outputs) {
      if (output.evmReceipt) {
        for (const { addressHex, topics, qrc721 } of output.evmReceipt.logs) {
          if (
            qrc721 &&
            topics.length === 4 &&
            Buffer.compare(topics[0], TransferABI.id) === 0
          ) {
            const [
              from,
              to,
            ] = await this.ctx.service.contract.transformHexAddresses([
              topics[1].slice(12),
              topics[2].slice(12),
            ])
            result.push({
              address: addressHex.toString('hex'),
              addressHex: addressHex.toString('hex'),
              name: qrc721.name,
              symbol: qrc721.symbol,
              ...(from && typeof from === 'object'
                ? {
                    from: from.hex.toString('hex'),
                    fromHex: from.hex.toString('hex'),
                  }
                : { from }),
              ...(to && typeof to === 'object'
                ? { to: to.hex.toString('hex'), toHex: to.hex.toString('hex') }
                : { to }),
              tokenId: topics[3].toString('hex'),
            })
          }
        }
      }
    }
    if (result.length) {
      return result
    }
  }

  async getBasicTransaction(
    transactionId: bigint,
    addressIds: bigint[]
  ): Promise<BasicTransactionObject | null> {
    const transaction: BasicTransactionDb | null = await Transaction.findOne({
      where: { _id: transactionId },
      attributes: ['id', 'blockHeight', 'indexInBlock'],
      include: [
        {
          model: Header,
          as: 'header',
          required: false,
          attributes: ['hash', 'timestamp'],
        },
      ],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    if (!transaction) {
      return null
    }

    const inputs: BasicTransactionInputDb[] = await TransactionInput.findAll({
      where: { transactionId },
      attributes: ['value', 'addressId', 'outputIndex'],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const outputs: BasicTransactionOutputDb[] = await TransactionOutput.findAll(
      {
        where: { transactionId },
        attributes: ['value', 'addressId'],
        include: [
          {
            model: EVMReceipt,
            as: 'evmReceipt',
            on: {
              transactionId: where(
                col('evmReceipt.transaction_id'),
                '=',
                col('TransactionOutput.transaction_id')
              ),
              outputIndex: where(
                col('evmReceipt.output_index'),
                '=',
                col('TransactionOutput.output_index')
              ),
            },
            required: false,
            attributes: ['_id'],
          },
          {
            model: GasRefund,
            as: 'refund',
            on: {
              transactionId: where(
                col('refund.transaction_id'),
                '=',
                transactionId.toString()
              ),
              outputIndex: where(
                col('refund.output_index'),
                '=',
                col('TransactionOutput.output_index')
              ),
            },
            required: false,
            attributes: [],
            include: [
              {
                model: TransactionOutput,
                as: 'refundTo',
                on: {
                  transactionId: where(
                    col('refund->refundTo.transaction_id'),
                    '=',
                    col('refund.refund_id')
                  ),
                  outputIndex: where(
                    col('refund->refundTo.output_index'),
                    '=',
                    col('refund.refund_index')
                  ),
                },
                required: true,
                attributes: ['value'],
              },
            ],
          },
          {
            model: GasRefund,
            as: 'refundTo',
            on: {
              transactionId: where(
                col('refundTo.refund_id'),
                '=',
                transactionId.toString()
              ),
              outputIndex: where(
                col('refundTo.refund_index'),
                '=',
                col('TransactionOutput.output_index')
              ),
            },
            required: false,
            attributes: ['transactionId'],
          },
        ],
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )

    const inputValue = inputs
      .map((input) => input.value)
      .reduce((x, y) => x + y)
    const outputValue = outputs
      .map((output) => output.value)
      .reduce((x, y) => x + y)
    const refundValue = outputs
      .filter((output) => output.refund)
      .map((output) => output.refund.refundTo.value)
      .reduce((x, y) => x + y, BigInt(0))
    const refundToValue = outputs
      .filter((output) => output.refundTo)
      .map((output) => output.value)
      .reduce((x, y) => x + y, BigInt(0))
    const amount = [
      ...outputs
        .filter((output) => addressIds.includes(output.addressId))
        .map((output) => output.value),
      ...inputs
        .filter((input) => addressIds.includes(input.addressId))
        .map((input) => -input.value),
    ].reduce((x, y) => x + y, BigInt(0))
    let type = ''
    if (
      addressIds.includes(inputs[0].addressId) &&
      outputs.some((output) => output.evmReceipt)
    ) {
      type = 'contract'
    } else if (
      transaction.indexInBlock < 2 &&
      (inputs
        .map((input) => {
          return !isCoinbase({
            prevTxId: input.outputTransaction
              ? input.outputTransaction.id
              : Buffer.alloc(32),
            outputIndex: input.outputIndex,
          })
        })
        .reduce((x, y) => x && y) ||
        transaction.indexInBlock === 0)
    ) {
      if (
        outputs.some(
          (output) => addressIds.includes(output.addressId) && !output.refundTo
        )
      ) {
        type = 'block-reward'
      } else {
        type = 'gas-refund'
      }
    } else if (amount > BigInt(0)) {
      type = 'receive'
    } else if (amount < BigInt(0)) {
      type = 'send'
    }

    return {
      id: transaction.id,
      inputs: inputs.map((input) => ({
        value: input.value,
        addressId: input.addressId,
      })),
      outputs: outputs.map((output) => ({
        value: output.value,
        addressId: output.addressId,
      })),
      ...(transaction.blockHeight === 0xffffffff
        ? {}
        : {
            blockHeight: transaction.blockHeight,
            blockHash: transaction.header.hash,
            timestamp: transaction.header.timestamp,
          }),
      inputValue,
      outputValue,
      refundValue,
      fees: inputValue - outputValue - refundValue + refundToValue,
      amount,
      type,
    }
  }

  async getContractTransaction(
    receiptId: bigint
  ): Promise<ContractTransactionObject | null> {
    const receipt: ContractTxReceiptDb | null = await EVMReceipt.findOne({
      where: { _id: receiptId },
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
              col('EvmReceipt.transaction_id')
            ),
            outputIndex: where(
              col('output.output_index'),
              '=',
              col('EvmReceipt.output_index')
            ),
          },
          required: true,
          attributes: ['scriptPubKey', 'value'],
          include: [
            {
              model: Address,
              as: 'address',
              required: false,
              attributes: ['type', 'string'],
              include: [
                {
                  model: Contract,
                  as: 'contract',
                  required: false,
                  attributes: ['address', 'addressString'],
                },
              ],
            },
          ],
        },
        {
          model: Contract,
          as: 'contract',
          required: false,
          attributes: ['addressString'],
        },
      ],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    if (!receipt) {
      return null
    }
    const logs: ContractTxLogDb[] = await EVMReceiptLog.findAll({
      where: { receiptId },
      include: [
        {
          model: Contract,
          as: 'contract',
          required: true,
          attributes: ['addressString'],
        },
      ],
      order: [['logIndex', 'ASC']],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })

    let outputAddress: string
    let outputAddressHex: Buffer
    let isInvalidContract: true | undefined
    if (receipt.output.address.contract) {
      outputAddress = receipt.output.address.contract.address.toString('hex')
      outputAddressHex = receipt.output.address.contract.address
    } else {
      const address = RawAddress.fromString(
        receipt.output.address.string,
        this.app.chain()
      ) as IAddress
      outputAddress = address.data?.toString('hex') as string
      outputAddressHex = address.data as Buffer
      isInvalidContract = true
    }

    return {
      transactionId: receipt.transaction.id,
      outputIndex: receipt.outputIndex,
      ...(receipt.blockHeight === 0xffffffff
        ? {}
        : {
            blockHeight: receipt.blockHeight,
            blockHash: receipt.header.hash,
            timestamp: receipt.header.timestamp,
          }),
      scriptPubKey: OutputScript.fromBuffer(receipt.output.scriptPubKey) as
        | IEVMContractCallScript
        | IEVMContractCallBySenderScript,
      value: receipt.output.value,
      outputAddress,
      outputAddressHex,
      isInvalidContract,
      sender: new RawAddress({
        type: receipt.senderType,
        data: receipt.senderData,
        chain: this.app.chain(),
      }),
      gasUsed: receipt.gasUsed,
      contractAddress: receipt.contractAddress.toString('hex'),
      contractAddressHex: receipt.contractAddress,
      excepted: receipt.excepted,
      exceptedMessage: receipt.exceptedMessage,
      evmLogs: logs.map((log) => ({
        address: log.address.toString('hex'),
        addressHex: log.address,
        topics: this.transformTopics(log),
        data: log.data,
      })),
    }
  }

  transformTopics(
    log: Pick<EVMReceiptLog, 'topic1' | 'topic2' | 'topic3' | 'topic4'> & {
      [key: string]: any
    }
  ): Buffer[] {
    const result = []
    if (log.topic1) {
      result.push(log.topic1)
    }
    if (log.topic2) {
      result.push(log.topic2)
    }
    if (log.topic3) {
      result.push(log.topic3)
    }
    if (log.topic4) {
      result.push(log.topic4)
    }
    return result
  }
}

function isCoinbase(
  input: Pick<TransactionInputObject, 'prevTxId' | 'outputIndex'> &
    Partial<Omit<TransactionInputObject, 'prevTxId' | 'outputIndex'>>
): boolean {
  return (
    Buffer.compare(input.prevTxId, Buffer.alloc(32)) === 0 &&
    input.outputIndex === 0xffffffff
  )
}

function isCoinstake(transaction: TransactionObject): boolean {
  return (
    transaction.inputs.length > 0 &&
    Buffer.compare(transaction.inputs[0].prevTxId, Buffer.alloc(32)) !== 0 &&
    transaction.outputs.length >= 2 &&
    transaction.outputs[0].value === BigInt(0) &&
    transaction.outputs[0].scriptPubKey.length === 0
  )
}

export default TransactionService
