import { Controller } from 'egg'

export interface IQRC721Controller extends Controller {
  list(): Promise<void>
}

class QRC721Controller extends Controller implements IQRC721Controller {
  async list(): Promise<void> {
    const { ctx } = this
    const { totalCount, tokens } = await ctx.service.qrc721.listQRC721Tokens()
    ctx.body = {
      totalCount,
      tokens: tokens.map((item) => ({
        address: item.addressHex.toString('hex'),
        addressHex: item.addressHex.toString('hex'),
        name: item.name,
        symbol: item.symbol,
        totalSupply: item.totalSupply.toString(),
        holders: item.holders,
      })),
    }
  }
}

export default QRC721Controller
