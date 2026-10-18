import { describe, expect, it } from 'vitest';
import { guessDeviceName } from './deviceName';

describe('guessDeviceName', () => {
  it('names phones, tablets and computers with their browser', () => {
    expect(guessDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'))
      .toBe('iPhone · Safari');
    // iPadOS introduces itself as a Mac; touch gives it away.
    expect(guessDeviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 5))
      .toBe('iPad · Safari');
    expect(guessDeviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 0))
      .toBe('Mac · Safari');
    expect(guessDeviceName('Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'))
      .toBe('Телефон Android · Chrome');
    expect(guessDeviceName('Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'))
      .toBe('Планшет Android · Chrome');
    expect(guessDeviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 YaBrowser/24.6 Safari/537.36'))
      .toBe('Компьютер Windows · Яндекс Браузер');
    expect(guessDeviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0'))
      .toBe('Компьютер Windows · Edge');
    expect(guessDeviceName('')).toBe('Устройство');
  });
});
