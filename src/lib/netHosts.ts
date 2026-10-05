/**
 * Every internet service the app can talk to, in one place. This list is the single source of truth: the in-app request
 * guard (netGuard.ts), the Privacy screen, the security policy the build puts in index.html (vite.config.ts) and the native
 * Strava client (NativeHttpPlugin.java) all follow it. Adding a service means adding it here on purpose, and nothing outside
 * this list can be reached.
 */
export type NetFeature = 'maps' | 'weather' | 'food' | 'strava';

export interface NetFeatureInfo {
  id: NetFeature;
  label: string;
  /** Exact host names. */
  hosts: string[];
  /** Exactly what is sent, in plain words. */
  sends: string;
  /** False when the call is made by native code (Strava), which the web security policy does not cover. */
  viaWebView: boolean;
  /** Whether it only runs after you turn it on or connect it. */
  optIn: boolean;
}

export const NET_FEATURES: NetFeatureInfo[] = [
  {
    id: 'maps',
    label: 'Street and satellite maps',
    hosts: ['tile.openstreetmap.org', 'server.arcgisonline.com'],
    sends:
      'The tile numbers (zoom, x, y) of the map area on screen, so the map server can tell roughly where you are looking. Tiles you have seen are kept on the phone and still draw offline. Never your route.',
    viaWebView: true,
    optIn: false,
  },
  {
    id: 'weather',
    label: 'Running weather',
    hosts: ['api.open-meteo.com'],
    sends: 'Your location rounded to about 1 km. Nothing else.',
    viaWebView: true,
    optIn: true,
  },
  {
    id: 'food',
    label: 'Food and barcode search',
    hosts: ['world.openfoodfacts.org'],
    sends: 'The barcode you scanned or the words you typed into food search. Nothing else.',
    viaWebView: true,
    optIn: false,
  },
  {
    id: 'strava',
    label: 'Strava',
    hosts: ['www.strava.com'],
    sends: 'The workouts you choose to upload, using the Client ID and Secret you entered. Does nothing until you connect it.',
    viaWebView: false,
    optIn: true,
  },
];

export const featureForHost = (host: string): NetFeature | null => {
  const h = host.toLowerCase();
  return NET_FEATURES.find((f) => f.hosts.includes(h))?.id ?? null;
};

/** Hosts the web view itself may contact (everything except what native code does). */
export const WEBVIEW_HOSTS = (): string[] => NET_FEATURES.filter((f) => f.viaWebView).flatMap((f) => f.hosts);

/** Hosts the web view may load map tile images from. */
export const IMAGE_HOSTS = (): string[] => NET_FEATURES.find((f) => f.id === 'maps')!.hosts;

/** The security policy for the packaged app: the web view can reach the allowed services and nothing else. */
export const contentSecurityPolicy = (): string =>
  [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${IMAGE_HOSTS().map((h) => `https://${h}`).join(' ')}`,
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src 'self' ${WEBVIEW_HOSTS().map((h) => `https://${h}`).join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'",
    "form-action 'none'",
  ].join('; ');
