"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  BookOpenCheck,
  Brain,
  Clipboard,
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  X
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type QuestionType = "MCQ" | "TRUE_FALSE";

type Question = {
  id?: string;
  type: QuestionType;
  questionText: string;
  options: string[];
  correctAnswer: number | string;
  marks: number;
  orderIndex?: number;
};

type Quiz = {
  id: string;
  title: string;
  description?: string | null;
  subjectName?: string | null;
  className?: string | null;
  totalMarks: number;
  durationMinutes: number;
  startAt: string;
  endAt: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  deliveryMode: "ONLINE" | "OFFLINE";
  shuffleQuestions: boolean;
  maxViolations: number;
  allowReview: boolean;
  shareToken: string;
  questions?: Question[];
  _count?: { questions: number; attempts: number };
};

type AttemptRow = {
  id: string;
  participantName: string;
  rollNumber: string;
  className: string;
  startedAt: string;
  submittedAt?: string | null;
  status: string;
  totalScore?: number | null;
  violations: number;
};

type AttemptDetail = {
  id: string;
  participantName: string;
  rollNumber: string;
  className: string;
  status: string;
  totalScore: number;
  violations: number;
  quiz: { id: string; title: string; totalMarks: number; questions: Question[] };
  answers: {
    id: string;
    questionId: string;
    answer: unknown;
    isCorrect: boolean | null;
    marksAwarded: number;
    feedback?: string | null;
  }[];
};

const emptyQuestion = (type: QuestionType = "MCQ"): Question => ({
  type,
  questionText: "",
  options: type === "MCQ" ? ["", "", "", ""] : ["True", "False"],
  correctAnswer: 0,
  marks: 1
});

const isEmptyQuestion = (question: Question) => (
  !question.questionText.trim() &&
  question.type === "MCQ" &&
  question.options.every((option) => !option.trim()) &&
  Number(question.correctAnswer) === 0 &&
  Number(question.marks) === 1
);

const addQuestionsAfterPlaceholder = (current: Question[], next: Question[]) => {
  if (next.length === 0) return current;
  return current.length === 1 && isEmptyQuestion(current[0])
    ? next
    : [...current, ...next];
};

const apiJson = async <T,>(path: string, init: RequestInit = {}) => {
  const extraHeaders = (init.headers || {}) as Record<string, string>;
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...extraHeaders
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Request failed");
  return payload as T;
};

const toDateTimeLocal = (value?: string | Date | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const addMinutes = (value: string, minutes: number) => (
  new Date(new Date(value).getTime() + minutes * 60000)
);

const fmtDateTime = (value?: string | null) => (
  value
    ? new Date(value).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
    : "-"
);

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const filenamePart = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "") || "quiz";

const normalizePdfText = (value: unknown) => String(value ?? "")
  .replace(/[^\x20-\x7e]/g, "?")
  .replace(/\s+/g, " ")
  .trim();

const escapePdfText = (value: unknown) => normalizePdfText(value)
  .replace(/\\/g, "\\\\")
  .replace(/\(/g, "\\(")
  .replace(/\)/g, "\\)");

