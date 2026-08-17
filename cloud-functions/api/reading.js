import {
  createReadingService,
  ReadingServiceError,
} from '../../src/server/reading-service.mjs';

export async function onRequestPost({ request, env = {} }) {
  try {
    const service = createReadingService({
      apiKey: env.DEEPSEEK_API_KEY,
      model: env.DEEPSEEK_MODEL,
    });
    return Response.json(await service.generate(await request.json()));
  } catch (error) {
    const safe = error instanceof ReadingServiceError
      ? error
      : new ReadingServiceError('INTERNAL_ERROR', '服务暂不可用');
    return Response.json({
      error: {
        code: safe.code,
        message: safe.message.replace(/^\w+:\s*/, ''),
      },
    }, { status: safe.status });
  }
}
