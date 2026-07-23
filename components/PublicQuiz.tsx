"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  ShieldAlert
} from "lucide-react";

type PublicMeta = {
  id: string;
  title: string;
  description?: string | null;
  subjectName?: string | null;
  className?: string | null;
  totalMarks: number;
  durationMinutes: number;
  startAt: string;
  endAt: string;
  maxViolations: number;
  questionCount: number;
  state: "OPEN" | "UPCOMING" | "CLOSED" | "DRAFT" | "OFFLINE";
};

type PublicQuestion = {
  id: string;
  type: "MCQ" | "TRUE_FALSE";
  questionText: string;
  options: string[];
  marks: number;
  orderIndex: number;
};

type QuizSession = {
  attemptId: string;
  attemptToken: string;
  quiz: {
    id: string;
    title: string;
    description?: string | null;
    totalMarks: number;
    durationMinutes: number;
    maxViolations: number;
    startAt: string;
    endAt: string;
  };
  questions: PublicQuestion[];
  savedAnswers: { questionId: string; answer: unknown }[];
  deadline: string;
  violations: number;
};

type ResultData = {
  attemptId: string;
  status: string;
  totalScore: number;
  totalMarks: number;
  violations: number;
  allowReview: boolean;
  reviewAvailableAt?: string | null;
  questions?: (PublicQuestion & {
    correctAnswer: number | string;
    yourAnswer: unknown;
    isCorrect: boolean | null;
    marksAwarded: number;
    feedback?: string | null;
  })[];
};

const apiJson = async <T,>(path: string, init: RequestInit = {}) => {
  const extraHeaders = (init.headers || {}) as Record<string, string>;
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Request failed");
  return payload as T;
};

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

const tokenKey = (shareToken: string, rollNumber: string, className: string) => (
  `quiz-attempt:${shareToken}:${rollNumber.trim().toLowerCase()}:${className.trim().toLowerCase()}`
);

