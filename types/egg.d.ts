import { MiddlewareOptions } from 'koa-ratelimit'
import { Transaction as SequelizeTransaction } from 'sequelize'
import { chainType, IAddress, IChain } from 'vipsinfo/lib'

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

  export interface CustomContextForAddress<ResponseBodyT = any>
    extends Context<ResponseBodyT> {
    params: {
      address: string
    }
    state: {
      address: StateAddress
      transaction: SequelizeTransaction
    }
  }
}
