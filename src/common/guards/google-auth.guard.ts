import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class GoogleAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Extraer el token de Bearer o del body
    const authHeader = request.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : request.body?.accessToken;

    if (!token) {
      throw new UnauthorizedException('No se proporcionó un Access Token de Google.');
    }

    try {
      // Consulta directa al endpoint público de verificación de Google
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error_description || 'Token inválido');
      }

      const tokenInfo = await response.json();

      // Extraer el ID único global del usuario (sub o user_id)
      const userId = tokenInfo.sub || tokenInfo.user_id || tokenInfo.email;

      if (!userId) {
        throw new UnauthorizedException('El token de Google no contiene un ID de usuario válido.');
      }

      // 👈 INYECTAR EN REQUEST.USER Y REQUEST.GOOGLEUSER PARA EVITAR INCOMPATIBILIDADES
      request.user = {
        sub: userId,
        email: tokenInfo.email,
      };
      request.googleUser = request.user;

      return true;
    } catch (error: any) {
      throw new UnauthorizedException(`Token de Google inválido o expirado: ${error.message}`);
    }
  }
}