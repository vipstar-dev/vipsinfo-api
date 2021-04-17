import { Application, CHAIN } from 'egg'
import { Chain } from 'vipsinfo/lib'

export default {
  chain(this: Application) {
    this[CHAIN] = this[CHAIN] || Chain.get(this.config.vips.chain)
    return this[CHAIN]
  },
}
