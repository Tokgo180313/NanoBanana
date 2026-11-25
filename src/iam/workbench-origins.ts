import { ServiceUnavailableException } from '@nestjs/common';

export function workbenchOrigins(primary: string, additional = ''): string[] {
  const values = [
    primary,
    ...additional
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ];
  return [
    ...new Set(
      values.map((value) => {
        try {
          const url = new URL(value);
          if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.pathname !== '/' ||
            url.search ||
            url.hash
          )
            throw new Error();
          return url.origin;
        } catch {
          throw new ServiceUnavailableException('INVALID_WORKBENCH_ORIGIN');
        }
      }),
    ),
  ];
}
