declare module "swagger-ui-express" {
  import type { RequestHandler } from "express";

  export type SwaggerUiOptions = {
    [key: string]: unknown;
    customCss?: string;
    customJs?: string;
    customJsStr?: string;
    customSiteTitle?: string;
    swaggerOptions?: Record<string, unknown>;
  };

  const swaggerUi: {
    serve: RequestHandler[];
    setup(document?: object | null, options?: SwaggerUiOptions): RequestHandler;
  };

  export default swaggerUi;
}