const truncatePdfText = (value: unknown, maxLength: number) => {
  const text = normalizePdfText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}.` : text;
};

const buildResultsPdf = (quiz: Quiz, rows: AttemptRow[]) => {
  const columns = [
    { label: "Student Name", x: 50, width: 170, max: 26 },
    { label: "Roll Number", x: 220, width: 95, max: 14 },
    { label: "Class", x: 315, width: 95, max: 14 },
    { label: "Total Marks", x: 410, width: 75, max: 10 },
    { label: "Obtained", x: 485, width: 77, max: 10 }
  ];
  const tableLeft = 50;
  const tableWidth = 512;
  const rowHeight = 24;
  const headerY = 616;
  const rowsPerPage = 22;
  const pages: AttemptRow[][] = [];

  for (let index = 0; index < rows.length; index += rowsPerPage) {
    pages.push(rows.slice(index, index + rowsPerPage));
  }
  if (pages.length === 0) pages.push([]);

  const textAt = (x: number, y: number, value: unknown, size = 10, font = "F1") => (
    `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`
  );
  const line = (x1: number, y1: number, x2: number, y2: number) => `${x1} ${y1} m ${x2} ${y2} l S`;
  const rect = (x: number, y: number, width: number, height: number) => `${x} ${y} ${width} ${height} re S`;

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const pageRefs: string[] = [];
  pages.forEach((pageRows, pageIndex) => {
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = pageObjectNumber + 1;
    pageRefs.push(`${pageObjectNumber} 0 R`);

    const tableTop = headerY + rowHeight;
    const tableBottom = headerY - (pageRows.length * rowHeight);
    const commands = [
      "0.10 0.12 0.16 RG",
      "0.10 0.12 0.16 rg",
      textAt(50, 744, `${quiz.title} - Results`, 18, "F2"),
      "0.28 0.33 0.42 rg",
      textAt(50, 722, `${quiz.subjectName || "General"}${quiz.className ? ` - ${quiz.className}` : ""}`, 10),
      textAt(50, 706, `Total Marks: ${quiz.totalMarks}`, 10),
      textAt(50, 690, `Generated: ${new Date().toLocaleString("en-GB")}`, 10),
      textAt(500, 690, `Page ${pageIndex + 1} of ${pages.length}`, 9),
      "0.86 0.90 0.95 RG",
      "0.95 0.98 1 rg",
      `${tableLeft} ${headerY} ${tableWidth} ${rowHeight} re f`,
      "0.78 0.84 0.90 RG",
      rect(tableLeft, tableBottom, tableWidth, tableTop - tableBottom),
      line(tableLeft, headerY, tableLeft + tableWidth, headerY),
      ...columns.slice(1).map((column) => line(column.x, tableBottom, column.x, tableTop)),
      "0.10 0.12 0.16 rg",
      ...columns.map((column) => textAt(column.x + 8, headerY + 8, column.label, 9, "F2"))
    ];

    pageRows.forEach((row, rowIndex) => {
      const y = headerY - ((rowIndex + 1) * rowHeight);
      const values = [
        truncatePdfText(row.participantName, columns[0].max),
        truncatePdfText(row.rollNumber, columns[1].max),
        truncatePdfText(row.className, columns[2].max),
        truncatePdfText(quiz.totalMarks, columns[3].max),
        truncatePdfText(row.totalScore ?? "", columns[4].max)
      ];

      commands.push("0.91 0.94 0.97 RG");
      commands.push(line(tableLeft, y, tableLeft + tableWidth, y));
      commands.push("0.15 0.18 0.25 rg");
      values.forEach((value, columnIndex) => {
        commands.push(textAt(columns[columnIndex].x + 8, y + 8, value, 9));
      });
    });

    if (pageRows.length === 0) {
      commands.push("0.45 0.50 0.58 rg");
      commands.push(textAt(tableLeft + 8, headerY - 18, "No student results recorded yet.", 10));
    }

    const content = commands.join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;

  const offsets = [0];
  let pdf = "%PDF-1.4\n";
  objects.forEach((object, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
};

const printQuiz = async (quiz: Quiz) => {
  const fullQuiz = quiz.questions
    ? quiz
    : (await apiJson<{ data: Quiz }>(`/api/teacher/quizzes/${quiz.id}`)).data;

  const questions = fullQuiz.questions || [];
  const html = `<!doctype html>
