import crypto from "node:crypto";

export const QUIZ_STATUSES = new Set(["DRAFT", "PUBLISHED", "CLOSED"]);
export const DELIVERY_MODES = new Set(["ONLINE", "OFFLINE"]);
export const QUESTION_TYPES = new Set(["MCQ", "TRUE_FALSE"]);

export type QuestionType = "MCQ" | "TRUE_FALSE";
export type QuizStatus = "DRAFT" | "PUBLISHED" | "CLOSED";
export type DeliveryMode = "ONLINE" | "OFFLINE";

export type NormalizedQuestion = {
  type: QuestionType;
  questionText: string;
  options: string[];
  correctAnswer: number;
  marks: number;
  orderIndex: number;
};

const nonEmpty = (value: unknown) => typeof value === "string" && value.trim().length > 0;

const read = (object: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    if (object[key] !== undefined) return object[key];
  }
  return undefined;
};

export const parseQuizDate = (value: unknown, fieldName: string) => {
  const date = new Date(String(value || ""));
  if (!value || Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date and time`);
  }
  return date;
};

export const normalizeIdentifier = (value: unknown) => String(value || "")
  .trim()
  .replace(/\s+/g, " ")
  .toLowerCase();

export const buildParticipantKey = (rollNumber: string, className: string) => {
  const roll = normalizeIdentifier(rollNumber);
  const classKey = normalizeIdentifier(className);
  if (!roll || !classKey) throw new Error("Roll number and class are required");
  return `${roll}|${classKey}`;
};

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString("hex");

export const hashToken = (token: string) => crypto
  .createHash("sha256")
  .update(token)
  .digest("hex");

export const shuffle = <T>(values: T[]) => {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = crypto.randomInt(index + 1);
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
};

export const validateQuestions = (
  questions: unknown,
  { requireQuestions = true }: { requireQuestions?: boolean } = {}
): NormalizedQuestion[] => {
  if (!Array.isArray(questions)) throw new Error("questions must be an array");
  if (requireQuestions && questions.length === 0) throw new Error("At least one question is required");

  return questions.map((raw, index) => {
    const question = raw as Record<string, unknown>;
    const type = String(read(question, "type") || "").toUpperCase() as QuestionType;
    const label = `Question ${index + 1}`;
    if (!QUESTION_TYPES.has(type)) throw new Error(`${label} has an invalid type`);

    const text = String(read(question, "questionText", "question_text") || "").trim();
    if (!text) throw new Error(`${label} text is required`);

    const marks = Number(read(question, "marks"));
    if (!Number.isFinite(marks) || marks <= 0 || marks > 1000) {
      throw new Error(`${label} marks must be greater than 0`);
    }

    let options = Array.isArray(read(question, "options"))
      ? (read(question, "options") as unknown[]).map((option) => String(option).trim())
      : [];
    let correctAnswer = read(question, "correctAnswer", "correct_answer") as number | string;

    if (type === "MCQ") {
      options = options.filter(Boolean);
      if (options.length < 2 || options.length > 10) {
        throw new Error(`${label} must have between 2 and 10 non-empty options`);
      }
      if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
        throw new Error(`${label} options must be distinct`);
      }
      if (typeof correctAnswer === "string" && /^[a-j]$/i.test(correctAnswer.trim())) {
        correctAnswer = correctAnswer.trim().toLowerCase().charCodeAt(0) - 97;
      } else {
        correctAnswer = Number(correctAnswer);
      }
      if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length) {
        throw new Error(`${label} has an invalid correct-answer index`);
      }
    } else {
      options = ["True", "False"];
      const value = String(correctAnswer ?? "").toLowerCase().trim();
      if (["true", "t", "1"].includes(value)) correctAnswer = 0;
      else if (["false", "f", "0"].includes(value)) correctAnswer = 1;
      else correctAnswer = Number(correctAnswer);
      if (correctAnswer !== 0 && correctAnswer !== 1) {
        throw new Error(`${label} must use True or False as its correct answer`);
      }
    }

    return {
      type,
      questionText: text,
      options,
      correctAnswer: correctAnswer as number,
      marks,
      orderIndex: index
    };
  });
};

export const validateQuizPayload = (
  payload: Record<string, unknown>,
  { partial = false }: { partial?: boolean } = {}
) => {
  const rawTitle = read(payload, "title");
  if (!partial || rawTitle !== undefined) {
    if (!nonEmpty(rawTitle)) throw new Error("Quiz title is required");
  }

  const statusRaw = read(payload, "status");
  const status = statusRaw === undefined ? undefined : String(statusRaw).toUpperCase();
  if (status && !QUIZ_STATUSES.has(status)) throw new Error("Invalid quiz status");

  const deliveryRaw = read(payload, "deliveryMode", "delivery_mode");
  const deliveryMode = deliveryRaw === undefined ? undefined : String(deliveryRaw).toUpperCase();
  if (deliveryMode && !DELIVERY_MODES.has(deliveryMode)) throw new Error("Invalid quiz delivery mode");

  const durationRaw = read(payload, "durationMinutes", "duration_minutes");
  const durationMinutes = durationRaw === undefined ? undefined : Number(durationRaw);
  if (
    durationMinutes !== undefined &&
    (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440)
  ) {
    throw new Error("Duration must be between 1 and 1440 minutes");
  }

  const maxViolationsRaw = read(payload, "maxViolations", "max_violations");
  const maxViolations = maxViolationsRaw === undefined ? undefined : Number(maxViolationsRaw);
  if (
    maxViolations !== undefined &&
    (!Number.isInteger(maxViolations) || maxViolations < 1 || maxViolations > 100)
  ) {
    throw new Error("Maximum violations must be between 1 and 100");
  }

  const startRaw = read(payload, "startAt", "start_at");
  const endRaw = read(payload, "endAt", "end_at");
  const startAt = startRaw === undefined ? undefined : parseQuizDate(startRaw, "startAt");
  const endAt = endRaw === undefined ? undefined : parseQuizDate(endRaw, "endAt");
  if ((!partial && !startAt) || (!partial && !endAt)) throw new Error("startAt and endAt are required");
  if (startAt && endAt && endAt <= startAt) throw new Error("endAt must be after startAt");

  const questionsRaw = read(payload, "questions");
  const questions = questionsRaw === undefined ? undefined : validateQuestions(questionsRaw);

  return {
    title: rawTitle === undefined ? undefined : String(rawTitle).trim(),
    description: read(payload, "description") === undefined
      ? undefined
      : (nonEmpty(read(payload, "description")) ? String(read(payload, "description")).trim() : null),
    subjectName: read(payload, "subjectName", "subject_name") === undefined
      ? undefined
      : (nonEmpty(read(payload, "subjectName", "subject_name")) ? String(read(payload, "subjectName", "subject_name")).trim() : null),
    className: read(payload, "className", "class_name") === undefined
      ? undefined
      : (nonEmpty(read(payload, "className", "class_name")) ? String(read(payload, "className", "class_name")).trim() : null),
    durationMinutes,
    startAt,
    endAt,
    status: status as QuizStatus | undefined,
    deliveryMode: deliveryMode as DeliveryMode | undefined,
    shuffleQuestions: read(payload, "shuffleQuestions", "shuffle_questions") === undefined
      ? undefined
      : Boolean(read(payload, "shuffleQuestions", "shuffle_questions")),
    maxViolations,
    allowReview: read(payload, "allowReview", "allow_review") === undefined
      ? undefined
      : Boolean(read(payload, "allowReview", "allow_review")),
    questions
  };
};

export const questionToDb = (quizId: string, question: NormalizedQuestion) => ({
  quiz_id: quizId,
  type: question.type,
  question_text: question.questionText,
  options: question.options,
  correct_answer: question.correctAnswer,
  marks: question.marks,
  order_index: question.orderIndex
});

export const sanitizeQuestion = (question: Record<string, unknown>) => ({
  id: question.id,
  type: question.type,
  questionText: question.question_text,
  options: question.options || [],
  marks: Number(question.marks || 0),
  orderIndex: question.order_index
});

export const serializeQuestion = (question: Record<string, unknown>) => ({
  ...sanitizeQuestion(question),
  correctAnswer: question.correct_answer
});

export const serializeQuiz = (quiz: Record<string, any>) => {
  const questions = Array.isArray(quiz.questions) ? quiz.questions : quiz.quiz_questions;
  const attempts = Array.isArray(quiz.attempts) ? quiz.attempts : quiz.quiz_attempts;

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    subjectName: quiz.subject_name,
    className: quiz.class_name,
    totalMarks: Number(quiz.total_marks || 0),
    durationMinutes: quiz.duration_minutes,
    startAt: quiz.start_at,
    endAt: quiz.end_at,
    status: quiz.status,
    deliveryMode: quiz.delivery_mode,
    shuffleQuestions: quiz.shuffle_questions,
    maxViolations: quiz.max_violations,
    allowReview: quiz.allow_review,
    shareToken: quiz.share_token,
    createdAt: quiz.created_at,
    updatedAt: quiz.updated_at,
    questions: Array.isArray(questions)
      ? [...questions].sort((a, b) => Number(a.order_index) - Number(b.order_index)).map(serializeQuestion)
      : undefined,
    _count: {
      questions: Array.isArray(questions) ? questions.length : Number(quiz.question_count || 0),
      attempts: Array.isArray(attempts) ? attempts.length : Number(quiz.attempt_count || 0)
    }
  };
};

export const getPublicQuizState = (quiz: Record<string, any>) => {
  if (quiz.delivery_mode !== "ONLINE") return "OFFLINE";
  if (quiz.status === "DRAFT") return "DRAFT";
  if (quiz.status === "CLOSED") return "CLOSED";

  const now = Date.now();
  if (now < new Date(quiz.start_at).getTime()) return "UPCOMING";
  if (now > new Date(quiz.end_at).getTime()) return "CLOSED";
  return "OPEN";
};
