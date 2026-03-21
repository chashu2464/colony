import { createHmac, timingSafeEqual } from 'crypto';

export function verifyOpenClawSignature(_rawBody: string, _timestamp: string, _signature: string, _secret: string): boolean {
    const rawBody = _rawBody ?? '';
    const timestamp = (_timestamp ?? '').trim();
    const signature = (_signature ?? '').trim();
    const secret = (_secret ?? '').trim();
    if (!timestamp || !signature || !secret) {
        return false;
    }

    const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    const actual = signature.replace(/^sha256=/i, '');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(actual, 'utf8');
    if (expectedBuf.length !== actualBuf.length) {
        return false;
    }
    return timingSafeEqual(expectedBuf, actualBuf);
}
