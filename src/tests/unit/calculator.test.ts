import { describe, it, expect } from 'vitest';
import { add, subtract } from '../../calculator';

describe('Calculator Unit Tests', () => {
    it('should add numbers correctly', () => {
        expect(add(1, 2)).toBe(3);
    });
    it('should subtract numbers correctly', () => {
        expect(subtract(5, 2)).toBe(3);
    });
});
