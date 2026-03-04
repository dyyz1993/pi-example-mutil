/**
 * Hello World API 测试
 */

import { handleHelloRequest } from '../src/api/hello.ts';

async function testHelloApi() {
  console.log('Testing Hello World API...');
  
  try {
    const response = await handleHelloRequest();
    
    if (response.message !== 'Hello World') {
      throw new Error(`Expected message "Hello World", got "${response.message}"`);
    }
    
    if (!response.timestamp) {
      throw new Error('Expected timestamp to be present');
    }
    
    console.log('✓ Test passed!');
    console.log('Response:', response);
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }
}

testHelloApi();