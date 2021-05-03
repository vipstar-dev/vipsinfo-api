import { Controller } from 'egg'

class DefaultController extends Controller {
  // eslint-disable-next-line @typescript-eslint/require-await
  async subscribe() {
    const { ctx } = this
    const rooms = ctx.args as any[]
    if (rooms.length) {
      // @ts-ignore
      ctx.socket.join(...rooms)
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async unsubscribe() {
    const { ctx } = this
    const rooms = ctx.args as any[]
    if (rooms.length) {
      // @ts-ignore
      ctx.socket.leave(...rooms)
    }
  }
}

export default DefaultController
