import { BadGatewayException, ForbiddenException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList } from 'node:net';
const blocked = new BlockList();
for (const [ip, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as [string, number][])
  blocked.addSubnet(ip, prefix, 'ipv4');
export async function readPrivateImage(
  source: string,
  hosts: string[],
): Promise<Buffer> {
  if (source.startsWith('data:')) {
    const m = source.match(
      /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$/,
    );
    if (!m) throw new ForbiddenException('UNSUPPORTED_IMAGE');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > 20 * 1024 * 1024)
      throw new ForbiddenException('IMAGE_TOO_LARGE');
    return bytes;
  }
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new ForbiddenException('INVALID_IMAGE_SOURCE');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !hosts.includes(url.hostname.toLowerCase())
  )
    throw new ForbiddenException('IMAGE_HOST_NOT_ALLOWED');
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (
    !addresses.length ||
    addresses.some((ip) => blocked.check(ip.address, 'ipv4'))
  )
    throw new ForbiddenException('PRIVATE_IMAGE_HOST_REJECTED');
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        lookup: ((_host, options, callback) => {
          const address = addresses[0].address;
          if ((options as any)?.all)
            (callback as any)(null, [{ address, family: 4 }]);
          else (callback as any)(null, address, 4);
        }) as any,
        headers: { Accept: 'image/*' },
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new BadGatewayException('IMAGE_SOURCE_UNAVAILABLE'));
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 20 * 1024 * 1024) {
            req.destroy();
            reject(new BadGatewayException('IMAGE_TOO_LARGE'));
          } else parts.push(chunk);
        });
        response.on('error', () =>
          reject(new BadGatewayException('IMAGE_READ_FAILED')),
        );
        response.on('end', () => resolve(Buffer.concat(parts)));
      },
    );
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
    req.on('error', () =>
      reject(new BadGatewayException('IMAGE_SOURCE_UNAVAILABLE')),
    );
    req.end();
  });
}
