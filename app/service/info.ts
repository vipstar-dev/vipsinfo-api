import { ContextStateBase, Service } from 'egg'
import { Op } from 'sequelize'
import Header from 'vipsinfo/node/models/header'
import RpcClient, {
  EstimateSmartFeeResult,
  GetNetworkInfoResult,
} from 'vipsinfo/rpc'

const { gte: $gte } = Op

export interface InfoObject {
  height: number
  supply: number
  circulatingSupply?: number
  netStakeWeight: number
  feeRate: number
  dgpInfo: Partial<DgpInfoObject>
}

export interface InsightStatusObject {
  info: {
    version: number
    protocolversion: number
    blocks: number
    timeoffset: number
    connections: number
    proxy: string
    difficulty: {
      'proof-of-work': number
      'proof-of-stake': number
    }
    testnet: boolean
    relayfee: number
    errors: string
    network: 'livenet' | 'testnet'
    reward: {
      'proof-of-work': number
      'proof-of-stake': number
    }
  }
}

export interface FeeRateObject {
  blocks: number
  feeRate: number
}

export interface DgpInfoObject {
  maxBlockSize: number
  minGasPrice: number
  blockGasLimit: number
}

export interface DifficultyObject {
  proofOfWork: number
  proofOfStake: number
}

export interface IInfoService extends Service {
  getInfo(): Promise<InfoObject>
  getInsightStatus(): Promise<InsightStatusObject>
  getProofOfStakeReward(): number
  getTotalSupply(): Promise<number>
  getTotalMaxSupply(): number
  getCirculatingSupply(): Promise<number>
  getStakeWeight(): Promise<number>
  getFeeRates(): Promise<FeeRateObject[]>
  getDGPInfo(): Promise<DgpInfoObject>
  getDifficulty(): Promise<DifficultyObject>
}

class InfoService extends Service implements IInfoService {
  async getInfo(): Promise<InfoObject> {
    const height = this.app.blockchainInfo.tip?.height as number
    const stakeWeight =
      (JSON.parse(
        (await this.app.redis.hget(this.app.name, 'stakeweight')) as string
      ) as number) || 0
    const feeRate =
      (JSON.parse(
        (await this.app.redis.hget(this.app.name, 'feerate')) as string
      ) as FeeRateObject[]).find((item: FeeRateObject) => item.blocks === 10)
        ?.feeRate || 0.004
    const dgpInfo: Partial<DgpInfoObject> =
      (JSON.parse(
        (await this.app.redis.hget(this.app.name, 'dgpinfo')) as string
      ) as DgpInfoObject) || {}
    return {
      height,
      supply: await this.getTotalSupply(),
      ...(this.app.chain.name === 'mainnet'
        ? { circulatingSupply: await this.getCirculatingSupply() }
        : {}),
      netStakeWeight: Math.round(stakeWeight),
      feeRate,
      dgpInfo,
    }
  }

  async getInsightStatus(): Promise<InsightStatusObject> {
    const client = new RpcClient(this.app.config.vipsinfo.rpc)
    const info = (await client.rpcMethods.getnetworkinfo?.()) as GetNetworkInfoResult
    const difficulty = await this.getDifficulty()
    const testnet = this.app.config.vips.chain in ['testnet', 'regtest']
    const reward = {
      'proof-of-work': 100 * 1e8,
      'proof-of-stake': this.getProofOfStakeReward(),
    }
    return {
      info: {
        version: info.version,
        protocolversion: info.protocolversion,
        blocks: this.app.blockchainInfo.tip?.height as number,
        timeoffset: info.timeoffset,
        connections: info.connections,
        proxy: info.networks[0].proxy,
        difficulty: {
          'proof-of-work': difficulty.proofOfWork,
          'proof-of-stake': difficulty.proofOfStake,
        },
        testnet,
        relayfee: info.relayfee,
        errors: info.warnings,
        network: testnet ? 'testnet' : 'livenet',
        reward,
      },
    }
  }

  async getTotalSupply(): Promise<number> {
    const client = new RpcClient(this.app.config.vipsinfo.rpc)
    const info = await client.rpcMethods.getblockchaininfo?.()
    if (info) {
      return info.moneysupply
    }
    return 0
  }

  getTotalMaxSupply(): number {
    return 7 * 1e18
  }

  getProofOfStakeReward(): number {
    const height = this.app.blockchainInfo.tip?.height as number
    let subsidy = BigInt(9500 * 1e8)
    const halvings = Math.round(height / 525600)
    if (halvings >= 128) return 0
    subsidy >>= BigInt(halvings)
    if (subsidy < BigInt(100 * 1e8)) return 100 * 1e8
    return Number(subsidy)
  }

  async getCirculatingSupply(): Promise<number> {
    const totalSupply = await this.getTotalSupply()
    if (this.app.chain.name === 'mainnet') {
      // TODO: What's 575e4?
      return totalSupply - 575e4
    } else {
      return totalSupply
    }
  }

  async getStakeWeight(): Promise<number> {
    const height: number = await Header.aggregate('height', 'max', {
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const list = await Header.findAll({
      where: { height: { [$gte]: height - 500 } },
      attributes: ['timestamp', 'bits'],
      order: [['height', 'ASC']],
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const interval = list[list.length - 1].timestamp - list[0].timestamp
    const sum = list
      .slice(1)
      .map((x) => x.difficulty)
      .reduce((x, y) => x + y)
    return (sum * 2 ** 32 * 16) / interval
  }

  async getFeeRates(): Promise<FeeRateObject[]> {
    const client = new RpcClient(this.app.config.vipsinfo.rpc)
    const feeRateBlocks = [2, 4, 6, 10, 12, 24]
    const promiseList: Promise<EstimateSmartFeeResult>[] = []
    for (const blocks of feeRateBlocks) {
      const call = client.rpcMethods.estimatesmartfee?.(blocks.toString())
      if (call) promiseList.push(call)
    }
    const results = await Promise.all(promiseList)
    return [
      { blocks: 2, feeRate: results[0].feerate || 0.004 },
      { blocks: 4, feeRate: results[1].feerate || 0.004 },
      { blocks: 6, feeRate: results[2].feerate || 0.004 },
      { blocks: 10, feeRate: results[3].feerate || 0.004 },
      { blocks: 12, feeRate: results[4].feerate || 0.004 },
      { blocks: 24, feeRate: results[5].feerate || 0.004 },
    ]
  }

  async getDGPInfo(): Promise<DgpInfoObject> {
    const client = new RpcClient(this.app.config.vipsinfo.rpc)
    const info = await client.rpcMethods.getdgpinfo?.()
    if (info) {
      return {
        maxBlockSize: info.maxblocksize,
        minGasPrice: info.mingasprice,
        blockGasLimit: info.blockgaslimit,
      }
    }
    return {
      maxBlockSize: 0,
      minGasPrice: 0,
      blockGasLimit: 0,
    }
  }

  async getDifficulty(): Promise<DifficultyObject> {
    const height: number = await Header.aggregate('height', 'max', {
      transaction: (this.ctx.state as ContextStateBase).transaction,
    })
    const headers = await Header.findAll({
      where: { height: { [$gte]: height - 1000 } },
    })
    headers.reverse()
    const getLastBlockIndex = (fProofOfStake: boolean): Header | undefined => {
      for (const header of headers) {
        if (header.isProofOfStake === fProofOfStake) {
          return header
        }
      }
    }
    const proofOfWork = getLastBlockIndex(false)?.difficulty as number
    const proofOfStake = getLastBlockIndex(true)?.difficulty as number
    return {
      proofOfWork,
      proofOfStake,
    }
  }
}

export default InfoService
