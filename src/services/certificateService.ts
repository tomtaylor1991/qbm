import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

import type { Room } from "./roomService";
import type { Quest } from "../types/game";

export interface CertificatePlayer {
  id: string;
  name: string;
  xp: number;
  huntPoints: number;
  catches: number;
  joinedAt: string;
}

interface ExportCertificateOptions {
  room: Room;
  quests: Quest[];
  players: CertificatePlayer[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Ismeretlen időpont";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Ismeretlen időpont";
  }

  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getQuestTypeLabel(quest: Quest): string {
  switch (quest.type) {
    case "ENVELOPE":
      return "Borítékos próba";
    case "PUNISHMENT":
      return "Büntetés";
    default:
      return "Normál küldetés";
  }
}

function hashText(value: string): number {
  return Array.from(value).reduce(
    (hash, character) =>
      (hash * 31 + character.charCodeAt(0)) >>> 0,
    7
  );
}

function chooseTemplate(
  templates: string[],
  key: string
): string {
  return templates[hashText(key) % templates.length];
}

function buildQuestStory(quest: Quest): string {
  const normalStories = [
    "A társaság harsány biztatása közepette a bajnok újabb próbát állt ki.",
    "A fogadó népe előtt újabb hőstett került a kaland krónikájába.",
    "A kísérők tanácsa kihirdette a következő próbát, amelyet a bajnok becsülettel teljesített.",
    "Az este legendája újabb fejezettel gazdagodott, amikor a küldetés sikerrel zárult."
  ];

  const envelopeStories = [
    "A titokzatos boríték pecsétje feltört, és sorsa új feladattal lepte meg a bajnokot.",
    "A véletlen ősi tekercse új próbát választott, amely elől nem volt menekvés.",
    "A lezárt borítékból előlépett a következő küldetés, a társaság pedig tanúja lett a teljesítésének."
  ];

  const punishmentStories = [
    "A sors kereke kegyetlenül fordult, és az ősi büntetés lesújtott.",
    "A perverz számláló haragja felébredt, de a bajnok a szégyen próbáját is túlélte.",
    "A mulatság sötét varázsa büntetést idézett, amelyet a bajnok méltósággal — vagy legalább jókedvvel — viselt."
  ];

  const templates =
    quest.type === "PUNISHMENT"
      ? punishmentStories
      : quest.type === "ENVELOPE"
        ? envelopeStories
        : normalStories;

  return chooseTemplate(
    templates,
    quest.sourceKey ?? quest.id
  );
}

function getLevel(xp: number): number {
  return Math.floor(Math.max(0, xp) / 10) + 1;
}

function getSafeFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function createCertificateHtml({
  room,
  quests,
  players
}: ExportCertificateOptions): string {
  const completedQuests = quests
    .filter((quest) => quest.completed)
    .slice()
    .sort((first, second) => {
      const firstTime = first.completedAt
        ? new Date(first.completedAt).getTime()
        : 0;
      const secondTime = second.completedAt
        ? new Date(second.completedAt).getTime()
        : 0;
      return firstTime - secondTime;
    });

  const normalCount = completedQuests.filter(
    (quest) => quest.type === "NORMAL"
  ).length;
  const envelopeCount = completedQuests.filter(
    (quest) => quest.type === "ENVELOPE"
  ).length;
  const punishmentCount = completedQuests.filter(
    (quest) => quest.type === "PUNISHMENT"
  ).length;
  const doubleXpCount = completedQuests.filter(
    (quest) =>
      (quest.awardedPoints ?? quest.points) > quest.points
  ).length;

  const rankedPlayers = players
    .slice()
    .sort(
      (first, second) =>
        second.huntPoints - first.huntPoints ||
        second.catches - first.catches ||
        first.name.localeCompare(second.name, "hu-HU")
    );

  const huntWinner = rankedPlayers.find(
    (player) => player.huntPoints > 0
  );

  const questRows = completedQuests.length
    ? completedQuests
        .map((quest, index) => {
          const awardedXp = quest.awardedPoints ?? quest.points;
          const doubleXp = awardedXp > quest.points;

          return `
            <section class="quest-entry">
              <div class="quest-number">${String(index + 1).padStart(2, "0")}</div>
              <div class="quest-content">
                <div class="quest-meta">
                  <span>${escapeHtml(formatDateTime(quest.completedAt))}</span>
                  <span>${escapeHtml(getQuestTypeLabel(quest))}</span>
                </div>
                <h3>${escapeHtml(quest.title)}</h3>
                <p>${escapeHtml(buildQuestStory(quest))}</p>
                <p class="quest-original">${escapeHtml(quest.description)}</p>
                <div class="quest-reward">
                  <span>Hitelesítette: ${escapeHtml(quest.completedBy ?? "A kísérők tanácsa")}</span>
                  <strong>+${awardedXp} XP${doubleXp ? " · DOUBLE XP" : ""}</strong>
                </div>
              </div>
            </section>`;
        })
        .join("")
    : `<p class="empty-message">A krónikások egyetlen lezárt küldetést sem találtak.</p>`;

  const leaderboardRows = rankedPlayers.length
    ? rankedPlayers
        .map(
          (player, index) => `
            <tr>
              <td>${index + 1}.</td>
              <td>${escapeHtml(player.name)}</td>
              <td>${player.catches}</td>
              <td>${player.huntPoints} pont</td>
            </tr>`
        )
        .join("")
    : `<tr><td colspan="4">Nem érkezett játékosadat.</td></tr>`;

  const overtimeXp = Math.max(0, room.currentXp - room.targetXp);
  const createdDate = formatDateTime(room.createdAt || null);

  return `
    <div class="certificate-document">
      <section class="certificate-cover certificate-page-section">
        <div class="cover-runes">✦ ⚔ ✦ 🐉 ✦ ⚔ ✦</div>
        <div class="cover-frame">
          <div class="cover-kicker">QUEST BEFORE MARRIAGE</div>
          <h1>KALANDLEVÉL</h1>
          <h2>${escapeHtml(room.groomName)}, A HÁZASSÁG BAJNOKA</h2>
          <div class="cover-divider">◆ ◆ ◆</div>
          <p>
            Hiteles krónika a házasság előtti utolsó nagy kalandról,
            a próbákról, átkokról, hőstettekről és a hűséges kísérők legendájáról.
          </p>
          <div class="cover-seal">🏆</div>
          <dl class="cover-facts">
            <div><dt>Szobakód</dt><dd>${escapeHtml(room.roomCode)}</dd></div>
            <div><dt>Győzelmi cél</dt><dd>${room.targetXp} XP</dd></div>
            <div><dt>Végső eredmény</dt><dd>${room.currentXp} XP</dd></div>
            <div><dt>Elért szint</dt><dd>LVL ${getLevel(room.currentXp)}</dd></div>
          </dl>
          <p class="cover-date">A kaland kezdete: ${escapeHtml(createdDate)}</p>
        </div>
      </section>

      <section class="certificate-page-section story-section">
        <h2>📜 A KALAND KRÓNIKÁJA</h2>
        <p class="story-lead">
          Midőn az este leszállt, ${escapeHtml(room.groomName)} és hűséges kísérői
          útnak indultak, hogy szembenézzenek a házasság előtti utolsó próbákkal.
          Kard helyett jókedvvel, pajzs helyett jokerekkel, térkép helyett pedig
          egy hatjegyű szobakóddal vágtak neki az ismeretlennek.
        </p>

        <div class="stats-grid">
          <div><span>Teljesített küldetés</span><strong>${completedQuests.length}</strong></div>
          <div><span>Normál próba</span><strong>${normalCount}</strong></div>
          <div><span>Borítékos próba</span><strong>${envelopeCount}</strong></div>
          <div><span>Büntetés</span><strong>${punishmentCount}</strong></div>
          <div><span>Double XP esemény</span><strong>${doubleXpCount}</strong></div>
          <div><span>Túlóra XP</span><strong>${overtimeXp}</strong></div>
        </div>

        <div class="level-story">
          <h3>⚔ A LOVAG FEJLŐDÉSE</h3>
          <p>
            A kaland kezdetén ${escapeHtml(room.groomName)} még LVL 1 újoncként állt
            a fogadó kapujában. A próbák végére LVL ${getLevel(room.currentXp)}
            bajnokká vált, és ${room.currentXp} XP-t gyűjtött össze.
            ${overtimeXp > 0
              ? `A győzelmi célon túl további ${overtimeXp} túlóra XP-t is megszerzett.`
              : "A kijelölt győzelmi célt becsülettel elérte."}
          </p>
        </div>
      </section>

      <section class="certificate-page-section">
        <h2>🗡️ A TELJESÍTETT PRÓBÁK</h2>
        ${questRows}
      </section>

      <section class="certificate-page-section">
        <h2>🎯 A VŐLEGÉNYVADÁSZOK RANGLISTÁJA</h2>
        <table class="leaderboard-table">
          <thead>
            <tr><th>Hely</th><th>Kalandor</th><th>Elkapás</th><th>Pont</th></tr>
          </thead>
          <tbody>${leaderboardRows}</tbody>
        </table>

        <div class="winner-box">
          <h3>🏆 AZ ESTE LEGGYORSABB VADÁSZA</h3>
          <p>
            ${huntWinner
              ? `${escapeHtml(huntWinner.name)} ${huntWinner.catches} alkalommal csapott le a felbukkanó vőlegényre, és ${huntWinner.huntPoints} pontot zsákmányolt.`
              : "A vőlegény ezúttal minden vadász elől sikeresen elmenekült."}
          </p>
        </div>

        <div class="closing-story">
          <h2>🐉 A VÉGSŐ FEJEZET</h2>
          <p>
            A lovag elérte a kitűzött ${room.targetXp} XP-s kaput, ám a kaland nem ért véget.
            A házasság sárkánya ugyan megjelent a horizonton, de a társaság hőstettei,
            a teljesített küldetések és az este nevetése örökre fennmaradnak e kalandlevél lapjain.
          </p>
          <p class="final-proclamation">
            Ezennel tanúsítjuk, hogy ${escapeHtml(room.groomName)} méltón viselte
            a HÁZASSÁG BAJNOKA címet.
          </p>
        </div>

        <footer class="certificate-footer">
          <span>⚔ HITELESÍTETT KALANDLEVÉL ⚔</span>
          <span>CREATED BY TAMÁS SZABO</span>
        </footer>
      </section>
    </div>`;
}

function createCertificateStyles(): string {
  return `
    * {
      box-sizing: border-box;
      color: #000000 !important;
      text-shadow: none !important;
    }

    body {
      margin: 0;
    }

    .certificate-document {
      width: 794px;
      color: #000000;
      background: #efe3bf;
      font-family: Georgia, "Times New Roman", serif;
      line-height: 1.5;
    }

    .certificate-page-section {
      padding: 54px 58px;
      border-left: 12px solid #1a2338;
      border-right: 12px solid #1a2338;
      background:
        linear-gradient(
          rgba(255, 255, 255, 0.12),
          rgba(255, 255, 255, 0.12)
        ),
        repeating-linear-gradient(
          0deg,
          #efe3bf 0,
          #efe3bf 5px,
          #eadcaf 5px,
          #eadcaf 6px
        );
    }

    .certificate-page-section:first-child {
      border-top: 12px solid #1a2338;
    }

    .certificate-page-section:last-child {
      border-bottom: 12px solid #1a2338;
    }

    .certificate-cover {
      min-height: 1123px;
      display: grid;
      place-items: center;
      text-align: center;
    }

    .cover-frame {
      width: 100%;
      padding: 62px 48px;
      border: 7px double #7a5823;
      outline: 3px solid #1a2338;
      outline-offset: 10px;
    }

    .cover-runes {
      position: absolute;
      margin-top: -1010px;
      letter-spacing: 12px;
      font-size: 22px;
    }

    .cover-kicker {
      letter-spacing: 5px;
      font-weight: 700;
    }

    h1 {
      margin: 22px 0 10px;
      font-size: 58px;
      letter-spacing: 4px;
    }

    h2 {
      margin: 0 0 24px;
      letter-spacing: 1px;
    }

    .cover-divider {
      margin: 28px 0;
      letter-spacing: 15px;
    }

    .cover-seal {
      display: grid;
      place-items: center;
      width: 116px;
      height: 116px;
      margin: 38px auto;
      border: 7px double #7a5823;
      border-radius: 50%;
      font-size: 58px;
      background: #dbc37e;
    }

    .cover-facts {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin-top: 32px;
    }

    .cover-facts div,
    .stats-grid div {
      padding: 14px;
      border: 3px solid #7a5823;
      background: rgba(255, 255, 255, 0.42);
    }

    dt,
    .stats-grid span {
      display: block;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    dd,
    .stats-grid strong {
      display: block;
      margin: 5px 0 0;
      font-size: 24px;
      font-weight: 700;
    }

    .cover-date {
      margin-top: 35px;
      font-style: italic;
    }

    .story-lead {
      padding: 20px;
      border-left: 6px solid #9a722d;
      background: rgba(255, 255, 255, 0.5);
      font-size: 18px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin: 28px 0;
      text-align: center;
    }

    .level-story,
    .winner-box,
    .closing-story {
      margin-top: 26px;
      padding: 22px;
      border: 4px double #7a5823;
      background: rgba(255, 255, 255, 0.48);
    }

    .quest-entry {
      display: grid;
      grid-template-columns: 58px 1fr;
      gap: 18px;
      margin: 0 0 22px;
      padding-bottom: 22px;
      border-bottom: 2px dashed #9a722d;
      break-inside: avoid;
    }

    .quest-number {
      display: grid;
      place-items: center;
      width: 54px;
      height: 54px;
      background: #dbc37e;
      border: 4px solid #7a5823;
      font-weight: 700;
    }

    .quest-content h3 {
      margin: 6px 0 8px;
      font-size: 21px;
    }

    .quest-content p {
      margin: 6px 0;
    }

    .quest-meta,
    .quest-reward {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      font-size: 13px;
    }

    .quest-original {
      font-style: italic;
    }

    .quest-reward {
      margin-top: 12px;
      padding: 9px 12px;
      border: 2px solid #7a5823;
      background: rgba(219, 195, 126, 0.45);
    }

    .leaderboard-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }

    .leaderboard-table th,
    .leaderboard-table td {
      padding: 11px;
      border: 2px solid #7a5823;
      text-align: left;
    }

    .leaderboard-table th {
      background: #dbc37e;
    }

    .leaderboard-table tbody tr:nth-child(even) {
      background: rgba(255, 255, 255, 0.35);
    }

    .final-proclamation {
      margin-top: 24px;
      font-weight: 700;
      text-align: center;
      font-size: 20px;
    }

    .certificate-footer {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      margin-top: 48px;
      padding-top: 18px;
      border-top: 4px double #7a5823;
      font-size: 13px;
      font-weight: 700;
    }

    .empty-message {
      padding: 20px;
      border: 2px dashed #7a5823;
      text-align: center;
    }
  `;
}

async function renderCertificateCanvas(
  options: ExportCertificateOptions
): Promise<HTMLCanvasElement> {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = "794px";
  wrapper.style.zIndex = "-1";

  const style = document.createElement("style");
  style.textContent = createCertificateStyles();
  wrapper.appendChild(style);

  const content = document.createElement("div");
  content.innerHTML = createCertificateHtml(options);
  wrapper.appendChild(content);
  document.body.appendChild(wrapper);

  try {
    await document.fonts?.ready;

    return await html2canvas(
      content.firstElementChild as HTMLElement,
      {
        backgroundColor: "#efe3bf",
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 794
      }
    );
  } finally {
    wrapper.remove();
  }
}

function addCanvasToPdf(
  sourceCanvas: HTMLCanvasElement,
  pdf: jsPDF
): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const pagePixelHeight = Math.floor(
    sourceCanvas.width * (pageHeight / pageWidth)
  );

