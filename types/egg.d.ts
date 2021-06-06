import { Middleware } from 'koa'
import { MiddlewareOptions } from 'koa-ratelimit'
import { Transaction as SequelizeTransaction } from 'sequelize'
import { chainType, IAddress, IChain } from 'vipsinfo/lib'
import { ITip } from 'vipsinfo/node/services/db'
import { RpcClientConfig } from 'vipsinfo/rpc'

import { IBlockbookBlockController } from '@/app/controller/blockbook/block'
import { IBlockbookInfoController } from '@/app/controller/blockbook/info'
import { IBlockbookTransactionController } from '@/app/controller/blockbook/transaction'
import { IInsightAddressController } from '@/app/controller/insight/address'
import { IInsightBlockController } from '@/app/controller/insight/block'
import { IInsightInfoController } from '@/app/controller/insight/info'
import { IInsightTransactionController } from '@/app/controller/insight/transaction'
import { IOriginalAddressController } from '@/app/controller/original/address'
import { IOriginalBlockController } from '@/app/controller/original/block'
import { IContractController } from '@/app/controller/original/contract'
import { IOriginalInfoController } from '@/app/controller/original/info'
import { IMiscController } from '@/app/controller/original/misc'
import { IQRC20Controller } from '@/app/controller/original/qrc20'
import { IQRC721Controller } from '@/app/controller/original/qrc721'
import { IStatisticsController } from '@/app/controller/original/statistics'
import { IOriginalTransactionController } from '@/app/controller/original/transaction'
import { ContractObject } from '@/app/middleware/original/contract'
import { PaginationConstructor } from '@/app/middleware/original/pagination'
import { CustomMiddlewareOptions } from '@/app/middleware/original/ratelimit'
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
  export type APITypes = 'original' | 'insight' | 'blockbook'
  interface Application {
    blockchainInfo: {
      tip: ITip | null
    }
    [CHAIN]: IChain | undefined
    chain(): IChain
  }

  interface IController {
    original: {
      address: IOriginalAddressController
      block: IOriginalBlockController
      contract: IContractController
      info: IOriginalInfoController
      misc: IMiscController
      qrc20: IQRC20Controller
      qrc721: IQRC721Controller
      statistics: IStatisticsController
      transaction: IOriginalTransactionController
    }
    insight: {
      address: IInsightAddressController
      block: IInsightBlockController
      info: IInsightInfoController
      transaction: IInsightTransactionController
    }
    blockbook: {
      block: IBlockbookBlockController
      info: IBlockbookInfoController
      transaction: IBlockbookTransactionController
    }
  }

  interface IMiddleware {
    original: {
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
      ): (
        ctx: CustomContextForContract,
        next: CallableFunction
      ) => Promise<void>
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
    insight: {
      address(): (
        ctx: CustomContextForAddress,
        next: CallableFunction
      ) => Promise<void>
      pagination(
        object?: PaginationConstructor
      ): (
        ctx: CustomContextForAddress,
        next: CallableFunction
      ) => Promise<void>
    }
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
    api: {
      type: APITypes
    }
    vips: {
      chain: chainType
    }
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
    rawAddresses: IAddress[]
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
    params: {
      block: string
    }
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
