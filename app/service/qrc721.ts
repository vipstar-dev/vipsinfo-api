import { ContextStateBase, ContextStateForPagination, Service } from 'egg'
import { QueryTypes } from 'sequelize'
import { sql } from 'vipsinfo/node/utils'

export interface Qrc721Tokens {
  address: string
  addressHex: Buffer
  name: string
  symbol: string
  totalSupply: bigint
  holders: Buffer[]
}

export interface ListQrc721Tokens {
  totalCount: number
  tokens: Qrc721Tokens[]
}

export interface AllQRC721Balances {
  addressHex: Buffer
  address: string
  name: string
  symbol: string
  count: number
}

interface Qrc721Db {
  address: string
  addressHex: Buffer
  name: Buffer
  symbol: Buffer
  totalSupply: Buffer
  holders: Buffer[]
}

interface Qrc721BalancesDb {
  addressHex: Buffer
  address: string
  name: Buffer
  symbol: Buffer
  count: number
}

export interface IQRC721Service extends Service {
  listQRC721Tokens(): Promise<ListQrc721Tokens>
  getAllQRC721Balances(hexAddresses: Buffer[]): Promise<AllQRC721Balances[]>
}

class QRC721Service extends Service implements IQRC721Service {
  async listQRC721Tokens(): Promise<ListQrc721Tokens> {
    const db = this.ctx.model
    const { limit, offset } = (this.ctx
      .state as ContextStateForPagination).pagination

    const [{ totalCount }]: { totalCount: number }[] = await db.query(
      sql`
      SELECT COUNT(DISTINCT(qrc721_token.contract_address)) AS totalCount FROM qrc721_token
      INNER JOIN qrc721 USING (contract_address)
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    const list: Qrc721Db[] = await db.query(
      sql`
      SELECT
        contract.address_string AS address, contract.address AS addressHex,
        qrc721.name AS name, qrc721.symbol AS symbol, qrc721.total_supply AS totalSupply,
        list.holders AS holders
      FROM (
        SELECT contract_address, COUNT(*) AS holders FROM qrc721_token
        INNER JOIN qrc721 USING (contract_address)
        GROUP BY contract_address
        ORDER BY holders DESC
        LIMIT ${offset}, ${limit}
      ) list
      INNER JOIN qrc721 USING (contract_address)
      INNER JOIN contract ON contract.address = list.contract_address
      ORDER BY holders DESC
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )

    return {
      totalCount,
      tokens: list.map((item) => ({
        address: item.addressHex.toString('hex'),
        addressHex: item.addressHex,
        name: item.name.toString(),
        symbol: item.symbol.toString(),
        totalSupply: BigInt(`0x${item.totalSupply.toString('hex')}`),
        holders: item.holders,
      })),
    }
  }

  async getAllQRC721Balances(
    hexAddresses: Buffer[]
  ): Promise<AllQRC721Balances[]> {
    if (hexAddresses.length === 0) {
      return []
    }
    const db = this.ctx.model
    const list: Qrc721BalancesDb[] = await db.query(
      sql`
      SELECT
        contract.address AS addressHex, contract.address_string AS address,
        qrc721.name AS name,
        qrc721.symbol AS symbol,
        qrc721_token.count AS count
      FROM (
        SELECT contract_address, COUNT(*) AS count FROM qrc721_token
        WHERE holder IN ${hexAddresses}
        GROUP BY contract_address
      ) qrc721_token
      INNER JOIN contract ON contract.address = qrc721_token.contract_address
      INNER JOIN qrc721 ON qrc721.contract_address = qrc721_token.contract_address
    `,
      {
        type: QueryTypes.SELECT,
        transaction: (this.ctx.state as ContextStateBase).transaction,
      }
    )
    return list.map((item) => ({
      address: item.addressHex.toString('hex'),
      addressHex: item.addressHex,
      name: item.name.toString(),
      symbol: item.symbol.toString(),
      count: item.count,
    }))
  }
}

export default QRC721Service
