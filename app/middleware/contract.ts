import { CustomContextForContract } from 'egg'
import { Op } from 'sequelize'
import { Address as RawAddress, IAddress } from 'vipsinfo/lib'
import Address from 'vipsinfo/node/models/address'
import Contract from 'vipsinfo/node/models/contract'
const { gte: $gte } = Op

export interface ContractObject {
  contractAddress: Buffer
  address: string
  vm: 'evm' | 'x86'
  type: 'dgp' | 'qrc20' | 'qrc721'
  addressIds: bigint[]
}

interface AddressFilter {
  address?: Buffer
  addressString?: string
}

export default function contract(paramName: string = 'contract') {
  return async (ctx: CustomContextForContract, next: CallableFunction) => {
    ctx.assert(ctx.params[paramName], 404)
    const chain = ctx.app.chain

    const contract: Partial<ContractObject> = {}
    let rawAddress: IAddress | undefined
    try {
      rawAddress = RawAddress.fromString(ctx.params[paramName], chain)
    } catch (err) {
      ctx.throw(400)
    }
    let filter: AddressFilter
    if (rawAddress && rawAddress.type === RawAddress.CONTRACT) {
      filter = { address: Buffer.from(ctx.params[paramName], 'hex') }
    } else if (rawAddress && rawAddress.type === RawAddress.EVM_CONTRACT) {
      filter = { addressString: ctx.params[paramName] }
    } else {
      ctx.throw(400)
    }
    const contractResult = (await Contract.findOne({
      where: filter,
      attributes: ['address', 'addressString', 'vm', 'type'],
      transaction: ctx.state.transaction,
    })) as Pick<Contract, 'address' | 'addressString' | 'vm' | 'type'>
    ctx.assert(contractResult, 404)
    contract.contractAddress = contractResult.address
    contract.address = contractResult.addressString
    contract.vm = contractResult.vm
    contract.type = contractResult.type

    const addressList: Pick<Address, '_id'>[] = await Address.findAll({
      where: {
        type: { [$gte]: Address.parseType('contract') },
        data: contract.contractAddress,
      },
      attributes: ['_id'],
      transaction: ctx.state.transaction,
    })
    contract.addressIds = addressList.map((address) => address._id)
    ctx.state[paramName] = contract as ContractObject
    await next()
  }
}
