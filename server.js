import { spawn } from 'child_process';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 启动 pi RPC 进程
let piProcess = null;
let requestId = 0;
const pendingRequests = new Map();
let eventListeners = [];

function startPi() {
  piProcess = spawn('pi', ['--mode', 'rpc', '--model', 'glm/glm-5', '--no-session'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let buffer = '';
  piProcess.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        handlePiMessage(msg);
      } catch (e) {
        console.error('Parse error:', e);
      }
    }
  });

  piProcess.stderr.on('data', (data) => {
    console.error('pi stderr:', data.toString());
  });

  piProcess.on('close', () => {
    console.log('pi process closed, restarting...');
    setTimeout(startPi, 1000);
  });
}

function handlePiMessage(msg) {
  if (msg.type === 'response' && msg.id) {
    const resolve = pendingRequests.get(msg.id);
    if (resolve) {
      pendingRequests.delete(msg.id);
      resolve(msg);
    }
  } else {
    // 广播事件给所有客户端
    const eventStr = JSON.stringify(msg);
    eventListeners.forEach(res => res(`data: ${eventStr}\n\n`));
    eventListeners = [];
  }
}

function sendToPi(command) {
  return new Promise((resolve) => {
    const id = ++requestId;
    command.id = id;
    pendingRequests.set(id, resolve);
    piProcess.stdin.write(JSON.stringify(command) + '\n');
  });
}

// HTTP 服务器
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // 静态文件
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const html = await readFile(join(__dirname, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // API: 发送消息
  if (url.pathname === '/api/prompt' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const { message } = JSON.parse(body);
      const result = await sendToPi({ type: 'prompt', message });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }

  // API: 获取状态
  if (url.pathname === '/api/state') {
    const result = await sendToPi({ type: 'get_state' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // API: 中止
  if (url.pathname === '/api/abort' && req.method === 'POST') {
    const result = await sendToPi({ type: 'abort' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // SSE: 事件流
  if (url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('data: {"type":"connected"}\n\n');
    
    const handler = (data) => res.write(data);
    eventListeners.push(handler);
    
    req.on('close', () => {
      eventListeners = eventListeners.filter(h => h !== handler);
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// 启动
startPi();
server.listen(3456, () => {
  console.log('🚀 Pi Web UI 运行在 http://localhost:3456');
});
