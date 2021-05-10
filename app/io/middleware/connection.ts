import { Context } from 'egg'

export default function connection() {
  return async (ctx: Context, next: CallableFunction) => {
    const { app, socket } = ctx
    const interval = setInterval(() => {
      if (app.blockchainInfo.tip) {
        socket.emit('block-height', app.blockchainInfo.tip.height)
        clearInterval(interval)
      }
    }, 0)
    await next()
  }
}
