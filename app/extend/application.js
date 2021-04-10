const path = require('path')

const CHAIN = Symbol('vips.chain')

module.exports = {
  get chain() {
    this[CHAIN] = this[CHAIN] || this.vipsinfo.lib.Chain.get(this.config.vips.chain)
    return this[CHAIN]
  },
  get vipsinfo() {
    return {
      lib: require('vipsinfo/lib'),
      rpc: require('vipsinfo/rpc')
    }
  }
}
