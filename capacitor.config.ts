import type { CapacitorConfig } from '@capacitor/cli';

// The native shell doesn't bundle the app — it loads the real deployed site,
// same as a browser would. Point CAP_SERVER_URL at a local/staging server
// (e.g. your machine's LAN IP, since a phone can't reach "localhost") when
// testing changes that haven't shipped to app.akli-lb.org yet.
const serverUrl = process.env.CAP_SERVER_URL ?? 'https://app.akli-lb.org';

const config: CapacitorConfig = {
  appId: 'org.aklilb.app',
  appName: 'Akli',
  webDir: 'www',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
  },
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#F8F4EFFF',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#F8F4EFFF',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
