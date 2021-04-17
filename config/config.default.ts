import { EggAppConfig, PowerPartial } from 'egg'
import Redis, { RedisOptions } from 'ioredis'

export default (appInfo: EggAppConfig): PowerPartial<EggAppConfig> => {
  const config = {} as PowerPartial<EggAppConfig>
  const redisConfig: RedisOptions = {
    host: 'localhost',
    port: 6379,
    password: '',
    db: 0,
  }

  config.keys = 'vipsinfo-api'

  config.security = {
    csrf: { enable: false },
  }

  config.middleware = ['ratelimit']

  config.redis = {
    client: redisConfig,
  }

  config.ratelimit = {
    db: new Redis(redisConfig),
    headers: {
      remaining: 'Rate-Limit-Remaining',
      reset: 'Rate-Limit-Reset',
      total: 'Rate-Limit-Total',
    },
    disableHeader: false,
    errorMessage: 'Rate Limit Exceeded',
    duration: 10 * 60 * 1000,
    max: 10 * 60,
  }

  config.io = {
    redis: {
      ...redisConfig,
      key: 'vipsinfo-api-socket.io',
    },
    namespace: {
      '/': { connectionMiddleware: ['connection'] },
    },
  }

  config.sequelize = {
    dialect: 'mysql',
    database: 'vips_mainnet',
    host: 'localhost',
    port: 3306,
    username: 'vips',
    password: '',
  }

  config.vips = {
    chain: 'mainnet',
  }

  config.vipsinfo = {
    port: 3001,
    rpc: {
      protocol: 'http',
      host: 'localhost',
      port: 3889,
      user: 'user',
      password: 'password',
    },
  }

  config.cmcAPIKey = null
  return config
}
