import { Subscription } from 'egg'

class UpdateFeerateSubscription extends Subscription {
  static get schedule() {
    return {
      cron: '0 * * * *',
      type: 'worker',
    }
  }

  async subscribe() {
    const feeRate = await this.ctx.service.info.getFeeRates()
    if (feeRate) {
      await this.app.redis.hset(
        this.app.name,
        'feerate',
        JSON.stringify(feeRate)
      )
      this.app.io
        .of('/')
        .to('blockchain')
        .emit(
          'feerate',
          feeRate.find((item) => item.blocks === 10)?.feeRate as number
        )
    }
  }
}

export default UpdateFeerateSubscription
