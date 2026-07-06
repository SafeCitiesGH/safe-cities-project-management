import { spawn } from 'node:child_process'

const nextArgs = process.argv.slice(2)

const server = spawn('npm', ['run', 'server'], {
    stdio: 'inherit',
    env: process.env,
})

const next = spawn('npx', ['next', 'dev', '--turbo', ...nextArgs], {
    stdio: 'inherit',
    env: process.env,
})

const shutdown = () => {
    server.kill('SIGTERM')
    next.kill('SIGTERM')
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.on('exit', (code) => {
    if (code && code !== 0) {
        next.kill('SIGTERM')
        process.exitCode = code
    }
})

next.on('exit', (code) => {
    if (code && code !== 0) {
        server.kill('SIGTERM')
        process.exitCode = code
    }
})
