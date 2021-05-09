import {
  ContextStateBase,
  ContextStateForBlockFilter,
  ContextStateForPagination,
  Service,
} from 'egg'
import { Op, QueryTypes } from 'sequelize'
import {
  Address as RawAddress,
  Block as RawBlock,
  Header as RawHeader,
  IMethodABI,
  ITransaction,
  qrc20ABIs,
} from 'vipsinfo/lib'
import Address, {
  AddressCreationAttributes,
} from 'vipsinfo/node/models/address'
import BalanceChange from 'vipsinfo/node/models/balance-change'
import Block from 'vipsinfo/node/models/block'
import Contract, {
  ContractCreationAttributes,
} from 'vipsinfo/node/models/contract'
import EVMReceipt, {
  EvmReceiptCreationAttributes,
} from 'vipsinfo/node/models/evm-receipt'
import EVMReceiptLog, {
  EvmReceiptLogCreationAttributes,
} from 'vipsinfo/node/models/evm-receipt-log'
import Header, {
  HeaderCreationAttributes,
  HeaderModelAttributes,
} from 'vipsinfo/node/models/header'
import Transaction, {
  TransactionCreationAttributes,
} from 'vipsinfo/node/models/transaction'
import { sql } from 'vipsinfo/node/utils'

const { gte: $gte, lte: $lte, between: $between } = Op

export interface BlockObject
  extends Omit<
    HeaderModelAttributes,
    'isProofOfStake' | 'block' | 'transactions'
  > {
  nextHash: Buffer | null
  proofOfStake: boolean
  interval: number | null
  size: number
  weight: number
  transactions: Buffer[]
  miner: string
  reward: bigint
  confirmations: number
}

type BlockFilter = { height: number } | { hash: Buffer }

interface DateFilter {
  min: number
  max: number
}

interface BriefBlockObject {
  hash: Buffer
  height: number
  timestamp: number
  size: number
  miner: string
}

interface ListBlocksObject {
  totalCount: number
  blocks: BlockSummaryObject[]
}

interface BlockSummaryObject {
  hash: Buffer
  height: number
  timestamp: number
  transactionsCount: number
  interval: number | null
  size: number
  miner: string
  reward: bigint
}

interface MinerObject {
  address: string
  blocks: number
  balance: bigint
}

interface BiggestMinersObject {
  totalCount: number
  list: MinerObject[]
}

interface BalanceChangesDb {
  transaction: Pick<TransactionCreationAttributes, 'indexInBlock'>
  address: Pick<AddressCreationAttributes, 'string'>
}

interface ReceiptLogDb
  extends Pick<
    EvmReceiptLogCreationAttributes,
    'topic1' | 'topic2' | 'topic3' | 'topic4'
  > {
  receipt: Pick<EvmReceiptCreationAttributes, 'indexInBlock'>
  contract: Pick<ContractCreationAttributes, 'addressString' | 'type'>
}

export interface IBlockService extends Service {
  getBlock(arg: unknown): Promise<BlockObject | null>
  getRawBlock(arg: unknown): Promise<RawBlock | null>
  listBlocks(dateFilter: DateFilter | null): Promise<ListBlocksObject>
  getRecentBlocks(count: number): Promise<BlockSummaryObject[]>
  getBlockRewards(startHeight: number, endHeight: number): Promise<bigint[]>
  getBlockSummary(blocks: BriefBlockObject[]): Promise<BlockSummaryObject[]>
  getBiggestMiners(lastNBlocks: number | null): Promise<BiggestMinersObject>
  getBlockTransactions(height: number): Promise<Buffer[]>
  getBlockFilter(category: string): { [key: string]: object }
  getRawBlockFilter(category: string): { raw: string }
}

