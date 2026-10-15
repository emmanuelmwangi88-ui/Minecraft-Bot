const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

const PORT = 54321          // your LAN port
const VERSION = '1.20.4'    // must match your game version
const MODEL = 'llama3.1'

const bot = mineflayer.createBot({
  host: 'localhost',
  port: PORT,
  username: 'AIBot',
  auth: 'offline',
  version: VERSION,
})
bot.loadPlugin(pathfinder)

bot.once('spawn', () => {
  bot.pathfinder.setMovements(new Movements(bot))
  bot.chat('Ready. Type: bot <command>')
})

const tools = [
  { type: 'function', function: {
      name: 'come_to_player',
      description: 'Walk to the player who gave the command',
      parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: {
      name: 'collect_block',
      description: 'Mine a number of blocks of a given type, e.g. oak_log, stone, coal_ore',
      parameters: { type: 'object',
        properties: { block: { type: 'string' }, count: { type: 'integer' } },
        required: ['block'] } } },
  { type: 'function', function: {
      name: 'stop',
      description: 'Stop moving',
      parameters: { type: 'object', properties: {} } } },
]

async function comeToPlayer(username) {
  const p = bot.players[username]?.entity
  if (!p) return 'cannot see player'
  await bot.pathfinder.goto(new goals.GoalNear(p.position.x, p.position.y, p.position.z, 2))
  return 'arrived'
}

async function collectBlock(name, count = 5) {
  const id = bot.registry.blocksByName[name]?.id
  if (!id) return `unknown block ${name}`
  let got = 0
  while (got < count) {
    const b = bot.findBlock({ matching: id, maxDistance: 64 })
    if (!b) return `collected ${got}, none nearby`
    await bot.pathfinder.goto(new goals.GoalNear(b.position.x, b.position.y, b.position.z, 2))
    await bot.dig(bot.blockAt(b.position))
    got++
  }
  return `collected ${got} ${name}`
}

bot.on('chat', async (username, message) => {
  if (username === bot.username || !message.startsWith('bot ')) return
  const prompt = message.slice(4)
  try {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        tools,
        messages: [
          { role: 'system', content: 'You control a Minecraft bot. Use tools to act. Be brief.' },
          { role: 'user', content: prompt },
        ],
      }),
    })
    const msg = (await res.json()).message
    if (msg.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        const { name, arguments: args } = call.function
        let result
        if (name === 'come_to_player') result = await comeToPlayer(username)
        else if (name === 'collect_block') result = await collectBlock(args.block, args.count)
        else if (name === 'stop') { bot.pathfinder.stop(); result = 'stopped' }
        bot.chat(String(result).slice(0, 200))
      }
    } else {
      bot.chat((msg.content || 'ok').slice(0, 200))
    }
  } catch (e) {
    bot.chat('error: ' + e.message.slice(0, 100))
  }
})

bot.on('error', console.log)
bot.on('kicked', console.log)