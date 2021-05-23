import { Controller } from 'egg'

import { FeeRateObject } from '@/app/service/info'

export interface IOriginalInfoController extends Controller {
  index(): Promise<void>
  supply(): Promise<void>
  totalMaxSupply(): Promise<void>
  circulatingSupply(): Promise<void>
  feeRates(): Promise<void>
}

class InfoController extends Controller implements IOriginalInfoController {
  async index(): Promise<void> {
    this.ctx.body = await this.ctx.service.info.getInfo()
  }

  async supply(): Promise<void> {
    this.ctx.body = await this.ctx.service.info.getTotalSupply()
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async totalMaxSupply(): Promise<void> {
    this.ctx.body = this.ctx.service.info.getTotalMaxSupply()
  }

  async circulatingSupply(): Promise<void> {
    this.ctx.body = await this.ctx.service.info.getCirculatingSupply()
  }

  async feeRates(): Promise<void> {
    const feeRateObject = JSON.parse(
      (await this.app.redis.hget(this.app.name, 'feerate')) as string
    ) as FeeRateObject[]
    this.ctx.body = feeRateObject.filter((item) =>
      [2, 4, 6, 12, 24].includes(item.blocks)
    )
  }
}

export default InfoController
