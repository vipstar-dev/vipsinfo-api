import { CustomContextForAddress } from 'egg'
import { Op } from 'sequelize'
import { Address as RawAddress, IAddress } from 'vipsinfo/lib'
import Address from 'vipsinfo/node/models/address'

const { in: $in } = Op

export default function address() {
  return async (ctx: CustomContextForAddress, next: CallableFunction) => {
    ctx.assert(ctx.params.address, 404)
    const chain = ctx.app.chain
    const addresses: string[] = ctx.params.address.split(',')
    const rawAddresses: (IAddress | undefined)[] = []
    for (const address of addresses) {
      try {
        rawAddresses.push(RawAddress.fromString(address, chain))
      } catch (err) {
        ctx.throw(400)
      }
    }
    const result = await Address.findAll({
      where: { string: { [$in]: addresses } },
      attributes: ['_id', 'type', 'data'],
      transaction: ctx.state.transaction,
    })
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
