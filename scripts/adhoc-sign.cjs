// electron-builder afterPack hook: ad-hoc code signing for macOS builds.
// Без платного Apple Developer ID нотаризация недоступна, но ad-hoc подпись
// даёт приложению валидную локальную подпись вместо полного её отсутствия.
const { execSync } = require('child_process');
const path = require('path');

module.exports = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  console.log(`  • ad-hoc signing ${appName}`);
  // codesign отказывается подписывать файлы с extended attributes ("detritus")
  execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
  execSync(`codesign --verify --deep "${appPath}"`, { stdio: 'inherit' });
};
