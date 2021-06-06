import { CustomContextForAddress } from 'egg'
import { Transaction as SequelizeTransaction } from 'sequelize'
import { Address as RawAddress, IAddress } from 'vipsinfo/lib'
import Address from 'vipsinfo/node/models/address'

export default function address() {
  return async (ctx: CustomContextForAddress, next: CallableFunction) => {
    const addressStr = ctx.params.address
    ctx.assert(addressStr, 400)
    const rawAddresses: IAddress[] = []
    try {
      const chain = ctx.app.chain()
      const rawAddress = RawAddress.fromString(addressStr, chain) as IAddress
      if (!rawAddress) throw null
      rawAddresses.push(rawAddress)
    } catch (err) {
      ctx.throw('Not Found', 404)
      return
    }
    const result = await Address.findAll({
      where: { string: addressStr },
      attributes: ['_id'],
      transaction: ctx.state.transaction as SequelizeTransaction,
    })
    if (!result) {
      ctx.throw('Not Found', 404)
      return
    }
    ctx.state.address = {
      rawAddresses,
      addressIds: result.map((address) => address._id),
      p2pkhAddressIds: result
        .filter((address) => address.type === RawAddress.PAY_TO_PUBLIC_KEY_HASH)
        .map((address) => address._id),
    }
    await next()
  }
}
