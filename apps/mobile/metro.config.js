// Metro per monorepo pnpm (node-linker=hoisted).
// - watchFolders include la root del workspace → Metro vede @repo/shared (TS grezzo)
// - nodeModulesPaths punta sia al locale sia alla root hoistata
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot   = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// 1. Osserva tutto il monorepo (così le modifiche a @repo/shared ricaricano)
config.watchFolders = [workspaceRoot]

// 2. Risolvi i moduli dal node_modules locale e da quello hoistato alla root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// 3. Con hoisting evitiamo la risoluzione gerarchica ambigua
config.resolver.disableHierarchicalLookup = true

module.exports = config
