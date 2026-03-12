import { describe, it, expect } from 'vitest';
import { add, subtract } from '../../calculator';

describe('Calculator Integration Tests', () => {
    it('should add numbers correctly', () => {
        expect(add(10, 20)).toBe(30);
    });
    it('should subtract numbers correctly', () => {
        expect(subtract(30, 10)).toBe(20);
    });
});
