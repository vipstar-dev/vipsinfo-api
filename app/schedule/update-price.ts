import { Subscription } from 'egg'

class UpdatePriceSubscription extends Subscription {
  static get schedule() {
    return {
      cron: '0 * * * *',
      type: 'worker',
    }
  }

  async subscribe() {
    const price = await this.ctx.service.misc.getPrices()
    await this.app.redis.hset(
      this.app.name,
      'vips-price',
      JSON.stringify(price)
    )
    this.app.io.of('/').to('coin').emit('vips-price', price)
  }
}

export default UpdatePriceSubscription
