/**
 * Hello World API 测试
 */

import { describe, it, expect } from 'vitest';
import { handleHelloRequest } from '../src/api/hello';

describe('Hello API', () => {
  it('should return Hello World message', async () => {
    const response = await handleHelloRequest();
    
    expect(response.message).toBe('Hello World');
    expect(response.timestamp).toBeDefined();
    expect(typeof response.timestamp).toBe('string');
  });
  
  it('should return valid ISO timestamp', async () => {
    const response = await handleHelloRequest();
    
    // 验证 timestamp 是有效的 ISO 日期字符串
    const date = new Date(response.timestamp!);
    expect(date.toISOString()).toBe(response.timestamp);
  });
});