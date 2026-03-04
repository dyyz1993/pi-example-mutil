/**
 * Hello World API 端点
 * 返回简单的问候消息
 */

export interface HelloResponse {
  message: string;
  timestamp?: string;
}

/**
 * 处理 Hello World API 请求
 * @returns HelloResponse 包含问候消息
 */
export async function handleHelloRequest(): Promise<HelloResponse> {
  try {
    return {
      message: 'Hello World',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    // 错误处理
    console.error('Error in hello API:', error);
    throw new Error('Failed to process hello request');
  }
}

/**
 * API 路由处理器
 */
export const helloApi = {
  path: '/api/hello',
  method: 'GET',
  handler: handleHelloRequest
};