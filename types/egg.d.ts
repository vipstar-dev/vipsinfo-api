import { chainType, IChain } from 'vipsinfo/lib'

declare module 'egg' {
  export const CHAIN = Symbol('vips.chain')
  interface Application {
    blockchainInfo: {
      tip: null
    }
    [CHAIN]: IChain | undefined
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
  }
}
