export type Platform = 'android' | 'ios' | 'desktop';
export const appDownloadLinks = {
  WireGuard: { android: 'https://play.google.com/store/apps/details?id=com.wireguard.android', ios: 'https://apps.apple.com/us/app/wireguard/id1441195209', desktop: 'https://www.wireguard.com/install/' },
  AmneziaVPN: { android: 'https://play.google.com/store/apps/details?id=org.amnezia.vpn', ios: 'https://apps.apple.com/us/app/amneziavpn/id1600529900', desktop: 'https://amnezia.org/downloads' }
} as const;
export function detectPlatform(userAgent = navigator.userAgent): Platform {
  return /Android/i.test(userAgent) ? 'android' : /iPhone|iPad|iPod/i.test(userAgent) ? 'ios' : 'desktop';
}
export function platformOrder(platform = detectPlatform()): Platform[] { return [platform, ...(['android', 'ios', 'desktop'] as const).filter((item) => item !== platform)]; }