  let offsetY = 0;
  let pageIndex = 0;

  while (offsetY < sourceCanvas.height) {
    const sliceHeight = Math.min(
      pagePixelHeight,
      sourceCanvas.height - offsetY
    );

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = sourceCanvas.width;
    pageCanvas.height = pagePixelHeight;

    const context = pageCanvas.getContext("2d");

    if (!context) {
      throw new Error("Nem sikerült létrehozni a PDF oldalát.");
    }

    context.fillStyle = "#efe3bf";
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(
      sourceCanvas,
      0,
      offsetY,
      sourceCanvas.width,
      sliceHeight,
      0,
      0,
      sourceCanvas.width,
      sliceHeight
    );

    if (pageIndex > 0) {
      pdf.addPage();
    }

    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      0,
      0,
      pageWidth,
      pageHeight,
      undefined,
      "FAST"
    );

    pageIndex += 1;
    offsetY += sliceHeight;
  }
}

export async function exportAdventureCertificate(
  options: ExportCertificateOptions
): Promise<void> {
  if (options.room.currentXp < options.room.targetXp) {
    throw new Error(
      "A kalandlevél csak a győzelmi cél elérése után exportálható."
    );
  }

  const canvas = await renderCertificateCanvas(options);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true
  });

  addCanvasToPdf(canvas, pdf);

  const groomName =
    getSafeFileName(options.room.groomName) || "volegeny";

  pdf.save(`kalandlevel-${groomName}.pdf`);
}
