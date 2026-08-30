import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mcfrench.guestjukebox',
  appName: 'Guest Jukebox',
  webDir: 'dist',
  // Master Device Mode: the app's own bundled content is otherwise served
  // from a virtual https://localhost origin by default, which makes every
  // fetch() to the plain-http LAN backend "mixed content" and blocks it
  // independently of usesCleartextTraffic (which only permits cleartext
  // sockets at all, not cross-scheme https->http fetches from the WebView).
  // Serving local content over http instead keeps both sides on the same
  // scheme, avoiding that separate mixed-content block.
  server: {
    androidScheme: 'http',
  },
};

export default config;
