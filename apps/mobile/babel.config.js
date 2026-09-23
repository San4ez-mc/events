// No custom reanimated-worklet code in this app (the Discover swipe gesture
// uses core RN Animated/PanResponder instead — see SwipeCard.tsx), so no
// worklets babel plugin is needed. babel-preset-expo covers everything else.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
