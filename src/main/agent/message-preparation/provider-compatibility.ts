import { toolModelMessageSchema } from 'ai';
import { z } from 'zod';

import { convertMcpResultToModelOutput } from '../utils';

import type { ModelMessage, ToolResultPart, FilePart, TextPart, UserModelMessage } from 'ai';

import logger from '@/logger';

const legacyMedia = z.strictObject({ type: z.literal('media'), data: z.string(), mediaType: z.string() });
const isLegacyMedia = (part: { type: string } | null) => part?.type === 'media';

// Only the cloned conversation is changed. SDK v5 stored inline media before the tagged file format existed.
export const normalizeLegacyToolMedia = (messages: ModelMessage[]): void => {
  for (const message of messages) {
    if (message.role !== 'tool' || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (part.type !== 'tool-result' || part.output?.type !== 'content' || !Array.isArray(part.output.value) || !part.output.value.some(isLegacyMedia)) {
        continue;
      }
      part.output.value = part.output.value.map((item) => {
        if (!isLegacyMedia(item)) {
          return item;
        }
        const media = legacyMedia.parse(item);
        return { type: 'file', data: { type: 'data', data: media.data }, mediaType: media.mediaType };
      });
      // Validate the upgraded receipt before duplicate filtering or image extraction can remove another invalid part.
      toolModelMessageSchema.parse({ role: 'tool', content: [part] });
    }
  }
};

/**
 * Converts tool results containing image data (from MCP tools that return
 * content with image parts) into a user message with image parts, and
 * replaces the tool result output with text-only content.
 *
 * This is necessary because the OpenAI API (and OpenAI-compatible providers)
 * only supports string content in tool results — images cannot be sent
 * inline. By moving images to a user message, all providers can handle
 * them via their native image support (e.g. OpenAI `image_url`, Anthropic
 * `image` with base64, Google `inlineData`).
 */
export const convertImageToolResults = (messages: ModelMessage[]): ModelMessage[] => {
  const newMessages: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === 'tool') {
      const toolContent = message.content.filter((p) => p.type === 'tool-result') as ToolResultPart[];
      const updatedToolContent: ToolResultPart[] = [];
      const imageParts: FilePart[] = [];

      for (const toolResultPart of toolContent) {
        try {
          // Handle content-type outputs — extract file/image parts into user messages
          // since not all providers support file parts in tool results natively
          if (toolResultPart.output.type === 'content') {
            if (Array.isArray(toolResultPart.output.value) && toolResultPart.output.value.some((p) => p.type === 'file')) {
              const fileParts = toolResultPart.output.value.filter((p) => p.type === 'file') as FilePart[];
              const textParts = toolResultPart.output.value.filter((p) => p.type === 'text') as TextPart[];

              logger.debug(
                `[convertImageToolResults] Extracting ${fileParts.length} image(s) from content-type tool result "${toolResultPart.toolName}" into user message`,
              );

              for (const filePart of fileParts) {
                if ((filePart.data as { type: string }).type === 'data') {
                  imageParts.push({
                    type: 'file',
                    data: filePart.data as { type: 'data'; data: string },
                    mediaType: filePart.mediaType,
                  });
                }
              }

              const textValue = textParts.length > 0 ? textParts.map((p) => p.text).join('\n\n') : 'Image rendered.';

              updatedToolContent.push({
                ...toolResultPart,
                output: { type: 'text', value: textValue },
              });
            } else {
              updatedToolContent.push(toolResultPart);
            }
            continue;
          }

          if (toolResultPart.output.type !== 'text' && toolResultPart.output.type !== 'json') {
            updatedToolContent.push(toolResultPart);
            continue;
          }

          let parsedResult: unknown = null;

          if (toolResultPart.output.type === 'text') {
            parsedResult = JSON.parse(toolResultPart.output.value);
          } else if (toolResultPart.output.type === 'json') {
            parsedResult = toolResultPart.output.value;
          }

          if (parsedResult && Array.isArray((parsedResult as { content: unknown[] }).content)) {
            const converted = convertMcpResultToModelOutput(parsedResult);

            if (converted.type === 'content' && converted.value.some((p) => p.type === 'file')) {
              const fileParts = converted.value.filter((p) => p.type === 'file');
              const textParts = converted.value.filter((p) => p.type === 'text');

              logger.debug(`[convertImageToolResults] Extracting ${fileParts.length} image(s) from tool result "${toolResultPart.toolName}" into user message`);

              for (const filePart of fileParts) {
                if (filePart.data.type === 'data') {
                  imageParts.push({
                    type: 'file',
                    data: filePart.data,
                    mediaType: filePart.mediaType,
                  });
                }
              }

              const textValue = textParts.length > 0 ? textParts.map((p) => (p as { text: string }).text).join('\n\n') : 'Image rendered.';

              updatedToolContent.push({
                ...toolResultPart,
                output: { type: 'text', value: textValue },
              });
            } else {
              updatedToolContent.push(toolResultPart);
            }
          } else {
            updatedToolContent.push(toolResultPart);
          }
        } catch {
          updatedToolContent.push(toolResultPart);
        }
      }

      newMessages.push({
        ...message,
        content: updatedToolContent,
      });

      // If images were extracted, add a user message with the image parts
      if (imageParts.length > 0) {
        logger.debug(`[convertImageToolResults] Added user message with ${imageParts.length} image(s)`);
        newMessages.push({
          role: 'user',
          content: imageParts,
        } as UserModelMessage);
      }
    } else {
      newMessages.push(message);
    }
  }

  return newMessages;
};
