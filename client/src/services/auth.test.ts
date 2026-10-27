// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { consumeReturnDestination, rememberReturnDestination } from './auth';

describe('authentication return destinations', () => {
  beforeEach(() => sessionStorage.clear());

  it('preserves the current same-origin path and query', () => {
    history.replaceState({}, '', '/app/appointments?filter=upcoming');
    rememberReturnDestination();
    expect(consumeReturnDestination('/app')).toBe('/app/appointments?filter=upcoming');
    expect(sessionStorage.getItem('careorbit_return_to')).toBeNull();
  });

  it('rejects protocol-relative and external return destinations', () => {
    sessionStorage.setItem('careorbit_return_to', '//attacker.example/steal');
    expect(consumeReturnDestination('/app')).toBe('/app');
    sessionStorage.setItem('careorbit_return_to', 'https://attacker.example/steal');
    expect(consumeReturnDestination('/doctor')).toBe('/doctor');
  });
});
