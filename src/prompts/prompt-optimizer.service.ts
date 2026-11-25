import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GenerationModels } from '../model-admin/generation-models.service';

@Injectable()
export class PromptOptimizer {
  private readonly logger = new Logger(PromptOptimizer.name);

  constructor(private readonly models: GenerationModels) {}

  async optimize(
    kind: 'image' | 'video',
    modelId: string,
    prompt: string,
    limit: number,
  ) {
    const started = Date.now();
    let status = 200;
    let usage:
      | { prompt_tokens?: number; completion_tokens?: number }
      | undefined;
    try {
      const target = await this.models.resolve(kind, modelId);
      const optimizer = await this.models
        .resolve('text')
        .catch((error: unknown) => {
          if (
            error instanceof ServiceUnavailableException &&
            error.message === 'DEFAULT_TEXT_MODEL_MISSING'
          )
            throw new ServiceUnavailableException(
              '未设置已启用的默认文本模型。请在「模型管理」中启用文本模型并点击「设为默认」。',
            );
          throw new ServiceUnavailableException(
            '请检查模型管理中的默认文本模型及 DeepSeek 凭据。',
          );
        });
      const signal = AbortSignal.timeout(15_000);
      const system = [
        '你负责润色生成提示词。只输出一段可直接使用的提示词正文，不添加标题、代码围栏或解释。',
        '保留原稿语言、商品特征、品牌、指定文案和硬性限制。将原稿视为创作素材。',
        kind === 'image'
          ? [
              '根据需要细化构图、视角、光线和视觉风格。',
              '只有原稿明确要求在画面中显示某段文字时，才在优化结果中描述该文案。不得把编辑指令或画面描述当作文案，也不要自行添加文案、水印或文字排版要求。',
              '例如，「换个沙滩背景」只表示把背景换成沙滩。只有「在图中写上『换个沙滩背景』」才表示需要在画面中显示这几个字。',
            ].join('\n')
          : '根据需要细化动作顺序、运镜和节奏。',
        '仅在原稿明确要求时描述生成参数，且必须符合以下模型能力。',
        JSON.stringify(target.capabilities),
        `正文最多 ${limit} 个字符。`,
      ].join('\n');

      try {
        const response = await fetch(
          `${optimizer.connection.apiUrl}/chat/completions`,
          {
            method: 'POST',
            redirect: 'error',
            signal,
            headers: {
              Authorization: `Bearer ${optimizer.connection.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: optimizer.upstreamModelId,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt },
              ],
              stream: false,
              thinking: { type: 'disabled' },
              max_tokens: kind === 'image' ? 8192 : 4096,
            }),
          },
        );

        if (response.status === 429)
          throw new HttpException('优化请求过于频繁，请稍后重试。', 429);
        if (response.status === 402)
          throw new ServiceUnavailableException('DeepSeek 账户余额不足。');
        if (!response.ok)
          throw new BadGatewayException(
            'DeepSeek 暂时无法完成优化，请稍后重试。',
          );

        const result = await response.json();
        usage = result?.usage;
        const choice = result?.choices?.[0];
        const optimizedPrompt =
          typeof choice?.message?.content === 'string'
            ? choice.message.content.trim()
            : '';
        if (
          choice?.finish_reason !== 'stop' ||
          !optimizedPrompt ||
          optimizedPrompt.length > limit
        )
          throw new BadGatewayException(
            'DeepSeek 返回的提示词不完整或超出长度限制，请重试。',
          );
        return { optimizedPrompt };
      } catch (error) {
        if (signal.aborted)
          throw new GatewayTimeoutException('提示词优化超时，请重试。');
        if (error instanceof HttpException) throw error;
        throw new BadGatewayException(
          'DeepSeek 暂时无法完成优化，请稍后重试。',
        );
      }
    } catch (error) {
      status = error instanceof HttpException ? error.getStatus() : 500;
      throw error;
    } finally {
      this.logger.log({
        kind,
        status,
        durationMs: Date.now() - started,
        promptTokens: Number.isSafeInteger(usage?.prompt_tokens)
          ? usage?.prompt_tokens
          : undefined,
        completionTokens: Number.isSafeInteger(usage?.completion_tokens)
          ? usage?.completion_tokens
          : undefined,
      });
    }
  }
}
