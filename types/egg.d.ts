import { MiddlewareOptions } from 'koa-ratelimit'
import { Transaction as SequelizeTransaction } from 'sequelize'
import { chainType, IAddress, IChain } from 'vipsinfo/lib'

import { ContractObject } from '@/app/middleware/contract'

declare module 'egg' {
  export const CHAIN = Symbol('vips.chain')
  interface Application {
    blockchainInfo: {
      tip: null
    }
    [CHAIN]: IChain | undefined
    chain: IChain
  }

  interface EggAppConfig {
    vipsinfo: {
      port: number
      rpc: {
        protocol: 'http' | 'https'
        host: string
        port: number
        user: string
        password: string
      }
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
}
