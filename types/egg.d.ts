import { MiddlewareOptions } from 'koa-ratelimit'
import { Transaction as SequelizeTransaction } from 'sequelize'
import { chainType, IAddress, IChain } from 'vipsinfo/lib'
import { ITip } from 'vipsinfo/node/services/db'
import { RpcClientConfig } from 'vipsinfo/rpc'

import { ContractObject } from '@/app/middleware/contract'
import { IBalanceService } from '@/app/service/balance'
import { IBlockService } from '@/app/service/block'
import { IContractService } from '@/app/service/contract'
import { IInfoService } from '@/app/service/info'
import { IMiscService } from '@/app/service/misc'
import { IQRC721Service } from '@/app/service/qrc721'
import { IStatisticsService } from '@/app/service/statistics'
import { ITransactionService } from '@/app/service/transaction'

declare module 'egg' {
  export const CHAIN = Symbol('vips.chain')
  interface Application {
    blockchainInfo: {
      tip: ITip | null
    }
    [CHAIN]: IChain | undefined
    chain: IChain
  }

  interface IService {
    balance: IBalanceService
    block: IBlockService
    contract: IContractService
    info: IInfoService
    misc: IMiscService
    qrc721: IQRC721Service
    statistics: IStatisticsService
    transaction: ITransactionService
  }

  interface EggAppConfig {
    vipsinfo: {
      port: number
      rpc: RpcClientConfig
    }
    vips: {
      chain: chainType
    }
    cmcAPIKey: string | null
    // egg-socket.io config
    io: {
      redis: {
        host: string
        port: number
        password: string
        db: number
        key: string
      }
      namespace: {
        '/': {
          connectionMiddleware: string[]
        }
      }
    }
    // koa-retelimit config
    ratelimit: MiddlewareOptions
  }

  interface StateAddress {
    rawAddresses: (IAddress | undefined)[]
    addressIds: bigint[]
    p2pkhAddressIds: bigint[]
  }

  interface ContextStateBase {
    transaction: SequelizeTransaction
  }

  interface ContextStateForAddress extends CustomContextBase {
    address: StateAddress
  }

  interface ContextStateForBlockFilter extends ContextStateBase {
    fromBlock: number
    toBlock: number | null
  }

  interface ContextStateForContract extends ContextStateBase {
    [key: string]: ContractObject
  }

  interface ContextStateForPagination extends CustomContextBase {
    pagination: {
      limit: number
      offset: number
      reversed: boolean | undefined
    }
  }

  interface CustomContextBase<ResponseBodyT = any>
    extends Context<ResponseBodyT> {
    state: ContextStateBase
  }

  export interface CustomContextForAddress extends CustomContextBase {
    params: {
      address: string
    }
    state: ContextStateForAddress
  }

  export interface CustomContextForBlockFilter extends CustomContextBase {
    state: ContextStateForBlockFilter
  }

  export interface CustomContextForContract extends CustomContextBase {
    params: {
      [key: string]: string
    }
    state: ContextStateForContract
  }

  export interface CustomContextForPagination extends CustomContextBase {
    state: ContextStateForPagination
  }
}
