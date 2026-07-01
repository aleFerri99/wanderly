// babel-preset-expo include già il supporto a expo-router (SDK 50+).
// react-native-reanimated/plugin DEVE essere l'ultimo plugin della lista.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  }
}
