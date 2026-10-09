// Expo's Metro config already handles the npm workspace (packages/core, packages/shared).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// React Native needs exactly the React version it was built with (here, in apps/native/node_modules);
// another package puts a newer one at the root, which packages hoisted there would otherwise load.
const react = path.dirname(require.resolve('react/package.json', { paths: [__dirname] }));
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    return context.resolveRequest(context, moduleName.replace(/^react/, react), platform);
  }
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
