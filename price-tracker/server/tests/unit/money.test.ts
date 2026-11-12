import {
  detectCurrency,
  formatMoney,
  parsePriceToMinor,
  percentDiff,
  toMajor,
  toMinor,
} from '../../src/utils/money';

describe('parsePriceToMinor', () => {
  it('parses Indian digit grouping', () => {
    expect(parsePriceToMinor('₹1,29,999')).toBe(12_999_900);
    expect(parsePriceToMinor('49,999')).toBe(4_999_900);
  });

  it('handles Rs. prefixes, spaces and non-breaking spaces', () => {
    expect(parsePriceToMinor('Rs. 19,999')).toBe(1_999_900);
    expect(parsePriceToMinor('₹ 1,999')).toBe(199_900);
  });

  it('keeps paise when present', () => {
    expect(parsePriceToMinor('₹1,299.50')).toBe(129_950);
  });

  it('takes the first price when a page also shows the MRP', () => {
    expect(parsePriceToMinor('₹19,999 ₹24,900')).toBe(1_999_900);
  });

  it('accepts numbers directly', () => {
    expect(parsePriceToMinor(1299.5)).toBe(129_950);
  });

  it('returns null for anything without a usable number', () => {
    expect(parsePriceToMinor('Currently unavailable')).toBeNull();
    expect(parsePriceToMinor('')).toBeNull();
    expect(parsePriceToMinor(null)).toBeNull();
    expect(parsePriceToMinor(undefined)).toBeNull();
  });

  it('refuses absurd values that are probably identifiers', () => {
    expect(parsePriceToMinor('999999999')).toBeNull();
  });
});

describe('minor/major conversion', () => {
  it('round-trips without floating point drift', () => {
    expect(toMinor(45999.99)).toBe(4_599_999);
    expect(toMajor(4_599_999)).toBe(45999.99);
    expect(toMajor(toMinor(0.1 + 0.2))).toBe(0.3);
  });
});

describe('formatMoney', () => {
  it('uses Indian grouping and hides empty decimals', () => {
    expect(formatMoney(4_999_900)).toBe('₹49,999');
    expect(formatMoney(129_950)).toBe('₹1,299.50');
  });
});

describe('detectCurrency', () => {
  it('recognises the rupee in several notations', () => {
    expect(detectCurrency('₹100')).toBe('INR');
    expect(detectCurrency('Rs. 100')).toBe('INR');
    expect(detectCurrency('$100')).toBe('USD');
    expect(detectCurrency('100')).toBe('INR');
  });
});

describe('percentDiff', () => {
  it('reports a drop as a negative percentage', () => {
    expect(percentDiff(1000, 900)).toBe(-10);
    expect(percentDiff(1000, 1250)).toBe(25);
    expect(percentDiff(0, 100)).toBe(0);
  });
});
