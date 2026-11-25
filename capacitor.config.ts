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
    // Shown (from www/) when the live site can't be reached, instead of a raw browser error.
    errorPath: 'offline.html',
  },
  android: {
    // Behind the page while it loads: brand green, so there is no white flash before the opening animation.
    backgroundColor: '#063330',
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#F8F4EFFF',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      // iPhone default. Android turns its bar deep green at runtime (NativeShell).
      style: 'DEFAULT',
      backgroundColor: '#F8F4EFFF',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
