import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { validateQuestions } from "@/lib/quiz";

const MIXES = new Set(["BALANCED", "MCQ_ONLY", "MCQ_TRUE_FALSE"]);
const DIFFICULTIES = new Set(["EASY", "MEDIUM", "HARD", "MIXED"]);

const questionSchema = z.object({
  type: z.enum(["MCQ", "TRUE_FALSE"]),
  questionText: z.string(),
  options: z.array(z.string()),
  correctAnswer: z.union([z.string(), z.number()]),
  marks: z.number()
});

export const validateAIQuizRequest = (body: Record<string, unknown>) => {
  const prompt = String(body.prompt || "").trim();
  if (prompt.length < 10) throw new Error("Describe the quiz you want in at least 10 characters");

  const maxPromptChars = Math.min(
    Math.max(Number(process.env.AI_MAX_QUIZ_PROMPT_CHARS) || 10000, 500),
    20000
  );
  if (prompt.length > maxPromptChars) {
    throw new Error(`Prompt cannot exceed ${maxPromptChars.toLocaleString()} characters`);
  }

  const questionCount = Number(body.questionCount ?? 5);
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 30) {
    throw new Error("Question count must be between 1 and 30");
  }

  const mix = String(body.mix || "BALANCED").toUpperCase();
  if (!MIXES.has(mix)) throw new Error("Invalid question mix");

  const difficulty = String(body.difficulty || "MIXED").toUpperCase();
  if (!DIFFICULTIES.has(difficulty)) throw new Error("Invalid difficulty");

  const marksPerQuestion = Number(body.marksPerQuestion ?? 1);
  if (!Number.isFinite(marksPerQuestion) || marksPerQuestion <= 0 || marksPerQuestion > 100) {
    throw new Error("Marks per question must be between 0 and 100");
  }

  const existingQuestionTexts = Array.isArray(body.existingQuestionTexts)
    ? body.existingQuestionTexts
      .slice(0, 100)
      .map((text) => String(text).trim().slice(0, 500))
      .filter(Boolean)
    : [];

  return { prompt, questionCount, mix, difficulty, marksPerQuestion, existingQuestionTexts };
};

const mixInstruction: Record<string, string> = {
  BALANCED: "Use mostly MCQs, with some true/false questions where appropriate.",
  MCQ_ONLY: "Generate only MCQ questions.",
  MCQ_TRUE_FALSE: "Generate a useful mix of MCQ and TRUE_FALSE questions."
};

export const generateQuizQuestions = async ({
  subjectName,
  className,
  prompt,
  questionCount,
  mix,
  difficulty,
  marksPerQuestion,
  existingQuestionTexts
}: {
  subjectName?: string | null;
  className?: string | null;
  prompt: string;
  questionCount: number;
  mix: string;
  difficulty: string;
  marksPerQuestion: number;
  existingQuestionTexts: string[];
}) => {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("AI quiz generation is not configured. Add OPENAI_API_KEY to .env.local.");
    (error as Error & { code?: string }).code = "AI_NOT_CONFIGURED";
    throw error;
  }

  const model = process.env.OPENAI_QUIZ_MODEL || "gpt-5.4-mini";
  const schema = z.object({
    questions: z.array(questionSchema).length(questionCount)
  });
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const duplicateContext = existingQuestionTexts.length
    ? `Avoid duplicating these existing questions:\n${existingQuestionTexts.map((text) => `- ${text}`).join("\n")}`
    : "There are no existing questions to avoid.";

  const response = await client.responses.parse({
    model,
    input: [
      {
        role: "system",
        content: [
          "You create accurate teacher-ready quiz questions.",
          "Return exactly the requested number of questions using the supplied schema.",
          "Only generate MCQ and TRUE_FALSE questions.",
          "MCQs must have exactly four distinct plausible options and one unambiguous answer.",
          "TRUE_FALSE options must be exactly [\"True\", \"False\"].",
          "For MCQ and TRUE_FALSE, correctAnswer must be the zero-based option index.",
          "Avoid vague wording, repeated questions, answer hints, and all/none-of-the-above choices."
        ].join(" ")
      },
      {
        role: "user",
        content: [
          `Subject: ${subjectName || "General"}`,
          `Class: ${className || "Unspecified"}`,
          `Teacher request: ${prompt}`,
          `Question count: ${questionCount}`,
          `Question mix: ${mixInstruction[mix]}`,
          `Difficulty: ${difficulty === "MIXED" ? "Use a reasonable mix of easy, medium, and hard questions." : difficulty}`,
          `Use ${marksPerQuestion} mark(s) for every question.`,
          duplicateContext
        ].join("\n\n")
      }
    ],
    text: {
      format: zodTextFormat(schema, "quiz_system_questions")
    },
    max_output_tokens: Math.min(16000, 800 + questionCount * 500)
  });

  if (!response.output_parsed?.questions) {
    const error = new Error("The AI did not return usable quiz questions. Adjust the prompt and try again.");
    (error as Error & { code?: string }).code = "AI_INVALID_OUTPUT";
    throw error;
  }

  const questions = validateQuestions(
    response.output_parsed.questions.map((question, index) => ({
      ...question,
      marks: marksPerQuestion,
      orderIndex: index
    }))
  );

  return {
    questions,
    model,
    usage: response.usage
      ? {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.total_tokens
      }
      : null
  };
};
