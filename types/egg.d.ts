import { Middleware } from 'koa'
import { MiddlewareOptions } from 'koa-ratelimit'
import { Transaction as SequelizeTransaction } from 'sequelize'
import { chainType, IAddress, IChain } from 'vipsinfo/lib'
import { ITip } from 'vipsinfo/node/services/db'
import { RpcClientConfig } from 'vipsinfo/rpc'

import { IQRC20Controller } from '@/app/controller/qrc20'
import { IQRC721Controller } from '@/app/controller/qrc721'
import { IStatisticsController } from '@/app/controller/statistics'
import { ITransactionController } from '@/app/controller/transaction'
import { ContractObject } from '@/app/middleware/contract'
import { PaginationConstructor } from '@/app/middleware/pagination'
import { CustomMiddlewareOptions } from '@/app/middleware/ratelimit'
import { IAddressService } from '@/app/service/address'
import { IBalanceService } from '@/app/service/balance'
import { IBlockService } from '@/app/service/block'
import { IContractService } from '@/app/service/contract'
import { IInfoService } from '@/app/service/info'
import { IMiscService } from '@/app/service/misc'
import { IQRC20Service } from '@/app/service/qrc20'
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

  interface IController {
    qrc20: IQRC20Controller
    qrc721: IQRC721Controller
    statistics: IStatisticsController
    transaction: ITransactionController
  }

  interface IMiddleware {
    address(): (
      ctx: CustomContextForAddress,
      next: CallableFunction
    ) => Promise<void>
    blockFilter(): (
      ctx: CustomContextForBlockFilter,
      next: CallableFunction
    ) => Promise<void>
    contract(
      paramName?: string
    ): (ctx: CustomContextForContract, next: CallableFunction) => Promise<void>
    pagination(
      object?: PaginationConstructor
    ): (
      ctx: CustomContextForPagination,
      next: CallableFunction
    ) => Promise<void>
    ratelimit(options: CustomMiddlewareOptions, app: Application): Middleware
    transaction(): (
      ctx: CustomContextBase,
      next: CallableFunction
    ) => Promise<void>
  }

  interface IService {
    address: IAddressService
    balance: IBalanceService
    block: IBlockService
    contract: IContractService
    info: IInfoService
    misc: IMiscService
    qrc20: IQRC20Service
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

  export interface CustomContextForTransaction extends CustomContextBase {
    params: {
      id?: string
      ids?: string
    }
  }
}
