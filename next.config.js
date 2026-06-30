/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import './src/env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import("next").NextConfig} */
// const config = {eslint: {ignoreDuringBuilds: true}};
const config = {
    turbopack: {
        root: __dirname,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    sassOptions: {
        includePaths: ['/root/safe-cities-project-management-v2/src/styles'],
    },
    typescript: {
        ignoreBuildErrors: true,
    },
}

export default config
