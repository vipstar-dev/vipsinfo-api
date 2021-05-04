import { ContextStateBase, Service } from 'egg'
import { fn, literal, Op, QueryTypes, where } from 'sequelize'
import { Address } from 'vipsinfo/lib'
import Block from 'vipsinfo/node/models/block'
import Contract from 'vipsinfo/node/models/contract'
import QRC20 from 'vipsinfo/node/models/qrc20'
import Transaction from 'vipsinfo/node/models/transaction'
import { sql } from 'vipsinfo/node/utils'

const { or: $or, like: $like } = Op

interface PriceJson {
  vipstarcoin: {
    jpy?: number
    usd?: number
  }
}

export interface IMiscService extends Service {
  classify(
    id: string
  ): Promise<{ type?: string; address?: string; addressHex?: string }>
  getPrices(): Promise<{ [key in 'USD' | 'JPY']: number | undefined }>
}

class MiscService extends Service implements IMiscService {
  async classify(
    id: string
  ): Promise<{ type?: string; address?: string; addressHex?: string }> {
    const db = this.ctx.model
    const transaction = (this.ctx.state as ContextStateBase).transaction

    if (/^(0|[1-9]\d{0,9})$/.test(id)) {
      const height = Number.parseInt(id)
      const tip = this.app.blockchainInfo.tip
      if (tip && height <= tip.height) {
        return { type: 'block' }
      }
    }
    if (/^[0-9a-f]{64}$/i.test(id)) {
      if (
        await Block.findOne({
          where: { hash: Buffer.from(id, 'hex') },
          attributes: ['height'],
        })
      ) {
        return { type: 'block' }
      } else if (
        await Transaction.findOne({
          where: { id: Buffer.from(id, 'hex') },
          attributes: ['_id'],
          transaction,
        })
      ) {
        return { type: 'transaction' }
      }
    }

    try {
      const address = Address.fromString(id, this.app.chain)
      if (
        address &&
        [Address.CONTRACT, Address.EVM_CONTRACT].includes(
          address.type as string
        )
      ) {
        const contract = await Contract.findOne({
          where: { address: address.data },
          attributes: ['address'],
          transaction,
        })
        if (contract) {
          return { type: 'contract' }
        }
      } else {
        return { type: 'address' }
      }
    } catch (err) {}

    let qrc20Results = (
      await QRC20.findAll({
        where: {
          [$or]: [
            where(
              fn('LOWER', fn('CONVERT', literal('name USING utf8mb4'))),
              id.toLowerCase()
            ),
            where(
              fn('LOWER', fn('CONVERT', literal('symbol USING utf8mb4'))),
              id.toLowerCase()
            ),
          ],
        },
        attributes: ['contractAddress'],
        transaction,
      })
    ).map((qrc20) => qrc20.contractAddress)
    if (qrc20Results.length === 0) {
      qrc20Results = (
        await QRC20.findAll({
          where: {
            [$or]: [
              where(fn('LOWER', fn('CONVERT', literal('name USING utf8mb4'))), {
                [$like]: ['', ...id.toLowerCase(), ''].join('%'),
              }),
              where(fn('LOWER', fn('CONVERT', literal('name USING utf8mb4'))), {
                [$like]: `%${id.toLowerCase()}%`,
              }),
              where(
                fn('LOWER', fn('CONVERT', literal('symbol USING utf8mb4'))),
                { [$like]: ['', ...id.toLowerCase(), ''].join('%') }
              ),
              where(
                fn('LOWER', fn('CONVERT', literal('symbol USING utf8mb4'))),
                { [$like]: `%${id.toLowerCase()}%` }
              ),
            ],
          },
          attributes: ['contractAddress'],
          transaction,
        })
      ).map((qrc20) => qrc20.contractAddress)
    }
    if (qrc20Results.length) {
      const [{ addressHex }]: { addressHex: Buffer }[] = await db.query(
        sql`
        SELECT contract.address_string AS address, contract.address AS addressHex FROM (
          SELECT contract_address FROM qrc20_statistics
          WHERE contract_address IN ${qrc20Results}
          ORDER BY transactions DESC LIMIT 1
        ) qrc20_balance
        INNER JOIN contract ON contract.address = qrc20_balance.contract_address`,
        { type: QueryTypes.SELECT, transaction }
      )
      return {
        type: 'contract',
        address: addressHex.toString('hex'),
        addressHex: addressHex.toString('hex'),
      }
    }

    return {}
  }

  async getPrices(): Promise<{ [key in 'USD' | 'JPY']: number | undefined }> {
    const [USDResult, JPYResult] = await Promise.all([
      this.ctx.curl(
        'https://api.coingecko.com/api/v3/simple/price?ids=vipstarcoin&vs_currencies=usd',
        {
          headers: {
            Accept: 'application/json',
          },
        }
      ),
      this.ctx.curl(
        'https://api.coingecko.com/api/v3/simple/price?ids=vipstarcoin&vs_currencies=jpy',
        {
          headers: {
            Accept: 'application/json',
          },
        }
      ),
    ])
    return {
      USD: (USDResult.data as PriceJson).vipstarcoin.usd,
      JPY: (JPYResult.data as PriceJson).vipstarcoin.jpy,
    }
  }
}

export default MiscService
