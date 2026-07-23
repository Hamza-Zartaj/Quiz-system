import xlsx from "xlsx";
import { validateQuestions } from "@/lib/quiz";

export const QUIZ_EXCEL_COLUMNS = [
  "type",
  "questionText",
  "option1",
  "option2",
  "option3",
  "option4",
  "correctAnswer",
  "marks"
];

export const parseQuizQuestionsWorkbook = (buffer: Buffer) => {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("The workbook does not contain a worksheet");

  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
  const parsed = rows
    .map((row, index) => {
      const type = String(row.type || row.Type || "MCQ").trim().toUpperCase();
      const questionText = row.questionText || row.question || row.Question || "";
      const options = [row.option1, row.option2, row.option3, row.option4]
        .filter((option) => option !== undefined && option !== null && String(option).trim() !== "");
      const correctRaw = row.correctAnswer ?? row.correct ?? row.Correct;
      const marks = Number(row.marks ?? row.Marks ?? 1);

      let correctAnswer: number | string;
      if (type === "MCQ") {
        if (typeof correctRaw === "string" && /^[a-j]$/i.test(correctRaw.trim())) {
          correctAnswer = correctRaw.trim().toLowerCase().charCodeAt(0) - 97;
        } else {
          const numericAnswer = Number(correctRaw);
          correctAnswer = numericAnswer >= 1 && numericAnswer <= options.length
            ? numericAnswer - 1
            : numericAnswer;
        }
      } else if (type === "TRUE_FALSE" || type === "TF") {
        const value = String(correctRaw).toLowerCase().trim();
        if (!["true", "false", "1", "0", "t", "f"].includes(value)) {
          throw new Error(`Question ${index + 1} must use TRUE or FALSE as its correct answer`);
        }
        correctAnswer = ["true", "1", "t"].includes(value) ? 0 : 1;
      } else {
        throw new Error(`Question ${index + 1} has an invalid type. Use MCQ or TRUE_FALSE.`);
      }

      return {
        type: type === "TF" ? "TRUE_FALSE" : type,
        questionText: String(questionText),
        options: type === "TRUE_FALSE" || type === "TF" ? ["True", "False"] : options,
        correctAnswer,
        marks
      };
    })
    .filter((question) => question.questionText.trim());

  return validateQuestions(parsed);
};

export const createQuizImportTemplate = () => {
  const exampleRows = [
    {
      type: "MCQ",
      questionText: "Which data structure follows FIFO order?",
      option1: "Stack",
      option2: "Queue",
      option3: "Tree",
      option4: "Graph",
      correctAnswer: "B",
      marks: 2
    },
    {
      type: "TRUE_FALSE",
      questionText: "A primary key must be unique.",
      option1: "",
      option2: "",
      option3: "",
      option4: "",
      correctAnswer: "TRUE",
      marks: 1
    }

  ];

  const questionSheet = xlsx.utils.json_to_sheet(exampleRows, { header: QUIZ_EXCEL_COLUMNS });
  questionSheet["!cols"] = [
    { wch: 14 },
    { wch: 52 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 10 }
  ];

  const instructions = [
    ["Quiz Import Instructions"],
    ["Keep the column names in the Questions sheet unchanged. Delete the example rows before entering your own questions."],
    [],
    ["Column", "Accepted value"],
    ["type", "MCQ or TRUE_FALSE (TF is also accepted)"],
    ["questionText", "Required question text"],
    ["option1-option4", "Required for MCQ. Leave blank for TRUE_FALSE."],
    ["correctAnswer (MCQ)", "Use A, B, C, or D. Letters are recommended."],
    ["correctAnswer (TRUE_FALSE)", "Use TRUE or FALSE"],
    ["marks", "A number greater than 0"]
  ];
  const instructionSheet = xlsx.utils.aoa_to_sheet(instructions);
  instructionSheet["!cols"] = [{ wch: 30 }, { wch: 90 }];

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, questionSheet, "Questions");
  xlsx.utils.book_append_sheet(workbook, instructionSheet, "Instructions");
  return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};
