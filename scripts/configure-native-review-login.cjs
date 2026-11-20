const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { appId } = require('../capacitor.config.json');
const callback = `${appId}://review-auth/callback`;
if (!fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes(`const nativeRedirect = '${callback}'`)) {
  throw Error('Match nativeRedirect in index.html to the appId in capacitor.config.json');
}

const targets = {
  android: {
    file: 'android/app/src/main/AndroidManifest.xml',
    anchor: '        </activity>',
    marker: 'android:host="review-auth"',
    registration: `            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${appId}" android:host="review-auth" android:path="/callback" />
            </intent-filter>

`,
  },
  ios: {
    file: 'ios/App/App/Info.plist',
    anchor: '\t<key>LSRequiresIPhoneOS</key>',
    marker: '<key>CFBundleURLTypes</key>',
    registration: `\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>${appId}.review-auth</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array><string>${appId}</string></array>
\t\t</dict>
\t</array>
`,
  },
};

const [action, platform] = process.argv.slice(2);
if (!['apply', 'verify'].includes(action) || (platform && !targets[platform])) {
  throw Error('Usage: configure-native-review-login.cjs apply|verify [android|ios]');
}
for (const target of platform ? [targets[platform]] : Object.values(targets)) {
  const file = path.join(root, target.file);
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(target.registration)) continue;
  if (action === 'verify' || source.includes(target.marker) || source.split(target.anchor).length !== 2) {
    throw Error('Check the OAuth callback registration in ' + target.file);
  }
  fs.writeFileSync(file, source.replace(target.anchor, target.registration + target.anchor));
}
