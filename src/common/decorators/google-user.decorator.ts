import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GoogleUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user || request.googleUser;
  },
);

export const GoogleToken = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.googleToken;
  },
);