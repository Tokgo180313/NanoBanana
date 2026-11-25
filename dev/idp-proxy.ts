import type { IncomingMessage, ServerResponse } from 'node:http'
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib'
import type { ProxyOptions } from 'vite'

export function rewriteIdpText(
  text: string,
  publicOrigin: string,
  upstreamOrigins: string[],
) {
  for (const upstream of upstreamOrigins) {
    text = text.replaceAll(upstream, publicOrigin)
    text = text.replaceAll(
      upstream.replaceAll('/', '\\/'),
      publicOrigin.replaceAll('/', '\\/'),
    )
  }
  return text
}

export function isPublicIdpPath(value: string) {
  try {
    const path = decodeURIComponent(value.split('?')[0] || '')
    if (
      /[\\;\u0000-\u001f]/.test(path) ||
      /%[0-9a-f]{2}/i.test(path) ||
      path.split('/').some((part) => part === '.' || part === '..')
    )
      return false
    return (
      path === '/realms/nexus' ||
      path.startsWith('/realms/nexus/') ||
      path.startsWith('/resources/')
    )
  } catch {
    return false
  }
}

/** Only the public nexus realm and its assets are exposed, never /admin or /master. */
export function idpProxy(publicOrigins: readonly string[] = []): ProxyOptions {
  const target = process.env.VITE_IDP_PROXY_TARGET || 'http://127.0.0.1:8180'
  const upstreamOrigins = ['http://localhost:8180', new URL(target).origin]
  return {
    target,
    // Preserve the browser host so Keycloak treats HTTP LAN requests as HTTP,
    // rather than applying localhost's special secure-context cookie rules.
    changeOrigin: false,
    selfHandleResponse: true,
    bypass(request) {
      return isPublicIdpPath(request.url || '') ? undefined : false
    },
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq) =>
        proxyReq.setHeader('accept-encoding', 'identity'),
      )
      proxy.on('proxyRes', (response, request, outgoing) => {
        void sendResponse(
          response,
          request,
          outgoing,
          upstreamOrigins,
          publicOrigins,
        )
      })
    },
  }
}

async function sendResponse(
  response: IncomingMessage,
  request: IncomingMessage,
  outgoing: ServerResponse,
  upstreamOrigins: string[],
  publicOrigins: readonly string[],
) {
  try {
    const httpOrigin = new URL('http://' + request.headers.host).origin
    // TLS terminates at the tunnel. Use only exact configured origins rather
    // than trusting client-supplied forwarded protocol headers.
    const publicOrigin =
      publicOrigins.find(
        (origin) => new URL(origin).host === request.headers.host,
      ) || httpOrigin
    const rewriteOrigins = [...upstreamOrigins, httpOrigin]
    for (const [name, value] of Object.entries(response.headers)) {
      if (
        value === undefined ||
        ['connection', 'transfer-encoding', 'content-length'].includes(name)
      )
        continue
      outgoing.setHeader(
        name,
        Array.isArray(value)
          ? value.map((item) =>
              rewriteIdpText(item, publicOrigin, rewriteOrigins),
            )
          : rewriteIdpText(value, publicOrigin, rewriteOrigins),
      )
    }
    outgoing.statusCode = response.statusCode || 502
    const type = response.headers['content-type'] || ''
    if (
      !/text\/|javascript|json|xml/i.test(type) ||
      request.method === 'HEAD'
    ) {
      response.on('error', () => outgoing.destroy())
      response.pipe(outgoing)
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of response) {
      const bytes = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array)
      size += bytes.length
      if (size > 8 * 1024 * 1024) throw new Error('IDP_RESPONSE_TOO_LARGE')
      chunks.push(bytes)
    }
    let bytes = Buffer.concat(chunks)
    const encoding = response.headers['content-encoding']
    if (encoding === 'gzip')
      bytes = gunzipSync(bytes, { maxOutputLength: 8 * 1024 * 1024 })
    else if (encoding === 'br')
      bytes = brotliDecompressSync(bytes, { maxOutputLength: 8 * 1024 * 1024 })
    else if (encoding === 'deflate')
      bytes = inflateSync(bytes, { maxOutputLength: 8 * 1024 * 1024 })
    else if (encoding && encoding !== 'identity')
      throw new Error('IDP_RESPONSE_ENCODING')
    const body = rewriteIdpText(
      bytes.toString('utf8'),
      publicOrigin,
      rewriteOrigins,
    )
    outgoing.removeHeader('content-encoding')
    outgoing.removeHeader('etag')
    outgoing.setHeader('content-length', Buffer.byteLength(body))
    outgoing.end(body)
  } catch {
    if (!outgoing.headersSent) {
      outgoing.getHeaderNames().forEach((name) => outgoing.removeHeader(name))
      outgoing.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      outgoing.end('身份登录服务暂时不可用')
    } else outgoing.destroy()
  }
}
