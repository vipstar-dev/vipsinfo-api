import { ContextStateBase, Controller } from 'egg'
import Block from 'vipsinfo/node/models/block'
import Header from 'vipsinfo/node/models/header'
import packageJson from 'vipsinfo/package.json'

export interface IInsightInfoController extends Controller {
  index(): Promise<void>
  sync(): Promise<void>
  version(): Promise<void>
  peer(): Promise<void>
}

class InfoController extends Controller implements IInsightInfoController {
  async index(): Promise<void> {
    this.ctx.body = await this.ctx.service.info.getInsightStatus()
  }

  async sync(): Promise<void> {
    const ctx = this.ctx
    const headerHeight: number =
      (await Header.aggregate('height', 'max', {
        transaction: (ctx.state as ContextStateBase).transaction,
      })) || 0
    const blockHeight: number =
      (await Block.aggregate('height', 'max', {
        transaction: (ctx.state as ContextStateBase).transaction,
      })) || 0
    ctx.body = {
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
