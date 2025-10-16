import { formatNumber } from '../src/utils/formatNumber';

describe('formatNumber', () => {
  const originalToLocaleString = Number.prototype.toLocaleString;

  afterEach(() => {
    Number.prototype.toLocaleString = originalToLocaleString;
  });

  it('uses native toLocaleString when available', () => {
    const value = 1234567.89;
    expect(formatNumber(value)).toBe(value.toLocaleString());
  });

  it('falls back gracefully when toLocaleString throws', () => {
    Number.prototype.toLocaleString = jest.fn(() => {
      throw new RangeError('Hermes Intl missing');
    });

    expect(formatNumber(9876543.21)).toBe('9,876,543.21');
  });
});