function QuizRunner({
  session,
  onSubmitted
}: {
  session: QuizSession;
  onSubmitted: (attemptId: string, attemptToken: string, auto: boolean) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const map: Record<string, unknown> = {};
    session.savedAnswers.forEach((answer) => {
      map[answer.questionId] = answer.answer;
    });
    return map;
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(
    Math.max(0, Math.floor((new Date(session.deadline).getTime() - Date.now()) / 1000))
  );
  const [violations, setViolations] = useState(session.violations || 0);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blurWarnedRef = useRef(false);

  const submit = useCallback(async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const finalAnswers = Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer }));
      await apiJson(`/api/public/attempts/${session.attemptId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          attemptToken: session.attemptToken,
          answers: finalAnswers
        })
      });
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      onSubmitted(session.attemptId, session.attemptToken, auto);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to submit quiz");
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [answers, onSubmitted, session.attemptId, session.attemptToken]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          submit(true);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [submit]);

  const reportViolation = useCallback(async (type: string) => {
    if (submittedRef.current) return;
    try {
      const response = await apiJson<{ data: { autoSubmitted: boolean; violations?: number; max?: number } }>(
        `/api/public/attempts/${session.attemptId}/violation`,
        {
          method: "POST",
          body: JSON.stringify({ attemptToken: session.attemptToken, type })
        }
      );
      if (response.data.autoSubmitted) {
        submittedRef.current = true;
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
        onSubmitted(session.attemptId, session.attemptToken, true);
      } else if (response.data.violations !== undefined) {
        setViolations(response.data.violations);
      }
    } catch {
      // Losing a violation log should not interrupt typing an answer.
    }
  }, [onSubmitted, session.attemptId, session.attemptToken]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) reportViolation("TAB_SWITCH");
    };
    const handleBlur = () => {
      if (!blurWarnedRef.current) {
        blurWarnedRef.current = true;
        return;
      }
      reportViolation("WINDOW_BLUR");
    };
    const handleContextMenu = (event: MouseEvent) => event.preventDefault();
    const handleKeyDown = (event: KeyboardEvent) => {
      const blocked =
        event.key === "F12" ||
        (event.ctrlKey && event.shiftKey && ["I", "J", "C"].includes(event.key.toUpperCase())) ||
        (event.ctrlKey && ["U", "S", "P"].includes(event.key.toUpperCase()));
      if (blocked) {
        event.preventDefault();
        reportViolation("BLOCKED_SHORTCUT");
      }
    };
    const blockClipboard = (event: ClipboardEvent) => {
      event.preventDefault();
      reportViolation("CLIPBOARD");
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("copy", blockClipboard);
    document.addEventListener("paste", blockClipboard);
    document.addEventListener("cut", blockClipboard);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("copy", blockClipboard);
      document.removeEventListener("paste", blockClipboard);
      document.removeEventListener("cut", blockClipboard);
    };
  }, [reportViolation]);

  useEffect(() => {
    const enterFullscreen = async () => {
      if (containerRef.current && !document.fullscreenElement) {
        await containerRef.current.requestFullscreen().catch(() => undefined);
      }
    };
    enterFullscreen();

    const handleFullscreen = () => {
      if (!document.fullscreenElement && !submittedRef.current) {
        reportViolation("FULLSCREEN_EXIT");
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, [reportViolation]);

  const saveAnswer = async (questionId: string, answer: unknown) => {
    setAnswers((current) => ({ ...current, [questionId]: answer }));
    try {
      await apiJson(`/api/public/attempts/${session.attemptId}/answer`, {
        method: "PUT",
        body: JSON.stringify({
          attemptToken: session.attemptToken,
          questionId,
          answer
        })
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("deadline")) {
        onSubmitted(session.attemptId, session.attemptToken, true);
      }
    }
  };

  const formatTime = (seconds: number) => (
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  );
  const question = session.questions[currentIndex];
  const answered = (questionId: string) => {
    const answer = answers[questionId];
    return answer !== undefined && answer !== null && String(answer).trim() !== "";
  };

  return (
    <div ref={containerRef} className="quiz-runner">
      <div className="runner-topbar">
        <div>
          <h2 style={{ margin: 0 }}>{session.quiz.title}</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Question {currentIndex + 1} of {session.questions.length}
          </p>
        </div>
        <div className="actions-row">
          <span className={`timer ${timeLeft < 60 ? "warning" : ""}`}><Clock size={16} /> {formatTime(timeLeft)}</span>
          {violations > 0 && <span className="status-pill status-draft"><ShieldAlert size={14} /> {violations}/{session.quiz.maxViolations}</span>}
          <button type="button" className="primary-button" disabled={submitting} onClick={() => submit(false)}>
            {submitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Submit
          </button>
        </div>
      </div>

      <div className="runner-grid">
        <aside className="navigator">
          <h3>Questions</h3>
          <div className="nav-buttons">
            {session.questions.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`${index === currentIndex ? "active" : ""} ${answered(item.id) ? "answered" : ""}`}
                onClick={() => setCurrentIndex(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </aside>

        <section className="question-surface">
          <div className="quiz-card-header">
            <strong>{question.type} - {question.marks} marks</strong>
            <span className="muted">Q{currentIndex + 1}</span>
          </div>
          <p style={{ fontSize: 18, lineHeight: 1.6 }}>{question.questionText}</p>

          <div>
            {question.options.map((option, index) => (
              <label key={index} className={`choice ${answers[question.id] === index ? "selected" : ""}`}>
                <input
                  type="radio"
                  name={question.id}
                  checked={answers[question.id] === index}
                  onChange={() => saveAnswer(question.id, index)}
                />
                <strong>{String.fromCharCode(65 + index)}</strong>
                <span>{option}</span>
              </label>
            ))}
          </div>

          <div className="modal-footer" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <button
              type="button"
              className="ghost-button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={currentIndex === session.questions.length - 1}
              onClick={() => setCurrentIndex((index) => Math.min(session.questions.length - 1, index + 1))}
            >
              Next
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function ResultScreen({
  attemptId,
  attemptToken,
  onReset
}: {
  attemptId: string;
  attemptToken: string;
  onReset: () => void;
}) {
  const [result, setResult] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson<{ data: ResultData }>(
      `/api/public/attempts/${attemptId}/result?token=${encodeURIComponent(attemptToken)}`
    )
      .then((response) => setResult(response.data))
      .finally(() => setLoading(false));
  }, [attemptId, attemptToken]);

  if (loading) {
    return (
      <main className="public-shell">
        <section className="public-panel"><Loader2 className="spin" /> Loading result...</section>
      </main>
    );
  }

  if (!result) return null;
  const pct = result.totalMarks > 0 ? Math.round((result.totalScore / result.totalMarks) * 1000) / 10 : 0;

  return (
    <main className="public-shell">
      <section className="public-panel" style={{ width: "min(100%, 760px)" }}>
        <CheckCircle2 size={48} color="#0f9f6e" />
        <h1>{result.status === "AUTO_SUBMITTED" ? "Quiz Auto-Submitted" : "Quiz Submitted"}</h1>
        <div className="result-card">
          <strong style={{ fontSize: 42 }}>{result.totalScore} / {result.totalMarks}</strong>
          <p className="muted">{pct}%</p>
        </div>
        {result.violations > 0 && (
          <p className="notice"><AlertTriangle size={16} /> {result.violations} violation(s) recorded.</p>
        )}
        {!result.allowReview && result.reviewAvailableAt && (
          <p className="muted">Answer review opens after {fmtDateTime(result.reviewAvailableAt)}.</p>
        )}

        {result.allowReview && result.questions && (
          <div className="form-stack" style={{ marginTop: 18 }}>
            {result.questions.map((question, index) => (
              <section key={question.id} className="question-card">
                <div className="quiz-card-header">
                  <strong>Q{index + 1} - {question.type}</strong>
                  <span className="status-pill mode-online">{question.marksAwarded} / {question.marks}</span>
                </div>
                <p>{question.questionText}</p>
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className={`choice ${Number(question.yourAnswer) === optionIndex ? "selected" : ""}`}>
                    <span />
                    <strong>{String.fromCharCode(65 + optionIndex)}</strong>
                    <span>
                      {option}
                      {Number(question.correctAnswer) === optionIndex ? " (correct)" : ""}
                      {Number(question.yourAnswer) === optionIndex ? " (your answer)" : ""}
                    </span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
        <button type="button" className="primary-button" onClick={onReset}>Done</button>
      </section>
    </main>
  );
}

export default function PublicQuiz({ token }: { token: string }) {
  const [meta, setMeta] = useState<PublicMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [identity, setIdentity] = useState({
    participantName: "",
    rollNumber: "",
    className: ""
  });
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [result, setResult] = useState<{ attemptId: string; attemptToken: string } | null>(null);

  const loadMeta = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiJson<{ data: PublicMeta }>(`/api/public/quizzes/${token}`);
      setMeta(response.data);
      setIdentity((current) => ({
        ...current,
        className: current.className || response.data.className || ""
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Quiz link not found");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const startQuiz = async (event: FormEvent) => {
    event.preventDefault();
    setStarting(true);
    setError("");

    try {
      const storedToken = localStorage.getItem(tokenKey(token, identity.rollNumber, identity.className)) || "";
      const response = await apiJson<{ data: QuizSession }>(`/api/public/quizzes/${token}/start`, {
        method: "POST",
        body: JSON.stringify({
          ...identity,
          attemptToken: storedToken
        })
      });
      localStorage.setItem(
        tokenKey(token, identity.rollNumber, identity.className),
        response.data.attemptToken
      );
      setSession(response.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to start quiz");
    } finally {
      setStarting(false);
    }
  };

  if (session) {
    return (
      <QuizRunner
        session={session}
        onSubmitted={(attemptId, attemptToken) => {
          setSession(null);
          setResult({ attemptId, attemptToken });
        }}
      />
    );
  }

  if (result) {
    return (
      <ResultScreen
        attemptId={result.attemptId}
        attemptToken={result.attemptToken}
        onReset={() => {
          setResult(null);
          loadMeta();
        }}
      />
    );
  }

  return (
    <main className="public-shell">
      <section className="public-panel">
        {loading ? (
          <p className="muted"><Loader2 size={16} className="spin" /> Loading quiz...</p>
        ) : meta ? (
          <>
            <div className="icon-tile"><Award size={24} /></div>
            <h1>{meta.title}</h1>
            <p className="muted">{meta.subjectName || "Quiz"} {meta.className ? `- ${meta.className}` : ""}</p>
            {meta.description && <p>{meta.description}</p>}

            <div className="summary-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              <div className="summary-tile"><span className="muted">Marks</span><strong>{meta.totalMarks}</strong></div>
              <div className="summary-tile"><span className="muted">Minutes</span><strong>{meta.durationMinutes}</strong></div>
              <div className="summary-tile"><span className="muted">Questions</span><strong>{meta.questionCount}</strong></div>
            </div>

            {meta.state !== "OPEN" ? (
              <p className="notice">
                {meta.state === "UPCOMING"
                  ? `This quiz opens at ${fmtDateTime(meta.startAt)}.`
                  : meta.state === "OFFLINE"
                    ? "This quiz is configured for printed/offline delivery."
                    : "This quiz is not open for attempts."}
              </p>
            ) : (
              <form className="form-stack" onSubmit={startQuiz}>
                <label>
                  Name
                  <input
                    value={identity.participantName}
                    onChange={(event) => setIdentity((current) => ({ ...current, participantName: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Roll number
                  <input
                    value={identity.rollNumber}
                    onChange={(event) => setIdentity((current) => ({ ...current, rollNumber: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Class
                  <input
                    value={identity.className}
                    onChange={(event) => setIdentity((current) => ({ ...current, className: event.target.value }))}
                    required
                  />
                </label>
                <button type="submit" className="primary-button" disabled={starting}>
                  {starting ? <Loader2 size={16} className="spin" /> : <Clock size={16} />} Start quiz
                </button>
              </form>
            )}
          </>
        ) : (
          <p className="error-note">{error || "Quiz link not found"}</p>
        )}

        {error && meta && <p className="error-note">{error}</p>}
      </section>
    </main>
  );
}
