import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Activación global de validación de DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Configuración de OpenAPI / Swagger
  const config = new DocumentBuilder()
    .setTitle('Task Manager AI - API')
    .setDescription('Backend REST con NestJS, Convex BD, Google Classroom e IA')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Ingresa tu OAuth Access Token de Google aquí',
      },
      'google-token', // Identificador de seguridad en Swagger
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(3000);
  console.log(`Servidor corriendo en: http://localhost:3000`);
  console.log(`Documentación Swagger disponible en: http://localhost:3000/api/docs`);
}
bootstrap();