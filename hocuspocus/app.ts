import { Server } from '@hocuspocus/server'

const port = Number(process.env.HOCUSPOCUS_PORT ?? 1234)
const address = process.env.HOCUSPOCUS_HOST ?? '127.0.0.1'

const server = new Server({
    port,
    address,
    quiet: false,
    timeout: 30000,
    debounce: 1000,
    maxDebounce: 5000,
    unloadImmediately: false,
})

server.listen(port, () => {
    console.log(`Hocuspocus collaboration server running at ws://${address}:${port}`)
})
