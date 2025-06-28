import { Global } from '../global.js';

beforeAll(() => {
  Global.init();
});

describe('Global', () => {
  test('Global logger initialized', () => {
    expect(Global.logger()).not.toBeNull();
  });
});