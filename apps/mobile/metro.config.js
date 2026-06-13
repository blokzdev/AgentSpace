// Metro config for the AgentSpace monorepo (Expo + pnpm).
// Watches the workspace root and resolves modules from both the app and the
// root node_modules so pnpm's symlinked store works under Metro.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// The `spacetimedb` client ships its entry points via the package `exports`
// field (e.g. `spacetimedb/react`). Enable package-exports resolution (default
// in Expo SDK 53+, opt-in on 52) so those subpaths resolve under Metro.
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'import'];

module.exports = config;
