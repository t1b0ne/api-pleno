import { Injectable } from '@nestjs/common';
import { ConvexHttpClient } from 'convex/browser';

@Injectable()
export class ConvexService {
  private client: ConvexHttpClient;

  constructor() {
    const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error("No se encontró la variable de entorno CONVEX_URL");
    }
    this.client = new ConvexHttpClient(convexUrl);
  }

  getClient(): ConvexHttpClient {
    return this.client;
  }
}