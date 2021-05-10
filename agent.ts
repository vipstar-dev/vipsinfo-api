import { Application } from 'egg'
import SocketClient from 'socket.io-client'
import { ITip } from 'vipsinfo/node/services/db'

export default function (agent: Application) {
  let tip: ITip | null = null

  agent.messenger.on('egg-ready', () => {
    const io = SocketClient(`http://localhost:${agent.config.vipsinfo.port}`)
    io.on('tip', (newTip: ITip) => {
      tip = newTip
      agent.messenger.sendToApp('block-tip', tip)
      agent.messenger.sendRandom('socket/block-tip', tip)
    })
    io.on('block', (block: ITip) => {
      tip = block
      agent.messenger.sendToApp('new-block', block)
      // @ts-ignore
      agent.messenger.sendRandom('update-stakeweight')
      // @ts-ignore
      agent.messenger.sendRandom('update-dgpinfo')
      agent.messenger.sendRandom('socket/block-tip', block)
    })
    io.on('reorg', (block: ITip) => {
      tip = block
      agent.messenger.sendToApp('reorg-to-block', block)
      agent.messenger.sendRandom('socket/reorg/block-tip', block)
    })
    io.on('mempool-transaction', (id: Buffer | undefined) => {
      if (id) {
        agent.messenger.sendRandom('socket/mempool-transaction', id)
      }
    })
  })

  let lastTipHash = Buffer.alloc(0)
  function updateStatistics() {
    if (tip && Buffer.compare(lastTipHash, tip.hash) !== 0) {
      // @ts-ignore
      agent.messenger.sendRandom('update-richlist')
      // @ts-ignore
      agent.messenger.sendRandom('update-qrc20-statistics')
      // @ts-ignore
      agent.messenger.sendRandom('update-daily-transactions')
      // @ts-ignore
      agent.messenger.sendRandom('update-block-interval')
      // @ts-ignore
      agent.messenger.sendRandom('update-address-growth')
      lastTipHash = tip.hash
    }
  }

  setInterval(updateStatistics, 2 * 60 * 1000).unref()

  agent.messenger.on('blockchain-info', () => {
    agent.messenger.sendToApp('blockchain-info', { tip })
  })

  agent.messenger.on('egg-ready', () => {
    const interval = setInterval(() => {
      if (tip) {
        agent.messenger.sendToApp('blockchain-info', { tip })
        clearInterval(interval)
        updateStatistics()
      }
    }, 0)
    // @ts-ignore
    agent.messenger.sendRandom('update-stakeweight')
    // @ts-ignore
    agent.messenger.sendRandom('update-feerate')
    // @ts-ignore
    agent.messenger.sendRandom('update-dgpinfo')
  })
}
