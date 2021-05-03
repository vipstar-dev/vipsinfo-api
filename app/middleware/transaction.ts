import { CustomContextBase } from 'egg'

export default function transaction() {
  return async (ctx: CustomContextBase, next: CallableFunction) => {
    ctx.state.transaction = await ctx.model.transaction()
    try {
      await next()
      await ctx.state.transaction.commit()
    } catch (err) {
      await ctx.state.transaction.rollback()
      throw err
    }
  }
}
