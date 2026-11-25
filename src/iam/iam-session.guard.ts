import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { IamAuth } from './iam-auth.service';
@Injectable()
export class IamSessionGuard implements CanActivate {
  constructor(private readonly auth: IamAuth) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    request.iam = await this.auth.context(
      request,
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method),
    );
    return true;
  }
}