class BlockService extends Service implements IBlockService {
  async getBlock(arg: unknown): Promise<BlockObject | null> {
    let filter: BlockFilter
    if (Number.isInteger(arg)) {
      filter = { height: arg as number }
    } else if (Buffer.isBuffer(arg)) {
      filter = { hash: arg }
    } else {
      return null
    }
    const result = await Header.findOne({
      where: filter,
      include: [
        {
          model: Block,
          as: 'block',
          required: true,
          attributes: ['size', 'weight'],
          include: [
            {
              model: Address,
              as: 'miner',
              attributes: ['string'],
            },
          ],
        },
      ],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    if (!result) {
      return null
    }
    const [prevHeader, nextHeader, [reward]] = await Promise.all([
      Header.findOne({
        where: { height: result.height - 1 },
        attributes: ['timestamp'],
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }),
      Header.findOne({
        where: { height: result.height + 1 },
        attributes: ['hash'],
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }),
      this.getBlockRewards(result.height),
    ])
    return {
      hash: result.hash,
      height: result.height,
      version: result.version,
      prevHash: result.prevHash,
      nextHash: nextHeader && nextHeader.hash,
      merkleRoot: result.merkleRoot,
      timestamp: result.timestamp,
      bits: result.bits,
      nonce: result.nonce,
      hashStateRoot: result.hashStateRoot,
      hashUTXORoot: result.hashUTXORoot,
      stakePrevTxId: result.stakePrevTxId,
      stakeOutputIndex: result.stakeOutputIndex,
      signature: result.signature,
      chainwork: result.chainwork,
      proofOfStake: result.isProofOfStake,
      interval:
        result.height > 0 && prevHeader
          ? result.timestamp - prevHeader.timestamp
          : null,
      size: result.block.size,
      weight: result.block.weight,
      transactions: result.transactions.map((tx) => tx.id),
      miner: result.block.miner.string,
      difficulty: result.difficulty,
      reward,
      confirmations:
        (this.app.blockchainInfo.tip?.height as number) - result.height + 1,
    }
  }

  async getRawBlock(arg: unknown): Promise<RawBlock | null> {
    let filter: BlockFilter
    if (Number.isInteger(arg)) {
      filter = { height: arg as number }
    } else if (Buffer.isBuffer(arg)) {
      filter = { hash: arg }
    } else {
      return null
    }
    const block = await Header.findOne({
      where: filter,
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    if (!block) {
      return null
    }
    const transactionIds = block.transactions.map((tx) => tx.id)
    const transactions = await Promise.all(
      transactionIds.map(
        (id) =>
          this.ctx.service.transaction.getRawTransaction(
            id
          ) as Promise<ITransaction>
      )
    )
    return new RawBlock({
      header: new RawHeader({
        version: block.version,
        prevHash: block.prevHash,
        merkleRoot: block.merkleRoot,
        timestamp: block.timestamp,
        bits: block.bits,
        nonce: block.nonce,
        hashStateRoot: block.hashStateRoot,
        hashUTXORoot: block.hashUTXORoot,
        stakePrevTxId: block.stakePrevTxId,
        stakeOutputIndex: block.stakeOutputIndex,
        signature: block.signature,
      }),
      transactions,
    })
  }

  async listBlocks(dateFilter: DateFilter | null): Promise<ListBlocksObject> {
    const db = this.ctx.model
    let dateFilterString = ''
    if (dateFilter) {
      dateFilterString = sql`AND timestamp BETWEEN ${dateFilter.min} AND ${
        dateFilter.max - 1
      }`
    }
    const [{ totalCount }]: { totalCount: number }[] = await db.query(
      sql`
      SELECT COUNT(*) AS totalCount FROM header WHERE height <= ${
        this.app.blockchainInfo.tip?.height as number
      } ${{ raw: dateFilterString }}
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    let blocks: BriefBlockObject[]
    if ((this.ctx.state as ContextStateForPagination).pagination) {
      const { limit, offset } = (this.ctx
        .state as ContextStateForPagination).pagination
      blocks = await db.query(
        sql`
        SELECT
          header.hash AS hash, l.height AS height, header.timestamp AS timestamp,
          block.size AS size, address.string AS miner
        FROM (
          SELECT height FROM header
          WHERE height <= ${this.app.blockchainInfo.tip?.height as number} ${{
          raw: dateFilterString,
        }}
          ORDER BY height DESC
          LIMIT ${offset}, ${limit}
        ) l, header, block, address
        WHERE l.height = header.height AND l.height = block.height AND address._id = block.miner_id
        ORDER BY l.height ASC
      `,
        {
          type: QueryTypes.SELECT,
          transaction: (this.ctx.state as ContextStateBase).transaction,
        }
      )
    } else {
      blocks = await db.query(
        sql`
        SELECT
          header.hash AS hash, l.height AS height, header.timestamp AS timestamp,
          block.size AS size, address.string AS miner
        FROM (
          SELECT height FROM header
          WHERE height <= ${this.app.blockchainInfo.tip?.height as number} ${{
          raw: dateFilterString,
        }}
          ORDER BY height DESC
        ) l, header, block, address
        WHERE l.height = header.height AND l.height = block.height AND address._id = block.miner_id
        ORDER BY l.height ASC
      `,
        {
          type: QueryTypes.SELECT,
          transaction: (this.ctx.state as ContextStateBase).transaction,
        }
      )
    }
    if (blocks.length === 0) {
      return { totalCount, blocks: [] }
    } else {
      return { totalCount, blocks: await this.getBlockSummary(blocks) }
    }
  }

  async getRecentBlocks(count: number): Promise<BlockSummaryObject[]> {
    const db = this.ctx.model
    const blocks: BriefBlockObject[] = await db.query(
      sql`
      SELECT
        l.hash AS hash, l.height AS height, header.timestamp AS timestamp,
        l.size AS size, address.string AS miner
      FROM (
        SELECT hash, height, size, miner_id FROM block
        ORDER BY height DESC
        LIMIT ${count}
      ) l, header, address WHERE l.height = header.height AND l.miner_id = address._id
      ORDER BY l.height DESC
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    if (blocks.length === 0) {
      return []
    }
    blocks.reverse()
    return await this.getBlockSummary(blocks)
  }

  async getBlockRewards(
    startHeight: number,
    endHeight: number = startHeight + 1
  ): Promise<bigint[]> {
    const db = this.ctx.model
    const rewards: { value: number }[] = await db.query(
      sql`
      SELECT SUM(value) AS value FROM (
        SELECT tx.block_height AS height, output.value AS value FROM header, transaction tx, transaction_output output
        WHERE
          tx.block_height BETWEEN ${startHeight} AND ${endHeight - 1}
          AND header.height = tx.block_height
          AND tx.index_in_block = (SELECT CASE header.stake_prev_transaction_id WHEN ${Buffer.alloc(
            32
          )} THEN 0 ELSE 1 END)
          AND output.transaction_id = tx._id
          AND NOT EXISTS (
            SELECT refund_id FROM gas_refund
            WHERE refund_id = output.transaction_id AND refund_index = output.output_index
          )
        UNION ALL
        SELECT tx.block_height AS height, -input.value AS value
        FROM header, transaction tx, transaction_input input
        WHERE
          tx.block_height BETWEEN ${startHeight} AND ${endHeight - 1}
          AND header.height = tx.block_height
          AND tx.index_in_block = (SELECT CASE header.stake_prev_transaction_id WHEN ${Buffer.alloc(
            32
          )} THEN 0 ELSE 1 END)
          AND input.transaction_id = tx._id
      ) block_reward
      GROUP BY height
      ORDER BY height ASC
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    const result = rewards.map((reward) => BigInt(reward.value))
    if (startHeight === 0) {
      result[0] = BigInt(0)
    }
    return result
  }

  async getBlockSummary(
    blocks: BriefBlockObject[]
  ): Promise<BlockSummaryObject[]> {
    const db = this.ctx.model
    const transactionCounts: {
      height: number
      transactionsCount: number
    }[] = await db.query(
      sql`
        SELECT block.height AS height, MAX(transaction.index_in_block) + 1 AS transactionsCount
        FROM block
        INNER JOIN transaction ON block.height = transaction.block_height
        WHERE block.height BETWEEN ${blocks[0].height} AND ${
        blocks[blocks.length - 1].height
      }
        GROUP BY block.height
      `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    const transactionCountMapping = new Map(
      transactionCounts.map(({ height, transactionsCount }) => [
        height,
        transactionsCount,
      ])
    )
    const [prevHeader, rewards] = await Promise.all([
      Header.findOne({
        where: { height: blocks[0].height - 1 },
        attributes: ['timestamp'],
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }) as Promise<Pick<HeaderCreationAttributes, 'timestamp'> | null>,
      this.getBlockRewards(
        blocks[0].height,
        blocks[blocks.length - 1].height + 1
      ),
    ])
    const result: BlockSummaryObject[] = []
    for (let i = blocks.length; --i >= 0; ) {
      const block = blocks[i]
      let interval
      if (i === 0) {
        interval = prevHeader ? block.timestamp - prevHeader.timestamp : null
      } else {
        interval = block.timestamp - blocks[i - 1].timestamp
      }
      result.push({
        hash: block.hash,
        height: block.height,
        timestamp: block.timestamp,
        transactionsCount: transactionCountMapping.get(block.height) as number,
        interval,
        size: block.size,
        miner: block.miner,
        reward: rewards[i],
      })
    }
    return result
  }

  async getBiggestMiners(
    lastNBlocks: number | null
  ): Promise<BiggestMinersObject> {
    const db = this.ctx.model
    const fromBlockHeight =
      lastNBlocks == null
        ? 1
        : Math.max(
            (this.app.blockchainInfo.tip?.height as number) - lastNBlocks + 1,
            1
          )
    const { limit, offset } = (this.ctx
      .state as ContextStateForPagination).pagination
    const totalCount = await Block.count({
      where: { height: { [$gte]: fromBlockHeight } },
      distinct: true,
      col: 'minerId',
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const list: MinerObject[] = await db.query(
      sql`
      SELECT address.string AS address, list.blocks AS blocks, rich_list.balance AS balance FROM (
        SELECT miner_id, COUNT(*) AS blocks FROM block
        WHERE height >= ${fromBlockHeight}
        GROUP BY miner_id
        ORDER BY blocks DESC
        LIMIT ${offset}, ${limit}
      ) list
      INNER JOIN address ON address._id = list.miner_id
      LEFT JOIN rich_list ON rich_list.address_id = address._id
      ORDER BY blocks DESC
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    return {
      totalCount,
      list: list.map(({ address, blocks, balance }) => ({
        address,
        blocks,
        balance: BigInt(balance || 0),
      })),
    }
  }

  async getBlockTransactions(height: number): Promise<Buffer[]> {
    const transactions: Pick<
      TransactionCreationAttributes,
      'id'
    >[] = await Transaction.findAll({
      where: { blockHeight: height },
      attributes: ['id'],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    return transactions.map((tx) => tx.id)
  }

  async getBlockAddressTransactions(height: number): Promise<Set<string>[]> {
    const TransferABI = qrc20ABIs.find(
      (abi) => abi.name === 'Transfer'
    ) as IMethodABI
    const result: Set<string>[] = []
    const balanceChanges: BalanceChangesDb[] = await BalanceChange.findAll({
      attributes: [],
      include: [
        {
          model: Transaction,
          as: 'transaction',
          required: true,
          where: { blockHeight: height },
          attributes: ['indexInBlock'],
        },
        {
          model: Address,
          as: 'address',
          required: true,
          attributes: ['string'],
        },
      ],
    })
    for (const { transaction, address } of balanceChanges) {
      result[transaction.indexInBlock] =
        result[transaction.indexInBlock] || new Set()
      result[transaction.indexInBlock].add(address.string)
    }
    const receipts: Pick<
      EvmReceiptCreationAttributes,
      'indexInBlock' | 'senderType' | 'senderData'
    >[] = await EVMReceipt.findAll({
      where: { blockHeight: height },
      attributes: ['indexInBlock', 'senderType', 'senderData'],
    })
    for (const { indexInBlock, senderType, senderData } of receipts) {
      result[indexInBlock] = result[indexInBlock] || new Set()
      result[indexInBlock].add(
        new RawAddress({
          type: senderType,
          data: senderData,
          chain: this.app.chain,
        }).toString() as string
      )
    }
    const receiptLogs: ReceiptLogDb[] = await EVMReceiptLog.findAll({
      attributes: ['topic1', 'topic2', 'topic3', 'topic4'],
      include: [
        {
          model: EVMReceipt,
          as: 'receipt',
          required: true,
          where: { blockHeight: height },
          attributes: ['indexInBlock'],
        },
        {
          model: Contract,
          as: 'contract',
          required: true,
          attributes: ['addressString', 'type'],
        },
      ],
    })
    for (const {
      topic1,
      topic2,
      topic3,
      topic4,
      receipt,
      contract,
    } of receiptLogs) {
      const set = (result[receipt.indexInBlock] =
        result[receipt.indexInBlock] || new Set())
      set.add(contract.addressString)
      if (Buffer.compare(topic1 as Buffer, TransferABI.id) === 0 && topic3) {
        if (
          (contract.type === 'qrc20' && !topic4) ||
          (contract.type === 'qrc721' && topic4)
        ) {
          const sender = (topic2 as Buffer).slice(12)
          const receiver = topic3.slice(12)
          if (Buffer.compare(sender, Buffer.alloc(20)) !== 0) {
            set.add(
              new RawAddress({
                type: RawAddress.PAY_TO_PUBLIC_KEY_HASH,
                data: sender,
                chain: this.app.chain,
              }).toString() as string
            )
            set.add(
              new RawAddress({
                type: RawAddress.EVM_CONTRACT,
                data: sender,
                chain: this.app.chain,
              }).toString() as string
            )
          }
          if (Buffer.compare(receiver, Buffer.alloc(20)) !== 0) {
            set.add(
              new RawAddress({
                type: RawAddress.PAY_TO_PUBLIC_KEY_HASH,
                data: receiver,
                chain: this.app.chain,
              }).toString() as string
            )
            set.add(
              new RawAddress({
                type: RawAddress.EVM_CONTRACT,
                data: receiver,
                chain: this.app.chain,
              }).toString() as string
            )
          }
        }
      }
    }
    return result
  }

  getBlockFilter(category: string = 'blockHeight'): { [key: string]: object } {
    const { fromBlock, toBlock } = this.ctx.state as ContextStateForBlockFilter
    let blockFilter: object | null = null
    if (fromBlock != null && toBlock != null) {
      blockFilter = { [$between]: [fromBlock, toBlock] }
    } else if (fromBlock != null) {
      blockFilter = { [$gte]: fromBlock }
    } else if (toBlock != null) {
      blockFilter = { [$lte]: toBlock }
    }
    return blockFilter ? { [category]: blockFilter } : {}
  }

  getRawBlockFilter(category: string = 'block_height'): { raw: string } {
    const { fromBlock, toBlock } = this.ctx.state as ContextStateForBlockFilter
    let blockFilter = 'TRUE'
    if (fromBlock != null && toBlock != null) {
      blockFilter = sql`${{
        raw: category,
      }} BETWEEN ${fromBlock} AND ${toBlock}`
    } else if (fromBlock != null) {
      blockFilter = sql`${{ raw: category }} >= ${fromBlock}`
    } else if (toBlock != null) {
      blockFilter = sql`${{ raw: category }} <= ${toBlock}`
    }
    return { raw: blockFilter }
  }
}

export default BlockService
