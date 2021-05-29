import { Controller } from 'egg'

export interface IBlockbookInfoController extends Controller {
  index(): Promise<void>
}

class InfoController extends Controller implements IBlockbookInfoController {
  async index(): Promise<void> {
    this.ctx.body = await this.ctx.service.info.getBlockbookStatus()
  }
}

export default InfoController