<html>
<head>
  <title>${escapeHtml(fullQuiz.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
    header { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    .meta, .lineup { color: #475569; font-size: 13px; }
    .lineup { display: flex; gap: 24px; margin: 18px 0 26px; flex-wrap: wrap; }
    .blank { border-bottom: 1px solid #111827; min-width: 190px; display: inline-block; height: 18px; }
    .question { break-inside: avoid; margin: 0 0 22px; }
    .question-title { font-weight: 700; margin-bottom: 8px; }
    .options { margin-top: 8px; display: grid; gap: 6px; }
    .option { display: flex; gap: 8px; align-items: flex-start; }
    .box { width: 12px; height: 12px; border: 1px solid #111827; margin-top: 2px; flex: 0 0 auto; }
    .answer-lines { margin-top: 10px; display: grid; gap: 12px; }
    .line { border-bottom: 1px solid #94a3b8; height: 22px; }
    @page { margin: 18mm; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(fullQuiz.title)}</h1>
    <div class="meta">${escapeHtml(fullQuiz.subjectName || "Quiz")} ${fullQuiz.className ? "- " + escapeHtml(fullQuiz.className) : ""} - ${escapeHtml(fullQuiz.totalMarks)} marks</div>
  </header>
  <div class="lineup">
    <span>Name: <span class="blank"></span></span>
    <span>Roll No: <span class="blank"></span></span>
    <span>Class: <span class="blank"></span></span>
  </div>
  ${questions.map((question, index) => `
    <section class="question">
      <div class="question-title">Q${index + 1}. ${escapeHtml(question.questionText)} (${escapeHtml(question.marks)} mark${Number(question.marks) === 1 ? "" : "s"})</div>
      <div class="options">${(question.options || []).map((option, optionIndex) => `<div class="option"><span class="box"></span><span>${String.fromCharCode(65 + optionIndex)}. ${escapeHtml(option)}</span></div>`).join("")}</div>
    </section>
  `).join("")}
</body>
</html>`;

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert("Allow pop-ups to print this quiz.");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

const statusClass = (status: Quiz["status"]) => {
  if (status === "PUBLISHED") return "status-pill status-published";
  if (status === "CLOSED") return "status-pill status-closed";
  return "status-pill status-draft";
};

function QuizModal({
  initial,
  onClose,
  onSaved
}: {
  initial?: Quiz | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: initial?.title || "",
    description: initial?.description || "",
    subjectName: initial?.subjectName || "",
    className: initial?.className || "",
    deliveryMode: initial?.deliveryMode || "ONLINE",
    status: initial?.status || "DRAFT",
    startAt: toDateTimeLocal(initial?.startAt || new Date()),
    durationMinutes: initial?.durationMinutes || 30,
    shuffleQuestions: initial?.shuffleQuestions || false,
    maxViolations: initial?.maxViolations || 3,
    allowReview: initial?.allowReview ?? true
  });
  const [questions, setQuestions] = useState<Question[]>(initial?.questions || [emptyQuestion()]);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiOptions, setAiOptions] = useState({
    questionCount: 5,
    mix: "BALANCED",
    difficulty: "MIXED",
    marksPerQuestion: 1
  });

  const set = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  const updateQuestion = (index: number, next: Question) => {
    setQuestions((current) => current.map((question, itemIndex) => (itemIndex === index ? next : question)));
  };

  const removeQuestion = (index: number) => {
    setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const addQuestion = (type: QuestionType = "MCQ") => {
    setQuestions((current) => [...current, emptyQuestion(type)]);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiJson<{ count: number; data: Question[] }>("/api/teacher/import", {
        method: "POST",
        body: formData
      });
      setQuestions((current) => addQuestionsAfterPlaceholder(current, response.data));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = async () => {
    const response = await fetch("/api/teacher/import/template");
    if (!response.ok) {
      alert("Failed to download template");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "quiz_import_template.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const generateWithAI = async () => {
    if (aiPrompt.trim().length < 10) {
      alert("Describe the quiz in at least 10 characters.");
      return;
    }

    try {
      const response = await apiJson<{ data: { questions: Question[] } }>("/api/teacher/ai/generate", {
        method: "POST",
        body: JSON.stringify({
          subjectName: form.subjectName,
          className: form.className,
          prompt: aiPrompt,
          ...aiOptions,
          existingQuestionTexts: questions.map((question) => question.questionText)
        })
      });
      const existingTexts = new Set(questions.map((question) => question.questionText.trim().toLowerCase()));
      const unique = response.data.questions.filter((question) => (
        !existingTexts.has(question.questionText.trim().toLowerCase())
      ));
      setQuestions((current) => addQuestionsAfterPlaceholder(current, unique));
      setAiOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "AI generation failed");
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!form.title.trim() || !form.startAt || questions.length === 0) {
      alert("Title, schedule, and at least one question are required.");
      return;
    }

    setSaving(true);
    try {
      const duration = Number(form.durationMinutes);
      const endAt = addMinutes(form.startAt, duration);
      const payload = {
        ...form,
        durationMinutes: duration,
        startAt: new Date(form.startAt).toISOString(),
        endAt: endAt.toISOString(),
        deliveryMode: form.deliveryMode,
        shuffleQuestions: form.deliveryMode === "ONLINE" ? form.shuffleQuestions : false,
        allowReview: form.deliveryMode === "ONLINE" ? form.allowReview : false,
        questions
      };

      await apiJson(initial ? `/api/teacher/quizzes/${initial.id}` : "/api/teacher/quizzes", {
        method: initial ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      onSaved();
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save quiz");
    } finally {
      setSaving(false);
    }
  };

  const totalMarks = questions.reduce((sum, question) => sum + Number(question.marks || 0), 0);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal-card" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <h2>{initial ? "Edit Quiz" : "Create Quiz"}</h2>
            <p className="muted">{questions.length} questions, {totalMarks} marks</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-grid">
            <label>
              Title
              <input value={form.title} onChange={(event) => set("title", event.target.value)} required />
            </label>
            <label>
              Subject
              <input value={form.subjectName} onChange={(event) => set("subjectName", event.target.value)} />
            </label>
            <label>
              Class
              <input value={form.className} onChange={(event) => set("className", event.target.value)} />
            </label>
            <label>
              Delivery
              <select value={form.deliveryMode} onChange={(event) => set("deliveryMode", event.target.value)}>
                <option value="ONLINE">Online link</option>
                <option value="OFFLINE">Printed/offline</option>
              </select>
            </label>
            <label>
              Start
              <input
                type="datetime-local"
                value={form.startAt}
                onChange={(event) => set("startAt", event.target.value)}
                required
              />
            </label>
            <label>
              Duration minutes
              <input
                type="number"
                min="1"
                max="1440"
                value={form.durationMinutes}
                onChange={(event) => set("durationMinutes", Number(event.target.value))}
              />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(event) => set("status", event.target.value)}>
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="CLOSED">Closed</option>
              </select>
            </label>
            <label>
              Max violations
              <input
                type="number"
                min="1"
                max="100"
                value={form.maxViolations}
                disabled={form.deliveryMode === "OFFLINE"}
                onChange={(event) => set("maxViolations", Number(event.target.value))}
              />
            </label>
            <label className="wide">
              Description
              <textarea
                value={form.description}
                rows={2}
                onChange={(event) => set("description", event.target.value)}
              />
            </label>
          </div>

          {form.deliveryMode === "ONLINE" && (
            <div className="actions-row" style={{ marginTop: 14 }}>
              <label style={{ display: "inline-flex", gridAutoFlow: "column", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.shuffleQuestions}
                  onChange={(event) => set("shuffleQuestions", event.target.checked)}
                />
                Shuffle questions
              </label>
              <label style={{ display: "inline-flex", gridAutoFlow: "column", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.allowReview}
                  onChange={(event) => set("allowReview", event.target.checked)}
                />
                Release review after close
              </label>
            </div>
          )}

          <div className="actions-row" style={{ marginTop: 18 }}>
            <button type="button" className="secondary-button" onClick={() => setAiOpen((open) => !open)}>
              <Brain size={16} /> AI questions
            </button>
            <button type="button" className="ghost-button" onClick={downloadTemplate}>
              <Download size={16} /> Sample sheet
            </button>
            <label className="ghost-button" style={{ display: "inline-flex" }}>
              {importing ? <Loader2 size={16} className="spin" /> : <FileSpreadsheet size={16} />}
              Import sheet
              <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleImport} />
            </label>
            <button type="button" className="primary-button" onClick={() => addQuestion("MCQ")}>
              <Plus size={16} /> Add question
            </button>
          </div>

          {aiOpen && (
            <div className="ai-panel">
              <div className="form-stack">
                <label>
                  AI prompt
                  <textarea
                    value={aiPrompt}
                    rows={3}
                    maxLength={10000}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    placeholder="Create conceptual questions about database normalization for first-year students."
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Count
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={aiOptions.questionCount}
                      onChange={(event) => setAiOptions((current) => ({ ...current, questionCount: Number(event.target.value) }))}
                    />
                  </label>
                  <label>
                    Mix
                    <select
                      value={aiOptions.mix}
                      onChange={(event) => setAiOptions((current) => ({ ...current, mix: event.target.value }))}
                    >
                      <option value="BALANCED">Balanced</option>
                      <option value="MCQ_ONLY">MCQ only</option>
                      <option value="MCQ_TRUE_FALSE">MCQ + true/false</option>
                    </select>
                  </label>
                  <label>
                    Difficulty
                    <select
                      value={aiOptions.difficulty}
                      onChange={(event) => setAiOptions((current) => ({ ...current, difficulty: event.target.value }))}
                    >
                      <option value="MIXED">Mixed</option>
                      <option value="EASY">Easy</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HARD">Hard</option>
                    </select>
                  </label>
                  <label>
                    Marks each
                    <input
                      type="number"
                      min="0.5"
                      max="100"
                      step="0.5"
                      value={aiOptions.marksPerQuestion}
                      onChange={(event) => setAiOptions((current) => ({ ...current, marksPerQuestion: Number(event.target.value) }))}
                    />
                  </label>
                </div>
                <button type="button" className="secondary-button" onClick={generateWithAI}>
                  <Brain size={16} /> Generate and add
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <h3>Questions</h3>
            {questions.map((question, index) => (
              <QuestionEditor
                key={index}
                question={question}
                index={index}
                onChange={(next) => updateQuestion(index, next)}
                onRemove={() => removeQuestion(index)}
              />
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            Save quiz
          </button>
        </div>
      </form>
    </div>
  );
}

function QuestionEditor({
  question,
  index,
  onChange,
  onRemove
}: {
  question: Question;
  index: number;
  onChange: (question: Question) => void;
  onRemove: () => void;
}) {
  const set = (key: keyof Question, value: Question[keyof Question]) => onChange({ ...question, [key]: value });

  const switchType = (type: QuestionType) => {
    onChange(emptyQuestion(type));
  };

  return (
    <section className="question-card">
      <div className="quiz-card-header">
        <strong>Q{index + 1}</strong>
        <button type="button" className="icon-button" onClick={onRemove} aria-label="Remove question">
          <Trash2 size={16} />
        </button>
      </div>
      <div className="form-grid">
        <label>
          Type
          <select value={question.type} onChange={(event) => switchType(event.target.value as QuestionType)}>
            <option value="MCQ">Multiple choice</option>
            <option value="TRUE_FALSE">True/false</option>

          </select>
        </label>
        <label>
          Marks
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={question.marks}
            onChange={(event) => set("marks", Number(event.target.value))}
          />
        </label>
        <label className="wide">
          Question text
          <textarea
            rows={2}
            value={question.questionText}
            onChange={(event) => set("questionText", event.target.value)}
          />
        </label>
      </div>

      {question.type === "MCQ" && (
        <div className="options-grid" style={{ marginTop: 12 }}>
          {question.options.map((option, optionIndex) => (
            <label key={optionIndex} className="answer-option">
              <input
                type="radio"
                name={`correct-${index}`}
                checked={Number(question.correctAnswer) === optionIndex}
                onChange={() => set("correctAnswer", optionIndex)}
              />
              <span>{String.fromCharCode(65 + optionIndex)}</span>
              <input
                value={option}
                onChange={(event) => {
                  const nextOptions = [...question.options];
                  nextOptions[optionIndex] = event.target.value;
                  set("options", nextOptions);
                }}
              />
            </label>
          ))}
        </div>
      )}

      {question.type === "TRUE_FALSE" && (
        <div className="actions-row" style={{ marginTop: 12 }}>
          <label style={{ display: "inline-flex", gridAutoFlow: "column", alignItems: "center" }}>
            <input
              type="radio"
              name={`tf-${index}`}
              checked={Number(question.correctAnswer) === 0}
              onChange={() => set("correctAnswer", 0)}
            />
            True
          </label>
          <label style={{ display: "inline-flex", gridAutoFlow: "column", alignItems: "center" }}>
            <input
              type="radio"
              name={`tf-${index}`}
              checked={Number(question.correctAnswer) === 1}
              onChange={() => set("correctAnswer", 1)}
            />
            False
          </label>
        </div>
      )}
    </section>
  );
}

function AttemptsModal({
  quiz,
  onClose,
  onChanged
}: {
  quiz: Quiz;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<AttemptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [offlineForm, setOfflineForm] = useState({
    participantName: "",
    rollNumber: "",
    className: quiz.className || "",
    marksAwarded: ""
  });

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiJson<{ data: AttemptRow[] }>(`/api/teacher/quizzes/${quiz.id}/attempts`);
      setRows(response.data);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to load attempts");
    } finally {
      setLoading(false);
    }
  }, [quiz.id]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const saveOfflineMark = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiJson(`/api/teacher/quizzes/${quiz.id}/offline-marks`, {
        method: "PUT",
        body: JSON.stringify({
          ...offlineForm,
          marksAwarded: Number(offlineForm.marksAwarded)
        })
      });
      setOfflineForm({ participantName: "", rollNumber: "", className: quiz.className || "", marksAwarded: "" });
      await loadRows();
      onChanged();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save offline mark");
    }
  };

  const downloadResultsSheet = () => {
    if (rows.length === 0) {
      alert("No student results to download yet.");
      return;
    }

    const blob = buildResultsPdf(quiz, rows);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filenamePart(quiz.title)}-results.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (selectedAttemptId) {
    return (
      <AttemptDetailModal
        attemptId={selectedAttemptId}
        onBack={() => setSelectedAttemptId(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <h2>{quiz.title}</h2>
            <p className="muted">{rows.length} recorded {quiz.deliveryMode === "OFFLINE" ? "marks" : "attempts"}</p>
          </div>
          <div className="actions-row">
            <button type="button" className="secondary-button" onClick={downloadResultsSheet} disabled={loading || rows.length === 0}>
              <Download size={16} /> Download PDF
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {quiz.deliveryMode === "OFFLINE" && (
            <form className="filter-panel" onSubmit={saveOfflineMark}>
              <input
                placeholder="Student name"
                value={offlineForm.participantName}
                onChange={(event) => setOfflineForm((current) => ({ ...current, participantName: event.target.value }))}
                required
              />
              <input
                placeholder="Roll number"
                value={offlineForm.rollNumber}
                onChange={(event) => setOfflineForm((current) => ({ ...current, rollNumber: event.target.value }))}
                required
              />
              <input
                placeholder="Class"
                value={offlineForm.className}
                onChange={(event) => setOfflineForm((current) => ({ ...current, className: event.target.value }))}
                required
              />
              <input
                type="number"
                min="0"
                max={quiz.totalMarks}
                step="0.5"
                placeholder={`Marks / ${quiz.totalMarks}`}
                value={offlineForm.marksAwarded}
                onChange={(event) => setOfflineForm((current) => ({ ...current, marksAwarded: event.target.value }))}
                required
              />
              <button type="submit" className="primary-button">
                <Save size={16} /> Save mark
              </button>
            </form>
          )}

          {loading ? (
            <p className="muted"><Loader2 size={16} className="spin" /> Loading attempts...</p>
          ) : (
            <div className="attempt-list">
              {rows.length === 0 && <p className="muted">No data recorded yet.</p>}
              {rows.map((row) => (
                <div key={row.id} className="attempt-row">
                  <div>
                    <strong>{row.participantName}</strong>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      {row.rollNumber} - {row.className} - {row.status}
                    </p>
                  </div>
                  <div className="actions-row">
                    <span className="status-pill mode-online">
                      {row.totalScore ?? "-"} / {quiz.totalMarks}
                    </span>

                    {quiz.deliveryMode === "ONLINE" && <span className="muted">{row.violations} violations</span>}
                    <button type="button" className="secondary-button" onClick={() => setSelectedAttemptId(row.id)}>
                      <Eye size={16} /> View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AttemptDetailModal({
  attemptId,
  onBack,
  onClose,
}: {
  attemptId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiJson<{ data: AttemptDetail }>(`/api/teacher/attempts/${attemptId}`);
      setDetail(response.data);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to load attempt");
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);


  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <button type="button" className="ghost-button" onClick={onBack}>Back</button>
            <h2 style={{ marginTop: 10 }}>Attempt detail</h2>
            {detail && (
              <p className="muted">
                {detail.participantName} - {detail.rollNumber} - {detail.className} - {detail.totalScore} / {detail.quiz.totalMarks}
              </p>
            )}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {loading || !detail ? (
            <p className="muted"><Loader2 size={16} className="spin" /> Loading attempt...</p>
          ) : (
            detail.quiz.questions.map((question, index) => {
              const answer = detail.answers.find((item) => item.questionId === question.id);

              return (
                <section key={question.id || index} className="question-card">
                  <div className="quiz-card-header">
                    <strong>Q{index + 1} - {question.type} - {question.marks} marks</strong>
                    <span className="status-pill mode-online">{answer?.marksAwarded ?? 0} / {question.marks}</span>
                  </div>
                  <p>{question.questionText}</p>

                  <div className="options-grid">
                    {question.options.map((option, optionIndex) => (
                      <div key={optionIndex} className={`choice ${Number(answer?.answer) === optionIndex ? "selected" : ""}`}>
                        <span />
                        <strong>{String.fromCharCode(65 + optionIndex)}</strong>
                        <span>
                          {option}
                          {Number(question.correctAnswer) === optionIndex ? " (correct)" : ""}
                          {Number(answer?.answer) === optionIndex ? " (selected)" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeacherDashboard({ teacherEmail }: { teacherEmail: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [mode, setMode] = useState("ALL");
  const [editing, setEditing] = useState<Quiz | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [attemptQuiz, setAttemptQuiz] = useState<Quiz | null>(null);

  const loadQuizzes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiJson<{ data: Quiz[] }>("/api/teacher/quizzes");
      setQuizzes(response.data);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to load quizzes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuizzes();
  }, [loadQuizzes]);

  const openEdit = async (quiz: Quiz) => {
    try {
      const response = await apiJson<{ data: Quiz }>(`/api/teacher/quizzes/${quiz.id}`);
      setEditing(response.data);
      setShowModal(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to open quiz");
    }
  };

  const deleteQuiz = async (quiz: Quiz) => {
    if (!window.confirm(`Delete "${quiz.title}" and all attempt data?`)) return;
    try {
      await apiJson(`/api/teacher/quizzes/${quiz.id}`, { method: "DELETE" });
      await loadQuizzes();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete quiz");
    }
  };

  const copyLink = async (quiz: Quiz) => {
    const url = `${window.location.origin}/q/${quiz.shareToken}`;
    await navigator.clipboard.writeText(url);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const filtered = quizzes.filter((quiz) => {
    const query = search.trim().toLowerCase();
    const matchesQuery = !query ||
      quiz.title.toLowerCase().includes(query) ||
      String(quiz.subjectName || "").toLowerCase().includes(query) ||
      String(quiz.className || "").toLowerCase().includes(query);
    const matchesStatus = status === "ALL" || quiz.status === status;
    const matchesMode = mode === "ALL" || quiz.deliveryMode === mode;
    return matchesQuery && matchesStatus && matchesMode;
  });

  const totals = {
    all: quizzes.length,
    online: quizzes.filter((quiz) => quiz.deliveryMode === "ONLINE").length,
    offline: quizzes.filter((quiz) => quiz.deliveryMode === "OFFLINE").length,
    attempts: quizzes.reduce((sum, quiz) => sum + Number(quiz._count?.attempts || 0), 0)
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-row">
          <div className="brand-mark"><BookOpenCheck size={24} /></div>
          <div>
            <strong>Quiz System</strong>
            <p className="muted" style={{ margin: 0 }}>{teacherEmail}</p>
          </div>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setEditing(null);
              setShowModal(true);
            }}
          >
            <Plus size={16} /> Create quiz
          </button>
          <button type="button" className="ghost-button" onClick={signOut}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      <div className="content">
        <div className="summary-grid">
          <div className="summary-tile"><span className="muted">Quizzes</span><strong>{totals.all}</strong></div>
          <div className="summary-tile"><span className="muted">Online</span><strong>{totals.online}</strong></div>
          <div className="summary-tile"><span className="muted">Offline</span><strong>{totals.offline}</strong></div>
          <div className="summary-tile"><span className="muted">Submissions</span><strong>{totals.attempts}</strong></div>
        </div>

        <div className="filter-panel">
          <label>
            Search
            <span style={{ position: "relative" }}>
              <Search size={16} style={{ position: "absolute", left: 10, top: 11, color: "#94a3b8" }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={{ paddingLeft: 34 }}
              />
            </span>
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="ALL">All</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="CLOSED">Closed</option>
            </select>
          </label>
          <label>
            Mode
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="ALL">All</option>
              <option value="ONLINE">Online</option>
              <option value="OFFLINE">Offline</option>
            </select>
          </label>
        </div>

        {loading ? (
          <p className="muted"><Loader2 size={16} className="spin" /> Loading quizzes...</p>
        ) : filtered.length === 0 ? (
          <section className="public-panel" style={{ width: "100%" }}>
            <h2>No quizzes yet</h2>
            <p className="muted">Create a quiz manually, generate questions with AI, or import a sheet.</p>
            <button type="button" className="primary-button" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Create quiz
            </button>
          </section>
        ) : (
          <div className="quiz-list">
            {filtered.map((quiz) => (
              <article key={quiz.id} className="quiz-card">
                <div className="quiz-card-header">
                  <div>
                    <div className="meta-row">
                      <h2 style={{ margin: 0 }}>{quiz.title}</h2>
                      <span className={statusClass(quiz.status)}>{quiz.status}</span>
                      <span className={`status-pill ${quiz.deliveryMode === "ONLINE" ? "mode-online" : "mode-offline"}`}>
                        {quiz.deliveryMode === "ONLINE" ? "Online" : "Printed/offline"}
                      </span>
                    </div>
                    <p className="muted" style={{ margin: "8px 0" }}>
                      {quiz.subjectName || "General"} {quiz.className ? `- ${quiz.className}` : ""}
                    </p>
                    <div className="meta-row muted">
                      <span><Award size={14} /> {quiz.totalMarks} marks</span>
                      <span>{quiz.durationMinutes} min</span>
                      <span>{quiz._count?.questions || 0} questions</span>
                      <span>{quiz._count?.attempts || 0} submissions</span>
                      <span>{fmtDateTime(quiz.startAt)} to {fmtDateTime(quiz.endAt)}</span>
                    </div>
                  </div>
                  <div className="actions-row">
                    {quiz.deliveryMode === "ONLINE" && (
                      <button type="button" className="icon-button" onClick={() => copyLink(quiz)} title="Copy public link">
                        <Clipboard size={16} />
                      </button>
                    )}
                    <button type="button" className="icon-button" onClick={() => printQuiz(quiz)} title="Print">
                      <Printer size={16} />
                    </button>
                    <button type="button" className="icon-button" onClick={() => setAttemptQuiz(quiz)} title="Results">
                      <Eye size={16} />
                    </button>
                    <button type="button" className="icon-button" onClick={() => openEdit(quiz)} title="Edit">
                      <Pencil size={16} />
                    </button>
                    <button type="button" className="icon-button" onClick={() => deleteQuiz(quiz)} title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <QuizModal
          initial={editing}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
          onSaved={loadQuizzes}
        />
      )}

      {attemptQuiz && (
        <AttemptsModal
          quiz={attemptQuiz}
          onClose={() => setAttemptQuiz(null)}
          onChanged={loadQuizzes}
        />
      )}
    </main>
  );
}
