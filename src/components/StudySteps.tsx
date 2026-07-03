"use client";

import { useState } from "react";
import { WordStudyStep1, type StudyCard } from "@/components/WordStudyStep1";
import { MatchGame } from "@/components/MatchGame";

export function StudySteps({
  assessmentId,
  title,
  cards,
}: {
  assessmentId: string;
  title: string;
  cards: StudyCard[];
}) {
  const [step, setStep] = useState<1 | 2>(1);
  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className={`btn ${step === 1 ? "" : "secondary"}`} type="button" onClick={() => setStep(1)}>1단계 · 듣기</button>
        <button className={`btn ${step === 2 ? "" : "secondary"}`} type="button" onClick={() => setStep(2)}>2단계 · 매칭</button>
      </div>
      {step === 1 ? (
        <WordStudyStep1 cards={cards} />
      ) : (
        <MatchGame assessmentId={assessmentId} title={title} cards={cards} />
      )}
    </div>
  );
}
