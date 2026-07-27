import { useEffect } from "react";

interface QuestCompleteAnimationProps {
  visible: boolean;
  title: string;
  awardedXp: number;
  doubleXp: boolean;
  onFinished: () => void;
}

export default function QuestCompleteAnimation({
  visible,
  title,
  awardedXp,
  doubleXp,
  onFinished
}: QuestCompleteAnimationProps) {
  useEffect(() => {
    if (!visible) {
      return;
    }

    const timer = window.setTimeout(
      onFinished,
      1600
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [visible, onFinished]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="quest-complete-overlay"
      role="status"
      aria-live="polite"
    >
      <div className="quest-complete-burst">
        <div className="quest-complete-stars">
          ✦ ✧ ✦
        </div>

        <strong className="quest-complete-title">
          QUEST COMPLETE!
        </strong>

        <span className="quest-complete-name">
          {title}
        </span>

        <div className="quest-complete-xp">
          +{awardedXp} XP
        </div>

        {doubleXp && (
          <div className="quest-complete-double">
            ✨ DOUBLE XP ✨
          </div>
        )}
      </div>
    </div>
  );
}