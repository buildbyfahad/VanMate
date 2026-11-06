// Reads app.json, with one difference: the internet permission is only removed for the final release build.
// Test builds load their code from the development server on the Mac, which needs it.
// Build the release with:  VANMATE_RELEASE=1 npx expo prebuild --platform android
module.exports = ({ config }) => {
  const release = process.env.VANMATE_RELEASE === '1';
  const blocked = (config.android?.blockedPermissions ?? []).filter((p) => release || p !== 'android.permission.INTERNET');
  return { ...config, android: { ...config.android, blockedPermissions: blocked } };
};
