import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

const adapterPort = Number(process.env.YAI_ADAPTER_PORT ?? 3001);
const maxBodyBytes = Number(process.env.YAI_ADAPTER_MAX_BODY_BYTES ?? 32 * 1024 * 1024);
const upstreamOrigin = (process.env.YAI_OPENAI_API_URL ?? 'http://yai-backend:3001').replace(
  /\/$/,
  '',
);
const serviceSecret = process.env.YAI_LIBRECHAT_SERVICE_KEY ?? '';
const ignoredHeaders = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'host',
  'keep-alive',
  'transfer-encoding',
]);

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function sanitizeToolResultNames(payload: JsonValue): JsonValue {
  if (!isJsonObject(payload) || !Array.isArray(payload.messages)) return payload;
  return {
    ...payload,
    messages: payload.messages.map((message) => {
      if (!isJsonObject(message) || message.role !== 'tool' || !('name' in message)) return message;
      const sanitized = { ...message };
      delete sanitized.name;
      return sanitized;
    }),
  };
}

function accountIdFrom(headers: IncomingHttpHeaders): string | null {
  const authorization = headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  const match = typeof value === 'string' ? /^Bearer\s+([a-f\d]{24})$/i.exec(value) : null;
  return match?.[1] ?? null;
}

function upstreamHeaders(headers: IncomingHttpHeaders, accountId: string): Headers {
  const result = new Headers({
    'x-yai-librechat-service-key': serviceSecret,
    'x-yai-librechat-account-id': accountId,
    accept: 'application/json, text/event-stream',
  });
  const contentType = headers['content-type'];
  if (contentType)
    result.set('content-type', Array.isArray(contentType) ? contentType[0] : contentType);
  return result;
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error('payload_too_large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function copyResponseHeaders(upstream: Response, response: ServerResponse): void {
  for (const [name, value] of upstream.headers) {
    if (!ignoredHeaders.has(name.toLowerCase())) response.setHeader(name, value);
  }
}

async function streamResponse(upstream: Response, response: ServerResponse): Promise<void> {
  if (!upstream.body) {
    response.end();
    return;
  }
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!response.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => response.once('drain', resolve));
      }
    }
    response.end();
  } finally {
    reader.releaseLock();
  }
}

function isAllowedRoute(method: string, pathname: string): boolean {
  if (pathname === '/v1/chat/completions' || pathname === '/v1/models') {
    return method === 'GET' || method === 'POST';
  }
  if (/^\/v1\/files(?:\/[A-Za-z0-9_-]+(?:\/content)?)?$/.test(pathname)) {
    return ['GET', 'POST', 'DELETE'].includes(method);
  }
  return false;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', 'http://adapter.local');
  const method = request.method ?? 'GET';
  const accountId = accountIdFrom(request.headers);
  if (!serviceSecret || !accountId) {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'YAI chat session is required' } }));
    return;
  }
  if (!isAllowedRoute(method, requestUrl.pathname)) {
    response.writeHead(404).end();
    return;
  }

  const abortController = new AbortController();
  request.once('aborted', () => abortController.abort());
  response.once('close', () => {
    if (!response.writableEnded) abortController.abort();
  });

  try {
    const body = ['GET', 'HEAD'].includes(method) ? undefined : await readBody(request);
    let forwardedBody: BodyInit | undefined = body ? new Uint8Array(body) : undefined;
    if (body && requestUrl.pathname === '/v1/chat/completions') {
      try {
        const payload = JSON.parse(body.toString('utf8')) as JsonValue;
        forwardedBody = JSON.stringify(sanitizeToolResultNames(payload));
      } catch {
        // YAI owns JSON validation and returns its normal OpenAI-compatible error.
      }
    }
    const upstreamUrl = `${upstreamOrigin}${requestUrl.pathname}${requestUrl.search}`;
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: upstreamHeaders(request.headers, accountId),
      body: forwardedBody,
      signal: abortController.signal,
    });
    copyResponseHeaders(upstream, response);
    response.writeHead(upstream.status, upstream.statusText);
    await streamResponse(upstream, response);
  } catch (error) {
    if (response.destroyed) return;
    if (response.headersSent) {
      response.destroy();
      return;
    }
    const status = error instanceof Error && error.message === 'payload_too_large' ? 413 : 502;
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'YAI adapter request failed' } }));
  }
}

function selfTest(): void {
  const messages: JsonObject[] = [
    { role: 'assistant', name: 'assistant-name', content: 'hello' },
    { role: 'tool', name: 'web_search', tool_call_id: 'call-1', content: 'result' },
  ];
  const input: JsonObject = { messages };
  assert.deepEqual(sanitizeToolResultNames(input), {
    messages: [
      { role: 'assistant', name: 'assistant-name', content: 'hello' },
      { role: 'tool', tool_call_id: 'call-1', content: 'result' },
    ],
  });
  assert.equal(messages[1].name, 'web_search');
  assert.equal(isAllowedRoute('POST', '/v1/chat/completions'), true);
  assert.equal(isAllowedRoute('GET', '/v1/files/abc123/content'), true);
  assert.equal(isAllowedRoute('POST', '/v1/admin/users'), false);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  createServer((request, response) => void handleRequest(request, response)).listen(
    adapterPort,
    '0.0.0.0',
  );
}
