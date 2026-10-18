/**
 * A name for this device in the list of the person's devices: «iPhone · Safari»,
 * «Компьютер Windows · Chrome». The person can change it.
 */
export function guessDeviceName(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  touchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints ?? 0): string {
  const ua = userAgent;
  const system = /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1) ? 'iPad'
    : /iPhone|iPod/.test(ua) ? 'iPhone'
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Телефон Android' : 'Планшет Android')
    : /CrOS/.test(ua) ? 'Chromebook'
    : /Windows/.test(ua) ? 'Компьютер Windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Компьютер Linux'
    : 'Устройство';
  const browser = /YaBrowser/.test(ua) ? 'Яндекс Браузер'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Edg(A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : '';
  return browser ? `${system} · ${browser}` : system;
}
