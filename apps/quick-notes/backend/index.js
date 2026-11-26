module.exports = async function setup(ctx) {
  ctx.ipc.on('notes:load', async () => {
    ctx.ipc.send('notes:loaded', await ctx.storage.get('text'))
  })
  ctx.ipc.on('notes:save', async (text) => {
    await ctx.storage.set('text', String(text ?? ''))
  })
}
