import OpenAI from "openai";
import { getRuntimeConfig } from "../config/runtime";

export function createOpenAIClient(): OpenAI {
  const { openai_api_key: apiKey } = getRuntimeConfig();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  return new OpenAI({ apiKey });
}

export function getModel(): string {
  const { openai_model } = getRuntimeConfig();
  return openai_model || "gpt-5.2";
}
