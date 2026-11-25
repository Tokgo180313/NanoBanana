import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { IamAuth } from '../iam/iam-auth.service';
import type { IamContext } from '../iam/iam-client.service';
import type { ImageAccess } from '../iam/image-access.service';
import { IamSessionGuard } from '../iam/iam-session.guard';
import { PromptOptimizerController } from './prompt-optimizer.controller';
import type { PromptOptimizer } from './prompt-optimizer.service';

describe('prompt optimization access', () => {
  const optimize = jest.fn();
  const requireCreate = jest.fn();
  const controller = new PromptOptimizerController(
    { optimize } as unknown as PromptOptimizer,
    { requireCreate } as unknown as ImageAccess,
  );
  const req = { iam: { permissions: [] } as unknown as IamContext };
  const body = { prompt: '商品展示', modelId: 'target' };

  beforeEach(() => jest.clearAllMocks());

  it('requires an authenticated POST session with CSRF validation', async () => {
    const request = { method: 'POST' };
    const context = jest.fn().mockRejectedValue(new UnauthorizedException());
    const guard = new IamSessionGuard({ context } as unknown as IamAuth);
    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => request }),
      } as ExecutionContext),
    ).rejects.toMatchObject({ status: 401 });
    expect(context).toHaveBeenCalledWith(request, true);
  });

  it('enforces the existing video permission', async () => {
    await expect(
      controller.optimize(req, { ...body, kind: 'video' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(optimize).not.toHaveBeenCalled();
  });

  it('enforces the existing image permission', async () => {
    requireCreate.mockRejectedValueOnce(new ForbiddenException());
    await expect(
      controller.optimize(req, { ...body, kind: 'image' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(optimize).not.toHaveBeenCalled();
  });
});
