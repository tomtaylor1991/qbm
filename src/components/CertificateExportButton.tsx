import { useState } from "react";

import {
  exportAdventureCertificate,
  type CertificatePlayer
} from "../services/certificateService";

import type { Room } from "../services/roomService";
import type { Quest } from "../types/game";

interface CertificateExportButtonProps {
  room: Room;
  quests: Quest[];
  players: CertificatePlayer[];
}

export default function CertificateExportButton({
  room,
  quests,
  players
}: CertificateExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  if (room.currentXp < room.targetXp) {
    return null;
  }

  async function handleExport(): Promise<void> {
    try {
      setExporting(true);

      await exportAdventureCertificate({
        room,
        quests,
        players
      });
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Nem sikerült elkészíteni a kalandlevelet."
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="certificate-export-panel">
      <div className="certificate-export-icon">📜</div>

      <div className="certificate-export-content">
        <strong>A KALANDLEVÉL ELÉRHETŐ</strong>

        <p>
          A győzelmi cél teljesült. Exportáld az este
          RPG-stílusú, többoldalas emléklapját PDF-ben.
        </p>

        <button
          type="button"
          className="certificate-export-button"
          onClick={() => void handleExport()}
          disabled={exporting}
        >
          {exporting
            ? "📜 A KRÓNIKÁS DOLGOZIK..."
            : "📜 KALANDLEVÉL EXPORTÁLÁSA"}
        </button>
      </div>
    </section>
  );
}
