// Lets the app import runtime code (not just types) from ../shared, e.g. order status rules.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
const repoRoot = path.resolve(__dirname, "..");

config.watchFolders = [path.join(repoRoot, "shared")];
// shared/ gets its runtime dependencies from this app's node_modules (zod is a direct dependency here).
config.resolver.nodeModulesPaths = [path.join(__dirname, "node_modules")];
config.resolver.extraNodeModules = {
  "@shared": path.join(repoRoot, "shared"),
  zod: path.join(__dirname, "node_modules", "zod"),
};

module.exports = config;
