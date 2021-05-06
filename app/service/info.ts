import { ContextStateBase, Service } from 'egg'
import { Op } from 'sequelize'
import Header from 'vipsinfo/node/models/header'
import RpcClient, { EstimateSmartFeeResult } from 'vipsinfo/rpc'

const { gte: $gte } = Op

interface infoObject {
  height: number
  supply: number
  circulatingSupply?: number
  netStakeWeight: number
  feeRate: number
  dgpInfo: Partial<DgpInfoObject>
}

interface FeeRateObject {
  blocks: number
  feeRate: number
}

interface DgpInfoObject {
  maxBlockSize: number
  minGasPrice: number
  blockGasLimit: number
}

export interface IInfoService extends Service {
  getInfo(): Promise<infoObject>
  getTotalSupply(): Promise<number>
  getTotalMaxSupply(): number
  getCirculatingSupply(): Promise<number>
  getStakeWeight(): Promise<number>
  getFeeRates(): Promise<FeeRateObject[]>
  getDGPInfo(): Promise<DgpInfoObject>
}

class InfoService extends Service implements IInfoService {
  async getInfo(): Promise<infoObject> {
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
}

export default InfoService
