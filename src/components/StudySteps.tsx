"use client";

import { useState } from "react";
import { WordStudyStep1, type StudyCard } from "@/components/WordStudyStep1";
import { MatchGame } from "@/components/MatchGame";
import { WordDictationStep3 } from "@/components/WordDictationStep3";
import { QuizGame } from "@/components/QuizGame";
import { WordWritingStep5 } from "@/components/WordWritingStep5";

export function StudySteps({
  assessmentId,
  title,
  cards,
}: {
  assessmentId: string;
  title: string;
  cards: StudyCard[];
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className={`btn ${step === 1 ? "" : "secondary"}`} type="button" onClick={() => setStep(1)}>1단계 · 듣기</button>
        <button className={`btn ${step === 2 ? "" : "secondary"}`} type="button" onClick={() => setStep(2)}>2단계 · 매칭</button>
        <button className={`btn ${step === 3 ? "" : "secondary"}`} type="button" onClick={() => setStep(3)}>3단계 · 딕테이션</button>
        <button className={`btn ${step === 4 ? "" : "secondary"}`} type="button" onClick={() => setStep(4)}>4단계 · 스피드 퀴즈</button>
        <button className={`btn ${step === 5 ? "" : "secondary"}`} type="button" onClick={() => setStep(5)}>5단계 · Writing</button>
      </div>
      {step === 1 ? (
        <WordStudyStep1 assessmentId={assessmentId} cards={cards} />
      ) : step === 2 ? (
        <MatchGame assessmentId={assessmentId} title={title} cards={cards} />
      ) : step === 3 ? (
        <WordDictationStep3 assessmentId={assessmentId} cards={cards} />
      ) : step === 4 ? (
        <QuizGame assessmentId={assessmentId} title={title} speed />
      ) : (
        <WordWritingStep5 assessmentId={assessmentId} cards={cards} />
      )}
    </div>
  );
}
