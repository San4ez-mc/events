const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// pnpm workspace: mobile only ever imports from packages/* (the shared
// @kiro/* packages), never from the other apps — watch just that (plus this
// app itself, watched implicitly). `node_modules` deliberately isn't in
// watchFolders: that only needs to be resolvable (nodeModulesPaths below),
// not watched for changes — adding it here made Metro's file watcher time
// out (hundreds of thousands of files across every app's dependencies).
config.watchFolders = [path.resolve(monorepoRoot, "packages")];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
  // pnpm's virtual-store hoist: lets Expo/RN packages resolve their own
  // undeclared transitive deps (e.g. @react-native/normalize-colors).
  path.resolve(monorepoRoot, "node_modules/.pnpm/node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enableSymlinks = true;

// @kiro/types' package.json points at dist/ (built by turbo for the API), which does not exist on a clean EAS
// checkout. The app imports runtime values from it (discovery filters), so resolve it from source instead.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@kiro/types") {
    return { type: "sourceFile", filePath: path.resolve(monorepoRoot, "packages/types/src/index.ts") };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
