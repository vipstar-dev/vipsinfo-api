import { Controller } from 'egg'
import Tip from 'vipsinfo/node/models/tip'
import packageJson from 'vipsinfo/package.json'

export interface IInsightInfoController extends Controller {
  index(): Promise<void>
  sync(): Promise<void>
  version(): Promise<void>
  peer(): Promise<void>
}

class InfoController extends Controller implements IInsightInfoController {
  async index(): Promise<void> {
    this.ctx.body = await this.ctx.service.info.getInfo()
  }

  async sync(): Promise<void> {
    const headerTip = await Tip.findOne({
      where: {
        service: 'header',
      },
      attributes: ['height'],
    })
    const blockTip = await Tip.findOne({
      where: {
        service: 'block',
      },
      attributes: ['height'],
    })
    const headerHeight = headerTip ? headerTip.height : 0
    const blockHeight = blockTip ? blockTip.height : 0
    this.ctx.body = {
      status: headerHeight === blockHeight ? 'finished' : 'syncing',
      blockChainHeight: headerHeight,
      syncPercentage: blockHeight / headerHeight,
      height: blockHeight,
      error: null,
      type: 'vipsinfo node',
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async version(): Promise<void> {
    this.ctx.body = {
      version: packageJson.version,
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async peer(): Promise<void> {
    this.ctx.body = {
      connected: true,
      host: '127.0.0.1',
      port: null,
    }
  }
}

export default InfoController
